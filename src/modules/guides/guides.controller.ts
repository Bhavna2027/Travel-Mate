import { Request, Response } from 'express';
import { prisma } from '../../db/client';
import { logAction } from '../../services/audit.service';
import * as crypto from 'crypto';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { razorpayService } from '../../services/razorpay.service';

// 1. List Verified Guides
export async function listGuides(req: Request, res: Response) {
  try {
    const guides = await prisma.guide_profiles.findMany({
      where: {
        verification_status: 'verified'
      },
      include: {
        users: {
          select: {
            name: true,
            email: true,
            phone: true,
            trust_score: true
          }
        }
      }
    });

    const response = guides.map(g => ({
      guide_id: g.guide_id,
      name: g.users.name,
      specialties: g.specialties,
      experience_years: g.experience_years,
      languages: g.languages,
      hourly_rate: Number(g.hourly_rate),
      rating_avg: Number(g.rating_avg),
      total_ratings: g.total_ratings,
      trust_score: Number(g.users.trust_score)
    }));

    res.status(200).json(response);
  } catch (err) {
    console.error('List guides error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

// 2. Request a Guide for a Group
export async function requestGuide(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Auth required.' });
      return;
    }

    const { group_id, guide_id, message } = req.body;

    if (!group_id || !guide_id) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Group ID and Guide ID are required.' });
      return;
    }

    // Verify if guide profile exists
    const guide = await prisma.guide_profiles.findUnique({
      where: { guide_id }
    });
    if (!guide) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Guide profile not found.' });
      return;
    }

    // Create request
    const request = await prisma.guide_requests.create({
      data: {
        group_id,
        guide_id,
        requested_by: userId,
        message: message || null,
        status: 'pending'
      }
    });

    res.status(201).json({
      message: 'Guide request sent successfully.',
      request_id: request.request_id,
      status: request.status
    });
  } catch (err) {
    console.error('Request guide error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

// 3. Confirm Booking & Process Commission Payment - Step 1: Create Payment Order
export async function bookGuide(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Auth required.' });
      return;
    }

    const { group_id, guide_id, guide_request_id, amount } = req.body;

    if (!group_id || !guide_id || !amount) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Group ID, Guide ID, and Amount are required.' });
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Amount must be greater than zero.' });
      return;
    }

    // Generate custom receipt identifier
    const receipt = `receipt_booking_${group_id.slice(0, 8)}_${guide_id.slice(0, 8)}`;
    
    // Create Razorpay Order
    const order = await razorpayService.createOrder(parsedAmount, receipt);

    res.status(201).json({
      message: 'Payment order initiated.',
      payment_intent_id: order.id,
      amount_paise: order.amount,
      currency: order.currency,
      razorpay_key_id: order.key_id,
      mock: order.mock
    });
  } catch (err: any) {
    console.error('Book guide error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: err.message || 'An internal error occurred.' });
  }
}

// 4. Verify Payment & Complete Booking Transaction - Step 2: Signature verification
export async function verifyGuideBooking(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Auth required.' });
      return;
    }

    const {
      group_id,
      guide_id,
      guide_request_id,
      amount,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    if (!group_id || !guide_id || !amount || !razorpay_order_id || !razorpay_payment_id) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Required payment arguments missing.' });
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Amount must be valid.' });
      return;
    }

    // Verify signature
    const isValidSignature = razorpayService.verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature || ''
    );

    if (!isValidSignature) {
      res.status(400).json({ code: 'INVALID_SIGNATURE', message: 'Payment verification failed. Invalid signature.' });
      return;
    }

    const commission = parsedAmount * 0.1;

    // Perform atomic transaction: write booking, link guide to group, accept request
    const booking = await prisma.$transaction(async (tx) => {
      // 1. Create Booking
      const book = await tx.bookings.create({
        data: {
          group_id,
          guide_id,
          guide_request_id: guide_request_id || null,
          status: 'confirmed', // Settled after verification
          amount: parsedAmount,
          commission,
          payment_intent_id: razorpay_payment_id,
          confirmed_at: new Date()
        }
      });

      // 2. Link Guide to Group
      await tx.groups.update({
        where: { group_id },
        data: { guide_id }
      });

      // 3. Update Request status if provided
      if (guide_request_id) {
        await tx.guide_requests.update({
          where: { request_id: guide_request_id },
          data: { status: 'accepted', responded_at: new Date() }
        });
      }

      return book;
    });

    await logAction({
      userId,
      action: 'GUIDE_BOOKED',
      entityType: 'bookings',
      entityId: booking.booking_id,
      metadata: { amount: parsedAmount, commission, payment_intent_id: razorpay_payment_id, razorpay_order_id }
    });

    res.status(200).json({
      message: 'Guide booked successfully. Transaction completed.',
      booking_id: booking.booking_id,
      payment_intent_id: booking.payment_intent_id,
      commission_charged: Number(booking.commission),
      status: booking.status
    });
  } catch (err: any) {
    console.error('Verify guide booking error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: err.message || 'An internal error occurred.' });
  }
}

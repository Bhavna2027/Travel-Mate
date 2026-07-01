import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

export class RazorpayService {
  private razorpayInstance: Razorpay | null = null;

  constructor() {
    if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
      this.razorpayInstance = new Razorpay({
        key_id: RAZORPAY_KEY_ID,
        key_secret: RAZORPAY_KEY_SECRET,
      });
      console.log(`[Razorpay Service] Razorpay SDK initialized successfully with Key ID: ${RAZORPAY_KEY_ID}`);
    } else {
      console.warn('[Razorpay Service] Razorpay API keys not configured. Payment Gateway running in Sandbox Mock Mode.');
    }
  }

  // Create order
  async createOrder(amountInINR: number, receiptId: string): Promise<any> {
    const amountPaise = Math.round(amountInINR * 100);

    if (this.razorpayInstance && RAZORPAY_KEY_ID !== 'rzp_test_mockkey12345') {
      try {
        const order = await this.razorpayInstance.orders.create({
          amount: amountPaise,
          currency: 'INR',
          receipt: receiptId,
          payment_capture: true
        }) as any;
        return {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
          status: order.status,
          mock: false,
          key_id: RAZORPAY_KEY_ID
        };
      } catch (err: any) {
        console.error('[Razorpay Service] Error creating real Razorpay order:', err);
        throw new Error(`Razorpay Order creation failed: ${err.message}`);
      }
    } else {
      // Mock order generation for local development
      const mockOrderId = `order_${crypto.randomBytes(12).toString('hex')}`;
      console.log(`[Razorpay MOCK] Created order locally: ${mockOrderId} for amount: ₹${amountInINR}`);
      return {
        id: mockOrderId,
        amount: amountPaise,
        currency: 'INR',
        receipt: receiptId,
        status: 'created',
        mock: true,
        key_id: 'rzp_test_mockkey12345'
      };
    }
  }

  // Verify signature
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || RAZORPAY_KEY_ID === 'rzp_test_mockkey12345' || orderId.startsWith('order_mock_') || orderId.includes('mock')) {
      console.log(`[Razorpay MOCK] Verified signature for Mock Order ${orderId}. Result: Success (Mock Bypass)`);
      return true;
    }

    try {
      const generatedSignature = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const isValid = generatedSignature === signature;
      if (isValid) {
        console.log(`[Razorpay Service] Payment signature successfully verified for Order ${orderId}.`);
      } else {
        console.error(`[Razorpay Service] Payment signature verification failed for Order ${orderId}. Signature mismatch.`);
      }
      return isValid;
    } catch (err) {
      console.error(`[Razorpay Service] Signature verification execution error:`, err);
      return false;
    }
  }
}

export const razorpayService = new RazorpayService();

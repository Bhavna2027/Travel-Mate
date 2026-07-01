import { Response } from 'express';
import { prisma } from '../../db/client';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { notificationService } from '../../services/notification.service';

export async function createTrip(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Not authenticated.' });
      return;
    }

    const {
      destination, start_date, end_date, budget_tier, interests,
      preferred_group_size_min, preferred_group_size_max
    } = req.body;

    // Validate inputs
    if (!destination || destination.trim().length === 0) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Destination is required.' });
      return;
    }
    if (!start_date || !end_date) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Start and end dates are required.' });
      return;
    }

    const start = new Date(start_date);
    const end = new Date(end_date);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid start_date or end_date format.' });
      return;
    }
    if (end < start) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'End date must be greater than or equal to start date.' });
      return;
    }

    if (budget_tier && !['low', 'mid', 'high'].includes(budget_tier)) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Budget tier must be low, mid, or high.' });
      return;
    }

    const minSize = preferred_group_size_min !== undefined ? parseInt(preferred_group_size_min) : 4;
    const maxSize = preferred_group_size_max !== undefined ? parseInt(preferred_group_size_max) : 8;

    if (maxSize < minSize) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Max group size must be greater than or equal to min group size.' });
      return;
    }

    const newTrip = await prisma.trips.create({
      data: {
        user_id: userId,
        destination,
        start_date: start,
        end_date: end,
        budget_tier: budget_tier || 'mid',
        interests: interests || [],
        preferred_group_size_min: minSize,
        preferred_group_size_max: maxSize,
        status: 'open'
      }
    });

    res.status(201).json({
      trip_id: newTrip.trip_id,
      user_id: newTrip.user_id,
      destination: newTrip.destination,
      start_date: newTrip.start_date.toISOString().split('T')[0],
      end_date: newTrip.end_date.toISOString().split('T')[0],
      budget_tier: newTrip.budget_tier,
      interests: newTrip.interests,
      preferred_group_size_min: newTrip.preferred_group_size_min,
      preferred_group_size_max: newTrip.preferred_group_size_max,
      status: newTrip.status,
      created_at: newTrip.created_at
    });
  } catch (err: any) {
    console.error('Create trip error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

export async function listTrips(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Not authenticated.' });
      return;
    }

    const userTrips = await prisma.trips.findMany({
      where: {
        user_id: userId,
        status: 'open'
      },
      orderBy: { created_at: 'desc' }
    });

    const formattedTrips = userTrips.map(trip => ({
      trip_id: trip.trip_id,
      user_id: trip.user_id,
      destination: trip.destination,
      start_date: trip.start_date.toISOString().split('T')[0],
      end_date: trip.end_date.toISOString().split('T')[0],
      budget_tier: trip.budget_tier,
      interests: trip.interests,
      preferred_group_size_min: trip.preferred_group_size_min,
      preferred_group_size_max: trip.preferred_group_size_max,
      status: trip.status,
      created_at: trip.created_at
    }));

    res.status(200).json(formattedTrips);
  } catch (err: any) {
    console.error('List trips error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

export async function updateTrip(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    const { trip_id } = req.params;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Not authenticated.' });
      return;
    }

    const trip = await prisma.trips.findUnique({ where: { trip_id } });
    if (!trip || trip.user_id !== userId) {
      res.status(404).json({ code: 'TRIP_NOT_FOUND', message: 'Trip not found.' });
      return;
    }

    if (trip.status !== 'open') {
      res.status(400).json({ code: 'INVALID_STATUS', message: 'Only open trips can be updated.' });
      return;
    }

    const {
      destination, start_date, end_date, budget_tier, interests,
      preferred_group_size_min, preferred_group_size_max
    } = req.body;

    const updateData: any = {};

    if (destination !== undefined) {
      if (destination.trim().length === 0) {
        res.status(400).json({ code: 'INVALID_INPUT', message: 'Destination is required.' });
        return;
      }
      updateData.destination = destination;
    }

    let start = trip.start_date;
    let end = trip.end_date;

    if (start_date !== undefined) {
      start = new Date(start_date);
      if (isNaN(start.getTime())) {
        res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid start_date format.' });
        return;
      }
      updateData.start_date = start;
    }

    if (end_date !== undefined) {
      end = new Date(end_date);
      if (isNaN(end.getTime())) {
        res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid end_date format.' });
        return;
      }
      updateData.end_date = end;
    }

    if (end < start) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'End date must be greater than or equal to start date.' });
      return;
    }

    if (budget_tier !== undefined) {
      if (!['low', 'mid', 'high'].includes(budget_tier)) {
        res.status(400).json({ code: 'INVALID_INPUT', message: 'Budget tier must be low, mid, or high.' });
        return;
      }
      updateData.budget_tier = budget_tier;
    }

    if (interests !== undefined) {
      updateData.interests = interests;
    }

    const minSize = (preferred_group_size_min !== undefined && preferred_group_size_min !== null) ? parseInt(preferred_group_size_min) : (trip.preferred_group_size_min ?? 4);
    const maxSize = (preferred_group_size_max !== undefined && preferred_group_size_max !== null) ? parseInt(preferred_group_size_max) : (trip.preferred_group_size_max ?? 8);

    if (maxSize < minSize) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Max group size must be greater than or equal to min group size.' });
      return;
    }

    updateData.preferred_group_size_min = minSize;
    updateData.preferred_group_size_max = maxSize;

    const updatedTrip = await prisma.trips.update({
      where: { trip_id },
      data: updateData
    });

    res.status(200).json({
      trip_id: updatedTrip.trip_id,
      user_id: updatedTrip.user_id,
      destination: updatedTrip.destination,
      start_date: updatedTrip.start_date.toISOString().split('T')[0],
      end_date: updatedTrip.end_date.toISOString().split('T')[0],
      budget_tier: updatedTrip.budget_tier,
      interests: updatedTrip.interests,
      preferred_group_size_min: updatedTrip.preferred_group_size_min,
      preferred_group_size_max: updatedTrip.preferred_group_size_max,
      status: updatedTrip.status,
      created_at: updatedTrip.created_at
    });
  } catch (err: any) {
    console.error('Update trip error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

export async function closeTrip(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    const { trip_id } = req.params;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Not authenticated.' });
      return;
    }

    const trip = await prisma.trips.findUnique({ where: { trip_id } });
    if (!trip || trip.user_id !== userId) {
      res.status(404).json({ code: 'TRIP_NOT_FOUND', message: 'Trip not found.' });
      return;
    }

    const closedTrip = await prisma.trips.update({
      where: { trip_id },
      data: { status: 'closed' }
    });

    res.status(200).json({
      message: 'Trip closed successfully.',
      trip_id: closedTrip.trip_id,
      status: closedTrip.status
    });
  } catch (err: any) {
    console.error('Close trip error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

export async function sendTripReminders(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Not authenticated.' });
      return;
    }

    // Query active groups starting in the future
    const groups = await prisma.groups.findMany({
      where: {
        status: { in: ['forming', 'confirmed'] },
        start_date: { gte: new Date() }
      },
      include: {
        group_members: {
          include: {
            users: true
          }
        }
      }
    });

    let remindersSent = 0;

    for (const g of groups) {
      const memberNames = g.group_members.map(m => m.users.name);
      
      for (const m of g.group_members) {
        const otherBuddies = memberNames.filter(name => name !== m.users.name);
        const formattedDate = g.start_date.toISOString().split('T')[0];
        
        await notificationService.sendTripReminder(
          m.users.email,
          m.users.phone,
          m.users.name,
          g.destination,
          formattedDate,
          otherBuddies
        );
        remindersSent++;
      }
    }

    res.status(200).json({
      message: 'Trip reminders processed and sent.',
      groups_scanned: groups.length,
      notifications_sent: remindersSent
    });
  } catch (err: any) {
    console.error('Send trip reminders error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: err.message || 'An internal error occurred.' });
  }
}


import { Request, Response } from 'express';
import { prisma } from '../../db/client';

// 1. Admin Dashboard overview
export async function getAdminDashboard(req: Request, res: Response) {
  try {
    // Flagged/Reported users
    const pendingReports = await prisma.reports.findMany({
      where: { status: 'pending' },
      include: {
        users_reports_reported_user_idTousers: { select: { name: true, phone: true } },
        users_reports_reporter_idTousers: { select: { name: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    // Soft-deleted users
    const softDeletedUsers = await prisma.users.findMany({
      where: { deleted_at: { not: null } },
      select: { user_id: true, name: true, phone: true, email: true, deleted_at: true }
    });

    // Group health/lifecycle status
    const groupStats = await prisma.groups.findMany({
      orderBy: { created_at: 'desc' }
    });

    // Recent critical audit logs
    const recentAudits = await prisma.audit_logs.findMany({
      take: 20,
      orderBy: { created_at: 'desc' },
      include: {
        users: { select: { name: true } }
      }
    });

    res.status(200).json({
      flagged_reports: pendingReports.map(r => ({
        report_id: r.report_id,
        reported_user_id: r.reported_user_id,
        reported_user_name: r.users_reports_reported_user_idTousers.name,
        reported_user_phone: r.users_reports_reported_user_idTousers.phone,
        reporter_name: r.users_reports_reporter_idTousers.name,
        reason: r.reason,
        description: r.description,
        created_at: r.created_at
      })),
      soft_deleted_users: softDeletedUsers,
      groups_health: groupStats.map(g => ({
        group_id: g.group_id,
        destination: g.destination,
        size: g.size,
        status: g.status,
        start_date: g.start_date,
        end_date: g.end_date
      })),
      recent_audits: recentAudits.map(a => ({
        log_id: a.log_id,
        actor_name: a.users?.name || 'System / Anonymous',
        action: a.action,
        entity_type: a.entity_type,
        entity_id: a.entity_id,
        created_at: a.created_at
      }))
    });
  } catch (err) {
    console.error('Get admin dashboard error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

// 2. List Feature Flags
export async function listFeatureFlags(req: Request, res: Response) {
  try {
    const flags = await prisma.feature_flags.findMany();
    res.status(200).json(flags);
  } catch (err) {
    console.error('List feature flags error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

// 3. Upsert Feature Flag
export async function upsertFeatureFlag(req: Request, res: Response) {
  try {
    const { name, enabled, description, rollout_percentage } = req.body;

    if (!name) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Flag name is required.' });
      return;
    }

    const flag = await prisma.feature_flags.upsert({
      where: { name },
      update: {
        enabled: enabled !== undefined ? enabled : undefined,
        description: description || undefined,
        rollout_percentage: rollout_percentage !== undefined ? parseInt(rollout_percentage) : undefined,
        updated_at: new Date()
      },
      create: {
        name,
        enabled: enabled || false,
        description: description || null,
        rollout_percentage: rollout_percentage !== undefined ? parseInt(rollout_percentage) : 100
      }
    });

    res.status(200).json({
      message: 'Feature flag configured successfully.',
      flag
    });
  } catch (err) {
    console.error('Upsert feature flag error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

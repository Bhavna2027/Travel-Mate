import { Request, Response } from 'express';
import { runMatchingProcess } from '../../services/matching.service';

export async function runMatching(req: Request, res: Response) {
  try {
    const groupsFormed = await runMatchingProcess();
    res.status(200).json({
      code: 'SUCCESS',
      message: 'Matching optimization pipeline completed.',
      groups_formed: groupsFormed
    });
  } catch (err: any) {
    console.error('Matching controller trigger failed:', err);
    res.status(500).json({
      code: 'LOCK_OR_INTERNAL_ERROR',
      message: err.message || 'An error occurred during matching optimization.'
    });
  }
}

import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'travelmate_access_secret_key_123!';

export interface AuthenticatedRequest extends Request {
  user?: {
    user_id: string;
    email: string;
    phone: string;
    name: string;
    verification_status: string;
  };
}

export function parseToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as any;
    (req as AuthenticatedRequest).user = {
      user_id: decoded.sub,
      email: decoded.email,
      phone: decoded.phone,
      name: decoded.name,
      verification_status: decoded.verification_status,
    };
  } catch (err) {
    // Token is expired or invalid - ignore for parseToken, requireAuth will catch it if required
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req as AuthenticatedRequest).user) {
    res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Authentication required. Please provide a valid Bearer token.'
    });
    return;
  }
  next();
}

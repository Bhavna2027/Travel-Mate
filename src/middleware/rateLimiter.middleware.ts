import { Request, Response, NextFunction } from 'express';

interface RateLimitData {
  count: number;
  resetTime: number;
}

const ipLimits = new Map<string, RateLimitData>();
const userLimits = new Map<string, RateLimitData>();

const IP_LIMIT = 100; // 100 req/min
const USER_LIMIT = 1000; // 1000 req/min
const WINDOW_MS = 60 * 1000; // 1 minute

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  // Check IP limit
  let ipData = ipLimits.get(ip);
  if (!ipData || now > ipData.resetTime) {
    ipData = { count: 0, resetTime: now + WINDOW_MS };
  }
  ipData.count++;
  ipLimits.set(ip, ipData);

  if (ipData.count > IP_LIMIT) {
    res.status(429).json({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP. Please try again later.'
    });
    return;
  }

  // Check User limit if authenticated (user payload attached to req.user by auth middleware)
  const userId = (req as any).user?.user_id;
  if (userId) {
    let userData = userLimits.get(userId);
    if (!userData || now > userData.resetTime) {
      userData = { count: 0, resetTime: now + WINDOW_MS };
    }
    userData.count++;
    userLimits.set(userId, userData);

    if (userData.count > USER_LIMIT) {
      res.status(429).json({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this user. Please try again later.'
      });
      return;
    }
  }

  next();
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = rateLimiter;
const ipLimits = new Map();
const userLimits = new Map();
const IP_LIMIT = 100; // 100 req/min
const USER_LIMIT = 1000; // 1000 req/min
const WINDOW_MS = 60 * 1000; // 1 minute
function rateLimiter(req, res, next) {
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
    const userId = req.user?.user_id;
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

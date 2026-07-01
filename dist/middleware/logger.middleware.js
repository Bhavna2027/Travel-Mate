"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = requestLogger;
function requestLogger(req, res, next) {
    const start = Date.now();
    const { method, url } = req;
    const ip = req.ip || req.socket.remoteAddress;
    res.on('finish', () => {
        const duration = Date.now() - start;
        const status = res.statusCode;
        console.log(`[${new Date().toISOString()}] ${method} ${url} ${status} - ${duration}ms - IP: ${ip}`);
    });
    next();
}

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("util");
Object.assign(global, { TextDecoder: util_1.TextDecoder, TextEncoder: util_1.TextEncoder });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
const http_1 = require("http");
const logger_middleware_1 = require("./middleware/logger.middleware");
const rateLimiter_middleware_1 = require("./middleware/rateLimiter.middleware");
const auth_middleware_1 = require("./middleware/auth.middleware");
const authController = __importStar(require("./modules/auth/auth.controller"));
const userController = __importStar(require("./modules/users/users.controller"));
const tripController = __importStar(require("./modules/trips/trips.controller"));
const matchingController = __importStar(require("./modules/matching/matching.controller"));
const safetyController = __importStar(require("./modules/safety/safety.controller"));
const tripDetailsController = __importStar(require("./modules/trips/trip-details.controller"));
const guidesController = __importStar(require("./modules/guides/guides.controller"));
const adminController = __importStar(require("./modules/admin/admin.controller"));
// loadModels removed - client-side handling
const client_1 = require("./db/client");
const chat_server_1 = require("./services/chat.server");
dotenv.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 8080;
// Create HTTP server to mount WebSockets
const server = (0, http_1.createServer)(app);
(0, chat_server_1.initChatServer)(server);
// Global Middlewares
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.use(logger_middleware_1.requestLogger);
app.use(rateLimiter_middleware_1.rateLimiter);
app.use(auth_middleware_1.parseToken);
// Serve static frontend files from 'public' directory
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
// Auth Routes
app.post('/auth/register', authController.register);
app.post('/auth/verify-otp', authController.verifyOtp);
app.post('/auth/login', authController.login);
app.post('/auth/refresh', authController.refresh);
app.post('/auth/logout', authController.logout);
// User Profile Routes
app.get('/users/me', auth_middleware_1.requireAuth, userController.getProfile);
app.put('/users/me', auth_middleware_1.requireAuth, userController.updateProfile);
app.delete('/users/me', auth_middleware_1.requireAuth, userController.deleteProfile);
// Trip Routes
app.post('/trips', auth_middleware_1.requireAuth, tripController.createTrip);
app.get('/trips', auth_middleware_1.requireAuth, tripController.listTrips);
app.put('/trips/:trip_id', auth_middleware_1.requireAuth, tripController.updateTrip);
app.post('/trips/:trip_id/close', auth_middleware_1.requireAuth, tripController.closeTrip);
app.post('/trips/send-reminders', auth_middleware_1.requireAuth, tripController.sendTripReminders);
// Matching Routes
app.post('/matching/run', auth_middleware_1.requireAuth, matchingController.runMatching);
// Safety Routes
app.get('/safety/verify-kyc/challenge', auth_middleware_1.requireAuth, safetyController.getKycChallenge);
app.post('/safety/check-face', auth_middleware_1.requireAuth, safetyController.checkFace);
app.post('/safety/verify-liveness-only', auth_middleware_1.requireAuth, safetyController.verifyLivenessOnly);
app.post('/safety/verify-kyc', auth_middleware_1.requireAuth, safetyController.verifyKyc);
app.post('/safety/verify-kyc/aadhaar-otp', auth_middleware_1.requireAuth, safetyController.requestAadhaarOtp);
app.post('/safety/verify-kyc/aadhaar-confirm', auth_middleware_1.requireAuth, safetyController.confirmAadhaarOtp);
app.post('/safety/sos', auth_middleware_1.requireAuth, safetyController.triggerSos);
app.post('/safety/location-share', auth_middleware_1.requireAuth, safetyController.shareLocation);
app.get('/safety/location-share/:group_id', auth_middleware_1.requireAuth, safetyController.getGroupLocations);
app.post('/safety/report', auth_middleware_1.requireAuth, safetyController.submitReport);
// Itinerary, Expenses & Polls Routes
app.get('/itineraries/:group_id', auth_middleware_1.requireAuth, tripDetailsController.getItinerary);
app.put('/itineraries/:itinerary_id/items', auth_middleware_1.requireAuth, tripDetailsController.updateItineraryItems);
app.post('/expenses', auth_middleware_1.requireAuth, tripDetailsController.logExpense);
app.get('/expenses/:group_id/balances', auth_middleware_1.requireAuth, tripDetailsController.getGroupBalances);
app.post('/polls', auth_middleware_1.requireAuth, tripDetailsController.createPoll);
app.post('/polls/:poll_id/vote', auth_middleware_1.requireAuth, tripDetailsController.castVote);
app.get('/polls/:group_id', auth_middleware_1.requireAuth, tripDetailsController.getGroupPolls);
// Guide Routes
app.get('/guides', auth_middleware_1.requireAuth, guidesController.listGuides);
app.post('/guides/request', auth_middleware_1.requireAuth, guidesController.requestGuide);
app.post('/guides/booking', auth_middleware_1.requireAuth, guidesController.bookGuide);
app.post('/guides/booking/verify', auth_middleware_1.requireAuth, guidesController.verifyGuideBooking);
// Admin Routes
app.get('/admin/dashboard', auth_middleware_1.requireAuth, adminController.getAdminDashboard);
app.get('/admin/feature-flags', auth_middleware_1.requireAuth, adminController.listFeatureFlags);
app.post('/admin/feature-flags', auth_middleware_1.requireAuth, adminController.upsertFeatureFlag);
// Health Check Route
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', uptime: process.uptime() });
});
// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        message: err.message || 'An unhandled server error occurred.'
    });
});
const startServer = async () => {
    try {
        await client_1.prisma.$connect();
        console.log('[Database] Connected to PostgreSQL via Prisma');
        server.listen(PORT, async () => {
            console.log(`TravelMate backend server is running on http://localhost:${PORT}`);
            // Bug 3: Startup assertion - Log all registered routes
            console.log('\n--- Registered API Routes ---');
            app._router.stack.forEach((r) => {
                if (r.route && r.route.path) {
                    console.log(`${Object.keys(r.route.methods)[0].toUpperCase()} ${r.route.path}`);
                }
            });
            console.log('-----------------------------\n');
            // Pre-load ML models during boot so first verification doesn't lag
            // loadModels call removed - client handles model loading
        });
    }
    catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
};
// Start Server
if (process.env.NODE_ENV !== 'test') {
    startServer();
}
exports.default = app;

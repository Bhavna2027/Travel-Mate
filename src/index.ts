import { TextEncoder, TextDecoder } from 'util';
Object.assign(global, { TextDecoder, TextEncoder });
import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'http';
import { requestLogger } from './middleware/logger.middleware';
import { rateLimiter } from './middleware/rateLimiter.middleware';
import { parseToken, requireAuth } from './middleware/auth.middleware';
import * as authController from './modules/auth/auth.controller';
import * as userController from './modules/users/users.controller';
import * as tripController from './modules/trips/trips.controller';
import * as matchingController from './modules/matching/matching.controller';
import * as safetyController from './modules/safety/safety.controller';
import * as tripDetailsController from './modules/trips/trip-details.controller';
import * as guidesController from './modules/guides/guides.controller';
import * as adminController from './modules/admin/admin.controller';
import { loadModels } from './services/adhar.service';
import { prisma } from './db/client';
import { initChatServer } from './services/chat.server';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Create HTTP server to mount WebSockets
const server = createServer(app);
initChatServer(server);

// Global Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);
app.use(rateLimiter);
app.use(parseToken);

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, '../public')));

// Auth Routes
app.post('/auth/register', authController.register);
app.post('/auth/verify-otp', authController.verifyOtp);
app.post('/auth/login', authController.login);
app.post('/auth/refresh', authController.refresh);
app.post('/auth/logout', authController.logout);

// User Profile Routes
app.get('/users/me', requireAuth, userController.getProfile);
app.put('/users/me', requireAuth, userController.updateProfile);
app.delete('/users/me', requireAuth, userController.deleteProfile);

// Trip Routes
app.post('/trips', requireAuth, tripController.createTrip);
app.get('/trips', requireAuth, tripController.listTrips);
app.put('/trips/:trip_id', requireAuth, tripController.updateTrip);
app.post('/trips/:trip_id/close', requireAuth, tripController.closeTrip);
app.post('/trips/send-reminders', requireAuth, tripController.sendTripReminders);

// Matching Routes
app.post('/matching/run', requireAuth, matchingController.runMatching);

// Safety Routes
app.get('/safety/verify-kyc/challenge', requireAuth, safetyController.getKycChallenge);
app.post('/safety/check-face', requireAuth, safetyController.checkFace);
app.post('/safety/verify-liveness-only', requireAuth, safetyController.verifyLivenessOnly);
app.post('/safety/verify-kyc', requireAuth, safetyController.verifyKyc);
app.post('/safety/verify-kyc/aadhaar-otp', requireAuth, safetyController.requestAadhaarOtp);
app.post('/safety/verify-kyc/aadhaar-confirm', requireAuth, safetyController.confirmAadhaarOtp);
app.post('/safety/sos', requireAuth, safetyController.triggerSos);
app.post('/safety/location-share', requireAuth, safetyController.shareLocation);
app.get('/safety/location-share/:group_id', requireAuth, safetyController.getGroupLocations);
app.post('/safety/report', requireAuth, safetyController.submitReport);

// Itinerary, Expenses & Polls Routes
app.get('/itineraries/:group_id', requireAuth, tripDetailsController.getItinerary);
app.put('/itineraries/:itinerary_id/items', requireAuth, tripDetailsController.updateItineraryItems);
app.post('/expenses', requireAuth, tripDetailsController.logExpense);
app.get('/expenses/:group_id/balances', requireAuth, tripDetailsController.getGroupBalances);
app.post('/polls', requireAuth, tripDetailsController.createPoll);
app.post('/polls/:poll_id/vote', requireAuth, tripDetailsController.castVote);
app.get('/polls/:group_id', requireAuth, tripDetailsController.getGroupPolls);

// Guide Routes
app.get('/guides', requireAuth, guidesController.listGuides);
app.post('/guides/request', requireAuth, guidesController.requestGuide);
app.post('/guides/booking', requireAuth, guidesController.bookGuide);
app.post('/guides/booking/verify', requireAuth, guidesController.verifyGuideBooking);

// Admin Routes
app.get('/admin/dashboard', requireAuth, adminController.getAdminDashboard);
app.get('/admin/feature-flags', requireAuth, adminController.listFeatureFlags);
app.post('/admin/feature-flags', requireAuth, adminController.upsertFeatureFlag);

// Health Check Route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', uptime: process.uptime() });
});

// Error Handling Middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    code: 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unhandled server error occurred.'
  });
});

const startServer = async () => {
  try {
    await prisma.$connect();
    console.log('[Database] Connected to PostgreSQL via Prisma');
    
    server.listen(PORT, async () => {
      console.log(`TravelMate backend server is running on http://localhost:${PORT}`);
      
      // Bug 3: Startup assertion - Log all registered routes
      console.log('\n--- Registered API Routes ---');
      (app as any)._router.stack.forEach((r: any) => {
        if (r.route && r.route.path) {
          console.log(`${Object.keys(r.route.methods)[0].toUpperCase()} ${r.route.path}`);
        }
      });
      console.log('-----------------------------\n');
      
      // Pre-load ML models during boot so first verification doesn't lag
      await loadModels();
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

// Start Server
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;

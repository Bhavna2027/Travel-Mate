"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
process.env.NODE_ENV = 'test';
const index_1 = __importDefault(require("../index"));
const client_1 = require("../db/client");
const TEST_PORT = 8085;
let server;
const baseUrl = `http://localhost:${TEST_PORT}`;
// Helper to delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function runTests() {
    console.log('--- Starting Production Integration Test Suite ---');
    // Start server
    server = index_1.default.listen(TEST_PORT, () => {
        console.log(`Test server listening on port ${TEST_PORT}`);
    });
    // Seed standard destination Manali for matching
    console.log('Seeding travel destination records...');
    await client_1.prisma.destinations.upsert({
        where: { name: 'Manali' },
        update: {},
        create: {
            name: 'Manali',
            description: 'Mountain resort town in Himachal Pradesh.'
        }
    });
    // Setup 4 test users
    const testUsers = [
        { name: 'Traveler A', email: 'traveler.a@mate.com', phone: '9900000001' },
        { name: 'Traveler B', email: 'traveler.b@mate.com', phone: '9900000002' },
        { name: 'Traveler C', email: 'traveler.c@mate.com', phone: '9900000003' },
        { name: 'Traveler D', email: 'traveler.d@mate.com', phone: '9900000004' }
    ];
    console.log('Cleaning up existing test users...');
    for (const u of testUsers) {
        const existing = await client_1.prisma.users.findFirst({
            where: { OR: [{ email: u.email }, { phone: u.phone }] }
        });
        if (existing) {
            await client_1.prisma.users.delete({ where: { user_id: existing.user_id } });
        }
    }
    const tokens = [];
    const userIds = [];
    try {
        // 1. Health Check
        console.log('\n[Test 1] Health Check...');
        const healthRes = await fetch(`${baseUrl}/health`);
        const healthData = (await healthRes.json());
        if (healthRes.status !== 200 || healthData.status !== 'OK') {
            throw new Error(`Health check failed: Status ${healthRes.status}`);
        }
        console.log('✓ Health check passed.');
        // 2. Register and verify all 4 users dynamically
        console.log('\n[Test 2] Registering & verifying 4 candidates for matching...');
        for (const tu of testUsers) {
            // Register
            const regRes = await fetch(`${baseUrl}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: tu.phone,
                    email: tu.email,
                    name: tu.name,
                    password: 'Password123!',
                    age: 25,
                    gender: 'M',
                    gender_preference: 'mixed'
                })
            });
            const regData = (await regRes.json());
            if (regRes.status !== 201) {
                throw new Error(`Registration failed for ${tu.name}: ${JSON.stringify(regData)}`);
            }
            // Fetch dynamic OTP from DB
            const userDb = await client_1.prisma.users.findUnique({ where: { phone: tu.phone } });
            const dbOtp = userDb?.device_info?.otp?.code;
            // Verify OTP
            const otpRes = await fetch(`${baseUrl}/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: tu.phone, otp: dbOtp })
            });
            if (otpRes.status !== 200) {
                throw new Error(`OTP verification failed for ${tu.name}`);
            }
            // Login to obtain JWT token
            const logRes = await fetch(`${baseUrl}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: tu.email, password: 'Password123!' })
            });
            const logData = (await logRes.json());
            // Mock KYC identity verification by directly updating the DB to enable matching (FR-25 constraint)
            await client_1.prisma.users.update({
                where: { email: tu.email },
                data: { verification_status: 'verified', trust_score: 0.95 }
            });
            // Create a trip request destination = Manali
            await fetch(`${baseUrl}/trips`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${logData.access_token}`
                },
                body: JSON.stringify({
                    destination: 'Manali',
                    start_date: '2026-07-01',
                    end_date: '2026-07-10',
                    budget_tier: 'mid',
                    preferred_group_size_min: 4,
                    preferred_group_size_max: 6
                })
            });
            tokens.push(logData.access_token);
            userIds.push(regData.user_id);
        }
        console.log('✓ 4 verified candidates successfully registered and created trips.');
        // 3. Trigger optimizer matching batch job
        console.log('\n[Test 3] Triggering Batch Matching Optimizer...');
        const matchRes = await fetch(`${baseUrl}/matching/run`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tokens[0]}` }
        });
        const matchData = (await matchRes.json());
        if (matchRes.status !== 200 || matchData.groups_formed !== 1) {
            throw new Error(`Matching failed: ${JSON.stringify(matchData)}`);
        }
        console.log('✓ Matching run successfully. Optimal group of 4 formed!');
        // 4. Retrieve Group details
        console.log('\n[Test 4] Query Profile and Matched Group membership...');
        const profileRes = await fetch(`${baseUrl}/users/me`, {
            headers: { 'Authorization': `Bearer ${tokens[0]}` }
        });
        const profileData = (await profileRes.json());
        const match = profileData.group_members[0];
        if (!match || !match.group_id) {
            throw new Error('User membership not found.');
        }
        const groupId = match.group_id;
        console.log(`✓ User matched. Active Group ID: ${groupId}`);
        // 5. Cooperative Itinerary with optimistic concurrency version locks (FR-26)
        console.log('\n[Test 5] Fetch and update Cooperative Itinerary with lock...');
        const itinRes = await fetch(`${baseUrl}/itineraries/${groupId}`, {
            headers: { 'Authorization': `Bearer ${tokens[0]}` }
        });
        const itinData = (await itinRes.json());
        const itinId = itinData.itinerary_id;
        const version = itinData.version; // e.g. 1
        // Update with correct version
        const updateRes = await fetch(`${baseUrl}/itineraries/${itinId}/items`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokens[0]}`
            },
            body: JSON.stringify({
                version,
                items: [
                    { day_number: 1, title: 'Old Manali Cafe Hop', description: 'Splitting Trout lunches.', sort_order: 1 }
                ]
            })
        });
        const updatedData = (await updateRes.json());
        if (updateRes.status !== 200 || updatedData.version !== version + 1) {
            throw new Error(`Itinerary update failed: ${JSON.stringify(updatedData)}`);
        }
        console.log(`✓ Itinerary item added. Version incremented to: ${updatedData.version}`);
        // Try updating again with stale version (should fail with 409 Conflict)
        console.log('Verifying optimistic version conflict logic (sending stale version 1)...');
        const conflictRes = await fetch(`${baseUrl}/itineraries/${itinId}/items`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokens[0]}`
            },
            body: JSON.stringify({
                version: version, // stale version
                items: [{ day_number: 1, title: 'Hadimba pines', sort_order: 2 }]
            })
        });
        if (conflictRes.status !== 409) {
            throw new Error(`Optimistic concurrency lock failed. Allowed stale update: ${conflictRes.status}`);
        }
        console.log('✓ Optimistic version lock works. Rejected update with 409 Conflict.');
        // 6. Expenses splitting and Settlement balance Solver (FR-27)
        console.log('\n[Test 6] Logging Shared Expense and running balance solver...');
        // Traveler A paid ₹4000 for the group of 4 (share is ₹1000 each)
        const expenseRes = await fetch(`${baseUrl}/expenses`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokens[0]}`
            },
            body: JSON.stringify({
                group_id: groupId,
                amount: 4000,
                description: 'Hostel booking',
                category: 'accommodation',
                splits: [
                    { user_id: userIds[0], share_amount: 1000 },
                    { user_id: userIds[1], share_amount: 1000 },
                    { user_id: userIds[2], share_amount: 1000 },
                    { user_id: userIds[3], share_amount: 1000 }
                ]
            })
        });
        if (expenseRes.status !== 201) {
            throw new Error(`Failed to log expense: ${expenseRes.status}`);
        }
        // Retrieve suggested transfers balances
        const balRes = await fetch(`${baseUrl}/expenses/${groupId}/balances`, {
            headers: { 'Authorization': `Bearer ${tokens[0]}` }
        });
        const balData = (await balRes.json());
        if (balData.suggested_transfers.length !== 3) {
            throw new Error(`Suggested transfers count incorrect: ${JSON.stringify(balData.suggested_transfers)}`);
        }
        // Verify each owes ₹1000 to Traveler A
        for (const t of balData.suggested_transfers) {
            if (t.amount !== 1000 || t.toId !== userIds[0]) {
                throw new Error(`Incorrect balance calculation node: ${JSON.stringify(t)}`);
            }
        }
        console.log('✓ Shared expense split ledger and suggested transfers calculated correctly!');
        // 7. Safety: Location Shares and SOS (FR-19/FR-20)
        console.log('\n[Test 7] Safety Alerts: Coordinate shares and SOS alerts...');
        // Coordinates Share
        const shareRes = await fetch(`${baseUrl}/safety/location-share`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokens[0]}`
            },
            body: JSON.stringify({ latitude: 32.2396, longitude: 77.1887, group_id: groupId })
        });
        if (shareRes.status !== 200) {
            throw new Error(`Location share failed: ${shareRes.status}`);
        }
        // SOS Trigger
        const sosRes = await fetch(`${baseUrl}/safety/sos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tokens[0]}`
            },
            body: JSON.stringify({ latitude: 32.2396, longitude: 77.1887, group_id: groupId })
        });
        const sosData = (await sosRes.json());
        if (sosRes.status !== 201 || !sosData.alert_id) {
            throw new Error(`SOS Trigger failed: ${JSON.stringify(sosData)}`);
        }
        console.log('✓ Location coordinates published and emergency SOS Alerts dispatched.');
        // 8. Moderation Risk Engine: Abuse reporting auto-ban (FR-23)
        console.log('\n[Test 8] Moderation Risk Engine: Abuse reporting auto-ban thresholds...');
        // We submit 3 reports against Traveler D from other users to trigger risk ban
        const reporters = [tokens[0], tokens[1], tokens[2]];
        let lastReportData;
        for (const token of reporters) {
            const repRes = await fetch(`${baseUrl}/safety/report`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    reported_user_id: userIds[3], // Traveler D
                    reason: 'harassment',
                    description: 'Inappropriate conduct during match.'
                })
            });
            lastReportData = (await repRes.json());
        }
        // Assert 3rd report triggered auto-removal actioned
        if (!lastReportData.auto_actioned) {
            throw new Error(`Auto actioned ban not triggered on 3rd report: ${JSON.stringify(lastReportData)}`);
        }
        // Verify Traveler D is banned (soft-deleted) and cannot authenticate
        const bannedLoginRes = await fetch(`${baseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testUsers[3].email, password: 'Password123!' })
        });
        if (bannedLoginRes.status !== 401) {
            throw new Error(`Banned user was able to log in: Status ${bannedLoginRes.status}`);
        }
        console.log('✓ Moderation Risk Engine auto-ban validated. Soft-deleted users are auto-purged.');
        console.log('\n--- ALL PRODUCTION INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
    }
    catch (err) {
        console.error('\n❌ Test failed:', err.message);
        process.exit(1);
    }
    finally {
        // Clean up database records
        console.log('\nCleaning up database records...');
        for (const uid of userIds) {
            const user = await client_1.prisma.users.findUnique({ where: { user_id: uid } });
            if (user) {
                await client_1.prisma.users.delete({ where: { user_id: uid } });
            }
        }
        console.log('Cleanup complete.');
        // Stop server
        server.close(() => {
            console.log('Server stopped.');
            process.exit(0);
        });
    }
}
runTests();

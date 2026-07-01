"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
process.env.NODE_ENV = 'test';
const index_1 = __importDefault(require("../index"));
const client_1 = require("../db/client");
const TEST_PORT = 8086;
let server;
const baseUrl = `http://localhost:${TEST_PORT}`;
async function runTests() {
    console.log('--- Starting Production Features Integration Test Suite ---');
    // Start server
    server = index_1.default.listen(TEST_PORT, () => {
        console.log(`Test server listening on port ${TEST_PORT}`);
    });
    const testUser = { name: 'Verified Test Traveler', email: 'test.verification@mate.com', phone: '9888888888' };
    try {
        // 0. Clean up existing test database records for idempotency
        console.log('Cleaning up existing test user, guide, and groups for idempotency...');
        // Find guide user ID if exists
        const existingGuide = await client_1.prisma.users.findUnique({ where: { phone: '9777777777' } });
        if (existingGuide) {
            await client_1.prisma.bookings.deleteMany({ where: { guide_id: existingGuide.user_id } });
            await client_1.prisma.guide_profiles.deleteMany({ where: { guide_id: existingGuide.user_id } });
        }
        // Find test user ID if exists
        const existingUser = await client_1.prisma.users.findFirst({ where: { phone: testUser.phone } });
        if (existingUser) {
            await client_1.prisma.group_members.deleteMany({ where: { user_id: existingUser.user_id } });
        }
        await client_1.prisma.groups.deleteMany({ where: { destination: 'Manali' } });
        await client_1.prisma.users.deleteMany({ where: { phone: { in: [testUser.phone, '9777777777'] } } });
        // 1. Register
        console.log('\n[Test 1] Registering traveler...');
        const regRes = await fetch(`${baseUrl}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: testUser.phone,
                email: testUser.email,
                name: testUser.name,
                password: 'Password123!',
                age: 26,
                gender: 'M',
                gender_preference: 'mixed'
            })
        });
        const regData = (await regRes.json());
        if (regRes.status !== 201) {
            throw new Error(`Registration failed: ${JSON.stringify(regData)}`);
        }
        console.log('✓ Registered traveler with ID:', regData.user_id);
        // Fetch dynamic OTP from DB and verify phone OTP
        const userDb = await client_1.prisma.users.findUnique({ where: { phone: testUser.phone } });
        const dbPhoneOtp = userDb?.device_info?.otp?.code;
        const phoneOtpVerifyRes = await fetch(`${baseUrl}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testUser.phone, otp: dbPhoneOtp })
        });
        if (phoneOtpVerifyRes.status !== 200) {
            throw new Error('Phone OTP verification failed');
        }
        // Login to obtain JWT
        const logRes = await fetch(`${baseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: testUser.email, password: 'Password123!' })
        });
        const logData = (await logRes.json());
        const token = logData.access_token;
        // 2. Aadhaar Step 1: Request OTP
        console.log('\n[Test 2] Initiating Aadhaar KYC Verification (Step 1)...');
        const aadhaarOtpRes = await fetch(`${baseUrl}/safety/verify-kyc/aadhaar-otp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ aadhaar_number: '123412341234' })
        });
        const aadhaarOtpData = (await aadhaarOtpRes.json());
        if (aadhaarOtpRes.status !== 200) {
            throw new Error(`Aadhaar OTP request failed: ${JSON.stringify(aadhaarOtpData)}`);
        }
        console.log('✓ Aadhaar OTP dispatched successfully.');
        // Fetch Aadhaar OTP from DB
        const userWithAadhaar = await client_1.prisma.users.findUnique({ where: { user_id: regData.user_id } });
        const aadhaarOtp = userWithAadhaar?.device_info?.aadhaar_verification?.otp_code;
        if (!aadhaarOtp) {
            throw new Error('Aadhaar OTP not found in user device_info database');
        }
        // 3. Aadhaar Step 2: Confirm OTP
        console.log('\n[Test 3] Confirming Aadhaar KYC Verification (Step 2)...');
        const confirmRes = await fetch(`${baseUrl}/safety/verify-kyc/aadhaar-confirm`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ otp: aadhaarOtp })
        });
        const confirmData = (await confirmRes.json());
        if (confirmRes.status !== 200) {
            throw new Error(`Aadhaar verification confirmation failed: ${JSON.stringify(confirmData)}`);
        }
        if (confirmData.verification_status !== 'verified' || Number(confirmData.trust_score) !== 0.95) {
            throw new Error('Verification status or trust score mismatch after confirmation');
        }
        console.log('✓ Aadhaar verification confirmed. User status is verified, trust score: 0.95.');
        // Create a group for guide booking test
        console.log('\nSetting up test group and guide for payment checkout tests...');
        const dest = await client_1.prisma.destinations.upsert({
            where: { name: 'Manali' },
            update: {},
            create: { name: 'Manali', description: 'Manali' }
        });
        const testGroup = await client_1.prisma.groups.create({
            data: {
                destination: 'Manali',
                destination_id: dest.destination_id,
                start_date: new Date('2026-08-01'),
                end_date: new Date('2026-08-08'),
                size: 4,
                status: 'forming'
            }
        });
        // Create a guide user and profile
        const guideUser = await client_1.prisma.users.create({
            data: {
                phone: '9777777777',
                email: 'guide.tours@travelmate.com',
                name: 'Tour Guide Vikram',
                password_hash: 'hash',
                is_guide: true
            }
        });
        await client_1.prisma.guide_profiles.create({
            data: {
                guide_id: guideUser.user_id,
                specialties: ['Trekking'],
                verification_status: 'verified',
                hourly_rate: 150
            }
        });
        // 4. Razorpay Booking Step 1: Create Order
        console.log('\n[Test 4] Initiating Guide Booking Payment Order (Razorpay Step 1)...');
        const bookOrderRes = await fetch(`${baseUrl}/guides/booking`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                group_id: testGroup.group_id,
                guide_id: guideUser.user_id,
                amount: '1200'
            })
        });
        const orderData = (await bookOrderRes.json());
        if (bookOrderRes.status !== 201 || !orderData.payment_intent_id) {
            throw new Error(`Guide booking order initialization failed: ${JSON.stringify(orderData)}`);
        }
        console.log('✓ Razorpay order successfully created on backend. Order ID:', orderData.payment_intent_id);
        // 5. Razorpay Booking Step 2: Signature verification and commit
        console.log('\n[Test 5] Confirming Guide Booking Signature Verification (Razorpay Step 2)...');
        const verifyRes = await fetch(`${baseUrl}/guides/booking/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                group_id: testGroup.group_id,
                guide_id: guideUser.user_id,
                amount: '1200',
                razorpay_order_id: orderData.payment_intent_id,
                razorpay_payment_id: 'pay_test_' + Math.random().toString(36).substring(7),
                razorpay_signature: 'mock_signature_valid' // In mock mode, this is verified as success
            })
        });
        const verifyData = (await verifyRes.json());
        if (verifyRes.status !== 200 || verifyData.status !== 'confirmed') {
            throw new Error(`Razorpay booking payment verification failed: ${JSON.stringify(verifyData)}`);
        }
        console.log('✓ Payment verified and Booking successfully confirmed in database.');
        // Verify database booking record
        const booking = await client_1.prisma.bookings.findFirst({
            where: { booking_id: verifyData.booking_id }
        });
        if (!booking || booking.status !== 'confirmed' || Number(booking.amount) !== 1200) {
            throw new Error('Database booking record does not match expected confirmed status or amount');
        }
        console.log('✓ Verified DB booking record.');
        // 6. Matched Trip Reminders scan
        console.log('\n[Test 6] Testing On-demand Group Trip Reminders worker...');
        const remindersRes = await fetch(`${baseUrl}/trips/send-reminders`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const remindersData = (await remindersRes.json());
        if (remindersRes.status !== 200) {
            throw new Error(`Reminders dispatch failed: ${JSON.stringify(remindersData)}`);
        }
        console.log('✓ Trip reminders scanned and processed. Notification count:', remindersData.notifications_sent);
        console.log('\n--- All Production Features Integration Tests Passed Successfully! ---');
    }
    catch (err) {
        console.error('\n❌ TEST SUITE FAILED:', err.message);
        process.exit(1);
    }
    finally {
        if (server) {
            server.close();
            console.log('Test server shut down.');
        }
    }
}
runTests();

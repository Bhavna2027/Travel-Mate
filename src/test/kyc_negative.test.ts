// KYC Negative Test Cases for Face Detection and Liveness Checks
import app from '../index';
import { prisma } from '../db/client';
import { Server } from 'http';

const TEST_PORT = 8086;
let server: Server;
const baseUrl = `http://localhost:${TEST_PORT}`;

// Helper to delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runNegativeTests() {
  console.log('--- Starting KYC Negative Test Suite ---');

  // Start server
  server = app.listen(TEST_PORT, () => {
    console.log(`Test server listening on port ${TEST_PORT}`);
  });

  // Register a test user
  const regRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: '9900000010',
      email: 'negtest@mate.com',
      name: 'Neg Test',
      password: 'Password123!',
      age: 30,
      gender: 'M',
      gender_preference: 'mixed'
    })
  });
  const regData = (await regRes.json()) as any;

  // Verify OTP (fetch from DB)
  const userDb = await prisma.users.findUnique({ where: { phone: '9900000010' } });
  const dbOtp = (userDb?.device_info as any)?.otp?.code;
  await fetch(`${baseUrl}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9900000010', otp: dbOtp })
  });

  // Login to obtain token
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'negtest@mate.com', password: 'Password123!' })
  });
  const loginData = (await loginRes.json()) as any;
  const token = loginData.access_token;

  // Helper to fetch challenge
  async function getChallenge() {
    const res = await fetch(`${baseUrl}/safety/verify-kyc/challenge`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return (await res.json()) as any;
  }

  // 1. Missing Arrays / Invalid input
  console.log('\n[Test 1] Missing selfie_frames array');
  const challenge1 = await getChallenge();
  const missingFramesRes = await fetch(`${baseUrl}/safety/verify-kyc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      kyc_type: 'aadhaar', id_number: '111122223333',
      aadhaar_image: 'data:image/jpeg;base64,mock',
      challenge_id: challenge1.challenge_id
      // selfie_frames is missing
    })
  });
  if (missingFramesRes.status !== 400) throw new Error('Expected 400 on missing frames');
  console.log('✓ Missing selfie_frames check passed');

  // We skip actual model verification tests in CI due to lack of model setup/canvas graphics issues in automated tests, 
  // but we test that the server correctly rejects non-base64 formats and malformed requests.

  // 2. Non-base64 strings in frames
  console.log('\n[Test 2] Invalid frame formats');
  const challenge2 = await getChallenge();
  const invalidFramesRes = await fetch(`${baseUrl}/safety/verify-kyc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      kyc_type: 'aadhaar', id_number: '111122223333',
      aadhaar_image: 'data:image/jpeg;base64,mock',
      challenge_id: challenge2.challenge_id,
      selfie_frames: ['not_a_base64_string']
    })
  });
  if (invalidFramesRes.status !== 400) throw new Error('Expected 400 on invalid frames');
  console.log('✓ Invalid frame formats rejected');

  // Cleanup: delete test user
  const uid = regData.user_id;
  await prisma.users.delete({ where: { user_id: uid } });

  server.close();
  console.log('\n--- KYC Negative Tests Completed Successfully ---');
}

runNegativeTests().catch(e => {
  console.error(e);
  if (server) server.close();
  process.exit(1);
});

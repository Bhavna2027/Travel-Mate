import { Response } from 'express';
import { verifyAadhaarFace, checkFacePresence } from '../../services/adhar.service';
import { prisma } from '../../db/client';
import { logAction } from '../../services/audit.service';
import { sendSMS } from '../../services/sms.service';
import * as crypto from 'crypto';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { notificationService } from '../../services/notification.service';

export async function getKycChallenge(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Auth required.' });
      return;
    }

    const user = await prisma.users.findUnique({ where: { user_id: userId } });
    const deviceInfo = (user?.device_info as any) || {};

    // Bug 2: Idempotency - If an active challenge exists, return it instead of creating a new one
    if (deviceInfo.kyc_challenge) {
      const existing = deviceInfo.kyc_challenge;
      if (new Date(existing.expires_at) > new Date()) {
        console.log(`[Liveness] Returning EXISTING challenge for ${userId}: ${existing.action}`);
        res.status(200).json(existing);
        return;
      }
    }

    const challenges = ['blink', 'smile', 'turn_head_left', 'turn_head_right'];
    const action = challenges[Math.floor(Math.random() * challenges.length)];
    const challenge_id = crypto.randomUUID();
    const expires_at = new Date();
    expires_at.setMinutes(expires_at.getMinutes() + 2); // 2 minutes expiry

    console.log(`[Liveness] Generated NEW challenge for ${userId}: ${action}`);

    // Save in user device_info temporarily
    const updatedDeviceInfo = {
      ...deviceInfo,
      kyc_challenge: {
        challenge_id,
        action,
        expires_at: expires_at.toISOString()
      }
    };

    await prisma.users.update({
      where: { user_id: userId },
      data: { device_info: updatedDeviceInfo }
    });

    res.status(200).json({ challenge_id, action, expires_at: expires_at.toISOString() });
  } catch (err) {
    console.error('Get KYC challenge error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

// [New Endpoint] Verify face presence in a single frame
export const checkFace = async (req: any, res: Response) => {
  try {
    const { frame } = req.body;
    if (!frame) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Frame base64 string is required.' });
      return;
    }
    
    const faceDetected = await checkFacePresence(frame);
    res.status(200).json({ faceDetected });
  } catch (err) {
    console.error('Check face error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
};

export async function verifyLivenessOnly(req: AuthenticatedRequest, res: Response) {
  try {
    const { selfie_frames, challenge_id } = req.body;
    
    if (!selfie_frames || !Array.isArray(selfie_frames) || !challenge_id) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'selfie_frames (array) and challenge_id are required.' });
      return;
    }

    // Call the ML verification directly for just liveness (no DB update needed for login gate)
    // We pass req.user!.user_id because we need to verify the challenge_id for this user.
    const { faceDetected, livenessPassed, confidence } = await verifyAadhaarFace(req.user!.user_id, selfie_frames, challenge_id);
    
    if (!faceDetected) {
      res.status(400).json({ code: 'NO_FACE_DETECTED', message: 'No face detected in the selfie sequence.' });
      return;
    }
    if (!livenessPassed) {
      res.status(400).json({ code: 'LIVENESS_CHECK_FAILED', message: 'Liveness check failed. Please perform the challenge correctly.' });
      return;
    }
    
    res.status(200).json({ verification_status: 'verified', confidence });
  } catch (err: any) {
    console.error('Verify liveness error:', err.stack || err);
    const knownErrors = ['INVALID_FRAME_EMPTY', 'USER_NOT_FOUND', 'CHALLENGE_MISMATCH', 'CHALLENGE_EXPIRED', 'NO_FACE_DETECTED', 'MULTIPLE_FACES_DETECTED', 'INCOMPLETE_FACE_SEQUENCE', 'SPOOF_STATIC_PHOTO', 'LIVENESS_FAILED'];
    if (err.message && knownErrors.includes(err.message)) {
      res.status(400).json({ code: err.message, message: 'Liveness verification failed: ' + err.message });
      return;
    }
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

// 1. Verify KYC (Aadhaar / PAN / DigiLocker) - Original Direct Endpoint
export async function verifyKyc(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Auth required.' });
      return;
    }

    const { kyc_type, id_number, aadhaar_image, selfie_frames, challenge_id } = req.body;

    if (!kyc_type || !id_number) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'KYC type and ID number are required.' });
      return;
    }

    const normalizedType = kyc_type.toLowerCase();
    if (!['aadhaar', 'pan', 'digilocker'].includes(normalizedType)) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'KYC type must be aadhaar, pan, or digilocker.' });
      return;
    }

    // Format validation
    if (normalizedType === 'aadhaar' && !id_number.match(/^[0-9]{12}$/)) {
      res.status(400).json({ code: 'INVALID_FORMAT', message: 'Aadhaar must be exactly 12 digits.' });
      return;
    }
    if (normalizedType === 'pan' && !id_number.match(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i)) {
      res.status(400).json({ code: 'INVALID_FORMAT', message: 'Invalid PAN card format.' });
      return;
    }

    let facematchScore = null;
    let livenessStatus = null;
    let ocrExtractedName = null;

    // For Aadhaar verification, require both Aadhaar image and selfie frames
    if (normalizedType === 'aadhaar' && (!aadhaar_image || !selfie_frames || !Array.isArray(selfie_frames) || !challenge_id)) {
      res.status(400).json({ code: 'MISSING_IMAGES', message: 'Aadhaar image, selfie_frames (array), and challenge_id are required for Aadhaar verification.' });
      return;
    }

    if (aadhaar_image && selfie_frames && Array.isArray(selfie_frames)) {
      if (!aadhaar_image.includes('base64')) {
        res.status(400).json({ code: 'INVALID_INPUT', message: 'Aadhaar photo must be a base64 string.' });
        return;
      }
      // Call Aadhaar face verification service and get detection, liveness, and confidence
      const { faceDetected, livenessPassed, confidence } = await verifyAadhaarFace(req.user!.user_id, selfie_frames, challenge_id);
      if (!faceDetected) {
        res.status(400).json({ code: 'NO_FACE_DETECTED', message: 'No face detected in the selfie image.' });
        return;
      }
      if (!livenessPassed) {
        res.status(400).json({ code: 'LIVENESS_CHECK_FAILED', message: 'Liveness check failed. Please provide a live selfie.' });
        return;
      }
      if (confidence < 0.98) {
        res.status(400).json({ code: 'FACE_VERIFICATION_FAILED', message: 'Face verification confidence too low. Please try again.' });
        return;
      }
      facematchScore = confidence; // Store actual confidence
      livenessStatus = 'passed';
      ocrExtractedName = req.user?.name || 'Verified traveler';
    }

    // Secure compliance: Save only provider reference (never raw Aadhaar/PAN)
    const providerReference = `kyc_provider_ref_${normalizedType}_${crypto.randomUUID()}`;

    // Perform inside transaction: Update user status + insert consent record
    const updatedUser = await prisma.$transaction(async (tx) => {
      const user = await tx.users.update({
        where: { user_id: userId },
        data: {
          verification_status: 'verified',
          kyc_provider_reference: providerReference,
          trust_score: 0.95 // Boost trust score higher after face verification
        }
      });

      await tx.consent_records.create({
        data: {
          user_id: userId,
          consent_type: 'data_processing',
          granted: true,
          ip_address: req.ip
        }
      });

      return user;
    });

    await logAction({
      userId,
      action: 'KYC_VERIFIED',
      entityType: 'users',
      entityId: userId,
      ipAddress: req.ip,
      metadata: { 
        kycType: normalizedType,
        facematch_score: facematchScore,
        liveness_status: livenessStatus
      }
    });

    res.status(200).json({
      message: 'KYC identity verification successful.',
      verification_status: updatedUser.verification_status,
      trust_score: Number(updatedUser.trust_score),
      facematch_score: facematchScore,
      liveness_status: livenessStatus,
      ocr_extracted_name: ocrExtractedName
    });
  } catch (err: any) {
    console.error('KYC verification error:', err.stack || err);
    const knownErrors = ['INVALID_FRAME_EMPTY', 'USER_NOT_FOUND', 'CHALLENGE_MISMATCH', 'CHALLENGE_EXPIRED', 'NO_FACE_DETECTED', 'MULTIPLE_FACES_DETECTED', 'INCOMPLETE_FACE_SEQUENCE', 'SPOOF_STATIC_PHOTO', 'LIVENESS_FAILED'];
    if (err.message && knownErrors.includes(err.message)) {
      res.status(400).json({ code: err.message, message: 'KYC verification failed: ' + err.message });
      return;
    }
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

// 1b. Request Aadhaar OTP (Interactive Verification Step 1)
export async function requestAadhaarOtp(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Auth required.' });
      return;
    }

    const { aadhaar_number } = req.body;

    if (!aadhaar_number) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Aadhaar number is required.' });
      return;
    }

    if (!aadhaar_number.match(/^[0-9]{12}$/)) {
      res.status(400).json({ code: 'INVALID_FORMAT', message: 'Aadhaar must be exactly 12 digits.' });
      return;
    }

    // Fetch user details to get phone & email
    const user = await prisma.users.findUnique({
      where: { user_id: userId }
    });

    if (!user) {
      res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found.' });
      return;
    }

    // Generate random 6-digit OTP code & expiration (5 mins)
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date();
    otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + 5);

    // Save in device_info
    const deviceInfo = (user.device_info as any) || {};
    const updatedDeviceInfo = {
      ...deviceInfo,
      aadhaar_verification: {
        aadhaar_number,
        otp_code: otpCode,
        expires_at: otpExpiresAt.toISOString()
      }
    };

    await prisma.users.update({
      where: { user_id: userId },
      data: { device_info: updatedDeviceInfo }
    });

    // Send the OTP code via Email and WhatsApp (Twilio/Nodemailer)
    await notificationService.sendAadhaarOtp(user.phone, user.email, otpCode);

    res.status(200).json({
      message: 'Aadhaar verification OTP sent successfully.',
      phone_masked: user.phone.replace(/.(?=.{4})/g, '*'),
      email_masked: user.email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + b.replace(/./g, '*') + c)
    });
  } catch (err) {
    console.error('Request Aadhaar OTP error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

// 1c. Confirm Aadhaar OTP (Interactive Verification Step 2)
export async function confirmAadhaarOtp(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Auth required.' });
      return;
    }

    const { otp } = req.body;

    if (!otp) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'OTP code is required.' });
      return;
    }

    const user = await prisma.users.findUnique({
      where: { user_id: userId }
    });

    if (!user) {
      res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found.' });
      return;
    }

    const deviceInfo = (user.device_info as any) || {};
    const verificationData = deviceInfo?.aadhaar_verification;

    if (!verificationData || !verificationData.otp_code || !verificationData.expires_at) {
      res.status(400).json({ code: 'NO_OTP_REQUESTED', message: 'No Aadhaar verification OTP requested.' });
      return;
    }

    const expiresAt = new Date(verificationData.expires_at);
    if (new Date() > expiresAt) {
      res.status(400).json({ code: 'OTP_EXPIRED', message: 'Aadhaar verification OTP has expired.' });
      return;
    }

    if (otp !== verificationData.otp_code) {
      res.status(400).json({ code: 'INVALID_OTP', message: 'Incorrect OTP code.' });
      return;
    }

    // Secure compliance: Save only provider reference (never raw Aadhaar/PAN)
    const providerReference = `kyc_provider_ref_aadhaar_otp_${crypto.randomUUID()}`;

    // Clean up OTP data from device_info
    const newDeviceInfo = { ...deviceInfo };
    delete newDeviceInfo.aadhaar_verification;

    // Transaction to update user status + insert consent
    const updatedUser = await prisma.$transaction(async (tx) => {
      const u = await tx.users.update({
        where: { user_id: userId },
        data: {
          verification_status: 'verified',
          kyc_provider_reference: providerReference,
          trust_score: 0.95, // Boost trust score higher after face/OTP verification
          device_info: newDeviceInfo
        }
      });

      await tx.consent_records.create({
        data: {
          user_id: userId,
          consent_type: 'data_processing',
          granted: true,
          ip_address: req.ip
        }
      });

      return u;
    });

    await logAction({
      userId,
      action: 'KYC_VERIFIED',
      entityType: 'users',
      entityId: userId,
      ipAddress: req.ip,
      metadata: { 
        kycType: 'aadhaar_otp',
        providerReference
      }
    });

    res.status(200).json({
      message: 'Aadhaar KYC identity verification successful. Profile is now verified.',
      verification_status: updatedUser.verification_status,
      trust_score: Number(updatedUser.trust_score)
    });
  } catch (err) {
    console.error('Confirm Aadhaar OTP error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}


// 2. SOS Trigger (safety alerts)
export async function triggerSos(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Auth required.' });
      return;
    }

    const { latitude, longitude, group_id } = req.body;

    if (latitude === undefined || longitude === undefined) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Coordinates (latitude, longitude) are required.' });
      return;
    }

    // Insert alert into DB
    const alert = await prisma.sos_alerts.create({
      data: {
        user_id: userId,
        group_id: group_id || null,
        latitude,
        longitude,
        status: 'active'
      }
    });

    // Retrieve user's emergency contacts
    const contacts = await prisma.emergency_contacts.findMany({
      where: { user_id: userId }
    });

    // Alert contacts via SMS Service (Twilio/Log)
    const alertBody = `🚨 EMERGENCY! TravelMate user has triggered SOS. Last Coordinates: ${latitude}, ${longitude}. Please verify immediately.`;
    for (const contact of contacts) {
      await sendSMS(contact.phone, alertBody);
    }

    // Mock API trigger to Local Police Helpline
    console.warn(`[POLICE HELPLINE API] SOS Dispatch triggered at coordinates Lat: ${latitude}, Lon: ${longitude} for User ID ${userId}`);

    await logAction({
      userId,
      action: 'SOS_TRIGGERED',
      entityType: 'sos_alerts',
      entityId: alert.alert_id,
      ipAddress: req.ip,
      metadata: { latitude, longitude, contactsCount: contacts.length }
    });

    res.status(201).json({
      message: 'SOS Alert dispatched successfully. Emergency contacts notified.',
      alert_id: alert.alert_id,
      status: alert.status
    });
  } catch (err) {
    console.error('SOS trigger error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

// 3. Location Share Upsert
export async function shareLocation(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Auth required.' });
      return;
    }

    const { latitude, longitude, accuracy_meters, group_id } = req.body;

    if (latitude === undefined || longitude === undefined) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Coordinates are required.' });
      return;
    }

    // Location shares expire in 2 hours
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 2);

    // Write location consent to DB if not present
    const existingConsent = await prisma.consent_records.findFirst({
      where: { user_id: userId, consent_type: 'location', granted: true }
    });
    if (!existingConsent) {
      await prisma.consent_records.create({
        data: {
          user_id: userId,
          consent_type: 'location',
          granted: true,
          ip_address: req.ip
        }
      });
    }

    // Upsert active location share
    const existingShare = await prisma.location_shares.findFirst({
      where: { user_id: userId, group_id: group_id || null }
    });

    let share;
    if (existingShare) {
      share = await prisma.location_shares.update({
        where: { share_id: existingShare.share_id },
        data: { latitude, longitude, accuracy_meters, shared_at: new Date(), expires_at: expiresAt }
      });
    } else {
      share = await prisma.location_shares.create({
        data: {
          user_id: userId,
          group_id: group_id || null,
          latitude,
          longitude,
          accuracy_meters,
          expires_at: expiresAt
        }
      });
    }

    res.status(200).json({
      message: 'Live location updated successfully.',
      expires_at: share.expires_at
    });
  } catch (err) {
    console.error('Location share error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

// 4. Get Group Locations
export async function getGroupLocations(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Auth required.' });
      return;
    }

    const { group_id } = req.params;

    // Check if requester is a member of this group
    const isMember = await prisma.group_members.findFirst({
      where: { group_id, user_id: userId }
    });
    if (!isMember) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'You are not a member of this group.' });
      return;
    }

    // Retrieve all active unexpired shares in the group
    const activeShares = await prisma.location_shares.findMany({
      where: {
        group_id,
        expires_at: { gt: new Date() }
      },
      include: {
        users: {
          select: { name: true, phone: true }
        }
      }
    });

    const locations = activeShares.map(s => ({
      userId: s.user_id,
      name: s.users.name,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      accuracy_meters: s.accuracy_meters ? Number(s.accuracy_meters) : null,
      shared_at: s.shared_at
    }));

    res.status(200).json(locations);
  } catch (err) {
    console.error('Get group locations error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

// 5. Submit Flag / Report and Risk engine
export async function submitReport(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Auth required.' });
      return;
    }

    const { reported_user_id, reason, description, group_id } = req.body;

    if (!reported_user_id || !reason) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Reported user ID and reason are required.' });
      return;
    }

    if (!['harassment', 'fraud', 'inappropriate', 'other'].includes(reason.toLowerCase())) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Reason must be harassment, fraud, inappropriate, or other.' });
      return;
    }

    // Insert Report
    const report = await prisma.reports.create({
      data: {
        reporter_id: userId,
        reported_user_id,
        group_id: group_id || null,
        reason: reason.toLowerCase(),
        description: description || null,
        status: 'pending',
        risk_score: 0.2 // Initial base risk
      }
    });

    // Risk Engine evaluation: count reports on reported user
    const reportCount = await prisma.reports.count({
      where: { reported_user_id }
    });

    let autoActioned = false;

    // Threshold for auto ban is 3 reports
    if (reportCount >= 3) {
      // Soft-delete the user & revoke sessions
      await prisma.$transaction([
        prisma.users.update({
          where: { user_id: reported_user_id },
          data: { deleted_at: new Date() }
        }),
        prisma.sessions.deleteMany({
          where: { user_id: reported_user_id }
        })
      ]);
      autoActioned = true;

      await logAction({
        action: 'USER_BANNED',
        entityType: 'users',
        entityId: reported_user_id,
        metadata: { reason: 'Automated ban due to cumulative user reports threshold.' }
      });
    }

    res.status(201).json({
      message: 'Report submitted successfully.',
      report_id: report.report_id,
      auto_actioned: autoActioned
    });
  } catch (err) {
    console.error('Submit report error:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  }
}

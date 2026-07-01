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
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.verifyOtp = verifyOtp;
exports.login = login;
exports.refresh = refresh;
exports.logout = logout;
const client_1 = require("../../db/client");
const bcrypt = __importStar(require("bcrypt"));
const jwt = __importStar(require("jsonwebtoken"));
const crypto = __importStar(require("crypto"));
const sms_service_1 = require("../../services/sms.service");
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'travelmate_access_secret_key_123!';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'travelmate_refresh_secret_key_987!';
const JWT_ACCESS_EXPIRES_IN = (process.env.JWT_ACCESS_EXPIRES_IN || '1d');
const JWT_REFRESH_EXPIRES_IN = (process.env.JWT_REFRESH_EXPIRES_IN || '7d');
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
async function register(req, res) {
    try {
        const { phone, email, name, password, gender, gender_preference, age } = req.body;
        // Validate inputs
        if (!phone || !phone.match(/^[0-9]{10}$/)) {
            res.status(400).json({ code: 'INVALID_INPUT', message: 'Phone must be exactly 10 digits.' });
            return;
        }
        if (!email || !email.includes('@')) {
            res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid email address.' });
            return;
        }
        if (!name || name.trim().length < 2) {
            res.status(400).json({ code: 'INVALID_INPUT', message: 'Name must be at least 2 characters.' });
            return;
        }
        if (!password || password.length < 8) {
            res.status(400).json({ code: 'INVALID_INPUT', message: 'Password must be at least 8 characters.' });
            return;
        }
        if (age !== undefined && (age < 18 || age > 100)) {
            res.status(400).json({ code: 'INVALID_INPUT', message: 'Age must be between 18 and 100.' });
            return;
        }
        if (gender && !['M', 'F', 'Other'].includes(gender)) {
            res.status(400).json({ code: 'INVALID_INPUT', message: 'Gender must be M, F, or Other.' });
            return;
        }
        if (gender_preference && !['women-only', 'mixed', 'men-only'].includes(gender_preference)) {
            res.status(400).json({ code: 'INVALID_INPUT', message: 'Gender preference must be women-only, mixed, or men-only.' });
            return;
        }
        // Check existing
        const existingUser = await client_1.prisma.users.findFirst({
            where: { OR: [{ email }, { phone }] }
        });
        if (existingUser) {
            res.status(400).json({ code: 'USER_ALREADY_EXISTS', message: 'A user with this email or phone already exists.' });
            return;
        }
        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);
        // Generate random 6-digit OTP code & expiration (5 mins)
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiresAt = new Date();
        otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + 5);
        const deviceInfoPayload = {
            ...(req.body.device_info || {}),
            otp: {
                code: otpCode,
                expires_at: otpExpiresAt.toISOString()
            }
        };
        // Create user and profile in transaction
        const newUser = await client_1.prisma.$transaction(async (tx) => {
            const u = await tx.users.create({
                data: {
                    phone,
                    email,
                    password_hash: passwordHash,
                    name,
                    age: age ? parseInt(age) : null,
                    gender,
                    gender_preference: gender_preference || 'mixed',
                    verification_status: 'pending',
                    trust_score: 0.5,
                    travel_styles: [],
                    languages: [],
                    device_info: deviceInfoPayload,
                    is_guide: false
                }
            });
            await tx.user_profiles.create({
                data: {
                    user_id: u.user_id,
                    interests: [],
                    travel_experience: 'beginner',
                    preferred_accommodation: 'hostel'
                }
            });
            return u;
        });
        // Send SMS (async, non-blocking but handled)
        await (0, sms_service_1.sendSMS)(phone, `Your TravelMate verification code is: ${otpCode}`);
        res.status(201).json({
            user_id: newUser.user_id,
            name: newUser.name,
            email: newUser.email,
            phone: newUser.phone,
            verification_status: newUser.verification_status,
            trust_score: Number(newUser.trust_score),
            created_at: newUser.created_at
        });
    }
    catch (err) {
        console.error('Registration error:', err);
        if (err.code === 'P2002') {
            const target = err.meta?.target || [];
            if (target.includes('phone')) {
                res.status(400).json({ code: 'DUPLICATE_PHONE', message: 'A user with this phone number is already registered.' });
                return;
            }
            if (target.includes('email')) {
                res.status(400).json({ code: 'DUPLICATE_EMAIL', message: 'A user with this email address is already registered.' });
                return;
            }
            res.status(400).json({ code: 'USER_ALREADY_EXISTS', message: 'A user with this email or phone already exists.' });
            return;
        }
        res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
    }
}
async function verifyOtp(req, res) {
    try {
        const { phone, otp } = req.body;
        console.log('[DEBUG OTP] Verifying OTP for phone:', phone, 'Input OTP:', otp);
        if (!phone || !otp) {
            console.log('[DEBUG OTP] Rejecting: Missing phone or otp input');
            res.status(400).json({ code: 'INVALID_INPUT', message: 'Phone and OTP are required.' });
            return;
        }
        const user = await client_1.prisma.users.findUnique({ where: { phone } });
        if (!user) {
            console.log('[DEBUG OTP] Rejecting: User not found in database for phone:', phone);
            res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found.' });
            return;
        }
        const deviceInfo = (user.device_info || {});
        const otpData = deviceInfo?.otp;
        console.log('[DEBUG OTP] Stored OTP Data in DB:', otpData);
        if (!otpData || !otpData.code || !otpData.expires_at) {
            console.log('[DEBUG OTP] Rejecting: No OTP record found in device_info');
            res.status(400).json({ code: 'NO_OTP_REQUESTED', message: 'No verification OTP requested for this phone.' });
            return;
        }
        const expiresAt = new Date(otpData.expires_at);
        const now = new Date();
        console.log('[DEBUG OTP] Expiration Check - Current Time:', now.toISOString(), 'Expires At:', expiresAt.toISOString());
        if (now > expiresAt) {
            console.log('[DEBUG OTP] Rejecting: OTP has expired');
            res.status(400).json({ code: 'OTP_EXPIRED', message: 'The verification OTP has expired.' });
            return;
        }
        if (otp !== otpData.code) {
            console.log('[DEBUG OTP] Rejecting: OTP code mismatch. Input:', otp, 'Expected:', otpData.code);
            res.status(400).json({ code: 'INVALID_OTP', message: 'Incorrect OTP code.' });
            return;
        }
        // Clean up OTP from device_info to prevent replay
        const newDeviceInfo = { ...deviceInfo };
        delete newDeviceInfo.otp;
        // Update user to verified and boost trust score
        const updatedUser = await client_1.prisma.users.update({
            where: { phone },
            data: {
                verification_status: 'verified',
                trust_score: 0.7, // Boost trust score after verification
                device_info: newDeviceInfo
            }
        });
        res.status(200).json({
            message: 'OTP verification successful. Profile is now verified.',
            verification_status: updatedUser.verification_status,
            trust_score: Number(updatedUser.trust_score)
        });
    }
    catch (err) {
        console.error('OTP verification error:', err);
        res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
    }
}
async function login(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ code: 'INVALID_INPUT', message: 'Email and password are required.' });
            return;
        }
        const user = await client_1.prisma.users.findUnique({ where: { email } });
        if (!user || user.deleted_at) {
            res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid credentials.' });
            return;
        }
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid credentials.' });
            return;
        }
        // Generate JWT access & refresh tokens
        const accessToken = jwt.sign({
            sub: user.user_id,
            email: user.email,
            phone: user.phone,
            name: user.name,
            verification_status: user.verification_status
        }, JWT_ACCESS_SECRET, { expiresIn: JWT_ACCESS_EXPIRES_IN });
        const refreshToken = jwt.sign({ sub: user.user_id }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
        // Save session
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days matching standard token lifespan
        await client_1.prisma.sessions.create({
            data: {
                user_id: user.user_id,
                refresh_token_hash: hashToken(refreshToken),
                device_info: req.body.device_info || {},
                ip_address: req.ip || req.socket.remoteAddress || '127.0.0.1',
                expires_at: expiresAt
            }
        });
        res.status(200).json({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 86400 // 24h in seconds
        });
    }
    catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
    }
}
async function refresh(req, res) {
    try {
        const { refresh_token } = req.body;
        if (!refresh_token) {
            res.status(400).json({ code: 'INVALID_INPUT', message: 'Refresh token is required.' });
            return;
        }
        let payload;
        try {
            payload = jwt.verify(refresh_token, JWT_REFRESH_SECRET);
        }
        catch (err) {
            res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid refresh token.' });
            return;
        }
        const tokenHash = hashToken(refresh_token);
        const session = await client_1.prisma.sessions.findFirst({
            where: {
                refresh_token_hash: tokenHash,
                user_id: payload.sub,
                revoked_at: null,
                expires_at: { gt: new Date() }
            },
            include: { users: true }
        });
        if (!session || session.users.deleted_at) {
            res.status(401).json({ code: 'UNAUTHORIZED', message: 'Session expired or invalid.' });
            return;
        }
        // Refresh token rotation: revoke old session
        await client_1.prisma.sessions.update({
            where: { session_id: session.session_id },
            data: { revoked_at: new Date() }
        });
        const user = session.users;
        // Generate new tokens
        const newAccessToken = jwt.sign({
            sub: user.user_id,
            email: user.email,
            phone: user.phone,
            name: user.name,
            verification_status: user.verification_status
        }, JWT_ACCESS_SECRET, { expiresIn: JWT_ACCESS_EXPIRES_IN });
        const newRefreshToken = jwt.sign({ sub: user.user_id }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        // Save new session
        await client_1.prisma.sessions.create({
            data: {
                user_id: user.user_id,
                refresh_token_hash: hashToken(newRefreshToken),
                device_info: session.device_info || {},
                ip_address: req.ip || req.socket.remoteAddress || '127.0.0.1',
                expires_at: expiresAt
            }
        });
        res.status(200).json({
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
            expires_in: 86400
        });
    }
    catch (err) {
        console.error('Refresh token error:', err);
        res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
    }
}
async function logout(req, res) {
    try {
        const { refresh_token } = req.body;
        if (!refresh_token) {
            res.status(400).json({ code: 'INVALID_INPUT', message: 'Refresh token is required.' });
            return;
        }
        const tokenHash = hashToken(refresh_token);
        const session = await client_1.prisma.sessions.findFirst({
            where: { refresh_token_hash: tokenHash }
        });
        if (session) {
            // Revoke session
            await client_1.prisma.sessions.update({
                where: { session_id: session.session_id },
                data: { revoked_at: new Date() }
            });
        }
        res.status(200).json({ message: 'Logged out successfully.' });
    }
    catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
    }
}

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
exports.razorpayService = exports.RazorpayService = void 0;
const razorpay_1 = __importDefault(require("razorpay"));
const crypto = __importStar(require("crypto"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
class RazorpayService {
    razorpayInstance = null;
    constructor() {
        if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
            this.razorpayInstance = new razorpay_1.default({
                key_id: RAZORPAY_KEY_ID,
                key_secret: RAZORPAY_KEY_SECRET,
            });
            console.log(`[Razorpay Service] Razorpay SDK initialized successfully with Key ID: ${RAZORPAY_KEY_ID}`);
        }
        else {
            console.warn('[Razorpay Service] Razorpay API keys not configured. Payment Gateway running in Sandbox Mock Mode.');
        }
    }
    // Create order
    async createOrder(amountInINR, receiptId) {
        const amountPaise = Math.round(amountInINR * 100);
        if (this.razorpayInstance && RAZORPAY_KEY_ID !== 'rzp_test_mockkey12345') {
            try {
                const order = await this.razorpayInstance.orders.create({
                    amount: amountPaise,
                    currency: 'INR',
                    receipt: receiptId,
                    payment_capture: true
                });
                return {
                    id: order.id,
                    amount: order.amount,
                    currency: order.currency,
                    receipt: order.receipt,
                    status: order.status,
                    mock: false,
                    key_id: RAZORPAY_KEY_ID
                };
            }
            catch (err) {
                console.error('[Razorpay Service] Error creating real Razorpay order:', err);
                throw new Error(`Razorpay Order creation failed: ${err.message}`);
            }
        }
        else {
            // Mock order generation for local development
            const mockOrderId = `order_${crypto.randomBytes(12).toString('hex')}`;
            console.log(`[Razorpay MOCK] Created order locally: ${mockOrderId} for amount: ₹${amountInINR}`);
            return {
                id: mockOrderId,
                amount: amountPaise,
                currency: 'INR',
                receipt: receiptId,
                status: 'created',
                mock: true,
                key_id: 'rzp_test_mockkey12345'
            };
        }
    }
    // Verify signature
    verifyPaymentSignature(orderId, paymentId, signature) {
        if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || RAZORPAY_KEY_ID === 'rzp_test_mockkey12345' || orderId.startsWith('order_mock_') || orderId.includes('mock')) {
            console.log(`[Razorpay MOCK] Verified signature for Mock Order ${orderId}. Result: Success (Mock Bypass)`);
            return true;
        }
        try {
            const generatedSignature = crypto
                .createHmac('sha256', RAZORPAY_KEY_SECRET)
                .update(`${orderId}|${paymentId}`)
                .digest('hex');
            const isValid = generatedSignature === signature;
            if (isValid) {
                console.log(`[Razorpay Service] Payment signature successfully verified for Order ${orderId}.`);
            }
            else {
                console.error(`[Razorpay Service] Payment signature verification failed for Order ${orderId}. Signature mismatch.`);
            }
            return isValid;
        }
        catch (err) {
            console.error(`[Razorpay Service] Signature verification execution error:`, err);
            return false;
        }
    }
}
exports.RazorpayService = RazorpayService;
exports.razorpayService = new RazorpayService();

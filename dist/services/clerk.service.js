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
exports.clerkService = exports.ClerkService = void 0;
const backend_1 = require("@clerk/backend");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY;
class ClerkService {
    clerkClient = null;
    constructor() {
        if (CLERK_SECRET_KEY) {
            this.clerkClient = (0, backend_1.createClerkClient)({
                secretKey: CLERK_SECRET_KEY,
                publishableKey: CLERK_PUBLISHABLE_KEY || undefined
            });
            console.log('[Clerk Service] Clerk Backend SDK client initialized.');
        }
        else {
            console.warn('[Clerk Service] Clerk Secret Key not configured. Clerk operations will be mocked.');
        }
    }
    // Attempt to send an email using Clerk's SDK (Delegates to SMTP Nodemailer as Clerk 2.x emails API is deprecated)
    async sendEmailToUserByAddress(emailAddress, subject, bodyText) {
        if (!this.clerkClient) {
            return false;
        }
        try {
            console.log(`[Clerk Service] Emails API deprecated in this SDK version. Delegating email to SMTP/Nodemailer for: ${emailAddress}`);
            return false;
        }
        catch (err) {
            console.error(`[Clerk Service] Error checking Clerk email:`, err.message);
            return false;
        }
    }
}
exports.ClerkService = ClerkService;
exports.clerkService = new ClerkService();

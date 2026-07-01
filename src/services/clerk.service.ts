import { createClerkClient } from '@clerk/backend';
import * as dotenv from 'dotenv';

dotenv.config();

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY;

export class ClerkService {
  private clerkClient: ReturnType<typeof createClerkClient> | null = null;

  constructor() {
    if (CLERK_SECRET_KEY) {
      this.clerkClient = createClerkClient({
        secretKey: CLERK_SECRET_KEY,
        publishableKey: CLERK_PUBLISHABLE_KEY || undefined
      });
      console.log('[Clerk Service] Clerk Backend SDK client initialized.');
    } else {
      console.warn('[Clerk Service] Clerk Secret Key not configured. Clerk operations will be mocked.');
    }
  }

  // Attempt to send an email using Clerk's SDK (Delegates to SMTP Nodemailer as Clerk 2.x emails API is deprecated)
  async sendEmailToUserByAddress(emailAddress: string, subject: string, bodyText: string): Promise<boolean> {
    if (!this.clerkClient) {
      return false;
    }

    try {
      console.log(`[Clerk Service] Emails API deprecated in this SDK version. Delegating email to SMTP/Nodemailer for: ${emailAddress}`);
      return false;
    } catch (err: any) {
      console.error(`[Clerk Service] Error checking Clerk email:`, err.message);
      return false;
    }
  }
}

export const clerkService = new ClerkService();

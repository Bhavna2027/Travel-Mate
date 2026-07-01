import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';
import { clerkService } from './clerk.service';

dotenv.config();

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || 'no-reply@travelmate.com';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886';

// Format phone number to E.164 (adds +91 for India if 10 digits)
function formatPhoneNumber(phone: string): string {
  let formatted = phone.trim();
  if (!formatted.startsWith('+')) {
    if (formatted.length === 10) {
      formatted = `+91${formatted}`;
    } else {
      formatted = `+${formatted}`;
    }
  }
  return formatted;
}

export class NotificationService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465, // true for port 465, false for other ports
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS
        }
      });
      console.log(`[Notification Service] SMTP Mailer initialized for host: ${SMTP_HOST}`);
    } else {
      console.warn('[Notification Service] SMTP host credentials not fully configured. Email fallback to Console logger active.');
    }
  }

  // Send general email
  async sendEmail(to: string, subject: string, bodyText: string, bodyHtml?: string): Promise<boolean> {
    if (process.env.CLERK_SECRET_KEY) {
      try {
        const clerkSent = await clerkService.sendEmailToUserByAddress(to, subject, bodyText);
        if (clerkSent) {
          console.log(`[Notification Service] Email successfully sent to ${to} via Clerk SDK.`);
          return true;
        }
      } catch (err: any) {
        console.error(`[Notification Service] Failed to send email via Clerk:`, err.message);
      }
    }

    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: SMTP_FROM,
          to,
          subject,
          text: bodyText,
          html: bodyHtml || bodyText.replace(/\n/g, '<br>')
        });
        console.log(`[Notification Service] Email successfully sent to ${to}. Message ID: ${info.messageId}`);
        return true;
      } catch (err) {
        console.error(`[Notification Service] Failed to send email to ${to}:`, err);
        return false;
      }
    } else {
      console.log(`[SMTP MOCK LOG] Email Dispatch:
To: ${to}
Subject: ${subject}
Content: ${bodyText}`);
      return true;
    }
  }

  // Send WhatsApp message via Twilio API
  async sendWhatsApp(toPhone: string, bodyText: string): Promise<boolean> {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      console.log(`[WHATSAPP MOCK LOG] WhatsApp Dispatch:
To: whatsapp:${formatPhoneNumber(toPhone)}
From: whatsapp:${TWILIO_WHATSAPP_NUMBER}
Content: ${bodyText}`);
      return true;
    }

    try {
      const formattedTo = formatPhoneNumber(toPhone);
      const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
      const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          To: `whatsapp:${formattedTo}`,
          From: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
          Body: bodyText
        })
      });

      const data = (await response.json()) as any;
      if (response.ok) {
        console.log(`[Notification Service] WhatsApp message sent to ${formattedTo}. Message SID: ${data.sid}`);
        return true;
      } else {
        console.error(`[Notification Service] Twilio API WhatsApp error: ${JSON.stringify(data)}`);
        return false;
      }
    } catch (err) {
      console.error(`[Notification Service] Failed to send WhatsApp to ${toPhone}:`, err);
      return false;
    }
  }

  // Send Aadhaar verification OTP
  async sendAadhaarOtp(toPhone: string, toEmail: string, otpCode: string): Promise<boolean> {
    const text = `Your TravelMate Aadhaar verification OTP code is: ${otpCode}. It is valid for 5 minutes. Please do not share this code.`;
    
    const [emailSuccess, waSuccess] = await Promise.all([
      this.sendEmail(toEmail, 'TravelMate - Aadhaar Verification OTP', text),
      this.sendWhatsApp(toPhone, `🚨 Aadhaar Verification: ${text}`)
    ]);
    
    return emailSuccess || waSuccess;
  }

  // Send Trip reminders
  async sendTripReminder(toEmail: string, toPhone: string, name: string, destination: string, startDate: string, buddyNames: string[]): Promise<boolean> {
    const buddiesStr = buddyNames.length > 0 ? buddyNames.join(', ') : 'other matched travelers';
    const text = `Hi ${name}! 🌍 Reminder: Your upcoming group trip to ${destination} is starting tomorrow (${startDate})! You will be travelling with: ${buddiesStr}. Pack your bags and stay safe!`;
    
    const [emailSuccess, waSuccess] = await Promise.all([
      this.sendEmail(toEmail, `TravelMate Trip Reminder - ${destination}`, text),
      this.sendWhatsApp(toPhone, text)
    ]);
    
    return emailSuccess || waSuccess;
  }
}

export const notificationService = new NotificationService();

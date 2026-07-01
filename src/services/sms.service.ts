import * as dotenv from 'dotenv';

dotenv.config();

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

export async function sendSMS(toPhone: string, body: string): Promise<boolean> {
  // If credentials are not provided, log and return true (development fallback)
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.warn(`[SMS Service] Twilio credentials not configured. SMS not sent.
Destination: ${toPhone}
Message: ${body}`);
    return true;
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
    
    // E.164 phone formatting check (add +91 for India if not present)
    let formattedPhone = toPhone.trim();
    if (!formattedPhone.startsWith('+')) {
      if (formattedPhone.length === 10) {
        formattedPhone = `+91${formattedPhone}`;
      } else {
        formattedPhone = `+${formattedPhone}`;
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: formattedPhone,
        From: TWILIO_PHONE_NUMBER,
        Body: body
      })
    });

    const responseData = (await response.json()) as any;

    if (response.ok) {
      console.log(`[SMS Service] SMS successfully sent to ${formattedPhone}. Message SID: ${responseData.sid}`);
      return true;
    } else {
      console.error(`[SMS Service] Twilio API error: ${JSON.stringify(responseData)}`);
      return false;
    }
  } catch (err) {
    console.error(`[SMS Service] Failed to send SMS to ${toPhone}:`, err);
    return false;
  }
}

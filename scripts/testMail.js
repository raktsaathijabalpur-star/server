// Sends ONE sample "new blood request" email so you can check your SMTP settings before going live.
//
//   cd backend
//   node scripts/testMail.js your.own@gmail.com
//
// Uses SMTP_* / MAIL_FROM from backend/.env (or from the environment).
import dotenv from "dotenv";
import { mailConfigured, sendMail, siteUrl, verifyMail } from "../utils/mailer.js";
import { newRequestEmail } from "../utils/emailTemplates.js";

dotenv.config();

const to = process.argv[2];
if (!to) {
  console.log("Usage: node scripts/testMail.js <your email address>");
  process.exit(1);
}

if (!mailConfigured()) {
  console.log("Email is switched OFF: set SMTP_HOST, SMTP_USER and SMTP_PASS in backend/.env (see .env.example).");
  process.exit(1);
}

console.log(`Server: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}`);
try {
  await verifyMail();
  console.log("1/2  Connected and logged in OK.");
} catch (err) {
  console.log(`1/2  FAILED: ${err.code || ""} ${err.message}`);
  if (["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNREFUSED"].includes(err.code)) {
    console.log("     Cannot reach the mail server. Wrong SMTP_HOST/PORT? Or the port is blocked —");
    console.log("     Render's free plan blocks ports 25, 465 and 587. Use port 2525 (Brevo/SendGrid/Mailgun...).");
  } else if (err.code === "EAUTH") {
    console.log("     Login refused. Check SMTP_USER / SMTP_PASS (Brevo: the SMTP key, not your account password).");
  }
  process.exit(1);
}

const mail = newRequestEmail({
  donor: { name: "Test Donor", bloodGroup: "O+" },
  request: {
    _id: "000000000000000000000000",
    bloodGroup: "A+",
    unitsRequired: 2,
    urgency: "Emergency",
    hospitalName: "Sample Hospital",
    city: "Jabalpur",
    area: "Napier Town",
    requiredBy: new Date(Date.now() + 3 * 3600 * 1000),
    notes: "This is only a test email. No real request was created.",
  },
  siteUrl: siteUrl(),
});

const result = await sendMail({ to, ...mail, subject: `[TEST] ${mail.subject}` });
console.log(result.sent ? `2/2  Sample email sent to ${to}. Check the inbox (and the spam folder).` : `2/2  FAILED: ${result.reason}`);
process.exit(result.sent ? 0 : 1);

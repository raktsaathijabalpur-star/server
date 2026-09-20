import nodemailer from "nodemailer";

// Email sending (Nodemailer over SMTP). Everything is configured from environment variables:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM     (see .env.example)
// If SMTP_HOST / SMTP_USER / SMTP_PASS are missing, email is simply switched OFF — the website
// keeps working and nothing is sent.

let transporter = null;

// The website address used in email links = the FIRST address in CLIENT_URL
// (CLIENT_URL=https://bloodsevajabalpur.in,https://www.bloodsevajabalpur.in). Local default: Vite's address.
export const siteUrl = () =>
  (process.env.CLIENT_URL || "").split(",")[0].trim().replace(/\/+$/, "") || "http://localhost:5173";

export const mailConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

// Only plain addresses (name@domain.tld). Anything with spaces, quotes, brackets, commas or
// parentheses is refused, so a crafted "email" can never turn into several recipients.
const SAFE_EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
export const isSafeEmail = (email) =>
  typeof email === "string" && email.length <= 254 && SAFE_EMAIL.test(email);

// aman@gmail.com -> a***@gmail.com  (for logs: never print people's full addresses)
export const maskEmail = (email) => String(email).replace(/^(.).*(@.*)$/, "$1***$2");

const oneLine = (value) => String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);

function getTransporter() {
  if (transporter) return transporter;

  const port = Number(process.env.SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = TLS from the start
    requireTLS: port !== 465, // every other port must upgrade to TLS (never send the password in clear)
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    pool: true, // reuse connections when sending to many donors
    maxConnections: 3,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 5, // at most 5 emails per second (providers throttle new accounts)
    // fail fast when the port is blocked instead of hanging for minutes
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  return transporter;
}

// For tests / after changing the SMTP settings at runtime
export function resetMailer() {
  if (transporter?.close) transporter.close();
  transporter = null;
}

// Checks the SMTP address + login without sending anything (used by scripts/testMail.js)
export const verifyMail = () => getTransporter().verify();

// Sends ONE email. Never throws: returns { sent: true } or { sent: false, reason }.
export async function sendMail({ to, subject, html, text, headers }) {
  if (!mailConfigured()) return { sent: false, reason: "not-configured" };
  if (!isSafeEmail(to)) return { sent: false, reason: "invalid-address" };

  const from = process.env.MAIL_FROM || `"Jabalpur Blood Seva" <${process.env.SMTP_USER}>`;
  try {
    const info = await getTransporter().sendMail({ from, to, subject: oneLine(subject), html, text, headers });
    return { sent: true, id: info?.messageId };
  } catch (err) {
    const message = String(err.message || err).split(to).join(maskEmail(to));
    console.error(`Email to ${maskEmail(to)} failed: ${err.code ? `${err.code} ` : ""}${message}`);
    return { sent: false, reason: err.code || "send-failed" };
  }
}

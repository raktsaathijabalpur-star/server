import { newRequestEmail } from "./emailTemplates.js";
import { isSafeEmail, mailConfigured, sendMail, siteUrl } from "./mailer.js";

// "A new blood request was posted" -> one personal email to every matching donor.
// Runs in the background: the patient's request is saved and answered first, emails follow.

const pending = new Set();

// Resolves when every email job started so far has finished (used by tests / graceful shutdown)
export async function mailQueueIdle() {
  while (pending.size) await Promise.allSettled([...pending]);
}

async function run(request, donors) {
  if (!mailConfigured()) return { skipped: "not-configured" };

  const max = Math.max(1, parseInt(process.env.MAIL_MAX_PER_REQUEST, 10) || 100);
  const seen = new Set();
  const targets = [];
  for (const donor of donors) {
    const email = String(donor.email || "").trim().toLowerCase();
    if (!isSafeEmail(email) || seen.has(email)) continue; // no email / weird email / same inbox twice
    seen.add(email);
    targets.push({ ...donor, email });
    if (targets.length >= max) break;
  }
  if (targets.length === 0) return { sent: 0, failed: 0 };

  const site = siteUrl();
  let sent = 0;
  let failed = 0;

  // 5 at a time; the mailer itself also limits the speed per second.
  for (let i = 0; i < targets.length; i += 5) {
    const results = await Promise.all(
      targets.slice(i, i + 5).map((donor) =>
        sendMail({ to: donor.email, ...newRequestEmail({ donor, request, siteUrl: site }) })
      )
    );
    sent += results.filter((r) => r.sent).length;
    failed += results.filter((r) => !r.sent).length;

    // A whole batch failing means the mail server is unreachable or the login is wrong —
    // don't keep hammering it (and waiting on timeouts) for the rest of the list.
    if (i === 0 && sent === 0) {
      console.error(`New-request emails for ${request.requestId}: mail server not working, giving up.`);
      return { sent, failed, aborted: true };
    }
  }

  console.log(
    `New-request emails for ${request.requestId}: ${sent} sent, ${failed} failed, ${donors.length - targets.length} skipped (no/duplicate email or over the limit)`
  );
  return { sent, failed };
}

// donors: [{ name, email, bloodGroup }]   Returns a promise you may ignore (it never rejects).
export function emailMatchingDonors(request, donors) {
  const task = run(request, donors)
    .catch((err) => {
      console.error("New-request emails failed:", err.message);
      return { sent: 0, failed: 0, error: true };
    })
    .finally(() => pending.delete(task));
  pending.add(task);
  return task;
}

// HTML + plain-text emails. Built with tables and inline styles because that is what
// Gmail / Outlook / phone mail apps render reliably.
// Everything that comes from a user (hospital name, notes, names...) is escaped — nobody can
// inject HTML or extra headers into an email through a blood request.

const BRAND = "#c0392b";

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const oneLine = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const firstName = (name) => oneLine(name).split(" ")[0] || "there";
const clip = (value, max) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

const URGENCY = {
  Emergency: { label: "EMERGENCY", color: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
  Urgent: { label: "URGENT", color: "#c2410c", bg: "#fff7ed", border: "#fed7aa" },
  Normal: { label: "NEEDED", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
};

function formatNeedBy(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const safeBase = (url) => {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? parsed.origin : "http://localhost:5173";
  } catch (err) {
    return "http://localhost:5173";
  }
};

// donor:   { name, bloodGroup }             the person receiving this email
// request: the blood request (bloodGroup, unitsRequired, urgency, hospitalName, city, area, requiredBy, notes, _id)
// siteUrl: the website address, e.g. https://bloodsevajabalpur.in
export function newRequestEmail({ donor, request, siteUrl }) {
  const base = safeBase(siteUrl);
  const link = `${base}/requests?open=${encodeURIComponent(String(request._id))}`;
  const settingsLink = `${base}/profile`;

  const urgency = URGENCY[request.urgency] ?? URGENCY.Normal;
  const bloodGroup = oneLine(request.bloodGroup);
  const hospital = oneLine(request.hospitalName) || "a hospital";
  const city = oneLine(request.city) || "Jabalpur";
  const location = [oneLine(request.area), city].filter(Boolean).join(", ");
  const units = Number(request.unitsRequired) || 1;
  const unitsText = `${units} unit${units === 1 ? "" : "s"}`;
  const needBy = formatNeedBy(request.requiredBy);
  const notes = clip(oneLine(request.notes), 300);
  const name = firstName(donor.name);

  const matchLine =
    donor.bloodGroup && donor.bloodGroup === request.bloodGroup
      ? `Your blood group (${oneLine(donor.bloodGroup)}) matches this request.`
      : `Your blood group (${oneLine(donor.bloodGroup)}) can donate to ${bloodGroup} patients.`;

  const subject = `${request.urgency === "Emergency" || request.urgency === "Urgent" ? `${urgency.label[0]}${urgency.label.slice(1).toLowerCase()}: ` : ""}${bloodGroup} blood needed at ${hospital}, ${city}`;
  const preheader = `${unitsText} of ${bloodGroup} needed at ${hospital}${needBy ? ` by ${needBy}` : ""}. Open the app to help.`;

  const details = [
    ["Blood group", bloodGroup],
    ["Units needed", unitsText],
    ["Hospital", hospital],
    ["Location", location],
    ["Needed by", needBy || "As soon as possible"],
  ].filter(([, value]) => value);

  // The blue-ish banner already shows blood group, units and hospital, so the table only adds what it doesn't.
  const tableDetails = details.filter(([label]) => label === "Location" || label === "Needed by");
  const detailRows = tableDetails
    .map(
      ([label, value]) => `
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f0ecea;font-size:13px;color:#7a7370;width:120px;vertical-align:top;">${esc(label)}</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0ecea;font-size:15px;color:#1a1a1a;font-weight:600;vertical-align:top;">${esc(value)}</td>
              </tr>`
    )
    .join("");

  const notesBlock = notes
    ? `
            <tr><td style="padding:16px 32px 0;">
              <div style="background:#faf8f7;border-left:3px solid ${BRAND};border-radius:6px;padding:12px 14px;font-size:14px;line-height:1.5;color:#4a4543;">
                <span style="display:block;font-size:12px;color:#7a7370;margin-bottom:2px;">Note from the patient's family</span>${esc(notes)}
              </div>
            </td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f2f0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2f0;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">

        <tr><td style="background:${BRAND};border-radius:16px 16px 0 0;padding:20px 32px;">
          <span style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.2px;">&#129656; Jabalpur Blood Seva</span>
        </td></tr>

        <tr><td style="background:#ffffff;border-radius:0 0 16px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

            <tr><td style="padding:28px 32px 0;">
              <span style="display:inline-block;background:${urgency.bg};color:${urgency.color};border:1px solid ${urgency.border};border-radius:999px;padding:4px 12px;font-size:12px;font-weight:800;letter-spacing:0.6px;">${urgency.label}</span>
              <h1 style="margin:14px 0 8px;font-size:24px;line-height:1.25;color:#1a1a1a;font-weight:800;">Hi ${esc(name)}, someone near you needs ${esc(bloodGroup)} blood</h1>
              <p style="margin:0;font-size:15px;line-height:1.55;color:#4a4543;">A patient in ${esc(city)} is looking for a donor. ${esc(matchLine)}</p>
            </td></tr>

            <tr><td style="padding:22px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf2f2;border-radius:12px;">
                <tr>
                  <td width="96" align="center" style="padding:18px 0 18px 18px;">
                    <div style="width:72px;height:72px;line-height:72px;border-radius:36px;background:${BRAND};color:#ffffff;font-size:28px;font-weight:800;text-align:center;">${esc(bloodGroup)}</div>
                  </td>
                  <td style="padding:18px;">
                    <div style="font-size:22px;font-weight:800;color:#1a1a1a;">${esc(unitsText)} needed</div>
                    <div style="font-size:14px;color:#7a7370;margin-top:2px;">${esc(hospital)}</div>
                  </td>
                </tr>
              </table>
            </td></tr>

            <tr><td style="padding:14px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${detailRows}
              </table>
            </td></tr>
${notesBlock}
            <tr><td align="center" style="padding:28px 32px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td align="center" bgcolor="${BRAND}" style="border-radius:10px;">
                  <a href="${esc(link)}" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">View request &amp; offer help</a>
                </td>
              </tr></table>
            </td></tr>
            <tr><td align="center" style="padding:6px 32px 0;font-size:12px;color:#9a938f;word-break:break-all;">
              Button not working? Open <a href="${esc(link)}" style="color:${BRAND};">${esc(link)}</a>
            </td></tr>

            <tr><td style="padding:24px 32px 30px;">
              <div style="border-top:1px solid #f0ecea;padding-top:16px;font-size:13px;line-height:1.55;color:#7a7370;">
                Please respond only if you are healthy and have not donated blood in the last 3 months.
                If you can't donate right now, you can switch your availability off in your profile.
              </div>
            </td></tr>
          </table>
        </td></tr>

        <tr><td align="center" style="padding:18px 16px 0;font-size:12px;line-height:1.6;color:#9a938f;">
          You are getting this email because you are a registered donor in ${esc(city)} and
          "New blood requests" is on in your notification settings.<br>
          <a href="${esc(settingsLink)}" style="color:#7a7370;">Manage notifications</a> &nbsp;&middot;&nbsp; Jabalpur Blood Seva
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `${urgency.label} — ${bloodGroup} blood needed`,
    "",
    `Hi ${name},`,
    `A patient in ${city} is looking for a donor. ${matchLine}`,
    "",
    ...details.map(([label, value]) => `${label}: ${value}`),
    ...(notes ? ["", `Note from the patient's family: ${notes}`] : []),
    "",
    `View the request and offer help: ${link}`,
    "",
    "Please respond only if you are healthy and have not donated blood in the last 3 months.",
    "",
    `You get this because "New blood requests" is on in your notification settings. Manage it here: ${settingsLink}`,
    "— Jabalpur Blood Seva",
  ].join("\n");

  return {
    subject,
    html,
    text,
    headers: { "Auto-Submitted": "auto-generated", "List-Unsubscribe": `<${settingsLink}>` },
  };
}

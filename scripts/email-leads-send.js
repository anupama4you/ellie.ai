/**
 * ELLIE Email Lead Sender
 * =======================
 * Reads the tracking Google Sheet and sends the drafted email via
 * Gmail SMTP for every row marked Email Approved=YES that hasn't been
 * sent yet. Deliberately its own script, triggered by hand — the
 * finder never calls this automatically, so nothing goes out without
 * someone reviewing the row first. Mirrors sms-leads-send.js but for
 * the Email Subject/Body/Approved/Status/Sent At columns instead.
 *
 * Requires a Gmail App Password (Google Account > Security > 2-Step
 * Verification > App passwords) for the sending mailbox — not the
 * account's normal login password.
 *
 * Run locally:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL=... GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=... \
 *   GOOGLE_SHEETS_SPREADSHEET_ID=... GMAIL_USER=hello@callellie.com \
 *   GMAIL_APP_PASSWORD=... node scripts/email-leads-send.js
 *
 * In CI: .github/workflows/email-leads-send.yml (workflow_dispatch only).
 */

const nodemailer = require("nodemailer");
const { getSheetsClient, readRows, markEmailSent, requireEnv } = require("./lib/google-sheets");

const SPREADSHEET_ID = requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
const TAB_NAME = process.env.GOOGLE_SHEETS_TAB_NAME || "Leads";
const GMAIL_USER = requireEnv("GMAIL_USER");
const GMAIL_APP_PASSWORD = requireEnv("GMAIL_APP_PASSWORD");
const FROM_NAME = process.env.EMAIL_FROM_NAME || "ELLIE (callellie.com)";

const MAX_PER_RUN = parseInt(process.env.EMAIL_MAX_PER_RUN || "50", 10);
// Gmail is stricter about burst sending than Texto — a longer gap between
// sends than the SMS script uses is deliberate, to stay well under Gmail's
// per-day sending caps and avoid tripping spam/rate-limit flags.
const DELAY_MS = parseInt(process.env.EMAIL_DELAY_MS || "3000", 10);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  const sheets = await getSheetsClient();
  const rows = await readRows(sheets, SPREADSHEET_ID, TAB_NAME);

  const toSend = rows.filter(
    (r) => r.emailApproved.trim().toUpperCase() === "YES" && !r.emailStatus.trim() && r.email.trim()
  );

  if (toSend.length === 0) {
    console.log('No rows are Email Approved=YES, unsent, and have an email address. Nothing to send.');
    return;
  }

  const batch = toSend.slice(0, MAX_PER_RUN);
  console.log(`Sending ${batch.length} of ${toSend.length} approved, unsent emails (cap ${MAX_PER_RUN} per run).`);

  let sent = 0;
  let failed = 0;
  for (const row of batch) {
    try {
      await transporter.sendMail({
        from: `"${FROM_NAME}" <${GMAIL_USER}>`,
        to: row.email,
        subject: row.emailSubject || `I have an idea for ${row.businessName}`,
        html: row.emailBody,
      });
      await markEmailSent(sheets, SPREADSHEET_ID, TAB_NAME, row.rowNumber, "SENT", new Date().toISOString());
      sent++;
      console.log(`Emailed ${row.businessName} (${row.email}).`);
    } catch (err) {
      await markEmailSent(sheets, SPREADSHEET_ID, TAB_NAME, row.rowNumber, "FAILED", new Date().toISOString());
      failed++;
      console.error(`Failed for ${row.businessName} (${row.email}): ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`Done. Sent: ${sent}, Failed: ${failed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * ELLIE SMS Lead Sender
 * =====================
 * Reads the tracking Google Sheet and sends the drafted SMS via
 * Texto for every row marked SMS Approved=YES that hasn't been sent
 * yet. This is deliberately its own script, triggered by hand — the
 * finder never calls this automatically, so nothing goes out without
 * someone reviewing the row first.
 *
 * Landlines can't take an SMS — leads-find.js now keeps any phone number,
 * so this filters to Phone Type=Mobile and marks anything else SKIPPED
 * rather than trying to text it.
 *
 * Run locally:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL=... GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=... \
 *   GOOGLE_SHEETS_SPREADSHEET_ID=... TEXTO_API_KEY=... \
 *   node scripts/sms-leads-send.js
 *
 * In CI: .github/workflows/sms-leads-send.yml (workflow_dispatch only).
 */

const { getSheetsClient, readRows, markSmsSent, requireEnv } = require("./lib/google-sheets");

const SPREADSHEET_ID = requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
const TAB_NAME = process.env.GOOGLE_SHEETS_TAB_NAME || "Leads";
const TEXTO_API_KEY = requireEnv("TEXTO_API_KEY");
// Optional — a registered alphanumeric Sender ID or dedicated number.
// Leave unset to send from Texto's default shared number.
const TEXTO_SENDER = process.env.TEXTO_SENDER;

const MAX_PER_RUN = parseInt(process.env.SMS_MAX_PER_RUN || "50", 10);
const DELAY_MS = parseInt(process.env.SMS_DELAY_MS || "1200", 10);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendOne(phone, message) {
  const res = await fetch("https://api.texto.com.au/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TEXTO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: phone,
      message,
      ...(TEXTO_SENDER ? { sender: TEXTO_SENDER } : {}),
      campaign: "sms-leads",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data?.message_id) {
    throw new Error(`Texto rejected ${phone}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const sheets = await getSheetsClient();
  const rows = await readRows(sheets, SPREADSHEET_ID, TAB_NAME);

  const approvedUnsent = rows.filter(
    (r) => r.smsApproved.trim().toUpperCase() === "YES" && !r.smsStatus.trim()
  );

  const toSend = approvedUnsent.filter((r) => r.phoneType === "Mobile");
  const skippedNonMobile = approvedUnsent.length - toSend.length;

  if (skippedNonMobile > 0) {
    console.log(`Skipping ${skippedNonMobile} approved row(s) with a non-mobile number (can't SMS a landline).`);
    for (const row of approvedUnsent.filter((r) => r.phoneType !== "Mobile")) {
      await markSmsSent(sheets, SPREADSHEET_ID, TAB_NAME, row.rowNumber, "SKIPPED (not mobile)", new Date().toISOString());
    }
  }

  if (toSend.length === 0) {
    console.log('No rows are SMS Approved=YES, unsent, and a mobile number. Nothing to send.');
    return;
  }

  const batch = toSend.slice(0, MAX_PER_RUN);
  console.log(`Sending ${batch.length} of ${toSend.length} approved, unsent leads (cap ${MAX_PER_RUN} per run).`);

  let sent = 0;
  let failed = 0;
  for (const row of batch) {
    try {
      await sendOne(row.phone, row.smsDraft);
      await markSmsSent(sheets, SPREADSHEET_ID, TAB_NAME, row.rowNumber, "SENT", new Date().toISOString());
      sent++;
      console.log(`Sent to ${row.businessName} (${row.phone}).`);
    } catch (err) {
      await markSmsSent(sheets, SPREADSHEET_ID, TAB_NAME, row.rowNumber, "FAILED", new Date().toISOString());
      failed++;
      console.error(`Failed for ${row.businessName} (${row.phone}): ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`Done. Sent: ${sent}, Failed: ${failed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

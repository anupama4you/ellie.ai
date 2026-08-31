/**
 * ELLIE SMS Lead Sender
 * =====================
 * Reads the tracking Google Sheet and sends the drafted SMS via
 * ClickSend for every row marked Approved=YES that hasn't been sent
 * yet. This is deliberately its own script, triggered by hand — the
 * finder never calls this automatically, so nothing goes out without
 * someone reviewing the row first.
 *
 * Run locally:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL=... GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=... \
 *   GOOGLE_SHEETS_SPREADSHEET_ID=... CLICKSEND_USERNAME=... CLICKSEND_API_KEY=... \
 *   node scripts/sms-leads-send.js
 *
 * In CI: .github/workflows/sms-leads-send.yml (workflow_dispatch only).
 */

const { getSheetsClient, readRows, markRowSent, requireEnv } = require("./lib/google-sheets");

const SPREADSHEET_ID = requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
const TAB_NAME = process.env.GOOGLE_SHEETS_TAB_NAME || "Leads";
const CLICKSEND_USERNAME = requireEnv("CLICKSEND_USERNAME");
const CLICKSEND_API_KEY = requireEnv("CLICKSEND_API_KEY");

const MAX_PER_RUN = parseInt(process.env.SMS_MAX_PER_RUN || "50", 10);
const DELAY_MS = parseInt(process.env.SMS_DELAY_MS || "1200", 10);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendOne(phone, body) {
  const auth = Buffer.from(`${CLICKSEND_USERNAME}:${CLICKSEND_API_KEY}`).toString("base64");
  const res = await fetch("https://rest.clicksend.com/v3/sms/send", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ source: "sdk", to: phone, body }],
    }),
  });
  const data = await res.json();
  const messageStatus = data?.data?.messages?.[0]?.status;
  if (!res.ok || messageStatus === "FAILED") {
    throw new Error(`ClickSend rejected ${phone}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const sheets = await getSheetsClient();
  const rows = await readRows(sheets, SPREADSHEET_ID, TAB_NAME);

  const toSend = rows.filter(
    (r) => r.approved.trim().toUpperCase() === "YES" && !r.status.trim()
  );

  if (toSend.length === 0) {
    console.log('No rows are Approved=YES with an empty Status. Nothing to send.');
    return;
  }

  const batch = toSend.slice(0, MAX_PER_RUN);
  console.log(`Sending ${batch.length} of ${toSend.length} approved, unsent leads (cap ${MAX_PER_RUN} per run).`);

  let sent = 0;
  let failed = 0;
  for (const row of batch) {
    try {
      await sendOne(row.phone, row.draftMessage);
      await markRowSent(sheets, SPREADSHEET_ID, TAB_NAME, row.rowNumber, "SENT", new Date().toISOString());
      sent++;
      console.log(`Sent to ${row.businessName} (${row.phone}).`);
    } catch (err) {
      await markRowSent(sheets, SPREADSHEET_ID, TAB_NAME, row.rowNumber, "FAILED", new Date().toISOString());
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

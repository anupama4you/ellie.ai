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

const { getSheetsClient, readRows, markSmsSent, markManySmsSent, requireEnv } = require("./lib/google-sheets");

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

// Distinct from a per-message rejection (bad number, blocked content) — this
// means the whole account is throttled for the day, so every remaining send
// in the batch would fail the same way. Thrown as its own type so main()
// can stop the run instead of marking the rest of the batch FAILED.
class DailyLimitError extends Error {}

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
    const msg = `Texto rejected ${phone}: ${JSON.stringify(data)}`;
    if (typeof data?.error === "string" && /daily limit/i.test(data.error)) {
      throw new DailyLimitError(msg);
    }
    throw new Error(msg);
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
  const nonMobile = approvedUnsent.filter((r) => r.phoneType !== "Mobile");

  if (nonMobile.length > 0) {
    console.log(`Skipping ${nonMobile.length} approved row(s) with a non-mobile number (can't SMS a landline).`);
    // One batched call instead of one write per row — marking a large batch
    // of skips individually can burn through Sheets' per-minute write quota
    // before the actual send loop below even starts.
    try {
      const now = new Date().toISOString();
      await markManySmsSent(
        sheets,
        SPREADSHEET_ID,
        TAB_NAME,
        nonMobile.map((row) => ({ rowNumber: row.rowNumber, status: "SKIPPED (not mobile)", sentAt: now }))
      );
    } catch (err) {
      console.error(`Could not mark non-mobile rows as skipped in the sheet (they'll be retried next run): ${err.message}`);
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
  let stoppedForDailyLimit = false;
  const writeFailures = [];
  for (const [i, row] of batch.entries()) {
    let status;
    try {
      await sendOne(row.phone, row.smsDraft);
      status = "SENT";
      sent++;
      console.log(`Sent to ${row.businessName} (${row.phone}).`);
    } catch (err) {
      if (err instanceof DailyLimitError) {
        // Not this lead's fault — the whole account is throttled for today,
        // so every remaining row would fail identically. Leave them with a
        // blank Status (untouched) so they're picked up again on a future
        // run instead of being marked FAILED and abandoned forever.
        console.error(`Texto's daily sending limit was hit: ${err.message}`);
        console.error(`Stopping — ${batch.length - i} approved lead(s) left unsent for a future run.`);
        stoppedForDailyLimit = true;
        break;
      }
      status = "FAILED";
      failed++;
      console.error(`Failed for ${row.businessName} (${row.phone}): ${err.message}`);
    }
    // The send attempt already happened either way — if recording it in the
    // sheet fails (e.g. a transient quota error), don't let that crash the
    // rest of the run and abandon the remaining approved leads.
    try {
      await markSmsSent(sheets, SPREADSHEET_ID, TAB_NAME, row.rowNumber, status, new Date().toISOString());
    } catch (err) {
      writeFailures.push({ rowNumber: row.rowNumber, businessName: row.businessName, status });
      console.error(`Could not record ${status} for ${row.businessName} (row ${row.rowNumber}): ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`Done. Sent: ${sent}, Failed: ${failed}.${stoppedForDailyLimit ? " Stopped early (daily limit)." : ""}`);
  if (writeFailures.length > 0) {
    console.log(
      `WARNING: the sheet wasn't updated for ${writeFailures.length} row(s) — the SMS attempt still happened, ` +
        "but you'll need to set SMS Status manually so it isn't retried next run:"
    );
    for (const f of writeFailures) {
      console.log(`  Row ${f.rowNumber} (${f.businessName}): should be ${f.status}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

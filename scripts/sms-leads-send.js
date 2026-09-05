/**
 * ELLIE SMS Lead Sender
 * Reads the unified Ellie Lead Outreach Pipeline / Email Queue tab.
 * Sends only rows explicitly approved for SMS, only to mobiles, and records status.
 */
const { getSheetsClient, readOutreachRows, markSms } = require("./lib/outreach-pipeline");

const SPREADSHEET_ID = process.env.OUTREACH_PIPELINE_SPREADSHEET_ID || "1oLv8_GvF4I1oEXkh0g0YjnukrQ5Y56UULriT1A4WwNE";
const TAB_NAME = process.env.OUTREACH_PIPELINE_TAB || "Email Queue";
const TEXTO_API_KEY = process.env.TEXTO_API_KEY;
if (!TEXTO_API_KEY) throw new Error("Missing TEXTO_API_KEY");
const TEXTO_SENDER = process.env.TEXTO_SENDER;
const MAX_PER_RUN = parseInt(process.env.SMS_MAX_PER_RUN || "50", 10);
const DELAY_MS = parseInt(process.env.SMS_DELAY_MS || "1200", 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function blocked(row) {
  return /stop|unsubscribe|opt.?out|do.?not.?contact|not interested/i.test(
    `${row.replyStatus || ""} ${row.notes || ""}`
  );
}

async function sendOne(phone, message) {
  const res = await fetch("https://api.texto.com.au/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${TEXTO_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      to: phone,
      message,
      ...(TEXTO_SENDER ? { sender: TEXTO_SENDER } : {}),
      campaign: "ellie-lead-outreach",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data?.message_id) throw new Error(JSON.stringify(data));
  return data;
}

async function main() {
  const sheets = await getSheetsClient();
  const rows = await readOutreachRows(sheets, SPREADSHEET_ID, TAB_NAME);

  const candidates = rows.filter((r) =>
    r.smsApproved &&
    !r.smsStatus.trim() &&
    r.phone &&
    !blocked(r)
  );

  const nonMobile = candidates.filter((r) => r.phoneType !== "Mobile");
  for (const row of nonMobile) {
    await markSms(sheets, SPREADSHEET_ID, row.rowNumber, "SKIPPED (not mobile)", new Date().toISOString(), TAB_NAME);
  }

  const batch = candidates.filter((r) => r.phoneType === "Mobile").slice(0, MAX_PER_RUN);
  if (!batch.length) {
    console.log("No approved, unsent mobile SMS rows.");
    return;
  }

  let sent = 0, failed = 0;
  for (const row of batch) {
    try {
      await sendOne(row.phone, row.smsDraft);
      await markSms(sheets, SPREADSHEET_ID, row.rowNumber, "SENT", new Date().toISOString(), TAB_NAME);
      sent++;
      console.log(`SMS sent: ${row.business} (${row.phone})`);
    } catch (err) {
      await markSms(sheets, SPREADSHEET_ID, row.rowNumber, "FAILED", new Date().toISOString(), TAB_NAME);
      failed++;
      console.error(`SMS failed: ${row.business}: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`Done. Sent: ${sent}, Failed: ${failed}`);
}

main().catch((err) => { console.error(err); process.exit(1); });

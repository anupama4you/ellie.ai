/**
 * ELLIE Email Lead Sender
 * Reads the unified Ellie Lead Outreach Pipeline / Email Queue tab.
 * Sends only rows explicitly approved for email and not already sent/opted out.
 */
const nodemailer = require("nodemailer");
const { getSheetsClient, readOutreachRows, markEmail } = require("./lib/outreach-pipeline");

const SPREADSHEET_ID = process.env.OUTREACH_PIPELINE_SPREADSHEET_ID || "1oLv8_GvF4I1oEXkh0g0YjnukrQ5Y56UULriT1A4WwNE";
const TAB_NAME = process.env.OUTREACH_PIPELINE_TAB || "Email Queue";
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
if (!GMAIL_USER || !GMAIL_APP_PASSWORD) throw new Error("Missing Gmail credentials");
const FROM_NAME = process.env.EMAIL_FROM_NAME || "ELLIE (callellie.com)";
const MAX_PER_RUN = parseInt(process.env.EMAIL_MAX_PER_RUN || "50", 10);
const DELAY_MS = parseInt(process.env.EMAIL_DELAY_MS || "3000", 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function blocked(row) {
  return /stop|unsubscribe|opt.?out|do.?not.?contact|not interested/i.test(
    `${row.replyStatus || ""} ${row.notes || ""}`
  );
}

async function main() {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  const sheets = await getSheetsClient();
  const rows = await readOutreachRows(sheets, SPREADSHEET_ID, TAB_NAME);
  const batch = rows.filter((r) =>
    r.emailApproved &&
    !r.emailSent &&
    r.email.trim() &&
    !blocked(r)
  ).slice(0, MAX_PER_RUN);

  if (!batch.length) {
    console.log("No approved, unsent email rows.");
    return;
  }

  let sent = 0, failed = 0;
  for (const row of batch) {
    try {
      await transporter.sendMail({
        from: `"${FROM_NAME}" <${GMAIL_USER}>`,
        to: row.email,
        subject: row.subject,
        text: row.draftBody,
      });
      await markEmail(sheets, SPREADSHEET_ID, row.rowNumber, true, new Date().toISOString(), null, TAB_NAME);
      sent++;
      console.log(`Email sent: ${row.business} (${row.email})`);
    } catch (err) {
      const note = [row.notes, `Email send failed: ${err.message}`].filter(Boolean).join(" | ");
      await markEmail(sheets, SPREADSHEET_ID, row.rowNumber, false, "", note, TAB_NAME);
      failed++;
      console.error(`Email failed: ${row.business}: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`Done. Sent: ${sent}, Failed: ${failed}`);
}

main().catch((err) => { console.error(err); process.exit(1); });

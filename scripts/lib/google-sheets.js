/**
 * Minimal Google Sheets client (service account auth) shared by the
 * lead-gen scripts. Not a general-purpose wrapper — just the handful
 * of operations leads-find.js, sms-leads-send.js and email-leads-send.js need.
 */

const { google } = require("googleapis");

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing ${name} env var.`);
    process.exit(1);
  }
  return val;
}

async function getSheetsClient() {
  const email = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = requireEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n");
  const auth = new google.auth.JWT(email, null, privateKey, [
    "https://www.googleapis.com/auth/spreadsheets",
  ]);
  await auth.authorize();
  return google.sheets({ version: "v4", auth });
}

// SMS and email are tracked with independent Approved/Status/Sent At triples
// so a lead can be approved for one channel, both, or neither.
const HEADER = [
  "Added",
  "Place ID",
  "Business Name",
  "Phone",
  "Phone Type",
  "Website",
  "Email",
  "Rating",
  "Category",
  "Address",
  "SMS Draft",
  "SMS Approved",
  "SMS Status",
  "SMS Sent At",
  "Email Subject",
  "Email Body",
  "Email Approved",
  "Email Status",
  "Email Sent At",
];

async function readRows(sheets, spreadsheetId, tabName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A1:S`,
  });
  const rows = res.data.values || [];
  if (rows.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1:S1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADER] },
    });
    return [];
  }
  // rows[0] is the header — return the rest as objects with a 1-based sheet row number.
  return rows.slice(1).map((row, i) => ({
    rowNumber: i + 2,
    added: row[0] || "",
    placeId: row[1] || "",
    businessName: row[2] || "",
    phone: row[3] || "",
    phoneType: row[4] || "",
    website: row[5] || "",
    email: row[6] || "",
    rating: row[7] || "",
    category: row[8] || "",
    address: row[9] || "",
    smsDraft: row[10] || "",
    smsApproved: row[11] || "",
    smsStatus: row[12] || "",
    smsSentAt: row[13] || "",
    emailSubject: row[14] || "",
    emailBody: row[15] || "",
    emailApproved: row[16] || "",
    emailStatus: row[17] || "",
    emailSentAt: row[18] || "",
  }));
}

async function appendRows(sheets, spreadsheetId, tabName, rows) {
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabName}!A1:S1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

async function markSmsSent(sheets, spreadsheetId, tabName, rowNumber, status, sentAt) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!M${rowNumber}:N${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[status, sentAt]] },
  });
}

async function markEmailSent(sheets, spreadsheetId, tabName, rowNumber, status, sentAt) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!R${rowNumber}:S${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[status, sentAt]] },
  });
}

// Sheets' write-request quota is per-call, not per-cell-range, so marking N
// rows with N separate values.update calls burns N quota units — fine for a
// slow send loop with a delay between rows, but a tight loop (e.g. marking
// every skipped landline at once) can blow through the per-minute quota in
// seconds. batchUpdate bundles any number of range updates into one call.
async function batchMarkSent(sheets, spreadsheetId, tabName, statusCol, sentAtCol, updates) {
  if (updates.length === 0) return;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: updates.map((u) => ({
        range: `${tabName}!${statusCol}${u.rowNumber}:${sentAtCol}${u.rowNumber}`,
        values: [[u.status, u.sentAt]],
      })),
    },
  });
}

async function markManySmsSent(sheets, spreadsheetId, tabName, updates) {
  await batchMarkSent(sheets, spreadsheetId, tabName, "M", "N", updates);
}

async function markManyEmailSent(sheets, spreadsheetId, tabName, updates) {
  await batchMarkSent(sheets, spreadsheetId, tabName, "R", "S", updates);
}

module.exports = {
  getSheetsClient,
  readRows,
  appendRows,
  markSmsSent,
  markEmailSent,
  markManySmsSent,
  markManyEmailSent,
  HEADER,
  requireEnv,
};

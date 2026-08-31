/**
 * Minimal Google Sheets client (service account auth) shared by the
 * SMS lead-gen scripts. Not a general-purpose wrapper — just the handful
 * of operations sms-leads-find.js and sms-leads-send.js need.
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

const HEADER = [
  "Added",
  "Place ID",
  "Business Name",
  "Phone",
  "Rating",
  "Category",
  "Address",
  "Draft Message",
  "Approved",
  "Status",
  "Sent At",
];

async function readRows(sheets, spreadsheetId, tabName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A1:K`,
  });
  const rows = res.data.values || [];
  if (rows.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1:K1`,
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
    rating: row[4] || "",
    category: row[5] || "",
    address: row[6] || "",
    draftMessage: row[7] || "",
    approved: row[8] || "",
    status: row[9] || "",
    sentAt: row[10] || "",
  }));
}

async function appendRows(sheets, spreadsheetId, tabName, rows) {
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabName}!A1:K1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

async function markRowSent(sheets, spreadsheetId, tabName, rowNumber, status, sentAt) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!J${rowNumber}:K${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[status, sentAt]] },
  });
}

module.exports = { getSheetsClient, readRows, appendRows, markRowSent, HEADER, requireEnv };

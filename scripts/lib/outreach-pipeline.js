const { google } = require("googleapis");
const { requireEnv } = require("./google-sheets");

const HEADER = [
  "Business","Email","Subject","Draft Body","Personalisation Used",
  "Approved to Send?","Sent?","Sent Date","Reply Status","Follow-up Due","Notes",
  "Phone","Phone Type","Website","Category","Address",
  "SMS Draft","SMS Approved?","SMS Status","SMS Sent Date"
];

async function getSheetsClient() {
  const email = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = requireEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n");
  const auth = new google.auth.JWT(email, null, privateKey, ["https://www.googleapis.com/auth/spreadsheets"]);
  await auth.authorize();
  return google.sheets({ version: "v4", auth });
}

function isTrue(v) {
  if (v === true) return true;
  return ["TRUE","YES","Y","1"].includes(String(v || "").trim().toUpperCase());
}

async function readOutreachRows(sheets, spreadsheetId, tabName = "Email Queue") {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tabName}!A1:T` });
  const values = res.data.values || [];
  if (!values.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${tabName}!A1:T1`, valueInputOption: "RAW",
      requestBody: { values: [HEADER] }
    });
    return [];
  }
  return values.slice(1).map((r, i) => ({
    rowNumber: i + 2,
    business: r[0] || "",
    email: r[1] || "",
    subject: r[2] || "",
    draftBody: r[3] || "",
    personalisation: r[4] || "",
    emailApproved: isTrue(r[5]),
    emailSent: isTrue(r[6]),
    emailSentDate: r[7] || "",
    replyStatus: r[8] || "",
    followUpDue: r[9] || "",
    notes: r[10] || "",
    phone: r[11] || "",
    phoneType: r[12] || "",
    website: r[13] || "",
    category: r[14] || "",
    address: r[15] || "",
    smsDraft: r[16] || "",
    smsApproved: isTrue(r[17]),
    smsStatus: r[18] || "",
    smsSentDate: r[19] || "",
  }));
}

async function appendOutreachRows(sheets, spreadsheetId, rows, tabName = "Email Queue") {
  if (!rows.length) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId, range: `${tabName}!A1:T1`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows }
  });
}

async function markEmail(sheets, spreadsheetId, rowNumber, sent, sentDate, notes = null, tabName = "Email Queue") {
  const data = [
    { range: `${tabName}!G${rowNumber}:H${rowNumber}`, values: [[sent ? "TRUE" : "", sentDate || ""]] }
  ];
  if (notes !== null) data.push({ range: `${tabName}!K${rowNumber}`, values: [[notes]] });
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data } });
}

async function markSms(sheets, spreadsheetId, rowNumber, status, sentDate, tabName = "Email Queue") {
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: `${tabName}!S${rowNumber}:T${rowNumber}`, valueInputOption: "RAW",
    requestBody: { values: [[status, sentDate || ""]] }
  });
}

module.exports = { HEADER, getSheetsClient, readOutreachRows, appendOutreachRows, markEmail, markSms, isTrue };

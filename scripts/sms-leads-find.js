/**
 * ELLIE SMS Lead Finder
 * =====================
 * Searches Google Places for businesses matching a query, keeps only
 * ones with an Australian mobile number, drafts a personalised SMS for
 * each, and appends them to the tracking Google Sheet with an empty
 * "Approved" column. Nothing gets sent here — that's a separate,
 * human-triggered step (sms-leads-send.js) so every message gets a
 * pair of eyes before it goes out.
 *
 * Run locally:
 *   GOOGLE_PLACES_API_KEY=... GOOGLE_SERVICE_ACCOUNT_EMAIL=... \
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=... GOOGLE_SHEETS_SPREADSHEET_ID=... \
 *   SEARCH_QUERY="hair salon in Adelaide" node scripts/sms-leads-find.js
 *
 * In CI: .github/workflows/sms-leads-find.yml (workflow_dispatch only —
 * this never runs on a schedule).
 */

const { getSheetsClient, readRows, appendRows, requireEnv } = require("./lib/google-sheets");

const PLACES_API_KEY = requireEnv("GOOGLE_PLACES_API_KEY");
const SPREADSHEET_ID = requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
const TAB_NAME = process.env.GOOGLE_SHEETS_TAB_NAME || "Leads";

const SEARCH_QUERY = process.env.SEARCH_QUERY;
if (!SEARCH_QUERY) {
  console.error('Missing SEARCH_QUERY env var, e.g. "plumber in Perth".');
  process.exit(1);
}
const MAX_RESULTS = Math.min(parseInt(process.env.MAX_RESULTS || "20", 10), 60);

// Matches AU mobiles in any of the formats Places returns them:
// "+61 4XX XXX XXX", "0061 4XX XXX XXX", "04XX XXX XXX", with or without spaces/dashes.
const AU_MOBILE_RE = /^(?:\+?61|0061|0)4\d{8}$/;

function normalisePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  return digits;
}

function isAuMobile(raw) {
  const digits = normalisePhone(raw);
  if (!digits) return false;
  return AU_MOBILE_RE.test(digits.replace(/^\+/, "+"));
}

function toE164(raw) {
  const digits = normalisePhone(raw).replace(/^\+/, "");
  if (digits.startsWith("61")) return `+${digits}`;
  if (digits.startsWith("0")) return `+61${digits.slice(1)}`;
  return `+${digits}`;
}

function humaniseCategory(types) {
  if (!types || types.length === 0) return "your industry";
  const skip = new Set(["point_of_interest", "establishment", "store"]);
  const pick = types.find((t) => !skip.has(t)) || types[0];
  return pick.replace(/_/g, " ");
}

// Kept plain GSM (no emoji/unicode) and under 306 chars on purpose — one
// emoji or going past that flips the message to Unicode encoding, which
// drops the per-part limit from 153 to 70 chars and multiplies SMS cost.
function draftMessage(name, rating, category) {
  const ratingBit = rating ? `your ${rating} rating for ${category}` : `${category}`;
  return `Hi ${name}, saw ${ratingBit} on Google. Ellie answers calls & books jobs 24/7 for AU businesses. Free demo: callellie.com or call 0485 057 840. Reply STOP to opt out.`;
}

async function textSearch(query) {
  const results = [];
  let pageToken = null;
  do {
    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    url.searchParams.set("query", query);
    url.searchParams.set("key", PLACES_API_KEY);
    if (pageToken) {
      url.searchParams.set("pagetoken", pageToken);
      // Google requires a short delay before a pagetoken becomes valid.
      await new Promise((r) => setTimeout(r, 2000));
    }
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      throw new Error(`Places text search failed: ${data.status} ${data.error_message || ""}`);
    }
    results.push(...(data.results || []));
    pageToken = data.next_page_token || null;
  } while (pageToken && results.length < MAX_RESULTS);
  return results.slice(0, MAX_RESULTS);
}

async function getPlaceDetails(placeId) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set(
    "fields",
    "name,international_phone_number,formatted_phone_number,rating,formatted_address,types,business_status"
  );
  url.searchParams.set("key", PLACES_API_KEY);
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK") return null;
  return data.result;
}

async function main() {
  console.log(`Searching Places for: "${SEARCH_QUERY}" (up to ${MAX_RESULTS} results)`);
  const candidates = await textSearch(SEARCH_QUERY);
  console.log(`Found ${candidates.length} candidate businesses. Fetching phone numbers...`);

  const sheets = await getSheetsClient();
  const existingRows = await readRows(sheets, SPREADSHEET_ID, TAB_NAME);
  const seenPlaceIds = new Set(existingRows.map((r) => r.placeId));
  const seenPhones = new Set(existingRows.map((r) => r.phone));

  const newRows = [];
  let skippedDuplicate = 0;
  let skippedNotMobile = 0;
  let skippedClosed = 0;

  for (const candidate of candidates) {
    if (seenPlaceIds.has(candidate.place_id)) {
      skippedDuplicate++;
      continue;
    }
    const details = await getPlaceDetails(candidate.place_id);
    if (!details) continue;
    if (details.business_status && details.business_status !== "OPERATIONAL") {
      skippedClosed++;
      continue;
    }
    const rawPhone = details.international_phone_number || details.formatted_phone_number;
    if (!isAuMobile(rawPhone)) {
      skippedNotMobile++;
      continue;
    }
    const phone = toE164(rawPhone);
    if (seenPhones.has(phone)) {
      skippedDuplicate++;
      continue;
    }
    seenPhones.add(phone);

    const category = humaniseCategory(details.types);
    const message = draftMessage(details.name, details.rating, category);

    newRows.push([
      new Date().toISOString(),
      candidate.place_id,
      details.name,
      phone,
      details.rating || "",
      category,
      details.formatted_address || "",
      message,
      "", // Approved — fill in "YES" to allow sending
      "", // Status
      "", // Sent At
    ]);
  }

  await appendRows(sheets, SPREADSHEET_ID, TAB_NAME, newRows);

  console.log(`Added ${newRows.length} new leads to the "${TAB_NAME}" sheet.`);
  console.log(
    `Skipped: ${skippedDuplicate} duplicate, ${skippedNotMobile} not an AU mobile, ${skippedClosed} closed.`
  );
  console.log('Review the sheet and set "Approved" to YES on the rows you want sent, then run sms-leads-send.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

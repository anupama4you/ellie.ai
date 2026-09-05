/**
 * ELLIE Google Places Lead Finder
 * Google Places -> Place Details -> website email discovery -> master Leads sheet
 * -> unified Ellie Lead Outreach Pipeline (both SMS and email approvals).
 */
const { getSheetsClient, readRows, appendRows, requireEnv } = require("./lib/google-sheets");
const { appendOutreachRows } = require("./lib/outreach-pipeline");

const PLACES_API_KEY = requireEnv("GOOGLE_PLACES_API_KEY");
const MASTER_SPREADSHEET_ID = requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
const MASTER_TAB = process.env.GOOGLE_SHEETS_TAB_NAME || "Leads";
const OUTREACH_SPREADSHEET_ID = process.env.OUTREACH_PIPELINE_SPREADSHEET_ID || "1oLv8_GvF4I1oEXkh0g0YjnukrQ5Y56UULriT1A4WwNE";
const OUTREACH_TAB = process.env.OUTREACH_PIPELINE_TAB || "Email Queue";

const DEFAULT_SEARCH_QUERY = [
  "plumber Adelaide SA","electrician Adelaide SA","air conditioning Adelaide SA",
  "dentist Adelaide SA","physiotherapist Adelaide SA","medical clinic Adelaide SA",
  "hair salon Adelaide SA","beauty salon Adelaide SA","skin clinic Adelaide SA",
  "mechanic Adelaide SA","auto repair Adelaide SA","migration agent Adelaide SA",
  "real estate agency Adelaide SA","conveyancer Adelaide SA",
  "plumber Norwood SA","electrician Norwood SA","dentist Norwood SA","hair salon Norwood SA",
  "beauty salon Prospect SA","dentist Unley SA","physiotherapist Unley SA",
  "hair salon Glenelg SA","beauty salon Glenelg SA","mechanic Glenelg SA",
  "dentist Modbury SA","beauty salon Modbury SA","electrician Modbury SA",
  "hair salon Salisbury SA","dentist Salisbury SA","mechanic Port Adelaide SA",
  "hair salon Mawson Lakes SA","beauty salon Golden Grove SA","physiotherapist Golden Grove SA"
].join("|");

const SEARCH_QUERY = process.env.SEARCH_QUERY || DEFAULT_SEARCH_QUERY;
const QUERIES = SEARCH_QUERY.split("|").map(q => q.trim()).filter(Boolean);
const MAX_RESULTS = Math.min(parseInt(process.env.MAX_RESULTS || "60", 10), 60);
const TARGET_NEW_LEADS = parseInt(process.env.TARGET_NEW_LEADS || "100", 10);

const AU_MOBILE_RE = /^(?:\+?61|0061|0)4\d{8}$/;
const AU_LANDLINE_RE = /^(?:\+?61|0061|0)[2378]\d{8}$/;

function normalisePhone(raw) { return raw ? raw.replace(/[^\d+]/g, "") : ""; }
function classifyPhone(raw) {
  const p = normalisePhone(raw);
  if (!p) return "";
  if (AU_MOBILE_RE.test(p)) return "Mobile";
  if (AU_LANDLINE_RE.test(p)) return "Landline";
  return "Other";
}
function toE164(raw) {
  if (!raw) return "";
  const digits = normalisePhone(raw).replace(/^\+/, "");
  if (digits.startsWith("61")) return "+" + digits;
  if (/^0[2378]/.test(digits) || /^04/.test(digits)) return "+61" + digits.slice(1);
  return raw.trim();
}
function normaliseUrl(raw) {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return (u.origin + u.pathname).replace(/\/$/, "").toLowerCase();
  } catch { return raw.toLowerCase().replace(/\/$/, ""); }
}
function humaniseCategory(types) {
  const skip = new Set(["point_of_interest","establishment","store"]);
  const pick = (types || []).find(t => !skip.has(t)) || (types || [])[0] || "business";
  return pick.replace(/_/g, " ");
}
function suburbFromAddress(address) {
  const m = String(address || "").match(/,\s*([^,]+?)\s+SA\s+\d{4}/i);
  return m ? m[1].trim() : "Adelaide";
}
function personalisation(category, address) {
  return `your ${suburbFromAddress(address)} business is publicly listed for ${category} services`;
}
function smsVariant(types) {
  const set = new Set(types || []);
  if (set.has("plumber") || set.has("electrician") || set.has("roofing_contractor") || set.has("general_contractor") || set.has("locksmith") || set.has("hvac_contractor")) {
    return "missed trade calls can mean lost jobs";
  }
  if (set.has("beauty_salon") || set.has("hair_care") || set.has("hair_salon") || set.has("spa") || set.has("nail_salon")) {
    return "Ellie can handle salon calls and booking enquiries";
  }
  if (set.has("dentist") || set.has("doctor") || set.has("physiotherapist") || set.has("health") || set.has("veterinary_care")) {
    return "Ellie can handle clinic calls and appointment enquiries";
  }
  if (set.has("car_repair") || set.has("car_dealer")) {
    return "Ellie can handle workshop calls and booking enquiries";
  }
  if (set.has("real_estate_agency")) {
    return "Ellie can handle property enquiries and calls";
  }
  if (set.has("lawyer") || set.has("accounting")) {
    return "Ellie can handle client calls and enquiries";
  }
  return "Ellie can handle business calls and enquiries";
}

function draftSms(name, types) {
  const businessToken = name;
  const variant = smsVariant(types);
  const msg = variant.startsWith("missed")
    ? `Hi ${businessToken}, ${variant}. Ellie answers 24/7. Try 0485 057 840 or callellie.com. Reply STOP to opt out.`
    : `Hi ${businessToken}, ${variant} 24/7. Try 0485 057 840 or callellie.com. Reply STOP to opt out.`;

  // Keep drafts within one GSM SMS part (160 chars) without emojis/smart punctuation.
  if (msg.length <= 160) return msg;

  const fallback = `Hi ${businessToken}, Ellie answers calls 24/7 for your business. Try 0485 057 840 or callellie.com. Reply STOP to opt out.`;
  return fallback.slice(0, 160);
}
function draftEmail(name, category, address) {
  const p = personalisation(category, address);
  const subject = `Quick idea for ${name} 👀`;
  const body = `Hi ${name} team,

I came across ${name} and noticed ${p}.

We’ve built Ellie, an AI front desk for Australian businesses that can answer calls 24/7, handle enquiries, take details and help with bookings when your team can’t get to the phone. 📞

What makes Ellie different is that we set it up around your actual services, hours, staff and call-handling rules — not a generic answering bot.

We’re offering a 7-day free trial, including setup. No card or commitment.

And if you decide to keep Ellie after the trial, plans start from just $99/month.

If you’d like to try it, simply reply to this email and we’ll have Ellie set up for your business within 24 hours. 😊

You can hear Ellie here:
callellie.com 👀

Cheers,

Anu Dilshan
Founder | Ellie
Your AI front desk, built around your business.

📞 0485 057 840
✉️ hello@callellie.com
🌐 callellie.com

If you’d rather not hear from me again, just reply STOP.`;
  return { subject, body, personalisation: p };
}

async function textSearch(query) {
  const results = [];
  let pageToken = null;
  do {
    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    url.searchParams.set("query", query);
    url.searchParams.set("key", PLACES_API_KEY);
    if (pageToken) {
      await new Promise(r => setTimeout(r, 2000));
      url.searchParams.set("pagetoken", pageToken);
    }
    const res = await fetch(url);
    const data = await res.json();
    if (!["OK","ZERO_RESULTS"].includes(data.status)) throw new Error(`Places search failed: ${data.status} ${data.error_message || ""}`);
    results.push(...(data.results || []));
    pageToken = data.next_page_token || null;
  } while (pageToken && results.length < MAX_RESULTS);
  return results.slice(0, MAX_RESULTS);
}

async function getPlaceDetails(placeId) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "name,international_phone_number,formatted_phone_number,rating,formatted_address,types,business_status,website");
  url.searchParams.set("key", PLACES_API_KEY);
  const res = await fetch(url);
  const data = await res.json();
  return data.status === "OK" ? data.result : null;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const JUNK_RE = /\.(png|jpe?g|gif|webp|svg|css|js)$/i;
const JUNK_HOST_RE = /(sentry\.io|wixpress\.com|godaddy\.com|example\.com|schema\.org|w3\.org)$/i;
const PREFERRED = ["info","hello","contact","admin","reception","enquiries","enquiry","bookings","office","sales"];
async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent":"Mozilla/5.0 (compatible; EllieLeadFinder/2.0)" } });
    if (!res.ok) return "";
    return await res.text();
  } catch { return ""; }
  finally { clearTimeout(timer); }
}
function extractEmails(html) {
  const mailtos = [...String(html).matchAll(/mailto:([^"'?\s>]+)/gi)].map(m => m[1]);
  const raw = String(html).match(EMAIL_RE) || [];
  return [...new Set([...mailtos, ...raw].map(x => x.toLowerCase().trim()))].filter(e => {
    const host = e.split("@")[1] || "";
    return !JUNK_RE.test(e) && !JUNK_HOST_RE.test(host);
  });
}
function chooseEmail(emails) {
  if (!emails.length) return "";
  return emails.find(e => PREFERRED.includes(e.split("@")[0])) || emails[0];
}
async function findEmailOnWebsite(website) {
  if (!website) return "";
  let base;
  try { base = new URL(website); } catch { return ""; }
  const paths = ["", "/contact", "/contact-us", "/about", "/about-us", "/booking", "/book", "/bookings"];
  const found = [];
  for (const path of paths) {
    const html = await fetchText(path ? new URL(path, base).toString() : base.toString());
    found.push(...extractEmails(html));
    const chosen = chooseEmail([...new Set(found)]);
    if (chosen) return chosen;
  }
  return "";
}

async function main() {
  console.log(`Lead finder: ${QUERIES.length} queries, target ${TARGET_NEW_LEADS} new leads.`);
  const sheets = await getSheetsClient();
  const existing = await readRows(sheets, MASTER_SPREADSHEET_ID, MASTER_TAB);

  const seenPlaceIds = new Set(existing.map(r => r.placeId).filter(Boolean));
  const seenPhones = new Set(existing.map(r => normalisePhone(r.phone)).filter(Boolean));
  const seenWebsites = new Set(existing.map(r => normaliseUrl(r.website)).filter(Boolean));
  const seenNames = new Set(existing.map(r => r.businessName.toLowerCase().trim()).filter(Boolean));

  const masterRows = [];
  const outreachRows = [];
  let emailCount = 0, duplicateCount = 0;

  for (const query of QUERIES) {
    if (masterRows.length >= TARGET_NEW_LEADS) break;
    console.log(`Searching: ${query}`);
    const candidates = await textSearch(query);

    for (const candidate of candidates) {
      if (masterRows.length >= TARGET_NEW_LEADS) break;
      if (!candidate.place_id || seenPlaceIds.has(candidate.place_id)) { duplicateCount++; continue; }

      const details = await getPlaceDetails(candidate.place_id);
      if (!details || (details.business_status && details.business_status !== "OPERATIONAL")) continue;

      const rawPhone = details.international_phone_number || details.formatted_phone_number || "";
      const phone = rawPhone ? toE164(rawPhone) : "";
      const phoneKey = normalisePhone(phone);
      const website = details.website || "";
      const websiteKey = normaliseUrl(website);
      const nameKey = String(details.name || "").toLowerCase().trim();

      if ((phoneKey && seenPhones.has(phoneKey)) || (websiteKey && seenWebsites.has(websiteKey)) || seenNames.has(nameKey)) {
        duplicateCount++; continue;
      }

      const email = await findEmailOnWebsite(website);
      if (!phone && !email) continue;

      const phoneType = classifyPhone(rawPhone);
      const category = humaniseCategory(details.types);
      const address = details.formatted_address || "";
      const sms = phone ? draftSms(details.name, details.types) : "";
      const em = draftEmail(details.name, category, address);
      const added = new Date().toISOString();

      masterRows.push([
        added, candidate.place_id, details.name, phone, phoneType, website, email,
        details.rating || "", category, address, sms, "", "", "",
        email ? em.subject : "", email ? em.body : "", "", "", ""
      ]);

      outreachRows.push([
        details.name, email, email ? em.subject : "", email ? em.body : "", em.personalisation,
        "", "", "", "", "", "Added by Google Places lead finder",
        phone, phoneType, website, category, address, sms, "", "", ""
      ]);

      seenPlaceIds.add(candidate.place_id);
      if (phoneKey) seenPhones.add(phoneKey);
      if (websiteKey) seenWebsites.add(websiteKey);
      seenNames.add(nameKey);
      if (email) emailCount++;
    }
  }

  await appendRows(sheets, MASTER_SPREADSHEET_ID, MASTER_TAB, masterRows);
  await appendOutreachRows(sheets, OUTREACH_SPREADSHEET_ID, outreachRows, OUTREACH_TAB);

  console.log(`Added ${masterRows.length} new leads; ${emailCount} with public email; skipped ${duplicateCount} duplicates.`);
  console.log(`Unified outreach rows appended to ${OUTREACH_TAB}; both SMS and email approvals remain blank.`);
}

main().catch(err => { console.error(err); process.exit(1); });

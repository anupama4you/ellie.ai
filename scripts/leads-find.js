/**
 * ELLIE Lead Finder
 * =================
 * Searches Google Places for businesses matching a query, keeps any one
 * that has a phone number (mobile or landline — the SMS sender filters
 * to mobiles later) OR a scrapeable website email — a business with
 * neither is dropped, since there'd be no channel to reach it on.
 * Drafts a personalised SMS and a personalised email for each, and
 * appends them to the tracking Google Sheet with empty "Approved"
 * columns for both channels. Nothing gets sent here — that's two
 * separate, human-triggered steps (sms-leads-send.js / email-leads-send.js)
 * so every message gets a pair of eyes before it goes out.
 *
 * Run locally:
 *   GOOGLE_PLACES_API_KEY=... GOOGLE_SERVICE_ACCOUNT_EMAIL=... \
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=... GOOGLE_SHEETS_SPREADSHEET_ID=... \
 *   SEARCH_QUERY="hair salon in Adelaide" node scripts/leads-find.js
 *
 * In CI: .github/workflows/leads-find.yml (workflow_dispatch only —
 * this never runs on a schedule).
 */

const { getSheetsClient, readRows, appendRows, requireEnv } = require("./lib/google-sheets");

const PLACES_API_KEY = requireEnv("GOOGLE_PLACES_API_KEY");
const SPREADSHEET_ID = requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
const TAB_NAME = process.env.GOOGLE_SHEETS_TAB_NAME || "Leads";

// Google Places Text Search hard-caps at 60 results per query (3 pages of
// 20), and a broad query ("plumber in South Australia") often returns well
// under that since it ranks by relevance rather than listing exhaustively.
// To reach a real target count in one run, accept several queries separated
// by "|" (e.g. one per suburb) and work through them in order.
const SEARCH_QUERY = process.env.SEARCH_QUERY;
if (!SEARCH_QUERY) {
  console.error('Missing SEARCH_QUERY env var, e.g. "plumber in Perth" or "plumber in Adelaide|plumber in Mount Gambier".');
  process.exit(1);
}
const QUERIES = SEARCH_QUERY.split("|").map((q) => q.trim()).filter(Boolean);
const MAX_RESULTS = Math.min(parseInt(process.env.MAX_RESULTS || "60", 10), 60);
const TARGET_NEW_LEADS = parseInt(process.env.TARGET_NEW_LEADS || "100", 10);

// AU mobiles and landlines in any of the formats Places returns them:
// "+61 4XX XXX XXX", "0061 4XX XXX XXX", "04XX XXX XXX", with or without spaces/dashes.
// Landline area codes are 2/3/7/8; everything else (13xx, 1800, overseas) is "Other".
const AU_MOBILE_RE = /^(?:\+?61|0061|0)4\d{8}$/;
const AU_LANDLINE_RE = /^(?:\+?61|0061|0)[2378]\d{8}$/;

function normalisePhone(raw) {
  if (!raw) return null;
  return raw.replace(/[^\d+]/g, "");
}

function classifyPhone(raw) {
  const digits = normalisePhone(raw);
  if (!digits) return "";
  if (AU_MOBILE_RE.test(digits)) return "Mobile";
  if (AU_LANDLINE_RE.test(digits)) return "Landline";
  return "Other";
}

function toE164(raw) {
  const digits = normalisePhone(raw).replace(/^\+/, "");
  if (digits.startsWith("61")) return `+${digits}`;
  if (/^0[2378]/.test(digits) || /^04/.test(digits)) return `+61${digits.slice(1)}`;
  // 13xx/1800/other formats don't map cleanly to E.164 — keep Google's own formatting.
  return raw.trim();
}

function humaniseCategory(types) {
  if (!types || types.length === 0) return "your industry";
  const skip = new Set(["point_of_interest", "establishment", "store"]);
  const pick = types.find((t) => !skip.has(t)) || types[0];
  return pick.replace(/_/g, " ");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// What a missed call actually costs each kind of business — used to make
// the opening line land instead of reading as one generic template.
const JOB_TYPES = new Set([
  "plumber", "electrician", "roofing_contractor", "general_contractor",
  "locksmith", "painter", "moving_company", "car_repair", "hvac_contractor",
  "contractor", "handyman",
]);
const BOOKING_TYPES = new Set([
  "beauty_salon", "hair_care", "hair_salon", "spa", "gym", "nail_salon",
  "restaurant", "cafe", "meal_takeaway",
]);
const APPOINTMENT_TYPES = new Set([
  "doctor", "dentist", "physiotherapist", "veterinary_care", "lawyer",
  "accounting", "hospital", "health",
]);
function missedNoun(types) {
  const set = new Set(types || []);
  if ([...JOB_TYPES].some((t) => set.has(t))) return "jobs";
  if ([...BOOKING_TYPES].some((t) => set.has(t))) return "bookings";
  if ([...APPOINTMENT_TYPES].some((t) => set.has(t))) return "appointments";
  return "customers";
}

// A concrete, category-specific scenario reads as a real text instead of a
// mail-merged ad blast — same reason the email's opening line is tailored
// per business type rather than reusing one generic sentence everywhere.
function smsHook(types) {
  const set = new Set(types || []);
  if ([...JOB_TYPES].some((t) => set.has(t))) {
    return "how many calls slip through when you're mid-job? Ellie answers 24/7, sounds natural, and books the job in while your hands are full";
  }
  if ([...BOOKING_TYPES].some((t) => set.has(t))) {
    return "ever miss a booking because you were with a client? Ellie answers 24/7 and fills the diary while you're busy, so a full day never means a lost booking";
  }
  if ([...APPOINTMENT_TYPES].some((t) => set.has(t))) {
    return "a missed call can mean a patient books elsewhere. Ellie answers 24/7, takes their details and books them in instead";
  }
  return "missed calls can quietly cost you customers. Ellie answers 24/7, sounds natural, and handles it while you're busy";
}

// Kept plain GSM (no emoji/unicode) on purpose — one emoji or a smart/curly
// apostrophe flips the whole message to Unicode encoding, which both
// shrinks the per-part limit (154 -> 67 chars) and doubles Texto's
// credit cost per part, so a single emoji here would roughly 4x the cost.
// Includes callellie.com — Texto's default account tier rejects any
// message with a URL until support enables it for the account. Sends
// will fail with that error until that's sorted on the Texto side.
function draftSms(name, types) {
  const hook = smsHook(types);
  const capitalisedHook = hook.charAt(0).toUpperCase() + hook.slice(1);
  return `G'day ${name}! ${capitalisedHook}. Try it free: callellie.com or call 0485 057 840. Reply STOP to opt out.`;
}

// Modelled on the cold email that's actually gone out from hello@callellie.com —
// same structure and tone, with the opening line adapted per business category.
function draftEmail(name, types) {
  const noun = missedNoun(types);
  const safeName = escapeHtml(name);
  const subject = `I have an idea for ${name} \u{1F440}`;
  const html = `<p>Hi there,</p>

<p>I came across <strong>${safeName}</strong> and wanted to reach out personally.</p>

<p>Missed calls can quietly cost a business like this ${noun} it never gets back.</p>

<p>We're building <strong>Ellie</strong>, an AI front desk for Australian businesses. The idea is pretty simple. When you or the team can't get to the phone, Ellie can answer, help with enquiries, take details and handle bookings instead of letting the call go unanswered.</p>

<p>What we're trying to do differently is avoid the generic "AI answering bot" approach. We set Ellie up around each business's actual services, hours, staff and the way they want calls handled.</p>

<p>We're letting a few businesses try it <strong>free for 7 days</strong> at the moment, including the setup. No card or commitment.</p>

<p>If you're curious, you can hear Ellie here. It only takes about 30 seconds:<br> <a href="https://callellie.com"><strong>Try Ellie &rarr;</strong></a></p>

<p><a href="https://callellie.com"><img src="https://callellie.com/assets/ellie/loop.gif" alt="Ellie demo" width="200" style="max-width:100%;height:auto;border:0;border-radius:8px;" /></a></p>

<p>If you think it could be useful for <strong>${safeName}</strong>, just reply to this email. Happy to show you what we'd set up specifically for your business \u{1F60A}</p>

<p>Cheers,</p>

<table cellpadding="0" cellspacing="0" border="0" style="font-family:Verdana,Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#000;"><tr><td><strong>Anu Dilshan</strong><br>Founder | <strong>Ellie</strong><br><span style="color:#555;">Your AI front desk, built around your business.</span><br><br>\u{1F4DE} +61 452 575 523<br>✉️ <a href="mailto:hello@callellie.com">hello@callellie.com</a><br>\u{1F310} <a href="https://callellie.com">callellie.com</a></td></tr></table>

<p style="font-size:11px;color:#999;margin-top:20px;">Ellie (callellie.com), Adelaide SA. Don't want to hear from us again? <a href="mailto:hello@callellie.com?subject=Unsubscribe" style="color:#999;">Reply to unsubscribe</a> and we won't email you again.</p>`;
  return { subject, html };
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
    "name,international_phone_number,formatted_phone_number,rating,formatted_address,types,business_status,website"
  );
  url.searchParams.set("key", PLACES_API_KEY);
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK") return null;
  return data.result;
}

// Google Places has no email field — the only way to get one is to scrape
// the business's own site. Cheap and best-effort: fetch the homepage, then
// a couple of common contact-page paths if nothing turns up there.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Filters out tracking pixels, CSS/JS asset names that look like emails
// (e.g. "photo@2x.png"), and placeholder addresses from site builders.
const JUNK_DOMAIN_RE = /\.(png|jpe?g|gif|webp|svg|css|js)$/i;
const JUNK_HOST_RE = /(sentry\.io|wixpress\.com|godaddy\.com|example\.com|schema\.org|w3\.org)$/i;
const PREFERRED_PREFIXES = ["info", "contact", "hello", "enquiries", "enquiry", "admin", "sales", "bookings"];
const FETCH_TIMEOUT_MS = 8000;

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EllieLeadFinder/1.0)" },
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function extractEmail(html) {
  const matches = html.match(EMAIL_RE) || [];
  const clean = [...new Set(matches.map((m) => m.toLowerCase()))].filter(
    (m) => !JUNK_DOMAIN_RE.test(m) && !JUNK_HOST_RE.test(m)
  );
  if (clean.length === 0) return "";
  const preferred = clean.find((m) => PREFERRED_PREFIXES.includes(m.split("@")[0]));
  return preferred || clean[0];
}

async function findEmailOnWebsite(website) {
  if (!website) return "";
  let base;
  try {
    base = new URL(website);
  } catch {
    return "";
  }
  const homepage = await fetchText(base.toString());
  let email = extractEmail(homepage);
  if (email) return email;

  for (const path of ["/contact", "/contact-us"]) {
    const pageUrl = new URL(path, base).toString();
    const html = await fetchText(pageUrl);
    email = extractEmail(html);
    if (email) return email;
  }
  return "";
}

async function main() {
  console.log(
    `Running ${QUERIES.length} quer${QUERIES.length === 1 ? "y" : "ies"}, aiming for ${TARGET_NEW_LEADS} new leads ` +
      `(each query capped at ${MAX_RESULTS} candidates by Google).`
  );

  const sheets = await getSheetsClient();
  const existingRows = await readRows(sheets, SPREADSHEET_ID, TAB_NAME);
  const seenPlaceIds = new Set(existingRows.map((r) => r.placeId));
  const seenPhones = new Set(existingRows.map((r) => r.phone));

  const newRows = [];
  let skippedDuplicate = 0;
  let skippedNoContact = 0;
  let skippedClosed = 0;
  let foundEmail = 0;
  let queriesUsed = 0;

  for (const query of QUERIES) {
    if (newRows.length >= TARGET_NEW_LEADS) {
      console.log(`\nAlready have ${newRows.length} new leads (target ${TARGET_NEW_LEADS}) — skipping remaining queries.`);
      break;
    }
    queriesUsed++;

    console.log(`\nSearching Places for: "${query}" (up to ${MAX_RESULTS} results)`);
    const candidates = await textSearch(query);
    console.log(`Found ${candidates.length} candidate businesses for "${query}". Fetching details...`);

    for (const candidate of candidates) {
      if (newRows.length >= TARGET_NEW_LEADS) break;

      // Dedupe against the sheet AND against candidates already picked up by
      // an earlier query in this same run (queries can overlap in results).
      if (seenPlaceIds.has(candidate.place_id)) {
        skippedDuplicate++;
        continue;
      }
      seenPlaceIds.add(candidate.place_id);

      const details = await getPlaceDetails(candidate.place_id);
      if (!details) continue;
      if (details.business_status && details.business_status !== "OPERATIONAL") {
        skippedClosed++;
        continue;
      }

      const rawPhone = details.international_phone_number || details.formatted_phone_number;
      const phoneType = rawPhone ? classifyPhone(rawPhone) : "";
      const phone = rawPhone ? toE164(rawPhone) : "";
      if (phone && seenPhones.has(phone)) {
        skippedDuplicate++;
        continue;
      }

      const website = details.website || "";
      if (!phone && !website) {
        // No phone and no way to find an email either — nothing to contact them with.
        skippedNoContact++;
        continue;
      }
      const contactEmail = await findEmailOnWebsite(website);
      if (!phone && !contactEmail) {
        skippedNoContact++;
        continue;
      }
      if (phone) seenPhones.add(phone);
      if (contactEmail) foundEmail++;

      const category = humaniseCategory(details.types);
      const sms = phone ? draftSms(details.name, details.types) : "";
      const email = draftEmail(details.name, details.types);

      newRows.push([
        new Date().toISOString(), // Added
        candidate.place_id, // Place ID
        details.name, // Business Name
        phone, // Phone
        phoneType, // Phone Type
        website, // Website
        contactEmail, // Email
        details.rating || "", // Rating
        category, // Category
        details.formatted_address || "", // Address
        sms, // SMS Draft
        "", // SMS Approved — fill in "YES" to allow sending
        "", // SMS Status
        "", // SMS Sent At
        email.subject, // Email Subject
        email.html, // Email Body
        "", // Email Approved — fill in "YES" to allow sending
        "", // Email Status
        "", // Email Sent At
      ]);
    }
  }

  await appendRows(sheets, SPREADSHEET_ID, TAB_NAME, newRows);

  console.log(`\nUsed ${queriesUsed} of ${QUERIES.length} provided quer${QUERIES.length === 1 ? "y" : "ies"}.`);
  console.log(`Added ${newRows.length} new leads to the "${TAB_NAME}" sheet (${foundEmail} with an email found).`);
  console.log(
    `Skipped: ${skippedDuplicate} duplicate, ${skippedNoContact} with neither a phone nor an email, ${skippedClosed} closed.`
  );
  if (newRows.length < TARGET_NEW_LEADS && queriesUsed >= QUERIES.length) {
    console.log(
      `Note: fell short of the ${TARGET_NEW_LEADS} target — ran out of queries. Add more "|"-separated ` +
        "queries (e.g. more suburbs) to get further next time."
    );
  }
  console.log(
    'Review the sheet and set "SMS Approved" / "Email Approved" to YES on the rows you want sent, ' +
      "then run sms-leads-send / email-leads-send."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

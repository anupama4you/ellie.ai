const fs = require('node:fs/promises');
const cheerio = require('cheerio');

// Separators are whitespace/dash only (not '.') — visible phone numbers are
// written "0400 111 222" / "02-9876-5432", while a bare dot separator is
// almost always a decimal stat or price ("99.999%") rather than a number.
const PHONE_REGEX = /(?<![\d.$€£¥])(?:\+?\d{1,3}[\s-])?\(?\d{2,4}\)?[\s-]\d{3,4}(?:[\s-]\d{3,4})?(?!\d)/;

function normalizeWebsiteUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    const host = url.hostname.toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
    if (!host.includes('.') && !isLocalHost) return '';
    if (!url.pathname) url.pathname = '/';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function getBusinessWebsiteInput(event) {
  const body = (() => {
    try {
      return typeof event?.body === 'string' ? JSON.parse(event.body) : (event?.body || {});
    } catch {
      return {};
    }
  })();

  const query = event?.queryStringParameters || {};
  return (
    body?.businessWebsite ||
    body?.website ||
    body?.url ||
    query?.businessWebsite ||
    query?.website ||
    query?.url ||
    ''
  );
}

const TEXT_BEARING_SELECTOR = 'h1,h2,h3,p,li,div,span,a';

function stripHtmlToText(html) {
  const $ = cheerio.load(String(html || ''));
  $('script,style,noscript,svg').remove();
  const parts = [];
  // Only take text from the innermost matching elements — a div/span wrapping
  // a p/li/a would otherwise have its children's text counted again for every
  // ancestor, flooding the output with repeated nav/menu text on real sites.
  $('body').find(TEXT_BEARING_SELECTOR).each((_, el) => {
    const $el = $(el);
    if ($el.find(TEXT_BEARING_SELECTOR).length > 0) return;
    const text = $el.text().trim();
    if (text) parts.push(text);
  });
  const text = parts.join(' ');
  return decodeHtmlEntities(text)
    .replace(/\s+/g, ' ')
    .replace(/\s([,.;:!?])/g, '$1')
    .trim();
}

function looksLikeYearRange(candidate) {
  const m = candidate.match(/^(\d{4})[\s-](\d{4})$/);
  if (!m) return false;
  const [y1, y2] = [Number(m[1]), Number(m[2])];
  return y1 >= 1900 && y1 <= 2100 && y2 >= 1900 && y2 <= 2100;
}

function findPhoneNumber(text) {
  const matches = text.matchAll(new RegExp(PHONE_REGEX, 'g'));
  for (const match of matches) {
    if (!looksLikeYearRange(match[0])) return match[0].trim();
  }
  return '';
}

function extractMetadata(html) {
  const $ = cheerio.load(String(html || ''));
  const title = $('title').first().text().trim()
    || $('meta[property="og:title"]').attr('content')?.trim()
    || $('meta[name="title"]').attr('content')?.trim()
    || '';
  const description = $('meta[name="description"]').attr('content')?.trim()
    || $('meta[property="og:description"]').attr('content')?.trim()
    || '';
  const telHref = $('a[href^="tel:"]').attr('href') || '';
  const telPhone = telHref.match(/^tel:(.+)$/i)?.[1]?.trim() || '';
  // Script/style content must be dropped before scanning for a phone number —
  // otherwise inline JS, JSON-LD and analytics IDs get matched as digits.
  $('script,style,noscript').remove();
  const bodyText = $('body').text() || $.root().text();
  const phone = telPhone || findPhoneNumber(bodyText);

  return {
    title: decodeHtmlEntities(title),
    description: decodeHtmlEntities(description),
    phone: decodeHtmlEntities(phone),
  };
}

function isLocalFileInput(source) {
  return /^(\/|\.\/|\.\.\/)/.test(source) || source.startsWith('file://');
}

async function readLocalFile(source) {
  try {
    const filePath = source.startsWith('file://') ? new URL(source).pathname : source;
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

/** Local-file-only — network fetching goes through fetchBusinessInfoWithFirecrawl below. */
async function fetchWebsiteContent(url, options = {}) {
  const source = String(url || '').trim();

  if (isLocalFileInput(source)) {
    const html = await readLocalFile(source);
    if (!html) return { content: '', metadata: {}, source: null, url: '' };
    return {
      content: stripHtmlToText(html).slice(0, 5000),
      metadata: extractMetadata(html),
      source: 'html',
      url: source,
    };
  }

  return { content: '', metadata: {}, source: null, url: '' };
}

const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v2/scrape';
const DEFAULT_FIRECRAWL_TIMEOUT_MS = 12000;

const EMPTY_BUSINESS_INFO = {
  name: '', description: '', phone: '', email: '', location: '',
  hours: '', businessType: '', services: '', bookingInfo: '', additionalInfo: '',
};

const BUSINESS_INFO_JSON_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Full business name' },
    description: { type: 'string', description: '2-3 sentences: what they do, who they serve, their speciality' },
    phone: { type: 'string', description: 'Main phone number' },
    email: { type: 'string', description: 'Main contact email' },
    location: { type: 'string', description: 'Full address or suburb/city + state' },
    hours: { type: 'string', description: 'Opening hours summary' },
    businessType: { type: 'string', description: 'e.g. Car Dealership, Hair Salon, Dental Clinic, Plumber' },
    services: { type: 'string', description: 'Comma-separated list of key services or products offered' },
    bookingInfo: { type: 'string', description: 'How customers book — online, phone, walk-in, etc.' },
    additionalInfo: { type: 'string', description: "Any other detail useful for a receptionist to know that doesn't fit the fields above (awards, notable facts, policies)" },
  },
  required: ['name', 'description', 'phone', 'email', 'location', 'hours', 'businessType', 'services', 'bookingInfo', 'additionalInfo'],
};

/**
 * Fetches a business website and extracts structured info in one Firecrawl /scrape call
 * using its `json` format — Firecrawl handles the page fetch and the extraction itself, so
 * this is a single API call rather than a separate scrape-then-extract pipeline. Does not
 * work for Google Maps/Business Profile listings — those are a client-rendered SPA that
 * doesn't expose business details to a scraper (confirmed: returns only map tile image
 * URLs, no text).
 */
async function fetchBusinessInfoWithFirecrawl(normalizedUrl, options = {}) {
  const apiKey = options.apiKey || process.env.FIRECRAWL_API_KEY;
  const timeoutMs = options.timeoutMs || DEFAULT_FIRECRAWL_TIMEOUT_MS;
  if (!apiKey) throw new Error('Missing Firecrawl API key');

  const res = await fetch(FIRECRAWL_SCRAPE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      url: normalizedUrl,
      formats: [{ type: 'json', schema: BUSINESS_INFO_JSON_SCHEMA }],
      // Phone numbers, hours, and addresses live in the header/footer on most business
      // sites — onlyMainContent:true strips exactly that.
      onlyMainContent: false,
      timeout: Math.max(timeoutMs - 1500, 2000),
    }),
  });
  if (!res.ok) throw new Error(`Firecrawl ${res.status}`);

  const data = await res.json();
  if (!data.success) throw new Error(data?.error || 'Firecrawl scrape failed');
  return { ...EMPTY_BUSINESS_INFO, ...(data.data?.json || {}) };
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5';

const BUSINESS_INFO_SCHEMA_PROMPT = `Return ONLY valid JSON, no markdown, no explanation, in exactly this shape (use an empty string for any field you can't find):
{
  "name": "full business name",
  "description": "2-3 sentences: what they do, who they serve, their speciality",
  "phone": "main phone number",
  "email": "main contact email",
  "location": "full address or suburb/city + state",
  "hours": "opening hours summary",
  "businessType": "e.g. Car Dealership, Hair Salon, Dental Clinic, Plumber",
  "services": "comma-separated list of key services or products offered",
  "bookingInfo": "how customers book - online, phone, walk-in, etc.",
  "additionalInfo": "any other detail useful for a receptionist to know that doesn't fit above (awards, notable facts, policies)"
}`;

/**
 * Fallback for when Firecrawl fails or times out: has Claude fetch the page itself (via
 * its own web_fetch tool) and extract in one call. Slower than Firecrawl on average
 * (measured ~9-13s), but uses different infrastructure — some sites that stall Firecrawl's
 * renderer succeed here, and vice versa. web_fetch requires the URL to already appear in
 * the conversation, so it's embedded in the prompt text below.
 */
async function fetchBusinessInfoWithClaude(normalizedUrl, options = {}) {
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
  const timeoutMs = options.timeoutMs || DEFAULT_FIRECRAWL_TIMEOUT_MS;
  if (!apiKey) throw new Error('Missing Anthropic API key');

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      tools: [{ type: 'web_fetch_20250910', name: 'web_fetch' }],
      tool_choice: { type: 'tool', name: 'web_fetch' },
      messages: [{
        role: 'user',
        content: `Fetch this business website and extract information for an AI phone receptionist: ${normalizedUrl}\n\n${BUSINESS_INFO_SCHEMA_PROMPT}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);

  const data = await res.json();
  const textBlock = (data.content || []).filter((b) => b.type === 'text').pop();
  const raw = (textBlock?.text || '{}')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return { ...EMPTY_BUSINESS_INFO, ...JSON.parse(raw) };
}

// Claude's web_fetch fallback measured ~13-14s to actually complete on sites Firecrawl
// struggled with — giving it less than that just burns the budget on a second failure.
// Firecrawl gets a short fail-fast window instead of a long one, so a stalled site moves
// to the fallback quickly rather than eating time that should go to Claude.
const DEFAULT_OVERALL_TIMEOUT_MS = 18000;
const DEFAULT_FIRECRAWL_ATTEMPT_MS = 4000;
const MIN_CLAUDE_FALLBACK_MS = 4000;

/**
 * Firecrawl first (fast on most sites), falling back to Claude's own web_fetch if Firecrawl
 * errors or times out. Firecrawl gets a short leash so a slow/stalled site fails into the
 * fallback quickly rather than eating the whole budget — see fetchBusinessInfoWithClaude
 * for why a second, differently-infrastructured attempt is worth making at all.
 */
async function fetchBusinessInfo(normalizedUrl, options = {}) {
  const overallBudgetMs = options.timeoutMs || DEFAULT_OVERALL_TIMEOUT_MS;
  const deadline = Date.now() + overallBudgetMs;

  try {
    return await fetchBusinessInfoWithFirecrawl(normalizedUrl, {
      apiKey: options.firecrawlApiKey,
      timeoutMs: Math.min(options.firecrawlTimeoutMs || DEFAULT_FIRECRAWL_ATTEMPT_MS, overallBudgetMs - MIN_CLAUDE_FALLBACK_MS),
    });
  } catch {
    const remainingMs = deadline - Date.now();
    if (remainingMs < MIN_CLAUDE_FALLBACK_MS) return { ...EMPTY_BUSINESS_INFO };
    try {
      return await fetchBusinessInfoWithClaude(normalizedUrl, {
        apiKey: options.anthropicApiKey,
        timeoutMs: remainingMs,
      });
    } catch {
      return { ...EMPTY_BUSINESS_INFO };
    }
  }
}

module.exports = {
  normalizeWebsiteUrl,
  getBusinessWebsiteInput,
  stripHtmlToText,
  extractMetadata,
  fetchWebsiteContent,
  fetchBusinessInfoWithFirecrawl,
  fetchBusinessInfoWithClaude,
  fetchBusinessInfo,
};

const fs = require('node:fs/promises');
const cheerio = require('cheerio');

const DEFAULT_TIMEOUT_MS = 5000;
const JINA_READER_BASE = 'https://r.jina.ai/';
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

/** Direct HTML fetch, using a Googlebot UA — most WAFs whitelist it since blocking it hurts SEO. */
async function fetchDirectContent(normalizedUrl, timeoutMs) {
  try {
    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;

    const html = await response.text();
    if (!html) return null;
    const content = stripHtmlToText(html).slice(0, 5000);
    return content ? { html, content, kind: 'html' } : null;
  } catch {
    return null;
  }
}

/**
 * Jina AI's free Reader service: renders JS (fixes empty-shell Wix/Squarespace/React
 * sites) and, via X-Remove-Selector, strips nav/footer/header/cookie banners at the
 * source rather than leaving it to be filtered out of the extracted text.
 */
async function fetchJinaContent(normalizedUrl, timeoutMs) {
  try {
    const headers = {
      Accept: 'application/json',
      'X-Remove-Selector': 'nav,footer,header,.cookie,.popup,.overlay,.banner',
    };
    if (process.env.JINA_API_KEY) headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;

    const response = await fetch(JINA_READER_BASE + normalizedUrl, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;

    const data = await response.json();
    const content = (data?.data?.content || '').replace(/\n{4,}/g, '\n\n').trim();
    return content ? { title: data?.data?.title || '', content: content.slice(0, 5000), kind: 'jina' } : null;
  } catch {
    return null;
  }
}

async function readLocalFile(source) {
  try {
    const filePath = source.startsWith('file://') ? new URL(source).pathname : source;
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function fetchWebsiteContent(url, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
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

  const normalizedUrl = normalizeWebsiteUrl(source);
  if (!normalizedUrl) return { content: '', metadata: {}, source: null, url: '' };

  // Race Jina against a direct fetch — whichever returns usable content first wins,
  // so a slow/hanging site doesn't block on a full sequential fallback.
  const result = await Promise.any(
    [fetchJinaContent(normalizedUrl, timeoutMs), fetchDirectContent(normalizedUrl, timeoutMs)]
      .map((p) => p.then((r) => r || Promise.reject()))
  ).catch(() => null);

  if (!result) return { content: '', metadata: {}, source: null, url: '' };

  const metadata = result.kind === 'html'
    ? extractMetadata(result.html)
    : { title: result.title || '', description: '', phone: findPhoneNumber(result.content) };

  return {
    content: result.content,
    metadata,
    source: result.kind === 'html' ? 'html' : 'jina-reader',
    url: normalizedUrl,
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  normalizeWebsiteUrl,
  getBusinessWebsiteInput,
  stripHtmlToText,
  extractMetadata,
  fetchWebsiteContent,
};

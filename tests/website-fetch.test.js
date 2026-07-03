const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { normalizeWebsiteUrl, getBusinessWebsiteInput, stripHtmlToText, extractMetadata, fetchWebsiteContent } = require('../netlify/functions/_website-fetch');

test('normalizeWebsiteUrl adds https and preserves paths', () => {
  assert.equal(normalizeWebsiteUrl('example.com'), 'https://example.com/');
  assert.equal(normalizeWebsiteUrl('https://example.com/about'), 'https://example.com/about');
  assert.equal(normalizeWebsiteUrl('http://localhost:8888'), 'http://localhost:8888/');
});

test('stripHtmlToText removes tags and decodes entities', () => {
  const html = '<html><body><h1>Welcome</h1><p>Call us &amp; book today.</p></body></html>';
  assert.equal(stripHtmlToText(html), 'Welcome Call us & book today.');
});

test('stripHtmlToText does not repeat text for every wrapping div/span', () => {
  // A nav menu nested several layers deep (div > div > ul > li > a), as found
  // in real WordPress/mega-menu markup — each ancestor div previously had its
  // own .text() call, re-emitting the same menu text once per ancestor.
  const html = `<html><body>
    <div class="nav-wrap"><div class="nav-inner"><ul><li><a href="/services">Our Services</a></li></ul></div></div>
    <p>Call us on 0400 111 222 for a free quote.</p>
  </body></html>`;
  const text = stripHtmlToText(html);
  const occurrences = (text.match(/Our Services/g) || []).length;
  assert.equal(occurrences, 1);
  assert.match(text, /Call us on 0400 111 222/);
});

test('getBusinessWebsiteInput reads query parameters', () => {
  assert.equal(getBusinessWebsiteInput({ queryStringParameters: { businessWebsite: 'example.com' } }), 'example.com');
});

test('extractMetadata surfaces title, description, and phone', () => {
  const html = `<!doctype html><html><head>
    <title>Acme Plumbing</title>
    <meta name="description" content="Fast local plumbing" />
    <meta property="og:title" content="Acme Plumbing" />
  </head><body>Call us on <a href="tel:+61400111222">0400 111 222</a></body></html>`;

  const metadata = extractMetadata(html);
  assert.equal(metadata.title, 'Acme Plumbing');
  assert.equal(metadata.description, 'Fast local plumbing');
  assert.equal(metadata.phone, '+61400111222');
});

test('fetchWebsiteContent reads a local HTML file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ellie-scrape-'));
  const filePath = path.join(dir, 'index.html');
  fs.writeFileSync(filePath, '<!doctype html><html><head><title>Local Bakery</title><meta name="description" content="Fresh bread" /></head><body><h1>Local Bakery</h1><p>Call us on 0400 111 222</p></body></html>');

  const result = await fetchWebsiteContent(filePath);
  assert.equal(result.metadata.title, 'Local Bakery');
  assert.equal(result.metadata.description, 'Fresh bread');
  assert.match(result.content, /Local Bakery/);
});

test('extractMetadata ignores digits inside script/style tags', () => {
  const html = `<html><head><title>Acme</title>
    <script>var buildId = 918273645; var version = "4.2.1810293";</script>
    <style>.x { width: 1024768px; }</style>
  </head><body><p>No phone listed here.</p></body></html>`;

  assert.equal(extractMetadata(html).phone, '');
});

test('extractMetadata does not mistake a copyright year range for a phone number', () => {
  const html = '<html><body><footer>Copyright 2006-2026 Acme. Call us on 0400 111 222</footer></body></html>';
  assert.equal(extractMetadata(html).phone, '0400 111 222');
});

test('extractMetadata does not mistake a decimal stat for a phone number', () => {
  const html = '<html><body><p>99.999% uptime processed in 2025</p></body></html>';
  assert.equal(extractMetadata(html).phone, '');
});

/**
 * ELLIE SEO Engine — Daily Article Generator
 * ============================================
 * Picks the next keyword from the queue, asks Claude to write a
 * genuinely useful SEO article, saves it as a static HTML page in
 * /blog, updates the blog index + sitemap, and marks the keyword done.
 *
 * Run locally:  ANTHROPIC_API_KEY=sk-... node scripts/generate-article.js
 * In CI:        runs daily via .github/workflows/daily-article.yml
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const QUEUE_FILE = path.join(ROOT, "content-queue", "keywords.json");
const BLOG_DIR = path.join(ROOT, "blog");
const TEMPLATE_FILE = path.join(ROOT, "blog-template", "article-template.html");
const SITEMAP_FILE = path.join(ROOT, "sitemap-blog.xml");
const SITE_URL = process.env.SITE_URL || "https://callellie.com";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY env var.");
  process.exit(1);
}

// Optional — articles still generate fine without a hero image if this is unset.
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

// ---------------------------------------------------------------
// 1. Pick the next keyword from the queue
// ---------------------------------------------------------------
function getNextKeyword() {
  const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
  const next = queue.keywords.find((k) => !k.published);
  if (!next) {
    console.log("Queue exhausted — no unpublished keywords left.");
    process.exit(0);
  }
  return { queue, next };
}

// ---------------------------------------------------------------
// 2. Build the writing prompt
// ---------------------------------------------------------------
function buildPrompt(kw, recentTitles) {
  return `You are writing an SEO article for callellie.com, the website of ELLIE, an AI voice receptionist for Australian businesses.

FACTS ABOUT ELLIE (use naturally, never fabricate others):
- AI receptionist that answers business calls 24/7
- Books appointments and sends SMS confirmations automatically
- Used by 200+ Australian businesses
- Pricing starts from $199 AUD per month
- Free 7 day trial, no credit card required
- Set up within 24 hours
- Live demo at callellie.com: enter your website, Ellie learns your business, generate and test her yourself
- Built in Adelaide, South Australia

TARGET KEYWORD: "${kw.keyword}"
SEARCH INTENT: ${kw.intent}
AUDIENCE: ${kw.audience}

ALREADY-PUBLISHED ARTICLES (do not duplicate these topics, but link to them where genuinely relevant using their URLs):
${recentTitles.length ? recentTitles.map((t) => `- ${t.title} (${t.url})`).join("\n") : "- none yet"}

REQUIREMENTS:
1. 900 to 1400 words of genuinely useful content an Australian business owner would be glad they read. No fluff, no keyword stuffing.
2. Australian English spelling (organise, colour, etc). Australian context: mention AU business realities, AUD pricing, Australian examples.
3. Structure: one H1, then H2 sections, short paragraphs. Skimmable.
4. Include a natural FAQ section at the end with 3 to 4 real questions and direct answers (this is heavily quoted by AI search engines).
5. Mention ELLIE naturally 2 to 3 times where it genuinely fits the topic — as a solution, not a hard sell. One clear CTA near the end pointing to the free demo at callellie.com.
6. NEVER use em dashes anywhere. Use commas, colons, or rephrase instead.
7. Do not invent statistics. You may use widely published industry figures with soft attribution like "industry research suggests" only if they are genuinely well known (e.g. most callers who reach voicemail do not call back).
8. Write a compelling, click-worthy but honest title (max 60 chars) and a meta description (max 155 chars).
9. Write an imageQuery: a short 3 to 6 word phrase describing a realistic stock-photo scene that fits this article as a whole (e.g. "electrician answering phone call", "salon receptionist on the phone", "tradesperson on a job site"). This is used to search a stock photo library, so describe a plausible real-world scene, not an abstract concept.
10. Within bodyHtml, insert exactly 2 image placeholders at genuinely relevant points, spread apart (never right after the H1, never back to back), each inline between two existing HTML elements (e.g. right after a closing </p> and before the next <h2> or <p>) in this exact format: <!--IMG: short 3 to 6 word visual scene description-->. Each must describe a distinct real-world scene matching the section it sits in (not a repeat of imageQuery or of each other) — e.g. one near a section about after-hours calls could be "empty office phone ringing at night", one near a pricing section could be "small business owner reviewing invoice".
11. bodyHtml must be valid inside a JSON string: a single continuous string with no literal line breaks. Never press Enter inside bodyHtml, including around the IMG placeholders — keep everything on one logical line.
12. bodyHtml is itself a JSON string value, so every HTML attribute inside it (href, class, everything) MUST use single quotes, e.g. <a href='/blog/some-article.html'>, never double quotes. Double quotes inside bodyHtml will break JSON parsing.

Respond ONLY with valid JSON, no markdown fences, in exactly this shape:
{
  "title": "...",
  "metaDescription": "...",
  "slug": "lowercase-hyphenated-slug",
  "bodyHtml": "<h1>...</h1><p>...</p> ... full article body as clean HTML using h1, h2, p, ul, li, strong only",
  "faq": [{"question": "...", "answer": "..."}],
  "imageQuery": "..."
}`;
}

// ---------------------------------------------------------------
// 3. Call Claude API
// ---------------------------------------------------------------
async function generateArticle(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 6000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .replace(/```json|```/g, "")
    .trim();

  return JSON.parse(text);
}

// ---------------------------------------------------------------
// 3b. Fetch a hero image from Pexels (optional — article still
//     generates fine without one if this fails or isn't configured)
// ---------------------------------------------------------------
async function fetchHeroImage(query, usedPhotoIds) {
  if (!PEXELS_API_KEY) return null;
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`,
      { headers: { Authorization: PEXELS_API_KEY }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) {
      console.warn(`Pexels API error ${res.status} — publishing without a hero image.`);
      return null;
    }
    const data = await res.json();
    const photos = data.photos || [];
    // Similar queries across articles (e.g. "receptionist answering phone") tend to
    // rank the same stock photo first every time — skip anything already in use so
    // articles don't end up sharing an image.
    const photo = photos.find((p) => !usedPhotoIds.has(p.id)) || photos[0];
    if (!photo) return null;
    usedPhotoIds.add(photo.id); // reserve it so later picks in this same run don't repeat it
    return {
      id: photo.id,
      url: photo.src.large2x,
      alt: photo.alt || query,
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
    };
  } catch (err) {
    console.warn(`Pexels fetch failed (${err.message}) — publishing without a hero image.`);
    return null;
  }
}

function imageFigureHtml(image) {
  return `<figure class="hero-img">
      <img src="${image.url}" alt="${escapeHtml(image.alt)}" loading="lazy">
      <figcaption>Photo by <a href="${image.photographerUrl}" target="_blank" rel="noopener">${escapeHtml(image.photographer)}</a> on <a href="https://www.pexels.com" target="_blank" rel="noopener">Pexels</a></figcaption>
    </figure>`;
}

// Replaces the <!--IMG: query--> placeholders Claude sprinkles through the
// body with real Pexels photos matching that section's content. Falls back
// to silently removing the placeholder if no image can be found for it.
async function insertInlineImages(bodyHtml, usedPhotoIds) {
  const markers = [...bodyHtml.matchAll(/<!--\s*IMG:\s*(.*?)\s*-->/g)];
  let result = bodyHtml;
  for (const [placeholder, query] of markers) {
    const image = await fetchHeroImage(query, usedPhotoIds);
    result = result.replace(placeholder, image ? imageFigureHtml(image) : "");
  }
  return result;
}

// Extracts the numeric photo ID from a stored Pexels URL, e.g.
// ".../photos/8682791/pexels-photo-8682791.jpeg?..." -> 8682791
function pexelsIdFromUrl(url) {
  const match = url && url.match(/\/photos\/(\d+)\//);
  return match ? Number(match[1]) : null;
}

// ---------------------------------------------------------------
// 4. Render HTML page from template
// ---------------------------------------------------------------
function renderPage(article, kw, heroImage) {
  const template = fs.readFileSync(TEMPLATE_FILE, "utf8");
  const today = new Date().toISOString().split("T")[0];
  const url = `${SITE_URL}/blog/${article.slug}.html`;

  const heroImageHtml = heroImage ? imageFigureHtml(heroImage) : "";

  // FAQ JSON-LD — this is what gets ELLIE quoted in Google rich results
  // and picked up by AI search engines.
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: article.faq.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.metaDescription,
    datePublished: today,
    author: { "@type": "Organization", name: "ELLIE AI Receptionist" },
    publisher: { "@type": "Organization", name: "ELLIE", url: SITE_URL },
    mainEntityOfPage: url,
  };

  return template
    .replaceAll("{{TITLE}}", escapeHtml(article.title))
    .replaceAll("{{META_DESCRIPTION}}", escapeHtml(article.metaDescription))
    .replaceAll("{{CANONICAL_URL}}", url)
    .replaceAll("{{DATE}}", today)
    .replaceAll("{{DATE_DISPLAY}}", formatDate(today))
    .replaceAll("{{KEYWORD}}", escapeHtml(kw.keyword))
    .replaceAll("{{HERO_IMAGE}}", heroImageHtml)
    .replaceAll("{{BODY}}", article.bodyHtml)
    .replaceAll("{{FAQ_SCHEMA}}", JSON.stringify(faqSchema))
    .replaceAll("{{ARTICLE_SCHEMA}}", JSON.stringify(articleSchema));
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ---------------------------------------------------------------
// 5. Update blog index + sitemap
// ---------------------------------------------------------------
function updateIndex(article, heroImage) {
  const indexFile = path.join(BLOG_DIR, "index.json");
  let index = [];
  if (fs.existsSync(indexFile)) {
    index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
  }
  index.unshift({
    title: article.title,
    description: article.metaDescription,
    url: `/blog/${article.slug}.html`,
    date: new Date().toISOString().split("T")[0],
    image: heroImage ? heroImage.url : null,
  });
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
  return index;
}

function rebuildSitemap(index) {
  const urls = index
    .map(
      (a) => `  <url>
    <loc>${SITE_URL}${a.url}</loc>
    <lastmod>${a.date}</lastmod>
    <changefreq>monthly</changefreq>
  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  fs.writeFileSync(SITEMAP_FILE, xml);
}

// ---------------------------------------------------------------
// Main
// ---------------------------------------------------------------
(async () => {
  const { queue, next } = getNextKeyword();
  console.log(`Generating article for keyword: "${next.keyword}"`);

  // Gather recent titles for internal linking + de-duplication
  const indexFile = path.join(BLOG_DIR, "index.json");
  const fullIndex = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, "utf8")) : [];
  const recent = fullIndex.slice(0, 10);
  const usedPhotoIds = new Set(
    fullIndex.map((a) => pexelsIdFromUrl(a.image)).filter((id) => id !== null)
  );

  // Claude occasionally mis-escapes quotes inside the JSON string on a first
  // attempt — one retry clears most of these before we give up on the day.
  const prompt = buildPrompt(next, recent);
  let article;
  try {
    article = await generateArticle(prompt);
  } catch (err) {
    console.warn(`First attempt failed (${err.message}) — retrying once.`);
    article = await generateArticle(prompt);
  }

  // Safety: strip any em dashes the model slipped in
  article.bodyHtml = article.bodyHtml.replace(/—|–/g, ", ");
  article.title = article.title.replace(/—|–/g, ", ");
  article.metaDescription = article.metaDescription.replace(/—|–/g, ", ");

  if (!fs.existsSync(BLOG_DIR)) fs.mkdirSync(BLOG_DIR, { recursive: true });

  const heroImage = await fetchHeroImage(article.imageQuery || next.keyword, usedPhotoIds);
  article.bodyHtml = await insertInlineImages(article.bodyHtml, usedPhotoIds);

  const html = renderPage(article, next, heroImage);
  const outPath = path.join(BLOG_DIR, `${article.slug}.html`);
  fs.writeFileSync(outPath, html);
  console.log(`Wrote ${outPath}${heroImage ? " (with hero image)" : " (no hero image)"}`);

  const index = updateIndex(article, heroImage);
  rebuildSitemap(index);

  // Mark keyword as published
  next.published = true;
  next.publishedDate = new Date().toISOString().split("T")[0];
  next.slug = article.slug;
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));

  console.log(`Done: "${article.title}" published.`);
})().catch((err) => {
  console.error("Generation failed:", err.message);
  process.exit(1);
});

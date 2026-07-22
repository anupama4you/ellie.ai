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

Respond ONLY with valid JSON, no markdown fences, in exactly this shape:
{
  "title": "...",
  "metaDescription": "...",
  "slug": "lowercase-hyphenated-slug",
  "bodyHtml": "<h1>...</h1><p>...</p> ... full article body as clean HTML using h1, h2, p, ul, li, strong only",
  "faq": [{"question": "...", "answer": "..."}]
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
// 4. Render HTML page from template
// ---------------------------------------------------------------
function renderPage(article, kw) {
  const template = fs.readFileSync(TEMPLATE_FILE, "utf8");
  const today = new Date().toISOString().split("T")[0];
  const url = `${SITE_URL}/blog/${article.slug}.html`;

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
function updateIndex(article) {
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
  const recent = fs.existsSync(indexFile)
    ? JSON.parse(fs.readFileSync(indexFile, "utf8")).slice(0, 10)
    : [];

  const article = await generateArticle(buildPrompt(next, recent));

  // Safety: strip any em dashes the model slipped in
  article.bodyHtml = article.bodyHtml.replace(/—|–/g, ", ");
  article.title = article.title.replace(/—|–/g, ", ");
  article.metaDescription = article.metaDescription.replace(/—|–/g, ", ");

  if (!fs.existsSync(BLOG_DIR)) fs.mkdirSync(BLOG_DIR, { recursive: true });

  const html = renderPage(article, next);
  const outPath = path.join(BLOG_DIR, `${article.slug}.html`);
  fs.writeFileSync(outPath, html);
  console.log(`Wrote ${outPath}`);

  const index = updateIndex(article);
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

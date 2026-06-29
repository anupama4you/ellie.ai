// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

/** Fetch Jina-cleaned markdown for a URL. Returns '' on failure. */
async function fetchJina(url, timeoutMs = 7000) {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Accept: 'application/json',
        'X-Remove-Selector': 'nav,footer,header,.cookie,.popup,.overlay,.banner',
        'X-Timeout': '6',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return '';
    const j = await res.json();
    return (j.data?.content || '').replace(/\n{4,}/g, '\n\n').trim();
  } catch { return ''; }
}

/** Fetch raw HTML (for link discovery only). Returns '' on failure. */
async function fetchHtml(url, timeoutMs = 4000) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EllieBot/1.0)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok ? await res.text() : '';
  } catch { return ''; }
}

/** Score an internal URL path — higher = more likely to have business details. */
function pageScore(pathname) {
  const p = pathname.toLowerCase();
  if (/\/(contact|get-in-touch|find-us|reach-us|location)/.test(p)) return 100;
  if (/\/(about|our-story|who-we-are|team|company)/.test(p))        return 80;
  if (/\/(services|treatments|menu|what-we-do|our-work)/.test(p))   return 70;
  if (/\/(faq|pricing|book|appointment|hours)/.test(p))             return 50;
  return 0;
}

/** Pull unique internal links from raw HTML, scored by relevance. */
function discoverPages(html, origin, limit = 3) {
  const seen = new Set();
  const pages = [];
  for (const [, href] of html.matchAll(/href=["']([^"'#?]{2,})["']/gi)) {
    try {
      const u = new URL(href, origin);
      if (u.origin !== origin || seen.has(u.pathname)) continue;
      const score = pageScore(u.pathname);
      if (score === 0) continue;
      seen.add(u.pathname);
      pages.push({ url: u.href, score });
    } catch {}
  }
  return pages.sort((a, b) => b.score - a.score).slice(0, limit).map(p => p.url);
}

/** Use Claude Haiku to extract structured business info from crawled content. */
async function extractWithClaude(siteUrl, combinedContent, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 700,
      messages: [{
        role: 'user',
        content: `Extract business information from this website content for an AI phone receptionist. Return ONLY valid JSON, no markdown, no explanation.

Website: ${siteUrl}

Content from multiple pages:
${combinedContent.slice(0, 4000)}

Return this exact JSON (use empty string if unknown):
{
  "name": "full business name",
  "description": "2–3 sentences: what they do, who they serve, their speciality",
  "phone": "main phone number",
  "email": "main contact email",
  "location": "full address or suburb/city + state",
  "hours": "opening hours summary",
  "businessType": "e.g. Car Dealership, Hair Salon, Dental Clinic, Plumber",
  "services": "comma-separated list of key services or products offered",
  "bookingInfo": "how customers book — online, phone, walk-in, etc."
}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const data = await res.json();
  const raw = (data.content?.[0]?.text || '{}')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(raw);
}

// ─────────────────────────────────────────────────────────────
//  Main crawler
// ─────────────────────────────────────────────────────────────

async function crawlSite(siteUrl, anthropicKey) {
  const origin = new URL(siteUrl).origin;

  // Step 1 — fetch homepage HTML (for link discovery) + homepage Jina in parallel
  const [homeHtml, homeJina] = await Promise.all([
    fetchHtml(siteUrl),
    fetchJina(siteUrl),
  ]);

  // Step 2 — discover sub-pages from the raw HTML
  const subUrls = discoverPages(homeHtml, origin);

  // Step 3 — fetch sub-pages via Jina in parallel (renders JS, removes noise)
  const subJina = await Promise.all(subUrls.map(u => fetchJina(u, 6000)));

  // Step 4 — combine all content
  const pageSections = [
    homeJina && `=== Homepage (${siteUrl}) ===\n${homeJina}`,
    ...subUrls.map((u, i) => subJina[i] && `=== ${u} ===\n${subJina[i]}`),
  ].filter(Boolean);

  const combinedContent = pageSections.join('\n\n').slice(0, 5000);

  if (!combinedContent) {
    return { name: '', description: '', phone: '', email: '', location: '', hours: '', businessType: '', services: '', bookingInfo: '' };
  }

  // Step 5 — extract structured data with GPT-4o-mini
  try {
    const info = await extractWithClaude(siteUrl, combinedContent, anthropicKey);
    return info;
  } catch {
    // Fallback: return raw Jina snippet so at least some context exists
    return {
      name: '', description: '', phone: '', email: '', location: '',
      hours: '', businessType: '', services: '', bookingInfo: '',
      _rawContent: combinedContent.slice(0, 1500),
    };
  }
}

// ─────────────────────────────────────────────────────────────
//  Netlify handler
// ─────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  let businessWebsite;
  try { businessWebsite = JSON.parse(event.body || '{}').businessWebsite; } catch {}

  let systemPrompt, firstMessage;
  let businessName = '', businessDescription = '', businessPhone = '', businessLocation = '', businessType = '', businessServices = '', businessHours = '';

  // ── Generic demo mode ──────────────────────────────────────
  if (!businessWebsite) {
    businessName = 'Ellie AI Receptionist';
    systemPrompt = `You are Ellie — a warm, friendly AI receptionist built by New Callings (newcallings.com.au).
You are speaking with someone who called the demo line without entering their business details yet.

Your personality: warm, natural, Australian English. Never robotic. Keep responses under 35 words unless they ask for more.

Your ONLY goal on this call: get them to hang up, enter their business website or details on the page, and call back. Once you have their business details, you will act as their own receptionist — answering exactly as you would for their real customers.

How to handle the conversation:
1. Greet them warmly and explain you noticed they haven't entered their business details yet.
2. Tell them it only takes a few seconds — just pop in their website or fill in a couple of fields on the page.
3. Once they do that and call back, you'll instantly know their business and demo exactly how you'd sound to their customers — completely free.
4. If they have questions about what Ellie does: answer briefly, then bring it back to "the best way to see it is to enter your details and call me back."
5. If they ask about pricing: plans start from $99 AUD/month, no lock-in contracts.
6. At the end of the conversation — or if they seem interested — invite them to book a free 30-minute setup call at anupama.dev.

Guardrails:
- Never pretend to be their receptionist without their business details — you don't have them yet.
- If asked if you're an AI: yes, honestly — then note that most callers can't tell.
- Do not discuss competitors.`;

    firstMessage = `Hi there, I'm Ellie — an AI receptionist! I can see you haven't entered your business details yet. It only takes a few seconds — just pop in your website or fill in a couple of fields on the page, then call me back. I'll instantly act as your own receptionist and show you exactly how I'd sound to your customers, completely free!`;

  } else {
    // ── Personalised mode ──────────────────────────────────────
    const siteUrl = /^https?:\/\//i.test(businessWebsite)
      ? businessWebsite
      : `https://${businessWebsite}`;

    // Fallback name from domain while crawling
    try {
      businessName = new URL(siteUrl).hostname.replace(/^www\./i, '');
    } catch {
      businessName = String(businessWebsite).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
    }

    const info = await crawlSite(siteUrl, process.env.ANTHROPIC_API_KEY);

    if (info.name)         businessName        = info.name;
    if (info.description)  businessDescription = info.description;
    if (info.phone)        businessPhone       = info.phone;
    if (info.location)     businessLocation    = info.location;
    if (info.businessType) businessType        = info.businessType;
    if (info.services)     businessServices    = info.services;
    if (info.hours)        businessHours       = info.hours;

    // Build receptionist context
    const contextLines = [];
    if (info.description)  contextLines.push(info.description);
    if (info.businessType) contextLines.push(`Business type: ${info.businessType}`);
    if (info.services)     contextLines.push(`Services: ${info.services}`);
    if (info.phone)        contextLines.push(`Phone: ${info.phone}`);
    if (info.email)        contextLines.push(`Email: ${info.email}`);
    if (info.location)     contextLines.push(`Location: ${info.location}`);
    if (info.hours)        contextLines.push(`Hours: ${info.hours}`);
    if (info.bookingInfo)  contextLines.push(`Booking: ${info.bookingInfo}`);
    if (info._rawContent)  contextLines.push(`\nWebsite content:\n${info._rawContent}`);
    if (!contextLines.length) contextLines.push(`Website: ${siteUrl}`);

    systemPrompt = `You are Ellie, the AI receptionist for ${businessName}. You are on a live call with a customer.

Business context:
${contextLines.join('\n')}

Persona: Warm, professional, calm under pressure. Speak in natural Australian English. Never sound robotic.

How to handle calls:
- Greet: "Thanks for calling ${businessName}, this is Ellie. How can I help you today?"
- For bookings: collect name, phone number, preferred date/time, and reason. Confirm back to them.
- For questions answerable from the context above: answer confidently and briefly.
- For questions you cannot answer: "I'll make sure the team gets back to you on that — can I take your name and number?"
- For after-hours enquiries: "We're closed right now but I can take your details and the team will call you first thing."
- If directly asked if you're an AI: be honest, then reassure them you can still fully help.

Keep responses under 45 words unless the caller asks for more detail. Never make up pricing, hours, or services not in the context above.`;

    firstMessage = `Thanks for calling ${businessName}, this is Ellie. How can I help you today?`;
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      publicKey:   process.env.VAPI_PUBLIC_KEY,
      assistantId: process.env.VAPI_WEB_ASSISTANT_ID,
      assistantOverrides: {
        firstMessage,
        model: {
          provider: 'openai',
          model:    'gpt-4o',
          messages: [{ role: 'system', content: systemPrompt }],
        },
        voice: {
          provider: '11labs',
          voiceId:  'cgSgspJ2msm6clMCkdW9',
        },
        transcriber: {
          provider: 'deepgram',
          model:    'nova-2',
          language: 'en-AU',
        },
      },
      businessName,
      businessDescription,
      businessPhone,
      businessLocation,
      businessType,
      businessServices,
      businessHours,
    }),
  };
};

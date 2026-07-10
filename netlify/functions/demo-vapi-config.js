// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

const { normalizeWebsiteUrl, fetchWebsiteContent, getBusinessWebsiteInput } = require('./_website-fetch');

/** Use Claude Haiku to extract structured business info. */
async function extractWithClaude(siteUrl, content, apiKey) {
  if (!apiKey) throw new Error('Missing Anthropic API key');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    signal: AbortSignal.timeout(5000),
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Extract business information from this website content for an AI phone receptionist. Return ONLY valid JSON, no markdown, no explanation.

Website: ${siteUrl}

Content:
${content.slice(0, 4000)}

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
//  Main crawler — fetches the site content and uses Claude when available
// ─────────────────────────────────────────────────────────────

async function crawlSite(siteUrl, anthropicKey) {
  const normalizedSiteUrl = normalizeWebsiteUrl(siteUrl) || siteUrl;
  const fetched = await fetchWebsiteContent(normalizedSiteUrl, { timeoutMs: 5000 });
  const content = fetched.content || '';

  if (!content) {
    return {
      name: '', description: '', phone: '', email: '', location: '', hours: '', businessType: '', services: '', bookingInfo: '',
      _rawContent: '',
      _metadata: fetched.metadata,
    };
  }

  try {
    const extracted = anthropicKey ? await extractWithClaude(normalizedSiteUrl, content, anthropicKey) : {};
    return {
      ...extracted,
      _rawContent: content.slice(0, 1500),
      _metadata: fetched.metadata,
    };
  } catch {
    return {
      name: '', description: '', phone: '', email: '', location: '',
      hours: '', businessType: '', services: '', bookingInfo: '',
      _rawContent: content.slice(0, 1500),
      _metadata: fetched.metadata,
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

  const businessWebsite = getBusinessWebsiteInput(event);

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
5. If they ask about pricing: plans start from $199 AUD/month, no lock-in contracts.
6. At the end of the conversation — or if they seem interested — invite them to request a free callback.

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

    try {
      businessName = new URL(siteUrl).hostname.replace(/^www\./i, '');
    } catch {
      businessName = String(businessWebsite).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
    }

    const info = await crawlSite(siteUrl, process.env.ANTHROPIC_API_KEY);

    if (info.name || info._metadata?.title) businessName = info.name || info._metadata.title;
    if (info.description)  businessDescription = info.description;
    if (info.phone)        businessPhone       = info.phone;
    if (info.location)     businessLocation    = info.location;
    if (info.businessType) businessType        = info.businessType;
    if (info.services)     businessServices    = info.services;
    if (info.hours)        businessHours       = info.hours;

    const contextLines = [];
    if (info.description)  contextLines.push(info.description);
    if (info._metadata?.description) contextLines.push(`About the business: ${info._metadata.description}`);
    if (info.businessType) contextLines.push(`Business type: ${info.businessType}`);
    if (info.services)     contextLines.push(`Services: ${info.services}`);
    if (info.phone)        contextLines.push(`Phone: ${info.phone}`);
    if (info.email)        contextLines.push(`Email: ${info.email}`);
    if (info.location)     contextLines.push(`Location: ${info.location}`);
    if (info.hours)        contextLines.push(`Hours: ${info.hours}`);
    if (info.bookingInfo)  contextLines.push(`Booking: ${info.bookingInfo}`);
    if (info._rawContent)  contextLines.push(`\nWebsite content:\n${info._rawContent}`);
    if (!contextLines.length) contextLines.push(`Website: ${siteUrl}`);

    systemPrompt = `You are Ellie, the AI receptionist for ${businessName}. This is a live demo call — the person calling is trying Ellie out to see how she'd sound to their own customers, so stay fully in character as ${businessName}'s receptionist for the entire call.

Business context:
${contextLines.join('\n')}

Persona: Warm, professional, calm under pressure. Speak in natural Australian English. Never sound robotic.

How to handle calls:
- Greet: "Thanks for calling ${businessName}, this is Ellie. How can I help you today?"
- For bookings: collect their first name, then say "We have tomorrow at 9:00am, 10:30am, or 2:00pm available — which works best for you?" Once they choose, treat their phone number as already known from the call — don't ask for it, and don't read digits back; just refer to it naturally.
- Once you have their name and preferred time, confidently wrap it up as done: "You're all booked in — I'll send a text confirmation to your number shortly." This is a simulated demo booking with no real calendar or SMS system behind it, so never mention checking a system, a tool, or "let me look that up" — always speak as though the booking and text message genuinely happened.
- For questions answerable from the context above: answer confidently and briefly.
- For questions you cannot answer from the context: "I'll make sure the team gets back to you on that soon."
- For after-hours enquiries: still answer politely, offer to book them in for tomorrow using the same flow above, and let them know ${businessName} is currently closed.
- If directly asked if you're an AI: be honest, then reassure them you can still fully help.
- Always end the call by pitching Ellie for their own business: "If you'd like to have me as your own receptionist, you can request a free callback down below."

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

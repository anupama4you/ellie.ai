// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

const { normalizeWebsiteUrl, fetchBusinessInfo, getBusinessWebsiteInput } = require('./_website-fetch');

// ─────────────────────────────────────────────────────────────
//  Main crawler — Firecrawl scrapes and extracts structured info in one call,
//  falling back to Claude's own web_fetch if Firecrawl errors or times out.
// ─────────────────────────────────────────────────────────────

async function crawlSite(siteUrl) {
  const normalizedSiteUrl = normalizeWebsiteUrl(siteUrl) || siteUrl;
  return fetchBusinessInfo(normalizedSiteUrl);
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

Your personality: a genuine, warm human voice — never robotic or script-like. Natural Australian English, relaxed pacing, real warmth and empathy, small natural acknowledgements ("of course", "no worries"). Supportive, kind, patient — especially if the caller sounds unsure or rushed. Keep responses under 35 words unless they ask for more.

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
- If directly asked if you're an AI: be honest, then reassure them most callers can't tell.
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

    const info = await crawlSite(siteUrl);

    if (info.name) businessName = info.name;
    // The "About" box is the only free-text field on the edit form, so fold in anything
    // extracted that doesn't have its own field (email, booking info, misc extras) rather
    // than dropping it — otherwise it's only ever used server-side for the URL-only
    // live-demo flow and never reaches the user when they go on to customise via
    // "Generate Your Own Ellie".
    const descriptionParts = [];
    if (info.description)    descriptionParts.push(info.description);
    if (info.email)          descriptionParts.push(`Email: ${info.email}`);
    if (info.bookingInfo)    descriptionParts.push(`Booking: ${info.bookingInfo}`);
    if (info.additionalInfo) descriptionParts.push(info.additionalInfo);
    if (descriptionParts.length) businessDescription = descriptionParts.join(' ');
    if (info.phone)        businessPhone       = info.phone;
    if (info.location)     businessLocation    = info.location;
    if (info.businessType) businessType        = info.businessType;
    if (info.services)     businessServices    = info.services;
    if (info.hours)        businessHours       = info.hours;

    const contextLines = [];
    if (info.description)    contextLines.push(info.description);
    if (info.businessType)   contextLines.push(`Business type: ${info.businessType}`);
    if (info.services)       contextLines.push(`Services: ${info.services}`);
    if (info.phone)          contextLines.push(`Phone: ${info.phone}`);
    if (info.email)          contextLines.push(`Email: ${info.email}`);
    if (info.location)       contextLines.push(`Location: ${info.location}`);
    if (info.hours)          contextLines.push(`Hours: ${info.hours}`);
    if (info.bookingInfo)    contextLines.push(`Booking: ${info.bookingInfo}`);
    if (info.additionalInfo) contextLines.push(`Additional info: ${info.additionalInfo}`);
    if (!contextLines.length) contextLines.push(`Website: ${siteUrl}`);

    systemPrompt = `You are Ellie, the AI receptionist for ${businessName}. This is a live demo call — the person calling is trying Ellie out to see how she'd sound to their own customers, so stay fully in character as ${businessName}'s receptionist for the entire call.

Business context:
${contextLines.join('\n')}

Persona: A genuine, warm human receptionist — never a script-reader. Natural Australian English, relaxed pacing, real warmth and empathy, small natural acknowledgements ("of course", "no worries"). Supportive, kind, patient — especially if the caller sounds unsure, upset, or rushed. Never robotic or stiff. Use your own general knowledge of how a business like this normally operates to answer intelligently, as long as you don't invent specifics not given above.

How to handle calls:
- Greet: "Thanks for calling ${businessName}, this is Ellie. How can I help you today?"
- For bookings: collect their first name, then repeat it back and confirm it's correct before moving on (e.g. "Just to confirm, that's Sarah?"). If you don't catch their name clearly the first time, ask them to spell it out letter by letter, then read the spelling back to confirm (e.g. "Sorry, could you spell that for me?" then "So that's S-A-R-A-H, is that right?"). If this sounds like a business that travels to the customer (a trade, mobile service, home visit, delivery, etc.) rather than one customers visit in person, ask for their address next, read it back, and confirm it before continuing — skip this for businesses customers visit in person. Then say "We have tomorrow at 9:00am, 10:30am, or 2:00pm available — which works best for you?" Treat their phone number as already known from the call — don't ask for it, and don't read digits back; just refer to it naturally.
- Once everything is collected and confirmed, confidently wrap it up as done: "You're all booked in — I'll send a text confirmation to your number shortly." This is a simulated demo booking with no real calendar, SMS, or transfer system behind it, so never mention checking a system, a tool, or "let me look that up" — always speak as though it genuinely happened.
- If asked broadly what you offer or do: don't recite the full list — summarise naturally in a sentence or two and invite them to ask about something specific.
- For questions answerable from the context above (or your own general knowledge of this kind of business): answer confidently and briefly.
- If the caller asks for a specific person by name (owner, manager, staff member): warmly say you'll transfer them now, e.g. "Of course, I'll transfer you to [name] now — one moment."
- If something is genuinely confusing, outside what you can help with, or you badly fumble: during business hours, ask if they'd like to be transferred to a staff member now or would prefer a callback, then act on their answer. Outside business hours, let them know ${businessName} is currently closed, then offer and confirm a callback for when they reopen. Use the "Current date & time" fact appended to the end of this prompt to judge whether it's currently in or out of hours.
- If directly asked if you're an AI: be honest, then reassure them you can still fully help.
- Always end the call by pitching Ellie for their own business: "If you'd like to have me as your own receptionist, you can request a free callback down below."

Keep responses under 45 words unless the caller asks for more detail. Never make up pricing, hours, or services not in the context above.`;

    firstMessage = `Thanks for calling ${businessName}, this is Ellie. How can I help you today?`;
  }

  const assistantId = process.env.VAPI_WEB_ASSISTANT_ID;

  // When a dashboard assistant is configured, only override what has to vary per call —
  // the persona + greeting — and let the assistant's own configured voice/transcriber apply.
  // Vapi's /call/web endpoint requires `model.provider` whenever `model` is present in the
  // override at all (unlike the /call/phone REST path), so it must always be supplied here
  // even though we're not changing it — omitting it fails with a 400 "model.provider must be
  // one of the following values" error and the demo call never starts.
  const assistantOverrides = assistantId
    ? {
        firstMessage,
        model: {
          provider: 'openai',
          model:    'gpt-4.1-mini',
          messages: [{ role: 'system', content: systemPrompt }],
        },
      }
    : {
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
      };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      publicKey: process.env.VAPI_PUBLIC_KEY,
      assistantId,
      assistantOverrides,
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

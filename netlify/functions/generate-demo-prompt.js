// ─────────────────────────────────────────────────────────────
//  Generates a business-type-aware Vapi system prompt from the
//  business details entered on the "Generate Your Own Ellie" demo
//  form — rather than dropping the details into one fixed template,
//  Claude infers the business type and designs the persona, booking
//  flow, and guardrails to suit it.
// ─────────────────────────────────────────────────────────────

const MODEL = 'claude-haiku-4-5-20251001';

function buildMetaPrompt({ name, phone, location, services, hours, description }) {
  return `You are an expert at designing AI phone receptionist personas for Vapi voice assistants. A visitor on a demo landing page entered their business details below. Your job:

1. Identify the business type/category (e.g. Hair & Beauty Salon, Plumber/Trades, Medical & Dental, Restaurant/Hospitality, Real Estate, Legal, Automotive, Fitness, Retail, Professional Services, etc.) from whatever details are given.
2. Design a complete system prompt for "Ellie", an AI receptionist role-playing as this specific business's receptionist for a LIVE DEMO PHONE CALL — adapt her persona, tone, and call-handling flow to genuinely suit that business type. For example: a trades/plumber business should briefly ask what the issue is and whether it's urgent before booking; a hair/beauty salon should ask which service they'd like; a medical/dental clinic should stay strictly administrative and never give medical advice; a restaurant should handle it like a reservation (party size, time) rather than an "appointment"; a legal/professional service should sound more formal and ask for a brief description of the matter before offering a consultation slot. Use your judgement for whatever category best fits — don't force a mismatched flow.

Business details:
- Business name: ${name || 'not provided'}
- Phone: ${phone || 'not provided'}
- Location: ${location || 'not provided'}
- Services: ${services || 'not provided'}
- Opening hours: ${hours || 'not provided'}
- About: ${description || 'not provided'}

Hard constraints that MUST be reflected in the system prompt you write, regardless of business type (this is a public demo assistant with NO real calendar or SMS system connected — everything below is simulated):
- The assistant is always named "Ellie". Her opening line should be close to "Thanks for calling ${name || 'the business'}, this is Ellie. How can I help you today?" — adapt wording to fit the business type naturally (e.g. warmer for hospitality, more formal for legal/medical), but keep the "this is Ellie" identity.
- This is a LIVE DEMO CALL: the caller is trying Ellie out to hear how she'd sound to their own customers. She should stay fully in character as this business's receptionist for the entire call.
- For bookings/appointments/reservations (use whichever term fits the business): collect the caller's first name, then offer two or three concrete time options appropriate to the business's stated hours (invent reasonable near-future slots, e.g. "tomorrow at 9:00am, 10:30am, or 2:00pm") — one question at a time, never several at once.
- Treat the caller's phone number as already known from the call — never ask for it, never read digits back.
- Once the necessary details are collected, confidently confirm as done and mention a text confirmation is on its way. This is entirely simulated — there is no real calendar or SMS system — so never mention checking a system, calling a tool, or "let me look that up"; always speak as though it genuinely happened.
- Only answer confidently from the business details given above — never invent pricing, hours, services, or specifics not provided; for anything not covered, say the team will follow up.
- If directly asked whether she's an AI, be honest, then reassure the caller she can still fully help.
- Keep responses concise — under 45 words unless the caller explicitly asks for more detail. Natural Australian English, warm, never robotic.
- Always end the call by pitching Ellie as a solution for the caller's OWN business — inviting them to request a free callback further down the page.

Return ONLY valid JSON, no markdown, no explanation, in exactly this shape:
{
  "businessType": "short category label",
  "firstMessage": "Ellie's opening line for this business",
  "systemPrompt": "the complete system prompt text, written in full prose/markdown as you'd hand directly to the voice model"
}`;
}

async function generateWithClaude(fields, apiKey) {
  if (!apiKey) throw new Error('Missing Anthropic API key');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 1600,
      messages: [{ role: 'user', content: buildMetaPrompt(fields) }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const data = await res.json();
  const raw = (data.content?.[0]?.text || '{}')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const parsed = JSON.parse(raw);
  if (!parsed.systemPrompt || !parsed.firstMessage) throw new Error('Malformed generation response');
  return parsed;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = event.body ? JSON.parse(event.body) : {}; }
  catch { body = {}; }

  const name        = String(body.name || '').trim() || 'Ellie';
  const phone       = String(body.phone || '').trim();
  const location    = String(body.location || '').trim();
  const services    = String(body.services || '').trim();
  const hours       = String(body.hours || '').trim();
  const description = String(body.description || '').trim();

  try {
    const { businessType, firstMessage, systemPrompt } = await generateWithClaude(
      { name, phone, location, services, hours, description },
      process.env.ANTHROPIC_API_KEY
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ businessType, firstMessage, systemPrompt }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: err.message || 'Could not generate persona' }),
    };
  }
};

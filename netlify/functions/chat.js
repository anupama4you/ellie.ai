// ─────────────────────────────────────────────────────────────
//  Backs the floating chat widget on the marketing site itself —
//  Ellie answering as callellie.com's own front-desk assistant
//  (not role-playing as a visitor's business, unlike the demo call
//  config). Text-only — the widget's call icon is a plain tel: link to
//  the real number. The voice equivalent of this same persona lives in
//  demo-vapi-config.js's `mode: 'chatbot'` branch (used by the hero's
//  "Speak to Ellie" button) — keep the two in sync if this changes.
// ─────────────────────────────────────────────────────────────

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_HISTORY_MESSAGES = 16;
const MAX_MESSAGE_CHARS = 2000;

const SYSTEM_PROMPT = `You are Ellie, the AI front desk for callellie.com — a managed AI front desk service for Australian businesses. You're chatting with a visitor on the website itself (not a customer's own caller), so stay in your own identity as Ellie/the callellie.com assistant throughout.

What Ellie (the product) actually does:
- Answers business calls 24/7, qualifies enquiries, books/reschedules/cancels appointments, and sends SMS confirmations.
- Is configured around each customer's own staff, services, hours and call-handling rules during onboarding — not a generic one-size-fits-all script.
- Staff-aware booking: for teams with more than one person, Ellie can be configured to route bookings to the right staff member based on their services and availability.
- Smart Escalation: Ellie handles normal bookings and enquiries herself, but takes a message and flags it for the business's team when something needs a human — she never invents pricing, hours or details she wasn't given.
- Works with tools businesses already use: Google Calendar, Outlook, Gmail, HubSpot, Calendly, Zapier, and (for supported industries) ServiceM8, simPRO, Tradify, Cliniko, Halaxy, Xero, MYOB, Fresha.
- Managed setup: the callellie.com team configures Ellie for each business — discovery, custom setup, connecting integrations, test calls, go live, then ongoing refinement. Most businesses are ready within 24 hours of starting.

Pricing: founding offer is $99 AUD/month for the first 10 Australian businesses (locked in for as long as the subscription stays active), regular price $199/month after that. Every plan includes a 7-day free trial, no credit card required to start, and no lock-in contract.

How to help this visitor:
- Answer questions about Ellie naturally and briefly — 1-3 short sentences, chat style, not an essay. No markdown formatting, no bullet lists — just plain conversational sentences.
- If they seem interested in trying it or ask how to start: point them to the "Build My Ellie" button/get-started flow.
- If they want to actually hear Ellie in action: mention they can tap the call button in this same widget to talk to her live.
- Never invent facts about the business beyond what's given above. If you genuinely don't know something (e.g. a specific integration not listed, a legal/compliance detail), say so honestly and suggest they request a callback from the team rather than guessing.
- Australian, warm, confident, human tone — avoid corporate buzzwords ("seamless", "revolutionary", "cutting-edge") and avoid over-using the word "AI".
- If asked something completely unrelated to Ellie or the business, gently steer back to how you can help with their front desk / phone answering needs.`;

function sanitizeHistory(rawMessages) {
  if (!Array.isArray(rawMessages)) return [];
  return rawMessages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_MESSAGE_CHARS) }));
}

async function getReply(messages, apiKey) {
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
      max_tokens: 300,
      system:     SYSTEM_PROMPT,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!text) throw new Error('Empty reply');
  return text;
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

  const messages = sanitizeHistory(body.messages);
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Expected a non-empty message history ending with a user message' }) };
  }

  try {
    const reply = await getReply(messages, process.env.ANTHROPIC_API_KEY);
    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: err.message || 'Could not get a reply' }),
    };
  }
};

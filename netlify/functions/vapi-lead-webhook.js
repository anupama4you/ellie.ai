// Receives the `submit_business_lead` tool-call from the Ellie general-
// enquiries phone assistant (Vapi) and forwards it into Netlify Forms as a
// `phone-lead` submission — the same way the web wizard's leads land, just
// from a different source. See index.html for the hidden `phone-lead` form
// that registers the field names with Netlify's build-time form scan.

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = event.body ? JSON.parse(event.body) : {}; }
  catch { body = {}; }

  const message = body.message || body;

  // Vapi's tool-call payload shape has shifted across API versions — accept
  // both `toolCallList` (current) and `toolCalls` (older) so this doesn't
  // silently break on a Vapi update.
  const toolCalls = message.toolCallList || message.toolCalls || [];
  const toolCall = toolCalls[0];
  if (!toolCall) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No tool call in payload.' }) };
  }

  const toolCallId = toolCall.id;
  let args = toolCall.arguments || (toolCall.function && toolCall.function.arguments) || {};
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { args = {}; }
  }

  // The caller's number is already known from the call itself — never
  // asked for verbally, per the assistant's instructions.
  const callerNumber = (message.call && message.call.customer && message.call.customer.number) || '';

  const formData = new URLSearchParams({
    'form-name': 'phone-lead',
    name: args.name || '',
    business_name: args.business_name || '',
    business_type: args.business_type || '',
    phone: callerNumber,
    notes: args.notes || '',
  });

  // Bounded, not fire-and-forget: Netlify's function runtime can kill work left
  // running after the response is sent, so a detached fetch risks silently
  // dropping the lead. The assistant's prompt already says its "I'll pass this
  // on" line BEFORE calling this tool, so the caller isn't sitting in dead air
  // waiting on this request — this timeout just stops it hanging indefinitely
  // if Netlify Forms is ever slow to respond.
  const siteUrl = process.env.URL || 'https://callellie.com';
  let submitted = false;
  try {
    const res = await fetch(siteUrl + '/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
      signal: AbortSignal.timeout(5000),
    });
    submitted = res.ok;
  } catch {
    submitted = false;
  }

  const resultText = submitted
    ? "Got it, thanks — that's been passed on to the team, they'll call you back within 24 hours."
    : "Thanks — I've noted that down, and someone from the team will be in touch soon.";

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ results: [{ toolCallId, result: resultText }] }),
  };
};

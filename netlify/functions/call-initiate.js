const { normalizeWebsiteUrl, fetchBusinessInfo, getBusinessWebsiteInput } = require('./_website-fetch');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const privateKey    = process.env.VAPI_PRIVATE_KEY;
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER;
  const assistantId   = process.env.VAPI_ASSISTANT_ID;

  if (!privateKey || !phoneNumberId || !assistantId) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ error: 'Live call demo is being set up — use the contact form to book a real demo.' }),
    };
  }

  let body;
  try { body = event.body ? JSON.parse(event.body) : {}; }
  catch { body = {}; }

  const { phone, businessType } = body;
  const businessWebsite = getBusinessWebsiteInput(event) || body.businessWebsite || '';
  if (!phone) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Phone number is required.' }) };

  // Build assistant overrides when a business website is supplied
  let assistantOverrides;
  if (businessWebsite && businessWebsite.trim()) {
    const siteUrl = /^https?:\/\//i.test(businessWebsite.trim())
      ? businessWebsite.trim()
      : `https://${businessWebsite.trim()}`;

    let businessContext = `The business website provided is: ${siteUrl}.`;
    let businessName;
    try {
      businessName = new URL(siteUrl).hostname.replace(/^www\./i, '');
    } catch {
      businessName = String(businessWebsite).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].split('?')[0];
    }

    try {
      const normalizedSiteUrl = normalizeWebsiteUrl(siteUrl) || siteUrl;
      // Tighter budget than demo-vapi-config's default (15s) — this handler still needs to
      // make the VAPI call below, so it can't use the full Netlify function timeout. Firecrawl
      // gets first crack, falling back to Claude's web_fetch with whatever budget remains.
      const info = await fetchBusinessInfo(normalizedSiteUrl, { timeoutMs: 9000, firecrawlTimeoutMs: 5000 });

      if (info.name || info.description || info.phone || info.services) {
        const parts = [];
        if (info.name) {
          businessName = info.name;
          parts.push(`Business name / brand: "${info.name}"`);
        }
        if (info.description)    parts.push(`About the business: ${info.description}`);
        if (info.businessType)   parts.push(`Business type: ${info.businessType}`);
        if (info.services)       parts.push(`Services: ${info.services}`);
        if (info.phone)          parts.push(`Business phone found on site: ${info.phone}`);
        if (info.hours)          parts.push(`Hours: ${info.hours}`);
        if (info.additionalInfo) parts.push(info.additionalInfo);
        parts.push(`Website: ${normalizedSiteUrl}`);

        businessContext = parts.join('. ');
      }
    } catch (_) {
      // Timeout or fetch error — fall back to URL-only context
    }

    assistantOverrides = {
      firstMessage: `Thanks for calling ${businessName}, this is Ellie. How can I help?`,
      model: {
        messages: [
          {
            role: 'system',
            content:
              `You are Ellie, the front-desk receptionist for this specific business. ${businessContext} ` +
              `Critical behaviour: act as this business's receptionist, not as a generic Ellie demo. ` +
              `Open with "Thanks for calling ${businessName}, this is Ellie. How can I help?" ` +
              `Answer only from the business context and the caller's words. ` +
              `If the caller asks about services, bookings, pricing, hours or location and the context does not contain the exact answer, take their details and offer to pass the message to the team. ` +
              `Collect the caller's name, phone number, reason for calling, and preferred time when handling a booking or enquiry. ` +
              `Use natural, concise Australian English.`,
          },
        ],
      },
    };
  }

  try {
    const callBody = {
      assistantId,
      phoneNumberId,
      customer: { number: phone },
    };
    if (assistantOverrides) callBody.assistantOverrides = assistantOverrides;

    const res = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${privateKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(callBody),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'VAPI error');

    return { statusCode: 200, headers, body: JSON.stringify({ status: 'calling', callId: data.id }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

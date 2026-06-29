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
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request.' }) }; }

  const { phone, businessType, businessWebsite } = body;
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
      const siteRes = await fetch(siteUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EllieAI/1.0; +https://newcallings.com)' },
        signal: AbortSignal.timeout(5000),
      });

      if (siteRes.ok) {
        const html = await siteRes.text();

        const extract = (patterns) => {
          for (const re of patterns) {
            const m = html.match(re);
            if (m && m[1] && m[1].trim()) return m[1].trim().slice(0, 300);
          }
          return '';
        };

        const title = extract([
          /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
          /<title[^>]*>([^<]+)<\/title>/i,
        ]);

        const desc = extract([
          /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
          /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
        ]);

        const phone_raw = extract([
          /(?:tel:|phone:|call us)[:\s"'>]*([+\d\s\-().]{7,20})/i,
        ]);

        const parts = [];
        if (title) {
          businessName = title;
          parts.push(`Business name / brand: "${title}"`);
        }
        if (desc)  parts.push(`About the business: ${desc}`);
        if (phone_raw) parts.push(`Business phone found on site: ${phone_raw}`);
        parts.push(`Website: ${siteUrl}`);

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

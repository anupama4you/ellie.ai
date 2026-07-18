const crypto = require('crypto');

const PIXEL_ID = process.env.META_PIXEL_ID || '1377367451165227';

// Meta requires PII sent to the Conversions API to be pre-hashed (unlike the
// browser pixel, which hashes em/ph itself before it ever leaves the page).
function sha256(value) {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!accessToken) return { statusCode: 503, headers, body: JSON.stringify({ error: 'Conversions API is not configured.' }) };

  let body;
  try { body = event.body ? JSON.parse(event.body) : {}; }
  catch { body = {}; }

  const { em, ph, eventId, eventSourceUrl, fbp, fbc } = body;
  if (!eventId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'eventId is required.' }) };

  const userData = {};
  if (em) userData.em = [sha256(em)];
  if (ph) userData.ph = [sha256(ph)];
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const clientIp = (event.headers['x-nf-client-connection-ip'] || (event.headers['x-forwarded-for'] || '').split(',')[0]).trim();
  if (clientIp) userData.client_ip_address = clientIp;
  if (event.headers['user-agent']) userData.client_user_agent = event.headers['user-agent'];

  const payload = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: eventSourceUrl,
      action_source: 'website',
      user_data: userData,
    }],
    access_token: accessToken,
  };
  // Lets events show up under Test Events in Meta Events Manager without
  // affecting the real audience — set META_TEST_EVENT_CODE while verifying.
  if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${PIXEL_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data.error && data.error.message) || 'Meta Conversions API error');

    return { statusCode: 200, headers, body: JSON.stringify({ status: 'ok' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

const services = new Set(['Exterior window cleaning', 'Gutter cleaning', 'Solar panel cleaning']);
const MAX_BYTES = 12_000;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function configured(env, url) {
  return url.hostname === env.CONTACT_HOSTNAME && Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY && env.RESEND_API_KEY && env.FROM_EMAIL && env.CONTACT_TO_EMAIL);
}

export function onRequestGet({ request, env }) {
  return configured(env, new URL(request.url))
    ? json({ siteKey: env.TURNSTILE_SITE_KEY })
    : json({ error: 'Online quotes are unavailable. Please call 021 026 33673.' }, 503);
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  if (!configured(env, url)) return onRequestGet({ request, env });
  if (request.headers.get('Origin') !== url.origin) return json({ error: 'Please submit from the quote form.' }, 403);
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/x-www-form-urlencoded') {
    return json({ error: 'Unsupported form submission.' }, 415);
  }

  let fields;
  try {
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let body = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return json({ error: 'Request is too long.' }, 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    fields = new URLSearchParams(body + decoder.decode());
  } catch {
    return json({ error: 'Could not read the request.' }, 400);
  }
  const field = key => (fields.get(key) || '').trim();
  const name = field('name'), email = field('email'), phone = field('phone'), offering = field('offering'), message = field('message');
  const token = field('cf-turnstile-response');
  if (!name || name.length > 120 || message.length < 10 || message.length > 1000 || (!email && !phone) ||
      (offering && !services.has(offering)) || (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
      (phone && (!/^[\d+().\s-]{6,50}$/.test(phone) || phone.replace(/\D/g, '').length < 6))) {
    return json({ error: 'Check your name, contact details, service and message.' }, 422);
  }
  if (!token || token.length > 2048) return json({ error: 'Please complete the security check.' }, 403);

  let stage = 'Turnstile';
  try {
    const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }), signal: AbortSignal.timeout(7000),
    });
    if (!check.ok) throw new Error(`HTTP ${check.status}`);
    const result = await check.json();
    if (!result.success || result.action !== 'quote' || result.hostname !== url.hostname) {
      return json({ error: 'Security check failed. Please try again.' }, 403);
    }

    const requestType = offering || 'General Enquiry';
    const subject = `Uncles Windows | ${requestType}`;
    const text = `Uncles Windows · Auckland\n\nRequest Type: ${requestType}\nName: ${name}\nEmail: ${email || 'Not provided'}\nPhone: ${phone || 'Not provided'}\n\nCustomer Message\n${message}`;
    const html = quoteEmail({ requestType, name, email, phone, message });
    stage = 'Resend';
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'UnclesWindows/1.0' },
      body: JSON.stringify({ from: env.FROM_EMAIL, to: [env.CONTACT_TO_EMAIL], ...(email ? { reply_to: email } : {}), subject, text, html }),
      signal: AbortSignal.timeout(8000),
    });
    if (!sent.ok) throw new Error(`HTTP ${sent.status}`);
    return json({ ok: true });
  } catch (error) {
    console.warn('Quote submission failed', stage, /^HTTP \d{3}$/.test(error.message) ? error.message : 'request failed');
    return json({ error: 'We couldn’t confirm your request. Please try again or call 021 026 33673.' }, 502);
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function quoteEmail({ requestType, name, email, phone, message }) {
  return `<div style="background:#f4f2ee;padding:24px 12px;color:#171d24;font:16px/1.5 Arial,sans-serif">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:24px">
    <div style="text-align:center;border-bottom:1px solid #ddd;padding-bottom:20px">
      <img src="https://uncleswindows.connectar.co.nz/assets/email-starburst.png" alt="" width="110" height="100" style="display:block;margin:0 auto 8px">
      <div style="font-size:22px;font-weight:bold">Uncles Windows</div>
      <div style="color:#595959">Auckland · Website enquiry</div>
    </div>
    <h2 style="font-size:17px;margin:20px 0 4px">Request Type</h2>
    <p style="margin:0 0 16px">${escapeHtml(requestType)}</p>
    <h2 style="font-size:17px;margin:0 0 4px">Contact Details</h2>
    <p style="margin:0 0 20px"><strong>Name:</strong> ${escapeHtml(name)}<br><strong>Email:</strong> ${escapeHtml(email || 'Not provided')}<br><strong>Phone:</strong> ${escapeHtml(phone || 'Not provided')}</p>
    <div style="background:#f4f2ee;border-radius:10px;padding:16px;overflow-wrap:anywhere">
      <h2 style="font-size:17px;margin:0 0 8px">Customer Message</h2>
      <p style="margin:0">${escapeHtml(message).replace(/\r?\n/g, '<br>')}</p>
    </div>
  </div>
</div>`;
}

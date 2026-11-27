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

  try {
    const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }), signal: AbortSignal.timeout(7000),
    });
    if (!check.ok) throw new Error('Verification unavailable');
    const result = await check.json();
    if (!result.success || result.action !== 'quote' || result.hostname !== url.hostname) {
      return json({ error: 'Security check failed. Please try again.' }, 403);
    }

    const subject = `Uncles Windows quote request: ${offering || 'General enquiry'}`;
    const text = `Uncles Windows · Auckland\n\n${subject}\nName: ${name}\nEmail: ${email || 'Not provided'}\nPhone: ${phone || 'Not provided'}\n\n${message}`;
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.FROM_EMAIL, to: [env.CONTACT_TO_EMAIL], ...(email ? { reply_to: email } : {}), subject, text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!sent.ok) throw new Error('Delivery provider rejected the request');
    return json({ ok: true });
  } catch {
    return json({ error: 'We couldn’t confirm your request. Please try again or call 021 026 33673.' }, 502);
  }
}

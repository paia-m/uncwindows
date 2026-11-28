import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from '../functions/contact.js';

const host = 'uncleswindows.co.nz';
const oldHost = 'uncleswindows.connectar.co.nz';
const origin = `https://${host}`;
const env = { CONTACT_HOSTNAME: `${host}, ${oldHost}`, TURNSTILE_SITE_KEY: 'sample-site', TURNSTILE_SECRET_KEY: 'sample-secret', RESEND_API_KEY: 'sample-key', FROM_EMAIL: 'sender@example.test', CONTACT_TO_EMAIL: 'operator@example.test', CONTACT_BCC_EMAIL: 'copy@example.test' };
const fields = { name: 'Sample', email: 'customer@example.test', offering: 'Gutter cleaning', message: 'Could you quote on my gutters?', 'cf-turnstile-response': 'sample-token' };
function send(data = fields, source = origin, config = env) {
  return onRequestPost({ env: config, request: new Request(`${origin}/contact`, { method: 'POST', headers: { Origin: source }, body: new URLSearchParams(data) }) });
}

test('only configured hostnames expose a site key', async () => {
  assert.deepEqual(await onRequestGet({ env, request: new Request(`${origin}/contact`) }).json(), { siteKey: 'sample-site' });
  assert.equal(onRequestGet({ env, request: new Request(`https://${oldHost}/contact`) }).status, 200);
  assert.equal(onRequestGet({ env, request: new Request('https://preview.pages.dev/contact') }).status, 503);
  assert.equal((await send(fields, origin, { ...env, CONTACT_TO_EMAIL: '' })).status, 503);
});

test('rejects a foreign origin, invalid fields, missing challenge and oversized request', async () => {
  assert.equal((await send(fields, 'https://elsewhere.example')).status, 403);
  assert.equal((await send({ ...fields, name: '  ' })).status, 422);
  assert.equal((await send({ ...fields, email: '' })).status, 422);
  assert.equal((await send({ ...fields, offering: 'Other' })).status, 422);
  assert.equal((await send({ ...fields, storeys: '12' })).status, 422);
  assert.equal((await send({ ...fields, 'cf-turnstile-response': '' })).status, 403);
  assert.equal((await send({ ...fields, message: 'x'.repeat(13000) })).status, 413);
});

test('verifies the challenge, fixes the recipient, and reports provider failure honestly', async t => {
  let check = { success: true, hostname: host, action: 'quote' };
  let delivery = 200;
  const messages = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url.startsWith('https://challenges.cloudflare.com/')) return Response.json(check);
    assert.equal(url, 'https://api.resend.com/emails');
    messages.push(JSON.parse(init.body));
    return new Response('', { status: delivery });
  });
  check.hostname = oldHost;
  assert.equal((await send()).status, 403);
  assert.equal(messages.length, 0);
  check.hostname = host;
  assert.deepEqual(await (await send({ ...fields, message: '<b>Sample</b>\nSecond line', storeys: '2 Storey', to: 'wrong@example.test' })).json(), { ok: true });
  assert.deepEqual(messages[0].to, [env.CONTACT_TO_EMAIL]);
  assert.deepEqual(messages[0].bcc, [env.CONTACT_BCC_EMAIL]);
  assert.equal(messages[0].reply_to, fields.email);
  assert.equal(messages[0].subject, 'Uncles Windows | Gutter cleaning | Sample');
  assert.match(messages[0].text, /Request Type: Gutter cleaning/);
  assert.match(messages[0].html, /Request Type:<\/strong> Gutter cleaning<br>/);
  assert.match(messages[0].html, /email-starburst\.png/);
  assert.match(messages[0].html, /Customer Message/);
  assert.match(messages[0].text, /Property height: 2 Storey/);
  assert.match(messages[0].html, /Property height:<\/strong> 2 Storey/);
  assert.match(messages[0].html, /&lt;b&gt;Sample&lt;\/b&gt;<br>Second line/);
  assert.equal((await send({ ...fields, email: '', phone: '021 111 2222', message: '' })).status, 200);
  assert.equal(messages[1].reply_to, undefined);
  assert.match(messages[1].text, /No message provided/);
  delivery = 429;
  assert.equal((await send()).status, 502);
});

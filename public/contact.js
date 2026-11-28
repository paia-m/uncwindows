const form = document.querySelector('#contact-form');
const status = document.querySelector('#quote-status');
const button = form.querySelector('button');
const offering = form.elements.offering;
const { phone, email } = form.elements;
const contactError = document.querySelector('#contact-method-error');

for (const field of [phone, email]) {
  field.addEventListener('input', () => {
    if (phone.value.trim() || email.value.trim()) contactError.textContent = '';
  });
}
let widget;
let busy = false;

for (const link of document.querySelectorAll('.service-cta[data-offering]')) {
  link.addEventListener('click', () => { offering.value = link.dataset.offering; });
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || button.disabled) return;
  if (!form.elements.name.value.trim()) {
    status.textContent = 'Enter your name.';
    form.elements.name.focus();
    return;
  }
  if (!email.value.trim() && !phone.value.trim()) {
    contactError.textContent = 'Please enter a phone number or an email address so we can reply.';
    phone.focus();
    return;
  }

  busy = true;
  button.disabled = true;
  status.textContent = 'Sending your request…';
  try {
    const response = await fetch('/contact', {
      method: 'POST', body: new URLSearchParams(new FormData(form)), signal: AbortSignal.timeout(18000),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'Could not send');
    form.reset();
    status.textContent = 'Quote request sent. Thanks for getting in touch.';
  } catch {
    status.textContent = 'We couldn’t confirm your request. Try again or call 021 026 33673.';
  } finally {
    busy = false;
    window.turnstile.reset(widget);
  }
});

async function init() {
  try {
    const response = await fetch('/contact', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Not configured');
    const { siteKey } = await response.json();
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    widget = window.turnstile.render('#quote-turnstile', {
      sitekey: siteKey, action: 'quote', size: 'flexible',
      callback: () => { button.disabled = busy; },
      'expired-callback': () => { button.disabled = true; },
      'error-callback': () => {
        button.disabled = true;
        status.textContent = 'Security check didn’t load. Refresh or call 021 026 33673.';
      },
    });
    form.querySelector('fieldset').disabled = false;
    status.textContent = '';
  } catch {
    status.textContent = 'Online quotes are unavailable. Please call 021 026 33673.';
  }
}

init();

/* =============================================================
   CSPC Reservation Portal - cookie consent banner
   Loaded on every page AFTER app.js (standalone-safe: touches
   window.PortalCookieConsent only, no Portal dependency).

   The portal currently sets ONE essential cookie (cspc.sid) that
   keeps users signed in - it cannot be disabled. This banner lets
   users ACCEPT or DECLINE optional cookies (e.g. future analytics).
   The choice is stored in localStorage so the banner shows only
   once, and can be reopened via the "Cookie settings" footer link.
   ============================================================= */
'use strict';

(function () {
  const STORAGE_KEY = 'portal-cookie-consent';
  const VALID_CHOICES = ['accepted', 'declined'];

  function readChoice() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return VALID_CHOICES.indexOf(value) !== -1 ? value : null;
    } catch (err) {
      return null; // storage blocked (private mode) -> always treat as undecided
    }
  }

  function saveChoice(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (err) { /* private mode: session-only */ }
  }

  let banner = null;

  function choose(value) {
    saveChoice(value);
    hide();
    // Lets future code (e.g. an analytics loader) react to the decision.
    document.dispatchEvent(new CustomEvent('cookie-consent-change', { detail: { choice: value } }));
  }

  function ensureBanner() {
    if (banner) return banner;

    banner = document.createElement('div');
    banner.className = 'cookie-consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.setAttribute('aria-live', 'polite');

    const inner = document.createElement('div');
    inner.className = 'cookie-consent-inner';

    const title = document.createElement('strong');
    title.className = 'cookie-consent-title';
    title.textContent = 'Cookies on this portal';

    const text = document.createElement('span');
    text.className = 'cookie-consent-text';
    text.textContent =
      'We use cookies to keep you signed in and to remember your choices. ' +
      'Essential cookies are always active because the portal cannot work without them. ' +
      'With your consent, we may also use cookies to understand how the site is used and improve your experience.';

    const actions = document.createElement('div');
    actions.className = 'cookie-consent-actions';

    const declineBtn = document.createElement('button');
    declineBtn.type = 'button';
    declineBtn.className = 'btn btn-outline-cspc btn-sm';
    declineBtn.textContent = 'Decline';
    declineBtn.addEventListener('click', function () { choose('declined'); });

    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.className = 'btn btn-cspc btn-sm';
    acceptBtn.textContent = 'Accept cookies';
    acceptBtn.addEventListener('click', function () { choose('accepted'); });

    actions.appendChild(declineBtn);
    actions.appendChild(acceptBtn);
    inner.appendChild(title);
    inner.appendChild(text);
    inner.appendChild(actions);
    banner.appendChild(inner);
    document.body.appendChild(banner);
    return banner;
  }

  function show() {
    ensureBanner().hidden = false;
    // Next frame so the slide-in transition actually runs.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { banner.classList.add('is-visible'); });
    });
  }

  function hide() {
    if (!banner) return;
    banner.classList.remove('is-visible');
    setTimeout(function () { banner.hidden = true; }, 260); // after the slide-out
  }

  function addFooterLink() {
    document.querySelectorAll('.portal-footer').forEach(function (footer) {
      if (footer.querySelector('.cookie-settings-link')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cookie-settings-link';
      btn.textContent = 'Cookie settings';
      btn.addEventListener('click', function () {
        try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
        show();
      });
      footer.appendChild(document.createTextNode(' \u00b7 '));
      footer.appendChild(btn);
    });
  }

  function init() {
    addFooterLink();
    if (!readChoice()) show();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PortalCookieConsent = {
    get: readChoice,
    accept: function () { choose('accepted'); },
    decline: function () { choose('declined'); },
    reset: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
      show();
    }
  };
})();

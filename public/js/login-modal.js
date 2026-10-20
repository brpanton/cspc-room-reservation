/* =============================================================
   CSPC Reservation - modal login card component
   Wires #login-card-modal: User/Admin role segment, validation,
   /api/auth/login submit, Google SSO handoff, and a small
   window.LoginCard open/close API.

   Works two ways:
     1. Alongside app.js (site convention) - uses window.Portal
        helpers (api, busy, toastOk) when present.
     2. Standalone - falls back to fetch + local busy state, so the
        snippet can be dropped into any page with Bootstrap 5.

   Load AFTER bootstrap.bundle.min.js (and app.js, if available).
   ============================================================= */
(function () {
  'use strict';

  const modalEl = document.getElementById('login-card-modal');
  if (!modalEl) return;

  const P = window.Portal || {};

  /* --- element handles -------------------------------------------------- */
  const form = document.getElementById('login-card-form');
  const alertBox = document.getElementById('login-card-alert');
  const submitBtn = document.getElementById('login-card-submit');
  const identifierInput = document.getElementById('login-card-identifier');
  const passwordInput = document.getElementById('login-card-password');
  const identifierLabel = document.getElementById('login-card-identifier-label');
  const roleButtons = Array.from(modalEl.querySelectorAll('[data-login-card-role]'));
  const ssoBtn = document.getElementById('login-card-sso-google');
  const createAccountRow = modalEl.querySelector('.login-card-footer');

  let loginMode = 'user';

  /* --- bootstrap modal instance (with a no-Bootstrap fallback) ---------- */
  const bsModal = window.bootstrap ? bootstrap.Modal.getOrCreateInstance(modalEl) : null;

  function open() {
    if (bsModal) bsModal.show();
    else {
      modalEl.classList.add('show');
      modalEl.style.display = 'block';
      modalEl.removeAttribute('aria-hidden');
      document.body.classList.add('modal-open');
      tintBackdrop();
    }
  }

  function close() {
    if (bsModal) bsModal.hide();
    else {
      modalEl.classList.remove('show');
      modalEl.style.display = '';
      modalEl.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
      clearBackdropTint();
    }
  }

  /* --- glassmorphism backdrop: Bootstrap paints it as a sibling of the
       modal, so the tint class has to be applied from JS. ---------------- */
  function tintBackdrop() {
    document.querySelectorAll('.modal-backdrop').forEach((el) => {
      el.classList.add('login-card-backdrop');
    });
  }

  function clearBackdropTint() {
    document.querySelectorAll('.modal-backdrop.login-card-backdrop').forEach((el) => {
      el.classList.remove('login-card-backdrop');
    });
  }

  modalEl.addEventListener('show.bs.modal', () => requestAnimationFrame(tintBackdrop));
  modalEl.addEventListener('shown.bs.modal', tintBackdrop);
  modalEl.addEventListener('hidden.bs.modal', clearBackdropTint);

  /* --- inline alerts (same look as every other alert in the portal) ----- */
  function showAlert(message, type) {
    if (!alertBox) return;
    alertBox.className = `login-card-alert alert alert-${type || 'danger'}`;
    alertBox.textContent = message;
  }

  function hideAlert() {
    if (alertBox) alertBox.className = 'login-card-alert d-none';
  }

  /* --- role segment: User Login / Admin Login --------------------------- */
  function applyRole(mode) {
    const nextMode = mode === 'admin' ? 'admin' : 'user';
    const roleChanged = nextMode !== loginMode;
    loginMode = nextMode;
    const isAdmin = loginMode === 'admin';

    hideAlert();
    // The User/Admin tabs share one form, so clear typed credentials when
    // the role actually changes — keeps user details out of the admin login.
    if (roleChanged) {
      [identifierInput, passwordInput].filter(Boolean).forEach((input) => {
        input.value = '';
        input.classList.remove('is-invalid');
      });
    }
    modalEl.classList.toggle('login-card-admin', isAdmin);
    roleButtons.forEach((button) => {
      const active = button.dataset.loginCardRole === loginMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    if (identifierLabel) {
      identifierLabel.textContent = isAdmin
        ? 'Admin ID or CSPC email address'
        : 'School ID or CSPC email address';
    }
    if (identifierInput) {
      identifierInput.placeholder = isAdmin
        ? 'Enter your Admin ID or Email'
        : 'e.g. 2021-00123 or name@cspc.edu.ph';
    }
    // Admins are provisioned / enrolled — never show self-registration.
    if (createAccountRow) createAccountRow.classList.toggle('d-none', isAdmin);
  }

  roleButtons.forEach((button) => {
    button.addEventListener('click', () => applyRole(button.dataset.loginCardRole));
  });

  /* --- busy state: prefer the shared Portal helper, else local ---------- */
  function setBusy(button, isBusy, label) {
    if (P.busy) {
      P.busy(button, isBusy, label || 'Working...');
      return;
    }
    if (!button) return;
    if (isBusy) {
      button.dataset.idleHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>${label || 'Working...'}`;
    } else {
      button.disabled = false;
      if (button.dataset.idleHtml) button.innerHTML = button.dataset.idleHtml;
    }
  }

  /* --- POST helper: Portal.api when available, plain fetch otherwise ---- */
  async function postJson(path, payload) {
    if (P.api) return P.api(path, { method: 'POST', body: payload });
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Something went wrong. Please try again.');
    return data;
  }

  /* --- form submit: validate then POST /api/auth/login ------------------- */
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideAlert();

    const identifier = identifierInput.value.trim();
    const password = passwordInput.value;

    if (!identifier || !password) {
      if (!identifier) identifierInput.classList.add('is-invalid');
      if (!password) passwordInput.classList.add('is-invalid');
      return showAlert(
        loginMode === 'admin'
          ? 'Enter your admin ID or email and password.'
          : 'Enter your school ID or CSPC email and password.'
      );
    }

    // Combined field: anything with "@" is treated as an email address.
    if (identifier.includes('@')) {
      const lowered = identifier.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lowered)) {
        identifierInput.classList.add('is-invalid');
        return showAlert('Enter a valid email address (e.g. name@cspc.edu.ph).');
      }
      if (loginMode !== 'admin' && !/@(my\.)?cspc\.edu\.ph$/i.test(lowered)) {
        identifierInput.classList.add('is-invalid');
        return showAlert('Please use your official @cspc.edu.ph or @my.cspc.edu.ph email address.');
      }
    }

    setBusy(submitBtn, true, 'Signing in...');
    try {
      const payload = { password, login_type: loginMode };
      if (identifier.includes('@')) payload.email = identifier.toLowerCase();
      else payload.school_id = identifier;

      const result = await postJson('/api/auth/login', payload);
      if (P.toastOk) P.toastOk(result.message || 'Welcome back!');
      const go = P.redirectTo || ((url) => window.location.assign(url));
      setTimeout(() => go(result.redirect || '/dashboard.html'), 500);
    } catch (err) {
      showAlert(err.message);
      setBusy(submitBtn, false);
    }
  });

  // Typing clears the red border + any stale error.
  [identifierInput, passwordInput].filter(Boolean).forEach((input) => {
    input.addEventListener('input', () => {
      input.classList.remove('is-invalid');
      hideAlert();
    });
  });

  /* --- Google SSO: identical handoff to index.html / home.html ----------
       The server owns the OAuth details (/api/auth/google builds the
       consent-screen URL and verifies the callback); this only gates on the
       { configured } flag so an unprovisioned server keeps its friendly
       notice instead of redirecting. Falls back to plain fetch when the
       snippet runs without app.js. */
  ssoBtn?.addEventListener('click', async () => {
    try {
      const cfg = P.api
        ? await P.api('/api/auth/google/config')
        : await fetch('/api/auth/google/config', { headers: { Accept: 'application/json' } }).then((r) => r.json());
      if (!cfg || !cfg.configured) {
        const message = 'Google sign-in is not configured yet. Please use your school ID and password until the SSO provider is set up.';
        if (P.toastInfo) P.toastInfo(message);
        else showAlert(message, 'warning');
        return;
      }
      setBusy(ssoBtn, true, 'Opening Google...');
      const type = loginMode === 'admin' ? 'admin' : 'user';
      window.location.assign(`/api/auth/google?type=${type}&return=home`);
    } catch {
      const message = 'Unable to start Google sign-in right now. Please try again or use your school ID and password.';
      if (P.toastInfo) P.toastInfo(message);
      else showAlert(message, 'warning');
    }
  });

  /* --- reset when the card reopens on a different role ------------------ */
  modalEl.addEventListener('hidden.bs.modal', () => {
    hideAlert();
    [identifierInput, passwordInput].filter(Boolean).forEach((input) => input.classList.remove('is-invalid'));
  });

  applyRole('user');

  /* --- public API + convenience triggers -------------------------------- */
  window.LoginCard = {
    open,
    close,
    setRole: applyRole,
    getRole: () => loginMode,
  };

  // Any element with data-login-card-open="1" opens the card.
  document.querySelectorAll('[data-login-card-open]').forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      open();
    });
  });
})();



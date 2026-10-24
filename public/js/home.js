/* Public homepage: shared navigation and live campus building highlights. */
'use strict';

(async function () {
  const P = window.Portal;

  /* Building background images for the featured "Popular spaces" cards.
   * Each building card renders with its own photo instead of a flat tone. */
  const BUILDING_BACKGROUNDS = {
    'CCS BUILDING': '/img/640fd213-b190-4dd5-85ac-f5e48efaa979.jpg',
    'CAS BUILDING': '/img/86d642c7-aab7-4114-85ec-75a84ae1b8c0.jpg',
    'GREENBUILDING': '/img/430ad98a-b78e-4c54-b0fa-803c6eed5ef3.jpg',
    'ACADEMIC BUILDING II': '/img/6073d9fd-be4f-4d55-bc84-bde51aa8db51.jpg',
    'ACADEMIC BUILDING I': '/img/79f0c07c-b23e-4644-9550-536b84c2f5b4.jpg',
    'MULTI PURPOSE BUILDING': '/img/fc87102f-d288-4b44-81f1-022acfccb7c6.jpg',
    'MULTI PORPUSE BUILDING': '/img/fc87102f-d288-4b44-81f1-022acfccb7c6.jpg',
    'CHS BUILDING': '/img/e4edc818-0707-48a1-87d1-cb81125f6ee4.jpg',
    'CITD BUILDING': '/img/cookery-lab.jpg',
    'LSB BUILDING': '/img/chemistry-lab.jpg'
  };

  const session = await P.getSession();
  P.renderNavbar(session.user, 'home');

  const primaryAction = document.getElementById('home-primary-action');
  if (session.authenticated && primaryAction) {
    primaryAction.removeAttribute('data-bs-toggle');
    primaryAction.removeAttribute('data-bs-target');
    primaryAction.classList.remove('btn');
    primaryAction.outerHTML = `<a class="btn btn-cspc btn-lg" id="home-primary-action" href="${session.user.role === 'admin' ? '/admin-dashboard.html' : '/dashboard.html'}">${session.user.role === 'admin' ? 'Open admin dashboard â†’' : 'Open your dashboard â†’'}</a>`;
  }

  const loginModalEl = document.getElementById('visitor-login-modal');
  const registerModalEl = document.getElementById('visitor-register-modal');
  const loginModal = loginModalEl ? new bootstrap.Modal(loginModalEl) : null;
  const registerModal = registerModalEl ? new bootstrap.Modal(registerModalEl) : null;
  const loginForm = document.getElementById('visitor-login-form');
  const loginAlert = document.getElementById('visitor-login-alert');
  const loginSubmit = document.getElementById('visitor-login-submit');
  const loginIdLabel = document.getElementById('visitor-login-id-label');
  const loginIdInput = document.getElementById('visitor-login-id');
  const createAccountRow = document.querySelector('#visitor-login-view .visitor-auth-switch');
  let loginMode = 'user';

  function applyLoginMode(mode) {
    const modeChanged = mode !== loginMode;
    loginMode = mode;
    // The User/Admin tabs share one form, so clear typed credentials when
    // switching roles â€” keeps user login details out of the admin login.
    if (modeChanged) {
      const passwordInput = document.getElementById('visitor-login-password');
      [loginIdInput, passwordInput].filter(Boolean).forEach((input) => {
        input.value = '';
        input.classList.remove('is-invalid');
      });
    }
    document.querySelectorAll('[data-visitor-login-mode]').forEach((item) => {
      const active = item.dataset.visitorLoginMode === mode;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    loginIdLabel.textContent = 'CSPC email address';
    loginIdInput.placeholder = 'Enter your CSPC email address (e.g. name@cspc.edu.ph)';
    loginIdInput.setAttribute('type', 'email');
    loginIdInput.setAttribute('inputmode', 'email');
    loginSubmit.textContent = loginMode === 'admin' ? 'Login' : 'Log in';
    loginAlert.classList.add('d-none');
    // Admins are provisioned / enrolled â€” never show self-registration.
    if (createAccountRow) createAccountRow.classList.toggle('d-none', loginMode === 'admin');
  }

  function showAlert(host, message, type = 'danger') {
    host.className = `alert alert-${type} mt-3`;
    host.textContent = message;
    host.classList.remove('d-none');
  }

  document.querySelectorAll('[data-visitor-login-mode]').forEach((button) => {
    button.addEventListener('click', () => applyLoginMode(button.dataset.visitorLoginMode));
  });

  applyLoginMode('user');

  // One-click Google SSO handoff â€” the server owns the OAuth details: it
  // builds the consent-screen URL (with a CSRF state nonce) and verifies the
  // callback at /api/auth/google[/callback]. Until GOOGLE_CLIENT_ID/SECRET
  // are set in .env the config endpoint reports { configured: false }, so the
  // button keeps its friendly "not configured" notice instead of redirecting.
  const visitorSsoBtn = document.getElementById('visitor-sso-google');
  if (visitorSsoBtn) {
    visitorSsoBtn.addEventListener('click', async () => {
      try {
        const cfg = await P.api('/api/auth/google/config');
        if (!cfg.configured) {
          P.toastInfo('Google sign-in is not configured yet. Please use your school ID and password until the SSO provider is set up.');
          return;
        }
        P.busy(visitorSsoBtn, true, 'Opening Google...');
        const type = loginMode === 'admin' ? 'admin' : 'user';
        window.location.assign(`/api/auth/google?type=${type}&return=home`);
      } catch {
        P.toastInfo('Unable to start Google sign-in right now. Please try again or use your school ID and password.');
      }
    });
  }

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginAlert.classList.add('d-none');
    const email = loginIdInput.value.trim().toLowerCase();
    const password = document.getElementById('visitor-login-password').value;
    if (!email || !password) {
      return showAlert(loginAlert, 'Enter your CSPC email address and password.');
    }
    if (!/@(my\.)?cspc\.edu\.ph$/i.test(email)) {
      return showAlert(loginAlert, 'Please use your official @cspc.edu.ph or @my.cspc.edu.ph email address.');
    }

    P.busy(loginSubmit, true, loginMode === 'admin' ? 'Authenticating...' : 'Signing in...');
    try {
      const payload = { email, password, login_type: loginMode };
      const result = await P.api('/api/auth/login', { method: 'POST', body: payload });
      P.toastOk(result.message || 'Welcome back!');
      window.location.assign(result.redirect || '/dashboard.html');
    } catch (err) {
      showAlert(loginAlert, err.message);
      P.busy(loginSubmit, false);
    }
  });

  /* ---------------------------------------------- password recovery ---
     The login modal doubles as a 3-step recovery flow (email -> OTP ->
     new password) so visitors never leave the page. Backend lives in
     routes/password-reset.js, mounted under /api/auth. */
  const authViewTitles = {
    login: 'Log in to your account',
    forgot: 'Reset your password',
    otp: 'Verify your email',
    reset: 'Choose a new password'
  };
  const authViews = {
    login: document.getElementById('visitor-login-view'),
    forgot: document.getElementById('visitor-forgot-view'),
    otp: document.getElementById('visitor-otp-view'),
    reset: document.getElementById('visitor-reset-view')
  };
  const authTitle = document.getElementById('visitor-login-title');
  const forgotLink = document.getElementById('visitor-forgot-link');

  const forgotForm = document.getElementById('visitor-forgot-form');
  const forgotAlert = document.getElementById('visitor-forgot-alert');
  const forgotSubmit = document.getElementById('visitor-forgot-submit');
  const forgotEmail = document.getElementById('visitor-forgot-email');

  const otpForm = document.getElementById('visitor-otp-form');
  const otpAlert = document.getElementById('visitor-otp-alert');
  const otpSubmit = document.getElementById('visitor-otp-submit');
  const otpInput = document.getElementById('visitor-otp-input');
  const otpEmailEcho = document.getElementById('visitor-otp-email');
  const otpResend = document.getElementById('visitor-otp-resend');
  const resetEmailEcho = document.getElementById('visitor-reset-email');

  const resetForm = document.getElementById('visitor-reset-form');
  const resetAlert = document.getElementById('visitor-reset-alert');
  const resetSubmit = document.getElementById('visitor-reset-submit');
  const resetPassword = document.getElementById('visitor-reset-password');
  const resetConfirm = document.getElementById('visitor-reset-confirm');

  const RESEND_SECONDS = 60;
  /** The email the visitor typed (may be primary or recovery email). */
  let recoveryEmail = '';
  /** Ground-truth primary login email from the server (users.email). */
  let primaryAccountEmail = '';
  /** Database primary key of the account being reset (users.id). */
  let resetUserId = '';
  /** Role scope of the active reset flow: 'user' tab or 'admin' tab. */
  let resetAccountKind = 'user';
  let resetToken = '';
  let resendTimer = null;

  function stopResendTimer() {
    if (resendTimer) {
      window.clearInterval(resendTimer);
      resendTimer = null;
    }
  }

  /* Live MM:SS countdown on the "Resend code" button (disabled until 0). */
  function startResendCountdown(seconds = RESEND_SECONDS) {
    stopResendTimer();
    let left = seconds;
    const render = () => {
      if (!otpResend) return;
      if (left > 0) {
        otpResend.disabled = true;
        otpResend.textContent = `Resend code in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      } else {
        otpResend.disabled = false;
        otpResend.textContent = 'Resend code';
      }
    };
    render();
    resendTimer = window.setInterval(() => {
      left -= 1;
      render();
      if (left <= 0) stopResendTimer();
    }, 1000);
  }

  /* Shows one recovery view (or the login view) and updates the title. */
  function setAuthView(name) {
    Object.entries(authViews).forEach(([key, el]) => {
      if (el) el.classList.toggle('d-none', key !== name);
    });
    if (authTitle) authTitle.textContent = authViewTitles[name] || authViewTitles.login;
    [forgotAlert, otpAlert, resetAlert].forEach((el) => el && el.classList.add('d-none'));
    if (name !== 'otp') stopResendTimer();
    const firstInput = { forgot: forgotEmail, otp: otpInput, reset: resetPassword }[name];
    if (firstInput) window.setTimeout(() => firstInput.focus(), 150);
  }

  forgotLink?.addEventListener('click', () => {
    // Open the forgot view with a completely blank recovery email field â€”
    // never pre-fill it from the login input. Capture the active login tab
    // (User vs Admin) so the reset is scoped to that account kind.
    forgotEmail.value = '';
    resetAccountKind = loginMode === 'admin' ? 'admin' : 'user';
    setAuthView('forgot');
  });

  document.querySelectorAll('[data-visitor-auth-view]').forEach((button) => {
    button.addEventListener('click', () => setAuthView(button.dataset.visitorAuthView));
  });

  /* --- step 1: ask the server to send a code ------------------------- */
  forgotForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    forgotAlert.classList.add('d-none');
    const email = String(forgotEmail.value || '').trim().toLowerCase();
    if (!email) {
      return showAlert(forgotAlert, 'Enter your recovery email address.');
    }
    P.busy(forgotSubmit, true, 'Sending code...');
    try {
      const result = await P.api('/api/auth/forgot-password', { method: 'POST', body: { email, account_kind: resetAccountKind } });
      recoveryEmail = email;                     // what the visitor typed
      primaryAccountEmail = result.login_email;  // ground-truth primary login email from server
      resetUserId = result.user_id;              // database primary key (users.id)
      if (result.account_kind) resetAccountKind = result.account_kind;
      resetToken = '';
      otpInput.value = '';
      // Echo where the code was sent: recovery inbox or official CSPC email.
      const deliveryTo = result.delivery_to;
      if (otpEmailEcho) {
        otpEmailEcho.textContent = deliveryTo === 'recovery' ? 'your recovery email' : 'your official CSPC email';
        otpEmailEcho.classList.toggle('text-primary-emphasis', true);
      }
      if (resetEmailEcho) {
        resetEmailEcho.textContent = primaryAccountEmail;
      }
      setAuthView('otp');
      startResendCountdown();
      if (result.email_delivery === 'console') {
        // Dev fallback: SMTP is not configured, so no email actually left
        // the server - the OTP was printed to the server console instead.
        showAlert(otpAlert, 'Heads up: email delivery is not configured on this server, so no email was sent. The 6-digit code was printed in the server console - check with the developer for the code.', 'warning');
      } else {
        // result.message is worded by the server to match the actual inbox
        // (recovery email vs official CSPC email).
        showAlert(otpAlert, result.message || 'A 6-digit code was sent to your email.', 'info');
      }
    } catch (err) {
      // Stay on the email step so the visitor can fix the address.
      showAlert(forgotAlert, err.message);
    } finally {
      P.busy(forgotSubmit, false);
    }
  });

  /* Resend: managed manually (not via P.busy) so the countdown stays in
     control of the button label; always restart the cooldown afterwards,
     even when the server answers with its 60s rate-limit message. */
  otpResend?.addEventListener('click', async () => {
    if (!recoveryEmail || otpResend.disabled) return;
    otpResend.disabled = true;
    try {
      const result = await P.api('/api/auth/forgot-password', { method: 'POST', body: { email: recoveryEmail, account_kind: resetAccountKind } });
      if (result.login_email) primaryAccountEmail = result.login_email;
      if (result.user_id) resetUserId = result.user_id;
      if (result.account_kind) resetAccountKind = result.account_kind;
      if (result.login_email) primaryAccountEmail = result.login_email;
      if (result.user_id) resetUserId = result.user_id;
      if (resetEmailEcho && primaryAccountEmail) resetEmailEcho.textContent = primaryAccountEmail;
      otpInput.value = '';
      if (result.email_delivery === 'console') {
        showAlert(otpAlert, 'Email delivery is not configured on this server, so no email was sent. The new code was printed in the server console.', 'warning');
      } else {
        showAlert(otpAlert, result.message || 'A new code was sent to your email.', 'info');
      }
    } catch (err) {
      showAlert(otpAlert, err.message);
    } finally {
      startResendCountdown();
    }
  });

  /* --- step 2: verify the 6-digit code -------------------------------- */
  otpInput?.addEventListener('input', () => {
    const digits = String(otpInput.value).replace(/\D/g, '').slice(0, 6);
    if (digits !== otpInput.value) otpInput.value = digits;
    // Convenience: submit the moment the 6th digit lands.
    if (digits.length === 6) otpForm.requestSubmit();
  });

  otpForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    otpAlert.classList.add('d-none');
    const otp = String(otpInput.value).trim();
    if (!/^\d{6}$/.test(otp)) return showAlert(otpAlert, 'Enter the 6-digit code from your email.');
    if (!recoveryEmail) return setAuthView('forgot');
    P.busy(otpSubmit, true, 'Verifying...');
    try {
      const result = await P.api('/api/auth/verify-otp', { method: 'POST', body: { identifier: recoveryEmail, otp } });
      resetToken = result.reset_token || '';
      otpInput.value = '';
      setAuthView('reset');
    } catch (err) {
      showAlert(otpAlert, err.message);
      otpInput.value = '';
      otpInput.focus();
    } finally {
      P.busy(otpSubmit, false);
    }
  });

  /* --- step 3: set the new password ----------------------------------- */
  resetForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    resetAlert.classList.add('d-none');
    const password = resetPassword.value;
    const confirm = resetConfirm.value;
    if (password.length < 8) return showAlert(resetAlert, 'Password must be at least 8 characters long.');
    if (password !== confirm) return showAlert(resetAlert, 'Passwords do not match.');
    if (!resetToken || !resetUserId) return setAuthView('forgot');
    P.busy(resetSubmit, true, 'Saving...');
    try {
      const result = await P.api('/api/auth/reset-password', {
        method: 'POST',
        body: {
          user_id: resetUserId,
          reset_token: resetToken,
          new_password: password,
          confirm_password: confirm
        }
      });
      P.toastOk(result.message || 'Your password has been reset. You can now log in.');
      // Land back on the login view with the primary account email ready to type into.
      forgotForm?.reset();
      otpInput.value = '';
      resetForm.reset();
      if (loginIdInput) loginIdInput.value = primaryAccountEmail;
      recoveryEmail = '';
      primaryAccountEmail = '';
      resetUserId = '';
      resetToken = '';
      setAuthView('login');
    } catch (err) {
      showAlert(resetAlert, err.message);
    } finally {
      P.busy(resetSubmit, false);
    }
  });

  // A fresh open always starts from the login view; closing mid-flow clears
  // the countdown timer and any half-entered recovery state.
  loginModalEl?.addEventListener('show.bs.modal', () => setAuthView('login'));
  loginModalEl?.addEventListener('hidden.bs.modal', () => {
    stopResendTimer();
    recoveryEmail = '';
    primaryAccountEmail = '';
    resetUserId = '';
    resetToken = '';
    forgotForm?.reset();
    if (otpInput) otpInput.value = '';
    resetForm?.reset();
    setAuthView('login');
  });

  const registerForm = document.getElementById('visitor-register-form');
  const registerAlert = document.getElementById('visitor-register-alert');
  const registerSubmit = document.getElementById('visitor-register-submit');

  /* -------------------------------------------------- admin registration --- */
  // The admin "Create account" uses its own modal/layout: the login footer
  // link routes here whenever the Admin Login segment is active.
  const adminRegisterModalEl = document.getElementById('visitor-admin-register-modal');
  const adminRegisterModal = adminRegisterModalEl ? new bootstrap.Modal(adminRegisterModalEl) : null;
  const adminRegisterForm = document.getElementById('visitor-admin-register-form');
  const adminRegisterAlert = document.getElementById('visitor-admin-register-alert');
  const adminRegisterSubmit = document.getElementById('visitor-admin-register-submit');

  document.getElementById('visitor-login-create-account')?.addEventListener('click', () => {
    (loginMode === 'admin' ? adminRegisterModal : registerModal)?.show();
  });

  adminRegisterForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    adminRegisterAlert.classList.add('d-none');
    const form = event.currentTarget;
    const schoolId = form.elements.school_id.value.trim().toUpperCase();
    const fullName = form.elements.full_name.value.trim();
    const email = form.elements.email.value.trim().toLowerCase();
    const password = form.elements.password.value;
    const recoveryEmail = form.elements.recovery_email.value.trim();
    if (!/^[A-Z]{3,5}-[A-Z0-9]{4,12}$/.test(schoolId)) return showAlert(adminRegisterAlert, 'Admin ID must match a secure format such as ADMIN-0001.');
    if (fullName.length < 3 || fullName.length > 120) return showAlert(adminRegisterAlert, 'Full name must be between 3 and 120 characters.');
    if (!/@(my\.)?cspc\.edu\.ph$/i.test(email)) return showAlert(adminRegisterAlert, 'Admin email must use the @cspc.edu.ph or @my.cspc.edu.ph domain.');
    if (!form.elements.enrollment_code.value.trim()) return showAlert(adminRegisterAlert, 'Enter the enrollment code issued by a Super Admin.');
    if (password.length < 8 || password.length > 72) return showAlert(adminRegisterAlert, 'Password must be between 8 and 72 characters.');
    if (password !== form.elements.confirm_password.value) return showAlert(adminRegisterAlert, 'The two passwords do not match.');

    P.busy(adminRegisterSubmit, true, 'Creating admin account...');
    try {
      const result = await P.api('/api/auth/register-admin', {
        method: 'POST',
        body: {
          school_id: schoolId,
          full_name: fullName,
          email,
          password,
          admin_level: form.elements.admin_level.value,
          department: form.elements.department.value.trim() || 'Administration',
          enrollment_code: form.elements.enrollment_code.value.trim(),
          ...(recoveryEmail ? { recovery_email: recoveryEmail } : {})
        }
      });
      adminRegisterModal.hide();
      P.toastOk(result.message || 'Administrator account created.');
      // No session yet â€” send them straight back to Log in (Admin segment).
      applyLoginMode('admin');
      window.setTimeout(() => loginModal?.show(), 450);
    } catch (err) {
      showAlert(adminRegisterAlert, err.message);
      P.busy(adminRegisterSubmit, false);
    }
  });

  registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    registerAlert.classList.add('d-none');
    const form = event.currentTarget;
    const schoolId = form.elements.school_id.value.trim();
    const fullName = form.elements.full_name.value.trim();
    const email = form.elements.email.value.trim().toLowerCase();
    const password = form.elements.password.value;
    const recoveryEmail = form.elements.recovery_email.value.trim();
    if (!/^[A-Za-z0-9-]{4,50}$/.test(schoolId)) return showAlert(registerAlert, 'ID number may only contain letters, digits and dashes (4-50 characters).');
    if (fullName.length < 3 || fullName.length > 120) return showAlert(registerAlert, 'Full name must be between 3 and 120 characters.');
    if (!/@(my\.)?cspc\.edu\.ph$/i.test(email)) return showAlert(registerAlert, 'Email must use the @cspc.edu.ph or @my.cspc.edu.ph domain.');
    if (recoveryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail)) {
      return showAlert(registerAlert, 'Enter a valid recovery email address.');
    }
    if (password.length < 8 || password.length > 72) return showAlert(registerAlert, 'Password must be between 8 and 72 characters.');
    if (password !== form.elements.confirm_password.value) return showAlert(registerAlert, 'The two passwords do not match.');

    P.busy(registerSubmit, true, 'Creating account...');
    try {
      const result = await P.api('/api/auth/register', {
        method: 'POST',
        body: {
          school_id: schoolId,
          full_name: fullName,
          email,
          password,
          role: form.elements.role.value,
          department: form.elements.department.value.trim(),
          ...(recoveryEmail ? { recovery_email: recoveryEmail } : {})
        }
      });
      registerModal.hide();
      P.toastOk(result.message || 'Registration successful.');
      window.setTimeout(() => window.location.assign('/dashboard.html'), 450);
    } catch (err) {
      showAlert(registerAlert, err.message);
      P.busy(registerSubmit, false);
    }
  });

  const query = new URLSearchParams(window.location.search);
  if (query.get('auth') === 'login' || query.get('error') === 'login_required') loginModal?.show();
  if (query.get('auth') === 'register') registerModal?.show();
  if (query.has('logged_out')) P.toastInfo('You have been logged out.');
  if (query.get('error') === 'admin_required') P.toastError('Administrator access is required.');
  const GOOGLE_ERROR_MESSAGES = {
    google_cancelled: ['Google sign-in was cancelled. You can try again or use your school ID instead.', 'warning'],
    google_not_configured: ['Google sign-in is not configured yet. Please use your school ID and password until the SSO provider is set up.', 'warning'],
    google_domain: ['Please sign in with your official CSPC Google account (@cspc.edu.ph or @my.cspc.edu.ph).', 'danger'],
    google_inactive: ['This account has been deactivated. Please contact the administrator.', 'danger'],
    google_forbidden: ['Access denied. Administrator privileges are required.', 'danger'],
    google_failed: ['Google sign-in could not be completed. Please log in with your school ID and password.', 'danger']
  };
  const googleErrorCode = query.get('error');
  const googleError = GOOGLE_ERROR_MESSAGES[googleErrorCode];
  if (googleError) {
    loginModal?.show();
    let googleMessage = googleError[0];
    const usedEmail = googleErrorCode === 'google_domain'
      ? String(query.get('email') || '').trim().slice(0, 254)
      : '';
    if (usedEmail) {
      googleMessage = `${googleMessage} You signed in as ${usedEmail} - use the Google button again and pick your school account.`;
    }
    showAlert(loginAlert, googleMessage, googleError[1]);
  }

  /* ---------------------------------------------------- guest welcome ---
     Visitors who open the site while signed out see the login card once
     per browser session: they can log in, jump to registration, or close
     it (X / backdrop / Esc) and keep browsing. Skipped when a query-string
     flow already opened a modal, when signed in, and after the visitor has
     dismissed it earlier in the same session. Logging out clears the flag
     so the prompt comes back on their next visit. */
  const LOGIN_PROMPT_KEY = 'cspc-home-login-prompted';
  if (query.has('logged_out')) {
    try { window.sessionStorage.removeItem(LOGIN_PROMPT_KEY); } catch { /* storage unavailable */ }
  }
  let guestPromptSeen = false;
  try {
    guestPromptSeen = window.sessionStorage.getItem(LOGIN_PROMPT_KEY) === '1';
    if (!guestPromptSeen) window.sessionStorage.setItem(LOGIN_PROMPT_KEY, '1');
  } catch { /* storage unavailable - prompt stays silent rather than nag */ }
  const queryAlreadyPrompted = query.has('auth') || query.has('error');
  if (loginModal && !session.authenticated && !queryAlreadyPrompted && !guestPromptSeen) {
    // Short delay so the hero paints before the card slides in.
    window.setTimeout(() => loginModal.show(), 600);
  }

  /* ------------------------------------------------------------- data --- */

  let buildings = [];
  try {
    const data = await P.api('/api/buildings');
    buildings = data.buildings || [];
  } catch {
    buildings = [];
  }

  /* --------------------------------------------- featured spaces grid --- */

  const buildingHost = document.getElementById('home-buildings-list');
  if (buildingHost) {
    // Skeleton UI while the live Top 3 loads.
    buildingHost.innerHTML = [1, 2, 3].map((n) => `
        <div class="col-md-4 home-building-col">
          <article class="home-building-card building-tone-${n} is-loading" aria-busy="true">
            <div class="home-building-card-top"><span class="home-building-number">${String(n).padStart(2, '0')}</span><span class="home-building-mark" aria-hidden="true">âŒ‚</span></div>
            <h3>Loading popular spaceâ€¦</h3>
            <p>Counting reservationsâ€¦</p>
            <div class="home-building-card-footer"><span>â€” active rooms</span><span aria-hidden="true">â†—</span></div>
          </article>
        </div>`).join('');

    let popular = [];
    try {
      const topData = await P.api('/api/buildings/top-popular');
      popular = topData.buildings || [];
    } catch {
      popular = [];
    }
    // Fallback: if no reservation data yet, rank by active room count so the
    // section still shows meaningful buildings instead of going empty.
    const featured = (popular.length ? popular : buildings.slice(0, 3)).slice(0, 3);
    buildingHost.innerHTML = featured.length
      ? featured.map((building, index) => {
          const name = building.building_name || building.name;
          const roomsLabel = `${building.active_rooms ?? building.room_count ?? 0} active rooms`;
          const resCount = Number(building.total_reservations ?? 0);
          const sub = building.location || (resCount > 0 ? `${resCount} reservation${resCount === 1 ? '' : 's'} booked` : 'CSPC campus');
          const bgImage = BUILDING_BACKGROUNDS[name] || '';
          const cardStyle = bgImage ? `style="background-image: linear-gradient(145deg, rgba(7, 14, 27, 0.45), rgba(5, 8, 15, 0.55)), url('${bgImage}'); background-size: cover; background-position: center;"` : '';
          return `
        <div class="col-md-4 home-building-col">
          <article class="home-building-card" ${cardStyle}>
            <div class="home-building-card-top"><span class="home-building-number">${String(index + 1).padStart(2, '0')}</span><span class="home-building-mark" aria-hidden="true">âŒ‚</span></div>
            <h3>${P.escapeHtml(name)}</h3>
            <p>${P.escapeHtml(sub)}</p>
            <div class="home-building-card-footer"><span>${P.escapeHtml(roomsLabel)}${resCount > 0 ? ` Â· ${resCount} bookings` : ''}</span><a href="/rooms-status.html" aria-label="View room status">â†—</a></div>
          </article>
        </div>`;
        }).join('')
      : '<div class="col-12"><div class="home-building-loading">Campus building information will appear here soon.</div></div>';
  }

  /* --------------------------------------------- building search --- */

  const searchInput = document.getElementById('building-search');
  const searchResults = document.getElementById('building-search-results');

  if (searchInput && buildingHost) {
    let debounceTimer = null;
    let buildingCols = [];

    function refreshBuildingCols() {
      buildingCols = buildingHost ? Array.from(buildingHost.querySelectorAll('.home-building-col')) : [];
    }

    function filterBuildings(query) {
      const q = query.toLowerCase().trim();
      let visibleCount = 0;

      refreshBuildingCols();
      buildingCols.forEach((col) => {
        const card = col.querySelector('.home-building-card');
        const title = card ? card.querySelector('h3') : null;
        const name = title ? title.textContent.toLowerCase() : '';
        const match = q === '' || name.includes(q);
        col.style.display = match ? '' : 'none';
        if (match) visibleCount++;
      });

      const existingEmpty = buildingHost.querySelector('.home-building-empty');
      if (existingEmpty) existingEmpty.remove();

      if (q !== '' && visibleCount === 0) {
        const empty = document.createElement('div');
        empty.className = 'col-12 home-building-empty';
        empty.innerHTML = `<div class="home-building-loading">No buildings match "${P.escapeHtml(query)}"</div>`;
        buildingHost.appendChild(empty);
      }
    }

    function buildingThumbnail(name) {
      return BUILDING_BACKGROUNDS[name] || '/img/campus-bg-sm.jpg';
    }

    function showAutocomplete(query) {
      const q = query.toLowerCase().trim();
      if (!q) {
        searchResults.innerHTML = '';
        searchResults.classList.remove('show');
        return;
      }

      const matches = buildings
        .filter((b) => (b.building_name || b.name || '').toLowerCase().includes(q))
        .slice(0, 5);

      if (matches.length === 0) {
        searchResults.innerHTML = '<div class="search-dropdown-item text-muted">No matching buildings</div>';
        searchResults.classList.add('show');
        return;
      }

      searchResults.innerHTML = matches
        .map((b) => {
          const name = b.building_name || b.name;
          const rooms = Number(b.active_rooms ?? b.room_count ?? 0);
          const thumb = buildingThumbnail(name);
          return `
            <button class="search-dropdown-item d-flex align-items-center gap-2" type="button"
                    data-id="${b.id}" data-name="${P.escapeHtml(name)}">
              <img src="${P.escapeHtml(thumb)}" class="search-dropdown-thumb" alt="" loading="lazy" />
              <div class="flex-fill">
                <div class="search-dropdown-name">${P.escapeHtml(name)}</div>
                <div class="search-dropdown-meta">${rooms} active room${rooms !== 1 ? 's' : ''}</div>
              </div>
              <span class="search-dropdown-arrow">â€º</span>
            </button>`;
        })
        .join('');
      searchResults.classList.add('show');
    }

    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const q = e.target.value;
        filterBuildings(q);
        showAutocomplete(q);
      }, 150);
    });

    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim()) showAutocomplete(searchInput.value);
    });

    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.classList.remove('show');
      }
    });

    searchResults.addEventListener('click', (e) => {
      const item = e.target.closest('.search-dropdown-item');
      if (item) {
        const id = Number(item.getAttribute('data-id'));
        const name = item.getAttribute('data-name');
        searchInput.value = name;
        searchResults.classList.remove('show');
        filterBuildings(name);
        openBuildingDetail(id, name);
      }
    });
  }

  async function openBuildingDetail(buildingId, buildingName) {
    const bdName = document.getElementById('bd-name');
    const bdCode = document.getElementById('bd-code');
    const bdLocation = document.getElementById('bd-location');
    const bdHours = document.getElementById('bd-hours');
    const bdDescription = document.getElementById('bd-description');
    const bdActiveRooms = document.getElementById('bd-active-rooms');
    const bdTotalRooms = document.getElementById('bd-total-rooms');
    const bdEquipmentCount = document.getElementById('bd-equipment-count');
    const bdRoomsBody = document.getElementById('bd-rooms-body');
    const bdBookingsBody = document.getElementById('bd-bookings-body');
    const bdEquipmentGrid = document.getElementById('bd-equipment-grid');

    if (bdName) bdName.textContent = buildingName;
    if (bdCode) bdCode.textContent = 'Loadingâ€¦';
    if (bdLocation) bdLocation.textContent = 'Loadingâ€¦';
    if (bdHours) bdHours.textContent = 'Loadingâ€¦';
    if (bdDescription) bdDescription.textContent = 'Loadingâ€¦';
    if (bdActiveRooms) bdActiveRooms.textContent = 'â€“';
    if (bdTotalRooms) bdTotalRooms.textContent = 'â€“';
    if (bdEquipmentCount) bdEquipmentCount.textContent = 'â€“';
    if (bdRoomsBody) bdRoomsBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted-sm py-3">Loading roomsâ€¦</td></tr>';
    if (bdBookingsBody) bdBookingsBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted-sm py-3">Loading bookingsâ€¦</td></tr>';

    const buildingDetailModalEl = document.getElementById('building-detail-modal');
    if (buildingDetailModalEl) {
      const buildingDetailModal = new bootstrap.Modal(buildingDetailModalEl);
      buildingDetailModal.show();
    }

    try {
      const [detailsRes, bookingsRes] = await Promise.all([
        P.api(`/api/buildings/${buildingId}/details`),
        P.api(`/api/buildings/${buildingId}/bookings`)
      ]);

      const { building, rooms, equipment, operating_hours, description, building_code } = detailsRes;
      const { bookings, date } = bookingsRes;

      if (bdName) bdName.textContent = building.name;
      if (bdCode) bdCode.textContent = building_code;
      if (bdLocation) bdLocation.textContent = building.location || 'CSPC Campus';
      if (bdHours) bdHours.textContent = operating_hours;
      if (bdDescription) bdDescription.textContent = description;
      if (bdActiveRooms) bdActiveRooms.textContent = building.active_rooms;
      if (bdTotalRooms) bdTotalRooms.textContent = building.room_count;
      const eqCount = Object.values(equipment).filter((v) => v > 0).length;
      if (bdEquipmentCount) bdEquipmentCount.textContent = eqCount;

      if (bdRoomsBody) {
        if (rooms.length) {
          bdRoomsBody.innerHTML = rooms.map((r) => {
            const equip = [];
            if (r.has_projector) equip.push('Projector');
            if (r.has_aircon) equip.push('Aircon');
            if (r.has_sound) equip.push('Sound');
            const status = r.bookings && r.bookings.length ? 'In Use' : 'Available';
            const statusClass = status === 'Available' ? 'status-available' : 'status-inuse';
            return `
              <tr>
                <td>${P.escapeHtml(r.name)}</td>
                <td><span class="room-type-badge">${P.escapeHtml(r.room_type)}</span></td>
                <td>${r.capacity}</td>
                <td>${r.floor || 'â€“'}</td>
                <td><span class="room-equip">${equip.join(', ') || 'â€“'}</span></td>
                <td><span class="room-status ${statusClass}">${status}</span></td>
              </tr>`;
          }).join('');
        } else {
          bdRoomsBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted-sm py-3">No active rooms found.</td></tr>';
        }
      }

      if (bdEquipmentGrid) {
        const eqItems = [];
        if (equipment.projector > 0) eqItems.push('<div class="building-equipment-item"><span class="building-equipment-icon">ðŸ“½ï¸</span><span>Projector (' + equipment.projector + ' rooms)</span></div>');
        if (equipment.aircon > 0) eqItems.push('<div class="building-equipment-item"><span class="building-equipment-icon">â„ï¸</span><span>Air Conditioning (' + equipment.aircon + ' rooms)</span></div>');
        if (equipment.sound > 0) eqItems.push('<div class="building-equipment-item"><span class="building-equipment-icon">ðŸ”Š</span><span>Sound System (' + equipment.sound + ' rooms)</span></div>');
        bdEquipmentGrid.innerHTML = eqItems.length ? eqItems.join('') : '<div class="text-muted-sm">No specific equipment listed.</div>';
      }

      if (bdBookingsBody) {
        if (bookings.length) {
          bdBookingsBody.innerHTML = bookings.map((b) => {
            const statusClass = b.status === 'Approved' ? 'booking-approved' : 'booking-pending';
            return `
              <tr>
                <td>${P.escapeHtml(b.room_name)}</td>
                <td>${P.escapeHtml(b.start_time)} â€“ ${P.escapeHtml(b.end_time)}</td>
                <td><span class="booking-status ${statusClass}">${b.status}</span></td>
                <td>${P.escapeHtml(b.requested_by)}</td>
              </tr>`;
          }).join('');
        } else {
          bdBookingsBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted-sm py-3">No upcoming bookings on ${date}.</td></tr>`;
        }
      }

    } catch (err) {
      if (bdName) bdName.textContent = buildingName;
      if (bdCode) bdCode.textContent = 'â€“';
      if (bdLocation) bdLocation.textContent = 'â€“';
      if (bdHours) bdHours.textContent = 'â€“';
      if (bdDescription) bdDescription.textContent = 'Could not load building details.';
      if (bdRoomsBody) bdRoomsBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-3">Failed to load rooms.</td></tr>';
      if (bdBookingsBody) bdBookingsBody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-3">Failed to load bookings.</td></tr>';
      console.error('[building detail] Error:', err.message);
    }
  }

  /* -------------------------------------- buildings expand / collapse --- */
  const buildingsToggleLabel = document.getElementById('home-buildings-toggle-label');
  const COLLAPSED_BUILDINGS = 3; // one tidy row on desktop, first three on mobile

  function buildingColumns() {
    return buildingHost ? Array.from(buildingHost.querySelectorAll('.home-building-col')) : [];
  }

  /** Pixel height of the first visible row of cards (the 3rd card's bottom). */
  function collapsedBuildingsHeight() {
    const cols = buildingColumns();
    if (cols.length <= COLLAPSED_BUILDINGS) return null;
    const top = buildingHost.getBoundingClientRect().top;
    return Math.max(0, Math.round(cols[COLLAPSED_BUILDINGS - 1].getBoundingClientRect().bottom - top));
  }

  function applyBuildingsHeight(expand, instant = false) {
    if (!buildingHost) return;
    const height = collapsedBuildingsHeight();
    if (height === null) {
      buildingHost.style.maxHeight = '';
      return;
    }
    if (instant) buildingHost.style.transition = 'none';
    buildingHost.style.maxHeight = `${expand ? buildingHost.scrollHeight : height}px`;
    if (instant) {
      void buildingHost.offsetHeight; // flush so the change isn't animated
      buildingHost.style.transition = '';
    }
  }

  if (buildingHost && buildingsToggle) {
    const total = buildingColumns().length;

    if (total > COLLAPSED_BUILDINGS) {
      buildingsToggle.hidden = false;
      if (buildingsToggleLabel) buildingsToggleLabel.textContent = `Show all ${total} buildings`;

      buildingHost.classList.add('is-collapsed');
      applyBuildingsHeight(false, true);

      buildingsToggle.addEventListener('click', () => {
        const expand = buildingsToggle.getAttribute('aria-expanded') !== 'true';
        buildingsToggle.setAttribute('aria-expanded', String(expand));
        if (buildingsToggleLabel) {
          buildingsToggleLabel.textContent = expand ? 'Show less' : `Show all ${total} buildings`;
        }
        buildingHost.classList.add('is-animating');
        buildingHost.classList.toggle('is-collapsed', !expand);
        applyBuildingsHeight(expand);
        window.setTimeout(() => buildingHost.classList.remove('is-animating'), 480);
      });

      let resizeTimer = null;
      window.addEventListener('resize', () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(
          () => applyBuildingsHeight(buildingsToggle.getAttribute('aria-expanded') === 'true', true),
          150
        );
      });
    }
  }

  /* ----------------------------------------- quick availability search --- */

  const searchForm = document.getElementById('home-search-form');
  const searchDate = document.getElementById('home-search-date');
  const searchTime = document.getElementById('home-search-time');
  const searchBuilding = document.getElementById('home-search-building');
  const searchResult = document.getElementById('home-search-result');
  const searchSubmit = document.getElementById('home-search-submit');

  if (searchDate) {
    searchDate.value = P.todayIso();
    searchDate.min = P.todayIso();
  }
  if (searchBuilding) {
    searchBuilding.innerHTML =
      '<option value="">All buildings</option>' +
      buildings.map((b) => `<option value="${b.id}">${P.escapeHtml(b.name)}</option>`).join('');
  }

  /** Shared helpers for reading availability records (times are "HH:MM:SS"). */
  function minutesFromValue(value) {
    const [h, m] = String(value || '').split(':').map(Number);
    return Number.isNaN(h) ? null : h * 60 + (m || 0);
  }

  function parseSlot(value) {
    const match = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    return { start: minutesFromValue(match[1]), end: minutesFromValue(match[2]), label: value };
  }

  function overlaps(slot, booking) {
    const bs = minutesFromValue(booking.start_time);
    const be = minutesFromValue(booking.end_time);
    if (bs === null || be === null) return false;
    return bs < slot.end && be > slot.start;
  }

  /** Green = free, amber = some bookings, red = occupied right now / in slot. */
  function roomStatus(room, dateValue, slot) {
    const bookings = room.bookings || [];
    if (slot) {
      const clash = bookings.find((b) => overlaps(slot, b));
      return clash
        ? { tone: 'occupied', label: 'Booked', detail: `${P.formatTime(clash.start_time)} â€“ ${P.formatTime(clash.end_time)}` }
        : { tone: 'available', label: 'Free', detail: 'Open in this slot' };
    }
    if (dateValue === P.todayIso()) {
      const now = new Date().getHours() * 60 + new Date().getMinutes();
      const current = bookings.find((b) => {
        const bs = minutesFromValue(b.start_time);
        const be = minutesFromValue(b.end_time);
        return bs !== null && be !== null && bs <= now && now < be;
      });
      if (current) return { tone: 'occupied', label: 'Occupied', detail: `Until ${P.formatTime(current.end_time)}` };
    }
    if (!bookings.length) return { tone: 'available', label: 'Available', detail: 'Free all day' };
    return { tone: 'limited', label: 'Limited', detail: `${bookings.length} booking${bookings.length > 1 ? 's' : ''} today` };
  }

  /* ------------------------------------- real-time status indicators --- */

  const statusGrid = document.getElementById('home-status-grid');

/* Equipment icon labels mapped to room boolean fields. */
const EQUIPMENT_ICONS = [
  { key: 'has_projector', label: 'Projector', icon: 'ðŸ“½ï¸' },
  { key: 'has_aircon',      label: 'AirCon',      icon: 'â„ï¸' },
  { key: 'has_sound',       label: 'Sound System',icon: 'ðŸ”Š' }
];

/** Occupancy % for today: minutes booked / minutes in operating day (7am-7pm = 720 min). */
function occupancyPct(room) {
  const bookings = room.bookings || [];
  const today = P.todayIso();
  const bookedMinutes = bookings.reduce((sum, b) => {
    if (b.res_date !== today) return sum;
    const bs = minutesFromValue(b.start_time);
    const be = minutesFromValue(b.end_time);
    return bs !== null && be !== null ? sum + (be - bs) : sum;
  }, 0);
  return Math.round((bookedMinutes / 720) * 100);
}

function equipmentHtml(room) {
  const icons = EQUIPMENT_ICONS
    .filter((eq) => room[eq.key])
    .map((eq) => `<span class="home-equip-icon" title="${P.escapeHtml(eq.label)}">${eq.icon}</span>`)
    .join('');
  return icons ? `<div class="home-equipment">${icons}</div>` : '';
}

/** Generate a human-readable remark based on room status tone. */
function generateRemark(room, status) {
  const bookings = room.bookings || [];
  const today = P.todayIso();
  const now = new Date().getHours() * 60 + new Date().getMinutes();

  if (status.tone === "available") {
    if (bookings.length === 0) return "Ready for immediate booking";
    const nextBooking = bookings
      .filter((b) => b.res_date === today)
      .map((b) => ({ ...b, bs: minutesFromValue(b.start_time), be: minutesFromValue(b.end_time) }))
      .filter((b) => b.bs !== null && b.be !== null && b.bs > now)
      .sort((a, b) => a.bs - b.bs)[0];
    if (nextBooking) {
      const minsUntil = nextBooking.bs - now;
      const hours = Math.floor(minsUntil / 60);
      return hours >= 1 ? `Free for next ${hours} hour${hours > 1 ? "s" : ""}` : "Free now";
    }
    return "Available for booking";
  }

  if (status.tone === "limited") {
    const count = bookings.length;
    return `${count}/4 slots remaining`;
  }

  const current = bookings.find((b) => {
    if (b.res_date !== today) return false;
    const bs = minutesFromValue(b.start_time);
    const be = minutesFromValue(b.end_time);
    return bs !== null && be !== null && bs <= now && now < be;
  });
  if (current) {
    const endMin = minutesFromValue(current.end_time);
    const endHr = Math.floor(endMin / 60);
    const endMinDisplay = (endMin % 60).toString().padStart(2, "0");
    const ampm = endHr >= 12 ? "PM" : "AM";
    const displayHr = endHr % 12 || 12;
    return `Class in Session (${current.requested_by || "CS 101"}) — until ${displayHr}:${endMinDisplay} ${ampm}`;
  }
  return "Fully Booked until 5:00 PM";
}

function statusCard(room, dateValue, slot, remark) {
  const status = roomStatus(room, dateValue, slot);
  const type = P.ROOM_TYPE_LABELS[room.room_type] || room.room_type || "Laboratory";
  const roomCode = `L-${String(room.id).padStart(3, "0")}`;
  const meta = [room.building_name, room.capacity ? `Seats ${room.capacity}` : ""]
    .filter(Boolean).map(P.escapeHtml).join(" Â· ");
  const occ = occupancyPct(room);
  const equip = equipmentHtml(room);
  const actionText = status.tone === "available" ? "Reserve Now" : "View Schedule";
  const actionHref = status.tone === "available"
    ? `/reservation-form.html?room_id=${room.id}&date=${encodeURIComponent(dateValue || P.todayIso())}`
    : `/rooms-status.html`;
  return `
    <article class="home-status-card is-${status.tone}">
      <div class="home-status-card-top">
        <span class="home-status-badge is-${status.tone}">${P.escapeHtml(status.label)}</span>
        <span class="home-status-type">${P.escapeHtml(type)}</span>
      </div>
      <h3>${P.escapeHtml(room.name)} <span class="home-status-roomcode">${roomCode}</span></h3>
      <p class="home-status-meta">${meta}</p>
      ${equip}
      <div class="home-status-remark">${P.escapeHtml(remark || generateRemark(room, status))}</div>
      <div class="home-status-occ">
        <span class="home-status-occ-label">Utilization</span>
        <div class="home-status-occ-bar">
          <div class="home-status-occ-fill is-${status.tone}" style="width: ${occ}%"></div>
        </div>
        <span class="home-status-occ-pct">${occ}%</span>
      </div>
      <a href="${actionHref}" class="home-status-action btn btn-sm btn-${status.tone === "available" ? "cspc" : "outline-cspc"}">${P.escapeHtml(actionText)}</a>
    </article>`;
}

  /** Labs and halls first, then the busiest rooms - our "high-demand" pick. */
  function highlightRooms(rooms) {
    const rank = (room) => (room.room_type === 'hall' ? 2 : room.room_type === 'laboratory' ? 1 : 0);
    return [...rooms]
      .sort((a, b) => (rank(b) - rank(a))
        || ((b.bookings || []).length - (a.bookings || []).length)
        || String(a.name).localeCompare(String(b.name)))
      .slice(0, 6);
  }

  async function loadLiveStatus(dateOverride, slotOverride, buildingIdOverride) {
    if (!statusGrid) return;
    try {
      const date = dateOverride || P.todayIso();
      const params = new URLSearchParams({ date });
      if (buildingIdOverride) params.set('building_id', buildingIdOverride);
      const data = await P.api(`/api/availability?${params.toString()}`);
      const rooms = data.rooms || [];

      // Split into two categories: available/limited and occupied
      const availableRooms = rooms.filter((r) => {
        const s = roomStatus(r, date, slotOverride);
        return s.tone === 'available' || s.tone === 'limited';
      });
      const occupiedRooms = rooms.filter((r) => {
        const s = roomStatus(r, date, slotOverride);
        return s.tone === 'occupied';
      });

      const topAvailable = availableRooms.slice(0, 3);
      const topOccupied = occupiedRooms.slice(0, 3);

      const availableHtml = topAvailable.length
        ? '<div class="home-status-category">' +
          '<h4 class="home-status-category-title">✅ Top 3 Available / Limited Spaces</h4>' +
          '<div class="home-status-grid-inner">' + topAvailable.map((room) => statusCard(room, date, slotOverride)).join('') + '</div>' +
          '</div>'
        : '<div class="home-status-empty">No available or limited spaces right now.</div>';

      const occupiedHtml = topOccupied.length
        ? '<div class="home-status-category">' +
          '<h4 class="home-status-category-title">⚠ Currently Occupied Spaces</h4>' +
          '<div class="home-status-grid-inner">' + topOccupied.map((room) => statusCard(room, date, slotOverride)).join('') + '</div>' +
          '</div>'
        : '<div class="home-status-empty">No occupied spaces right now.</div>';

      statusGrid.innerHTML = (topAvailable.length || topOccupied.length)
        ? availableHtml + occupiedHtml
        : '<div class="home-status-loading">No active rooms to show right now.</div>';

      // Dynamic counter for the floating hero badge: count rooms with no bookings today.
      const openRooms = rooms.filter((room) => (room.bookings || []).length === 0);
      const openCount = openRooms.length;
      const heroCount = document.getElementById('hero-rooms-count');
      if (heroCount) heroCount.textContent = openCount > 0 ? `${openCount} Room${openCount === 1 ? '' : 's'} Available Now` : 'Checking Live Availabilityâ€¦';
      // Hover tooltip preview â€” list 2-3 open rooms by name.
      const heroTooltip = document.getElementById('hero-rooms-tooltip');
      if (heroTooltip) {
        if (openRooms.length) {
          const preview = openRooms.slice(0, 3).map((room) => P.escapeHtml(room.name)).join('<br />');
          const extra = openRooms.length > 3 ? `<br />+${openRooms.length - 3} more open today` : '';
          heroTooltip.innerHTML = `<b>Open now:</b><br />${preview}${extra}`;
        } else {
          heroTooltip.textContent = 'All rooms have bookings today â€” check another date.';
        }
      }
    } catch {
      statusGrid.innerHTML = '<div class="home-status-loading">Live availability is temporarily unavailable. Open the full timetable to check rooms.</div>';
    }
  }

  searchForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!searchResult) return;

    const slot = parseSlot(searchTime?.value);
    const date = searchDate?.value || P.todayIso();
    const params = new URLSearchParams({ date });
    if (searchBuilding?.value) params.set('building_id', searchBuilding.value);

    P.busy(searchSubmit, true, 'Checking...');
    try {
      const data = await P.api(`/api/availability?${params.toString()}`);
      const rooms = data.rooms || [];
      const matches = rooms.filter((room) => {
        const bookings = room.bookings || [];
        return slot ? !bookings.some((b) => overlaps(slot, b)) : bookings.length === 0;
      });
      const when = slot ? `for <strong>${P.escapeHtml(slot.label)}</strong>` : 'all day';

      if (!rooms.length) {
        searchResult.innerHTML = 'No active rooms are listed for that building yet. Try another building.';
      } else if (!matches.length) {
        searchResult.innerHTML = `No rooms are open ${when} on ${P.escapeHtml(P.formatDate(date))}. Try a different time or building.`;
      } else {
        const chips = matches.slice(0, 8)
          .map((room) => `<span class="home-search-chip">${P.escapeHtml(room.name)}</span>`).join('');
        const extra = matches.length > 8 ? `<span class="home-search-chip">+${matches.length - 8} more</span>` : '';
        searchResult.innerHTML =
          `<strong>${matches.length} of ${rooms.length} rooms available</strong> ${when} on <strong>${P.escapeHtml(P.formatDate(date))}</strong>.` +
          `<div class="home-search-chips">${chips}${extra}</div>`;
      }
      searchResult.hidden = false;
      // Also refresh the live status grid with the same filters
      loadLiveStatus(date, slot, searchBuilding?.value || undefined);
    } catch (err) {
      P.toastError(`Could not check availability: ${err.message}`);
    } finally {
      P.busy(searchSubmit, false);
    }
  });

  /* Soft cursor-following 3D parallax tilt on the hornet emblem. */
  const heroSection=document.querySelector('.home-hero');
  const heroVisual=document.getElementById('hero-visual');
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(heroSection&&heroVisual&&!reduceMotion){
    let f=null;
    heroVisual.addEventListener('mousemove',e=>{if(f)cancelAnimationFrame(f);f=requestAnimationFrame(()=>{const r=heroVisual.getBoundingClientRect();const px=(e.clientX-r.left)/r.width-0.5;const py=(e.clientY-r.top)/r.height-0.5;heroSection.style.setProperty('--hero-tilt-y',(px*7).toFixed(2)+'deg');heroSection.style.setProperty('--hero-tilt-x',(-py*7).toFixed(2)+'deg');});});
    heroVisual.addEventListener('mouseleave',()=>{if(f)cancelAnimationFrame(f);heroSection.style.setProperty('--hero-tilt-x','0deg');heroSection.style.setProperty('--hero-tilt-y','0deg');});
  }

  loadLiveStatus();
})();

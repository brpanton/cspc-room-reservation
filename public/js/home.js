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

  // Dynamic Quick Check banner text based on auth state
  const quickCheckTag = document.getElementById('quickCheckTag');
  const quickCheckHeading = document.getElementById('quickCheckHeading');
  const quickCheckSubtext = document.getElementById('quickCheckSubtext');

  function applyQuickCheckText(authenticated) {
    if (!quickCheckTag || !quickCheckHeading || !quickCheckSubtext) return;
    if (authenticated) {
      quickCheckTag.textContent = 'LIVE AVAILABILITY · REAL-TIME SEARCH';
      quickCheckHeading.textContent = 'Find & Reserve Your Laboratory';
      quickCheckSubtext.textContent = 'Pick a date, time slot and building to check live availability and request a reservation.';
    } else {
      quickCheckTag.textContent = 'Quick check · no login';
      quickCheckHeading.textContent = "See what's free before you sign in";
      quickCheckSubtext.textContent = 'Pick a date, time slot and building to preview live availability across campus.';
    }
  }

  applyQuickCheckText(session.authenticated);

  // Unhide the user-profile-wrapper so the profile pill shows the logged-in user
  const profileWrapper = document.getElementById('user-profile-wrapper');
  if (session.authenticated && profileWrapper) {
    profileWrapper.hidden = false;
  }

  const primaryAction = document.getElementById('home-primary-action');
  if (session.authenticated && primaryAction) {
    primaryAction.removeAttribute('data-bs-toggle');
    primaryAction.removeAttribute('data-bs-target');
    primaryAction.classList.remove('btn');
    primaryAction.outerHTML = `<a class="btn btn-cspc btn-lg" id="home-primary-action" href="${session.user.role === 'admin' ? '/admin-dashboard.html' : '/dashboard.html'}">${session.user.role === 'admin' ? 'Open admin dashboard →' : 'Open your dashboard →'}</a>`;
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
    // switching roles — keeps user login details out of the admin login.
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
    // Admins are provisioned / enrolled — never show self-registration.
    if (createAccountRow) createAccountRow.classList.toggle('d-none', loginMode === 'admin');
    // Hide Google SSO in Admin Login mode — only show for User Login.
    const ssoBtn = document.getElementById('visitor-sso-google');
    if (ssoBtn) ssoBtn.classList.toggle('d-none', loginMode === 'admin');
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

  // One-click Google SSO handoff — the server owns the OAuth details: it
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
    // Open the forgot view with a completely blank recovery email field —
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
      // No session yet — send them straight back to Log in (Admin segment).
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
            <div class="home-building-card-top"><span class="home-building-number">${String(n).padStart(2, '0')}</span><span class="home-building-mark" aria-hidden="true">⌂</span></div>
            <h3>Loading popular space…</h3>
            <p>Counting reservations…</p>
            <div class="home-building-card-footer"><span>— active rooms</span><span aria-hidden="true">↗</span></div>
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
            <div class="home-building-card-top"><span class="home-building-number">${String(index + 1).padStart(2, '0')}</span><span class="home-building-mark" aria-hidden="true">⌂</span></div>
            <h3>${P.escapeHtml(name)}</h3>
            <p>${P.escapeHtml(sub)}</p>
            <div class="home-building-card-footer"><span>${P.escapeHtml(roomsLabel)}${resCount > 0 ? ` · ${resCount} bookings` : ''}</span><a href="/rooms-status.html" aria-label="View room status">↗</a></div>
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
              <span class="search-dropdown-arrow">›</span>
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
    if (bdCode) bdCode.textContent = 'Loading…';
    if (bdLocation) bdLocation.textContent = 'Loading…';
    if (bdHours) bdHours.textContent = 'Loading…';
    if (bdDescription) bdDescription.textContent = 'Loading…';
    if (bdActiveRooms) bdActiveRooms.textContent = '–';
    if (bdTotalRooms) bdTotalRooms.textContent = '–';
    if (bdEquipmentCount) bdEquipmentCount.textContent = '–';
    if (bdRoomsBody) bdRoomsBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted-sm py-3">Loading rooms…</td></tr>';
    if (bdBookingsBody) bdBookingsBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted-sm py-3">Loading bookings…</td></tr>';

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
                <td>${r.floor || '–'}</td>
                <td><span class="room-equip">${equip.join(', ') || '–'}</span></td>
                <td><span class="room-status ${statusClass}">${status}</span></td>
              </tr>`;
          }).join('');
        } else {
          bdRoomsBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted-sm py-3">No active rooms found.</td></tr>';
        }
      }

      if (bdEquipmentGrid) {
        const eqItems = [];
        if (equipment.projector > 0) eqItems.push('<div class="building-equipment-item"><span class="building-equipment-icon">📽️</span><span>Projector (' + equipment.projector + ' rooms)</span></div>');
        if (equipment.aircon > 0) eqItems.push('<div class="building-equipment-item"><span class="building-equipment-icon">❄️</span><span>Air Conditioning (' + equipment.aircon + ' rooms)</span></div>');
        if (equipment.sound > 0) eqItems.push('<div class="building-equipment-item"><span class="building-equipment-icon">🔊</span><span>Sound System (' + equipment.sound + ' rooms)</span></div>');
        bdEquipmentGrid.innerHTML = eqItems.length ? eqItems.join('') : '<div class="text-muted-sm">No specific equipment listed.</div>';
      }

      if (bdBookingsBody) {
        if (bookings.length) {
          bdBookingsBody.innerHTML = bookings.map((b) => {
            const statusClass = b.status === 'Approved' ? 'booking-approved' : 'booking-pending';
            return `
              <tr>
                <td>${P.escapeHtml(b.room_name)}</td>
                <td>${P.escapeHtml(b.start_time)} – ${P.escapeHtml(b.end_time)}</td>
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
      if (bdCode) bdCode.textContent = '–';
      if (bdLocation) bdLocation.textContent = '–';
      if (bdHours) bdHours.textContent = '–';
      if (bdDescription) bdDescription.textContent = 'Could not load building details.';
      if (bdRoomsBody) bdRoomsBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-3">Failed to load rooms.</td></tr>';
      if (bdBookingsBody) bdBookingsBody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-3">Failed to load bookings.</td></tr>';
      console.error('[building detail] Error:', err.message);
    }
  }

  /* -------------------------------------- buildings expand / collapse --- */
  const buildingsToggleLabel = document.getElementById('home-buildings-toggle-label');
  const buildingsToggle = document.getElementById('home-buildings-toggle');
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
  const availabilityView = document.getElementById('home-availability-view');
  const availabilityHeader = document.getElementById('home-availability-header');
  const availabilityGrid = document.getElementById('home-availability-grid');

  if (searchDate) {
    searchDate.value = P.todayIso();
    searchDate.min = P.todayIso();
  }
  const buildingDropdown = document.getElementById('home-building-dropdown');
  const buildingInput = document.getElementById('home-search-building');
  const buildingIdInput = document.getElementById('home-building-id');

  if (searchBuilding && buildingDropdown && buildingIdInput) {
    // Populate dropdown options
    const optionsHtml = [
      `<div class="home-building-dropdown-option" data-id="" data-name="All buildings">All buildings</div>`,
      ...buildings.map((b) => `<div class="home-building-dropdown-option" data-id="${b.id}" data-name="${P.escapeHtml(b.name)}">${P.escapeHtml(b.name)}</div>`)
    ].join('');
    buildingDropdown.innerHTML = optionsHtml;

    // Keep a lookup map: building name -> id for form submission
    window.__buildingIdByName = new Map(
      (buildings || []).map((b) => [String(b.name).trim(), Number(b.id)])
    );

    // --- Custom dropdown interactivity ---

    let isDropdownOpen = false;

    function openDropdown() {
      buildingDropdown.hidden = false;
      isDropdownOpen = true;
    }

    function closeDropdown() {
      buildingDropdown.hidden = true;
      isDropdownOpen = false;
    }

    function filterDropdown(query) {
      const q = String(query || '').toLowerCase().trim();
      buildingDropdown.querySelectorAll('.home-building-dropdown-option').forEach((opt) => {
        const name = opt.dataset.name || '';
        opt.style.display = name.toLowerCase().includes(q) ? '' : 'none';
      });
    }

    // Toggle dropdown on input click/focus
    buildingInput.addEventListener('click', () => {
      if (!isDropdownOpen) {
        filterDropdown('');
        openDropdown();
      }
    });
    buildingInput.addEventListener('focus', () => {
      if (!isDropdownOpen) {
        filterDropdown('');
        openDropdown();
      }
    });

    // Filter as user types (input is readonly but we capture programmatic + paste)
    buildingInput.addEventListener('input', (e) => {
      filterDropdown(e.target.value);
      if (!isDropdownOpen) openDropdown();
    });

    // Click outside to close
    document.addEventListener('click', (e) => {
      if (isDropdownOpen && !buildingDropdown.contains(e.target) && e.target !== buildingInput) {
        closeDropdown();
      }
    });

    // Select option
    buildingDropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.home-building-dropdown-option');
      if (!opt) return;
      const id = opt.dataset.id || '';
      const name = opt.dataset.name || '';
      buildingInput.value = name;
      buildingIdInput.value = id;
      closeDropdown();
    });

    // Clear selection when input is cleared
    buildingInput.addEventListener('blur', () => {
      // If input is empty, clear hidden id too
      if (!buildingInput.value.trim()) {
        buildingIdInput.value = '';
      }
    });
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

  /** Green = free, amber = some bookings, red = occupied right now / in slot.
   *  Occupied  -> an APPROVED booking is happening right now.
   *  Limited   -> a Pending request today, or any booking today that is not
   *               currently active (partial time-slot).
   *  Available -> zero active/pending bookings.
   */
  function roomStatus(room, dateValue, slot) {
    const bookings = room.bookings || [];
    if (slot) {
      const clash = bookings.find((b) => overlaps(slot, b));
      return clash
        ? { tone: 'occupied', label: 'Booked', detail: `${P.formatTime(clash.start_time)} – ${P.formatTime(clash.end_time)}` }
        : { tone: 'available', label: 'Free', detail: 'Open in this slot' };
    }
    if (dateValue === P.todayIso()) {
      const now = new Date().getHours() * 60 + new Date().getMinutes();
      const current = bookings.find((b) => {
        if (b.status !== 'Approved') return false;
        const bs = minutesFromValue(b.start_time);
        const be = minutesFromValue(b.end_time);
        return bs !== null && be !== null && bs <= now && now < be;
      });
      if (current) return { tone: 'occupied', label: 'Occupied', detail: `Until ${P.formatTime(current.end_time)}` };
      if (bookings.length > 0) return { tone: 'limited', label: 'Limited', detail: `${bookings.length} booking${bookings.length > 1 ? 's' : ''} today` };
      return { tone: 'available', label: 'Available', detail: 'Free all day' };
    }
    if (!bookings.length) return { tone: 'available', label: 'Available', detail: 'Free all day' };
    return { tone: 'limited', label: 'Limited', detail: `${bookings.length} booking${bookings.length > 1 ? 's' : ''} today` };
  }

  /* ------------------------------------------- availability detail view -- */

  /** Compute a room's status for a specific selected time slot. */
  function roomSlotStatus(room, slot) {
    const bookings = room.bookings || [];
    if (!slot) {
      if (!bookings.length) return { tone: 'available', label: 'Available', booked: [], available: [] };
      const booked = bookings.map((b) => ({
        start: P.formatTime(b.start_time),
        end: P.formatTime(b.end_time),
        status: b.status,
      }));
      return { tone: 'limited', label: 'Limited / Reserved', booked, available: [] };
    }
    const clash = bookings.find((b) => overlaps(slot, b));
    if (clash) {
      return {
        tone: 'occupied',
        label: 'Occupied',
        booked: [{ start: P.formatTime(clash.start_time), end: P.formatTime(clash.end_time), status: clash.status }],
        available: [],
      };
    }
    return {
      tone: 'available',
      label: 'Available',
      booked: [],
      available: [{ start: slot.label.split('-')[0], end: slot.label.split('-')[1] }],
    };
  }

  /** Format "HH:MM" -> "h:MM AM/PM". */
  function fmtTimeShort(hhmm) {
    const [h, m] = String(hhmm || '').split(':').map(Number);
    if (h == null || m == null) return hhmm;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  /** Render one room card for the availability detail view. */
  function renderRoomCard(room, date, slot, buildingName) {
    const status = roomSlotStatus(room, slot);
    const badgeColor = status.tone === 'available' ? 'bg-success' : status.tone === 'occupied' ? 'bg-danger' : 'bg-warning';

    const bookedHtml = status.booked.length
      ? status.booked.map((b) =>
          `<div class=\"avail-slot\"><span class=\"avail-time text-danger\">${escapeHtml(b.start)} – ${escapeHtml(b.end)}</span> <span class=\"avail-status small text-danger\">${escapeHtml(b.status)}</span></div>`
        ).join('')
      : '<div class=\"avail-slot text-muted-sm\"><span>No bookings on this date</span></div>';

    const availHtml = status.available.length
      ? `<div class=\"avail-slot\"><span class=\"avail-time text-success\">${fmtTimeShort(status.available[0].start)} – ${fmtTimeShort(status.available[0].end)}</span> <span class=\"avail-status small text-success\">Open for this slot</span></div>`
      : '';

    const reserveUrl = `/reservation-form.html?date=${encodeURIComponent(date)}&building_id=${encodeURIComponent(room.building_id)}&room_id=${encodeURIComponent(room.id)}`;

    const amenities = [];
    if (room.capacity) amenities.push(`Seats ${room.capacity}`);
    if (room.has_projector) amenities.push('Projector');
    if (room.has_aircon) amenities.push('Aircon');
    if (room.has_sound) amenities.push('Sound');

    return `
      <div class="col-md-6 col-xl-4">
        <div class="card room-card availability-room-card h-100 clickable-room-card" data-room-id="${room.id}" data-reserve-url="${P.escapeHtml(reserveUrl)}">
          ${room.image_url ? `<img class="room-card-img" src="${P.escapeHtml(room.image_url)}" alt="${P.escapeHtml(room.name)}" loading="lazy" />` : ''}
          <div class="card-body d-flex flex-column">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <h5 class="card-title mb-0">${P.escapeHtml(room.name)}</h5>
                <div class="text-muted-small">${P.escapeHtml(room.building_name)}${room.floor ? ` · ${escapeHtml(room.floor)}` : ''}</div>
              </div>
              <span class="badge rounded-pill ${badgeColor} status-badge">${escapeHtml(status.label)}</span>
            </div>
            <div class="mt-2 mb-3 small">
              ${amenities.map((a) => `<span class="amenity-pill">${escapeHtml(a)}</span>`).join('')}
            </div>
            <div class="mt-auto">
              <div class="avail-hours mb-2">
                <div class="d-flex justify-content-between align-items-start mb-1">
                  <span class="text-muted-small me-2">Booked:</span>
                  <span class="booked-hours">${bookedHtml}</span>
                </div>
                ${availHtml ? `<div class="d-flex justify-content-between align-items-start"><span class="text-muted-small me-2">Available:</span> <span class="available-hours">${availHtml}</span></div>` : ''}
              </div>
              <a href="${P.escapeHtml(reserveUrl)}" class="btn btn-cspc btn-sm w-auto mt-3">Reserve Room</a>
              <span class="text-muted-small d-block mt-2">Click card or "Reserve Room" to book</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* --------------------------------- grouped availability rendering --- */

  /** Sort key for floor labels like "1st Floor", "2nd Floor", "10th Floor".
   *  Numeric floors sort by number; non-numeric labels sort after, alphabetically. */
  function floorSortKey(floorLabel) {
    const label = String(floorLabel || '').trim();
    const match = label.match(/(\d+)/);
    const num = match ? parseInt(match[1], 10) : null;
    if (num !== null) return [0, num, ''];
    return [1, 0, label.toLowerCase()];
  }

  /** Group rooms hierarchically: building -> floor -> rooms[].
   *  Returns a sorted array of [buildingName, sortedFloorMap] pairs.
   *  Buildings are sorted alphabetically; floors numerically; rooms by name. */
  function groupRoomsByBuildingAndFloor(rooms) {
    const byBuilding = new Map();
    rooms.forEach((room) => {
      const bName = room.building_name || 'Unknown Building';
      if (!byBuilding.has(bName)) byBuilding.set(bName, new Map());
      const byFloor = byBuilding.get(bName);
      const floor = room.floor || 'Unassigned';
      if (!byFloor.has(floor)) byFloor.set(floor, []);
      byFloor.get(floor).push(room);
    });

    // Sort buildings alphabetically by name
    const sortedBuildings = [...byBuilding.entries()].sort((a, b) =>
      String(a[0]).localeCompare(String(b[0]))
    );

    // Sort floors numerically within each building; sort rooms by name within each floor
    return sortedBuildings.map(([bName, floorMap]) => {
      const sortedFloors = [...floorMap.entries()].sort((a, b) => {
        const ka = floorSortKey(a[0]);
        const kb = floorSortKey(b[0]);
        if (ka[0] !== kb[0]) return ka[0] - kb[0];
        if (ka[1] !== kb[1]) return ka[1] - kb[1];
        return ka[2].localeCompare(kb[2]);
      });
      const sortedFloorMap = new Map(
        sortedFloors.map(([fName, fRooms]) => {
          const sortedRooms = [...fRooms].sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''))
          );
          return [fName, sortedRooms];
        })
      );
      return [bName, sortedFloorMap];
    });
  }

  /** Render one floor sub-section header within a building group. */
  function renderFloorHeader(floorName, roomCount) {
    return `
      <div class="col-12">
        <div class="home-avail-floor-section mb-2">
          <div class="home-avail-floor-header d-flex align-items-center justify-content-between">
            <span class="home-avail-floor-label">Floor ${escapeHtml(floorName)}</span>
            <span class="home-avail-floor-count text-muted-small">${roomCount} room${roomCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    `;
  }

  /** Render one complete building section: building header + floor sub-sections + room cards. */
  function renderBuildingSection(buildingName, floorMap, date, slot) {
    let html = '';
    const totalRooms = Array.from(floorMap.values()).reduce((sum, rooms) => sum + rooms.length, 0);

    // Building header
    html += `
      <div class="col-12">
        <div class="home-avail-building-section mb-3">
          <div class="home-avail-building-header d-flex align-items-center justify-content-between">
            <span class="home-avail-building-name">${escapeHtml(buildingName)}</span>
            <span class="home-avail-building-count badge bg-secondary">${totalRooms} room${totalRooms !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    `;

    // Floor sub-sections + room cards
    for (const [floorName, floorRooms] of floorMap) {
      html += renderFloorHeader(floorName, floorRooms.length);
      html += floorRooms.map((room) => renderRoomCard(room, date, slot, buildingName)).join('');
    }
    return html;
  }

  /** Render availability results grouped by building then floor. */
  function renderAvailabilityGrouped(rooms, date, slot) {
    if (!rooms.length) {
      return '<div class="col-12"><div class="card room-filter-empty"><div class="card-body text-center text-muted-sm py-4">No rooms found for this selection.</div></div></div>';
    }
    const grouped = groupRoomsByBuildingAndFloor(rooms);
    let html = '';
    for (const [buildingName, floorMap] of grouped) {
      html += renderBuildingSection(buildingName, floorMap, date, slot);
    }
    return html;
  }

  /** Render the header for the availability detail view. */
  function renderAvailabilityHeader(date, slotLabel, buildingName) {
    const when = slotLabel ? `Time Slot: ${P.escapeHtml(slotLabel)}` : 'Time Slot: All day';
    return `
      <div class="card bg-dark/20 border-secondary/30 rounded-3 mb-4">
        <div class="card-body py-3">
          <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div>
              <span class="availability-meta text-muted-small d-block">Date</span>
              <h6 class="mb-0 text-light">${P.escapeHtml(P.formatDate(date))}</h6>
            </div>
            <div>
              <span class="availability-meta text-muted-small d-block">${when}</span>
            </div>
            <div class="text-end">
              <span class="availability-meta text-muted-small d-block">Building</span>
              <h6 class="mb-0 text-light">${P.escapeHtml(buildingName || 'All buildings')}</h6>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ------------------------------------- real-time status indicators --- */

  const statusGrid = document.getElementById('home-status-grid');

/* Equipment icon labels mapped to room boolean fields. */
const EQUIPMENT_ICONS = [
  { key: 'has_projector', label: 'Projector', icon: '📽️' },
  { key: 'has_aircon',      label: 'AirCon',      icon: '❄️' },
  { key: 'has_sound',       label: 'Sound System',icon: '🔊' }
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
    return `Class in Session (${current.requested_by || "CS 101"}) � until ${displayHr}:${endMinDisplay} ${ampm}`;
  }
  return "Fully Booked until 5:00 PM";
}

/* ------------------------------------- reactive lab state ------ */
/** Live, reactive mirror of the high-demand lab cards.
 *  Kept in sync with the backend on every page load and after any
 *  booking transaction so the cards toggle Available <-> Occupied
 *  without a page reload. */
let labState = []; // { room, tone, remark, occ, date, slot }

/** Compute the overall status tone for a building from its rooms.
 *  Occupied if any room has an active booking now.
 *  Limited if any room has pending/bookings today (but none occupied).
 *  Available if all rooms have zero bookings. */
function buildingStatus(rooms) {
  let hasOccupied = false;
  let hasLimited = false;
  for (const room of rooms) {
    const status = roomStatus(room, P.todayIso(), null);
    if (status.tone === 'occupied') { hasOccupied = true; break; }
    if (status.tone === 'limited') hasLimited = true;
  }
  if (hasOccupied) return 'occupied';
  if (hasLimited) return 'limited';
  return 'available';
}

/** Get a background image for a building card. */
function buildingImageUrl(buildingName, rooms) {
  const key = String(buildingName).trim().toUpperCase().replace(/\s+/g, ' ');
  if (BUILDING_BACKGROUNDS[key]) return BUILDING_BACKGROUNDS[key];
  // Fall back to first room's image_url
  for (const room of rooms) {
    if (room.image_url) return room.image_url;
  }
  return null;
}

/** Group rooms by building and render building cards with live status badges. */
function renderStatusGroups(rooms) {
  if (!statusGrid) return;

  // Group rooms by building name
  const byBuilding = new Map();
  rooms.forEach((room) => {
    const bName = room.building_name || 'Unknown Building';
    if (!byBuilding.has(bName)) byBuilding.set(bName, []);
    byBuilding.get(bName).push(room);
  });

  let html = '';
  let anyShown = false;

  for (const [buildingName, buildingRooms] of byBuilding) {
    const tone = buildingStatus(buildingRooms);
    const labCount = buildingRooms.length;
    const imgUrl = buildingImageUrl(buildingName, buildingRooms);
    anyShown = true;

    const imgHtml = imgUrl
      ? `<img class="home-building-card-photo" src="${P.escapeHtml(imgUrl)}" alt="${P.escapeHtml(buildingName)}" loading="lazy">`
      : `<div class="home-building-card-photo-placeholder"><span class="home-building-card-icon">🏛️</span></div>`;

    const statusLabels = {
      available: { text: 'Available', dot: 'is-available' },
      limited:   { text: 'Limited Availability', dot: 'is-limited' },
      occupied:  { text: 'Occupied', dot: 'is-occupied' }
    };
    const sl = statusLabels[tone];

    html += `
      <article class="home-building-card is-${tone}" data-building="${P.escapeHtml(buildingName)}">
        ${imgHtml}
        <div class="home-building-card-overlay">
          <span class="home-building-badge labs-badge">${labCount} lab${labCount !== 1 ? 's' : ''}</span>
          <span class="home-building-badge status-badge is-${tone}">${sl.text}</span>
        </div>
        <div class="home-building-card-body">
          <h3>${P.escapeHtml(buildingName)}</h3>
          <p class="home-building-card-meta">${labCount} laboratory${labCount !== 1 ? 'ies' : ''} • Live status</p>
        </div>
      </article>
    `;
  }

  if (!anyShown) {
    statusGrid.innerHTML = '<div class="home-status-loading">No active rooms to show right now.</div>';
  } else {
    statusGrid.innerHTML = html;
  }
}

/** Fetch live room statuses from the backend and re-render the 3 buildings. */
async function fetchRoomStatuses() {
  if (!statusGrid) return;
  try {
    const data = await P.api('/api/rooms/status');
    const rooms = data.rooms || [];
    labState = rooms.map((room) => {
      const status = roomStatus(room, P.todayIso(), null);
      return {
        room,
        tone: status.tone,
        remark: generateRemark(room, status),
        occ: occupancyPct(room),
        date: P.todayIso(),
        slot: null
      };
    });
    renderStatusGroups(rooms);
  } catch {
    statusGrid.innerHTML = '<div class="home-status-loading">Live availability is temporarily unavailable. Open the full timetable to check rooms.</div>';
  }
}

/** Attach click handlers to lab action buttons. */
function attachLabActionHandlers() {
  document.querySelectorAll('.home-lab-action').forEach((btn) => {
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
  });
  document.querySelectorAll('.home-lab-action').forEach((btn) => {
    btn.addEventListener('click', () => {
      const roomId = Number(btn.dataset.roomId);
      const action = btn.dataset.action;
      if (action === 'book') openLabBookingModal(roomId);
      else window.location.href = '/rooms-status.html';
    });
  });
}

/** Open the inline booking drawer pre-filled with a lab. */
function openLabBookingModal(roomId) {
  const state = labState.find((s) => s.room.id === roomId);
  if (!state) return;
  const { room } = state;
  document.getElementById('lab-booking-room-id').value = room.id;
  document.getElementById('lab-booking-room-field').value = room.name;
  document.getElementById('lab-booking-building-field').value = room.building_name;
  document.getElementById('lab-booking-capacity-field').value = room.capacity || '-';
  document.getElementById('lab-booking-date').value = P.todayIso();
  document.getElementById('lab-booking-purpose').value = '';
  document.getElementById('lab-booking-alert').classList.add('d-none');
  const modalEl = document.getElementById('lab-booking-modal');
  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modal.show();
}

/** Refresh the live lab status from the backend (reactive re-render). */
async function refreshLabStatus() {
  await fetchRoomStatuses();
  const heroCount = document.getElementById('hero-rooms-count');
  if (heroCount) {
    const openRooms = (labState || []).filter((s) => s.tone === 'available');
    const openCount = openRooms.length;
    heroCount.textContent = openCount > 0 ? `${openCount} Room${openCount === 1 ? '' : 's'} Available Now` : 'Checking Live Availability�';
  }
}

/* ------------------------------------------- cross-tab refresh --- */

// Listen for availability changes broadcast from other tabs/pages
// (reservation created, approved, rejected, cancelled, room/building managed).
try {
  const availabilityChannel = new BroadcastChannel('cspc-availability');
  availabilityChannel.onmessage = (event) => {
    if (event && event.data && event.data.type === 'availability-changed') {
      refreshLabStatus();
    }
  };
} catch {
  // BroadcastChannel not supported: fall back to storage event.
  window.addEventListener('storage', (event) => {
    if (event.key === 'cspc-availability-changed') {
      refreshLabStatus();
    }
  });
}

// Refresh when the user returns to this tab so the cards stay current.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refreshLabStatus();
  }
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    refreshLabStatus();
  }
});

function statusCard(room, dateValue, slot, remark) {
  const status = roomStatus(room, dateValue, slot);
  const type = P.ROOM_TYPE_LABELS[room.room_type] || room.room_type || "Laboratory";
  const roomCode = `L-${String(room.id).padStart(3, "0")}`;
  const meta = [room.building_name, room.capacity ? `Seats ${room.capacity}` : ""]
    .filter(Boolean).map(P.escapeHtml).join(" � ");
  const occ = occupancyPct(room);
  const equip = equipmentHtml(room);
  const buildingImg = room.image_url
    ? `<img class="home-lab-card-photo" src="${P.escapeHtml(room.image_url)}" alt="${P.escapeHtml(room.building_name)} building" loading="lazy">`
    : `<div class="home-lab-card-photo-placeholder"><span class="home-lab-building-icon">???</span></div>`;
  const tone = status.tone;
  const statusIcon = tone === "available" ? "??" : tone === "limited" ? "??" : "??";
  const statusText = tone === "available" ? "Available" : tone === "limited" ? "Limited" : "Occupied";
  const actionText = tone === "available" ? "Book Room" : "View Schedule";
  const btnClass = tone === "available" ? "btn-cspc" : "btn-outline-secondary";
  const remarkText = remark || generateRemark(room, status);
  return `
    <article class="home-lab-card is-${tone}" data-room-id="${room.id}">
      ${buildingImg}
      <div class="home-lab-card-body">
        <div class="home-lab-card-top">
          <span class="home-lab-badge is-${tone} status-${tone}" aria-hidden="true">${statusIcon}</span>
          <span class="home-lab-badge is-${tone} status-${tone}">${P.escapeHtml(statusText)}</span>
          <span class="home-lab-type">${P.escapeHtml(type)}</span>
        </div>
        <h3>${P.escapeHtml(room.name)} <span class="home-lab-code">${roomCode}</span></h3>
        <p class="home-lab-card-meta">${meta}</p>
        ${equip}
        <div class="home-lab-card-remark">${P.escapeHtml(remarkText)}</div>
        <div class="home-lab-occ">
          <span class="home-lab-occ-label">Utilization</span>
          <div class="home-lab-occ-bar"><div class="home-lab-occ-fill is-${tone}" style="width: ${occ}%"></div></div>
          <span class="home-lab-occ-pct">${occ}%</span>
        </div>
        <div class="home-lab-actions">
          <button class="btn ${btnClass} home-lab-action" data-room-id="${room.id}" data-action="${tone === "available" ? "book" : "view"}">${P.escapeHtml(actionText)}</button>
          <a href="/rooms-status.html" class="btn btn-sm btn-outline-cspc">Schedule</a>
        </div>
      </div>
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


  searchForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!searchResult) return;

    // --- Validate date ---
    const date = searchDate?.value?.trim();
    if (!date) {
      searchResult.hidden = false;
      searchResult.innerHTML = '<div class="alert alert-danger">Please select a date.</div>';
      searchDate?.focus();
      return;
    }

    const slot = parseSlot(searchTime?.value);
    const buildingId = buildingIdInput?.value?.trim();
    const buildingName = searchBuilding?.value?.trim() || 'All buildings';
    const params = new URLSearchParams({ date });
    if (buildingId) params.set('building_id', buildingId);

    P.busy(searchSubmit, true, 'Checking...');
    try {
      const data = await P.api(`/api/availability?${params.toString()}`);
      const rooms = data.rooms || [];

      // Compute per-room status for the selected slot
      const roomStatuses = rooms.map((room) => {
        const status = roomSlotStatus(room, slot);
        return { room, status };
      });

      const matches = roomStatuses.filter(({ status }) => status.tone === 'available');
      const occupiedCount = roomStatuses.filter(({ status }) => status.tone === 'occupied').length;
      const limitedCount = roomStatuses.filter(({ status }) => status.tone === 'limited').length;
      const availableCount = matches.length;

      const when = slot ? `for <strong>${P.escapeHtml(slot.label)}</strong>` : 'all day';

      // Summary chips
      searchResult.hidden = false;
      searchResult.innerHTML =
        `<div class="home-search-summary" role="status" aria-live="polite">` +
        `<span class="home-search-summary-chip available"><strong>${availableCount}</strong> Available</span>` +
        `<span class="home-search-summary-chip limited"><strong>${limitedCount}</strong> Limited</span>` +
        `<span class="home-search-summary-chip occupied"><strong>${occupiedCount}</strong> Occupied</span>` +
        `</div>` +
        `<p class="mb-1 text-muted-sm">${rooms.length} total room(s) ${when} on <strong>${P.escapeHtml(P.formatDate(date))}</strong> in <strong>${P.escapeHtml(buildingName)}</strong>.</p>`;

      // Render the structured live availability view
      if (availabilityView && availabilityHeader && availabilityGrid) {
        availabilityHeader.innerHTML = renderAvailabilityHeader(date, slot ? slot.label : null, buildingName);

        const roomsToShow = rooms.length ? rooms : [];
        availabilityGrid.innerHTML = renderAvailabilityGrouped(roomsToShow, date, slot);
        availabilityView.hidden = false;
        availabilityView.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      // Also refresh the live status grid with the same filters
      fetchRoomStatuses();
    } catch (err) {
      P.toastError(`Could not check availability: ${err.message}`);
    } finally {
      P.busy(searchSubmit, false);
    }
  });

  /* Click anywhere on a room card to open the reservation form pre-filled */
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.clickable-room-card');
    if (!card) return;
    // Don't navigate if clicking the Reserve Room button itself (it already links)
    if (e.target.closest('.btn')) return;
    const url = card.dataset.reserveUrl;
    if (url) window.location.href = url;
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

  /* ---------------------------------- inline lab booking trigger ------ */
  const labBookingForm = document.getElementById('lab-booking-form');
  const labBookingSubmit = document.getElementById('lab-booking-submit');
  const labBookingAlert = document.getElementById('lab-booking-alert');
  if (labBookingForm && labBookingSubmit) {
    labBookingForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      labBookingAlert.classList.add('d-none');
      const roomId = Number(document.getElementById('lab-booking-room-id').value);
      const date = document.getElementById('lab-booking-date').value;
      const start = document.getElementById('lab-booking-start').value;
      const end = document.getElementById('lab-booking-end').value;
      const purpose = document.getElementById('lab-booking-purpose').value.trim();
      if (!roomId || !date || !start || !end || !purpose) {
        labBookingAlert.textContent = 'Please fill in all booking fields.';
        labBookingAlert.classList.remove('d-none');
        return;
      }
      if (end <= start) {
        labBookingAlert.textContent = 'End time must be later than start time.';
        labBookingAlert.classList.remove('d-none');
        return;
      }
      P.busy(labBookingSubmit, true, 'Requesting�');
      try {
        await P.api('/api/reservations', {
          method: 'POST',
          body: { room_id: roomId, res_date: date, start_time: start, end_time: end, purpose, attendees: 1 }
        });
        P.toastOk('Booking requested. The lab cards will refresh live.');
        const modalEl = document.getElementById('lab-booking-modal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal?.hide();
        labBookingForm.reset();
        await refreshLabStatus();
        P.broadcastAvailabilityChange();
      } catch (err) {
        labBookingAlert.textContent = err.message || 'Could not request booking. Please sign in and try again.';
        labBookingAlert.classList.remove('d-none');
      } finally {
        P.busy(labBookingSubmit, false);
      }
    });
  }

  /* ---- auto-refresh: re-fetch every 30 seconds, pause when tab is hidden ---- */
  let statusRefreshTimer = null;
  function startStatusRefresh() {
    if (statusRefreshTimer) clearInterval(statusRefreshTimer);
    statusRefreshTimer = setInterval(fetchRoomStatuses, 30000);
  }
  function stopStatusRefresh() {
    if (statusRefreshTimer) {
      clearInterval(statusRefreshTimer);
      statusRefreshTimer = null;
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchRoomStatuses();
      startStatusRefresh();
    } else {
      stopStatusRefresh();
    }
  });

  fetchRoomStatuses();
  startStatusRefresh();
})();


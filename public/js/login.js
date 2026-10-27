/* Login page: signs the user in and sends them to the dashboard. */
'use strict';

(async function () {
  const P = window.Portal;
  const { api, getSession, toastOk, toastInfo, queryParam, busy } = P;

  // Already signed in? Skip straight to the dashboard.
  const session = await getSession();
  P.renderNavbar(session.user, 'login');
  if (session.authenticated) {
    P.redirectTo('/dashboard.html');
    return;
  }

  const form = document.getElementById('login-form');
  const alertBox = document.getElementById('login-alert');
  const submitBtn = document.getElementById('login-btn');
  const loginTabs = [...document.querySelectorAll('.auth-mode-btn')];
  const schoolIdLabel = document.getElementById('school_id_label');
  const schoolIdHint = document.getElementById('school_id_hint');
  const authModeBanner = document.getElementById('auth-mode-banner');
  const registerLink = document.querySelector('[data-registration-link]');

  form.school_id.setAttribute('type', 'email');
  form.school_id.setAttribute('inputmode', 'email');
  schoolIdLabel.textContent = 'Email address';
  form.school_id.placeholder = 'Enter your email address (e.g. name@cspc.edu.ph)';
  if (schoolIdHint) schoolIdHint.textContent = 'Use your official @cspc.edu.ph or @my.cspc.edu.ph email address to log in.';

  function showAlert(message, type = 'danger') {
    alertBox.className = `alert alert-${type}`;
    alertBox.textContent = message;
    alertBox.classList.remove('d-none');
  }

  function applyAuthMode(mode) {
    const isAdmin = mode === 'admin';
    // Errors belong to the mode that produced them, so clear them on switch.
    alertBox.classList.add('d-none');
    // The two tabs share one form, so clear typed credentials when switching
    // roles — prevents user login details showing in the admin login.
    const modeChanged = (form.dataset.mode || 'user') !== (isAdmin ? 'admin' : 'user');
    form.dataset.mode = mode;
    if (modeChanged) {
      [form.school_id, form.password].filter(Boolean).forEach((input) => {
        input.value = '';
        input.classList.remove('is-invalid');
      });
    }
    document.body.classList.toggle('admin-login-mode', isAdmin);

    loginTabs.forEach((tab) => {
      const active = tab.dataset.authMode === mode;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-pressed', String(active));
    });

    schoolIdLabel.textContent = isAdmin ? 'Admin email address' : 'Email address';
    form.school_id.placeholder = isAdmin ? 'Enter your email address (e.g. name@cspc.edu.ph)' : 'Enter your email address (e.g. name@cspc.edu.ph)';
    submitBtn.textContent = isAdmin ? 'Login' : 'Log in';

    authModeBanner.classList.toggle('admin-mode', isAdmin);
    if (registerLink) registerLink.classList.toggle('d-none', isAdmin);
    const badgeText = isAdmin ? 'Administrator Portal' : 'User Portal';
    authModeBanner.innerHTML = `<span class="admin-portal-badge">${badgeText}</span>`;
    const modeText = isAdmin
      ? 'Secure backend access for system administrators.'
      : 'Sign in with your school ID number or CSPC email to book a laboratory or room.';
    const heroText = document.querySelector('.auth-hero p');
    if (heroText) heroText.textContent = modeText;
  }

  const isAdminPage = document.body.dataset.loginPage === 'admin' || window.location.pathname === '/admin/login' || queryParam('mode') === 'admin';
  const initialMode = isAdminPage ? 'admin' : 'user';
  applyAuthMode(initialMode);

  loginTabs.forEach((tab) => {
    tab.addEventListener('click', () => applyAuthMode(tab.dataset.authMode));
  });

  // Friendly messages for query-string hints from server redirects.
  if (queryParam('error') === 'login_required') {
    showAlert('Please log in to continue.', 'warning');
  } else if (queryParam('error') === 'admin_required') {
    showAlert('Access denied. Administrator privileges are required.', 'danger');
  } else if (queryParam('logged_out')) {
    showAlert('You have been logged out.', 'success');
  } else if (queryParam('registered')) {
    showAlert('Account created. Welcome!', 'success');
  } else {
    const GOOGLE_LOGIN_ERRORS = {
      google_cancelled: ['Google sign-in was cancelled. You can try again or use your school ID instead.', 'warning'],
      google_not_configured: ['Google sign-in is not configured yet. Please use your school ID and password until the SSO provider is set up.', 'warning'],
      google_domain: ['Please sign in with your official CSPC Google account (@cspc.edu.ph or @my.cspc.edu.ph).', 'danger'],
      google_inactive: ['This account has been deactivated. Please contact the administrator.', 'danger'],
      google_forbidden: ['Access denied. Administrator privileges are required.', 'danger'],
      google_failed: ['Google sign-in could not be completed. Please log in with your school ID and password.', 'danger']
    };
    const googleErrorCode = queryParam('error');
    const googleError = GOOGLE_LOGIN_ERRORS[googleErrorCode];
    if (googleError) {
      let message = googleError[0];
      const usedEmail = googleErrorCode === 'google_domain'
        ? String(queryParam('email') || '').trim().slice(0, 254)
        : '';
      if (usedEmail) {
        message = `${message} You signed in as ${usedEmail} - use the Google button again and pick your school account.`;
      }
      showAlert(message, googleError[1]);
    }
  }

  const passwordResetModal = new bootstrap.Modal(document.getElementById('password-reset-modal'));
  const supportModal = new bootstrap.Modal(document.getElementById('support-modal'));
  if (queryParam('open_support') === '1') supportModal.show();
  const forgotPasswordLink = document.getElementById('forgot-password-link');
  const supportLink = document.getElementById('support-link');
  const passwordResetForm = document.getElementById('password-reset-form');
  const supportForm = document.getElementById('support-form');

  const googleBtn = document.getElementById('sso-google');
  if (googleBtn) {
    // Single-click OAuth handoff: /api/auth/google builds the consent-screen
    // URL server-side (CSRF state nonce included) and verifies the callback.
    // Until GOOGLE_CLIENT_ID/SECRET are set in .env the config endpoint
    // reports { configured: false } and the button keeps its friendly notice.
    googleBtn.addEventListener('click', async () => {
      try {
        const cfg = await api('/api/auth/google/config');
        if (!cfg.configured) {
          toastInfo('Google sign-in is not configured yet. Please use your school ID and password until the SSO provider is set up.');
          return;
        }

        busy(googleBtn, true, 'Opening Google...');
        const type = isAdminPage ? 'admin' : 'user';
        const returnTo = isAdminPage ? 'admin-login' : 'home';
        window.location.assign(`/api/auth/google?type=${type}&return=${returnTo}`);
      } catch {
        toastInfo('Unable to start Google sign-in right now. Please try again or use your school ID and password.');
        busy(googleBtn, false);
      }
    });
  }

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (event) => {
      event.preventDefault();
      passwordResetModal.show();
    });
  }

  if (passwordResetForm) {
    passwordResetForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const emailField = document.getElementById('reset-email');
      const emailValue = (emailField.value || '').trim();
      if (!emailValue) return;

      const subject = encodeURIComponent('Password reset request');
      const body = encodeURIComponent(`Hello,\n\nI need to reset my password for account: ${emailValue}\n\nPlease send me the reset instructions.\n`);
      window.location.href = `mailto:helpdesk@cspc.edu.ph?subject=${subject}&body=${body}`;
      toastOk('Password reset instructions are being prepared for your email client.');
      passwordResetModal.hide();
      passwordResetForm.reset();
    });
  }

  if (supportLink) {
    supportLink.addEventListener('click', (event) => {
      event.preventDefault();
      supportModal.show();
    });
  }

  if (supportForm) {
    supportForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const fullname = document.getElementById('support-fullname');
      const role = document.getElementById('support-role');
      const contact = document.getElementById('support-email');
      const category = document.getElementById('support-category');
      const description = document.getElementById('support-description');

      const values = {
        full_name: (fullname.value || '').trim(),
        role_department: (role.value || '').trim(),
        contact: (contact.value || '').trim(),
        category: (category.value || '').trim(),
        description: (description.value || '').trim()
      };

      if (!values.full_name || !values.role_department || !values.contact || !values.category || !values.description) {
        toastInfo('Please complete all fields before submitting your support request.');
        return;
      }

      if (/password|passcode|secret|token|otp|pin|credential/i.test(values.description) || /password|passcode|secret|token|otp|pin|credential/i.test(values.full_name)) {
        toastInfo('Please do not include passwords or credentials in this form. Contact the IT desk directly by phone or email if needed.');
        return;
      }

      try {
        const response = await api('/api/support', {
          method: 'POST',
          body: values
        });

        toastOk(response.message || 'Your support request was submitted successfully.');
        supportModal.hide();
        supportForm.reset();
      } catch (err) {
        toastInfo(err.message || 'Unable to submit your support request right now.');
      }
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alertBox.classList.add('d-none');
    const mode = form.dataset.mode || 'user';
    busy(submitBtn, true, mode === 'admin' ? 'Authenticating...' : 'Signing in...');
    try {
      const payload = {
        email: form.school_id.value.trim().toLowerCase(),
        password: form.password.value,
        login_type: mode
      };

      const data = await api('/api/auth/login', {
        method: 'POST',
        body: payload
      });

      if (mode === 'admin' && data.user.role !== 'admin') {
        throw Object.assign(new Error('Access denied. Administrator privileges are required.'), { status: 403 });
      }

      toastOk(data.message || 'Welcome back!');
      setTimeout(() => P.redirectTo(data.redirect || '/dashboard.html'), 500);
    } catch (err) {
      showAlert(err.message);
      busy(submitBtn, false);
    }
  });
})();
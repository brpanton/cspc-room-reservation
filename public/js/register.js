/* Registration page: creates a student/faculty account and logs them in. */
'use strict';

(async function () {
  const P = window.Portal;
  const { api, getSession, toastOk, busy } = P;

  const session = await getSession();
  P.renderNavbar(session.user, 'register');
  if (session.authenticated) {
    P.redirectTo('/dashboard.html');
    return;
  }

  const form = document.getElementById('register-form');
  const alertBox = document.getElementById('register-alert');
  const submitBtn = document.getElementById('register-btn');

  function showAlert(message) {
    alertBox.className = 'alert alert-danger';
    alertBox.textContent = message;
    alertBox.classList.remove('d-none');
  }

  /** Client-side checks that mirror the server rules, for instant feedback. */
  function validate() {
    const schoolId = form.school_id.value.trim();
    const fullName = form.full_name.value.trim();
    const password = form.password.value;

    if (!/^[A-Za-z0-9-]{4,50}$/.test(schoolId)) {
      return 'ID number may only contain letters, digits and dashes (4-50 characters).';
    }
    if (fullName.length < 3 || fullName.length > 120) {
      return 'Full name must be between 3 and 120 characters.';
    }
    if (password.length < 8) return 'Password must be at least 8 characters long.';
    if (password.length > 72) return 'Password must be 72 characters or fewer.';
    if (password !== form.confirm_password.value) return 'The two passwords do not match.';
    return null;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alertBox.classList.add('d-none');

    const problem = validate();
    if (problem) return showAlert(problem);

    busy(submitBtn, true, 'Creating account...');
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: {
          school_id: form.school_id.value.trim(),
          full_name: form.full_name.value.trim(),
          email: form.email.value.trim(),
          password: form.password.value,
          role: form.role.value,
          department: form.department.value.trim()
        }
      });
      toastOk(data.message || 'Registration successful.');
      setTimeout(() => P.redirectTo('/dashboard.html'), 600);
    } catch (err) {
      showAlert(err.message);
      busy(submitBtn, false);
    }
  });
})();
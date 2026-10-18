/**
 * CSPC Lab & Room Reservation System - Express entry point.
 *
 *   npm run init-db   (first time only: creates schema + demo data)
 *   npm start         -> http://localhost:3000
 *
 * Serves the static frontend from /public and a JSON API under /api.
 */
require('dotenv').config();

const path = require('path');

const express = require('express');
const session = require('express-session');

const MySqlSessionStore = require('./session-store');

const { testConnection } = require('./db');
const { attachUser, requireLogin, requireStaff, requireAdmin } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const reservationRoutes = require('./routes/reservations');
const adminRoutes = require('./routes/admin');
const supportRoutes = require('./routes/support');
const profileRoutes = require('./routes/profile');
const passwordResetRoutes = require('./routes/password-reset');

const app = express();
const PORT = Number(process.env.PORT || 3000);

// When deployed behind a TLS-terminating proxy, set TRUST_PROXY=1 in .env so
// express can read X-Forwarded-Proto and `secure: 'auto'` below knows the
// connection is HTTPS. Leave unset on plain http://localhost during development.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

// ---------------------------------------------------------------- middleware
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true }));

const SESSION_SECRET_FALLBACK = 'cspc-reservation-portal-dev-secret';
const sessionSecret = String(process.env.SESSION_SECRET || '').trim() || SESSION_SECRET_FALLBACK;
if (process.env.NODE_ENV === 'production' && sessionSecret === SESSION_SECRET_FALLBACK) {
  console.warn(
    '[session] WARNING: SESSION_SECRET is still the dev default - set a long random value in .env before deploying.'
  );
}

app.use(
  session({
    name: 'cspc.sid',
    secret: sessionSecret,
    // Durable MySQL-backed store: logins survive server restarts. The old
    // in-memory default dropped every session whenever the process recycled.
    store: new MySqlSessionStore(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      // Session id unreadable from page JavaScript (XSS hygiene).
      httpOnly: true,
      sameSite: 'lax',
      // 'auto' adds the Secure flag automatically on HTTPS connections and
      // omits it on plain http://localhost during development.
      secure: 'auto',
      maxAge: 1000 * 60 * 60 * 8 // 8-hour working session
    }
  })
);

app.use(attachUser);

// ------------------------------------------------------------------- routes
app.use('/api/auth', authRoutes);
app.use('/api', roomRoutes); // public: buildings, rooms, availability
app.use('/api/reservations', reservationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/profile', profileRoutes);
// Password recovery ("Forgot password?" -> OTP email -> reset). Separate file
// for the flow, but same /api/auth prefix as register/login/change-password.
app.use('/api/auth', passwordResetRoutes);

// Avatars are generated raster image files, stored outside the public source tree.
app.use('/uploads/avatars', express.static(path.join(__dirname, 'uploads', 'avatars'), {
  fallthrough: false,
  index: false,
  dotfiles: 'deny',
  maxAge: '1d'
}));

/** Convenience endpoint the frontend uses to fetch "who am I" + nav data. */
app.get('/api/session', (req, res) => {
  if (!req.session.user) return res.json({ authenticated: false, user: null });
  res.json({ authenticated: true, user: req.session.user });
});

app.get('/api/health', async (req, res) => {
  try {
    await testConnection();
    res.json({ status: 'ok', database: 'connected', time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'unreachable', detail: err.message });
  }
});

// ------------------------------------------------------- page-level guards
// The HTML pages are static, so access control for the staff-only screens is
// applied here before express.static gets a chance to serve the file.
app.get('/dashboard.html', requireLogin, (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'))
);
app.get('/reservation-form.html', requireLogin, (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'reservation-form.html'))
);
app.get('/admin-management.html', requireAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin-management.html'))
);
app.get('/admin-dashboard.html', requireAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'))
);
app.get('/admin', requireAdmin, (req, res) =>
  res.redirect('/admin-dashboard.html')
);
// Dedicated admin login page: separate from the public user portal.
app.get('/admin/login', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'))
);
/** Alias used by the custodian dashboard's "Review requests" button. */
app.get('/approvals.html', requireStaff, (req, res) =>
  res.redirect('/dashboard.html?tab=pending')
);

// The public homepage is the visitor entry point; the sign-in form remains at /index.html.
app.get('/', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'home.html'))
);
app.get('/index.html', (req, res) => {
  const query = new URLSearchParams(req.query);
  if (!query.has('auth') && !query.has('logged_out')) query.set('auth', 'login');
  res.redirect(`/?${query.toString()}`);
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// -------------------------------------------------------------- error handling
/** 404 for anything unmatched. */
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found.' });
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

/** Central error handler: turns thrown errors into consistent JSON. */
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);

  res.status(status).json({
    error: err.message || 'An unexpected server error occurred.',
    code: err.code || undefined
  });
});

// -------------------------------------------------------------------- start
async function start() {
  try {
    await testConnection();
    console.log('[db] MySQL connection established.');
  } catch (err) {
    console.error('\n[db] Could not connect to MySQL:', err.message);
    console.error('[db] Check your .env settings and make sure MySQL is running.');
    console.error('[db] First time? Run:  npm run init-db\n');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`\n  CSPC Reservation Portal`);
    console.log(`  ------------------------------------------`);
    console.log(`  Running at http://localhost:${PORT}`);
    console.log(`  ------------------------------------------\n`);
  });
}

start();

module.exports = app;

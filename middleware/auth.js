/**
 * Session-based authentication guards.
 *
 * The session stores { id, full_name, role, school_id } after a successful
 * login, so every guard is a synchronous property lookup.
 */

/** Populates res.locals.user so views/JSON responses know who is asking. */
function attachUser(req, res, next) {
  res.locals.user = req.session && req.session.user ? req.session.user : null;
  next();
}

/** Blocks anonymous visitors. Returns 401 JSON for /api/*, else redirects. */
function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not authenticated. Please log in.' });
  }
  return res.redirect('/index.html?error=login_required');
}

/** Blocks anybody who is not a custodian or admin (the approvers). */
function requireStaff(req, res, next) {
  const user = req.session && req.session.user;
  if (user && (user.role === 'custodian' || user.role === 'admin')) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(403).json({ error: 'Staff access (custodian or admin) is required.' });
  }
  return res.redirect('/dashboard.html?error=forbidden');
}

/** Blocks anybody who is not an admin. */
function requireAdmin(req, res, next) {
  const user = req.session && req.session.user;
  if (user && user.role === 'admin') return next();

  if (req.path.startsWith('/api/')) {
    return res.status(403).json({ error: 'Administrator access is required.' });
  }
  return res.redirect('/index.html?error=admin_required');
}

/** True when the given user may act on the given reservation. */
function canManageReservation(user, reservation) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'custodian') return true;
  return reservation.user_id === user.id;
}

module.exports = { attachUser, requireLogin, requireStaff, requireAdmin, canManageReservation };

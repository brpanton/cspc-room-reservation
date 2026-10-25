/* ============================================================
   CSPC Reservation Portal - Student Dashboard
   Clean, responsive, fully data-connected student dashboard.
   ============================================================ */
'use strict';

(async function () {
  const P = window.Portal;
  const {
    api, requireRole, renderNavbar, escapeHtml, formatTime, formatDateShort, getLocale,
    statusBadge, emptyRow, toastOk, toastError, busy, queryParam, todayIso
  } = P;

  /* ------------------------------------------------------------- auth ---- */
  const user = await requireRole();
  if (!user) return;

  /* Navbar (Home | Dashboard | Room Status | About Us) is rendered by app.js.
     Hide any admin / management entries for students. */
  renderNavbar(user, 'dashboard');
  if (user.role !== 'admin' && user.role !== 'custodian') {
    const adminItems = document.querySelectorAll(
      '.profile-menu .dropdown-item#add-admin-menu-item, .portal-nav-link[href="/admin-dashboard.html"], .portal-nav-link[href="/admin-management.html"]'
    );
    adminItems.forEach((el) => el.style.display = 'none');
    const adminHeadings = document.querySelectorAll('.profile-menu-heading');
    adminHeadings.forEach((h) => {
      if (h.textContent.trim() === 'Administration') {
        const next = h.nextElementSibling;
        if (next && next.classList.contains('dropdown-item')) next.style.display = 'none';
      }
    });
  }

  /* ------------------------------------------------------------- state --- */
  const loadingEl = document.getElementById('dashboard-loading');
  const bodyEl = document.getElementById('reservations-body');
  const statEls = {
    total: document.getElementById('stat-total'),
    pending: document.getElementById('stat-pending'),
    approved: document.getElementById('stat-approved'),
    rejected: document.getElementById('stat-rejected')
  };
  const labStatusEl = document.getElementById('laboratory-status');
  const snapshotEl = document.getElementById('room-snapshot');
  const activityEl = document.getElementById('activity-feed');

  const state = { status: '', items: [] };

  /* ------------------------------------------------------------- clock --- */
  function updateDashboardClock() {
    const stamp = document.getElementById('dashboard-timestamp');
    if (!stamp) return;
    const now = new Date();
    stamp.textContent = now.toLocaleString(getLocale(), {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }
  updateDashboardClock();
  setInterval(updateDashboardClock, 60000);

  /* ------------------------------------------------- welcome banner ------ */
  function renderWelcome() {
    const fullName = String(user.full_name || '').trim();
    const firstName = fullName.split(/\s+/)[0] || 'there';
    const initials = fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || '?';

    const usernameEl = document.getElementById('welcome-username');
    const avatarInitialsEl = document.getElementById('dashboard-avatar-initials');
    const avatarImgEl = document.getElementById('dashboard-avatar-img');

    if (usernameEl) usernameEl.textContent = escapeHtml(firstName);
    if (avatarInitialsEl) {
      avatarInitialsEl.textContent = escapeHtml(initials);
      avatarInitialsEl.hidden = false;
    }
    if (avatarImgEl) {
      avatarImgEl.hidden = true;
    }

    const manageRoomsBtn = document.querySelector('[data-shortcut="room-status"]');
    if (manageRoomsBtn) manageRoomsBtn.style.display = 'none';
  }
  renderWelcome();

  /* ------------------------------------------------------------- stats --- */
  function computeStats(items) {
    const stats = { total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    items.forEach((r) => {
      stats.total += 1;
      const s = String(r.status || '').toLowerCase();
      if (s === 'pending') stats.pending += 1;
      else if (s === 'approved') stats.approved += 1;
      else if (s === 'rejected') stats.rejected += 1;
      else if (s === 'cancelled') stats.cancelled += 1;
    });
    return stats;
  }

  function renderStats(stats) {
    if (statEls.total) statEls.total.textContent = stats.total;
    if (statEls.pending) statEls.pending.textContent = stats.pending;
    if (statEls.approved) statEls.approved.textContent = stats.approved;
    if (statEls.rejected) statEls.rejected.textContent = stats.rejected;
  }

  /* ------------------------------------------------ laboratory status --- */
  async function loadLabStatus() {
    if (!labStatusEl) return;
    labStatusEl.innerHTML = '<div class="text-muted-small d-flex justify-content-center py-3">Loading campus lab status&hellip;</div>';
    try {
      const date = todayIso();
      const data = await api('/api/availability?date=' + date);
      const rooms = data.rooms || [];
      if (rooms.length === 0) {
        labStatusEl.innerHTML = '<div class="text-center text-muted-small py-3">No campus labs/rooms found.</div>';
        return;
      }

      const topRooms = rooms.slice(0, 6);
      labStatusEl.innerHTML = '<div class="row g-2">' +
        topRooms.map((r) => {
          const occ = r.occupancy_pct != null ? Number(r.occupancy_pct) : 0;
          const isAvailable = occ < 70;
          const badgeClass = isAvailable ? 'bg-success' : 'bg-warning';
          const badgeText = isAvailable ? 'Available' : 'Busy';
          return '<div class="col-6 col-sm-4 col-lg-4">' +
            '<div class="card lab-status-card h-100">' +
            '<div class="card-body p-3">' +
            '<div class="d-flex justify-content-between align-items-start mb-2">' +
            '<div class="fw-semibold">' + escapeHtml(r.name || 'Unnamed Room') + '</div>' +
            '<span class="badge ' + badgeClass + ' rounded-pill">' + badgeText + '</span>' +
            '</div>' +
            (r.building_name ? '<div class="text-muted-small mb-2">' + escapeHtml(r.building_name) + '</div>' : '') +
            '<div class="progress mt-2" style="height: 6px;">' +
            '<div class="progress-bar ' + (isAvailable ? 'bg-success' : 'bg-warning') + '"' +
            ' role="progressbar" style="width: ' + occ + '%"' +
            ' aria-valuenow="' + occ + '" aria-valuemin="0" aria-valuemax="100"></div>' +
            '</div>' +
            '<div class="mt-2 text-muted-small">' + occ + '% utilization</div>' +
            '</div></div></div>';
        }).join('') + '</div>';
    } catch (err) {
      console.error('[dashboard lab] Error:', err.message);
      labStatusEl.innerHTML = '<div class="text-center text-muted-small py-3">Could not load laboratory status.</div>';
    }
  }

  /* ------------------------------------------------ status helpers ------- */
  const STATUS_TONE = { Pending: 'warning', Approved: 'success', Rejected: 'danger', Cancelled: 'secondary' };

  function statusColor(status) {
    const map = { Pending: '#f59e0b', Approved: '#10b981', Rejected: '#ef4444', Cancelled: '#6b7280' };
    return map[status] || '#6b7280';
  }

  function timeAgo(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(value || ''));
    if (!m) return '';
    const then = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
    const secs = Math.round((Date.now() - then.getTime()) / 1000);
    const relative = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
    if (secs < 60) return relative.format(0, 'second');
    const mins = Math.round(secs / 60);
    if (mins < 60) return relative.format(-mins, 'minute');
    const hours = Math.round(mins / 60);
    if (hours < 24) return relative.format(-hours, 'hour');
    const days = Math.round(hours / 24);
    if (days < 30) return relative.format(-days, 'day');
    return formatDateShort(value);
  }

  /* ------------------------------------------------- activity feed ------ */
  function renderActivityFeed(items) {
    if (!activityEl) return;
    if (!items || items.length === 0) {
      activityEl.innerHTML = '<div class="text-center text-muted-small py-4">No recent activity. Your reservation timeline will appear here.</div>';
      return;
    }

    const sorted = [...items].sort((a, b) => {
      const da = new Date(a.updated_at || a.res_date || 0);
      const db = new Date(b.updated_at || b.res_date || 0);
      return db - da;
    }).slice(0, 6);

    activityEl.innerHTML = sorted.map((r) => {
      const statusLabel = String(r.status || 'Pending').charAt(0).toUpperCase() + String(r.status || 'Pending').slice(1).toLowerCase();
      const timeStr = r.res_date ? formatDateShort(r.res_date) : 'Recent';
      const updatedStr = r.updated_at ? timeAgo(r.updated_at) : '';
      return '<div class="activity-item d-flex align-items-start mb-3">' +
        '<div class="activity-bullet me-3 flex-shrink-0">' +
        '<span class="status-dot" style="background:' + statusColor(r.status) + ';"></span>' +
        '</div>' +
        '<div class="flex-fill">' +
        '<div class="d-flex justify-content-between align-items-baseline mb-1">' +
        '<span class="fw-semibold text-truncate me-2" style="max-width: 12rem;">' + escapeHtml(r.room_name || 'Room') + '</span>' +
        '<span class="text-muted-small">' + escapeHtml(updatedStr) + '</span>' +
        '</div>' +
        '<div class="d-flex justify-content-between align-items-center">' +
        '<span class="badge rounded-pill text-bg-' + (STATUS_TONE[r.status] || 'secondary') + '">' + escapeHtml(statusLabel) + '</span>' +
        '<span class="text-muted-small">' + escapeHtml(timeStr) + '</span>' +
        '</div></div></div>';
    }).join('');
  }

  /* ------------------------------------------------ room snapshot ------ */
  function renderRoomSnapshot(items) {
    if (!snapshotEl) return;
    const today = todayIso();
    const upcoming = items.filter((r) => {
      const resDate = String(r.res_date || '');
      return resDate >= today && (r.status || '').toLowerCase() !== 'cancelled';
    }).slice(0, 4);

    if (upcoming.length === 0) {
      snapshotEl.innerHTML = '<div class="text-center text-muted-small py-4">' +
        'No upcoming reservations this week.<br>' +
        '<a href="/reservation-form.html" class="text-primary text-decoration-none">+ Book a room &rarr;</a>' +
        '</div>';
      return;
    }

    snapshotEl.innerHTML = '<div class="list-group list-group-flush">' +
      upcoming.map((r) => '<div class="list-group-item list-group-item-action border-0 py-2">' +
        '<div class="d-flex justify-content-between align-items-start">' +
        '<div>' +
        '<div class="fw-semibold">' + escapeHtml(r.room_name || 'Room') + '</div>' +
        '<div class="text-muted-small">' + escapeHtml(r.building_name || '') + '</div>' +
        '</div>' +
        '<span class="badge rounded-pill text-bg-' + (STATUS_TONE[r.status] || 'secondary') + '">' +
        escapeHtml(String(r.status || 'Pending')) + '</span>' +
        '</div>' +
        '<div class="mt-2">' +
        '<span class="text-muted-small me-2">' + formatDateShort(r.res_date) + '</span>' +
        '<span class="text-muted-small">' + formatTime(r.start_time) + ' &ndash; ' + formatTime(r.end_time) + '</span>' +
        '</div>' +
        '</div>').join('') + '</div>';
  }

  /* ---------------------------------------------------- reservations --- */
  async function loadReservations() {
    if (loadingEl) loadingEl.style.display = 'flex';
    if (bodyEl) bodyEl.innerHTML = emptyRow(8, 'Loading your reservations&hellip;');

    try {
      const params = new URLSearchParams({ limit: '200', mine: '1' });
      const data = await api('/api/reservations?' + params.toString());
      let items = data.reservations || [];

      const seen = new Set();
      items = items.filter((item) => {
        if (item.id == null) return true;
        const id = String(item.id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      state.items = items;
      renderStats(computeStats(items));
      renderActivityFeed(items);
      renderRoomSnapshot(items);
      await loadLabStatus();
      renderTable(items);
    } catch (err) {
      console.error('[dashboard reservations] Error:', err.message);
      if (bodyEl) bodyEl.innerHTML = emptyRow(8, 'Unable to load reservations. Please try again later.');
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  function renderTable(items) {
    if (!bodyEl) return;

    const filtered = state.status
      ? items.filter((r) => String(r.status || '').toLowerCase() === state.status.toLowerCase())
      : items;

    if (filtered.length === 0) {
      bodyEl.innerHTML = '<tr>' +
        '<td colspan="8" class="text-center text-muted-sm py-4">' +
        'No reservations found. Click \'<span class="fw-semibold">+ New Reservation</span>\' to get started.' +
        '</td></tr>';
      return;
    }

    bodyEl.innerHTML = filtered.map((r, index) => {
      const status = String(r.status || 'Pending');
      const tone = STATUS_TONE[status] || 'secondary';
      const canCancel = status.toLowerCase() === 'pending';
      const cancelBtn = canCancel
        ? '<button type="button" class="btn btn-sm btn-outline-danger cancel-btn" data-id="' + r.id + '" title="Cancel reservation #' + r.id + '">Cancel</button>'
        : '<span class="text-muted-sm">&mdash;</span>';

      const requesterName = escapeHtml(user.full_name || 'You');
      return '<tr data-row-id="' + escapeHtml(String(r.id)) + '">' +
        '<td>' + (index + 1) + '</td>' +
        '<td>' +
        '<div class="fw-semibold">' + escapeHtml(r.room_name || 'Unnamed Room') + '</div>' +
        '<div class="text-muted-small">' + escapeHtml(r.building_name || '') + '</div>' +
        '</td>' +
        '<td>' + escapeHtml(formatDateShort(r.res_date)) + '</td>' +
        '<td>' + escapeHtml(formatTime(r.start_time)) + ' &ndash; ' + escapeHtml(formatTime(r.end_time)) + '</td>' +
        '<td>' + escapeHtml(r.purpose || '&mdash;') + '</td>' +
        '<td class="text-center">' + (r.attendees != null ? r.attendees : '&mdash;') + '</td>' +
        '<td class="text-center">' + requesterName + '</td>' +
        '<td class="text-center">' + statusBadge(status) + '</td>' +
        '<td class="text-end">' + cancelBtn + '</td>' +
        '</tr>';
    }).join('');

    bindCancelActions();
  }

  function bindCancelActions() {
    bodyEl.querySelectorAll('.cancel-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-id'));
        const reservation = state.items.find((r) => r.id === id);
        if (!reservation) return;

        if (!window.confirm('Cancel reservation #' + reservation.id + ' for "' + escapeHtml(reservation.room_name) + '"?')) {
          return;
        }

        busy(btn, true, 'Cancelling&hellip;');
        try {
          await api('/api/reservations/' + reservation.id + '/cancel', { method: 'PATCH' });
          toastOk('Reservation cancelled.');
          P.broadcastAvailabilityChange();
          await loadReservations();
        } catch (err) {
          if (err.message === 'Reservation not found.') return;
          toastError(err.message);
        } finally {
          busy(btn, false);
        }
      });
    });
  }

  /* ------------------------------------------------------ filters ------- */
  function initFilters() {
    const filterGroup = document.getElementById('status-filters');
    if (!filterGroup) return;
    filterGroup.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        filterGroup.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.status = btn.getAttribute('data-status') || '';
        renderTable(state.items);
      });
    });

    const tab = queryParam('tab');
    if (tab) {
      const btn = filterGroup.querySelector('button[data-status="' + tab + '"]');
      if (btn) {
        filterGroup.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.status = tab;
      }
    }
  }

  /* ------------------------------------------------------- actions ------ */
  function initActions() {
    const newResBtn = document.getElementById('new-reservation-link');
    if (newResBtn) {
      newResBtn.addEventListener('click', () => {
        window.location.assign('/reservation-form.html');
      });
    }

    const viewPendingBtn = document.getElementById('view-pending-link');
    if (viewPendingBtn) {
      viewPendingBtn.addEventListener('click', () => {
        window.location.assign('/dashboard.html?tab=pending');
      });
    }
  }

  /* ------------------------------------------------------------- boot --- */
  initFilters();
  initActions();
  await loadReservations();
})();
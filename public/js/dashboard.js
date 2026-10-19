/* Dashboard: statistics + the reservation list with approve/reject/cancel. */
'use strict';

(async function () {
  const P = window.Portal;
  const {
    api, requireRole, renderNavbar, escapeHtml, formatTime, formatDateShort, getLocale,
    statusBadge, emptyRow, toastOk, toastError, busy, queryParam
  } = P;

  const user = await requireRole();
  if (!user) return;

  renderNavbar(user, 'dashboard');

  function updateDashboardClock() {
    const stamp = document.getElementById('dashboard-timestamp');
    if (!stamp) return;
    const now = new Date();
    stamp.textContent = now.toLocaleString(getLocale(), {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function renderActivityFeed() {
    const feed = document.getElementById('activity-feed');
    if (!feed) return;

    const items = [
      { title: 'CCS Lab 1 booked by Juan Dela Cruz', time: '2 hours ago' },
      { title: 'Room request approved for Engineering Hall', time: '4 hours ago' },
      { title: 'Faculty schedule updated for CAS Building', time: 'Today' },
      { title: 'Lab cleanup reminder sent to custodians', time: 'Yesterday' }
    ];

    feed.innerHTML = items.map((item) => `
      <li class="activity-item">
        <span class="activity-bullet" aria-hidden="true"></span>
        <div class="activity-copy">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.time)}</span>
        </div>
      </li>
    `).join('');
  }

  function renderMiniCalendar() {
    const host = document.getElementById('mini-calendar');
    if (!host) return;

    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const today = new Date();
    const start = new Date(today);
    const dayIdx = (today.getDay() + 6) % 7;
    start.setDate(today.getDate() - dayIdx);

    let html = '';
    weekdays.forEach((day) => {
      html += `<div class="calendar-head">${day}</div>`;
    });

    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const isToday = date.toDateString() === today.toDateString();
      const occupancy = (i + 1) % 3 === 0 ? 'Busy' : 'Open';
      html += `
        <div class="mini-calendar-day ${isToday ? 'active' : ''}">
          <strong>${date.getDate()}</strong>
          <span class="availability" aria-hidden="true"></span>
          <span>${occupancy}</span>
        </div>`;
    }

    host.innerHTML = html;
  }

  document.querySelectorAll('.shortcut-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.shortcut;
      if (action === 'new-reservation') return window.location.assign('/reservation-form.html');
      if (action === 'room-status') return window.location.assign('/rooms-status.html');
      if (action === 'pending') return window.location.assign('/dashboard.html?tab=pending');
    });
  });

  const isStaff = user.role === 'custodian' || user.role === 'admin';
  const state = { status: '', items: [], mine: queryParam('mine') === '1' };

  const titleEl = document.getElementById('welcome-title');
  const subtitleEl = document.getElementById('welcome-subtitle');
  const listTitleEl = document.getElementById('list-title');
  const heroAvatarImg = document.getElementById('dashboard-avatar-img');
  const heroAvatarInitials = document.getElementById('dashboard-avatar-initials');
  const avatarInitials = String(user.full_name || '?').trim().split(/\s+/)
    .slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();

  if (heroAvatarInitials) heroAvatarInitials.textContent = avatarInitials || '?';
  if (heroAvatarImg && user.avatar_url) {
    heroAvatarImg.src = user.avatar_url;
    heroAvatarImg.hidden = false;
    heroAvatarImg.addEventListener('error', () => {
      heroAvatarImg.hidden = true;
      if (heroAvatarInitials) heroAvatarInitials.hidden = false;
    });
    if (heroAvatarInitials) heroAvatarInitials.hidden = true;
  }

  document.getElementById('dashboard-avatar-trigger')?.addEventListener('click', () => {
    document.getElementById('profile-settings-menu-item')?.click();
  });

  // Conditional greeting: brand-new account -> "Welcome, [Name]!",
  // returning user -> "Welcome back, [Name]!". Avatar, eyebrow label,
  // subtitle and "System online" badge stay untouched.
  titleEl.textContent = user.isFirstLogin
    ? `Welcome, ${user.full_name}!`
    : `Welcome back, ${user.full_name}!`;
  subtitleEl.textContent = isStaff
    ? 'Review and act on reservation requests across all rooms.'
    : 'Track the status of your own room reservation requests.';
  listTitleEl.textContent = state.mine || !isStaff ? 'My reservations' : 'All reservation requests';

  if (queryParam('tab') === 'pending') state.status = 'Pending';
  if (queryParam('error') === 'forbidden') {
    toastError('You do not have access to that screen.');
  }

  async function loadStats() {
    try {
      const data = await api('/api/reservations/stats');
      document.getElementById('stat-total').textContent = data.totals.total;
      document.getElementById('stat-pending').textContent = data.totals.pending;
      document.getElementById('stat-approved').textContent = data.totals.approved;
      document.getElementById('stat-rejected').textContent = data.totals.rejected;

      const inv = data.inventory || {};
      if (isStaff && inv.total_rooms !== undefined) {
        document.getElementById('inventory-row').classList.remove('d-none');
        document.getElementById('stat-rooms').textContent = inv.total_rooms;
        document.getElementById('stat-buildings').textContent = inv.total_buildings;
        document.getElementById('stat-users').textContent = inv.total_users;
      }
    } catch (err) {
      toastError(`Could not load statistics: ${err.message}`);
    }
  }

  const bodyEl = document.getElementById('reservations-body');

  async function loadList() {
    bodyEl.innerHTML = emptyRow(9, 'Loading...');
    const params = new URLSearchParams();
    if (state.mine) params.set('mine', '1');
    params.set('limit', '200');

    try {
      const data = await api(`/api/reservations?${params.toString()}`);
      let items = data.reservations || [];

      // Remove duplicate entries by reservation id
      const seen = new Set();
      items = items.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });

      // Frontend status filter (case-insensitive)
      if (state.status) {
        items = items.filter((item) =>
          String(item.status || '').toLowerCase() === String(state.status).toLowerCase()
        );
      }

      state.items = items;
      renderList();
    } catch (err) {
      bodyEl.innerHTML = emptyRow(9, `Could not load reservations: ${err.message}`);
    }
  }

  function renderList() {
    if (!state.items.length) {
      bodyEl.innerHTML = emptyRow(9, 'No reservations match this filter yet.');
      return;
    }
    bodyEl.innerHTML = state.items.map(rowHtml).join('');
    bindRowActions();
  }

  function rowHtml(r) {
    const isOwner = r.user_id === user.id;
    const canDecide = isStaff && r.status === 'Pending';
    const canCancel = (isOwner || isStaff) && r.status !== 'Cancelled';

    let actions = '';
    if (canDecide) {
      actions += `<button class="btn btn-sm btn-success" data-action="approve" data-id="${r.id}">Approve</button>
                  <button class="btn btn-sm btn-outline-danger ms-1" data-action="reject" data-id="${r.id}">Reject</button>`;
    }
    if (canCancel) {
      // Cancel binds the REAL database primary key (reservations.id -> r.id),
      // never a loop index. bindRowActions() looks the row back up by r.id === id.
      actions += `<button class="btn btn-sm btn-outline-danger ms-1" data-action="cancel" data-id="${r.id}" title="Cancel reservation #${r.id}">✕ Cancel</button>`;
    }
    if (!actions) actions = '<span class="text-muted-sm">-</span>';

    const equipment = (r.equipment || []).length
      ? `<div class="text-muted-sm">${(r.equipment || []).map(escapeHtml).join(', ')}</div>`
      : '';

    return `
      <tr data-row-id="${r.id}">
        <td>#${r.id}</td>
        <td>
          <div class="fw-semibold">${escapeHtml(r.room_name)}</div>
          <div class="text-muted-sm">${escapeHtml(r.building_name)}</div>
        </td>
        <td>${escapeHtml(formatDateShort(r.res_date))}</td>
        <td class="text-nowrap">${escapeHtml(formatTime(r.start_time))}<br />${escapeHtml(formatTime(r.end_time))}</td>
        <td style="max-width: 260px">
          <div>${escapeHtml(r.purpose)}</div>
          ${equipment}
        </td>
        <td>${escapeHtml(r.attendees)}</td>
        <td class="requester-cell ${isStaff ? '' : 'd-none'}">
          <div>${escapeHtml(r.requested_by)}</div>
          <div class="text-muted-sm">${escapeHtml(r.requester_school_id)}</div>
        </td>
        <td>
          ${statusBadge(r.status)}
          ${r.approved_by_name ? `<div class="text-muted-sm">by ${escapeHtml(r.approved_by_name)}</div>` : ''}
        </td>
        <td class="text-end text-nowrap">${actions}</td>
      </tr>`;
  }

  const modalEl = document.getElementById('decision-modal');
  const modal = new bootstrap.Modal(modalEl);
  const decisionTitle = document.getElementById('decision-title');
  const decisionSummary = document.getElementById('decision-summary');
  const decisionRemarks = document.getElementById('decision-remarks');
  const decisionConfirm = document.getElementById('decision-confirm');
  let pendingDecision = null;

  function openDecision(reservation, status) {
    pendingDecision = { id: reservation.id, status };
    const verb = status === 'Approved' ? 'Approve' : 'Reject';
    decisionTitle.textContent = `${verb} reservation #${reservation.id}`;
    decisionSummary.textContent =
      `${reservation.room_name} - ${formatDateShort(reservation.res_date)}, ` +
      `${formatTime(reservation.start_time)} to ${formatTime(reservation.end_time)} ` +
      `(requested by ${reservation.requested_by}).`;
    decisionRemarks.value = '';
    decisionConfirm.className = `btn ${status === 'Approved' ? 'btn-success' : 'btn-danger'}`;
    decisionConfirm.textContent = `${verb} request`;
    modal.show();
  }

  decisionConfirm.addEventListener('click', async () => {
    if (!pendingDecision) return;
    busy(decisionConfirm, true, 'Saving...');
    try {
      const data = await api(`/api/reservations/${pendingDecision.id}/decision`, {
        method: 'PATCH',
        body: { status: pendingDecision.status, remarks: decisionRemarks.value.trim() }
      });
      toastOk(data.message);
      modal.hide();
      await Promise.all([loadStats(), loadList()]);
    } catch (err) {
      toastError(err.message);
    } finally {
      busy(decisionConfirm, false);
    }
  });

  async function cancelReservation(reservation) {
    if (!window.confirm(`Cancel reservation #${reservation.id} for "${reservation.room_name}"?`)) return;
    try {
      const data = await api(`/api/reservations/${reservation.id}/cancel`, { method: 'PATCH' });
      toastOk(data.message);
      await Promise.all([loadStats(), loadList()]);
    } catch (err) {
      toastError(err.message);
    }
  }

  function bindRowActions() {
    bodyEl.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-id'));
        const reservation = state.items.find((r) => r.id === id);
        if (!reservation) return;
        const action = btn.getAttribute('data-action');
        if (action === 'cancel') return cancelReservation(reservation);
        openDecision(reservation, action === 'approve' ? 'Approved' : 'Rejected');
      });
    });
  }

  document.querySelectorAll('#status-filters button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#status-filters button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.status = btn.getAttribute('data-status');
      loadList();
    });
  });

  document.addEventListener('portal-locale-change', () => {
    renderActivityFeed();
    renderMiniCalendar();
    updateDashboardClock();
    loadStats();
    loadList();
  });

  await Promise.all([loadStats(), loadList()]);
})();
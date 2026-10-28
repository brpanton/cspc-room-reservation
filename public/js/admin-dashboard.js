/* Admin dashboard: summary stats + reservation approvals + room/user management. */
'use strict';

/* ============================================================
   IMMEDIATE stuck-backdrop cleanup
   Bootstrap modals can leave .modal-backdrop layers that freeze
   the entire page. Remove them before anything else runs so
   every button and link is clickable from the first frame.
   ============================================================ */
(function unstickModals() {
  try {
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    document.body.classList.remove('modal-open');
    document.body.style.overflow = 'auto';
    document.body.style.paddingRight = '0';
  } catch { /* ignore */ }
})();

/* Periodic watchdog: remove any stuck modal-backdrop that could freeze the page */
setInterval(() => {
  try {
    document.querySelectorAll('.modal-backdrop:not([hidden])').forEach((el) => el.remove());
    if (document.body.classList.contains('modal-open')) {
      document.body.classList.remove('modal-open');
      document.body.style.overflow = 'auto';
      document.body.style.paddingRight = '0';
    }
  } catch { /* ignore */ }
}, 5000);

(async function () {
  const P = window.Portal || {};
  const {
    api,
    requireRole,
    renderNavbar,
    escapeHtml,
    formatTime,
    formatDateShort,
    statusBadge,
    emptyRow,
    toastOk,
    toastError,
    busy,
    ROOM_TYPE_LABELS,
    roleBadge,
    queryParam
  } = P;

  document.body.classList.add('admin-dashboard-page');

  /* Render navbar first so it's always visible */
  const host = document.getElementById('navbar-placeholder');
  function renderNavbarFallback() {
    if (!host || host.innerHTML.trim()) return;
    host.innerHTML = `
      <nav class="navbar navbar-expand-lg navbar-dark portal-navbar">
        <div class="container portal-nav-inner">
          <a class="navbar-brand navbar-brand-hornet" href="/admin-dashboard.html">
            <span class="brand-text"><span class="brand-title">CSPC Lab & Room Reservation</span></span>
          </a>
          <div class="navbar-account-area portal-nav-utility d-flex align-items-center">
            <a class="btn btn-sm btn-outline-light" href="/dashboard.html">Dashboard</a>
            <a class="btn btn-sm btn-outline-light" href="/rooms-status.html">Room Status</a>
          </div>
        </div>
      </nav>`;
  }

  let me = null;
  try {
    me = await requireRole('admin');
    if (me && renderNavbar) {
      renderNavbar(me, 'admin');
    }
    /* Always ensure navbar renders even if renderNavbar partially failed */
    if (!host || !host.innerHTML.trim()) {
      renderNavbarFallback();
    }
  } catch (err) {
    console.error('[admin-dashboard] Navbar/error:', err);
    renderNavbarFallback();
  }

  /* About Us modal: toggle the top-nav active pill between Admin Dashboard and About Us */
  const aboutUsModalEl = document.getElementById('about-us-modal');
  if (aboutUsModalEl) {
    const adminDashboardLink = document.querySelector('.portal-navbar .nav-link[href="/admin-dashboard.html"]');
    const aboutUsButton = document.querySelector('.portal-navbar .nav-link-button[data-bs-target="#about-us-modal"]');

    aboutUsModalEl.addEventListener('show.bs.modal', () => {
      adminDashboardLink?.classList.remove('active');
      aboutUsButton?.classList.add('active');
    });

    aboutUsModalEl.addEventListener('hidden.bs.modal', () => {
      aboutUsButton?.classList.remove('active');
      adminDashboardLink?.classList.add('active');
    });
  }

  function updateDashboardClock() {
    const stamp = document.getElementById('dashboard-timestamp');
    if (!stamp) return;
    const now = new Date();
    stamp.textContent = now.toLocaleString(P.getLocale(), {
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

  function renderProgressCard(cardId, value, total, label) {
    const card = document.getElementById(cardId)?.closest('.card');
    if (!card) return;

    const body = card.querySelector('.card-body');
    const safeTotal = Math.max(1, Number(total) || 0);
    const percent = Math.min(100, Math.round((Number(value) / safeTotal) * 100));

    // Prefer the dedicated subtext line (flat layout: Title / Number / Subtext).
    // Fall back to the legacy .mini-progress-label hook for older markup.
    let meta = body.querySelector('.stat-sub') || body.querySelector('.mini-progress-label');

    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'stat-sub';
      body.appendChild(meta);
    }

    meta.innerHTML = `<span>${escapeHtml(label)}</span><span>${percent}% of total</span>`;
  }

  // Single quick action kept in the header card: + Add Room jumps to Rooms.
  document.querySelectorAll('.admin-welcome-card [data-shortcut]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.shortcut === 'new-room') {
        document.querySelector('.admin-nav-btn[data-target="#pane-rooms"]')?.click();
      }
    });
  });

  const passwordChangeModal = new bootstrap.Modal(document.getElementById('password-change-modal'));
  const passwordChangeForm = document.getElementById('password-change-form');

  if (queryParam('must_change_password') === '1') {
    passwordChangeModal.show();
  }

  passwordChangeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-new-password').value;
    if (newPassword !== confirmPassword) {
      toastError('Your new password and confirmation do not match.');
      return;
    }

    try {
      const data = await api('/api/auth/change-password', {
        method: 'POST',
        body: {
          current_password: document.getElementById('current-password').value,
          new_password: newPassword
        }
      });
      toastOk(data.message);
      passwordChangeModal.hide();
      passwordChangeForm.reset();
      window.history.replaceState({}, '', '/admin-dashboard.html');
    } catch (err) {
      toastError(err.message);
    }
  });

  const state = { status: '', items: [], search: '' };

  function setReservationStatusFilter(status) {
    state.status = status || '';
    const pills = document.querySelectorAll('#status-filters button');
    pills.forEach((b) => {
      const on = (b.getAttribute('data-status') || '') === state.status;
      b.classList.toggle('active', on);
    });
    const cards = document.querySelectorAll('.overview-stat');
    cards.forEach((card) => {
      const on = (card.getAttribute('data-status-filter') || '') === state.status;
      card.classList.toggle('is-active', on);
      card.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    loadReservations();
  }

  const reservationsBody = document.getElementById('reservations-body');
  const buildingsBody = document.getElementById('buildings-body');
  const roomsBody = document.getElementById('rooms-body');
  const usersBody = document.getElementById('users-body');
  const adminsBody = document.getElementById('admins-body');
  const supportBody = document.getElementById('support-body');

  /* ------------------------------------------------------ reservation overview */

  renderActivityFeed();
  renderMiniCalendar();
  updateDashboardClock();
  setInterval(updateDashboardClock, 60000);

  async function loadStats() {
    try {
      const data = await api('/api/reservations/stats');
      const totals = data.totals || { total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
      document.getElementById('stat-total').textContent = totals.total;
      document.getElementById('stat-pending').textContent = totals.pending;
      document.getElementById('stat-approved').textContent = totals.approved;
      document.getElementById('stat-rejected').textContent = totals.rejected;

      renderProgressCard('stat-total', Number(totals.total || 0), Math.max(10, Number(totals.total || 0)), 'Total');
      renderProgressCard('stat-pending', Number(totals.pending || 0), Math.max(8, Number(totals.total || 0)), 'Pending');
      renderProgressCard('stat-approved', Number(totals.approved || 0), Math.max(8, Number(totals.total || 0)), 'Approved');
      renderProgressCard('stat-rejected', Number(totals.rejected || 0), Math.max(8, Number(totals.total || 0)), 'Rejected');
    } catch (err) {
      toastError(`Could not load statistics: ${err.message}`);
    }
  }

  async function loadOverviewCounters() {
    try {
      const [roomsRes, usersRes, buildingsRes] = await Promise.all([
        api('/api/admin/rooms?include_inactive=1'),
        api('/api/admin/users'),
        api('/api/buildings')
      ]);

      const rooms = roomsRes.rooms || [];
      const users = usersRes.users || [];
      const buildings = buildingsRes.buildings || [];

      const roleCounts = { student: 0, faculty: 0, custodian: 0, admin: 0 };
      users.forEach((user) => {
        if (roleCounts[user.role] !== undefined) roleCounts[user.role] += 1;
      });

      document.getElementById('stat-rooms').textContent = rooms.filter((r) => r.is_active !== 0).length;
      document.getElementById('stat-buildings').textContent = buildings.length;
      document.getElementById('stat-users').textContent = users.length;
      document.getElementById('stat-students').textContent = roleCounts.student;
      document.getElementById('stat-faculty').textContent = roleCounts.faculty;
      document.getElementById('stat-admins').textContent = roleCounts.admin;
      document.getElementById('stat-custodians').textContent = roleCounts.custodian;
    } catch (err) {
      toastError(`Could not load inventory counters: ${err.message}`);
    }
  }

  async function loadReservations() {
    reservationsBody.innerHTML = emptyRow(9, 'Loading...');
    const params = new URLSearchParams();
    if (state.status) params.set('status', state.status);
    params.set('limit', '200');

    try {
      const data = await api(`/api/reservations?${params.toString()}`);
      state.items = data.reservations || [];
      renderReservations();
    } catch (err) {
      reservationsBody.innerHTML = emptyRow(9, `Could not load reservations: ${err.message}`);
    }
  }

  function filteredReservations() {
    const q = (state.search || '').trim().toLowerCase();
    if (!q) return state.items;
    return state.items.filter((r) => {
      const hay = `${r.requested_by || ''} ${r.user_name || ''} ${r.requester_school_id || ''} ${r.room_name || ''} ${r.building_name || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function renderReservations() {
    const visible = filteredReservations();
    if (!visible.length) {
      reservationsBody.innerHTML = emptyRow(9, state.search ? 'No reservations match your search yet.' : 'No reservations match this filter yet.');
      return;
    }

    reservationsBody.innerHTML = visible.map((r) => {
      const canDecide = r.status === 'Pending';
      const canCancel = r.status !== 'Cancelled';
      let actions = '';

      if (canDecide) {
        actions += `
          <button class="btn btn-sm btn-approve" data-action="approve" data-id="${r.id}">Approve</button>
          <button class="btn btn-sm btn-reject ms-1" data-action="reject" data-id="${r.id}">Reject</button>
        `;
      }
      if (canCancel) {
        // Cancel binds the REAL database primary key (reservations.id -> r.id),
        // never a loop index. The click handler looks the row back up by r.id === id.
        actions += `<button class="btn btn-sm btn-reject ms-1" data-action="cancel" data-id="${r.id}" title="Cancel reservation #${r.id}">✕ Cancel</button>`;
      }
      if (!actions) actions = '<span class="text-muted-sm">-</span>';

      const equipment = (r.equipment || []).length
        ? `<div class="text-muted-sm">${(r.equipment || []).map(escapeHtml).join(', ')}</div>`
        : '';

      const viewTicketBtn = `<button class="btn btn-sm btn-outline-primary btn-view-ticket" data-id="${r.id}" title="View Ticket">🎫 Ticket</button>`;

      return `
        <tr data-row-id="${r.id}">
          <td>#${r.id}</td>
          <td><span class="badge bg-info text-dark">${escapeHtml(r.transaction_code || '-')}</span></td>
          <td>
            <div class="fw-semibold">${escapeHtml(r.requested_by || r.user_name || 'Unknown user')}</div>
            <div class="text-muted-sm">${escapeHtml(r.requester_school_id || r.user_id || '-')}</div>
          </td>
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
          <td>${statusBadge(r.status)}</td>
          <td class="text-end text-nowrap">${actions} ${viewTicketBtn}</td>
        </tr>`;
    }).join('');

    reservationsBody.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-id'));
        const reservation = state.items.find((r) => r.id === id);
        if (!reservation) return;
        const action = btn.getAttribute('data-action');
        if (action === 'cancel') return cancelReservation(reservation);
        openDecision(reservation, action === 'approve' ? 'Approved' : 'Rejected');
      });
    });

    reservationsBody.querySelectorAll('.btn-view-ticket').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-id'));
        const reservation = state.items.find((r) => r.id === id);
        if (reservation) openTicketModal(reservation);
      });
    });
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
    decisionSummary.textContent = `${reservation.room_name} - ${formatDateShort(reservation.res_date)}, ${formatTime(reservation.start_time)} to ${formatTime(reservation.end_time)} (requested by ${reservation.requested_by || 'Unknown'}).`;
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
      P.broadcastAvailabilityChange();
      modal.hide();
      await Promise.all([loadStats(), loadReservations()]);
    } catch (err) {
      toastError(err.message);
    } finally {
      busy(decisionConfirm, false);
    }
  });

  /* ------------------------------------------------------ ticket modal --- */
  const ticketModalEl = document.getElementById('ticket-modal');
  const ticketModal = new bootstrap.Modal(ticketModalEl);

  function openTicketModal(reservation) {
    const equipment = (reservation.equipment || []).length
      ? (reservation.equipment || []).map(e => `<span class="badge bg-secondary me-1">${escapeHtml(e)}</span>`).join('')
      : '<span class="text-muted-sm">None</span>';

    document.getElementById('ticket-res-id').textContent = reservation.id;
    document.getElementById('ticket-tx-code').textContent = reservation.transaction_code || '-';
    document.getElementById('ticket-status').textContent = reservation.status;
    document.getElementById('ticket-status').className = `badge ${statusBadgeClass(reservation.status)}`;
    document.getElementById('ticket-requester').textContent = reservation.requested_by || '-';
    document.getElementById('ticket-requester-school').textContent = reservation.requester_school_id || '-';
    document.getElementById('ticket-requester-role').textContent = (reservation.requester_role || 'student').charAt(0).toUpperCase() + (reservation.requester_role || 'student').slice(1);
    document.getElementById('ticket-building').textContent = reservation.building_name || '-';
    document.getElementById('ticket-room').textContent = reservation.room_name || '-';
    document.getElementById('ticket-room-type').textContent = (reservation.room_type || '-').charAt(0).toUpperCase() + (reservation.room_type || '').slice(1);
    document.getElementById('ticket-date').textContent = formatDateShort(reservation.res_date);
    document.getElementById('ticket-start-time').textContent = formatTime(reservation.start_time);
    document.getElementById('ticket-end-time').textContent = formatTime(reservation.end_time);
    document.getElementById('ticket-attendees').textContent = reservation.attendees || '-';
    document.getElementById('ticket-purpose').textContent = reservation.purpose || '-';
    document.getElementById('ticket-equipment').innerHTML = equipment;
    document.getElementById('ticket-submitted').textContent = reservation.created_at ? new Date(reservation.created_at).toLocaleString() : '-';
    document.getElementById('ticket-decided').textContent = reservation.decided_at ? new Date(reservation.decided_at).toLocaleString() : '-';
    document.getElementById('ticket-remarks').textContent = reservation.remarks || '-';
    document.getElementById('ticket-approved-by').textContent = reservation.approved_by_name || '-';

    ticketModal.show();
  }

  function statusBadgeClass(status) {
    switch (status) {
      case 'Approved': return 'bg-success';
      case 'Rejected': return 'bg-danger';
      case 'Cancelled': return 'bg-secondary';
      case 'Pending': return 'bg-warning text-dark';
      default: return 'bg-info text-dark';
    }
  }

  async function cancelReservation(reservation) {
    if (!window.confirm(`Cancel reservation #${reservation.id} for "${reservation.room_name}"?`)) return;
    try {
      const data = await api(`/api/reservations/${reservation.id}/cancel`, { method: 'PATCH' });
      toastOk(data.message);
      P.broadcastAvailabilityChange();
      await Promise.all([loadStats(), loadReservations()]);
    } catch (err) {
      toastError(err.message);
    }
  }

  document.querySelectorAll('#status-filters button').forEach((btn) => {
    btn.addEventListener('click', () => {
      setReservationStatusFilter(btn.getAttribute('data-status'));
    });
  });

  // Stat cards act as quick filters for the requests table.
  document.querySelectorAll('.overview-stat[data-status-filter]').forEach((card) => {
    card.addEventListener('click', () => {
      setReservationStatusFilter(card.getAttribute('data-status-filter'));
      document.getElementById('reservations-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Live search across requester name, school ID, room, and building.
  const reservationSearch = document.getElementById('reservation-search');
  if (reservationSearch) {
    reservationSearch.addEventListener('input', () => {
      state.search = reservationSearch.value || '';
      renderReservations();
    });
  }

  function csvCell(value) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportReservationsCsv() {
    const visible = filteredReservations();
    const header = ['ID', 'Requester', 'School ID', 'Room', 'Building', 'Date', 'Start', 'End', 'Attendees', 'Status', 'Purpose'];
    const lines = [header.map(csvCell).join(',')];
    visible.forEach((r) => {
      lines.push([
        r.id,
        r.requested_by || r.user_name || 'Unknown user',
        r.requester_school_id || r.user_id || '',
        r.room_name || '',
        r.building_name || '',
        r.res_date || '',
        r.start_time || '',
        r.end_time || '',
        r.attendees ?? '',
        r.status || '',
        r.purpose || ''
      ].map(csvCell).join(','));
    });
    const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reservations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toastOk(`Exported ${visible.length} reservation(s) to CSV.`);
  }

  document.getElementById('export-reservations')?.addEventListener('click', exportReservationsCsv);

  /* ------------------------------------------------------ buildings management */

  let buildings = [];
  let rooms = [];
  let users = [];

  const buildingModal = new bootstrap.Modal(document.getElementById('building-modal'));
  const roomModal = new bootstrap.Modal(document.getElementById('room-modal'));
  const userModal = new bootstrap.Modal(document.getElementById('user-modal'));
  const buildingForm = document.getElementById('building-form');
  const roomForm = document.getElementById('room-form');
  const userForm = document.getElementById('user-form');
  const editing = { building: null, room: null, user: null };

  async function loadBuildings() {
    try {
      const data = await api('/api/buildings');
      buildings = data.buildings || [];
      renderBuildings();
      if (roomForm && roomForm.building_id) populateRoomBuildingOptions();
      // Populate admin availability building datalist
      const adminDatalist = document.getElementById('admin-building-list');
      if (adminDatalist) {
        adminDatalist.innerHTML =
          buildings.map((b) => `<option value="${escapeHtml(b.name)}" data-id="${b.id}"></option>`).join('');
      }
      window.__adminBuildingIdByName = new Map(
        buildings.map((b) => [String(b.name).trim(), Number(b.id)])
      );
    } catch (err) {
      buildingsBody.innerHTML = emptyRow(5, `Could not load buildings: ${err.message}`);
    }
  }

  function renderBuildings() {
    if (!buildings.length) {
      buildingsBody.innerHTML = emptyRow(5, 'No buildings yet. Add the first one.');
      return;
    }
    buildingsBody.innerHTML = buildings.map((b) => `
      <tr>
        <td>#${b.id}</td>
        <td class="fw-semibold">${escapeHtml(b.name)}</td>
        <td>${escapeHtml(b.location || '-')}</td>
        <td>${escapeHtml(b.room_count)}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-sm btn-outline-cspc" data-edit-building="${b.id}">Edit</button>
          <button class="btn btn-sm btn-reject ms-1" data-del-building="${b.id}">Delete</button>
        </td>
      </tr>`).join('');

    buildingsBody.querySelectorAll('[data-edit-building]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-edit-building'));
        const building = buildings.find((b) => b.id === id);
        openBuildingModal(building);
      });
    });

    buildingsBody.querySelectorAll('[data-del-building]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-del-building'));
        const building = buildings.find((b) => b.id === id);
        const warning = building && building.room_count > 0 ? `\n\nWarning: its ${building.room_count} room(s) will also be removed.` : '';
        if (!window.confirm(`Delete "${building ? building.name : 'this building'}"?${warning}`)) return;
        try {
          const data = await api(`/api/admin/buildings/${id}`, { method: 'DELETE' });
          toastOk(data.message);
          await Promise.all([loadBuildings(), loadRooms()]);
        } catch (err) {
          toastError(err.message);
        }
      });
    });
  }

  function openBuildingModal(building) {
    editing.building = building ? building.id : null;
    document.getElementById('building-modal-title').textContent = building ? `Edit building #${building.id}` : 'Add building';
    buildingForm.name.value = building ? building.name : '';
    buildingForm.location.value = building ? (building.location || '') : '';
    buildingModal.show();
  }

  document.getElementById('new-building-btn').addEventListener('click', () => openBuildingModal(null));

  buildingForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const saveBtn = document.getElementById('building-save');
    busy(saveBtn, true, 'Saving...');
    try {
      const payload = {
        name: buildingForm.name.value.trim(),
        location: buildingForm.location.value.trim()
      };
      const data = editing.building
        ? await api(`/api/admin/buildings/${editing.building}`, { method: 'PUT', body: payload })
        : await api('/api/admin/buildings', { method: 'POST', body: payload });
      toastOk(data.message);
      P.broadcastAvailabilityChange();
      buildingModal.hide();
      await Promise.all([loadBuildings(), loadRooms()]);
    } catch (err) {
      toastError(err.message);
    } finally {
      busy(saveBtn, false);
    }
  });

  /* ------------------------------------------------------ room management */

  const showInactive = document.getElementById('show-inactive-rooms');

  function populateRoomBuildingOptions() {
    const select = document.getElementById('room-building');
    if (!select) return;
    select.innerHTML = buildings.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
  }

  async function loadRooms() {
    try {
      const qs = showInactive.checked ? '?include_inactive=1' : '';
      const data = await api(`/api/admin/rooms${qs}`);
      rooms = data.rooms || [];
      renderRooms();
    } catch (err) {
      roomsBody.innerHTML = emptyRow(9, `Could not load rooms: ${err.message}`);
    }
  }

  function amenityList(r) {
    const out = [];
    if (r.has_projector) out.push('Projector');
    if (r.has_aircon) out.push('Aircon');
    if (r.has_sound) out.push('Sound');
    return out.length ? out.map((a) => `<span class="amenity-pill">${a}</span>`).join('') : '<span class="text-muted-sm">-</span>';
  }

  function renderRooms() {
    if (!rooms.length) {
      roomsBody.innerHTML = emptyRow(9, 'No rooms found.');
      return;
    }

    roomsBody.innerHTML = rooms.map((r) => `
      <tr>
        <td>#${r.id}</td>
        <td class="fw-semibold">${escapeHtml(r.name)}${r.floor ? `<div class="text-muted-sm fw-normal">${escapeHtml(r.floor)}</div>` : ''}</td>
        <td>${escapeHtml(r.building_name)}</td>
        <td>${escapeHtml(ROOM_TYPE_LABELS[r.room_type] || r.room_type)}</td>
        <td>${escapeHtml(r.capacity)}</td>
        <td>${amenityList(r)}</td>
        <td>${r.is_active ? '<span class="badge text-bg-success">Active</span>' : '<span class="badge text-bg-secondary">Inactive</span>'}</td>
        <td>${escapeHtml(r.reservation_count)}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-sm btn-outline-cspc" data-edit-room="${r.id}">Edit</button>
          ${r.is_active ? `<button class="btn btn-sm btn-reject ms-1" data-del-room="${r.id}">Delete</button>` : `<button class="btn btn-sm btn-outline-success ms-1" data-react-room="${r.id}">Reactivate</button>`}
        </td>
      </tr>`).join('');

    roomsBody.querySelectorAll('[data-edit-room]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-edit-room'));
        openRoomModal(rooms.find((r) => r.id === id));
      });
    });

    roomsBody.querySelectorAll('[data-del-room]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-del-room'));
        const room = rooms.find((r) => r.id === id);
        const warning = room && room.reservation_count > 0 ? `\n\nIt has ${room.reservation_count} reservation(s), so it will be deactivated instead of deleted.` : '';
        if (!window.confirm(`Delete "${room ? room.name : 'this room'}"?${warning}`)) return;
        try {
          const data = await api(`/api/admin/rooms/${id}`, { method: 'DELETE' });
          toastOk(data.message);
          await Promise.all([loadRooms(), loadBuildings()]);
        } catch (err) {
          toastError(err.message);
        }
      });
    });

    roomsBody.querySelectorAll('[data-react-room]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-react-room'));
        const room = rooms.find((r) => r.id === id);
        if (!room) return;
        if (!window.confirm(`Reactivate "${room.name}"?`)) return;
        try {
          const data = await api(`/api/admin/rooms/${room.id}`, {
            method: 'PUT',
            body: {
              building_id: room.building_id,
              name: room.name,
              room_type: room.room_type,
              capacity: room.capacity,
              floor: room.floor,
              image_url: room.image_url,
              has_projector: room.has_projector,
              has_aircon: room.has_aircon,
              has_sound: room.has_sound,
              is_active: 1
            }
          });
          toastOk(data.message);
          P.broadcastAvailabilityChange();
          await loadRooms();
        } catch (err) {
          toastError(err.message);
        }
      });
    });
  }

  function openRoomModal(room) {
    editing.room = room ? room.id : null;
    document.getElementById('room-modal-title').textContent = room ? `Edit room #${room.id}` : 'Add room';
    if (!buildings.length) {
      toastError('Create a building first.');
      return;
    }
    roomForm.building_id.value = room ? room.building_id : buildings[0].id;
    roomForm.name.value = room ? room.name : '';
    roomForm.room_type.value = room ? room.room_type : 'laboratory';
    roomForm.capacity.value = room ? room.capacity : 40;
    roomForm.floor.value = room && room.floor ? room.floor : '';
    roomForm.image_url.value = room && room.image_url ? room.image_url : '';
    roomForm.has_projector.checked = room ? Boolean(room.has_projector) : false;
    roomForm.has_aircon.checked = room ? Boolean(room.has_aircon) : false;
    roomForm.has_sound.checked = room ? Boolean(room.has_sound) : false;
    roomForm.is_active.checked = room ? Boolean(room.is_active) : true;
    roomModal.show();
  }

  document.getElementById('new-room-btn').addEventListener('click', () => openRoomModal(null));
  if (showInactive) showInactive.addEventListener('change', loadRooms);

  roomForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const saveBtn = document.getElementById('room-save');
    busy(saveBtn, true, 'Saving...');
    try {
      const payload = {
        building_id: roomForm.building_id.value,
        name: roomForm.name.value.trim(),
        room_type: roomForm.room_type.value,
        capacity: roomForm.capacity.value,
        floor: roomForm.floor.value.trim(),
        image_url: roomForm.image_url.value.trim(),
        has_projector: roomForm.has_projector.checked,
        has_aircon: roomForm.has_aircon.checked,
        has_sound: roomForm.has_sound.checked,
        is_active: roomForm.is_active.checked
      };
      const data = editing.room
        ? await api(`/api/admin/rooms/${editing.room}`, { method: 'PUT', body: payload })
        : await api('/api/admin/rooms', { method: 'POST', body: payload });
      toastOk(data.message);
      P.broadcastAvailabilityChange();
      roomModal.hide();
      await Promise.all([loadRooms(), loadBuildings()]);
    } catch (err) {
      toastError(err.message);
    } finally {
      busy(saveBtn, false);
    }
  });

  /* ------------------------------------------------------ user management */

  const roleFilter = document.getElementById('user-role-filter');
  const userSearch = document.getElementById('user-search');

  async function loadUsers() {
    const params = new URLSearchParams();
    if (roleFilter.value) params.set('role', roleFilter.value);
    if (userSearch.value.trim()) params.set('search', userSearch.value.trim());
    try {
      const data = await api(`/api/admin/users?${params.toString()}`);
      users = data.users || [];
      renderUsers();
    } catch (err) {
      usersBody.innerHTML = emptyRow(9, `Could not load users: ${err.message}`);
    }
  }

  function renderUsers() {
    if (!users.length) {
      usersBody.innerHTML = emptyRow(9, 'No user accounts match this filter.');
      return;
    }

    usersBody.innerHTML = users.map((u) => `
      <tr>
        <td>#${u.id}</td>
        <td>${escapeHtml(u.school_id)}</td>
        <td class="fw-semibold">${escapeHtml(u.full_name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${roleBadge(u.role)}</td>
        <td>${escapeHtml(u.department || '-')}</td>
        <td>${u.is_active ? '<span class="badge text-bg-success">Active</span>' : '<span class="badge text-bg-secondary">Inactive</span>'}</td>
        <td>${escapeHtml(u.reservation_count)}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-sm btn-outline-cspc" data-edit-user="${u.id}">Edit</button>
          ${Number(u.id) === Number(me.id) ? '<span class="text-muted-sm ms-2">You</span>' : `<button class="btn btn-sm btn-reject ms-1" data-del-user="${u.id}">Delete</button>`}
        </td>
      </tr>`).join('');

    usersBody.querySelectorAll('[data-edit-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-edit-user'));
        openUserModal(users.find((u) => u.id === id));
      });
    });

    usersBody.querySelectorAll('[data-del-user]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-del-user'));
        const user = users.find((u) => u.id === id);
        if (!user) return;
        const warning = user.reservation_count > 0 ? `\n\nThis account has ${user.reservation_count} reservation(s), so it will be deactivated instead of deleted.` : '';
        if (!window.confirm(`Delete the account of "${user.full_name}"?${warning}`)) return;
        try {
          const data = await api(`/api/admin/users/${user.id}`, { method: 'DELETE' });
          toastOk(data.message);
          await loadUsers();
        } catch (err) {
          toastError(err.message);
        }
      });
    });
  }

  function openUserModal(user) {
    editing.user = user ? user.id : null;
    document.getElementById('user-modal-title').textContent = user ? `Edit account #${user.id}` : 'Add user account';
    const schoolIdGroup = document.getElementById('user-school-id-group');
    if (schoolIdGroup) schoolIdGroup.classList.toggle('d-none', Boolean(user));
    userForm.school_id.value = user ? user.school_id : '';
    userForm.full_name.value = user ? user.full_name : '';
    userForm.email.value = user ? user.email : '';
    userForm.recovery_email.value = user ? (user.recovery_email || '') : '';
    userForm.role.value = user ? user.role : 'student';
    userForm.department.value = user ? (user.department || '') : '';
    userForm.password.value = '';
    userForm.password.required = !user;
    document.getElementById('user-password-hint').textContent = user ? '(leave blank to keep current)' : '(required)';
    if (setUserAvatarPreview) setUserAvatarPreview(user ? (user.avatar_url || '') : '');
    userModal.show();
  }

  document.getElementById('new-user-btn').addEventListener('click', () => openUserModal(null));
  roleFilter.addEventListener('change', loadUsers);
  userSearch.addEventListener('input', loadUsers);

  userForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const saveBtn = document.getElementById('user-save');
    busy(saveBtn, true, 'Saving...');
    try {
      const payload = {
        school_id: userForm.school_id.value.trim(),
        full_name: userForm.full_name.value.trim(),
        email: userForm.email.value.trim(),
        recovery_email: userForm.recovery_email.value.trim() || undefined,
        role: userForm.role.value,
        department: userForm.department.value.trim(),
        password: userForm.password.value.trim() || undefined
      };

      const data = editing.user
        ? await api(`/api/admin/users/${editing.user}`, { method: 'PUT', body: payload })
        : await api('/api/admin/users', { method: 'POST', body: payload });
      toastOk(data.message);

      // Upload avatar if a file was selected
      const avatarFile = document.getElementById('user-avatar-input').files[0];
      if (avatarFile) {
        const targetId = editing.user || data.id;
        const formData = new FormData();
        formData.append('avatar', avatarFile);
        await api(`/api/admin/users/${targetId}/avatar`, { method: 'POST', body: formData });
      }

      userModal.hide();
      await loadUsers();
    } catch (err) {
      toastError(err.message);
    } finally {
      busy(saveBtn, false);
    }
  });

  /* ------------------------------------------------------ avatar preview helpers */

  function setupAvatarPreview(inputId, imgId, initialsId) {
    const input = document.getElementById(inputId);
    const img = document.getElementById(imgId);
    const initials = document.getElementById(initialsId);
    if (!input || !img || !initials) return null;

    function setPreview(url) {
      if (url) {
        img.src = url;
        img.hidden = false;
        initials.hidden = true;
      } else {
        img.src = '';
        img.hidden = true;
        initials.hidden = false;
      }
    }

    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      setPreview(URL.createObjectURL(file));
    });

    return setPreview;
  }

  const setUserAvatarPreview = setupAvatarPreview(
    'user-avatar-input', 'user-avatar-preview-img', 'user-avatar-preview-initials'
  );
  const setAdminAvatarPreview = setupAvatarPreview(
    'admin-avatar-input', 'admin-avatar-preview-img', 'admin-avatar-preview-initials'
  );

  /* ------------------------------------------------------ admin management */

  const adminModal = new bootstrap.Modal(document.getElementById('admin-modal'));
  const adminForm = document.getElementById('admin-form');
  let editingAdminId = null;

  async function loadAdmins() {
    try {
      const data = await api('/api/admin/administrators');
      const admins = data.admins || [];
      if (!admins.length) {
        adminsBody.innerHTML = emptyRow(7, 'No administrator accounts yet.');
        return;
      }

      adminsBody.innerHTML = admins.map((admin) => `
        <tr data-admin-id="${admin.id}">
          <td>${escapeHtml(admin.school_id)}</td>
          <td class="fw-semibold">${escapeHtml(admin.full_name)}</td>
          <td>${escapeHtml(admin.email)}</td>
          <td>${escapeHtml(admin.admin_level || 'Assistant Admin')}</td>
          <td>${escapeHtml(formatDateShort(admin.created_at))}</td>
          <td>${admin.is_active ? '<span class="badge text-bg-success">Active</span>' : '<span class="badge text-bg-secondary">Inactive</span>'}</td>
          <td class="text-end text-nowrap">
            <button class="btn btn-sm btn-outline-cspc" type="button" data-admin-action="edit" data-admin-id="${admin.id}">Edit</button>
            <button class="btn btn-sm ${admin.is_active ? 'btn-outline-warning' : 'btn-outline-success'} ms-1" type="button" data-admin-action="toggle" data-admin-id="${admin.id}" data-admin-active="${admin.is_active ? '1' : '0'}">${admin.is_active ? 'Deactivate' : 'Reactivate'}</button>
          </td>
        </tr>`).join('');

      adminsBody.querySelectorAll('[data-admin-action]').forEach((button) => {
        button.addEventListener('click', async () => {
          const id = Number(button.getAttribute('data-admin-id'));
          const admin = admins.find((item) => Number(item.id) === id);
          if (!admin) return;

          if (button.getAttribute('data-admin-action') === 'edit') {
            editingAdminId = id;
            document.getElementById('admin-modal-title').textContent = 'Edit administrator';
            document.getElementById('admin-save').textContent = 'Save changes';
            adminForm.full_name.value = admin.full_name;
            adminForm.school_id.value = admin.school_id;
            adminForm.email.value = admin.email;
            adminForm.recovery_email.value = admin.recovery_email || '';
            adminForm.admin_level.value = admin.admin_level || 'Assistant Admin';
            if (setAdminAvatarPreview) setAdminAvatarPreview(admin.avatar_url || '');
            document.getElementById('admin-password').value = '';
            document.getElementById('admin-password').closest('.col-md-6').classList.add('d-none');
            document.getElementById('admin-auto-generate-password').closest('.col-md-6').classList.add('d-none');
            document.getElementById('admin-first-login-notice').classList.add('d-none');
            adminModal.show();
            return;
          }

          const isActive = button.getAttribute('data-admin-active') === '1';
          const actionLabel = isActive ? 'deactivate' : 'reactivate';
          if (isActive && id === Number(me.id)) {
            toastError('You cannot deactivate your own active administrator account.');
            return;
          }
          if (!window.confirm(`Are you sure you want to ${actionLabel} ${admin.full_name}'s account?`)) return;

          try {
            const result = await api(`/api/admin/administrators/${id}/status`, {
              method: 'PATCH',
              body: { is_active: !isActive }
            });
            toastOk(result.message);
            await loadAdmins();
          } catch (err) {
            toastError(err.message);
          }
        });
      });
    } catch (err) {
      adminsBody.innerHTML = emptyRow(7, `Could not load admins: ${err.message}`);
    }
  }

  document.getElementById('new-admin-btn').addEventListener('click', () => {
    editingAdminId = null;
    adminForm.reset();
    document.getElementById('admin-modal-title').textContent = 'Add new admin';
    document.getElementById('admin-save').textContent = 'Create admin';
    document.getElementById('admin-password').closest('.col-md-6').classList.remove('d-none');
    document.getElementById('admin-auto-generate-password').closest('.col-md-6').classList.remove('d-none');
    document.getElementById('admin-first-login-notice').classList.remove('d-none');
    document.getElementById('admin-auto-generate-password').checked = true;
    document.getElementById('admin-password').value = '';
    adminModal.show();
  });

  adminForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const saveBtn = document.getElementById('admin-save');
    busy(saveBtn, true, editingAdminId ? 'Saving...' : 'Creating...');

    try {
      const payload = {
        full_name: adminForm.full_name.value.trim(),
        school_id: adminForm.school_id.value.trim(),
        email: adminForm.email.value.trim(),
        recovery_email: adminForm.recovery_email.value.trim() || undefined,
        admin_level: adminForm.admin_level.value,
        ...(editingAdminId ? {} : {
          password: adminForm.password.value.trim() || undefined,
          auto_generate_password: adminForm.auto_generate_password.checked
        })
      };

      const data = await api(editingAdminId
        ? `/api/admin/administrators/${editingAdminId}`
        : '/api/admin/administrators', {
        method: editingAdminId ? 'PUT' : 'POST',
        body: payload
      });

      toastOk(data.message + (data.temporary_password ? ` Temporary password: ${data.temporary_password}` : ''));

      // Upload avatar if a file was selected
      const avatarFile = document.getElementById('admin-avatar-input').files[0];
      if (avatarFile) {
        const targetId = editingAdminId || data.admin_id;
        const formData = new FormData();
        formData.append('avatar', avatarFile);
        await api(`/api/admin/administrators/${targetId}/avatar`, { method: 'POST', body: formData });
      }

      adminModal.hide();
      if (editingAdminId === Number(me.id)) {
        me.full_name = payload.full_name;
        me.email = payload.email;
        renderNavbar(me, 'admin');
      }
      adminForm.reset();
      editingAdminId = null;
      document.getElementById('admin-password').closest('.col-md-6').classList.remove('d-none');
      document.getElementById('admin-auto-generate-password').closest('.col-md-6').classList.remove('d-none');
      document.getElementById('admin-first-login-notice').classList.remove('d-none');
      await loadAdmins();
    } catch (err) {
      toastError(err.message);
    } finally {
      busy(saveBtn, false);
    }
  });

  /* ------------------------------------------------------ support ticket management */

  function supportStatusBadge(status) {
    const map = {
      Open: 'primary',
      'In Progress': 'warning',
      Resolved: 'success'
    };
    const tone = map[status] || 'secondary';
    return `<span class="badge rounded-pill text-bg-${tone}">${escapeHtml(status || 'Open')}</span>`;
  }

  async function loadSupportTickets() {
    try {
      const data = await api('/api/admin/support-tickets');
      const tickets = data.tickets || [];
      if (!tickets.length) {
        supportBody.innerHTML = emptyRow(9, 'No support tickets submitted yet.');
        return;
      }

      supportBody.innerHTML = tickets.map((ticket) => `
        <tr>
          <td>#${ticket.id}</td>
          <td class="fw-semibold">${escapeHtml(ticket.full_name)}</td>
          <td>${escapeHtml(ticket.role_department || '-')}</td>
          <td>${escapeHtml(ticket.contact || '-')}</td>
          <td>${escapeHtml(ticket.category)}</td>
          <td>${supportStatusBadge(ticket.status)}</td>
          <td style="max-width: 300px; white-space: normal;">${escapeHtml(ticket.description || '-')}</td>
          <td>${escapeHtml(new Date(ticket.created_at).toLocaleString(P.getLocale()))}</td>
          <td class="text-end text-nowrap">
            <button class="btn btn-sm btn-outline-cspc" type="button" data-ticket-status="In Progress" data-ticket-id="${ticket.id}">In progress</button>
            <button class="btn btn-sm btn-outline-success ms-1" type="button" data-ticket-status="Resolved" data-ticket-id="${ticket.id}">Resolve</button>
          </td>
        </tr>`).join('');

      supportBody.querySelectorAll('[data-ticket-status]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = Number(btn.getAttribute('data-ticket-id'));
          const status = btn.getAttribute('data-ticket-status');
          try {
            const data = await api(`/api/admin/support-tickets/${id}/status`, {
              method: 'PATCH',
              body: { status }
            });
            toastOk(data.message);
            await loadSupportTickets();
          } catch (err) {
            toastError(err.message);
          }
        });
      });
    } catch (err) {
      supportBody.innerHTML = emptyRow(9, `Could not load support tickets: ${err.message}`);
    }
  }

  /* ------------------------------------------------------ init */

  document.querySelectorAll('.admin-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activateAdminPane(btn.getAttribute('data-target'));
    });
  });

  function activateAdminPane(targetSelector) {
      const targetPane = targetSelector ? document.querySelector(targetSelector) : null;
      const overview = document.getElementById('admin-overview');

      document.querySelectorAll('.tab-pane').forEach((pane) => {
        pane.classList.remove('show', 'active');
        pane.classList.add('fade');
      });

      if (targetPane) {
        targetPane.classList.add('show', 'active');
        targetPane.classList.remove('fade');
      }

      if (overview) {
        const isReservations = targetSelector === '#pane-reservations';
        overview.classList.toggle('is-collapsed', !isReservations);
        if (!isReservations) {
          const resourceSummary = overview.querySelector('.resource-summary');
          if (resourceSummary) resourceSummary.open = false;
        }
      }

      document.querySelectorAll('.admin-nav-btn').forEach((item) => {
        item.classList.toggle('active', item.getAttribute('data-target') === targetSelector);
      });
  }

  // Sidebar is the single in-page nav; the global navbar links use URL hashes.

  function activatePaneFromHash() {
    const hash = window.location.hash;
    if (!hash || !document.querySelector(hash)) return;
    if (document.querySelector(`.admin-nav-btn[data-target="${hash}"]`)) {
      activateAdminPane(hash);
    }
  }

  window.addEventListener('hashchange', activatePaneFromHash);
  activatePaneFromHash();

  const adminLogoutBtn = document.getElementById('admin-logout');
  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', async () => {
      adminLogoutBtn.disabled = true;
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } catch {
        // Ignore logout failures and send the admin to the login page.
      }
      window.location.replace('/index.html?logged_out=1');
    });
  }

  document.addEventListener('portal-locale-change', () => {
    updateDashboardClock();
    loadStats();
    loadOverviewCounters();
    loadReservations();
    loadBuildings();
    loadRooms();
    loadUsers();
    loadAdmins();
    loadSupportTickets();
  });

  /* ------------------------------------------- admin availability quick check --- */

  const adminAvailForm = document.getElementById('admin-availability-form');
  const adminAvailDate = document.getElementById('admin-avail-date');
  const adminAvailTime = document.getElementById('admin-avail-time');
  const adminAvailBuilding = document.getElementById('admin-avail-building');
  const adminAvailCheck = document.getElementById('admin-avail-check');
  const adminAvailResult = document.getElementById('admin-avail-result');

  if (adminAvailDate) {
    adminAvailDate.value = P.todayIso();
  }

  function adminParseSlot(value) {
    const match = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const [h, m] = match[1].split(':').map(Number);
    const [eh, em] = match[2].split(':').map(Number);
    return { start: h * 60 + (m || 0), end: eh * 60 + (em || 0), label: value };
  }

  function adminOverlaps(slot, booking) {
    const bs = (booking.start_time || '').split(':').map(Number);
    const be = (booking.end_time || '').split(':').map(Number);
    const bStart = bs[0] * 60 + (bs[1] || 0);
    const bEnd = be[0] * 60 + (be[1] || 0);
    return bStart < slot.end && bEnd > slot.start;
  }

  if (adminAvailForm) {
    adminAvailForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!adminAvailResult) return;

      const slot = adminParseSlot(adminAvailTime?.value);
      const date = adminAvailDate?.value || P.todayIso();
      const params = new URLSearchParams({ date });
      const buildingName = adminAvailBuilding?.value?.trim();
      if (buildingName && window.__adminBuildingIdByName) {
        const bid = window.__adminBuildingIdByName.get(buildingName);
        if (bid) params.set('building_id', bid);
      }

      busy(adminAvailCheck, true, 'Checking...');
      adminAvailResult.hidden = true;

      try {
        const data = await api(`/api/availability?${params.toString()}`);
        const rooms = data.rooms || [];
        const matches = rooms.filter((room) => {
          const bookings = room.bookings || [];
          return slot ? !bookings.some((b) => adminOverlaps(slot, b)) : bookings.length === 0;
        });
        const when = slot ? `for <strong>${escapeHtml(slot.label)}</strong>` : 'all day';

        if (!rooms.length) {
          adminAvailResult.innerHTML = 'No active rooms are listed for that building yet.';
        } else if (!matches.length) {
          adminAvailResult.innerHTML = `No rooms are open ${when} on ${escapeHtml(P.formatDate(date))}.`;
        } else {
          adminAvailResult.innerHTML =
            `<strong>${matches.length} of ${rooms.length} rooms available</strong> ${when} on <strong>${escapeHtml(P.formatDate(date))}</strong>.`;
        }
        adminAvailResult.className = 'mt-2 text-small text-info';
        adminAvailResult.hidden = false;
      } catch (err) {
        adminAvailResult.innerHTML = `Could not check availability: ${escapeHtml(err.message)}`;
        adminAvailResult.className = 'mt-2 text-small text-danger';
        adminAvailResult.hidden = false;
      } finally {
        busy(adminAvailCheck, false);
      }
    });
  }

  await Promise.all([loadStats(), loadOverviewCounters(), loadReservations(), loadBuildings(), loadRooms(), loadUsers(), loadAdmins(), loadSupportTickets()]);
})();

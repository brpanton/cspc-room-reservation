/**
 * Early Check-Out & Admin Session Override Frontend Controller
 * with Two-Way Real-Time Notifications (SSE + Polling Fallback).
 *
 * Powers:
 *  1. User Dashboard (dashboard.html):
 *     - Active Session Highlight Card with "Check In" & "End Session Early / Check-Out Now" actions
 *     - User Early Check-Out Confirmation Modal (#early-checkout-modal)
 *     - Immediate In-App Alert Popup Modal (#session-terminated-alert-modal) + Top Alert Banner
 *       when an Admin force-terminates the user's session
 *  2. Admin Control Panel (admin-dashboard.html):
 *     - "⚡ Override / Force End" action modal (#admin-force-terminate-modal) with required
 *       "Reason for Termination" and post-termination room status ('Available' vs 'Under Maintenance')
 *     - Real-time "Lab Vacated Early" Admin Alert Banner when a user checks out early
 *     - Dedicated "Session Overrides & Logs" sidebar tab (#pane-session-overrides)
 *  3. Shared Two-Way Notification Center Bell & Drawer in Navbar
 */
'use strict';

(function () {
  function esc(val) {
    return String(val === undefined || val === null ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDateTime(iso) {
    if (!iso) return 'Just now';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function fmtTime(hhmmss) {
    if (window.Portal && typeof window.Portal.formatTime === 'function') {
      return window.Portal.formatTime(hhmmss);
    }
    const str = String(hhmmss || '').slice(0, 5);
    const [h, m] = str.split(':').map(Number);
    if (Number.isNaN(h)) return str;
    const suffix = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${suffix}`;
  }

  function fmtDate(iso) {
    if (window.Portal && typeof window.Portal.formatDateShort === 'function') {
      return window.Portal.formatDateShort(iso);
    }
    return String(iso || '').slice(0, 10);
  }

  async function apiCall(url, options = {}) {
    if (window.Portal && typeof window.Portal.api === 'function') {
      return window.Portal.api(url, options);
    }
    const opts = {
      method: options.method || 'GET',
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      credentials: 'same-origin'
    };
    if (options.body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(options.body);
    }
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function toastOk(msg) {
    if (window.Portal && typeof window.Portal.toastOk === 'function') {
      window.Portal.toastOk(msg);
    }
  }

  function toastErr(msg) {
    if (window.Portal && typeof window.Portal.toastError === 'function') {
      window.Portal.toastError(msg);
    } else {
      alert(msg);
    }
  }

  function broadcastSync() {
    if (window.Portal && typeof window.Portal.broadcastAvailabilityChange === 'function') {
      window.Portal.broadcastAvailabilityChange();
    }
  }

  let currentUser = null;
  let notificationsState = [];
  let unreadCountState = 0;
  const poppedTerminationIds = new Set();
  const poppedEarlyCheckoutIds = new Set();

  try {
    const saved = JSON.parse(sessionStorage.getItem('cspc_popped_notifs') || '[]');
    saved.forEach((id) => {
      poppedTerminationIds.add(Number(id));
      poppedEarlyCheckoutIds.add(Number(id));
    });
  } catch { /* ignore */ }

  function markNotifPopped(id) {
    if (!id) return;
    poppedTerminationIds.add(Number(id));
    poppedEarlyCheckoutIds.add(Number(id));
    try {
      sessionStorage.setItem(
        'cspc_popped_notifs',
        JSON.stringify([...new Set([...poppedTerminationIds, ...poppedEarlyCheckoutIds])].slice(-100))
      );
    } catch { /* ignore */ }
  }

  // ==========================================================================
  // 1. NAVBAR NOTIFICATION BELL & TWO-WAY NOTIFICATION CENTER DRAWER
  // ==========================================================================
  function injectNotificationBell() {
    if (document.getElementById('portal-notif-wrapper')) return;
    const utilityArea = document.querySelector('.navbar-account-area');
    if (!utilityArea) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'portal-notif-wrapper';
    wrapper.className = 'portal-notif-wrapper position-relative d-inline-flex align-items-center me-2';
    wrapper.innerHTML = `
      <button type="button" class="portal-notif-btn" id="portal-notif-btn" aria-label="Notifications" title="Session & Override Notifications">
        <span class="portal-notif-icon" aria-hidden="true">🔔</span>
        <span class="portal-notif-badge" id="portal-notif-badge" hidden>0</span>
      </button>
      <div class="portal-notif-drawer" id="portal-notif-drawer" hidden>
        <div class="portal-notif-drawer-header">
          <div>
            <span class="portal-notif-kicker">Real-Time Alerts</span>
            <h6 class="mb-0 fw-bold text-white">Session Notifications</h6>
          </div>
          <button type="button" class="btn btn-sm btn-link text-info text-decoration-none p-0 small" id="portal-notif-read-all">
            Mark all read
          </button>
        </div>
        <div class="portal-notif-drawer-body" id="portal-notif-list">
          <div class="text-center text-muted-sm py-4 small">Loading notifications…</div>
        </div>
      </div>
    `;

    utilityArea.insertBefore(wrapper, utilityArea.firstChild);

    const btn = wrapper.querySelector('#portal-notif-btn');
    const drawer = wrapper.querySelector('#portal-notif-drawer');
    const readAllBtn = wrapper.querySelector('#portal-notif-read-all');

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isHidden = drawer.hasAttribute('hidden');
      if (isHidden) {
        drawer.removeAttribute('hidden');
        renderNotificationDrawer();
      } else {
        drawer.setAttribute('hidden', '');
      }
    });

    readAllBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await apiCall('/api/notifications/read-all', { method: 'PATCH' });
        notificationsState.forEach((n) => { n.is_read = true; });
        unreadCountState = 0;
        updateNotificationBadge();
        renderNotificationDrawer();
      } catch (err) {
        toastErr(err.message);
      }
    });

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        drawer.setAttribute('hidden', '');
      }
    });
  }

  function updateNotificationBadge() {
    injectNotificationBell();
    const badge = document.getElementById('portal-notif-badge');
    if (!badge) return;
    if (unreadCountState > 0) {
      badge.textContent = unreadCountState > 99 ? '99+' : String(unreadCountState);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function renderNotificationDrawer() {
    const listEl = document.getElementById('portal-notif-list');
    if (!listEl) return;

    if (!notificationsState.length) {
      listEl.innerHTML = `
        <div class="text-center text-muted-sm py-4 small">
          No early check-out or session override alerts yet.
        </div>`;
      return;
    }

    listEl.innerHTML = notificationsState
      .slice(0, 20)
      .map((n) => {
        const isTerminated = n.event_type === 'ADMIN_TERMINATED';
        const isEarlyOut = n.event_type === 'EARLY_CHECKOUT';
        const pillClass = isTerminated
          ? 'bg-danger text-white'
          : isEarlyOut
            ? 'bg-info text-dark'
            : 'bg-success text-white';
        const pillLabel = isTerminated
          ? '⚡ Terminated by Admin'
          : isEarlyOut
            ? '⏱ Early Check-Out'
            : '● Session Alert';

        return `
          <div class="portal-notif-item ${n.is_read ? '' : 'is-unread'}" data-notif-id="${n.id}">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="badge rounded-pill ${pillClass}" style="font-size:0.68rem;">${pillLabel}</span>
              <span class="text-muted-sm" style="font-size:0.7rem;">${esc(fmtDateTime(n.actual_time || n.created_at))}</span>
            </div>
            <div class="fw-semibold small text-white mb-1">${esc(n.title)}</div>
            <div class="text-muted-sm small mb-1">${esc(n.message)}</div>
            ${
              n.reason
                ? `<div class="portal-notif-reason small mt-1">
                     <strong>${isTerminated ? 'Reason for Termination:' : 'Check-Out Note:'}</strong> ${esc(n.reason)}
                   </div>`
                : ''
            }
            <div class="d-flex justify-content-between align-items-center mt-2">
              <span class="small text-info">Reservation #${esc(n.reservation_id)} · ${esc(n.room_name || '')}</span>
              ${
                !n.is_read
                  ? `<button type="button" class="btn btn-sm btn-outline-light py-0 px-2" style="font-size:0.7rem;" data-mark-read="${n.id}">Acknowledge</button>`
                  : `<span class="small text-muted-sm" style="font-size:0.68rem;">✓ Read</span>`
              }
            </div>
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('[data-mark-read]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = Number(btn.getAttribute('data-mark-read'));
        try {
          await apiCall(`/api/notifications/${id}/read`, { method: 'PATCH' });
          const item = notificationsState.find((x) => Number(x.id) === id);
          if (item && !item.is_read) {
            item.is_read = true;
            unreadCountState = Math.max(0, unreadCountState - 1);
          }
          updateNotificationBadge();
          renderNotificationDrawer();
        } catch (err) {
          toastErr(err.message);
        }
      });
    });
  }

  // ==========================================================================
  // 2. USER EARLY CHECK-OUT MODAL & ACTIVE SESSION DASHBOARD BANNER
  // ==========================================================================
  function ensureEarlyCheckoutModal() {
    let modalEl = document.getElementById('early-checkout-modal');
    if (modalEl) return modalEl;

    modalEl = document.createElement('div');
    modalEl.id = 'early-checkout-modal';
    modalEl.className = 'session-override-backdrop';
    modalEl.hidden = true;
    modalEl.innerHTML = `
      <div class="session-override-dialog" role="dialog" aria-modal="true" aria-labelledby="early-checkout-title">
        <div class="session-override-header is-checkout">
          <div>
            <span class="session-override-kicker">Active Laboratory Session</span>
            <h4 class="h5 fw-bold text-white mb-0" id="early-checkout-title">End Session Early / Check-Out Now</h4>
          </div>
          <button type="button" class="btn-close btn-close-white" data-close-early-checkout="1" aria-label="Close"></button>
        </div>
        <form id="early-checkout-form">
          <div class="session-override-body">
            <input type="hidden" id="early-checkout-res-id" />
            <div class="session-summary-box mb-3" id="early-checkout-summary"></div>
            <div class="alert alert-info py-2 px-3 small mb-3" style="background:rgba(56,189,248,0.14);border-color:rgba(56,189,248,0.35);color:#e0f2fe;">
              <strong>Instant Availability Update:</strong> Confirming early check-out records your actual departure time, immediately restores the laboratory status to <strong>Available</strong>, and notifies the Administrator panel.
            </div>
            <div class="mb-2">
              <label class="form-label small fw-semibold" for="early-checkout-remarks">
                Session Wrap-Up / Check-Out Notes <span class="text-muted-sm fw-normal">(optional)</span>
              </label>
              <textarea class="form-control" id="early-checkout-remarks" rows="2" maxlength="255"
                        placeholder="e.g. Finished lab activity 45 mins early; all workstations powered down and room left clean."></textarea>
            </div>
          </div>
          <div class="session-override-footer">
            <button type="button" class="btn btn-outline-light btn-sm" data-close-early-checkout="1">Keep Session Active</button>
            <button type="submit" class="btn btn-warning text-dark fw-bold btn-sm px-3" id="early-checkout-submit-btn">
              ⏱ Confirm Early Check-Out
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modalEl);

    modalEl.querySelectorAll('[data-close-early-checkout]').forEach((btn) => {
      btn.addEventListener('click', () => {
        modalEl.hidden = true;
      });
    });
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) modalEl.hidden = true;
    });

    const form = modalEl.querySelector('#early-checkout-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const resId = Number(document.getElementById('early-checkout-res-id').value);
      const remarks = document.getElementById('early-checkout-remarks').value.trim();
      const submitBtn = document.getElementById('early-checkout-submit-btn');
      if (!resId) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Checking out…';
      try {
        const result = await apiCall(`/api/reservations/${resId}/early-checkout`, {
          method: 'PATCH',
          body: { remarks: remarks || undefined }
        });
        modalEl.hidden = true;
        toastOk(result.message || 'Checked out early! Laboratory is now Available.');
        broadcastSync();
        if (typeof window.PortalRefreshUserDashboard === 'function') {
          await window.PortalRefreshUserDashboard();
        }
        await pollNotifications();
      } catch (err) {
        toastErr(err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '⏱ Confirm Early Check-Out';
      }
    });

    return modalEl;
  }

  function openEarlyCheckoutModal(reservation) {
    if (!reservation) return;
    const modalEl = ensureEarlyCheckoutModal();
    document.getElementById('early-checkout-res-id').value = reservation.id;
    document.getElementById('early-checkout-remarks').value = '';
    const nowStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    document.getElementById('early-checkout-summary').innerHTML = `
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
        <div>
          <div class="fw-bold text-white fs-6">${esc(reservation.room_name || 'Laboratory')}</div>
          <div class="text-muted-sm small">${esc(reservation.building_name || '')} · Reservation #${esc(reservation.id)} (${esc(reservation.transaction_code || 'N/A')})</div>
        </div>
        <span class="badge bg-success rounded-pill">Approved Session</span>
      </div>
      <div class="row g-2 small mt-1">
        <div class="col-sm-6">
          <span class="text-muted-sm d-block">Scheduled Slot</span>
          <strong>${esc(fmtDate(reservation.res_date))} · ${esc(fmtTime(reservation.start_time))} – ${esc(fmtTime(reservation.end_time))}</strong>
        </div>
        <div class="col-sm-6">
          <span class="text-muted-sm d-block">Actual Check-Out Time</span>
          <strong class="text-warning">${esc(nowStr)} (Early Check-Out)</strong>
        </div>
      </div>
    `;
    modalEl.hidden = false;
  }

  /**
   * Renders the Active Session Control Panel on the User Dashboard (dashboard.html)
   * whenever the user has Approved reservations that can be checked into or ended early.
   */
  function renderActiveUserSessions(reservations) {
    if (!document.body.classList.contains('dashboard-page')) return;

    let host = document.getElementById('user-active-sessions-host');
    if (!host) {
      const hero = document.querySelector('.dashboard-hero');
      if (!hero || !hero.parentNode) return;
      host = document.createElement('section');
      host.id = 'user-active-sessions-host';
      host.className = 'mb-4';
      hero.parentNode.insertBefore(host, hero.nextSibling);
    }

    const activeItems = (reservations || []).filter(
      (r) => String(r.status) === 'Approved' && r.can_early_checkout !== false
    );

    if (!activeItems.length) {
      host.innerHTML = '';
      host.hidden = true;
      return;
    }

    host.hidden = false;
    host.innerHTML = `
      <div class="card active-session-banner-card">
        <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div class="d-flex align-items-center gap-2">
            <span class="active-session-pulse"></span>
            <span class="fw-bold text-white">Active / Approved Laboratory Session${activeItems.length > 1 ? 's' : ''}</span>
            <span class="badge rounded-pill bg-success">${activeItems.length} Active</span>
          </div>
          <span class="text-muted-small">Finished early? Check out now to free the lab for other users.</span>
        </div>
        <div class="card-body p-3">
          <div class="row g-3">
            ${activeItems
              .slice(0, 4)
              .map((r) => {
                const isCheckedIn = r.session_status === 'Active';
                return `
                  <div class="col-12 ${activeItems.length > 1 ? 'col-lg-6' : ''}">
                    <div class="active-session-item-card p-3 rounded-3">
                      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
                        <div>
                          <div class="d-flex align-items-center gap-2">
                            <h3 class="h6 fw-bold text-white mb-0">${esc(r.room_name)}</h3>
                            <span class="badge rounded-pill ${isCheckedIn ? 'bg-success' : 'bg-info text-dark'}">
                              ${isCheckedIn ? '● Checked-In (In Use)' : 'Approved · Ready'}
                            </span>
                          </div>
                          <div class="text-muted-small mt-1">
                            ${esc(r.building_name)} · Reservation <strong>#${esc(r.id)}</strong> (${esc(r.transaction_code || 'N/A')})
                          </div>
                          <div class="small text-white mt-1">
                            📅 <strong>${esc(fmtDate(r.res_date))}</strong> &nbsp;|&nbsp;
                            🕒 <strong>${esc(fmtTime(r.start_time))} – ${esc(fmtTime(r.end_time))}</strong>
                          </div>
                        </div>
                        <div class="d-flex flex-wrap gap-2 align-items-center">
                          ${
                            !isCheckedIn
                              ? `<button type="button" class="btn btn-sm btn-outline-info" data-session-checkin="${r.id}">
                                   ✓ Check In Now
                                 </button>`
                              : ''
                          }
                          <button type="button" class="btn btn-sm btn-warning text-dark fw-bold" data-early-checkout="${r.id}">
                            ⏱ End Session Early / Check-Out Now
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      </div>
    `;
  }

  window.PortalRenderActiveUserSessions = renderActiveUserSessions;

  // ==========================================================================
  // 3. USER IN-APP TERMINATION ALERT POPUP MODAL & ALERT BANNER
  // ==========================================================================
  function showUserTerminationAlert(notification) {
    if (!notification) return;

    // 1. Render persistent top alert banner on the user's dashboard
    renderUserTerminationBanner(notification);

    // 2. Show immediate modal popup if not already popped in this session
    if (poppedTerminationIds.has(Number(notification.id))) return;
    markNotifPopped(notification.id);

    let modalEl = document.getElementById('session-terminated-alert-modal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'session-terminated-alert-modal';
      modalEl.className = 'session-override-backdrop';
      document.body.appendChild(modalEl);
    }

    const adminName = notification.actor_name || 'System Administrator';
    const roomName = notification.room_name || 'Laboratory';
    const buildingName = notification.building_name || '';
    const reason = notification.reason || notification.termination_reason || 'Emergency / Administrative Override';
    const roomStatusAfter = notification.room_after_status || 'Available';

    modalEl.innerHTML = `
      <div class="session-override-dialog is-terminated-alert" role="alertdialog" aria-modal="true" aria-labelledby="term-alert-title">
        <div class="session-override-header is-terminated">
          <div class="d-flex align-items-center gap-2">
            <span class="fs-4" aria-hidden="true">🚨</span>
            <div>
              <span class="session-override-kicker text-warning">Immediate Session Override Alert</span>
              <h4 class="h5 fw-bold text-white mb-0" id="term-alert-title">Your Lab Session Was Cut Short by Admin</h4>
            </div>
          </div>
          <button type="button" class="btn-close btn-close-white" data-ack-termination="${notification.id}" aria-label="Close"></button>
        </div>
        <div class="session-override-body">
          <p class="text-white mb-3">
            Your active/scheduled laboratory reservation in <strong>${esc(roomName)}</strong>
            ${buildingName ? `(${esc(buildingName)})` : ''} — Reservation <strong>#${esc(notification.reservation_id)}</strong>
            has been <strong>Terminated by Administrator</strong> (${esc(adminName)}).
          </p>
          <div class="termination-reason-callout p-3 rounded-3 mb-3">
            <div class="text-uppercase small fw-bold text-warning mb-1">Admin's Stated Reason for Termination</div>
            <div class="fs-6 fw-semibold text-white">${esc(reason)}</div>
          </div>
          <div class="row g-2 small text-muted-sm">
            <div class="col-sm-6">
              <span>Laboratory Status Now:</span>
              <strong class="text-white d-block">${esc(roomStatusAfter)}</strong>
            </div>
            <div class="col-sm-6">
              <span>Time of Override:</span>
              <strong class="text-white d-block">${esc(fmtDateTime(notification.actual_time || notification.created_at))}</strong>
            </div>
          </div>
        </div>
        <div class="session-override-footer">
          <a href="/reservation-form.html" class="btn btn-outline-light btn-sm">Book Another Room</a>
          <button type="button" class="btn btn-danger fw-bold btn-sm px-4" data-ack-termination="${notification.id}">
            I Acknowledge &amp; Understand
          </button>
        </div>
      </div>
    `;

    modalEl.hidden = false;

    modalEl.querySelectorAll('[data-ack-termination]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        modalEl.hidden = true;
        try {
          if (notification.id) {
            await apiCall(`/api/notifications/${notification.id}/read`, { method: 'PATCH' });
            const found = notificationsState.find((x) => Number(x.id) === Number(notification.id));
            if (found) found.is_read = true;
            unreadCountState = notificationsState.filter((x) => !x.is_read).length;
            updateNotificationBadge();
          }
        } catch { /* ignore */ }
      });
    });
  }

  function renderUserTerminationBanner(notification) {
    if (!notification || !document.body.classList.contains('dashboard-page')) return;

    let banner = document.getElementById('user-terminated-alert-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'user-terminated-alert-banner';
      banner.className = 'user-terminated-banner mb-3';
      const mainContainer = document.querySelector('main.container');
      if (mainContainer) {
        mainContainer.insertBefore(banner, mainContainer.firstChild);
      }
    }

    const reason = notification.reason || notification.termination_reason || 'Administrative Override';
    banner.innerHTML = `
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">
        <div class="d-flex align-items-start gap-3">
          <span class="fs-4 mt-1" aria-hidden="true">⚠️</span>
          <div>
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span class="badge bg-danger">Terminated by Admin</span>
              <strong class="text-white">${esc(notification.title || `Session Terminated — ${notification.room_name}`)}</strong>
              <span class="text-muted-sm small">${esc(fmtDateTime(notification.actual_time || notification.created_at))}</span>
            </div>
            <div class="small text-white mt-1">${esc(notification.message)}</div>
            <div class="small text-warning fw-semibold mt-1">
              Reason for Termination: "${esc(reason)}"
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-sm btn-outline-light" id="dismiss-user-term-banner">Dismiss</button>
      </div>
    `;

    banner.querySelector('#dismiss-user-term-banner')?.addEventListener('click', async () => {
      banner.remove();
      if (notification.id && !notification.is_read) {
        try {
          await apiCall(`/api/notifications/${notification.id}/read`, { method: 'PATCH' });
        } catch { /* ignore */ }
      }
    });
  }

  // ==========================================================================
  // 4. ADMIN FORCE TERMINATION MODAL & REAL-TIME EARLY CHECK-OUT BANNER
  // ==========================================================================
  function ensureAdminTerminateModal() {
    let modalEl = document.getElementById('admin-force-terminate-modal');
    if (modalEl) return modalEl;

    modalEl = document.createElement('div');
    modalEl.id = 'admin-force-terminate-modal';
    modalEl.className = 'session-override-backdrop';
    modalEl.hidden = true;
    modalEl.innerHTML = `
      <div class="session-override-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-term-title">
        <div class="session-override-header is-terminated">
          <div>
            <span class="session-override-kicker text-warning">Admin Session Override Tool</span>
            <h4 class="h5 fw-bold text-white mb-0" id="admin-term-title">Force Terminate / Override Active Lab Session</h4>
          </div>
          <button type="button" class="btn-close btn-close-white" data-close-admin-term="1" aria-label="Close"></button>
        </div>
        <form id="admin-force-terminate-form">
          <div class="session-override-body">
            <input type="hidden" id="admin-term-res-id" />
            <div class="session-summary-box mb-3" id="admin-term-summary"></div>

            <div class="mb-2">
              <span class="d-block small text-muted-sm mb-1">Quick-Select Override Reason:</span>
              <div class="d-flex flex-wrap gap-1" id="admin-term-reason-chips">
                <button type="button" class="btn btn-xs btn-outline-info py-1 px-2" style="font-size:0.74rem;" data-reason-chip="Sudden unscheduled facility or equipment maintenance required immediately.">🔧 Sudden Maintenance</button>
                <button type="button" class="btn btn-xs btn-outline-warning py-1 px-2" style="font-size:0.74rem;" data-reason-chip="Campus emergency / safety drill requiring immediate evacuation of the laboratory.">🚨 Emergency / Safety</button>
                <button type="button" class="btn btn-xs btn-outline-danger py-1 px-2" style="font-size:0.74rem;" data-reason-chip="Laboratory protocol or usage policy violation observed during the session.">⚠ Protocol Violation</button>
                <button type="button" class="btn btn-xs btn-outline-light py-1 px-2" style="font-size:0.74rem;" data-reason-chip="Power or network outage affecting workstations in this laboratory.">⚡ Power / Network Outage</button>
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label small fw-bold text-warning" for="admin-term-reason">
                Reason for Termination <span class="text-danger">* (Required — sent immediately to user)</span>
              </label>
              <textarea class="form-control" id="admin-term-reason" rows="3" minlength="5" maxlength="500" required
                        placeholder="State the clear reason for cutting short or overriding this laboratory session (minimum 5 characters)..."></textarea>
            </div>

            <div class="row g-2 align-items-end">
              <div class="col-sm-8">
                <label class="form-label small fw-semibold" for="admin-term-room-status">
                  Set Laboratory Status Immediately After Termination
                </label>
                <select class="form-select form-select-sm" id="admin-term-room-status">
                  <option value="Available">🟢 Available — Free laboratory immediately for other bookings</option>
                  <option value="Under Maintenance">🟠 Under Maintenance — Lock laboratory &amp; publish Ongoing Maintenance alert</option>
                </select>
              </div>
              <div class="col-sm-4" id="admin-term-maint-hours-wrap" hidden>
                <label class="form-label small fw-semibold" for="admin-term-maint-hours">Lock Duration (hrs)</label>
                <input type="number" class="form-control form-control-sm" id="admin-term-maint-hours" min="1" max="72" value="4" />
              </div>
            </div>
          </div>
          <div class="session-override-footer">
            <button type="button" class="btn btn-outline-light btn-sm" data-close-admin-term="1">Cancel</button>
            <button type="submit" class="btn btn-danger fw-bold btn-sm px-3" id="admin-term-submit-btn">
              ⚡ Force Terminate &amp; Notify User
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modalEl);

    modalEl.querySelectorAll('[data-close-admin-term]').forEach((btn) => {
      btn.addEventListener('click', () => {
        modalEl.hidden = true;
      });
    });
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) modalEl.hidden = true;
    });

    modalEl.querySelectorAll('[data-reason-chip]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const reasonInput = document.getElementById('admin-term-reason');
        reasonInput.value = chip.getAttribute('data-reason-chip');
        reasonInput.focus();
      });
    });

    const roomStatusSel = modalEl.querySelector('#admin-term-room-status');
    const maintHoursWrap = modalEl.querySelector('#admin-term-maint-hours-wrap');
    roomStatusSel.addEventListener('change', () => {
      maintHoursWrap.hidden = roomStatusSel.value !== 'Under Maintenance';
    });

    const form = modalEl.querySelector('#admin-force-terminate-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const resId = Number(document.getElementById('admin-term-res-id').value);
      const reason = document.getElementById('admin-term-reason').value.trim();
      const roomStatusAfter = document.getElementById('admin-term-room-status').value;
      const maintHours = Number(document.getElementById('admin-term-maint-hours').value) || 4;
      const submitBtn = document.getElementById('admin-term-submit-btn');

      if (!reason || reason.length < 5) {
        toastErr('Please enter a Reason for Termination (at least 5 characters).');
        document.getElementById('admin-term-reason').focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Terminating Session…';
      try {
        const result = await apiCall(`/api/reservations/${resId}/force-terminate`, {
          method: 'PATCH',
          body: {
            reason,
            room_status_after: roomStatusAfter,
            maintenance_hours: maintHours
          }
        });
        modalEl.hidden = true;
        toastOk(result.message || `Reservation #${resId} terminated and user notified.`);
        broadcastSync();
        if (typeof window.PortalRefreshAdminDashboard === 'function') {
          await window.PortalRefreshAdminDashboard();
        }
        await loadAdminSessionOverridePane();
        await pollNotifications();
      } catch (err) {
        toastErr(err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '⚡ Force Terminate & Notify User';
      }
    });

    return modalEl;
  }

  function openAdminTerminateModal(reservation) {
    if (!reservation) return;
    const modalEl = ensureAdminTerminateModal();
    document.getElementById('admin-term-res-id').value = reservation.id;
    document.getElementById('admin-term-reason').value = '';
    document.getElementById('admin-term-room-status').value = 'Available';
    document.getElementById('admin-term-maint-hours-wrap').hidden = true;

    const userName = reservation.requested_by || reservation.user_name || 'User';
    const schoolId = reservation.requester_school_id || reservation.user_school_id || '';

    document.getElementById('admin-term-summary').innerHTML = `
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
        <div>
          <div class="fw-bold text-white fs-6">${esc(reservation.room_name || 'Laboratory')} (${esc(reservation.building_name || '')})</div>
          <div class="text-muted-sm small">Reservation #${esc(reservation.id)} · Code: <strong>${esc(reservation.transaction_code || 'N/A')}</strong></div>
        </div>
        <span class="badge bg-warning text-dark">Override Target</span>
      </div>
      <div class="row g-2 small mt-1">
        <div class="col-sm-6">
          <span class="text-muted-sm d-block">Occupant / Requester</span>
          <strong class="text-white">${esc(userName)} ${schoolId ? `(${esc(schoolId)})` : ''}</strong>
        </div>
        <div class="col-sm-6">
          <span class="text-muted-sm d-block">Scheduled Session</span>
          <strong class="text-white">${esc(fmtDate(reservation.res_date))} · ${esc(fmtTime(reservation.start_time))} – ${esc(fmtTime(reservation.end_time))}</strong>
        </div>
      </div>
    `;

    modalEl.hidden = false;
    setTimeout(() => document.getElementById('admin-term-reason')?.focus(), 80);
  }

  /**
   * Shows a prominent live alert banner on the Admin Dashboard when a user
   * vacates a laboratory early (Early Check-Out).
   */
  function renderAdminEarlyCheckoutBanner(notification) {
    if (!notification || !document.body.classList.contains('admin-dashboard-page')) return;

    let banner = document.getElementById('admin-early-checkout-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'admin-early-checkout-banner';
      banner.className = 'admin-early-checkout-banner mb-3';
      const adminMain = document.querySelector('.admin-main');
      const topbar = document.querySelector('.admin-topbar');
      if (adminMain && topbar && topbar.nextSibling) {
        adminMain.insertBefore(banner, topbar.nextSibling);
      } else if (adminMain) {
        adminMain.prepend(banner);
      }
    }

    const vacatedTime = fmtDateTime(notification.actual_time || notification.created_at);
    banner.innerHTML = `
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">
        <div class="d-flex align-items-start gap-3">
          <span class="fs-4 mt-1" aria-hidden="true">⏱️</span>
          <div>
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span class="badge bg-info text-dark fw-bold">Lab Vacated Early</span>
              <strong class="text-white">Reservation #${esc(notification.reservation_id)} (${esc(notification.transaction_code || 'N/A')})</strong>
              <span class="badge bg-success">Room Now Available</span>
            </div>
            <div class="small text-white mt-1">
              <strong>User:</strong> ${esc(notification.user_name || notification.actor_name || 'Student/Faculty')}
              ${notification.user_school_id ? `(${esc(notification.user_school_id)})` : ''}
              &nbsp;|&nbsp;
              <strong>Lab Room:</strong> ${esc(notification.room_name)} (${esc(notification.building_name || '')})
              &nbsp;|&nbsp;
              <strong>Actual Time Vacated:</strong> <span class="text-info fw-semibold">${esc(vacatedTime)}</span>
            </div>
            ${
              notification.reason
                ? `<div class="small text-muted-sm mt-1">User Note: "${esc(notification.reason)}"</div>`
                : ''
            }
          </div>
        </div>
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-sm btn-outline-info" id="view-session-logs-btn">View Override &amp; Check-Out Logs</button>
          <button type="button" class="btn btn-sm btn-outline-light" id="dismiss-admin-early-banner">Dismiss</button>
        </div>
      </div>
    `;

    banner.querySelector('#view-session-logs-btn')?.addEventListener('click', () => {
      document.querySelector('.admin-nav-btn[data-target="#pane-session-overrides"]')?.click();
    });

    banner.querySelector('#dismiss-admin-early-banner')?.addEventListener('click', async () => {
      banner.remove();
      if (notification.id && !notification.is_read) {
        try {
          await apiCall(`/api/notifications/${notification.id}/read`, { method: 'PATCH' });
        } catch { /* ignore */ }
      }
    });
  }

  // ==========================================================================
  // 5. ADMIN SIDEBAR TAB: "SESSION OVERRIDES & CHECK-OUT LOGS"
  // ==========================================================================
  let cachedAdminActiveSessions = [];

  function injectAdminSessionOverrideTab() {
    if (!document.body.classList.contains('admin-dashboard-page')) return;
    if (document.getElementById('pane-session-overrides')) return;

    const adminNav = document.querySelector('.admin-nav');
    const tabContent = document.querySelector('.admin-main .tab-content');
    if (!adminNav || !tabContent) return;

    const navBtn = document.createElement('button');
    navBtn.type = 'button';
    navBtn.className = 'admin-nav-btn';
    navBtn.setAttribute('data-target', '#pane-session-overrides');
    navBtn.innerHTML = '⚡ Session Overrides';

    // Insert right after Reservations button
    const firstBtn = adminNav.querySelector('.admin-nav-btn');
    if (firstBtn && firstBtn.nextSibling) {
      adminNav.insertBefore(navBtn, firstBtn.nextSibling);
    } else {
      adminNav.appendChild(navBtn);
    }

    const pane = document.createElement('div');
    pane.className = 'tab-pane fade';
    pane.id = 'pane-session-overrides';
    pane.setAttribute('role', 'tabpanel');
    pane.innerHTML = `
      <div class="card mb-4">
        <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <span class="fw-bold text-white">Active / Approved Laboratory Sessions (Admin Override Control)</span>
            <div class="text-muted-sm small">Manually cut short or override any ongoing or approved laboratory session with a required reason.</div>
          </div>
          <button type="button" class="btn btn-sm btn-outline-cspc" id="refresh-session-overrides-btn">↻ Refresh</button>
        </div>
        <div class="table-responsive">
          <table class="table table-portal table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th>#</th>
                <th>Transaction</th>
                <th>User</th>
                <th>Lab Room</th>
                <th>Scheduled Window</th>
                <th>Session State</th>
                <th class="text-end">Admin Override</th>
              </tr>
            </thead>
            <tbody id="admin-active-sessions-body">
              <tr><td colspan="7" class="text-center text-muted-sm py-4">Loading active sessions…</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <span class="fw-bold text-white">Early Check-Out &amp; Session Override Notification Log</span>
            <div class="text-muted-sm small">Real-time audit trail of user early check-outs and administrator force terminations.</div>
          </div>
          <div class="btn-group btn-group-sm" role="group" id="session-log-filter-group">
            <button type="button" class="btn btn-outline-secondary active" data-log-filter="">All Events</button>
            <button type="button" class="btn btn-outline-secondary" data-log-filter="EARLY_CHECKOUT">⏱ Early Check-Outs</button>
            <button type="button" class="btn btn-outline-secondary" data-log-filter="ADMIN_TERMINATED">⚡ Admin Terminations</button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-portal table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th>Reservation</th>
                <th>Event Type</th>
                <th>User</th>
                <th>Laboratory Room</th>
                <th>Reason / Check-Out Notes</th>
                <th>Lab Status After</th>
                <th>Actual Timestamp</th>
              </tr>
            </thead>
            <tbody id="admin-session-logs-body">
              <tr><td colspan="7" class="text-center text-muted-sm py-4">Loading audit logs…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    tabContent.appendChild(pane);

    navBtn.addEventListener('click', () => {
      document.querySelectorAll('.admin-main .tab-pane').forEach((p) => {
        p.classList.remove('show', 'active');
        p.classList.add('fade');
      });
      pane.classList.add('show', 'active');
      pane.classList.remove('fade');

      const overview = document.getElementById('admin-overview');
      if (overview) overview.classList.add('is-collapsed');

      document.querySelectorAll('.admin-nav-btn').forEach((b) => {
        b.classList.toggle('active', b === navBtn);
      });

      loadAdminSessionOverridePane();
    });

    pane.querySelector('#refresh-session-overrides-btn')?.addEventListener('click', loadAdminSessionOverridePane);

    pane.querySelectorAll('#session-log-filter-group button').forEach((btn) => {
      btn.addEventListener('click', () => {
        pane.querySelectorAll('#session-log-filter-group button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderAdminSessionLogsTable(btn.getAttribute('data-log-filter') || '');
      });
    });
  }

  let cachedSessionLogs = [];

  async function loadAdminSessionOverridePane() {
    if (!document.body.classList.contains('admin-dashboard-page')) return;
    const activeBody = document.getElementById('admin-active-sessions-body');
    const logsBody = document.getElementById('admin-session-logs-body');
    if (!activeBody || !logsBody) return;

    try {
      const data = await apiCall('/api/admin/session-logs');
      cachedAdminActiveSessions = data.active_sessions || [];
      cachedSessionLogs = data.logs || [];

      if (!cachedAdminActiveSessions.length) {
        activeBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted-sm py-4">No active Approved sessions right now.</td></tr>`;
      } else {
        activeBody.innerHTML = cachedAdminActiveSessions
          .map((r) => {
            const isCheckedIn = r.session_status === 'Active';
            return `
              <tr>
                <td><strong>#${esc(r.id)}</strong></td>
                <td><span class="badge bg-info text-dark">${esc(r.transaction_code || '-')}</span></td>
                <td>
                  <div class="fw-semibold">${esc(r.requested_by || 'User')}</div>
                  <div class="text-muted-sm small">${esc(r.requester_school_id || '')}</div>
                </td>
                <td>
                  <div class="fw-semibold">${esc(r.room_name)}</div>
                  <div class="text-muted-sm small">${esc(r.building_name)}</div>
                </td>
                <td>
                  <div>${esc(fmtDate(r.res_date))}</div>
                  <div class="text-muted-sm small">${esc(fmtTime(r.start_time))} – ${esc(fmtTime(r.end_time))}</div>
                </td>
                <td>
                  <span class="badge rounded-pill ${isCheckedIn ? 'bg-success' : 'bg-primary'}">
                    ${isCheckedIn ? '● Checked-In (In Progress)' : 'Approved · Scheduled'}
                  </span>
                </td>
                <td class="text-end">
                  <button type="button" class="btn btn-sm btn-warning text-dark fw-bold" data-force-terminate="${r.id}">
                    ⚡ Override / Force End
                  </button>
                </td>
              </tr>
            `;
          })
          .join('');
      }

      const activeFilterBtn = document.querySelector('#session-log-filter-group button.active');
      renderAdminSessionLogsTable(activeFilterBtn ? activeFilterBtn.getAttribute('data-log-filter') || '' : '');
    } catch (err) {
      activeBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">${esc(err.message)}</td></tr>`;
    }
  }

  function renderAdminSessionLogsTable(eventFilter = '') {
    const logsBody = document.getElementById('admin-session-logs-body');
    if (!logsBody) return;

    const filtered = eventFilter
      ? cachedSessionLogs.filter((l) => l.event_type === eventFilter)
      : cachedSessionLogs;

    if (!filtered.length) {
      logsBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted-sm py-4">No session check-out or override events recorded yet.</td></tr>`;
      return;
    }

    logsBody.innerHTML = filtered
      .map((l) => {
        const isTerminated = l.event_type === 'ADMIN_TERMINATED';
        const isEarlyOut = l.event_type === 'EARLY_CHECKOUT';
        const badgeHtml = isTerminated
          ? '<span class="badge rounded-pill bg-danger">⚡ Terminated by Admin</span>'
          : isEarlyOut
            ? '<span class="badge rounded-pill bg-info text-dark">⏱ User Early Check-Out</span>'
            : `<span class="badge rounded-pill bg-secondary">${esc(l.event_type)}</span>`;

        const roomAfterBadge =
          l.room_after_status === 'Under Maintenance'
            ? '<span class="badge badge-maintenance">⚠ Under Maintenance</span>'
            : '<span class="badge bg-success">Available</span>';

        return `
          <tr>
            <td>
              <div class="fw-bold">#${esc(l.reservation_id)}</div>
              <div class="text-muted-sm small">${esc(l.transaction_code || '')}</div>
            </td>
            <td>${badgeHtml}</td>
            <td>
              <div class="fw-semibold">${esc(l.user_name || '-')}</div>
              <div class="text-muted-sm small">${esc(l.user_school_id || '')}</div>
            </td>
            <td>
              <div class="fw-semibold">${esc(l.room_name || '-')}</div>
              <div class="text-muted-sm small">${esc(l.building_name || '')}</div>
            </td>
            <td style="max-width:280px;">
              <div class="small text-white">${esc(l.reason || l.message || '-')}</div>
              ${
                isTerminated && l.actor_name
                  ? `<div class="text-muted-sm" style="font-size:0.72rem;">Overridden by: ${esc(l.actor_name)}</div>`
                  : ''
              }
            </td>
            <td>${roomAfterBadge}</td>
            <td class="text-nowrap small">${esc(fmtDateTime(l.actual_time || l.created_at))}</td>
          </tr>
        `;
      })
      .join('');
  }

  // ==========================================================================
  // 6. GLOBAL CLICK DELEGATION FOR EARLY CHECK-OUT, CHECK-IN, & FORCE TERMINATE
  // ==========================================================================
  document.addEventListener('click', async (e) => {
    // 1. User Early Check-Out button
    const earlyBtn = e.target.closest('[data-early-checkout]');
    if (earlyBtn) {
      e.preventDefault();
      const id = Number(earlyBtn.getAttribute('data-early-checkout'));
      const list =
        typeof window.PortalGetUserReservations === 'function' ? window.PortalGetUserReservations() : [];
      let reservation = list.find((r) => Number(r.id) === id);
      if (!reservation) {
        try {
          const data = await apiCall(`/api/reservations/${id}`);
          reservation = data.reservation;
        } catch (err) {
          return toastErr(err.message);
        }
      }
      openEarlyCheckoutModal(reservation);
      return;
    }

    // 2. User Check-In button
    const checkinBtn = e.target.closest('[data-session-checkin]');
    if (checkinBtn) {
      e.preventDefault();
      const id = Number(checkinBtn.getAttribute('data-session-checkin'));
      checkinBtn.disabled = true;
      checkinBtn.textContent = 'Checking in…';
      try {
        const res = await apiCall(`/api/reservations/${id}/check-in`, { method: 'PATCH' });
        toastOk(res.message || 'Session checked in!');
        if (typeof window.PortalRefreshUserDashboard === 'function') {
          await window.PortalRefreshUserDashboard();
        }
      } catch (err) {
        toastErr(err.message);
      } finally {
        checkinBtn.disabled = false;
      }
      return;
    }

    // 3. Admin Force Terminate / Override button
    const termBtn = e.target.closest('[data-force-terminate]');
    if (termBtn) {
      e.preventDefault();
      const id = Number(termBtn.getAttribute('data-force-terminate'));
      const adminList =
        typeof window.PortalGetAdminReservations === 'function' ? window.PortalGetAdminReservations() : [];
      let reservation =
        adminList.find((r) => Number(r.id) === id) ||
        cachedAdminActiveSessions.find((r) => Number(r.id) === id);
      if (!reservation) {
        try {
          const data = await apiCall(`/api/reservations/${id}`);
          reservation = data.reservation;
        } catch (err) {
          return toastErr(err.message);
        }
      }
      openAdminTerminateModal(reservation);
    }
  });

  // ==========================================================================
  // 7. TWO-WAY REAL-TIME NOTIFICATION ENGINE (SSE + 8s POLLING FALLBACK)
  // ==========================================================================
  async function pollNotifications() {
    if (!currentUser) return;
    try {
      const data = await apiCall('/api/notifications?limit=25');
      notificationsState = data.notifications || [];
      unreadCountState = Number(data.unread_count || 0);
      updateNotificationBadge();

      if (currentUser.role === 'admin' || currentUser.role === 'custodian') {
        // Check for any unread EARLY_CHECKOUT notification to display the Admin banner
        const latestEarlyOut = notificationsState.find(
          (n) => n.event_type === 'EARLY_CHECKOUT' && !n.is_read
        );
        if (latestEarlyOut) {
          renderAdminEarlyCheckoutBanner(latestEarlyOut);
          if (!poppedEarlyCheckoutIds.has(Number(latestEarlyOut.id))) {
            markNotifPopped(latestEarlyOut.id);
            toastOk(`⏱ Lab Vacated Early: ${latestEarlyOut.room_name} by ${latestEarlyOut.user_name || 'User'}`);
            if (typeof window.PortalRefreshAdminDashboard === 'function') {
              window.PortalRefreshAdminDashboard();
            }
          }
        }
      } else {
        // Student / Faculty: Check for any unread ADMIN_TERMINATED notification
        const latestTerminated = notificationsState.find(
          (n) => n.event_type === 'ADMIN_TERMINATED' && !n.is_read
        );
        if (latestTerminated) {
          showUserTerminationAlert(latestTerminated);
        }
      }
    } catch {
      /* ignore transient polling errors */
    }
  }

  function startRealtimeNotificationStream() {
    if (!currentUser || typeof window.EventSource !== 'function') return;

    try {
      const es = new EventSource('/api/notifications/stream');

      es.addEventListener('early_checkout', (event) => {
        try {
          const payload = JSON.parse(event.data || '{}');
          if (payload.notification) {
            notificationsState.unshift(payload.notification);
            if (currentUser.role === 'admin' || currentUser.role === 'custodian') {
              unreadCountState += 1;
              updateNotificationBadge();
              renderAdminEarlyCheckoutBanner(payload.notification);
              markNotifPopped(payload.notification.id);
              toastOk(
                `⏱ Early Check-Out: ${payload.room_name} vacated by ${payload.user_name} (Reservation #${payload.notification.reservation_id})`
              );
              if (typeof window.PortalRefreshAdminDashboard === 'function') {
                window.PortalRefreshAdminDashboard();
              }
              loadAdminSessionOverridePane();
            }
          }
        } catch { /* ignore */ }
      });

      es.addEventListener('session_terminated', (event) => {
        try {
          const payload = JSON.parse(event.data || '{}');
          if (payload.notification) {
            notificationsState.unshift(payload.notification);
            if (Number(payload.notification.recipient_user_id) === Number(currentUser.id)) {
              unreadCountState += 1;
              updateNotificationBadge();
              showUserTerminationAlert(payload.notification);
              if (typeof window.PortalRefreshUserDashboard === 'function') {
                window.PortalRefreshUserDashboard();
              }
            } else if (currentUser.role === 'admin' || currentUser.role === 'custodian') {
              if (typeof window.PortalRefreshAdminDashboard === 'function') {
                window.PortalRefreshAdminDashboard();
              }
              loadAdminSessionOverridePane();
            }
          }
        } catch { /* ignore */ }
      });

      es.addEventListener('room_status_updated', () => {
        broadcastSync();
        if (typeof window.PortalRefreshUserDashboard === 'function') {
          window.PortalRefreshUserDashboard();
        }
      });
    } catch {
      /* Polling fallback handles everything if SSE fails */
    }
  }

  // ==========================================================================
  // 8. BOOTSTRAP ON PAGE LOAD
  // ==========================================================================
  async function init() {
    try {
      const session =
        window.Portal && typeof window.Portal.getSession === 'function'
          ? await window.Portal.getSession()
          : await apiCall('/api/session');

      if (!session || !session.authenticated || !session.user) return;
      currentUser = session.user;

      // Wait briefly for navbar to finish rendering before injecting the bell
      setTimeout(() => {
        injectNotificationBell();
        updateNotificationBadge();
      }, 150);

      if (document.body.classList.contains('admin-dashboard-page')) {
        injectAdminSessionOverrideTab();
        loadAdminSessionOverridePane();
      }

      if (document.body.classList.contains('dashboard-page')) {
        if (typeof window.PortalGetUserReservations === 'function') {
          const existing = window.PortalGetUserReservations();
          if (existing && existing.length) renderActiveUserSessions(existing);
        }
      }

      await pollNotifications();
      startRealtimeNotificationStream();

      // Polling fallback every 8 seconds to guarantee instant two-way updates
      setInterval(pollNotifications, 8000);
    } catch {
      /* ignore unauthenticated pages */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


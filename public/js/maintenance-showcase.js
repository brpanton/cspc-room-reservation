/**
 * Maintenance & Facility Showcase Frontend Controller.
 *
 * Automatically enhances:
 *  1. Public Landing Page (home.html):
 *     - Top Maintenance Notification Banner
 *     - Advertisement-Style Facility Showcase Hero Carousel ("Available" vs "Under Maintenance")
 *     - Scroll/Landing-triggered Priority Maintenance Popup Modal + Floating Reopen Pill
 *  2. Authenticated User Dashboard (dashboard.html):
 *     - Flashing / Rotating Facility Photos & Real-Time Maintenance Advisory Carousel Widget
 *  3. Admin Control Panel (admin-dashboard.html):
 *     - "Maintenance & Showcase" sidebar tab + full CRUD for Maintenance Logs & Multi-Photo Galleries
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
    if (!iso) return 'TBD';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function toLocalInputValue(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function fetchJson(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  function notifyOk(msg) {
    if (window.Portal && typeof window.Portal.toastOk === 'function') {
      window.Portal.toastOk(msg);
    } else {
      alert(msg);
    }
  }

  function notifyErr(msg) {
    if (window.Portal && typeof window.Portal.toastError === 'function') {
      window.Portal.toastError(msg);
    } else {
      alert(msg);
    }
  }

  // ==========================================================================
  // 1. TOP MAINTENANCE NOTIFICATION BANNER (Public & User Pages)
  // ==========================================================================
  function renderTopBanner(announcements, onOpenModal) {
    if (!Array.isArray(announcements) || !announcements.length) return;
    if (document.getElementById('maint-top-banner')) return;

    const primary = announcements[0];
    const banner = document.createElement('div');
    banner.id = 'maint-top-banner';
    banner.className = 'maint-top-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Facility maintenance advisory');

    const statusLabel = primary.effective_status === 'Ongoing' ? 'Ongoing Maintenance' : 'Scheduled Advisory';
    const extraCount = announcements.length > 1 ? ` (+${announcements.length - 1} more)` : '';

    banner.innerHTML = `
      <div class="maint-top-banner-inner">
        <div class="d-flex align-items-center flex-wrap gap-2">
          <span class="maint-banner-pill">
            <span class="maint-banner-dot"></span>
            ${esc(statusLabel)}
          </span>
          <strong>${esc(primary.target_label)}:</strong>
          <span>${esc(primary.title)}</span>
          <span class="text-warning small fw-semibold">(Expected completion: ${esc(fmtDateTime(primary.end_time))})${esc(extraCount)}</span>
        </div>
        <div class="d-flex align-items-center gap-2">
          <button type="button" class="btn btn-sm btn-outline-light py-1 px-3" id="maint-banner-view-btn">
            View Advisory
          </button>
          <button type="button" class="btn-close btn-close-white" id="maint-banner-close-btn" aria-label="Dismiss banner" style="font-size:0.7rem;"></button>
        </div>
      </div>
    `;

    const navHost = document.getElementById('navbar-placeholder');
    if (navHost && navHost.parentNode) {
      navHost.parentNode.insertBefore(banner, navHost.nextSibling);
    } else {
      document.body.prepend(banner);
    }

    const viewBtn = banner.querySelector('#maint-banner-view-btn');
    if (viewBtn && typeof onOpenModal === 'function') {
      viewBtn.addEventListener('click', () => onOpenModal());
    }
    const closeBtn = banner.querySelector('#maint-banner-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => banner.remove());
    }
  }

  // ==========================================================================
  // 2. PRIORITY MAINTENANCE POPUP MODAL (Landing & Scroll Triggered)
  // ==========================================================================
  function setupPriorityPopupModal(popups) {
    if (!Array.isArray(popups) || !popups.length) return () => {};

    let idx = 0;
    const backdrop = document.createElement('div');
    backdrop.className = 'maint-popup-backdrop';
    backdrop.id = 'maint-priority-popup';
    backdrop.hidden = true;

    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'maint-floating-pill';
    pill.id = 'maint-floating-reopen';
    pill.innerHTML = `<span class="maint-banner-dot"></span> Facility Advisories (${popups.length})`;

    function renderSlide() {
      const item = popups[idx] || popups[0];
      const isOngoing = item.effective_status === 'Ongoing';
      backdrop.innerHTML = `
        <div class="maint-popup-card" role="dialog" aria-modal="true" aria-labelledby="maint-popup-title">
          <div class="maint-popup-cover">
            <img src="${esc(item.showcase_image || '/img/campus-bg-sm.jpg')}" alt="${esc(item.target_label)}" />
            <div class="maint-popup-cover-scrim">
              <span class="maint-banner-pill">
                <span class="maint-banner-dot"></span>
                ${isOngoing ? 'Ongoing Maintenance Alert' : 'Scheduled Maintenance Notice'}
              </span>
              <button type="button" class="btn-close btn-close-white" data-maint-close="1" aria-label="Close"></button>
            </div>
          </div>
          <div class="maint-popup-body">
            <div class="small text-info text-uppercase fw-bold mb-1">${esc(item.target_label)}</div>
            <h3 class="h5 fw-bold text-white mb-2" id="maint-popup-title">${esc(item.title)}</h3>
            <p class="text-muted-sm mb-3">${esc(item.description)}</p>
            <div class="maint-lock-banner mb-3">
              <div class="row g-2 small">
                <div class="col-sm-6">
                  <span class="text-muted-sm d-block">Start Window</span>
                  <strong>${esc(fmtDateTime(item.start_time))}</strong>
                </div>
                <div class="col-sm-6">
                  <span class="text-muted-sm d-block">Expected Completion</span>
                  <strong class="text-warning">${esc(fmtDateTime(item.end_time))}</strong>
                </div>
              </div>
            </div>
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div class="d-flex align-items-center gap-2">
                ${
                  popups.length > 1
                    ? `<button type="button" class="btn btn-sm btn-outline-light" data-maint-prev="1">← Prev</button>
                       <span class="small text-muted-sm">${idx + 1} / ${popups.length}</span>
                       <button type="button" class="btn btn-sm btn-outline-light" data-maint-next="1">Next →</button>`
                    : `<span class="small text-warning">🔒 Reservations blocked during this window</span>`
                }
              </div>
              <div class="d-flex gap-2">
                <a href="/rooms-status.html" class="btn btn-sm btn-outline-cspc">View Room Status</a>
                <button type="button" class="btn btn-sm btn-cspc" data-maint-close="1">I Understand</button>
              </div>
            </div>
          </div>
        </div>
      `;

      backdrop.querySelectorAll('[data-maint-close]').forEach((btn) => {
        btn.addEventListener('click', closePopup);
      });
      const prevBtn = backdrop.querySelector('[data-maint-prev]');
      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          idx = (idx - 1 + popups.length) % popups.length;
          renderSlide();
        });
      }
      const nextBtn = backdrop.querySelector('[data-maint-next]');
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          idx = (idx + 1) % popups.length;
          renderSlide();
        });
      }
    }

    function openPopup() {
      renderSlide();
      backdrop.hidden = false;
    }

    function closePopup() {
      backdrop.hidden = true;
      try {
        sessionStorage.setItem('cspc_maint_popup_seen', '1');
      } catch { /* ignore */ }
    }

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closePopup();
    });

    pill.addEventListener('click', openPopup);

    document.body.appendChild(backdrop);
    document.body.appendChild(pill);

    // Trigger automatically on scroll (or after 2.2s if visitor hasn't dismissed it this session)
    let triggered = false;
    try {
      triggered = sessionStorage.getItem('cspc_maint_popup_seen') === '1';
    } catch { /* ignore */ }

    if (!triggered) {
      const triggerOnce = () => {
        if (triggered) return;
        triggered = true;
        window.removeEventListener('scroll', onScroll);
        openPopup();
      };
      const onScroll = () => {
        if (window.scrollY > 140) triggerOnce();
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      setTimeout(triggerOnce, 2600);
    }

    return openPopup;
  }

  // ==========================================================================
  // 3. PUBLIC LANDING PAGE: ADVERTISEMENT-STYLE FACILITY SHOWCASE CAROUSEL
  // ==========================================================================
  function renderPublicShowcaseCarousel(data, openPopupFn, session) {
    const heroSection = document.getElementById('overview');
    if (!heroSection) return;

    const labs = Array.isArray(data.labs) ? data.labs : [];
    if (!labs.length) return;
    const isAuthenticated = Boolean(session && session.authenticated);

    let section = document.getElementById('facility-showcase-section');
    if (!section) {
      section = document.createElement('section');
      section.id = 'facility-showcase-section';
      section.className = 'facility-showcase-section';
      section.setAttribute('aria-label', 'Featured Laboratories & Live Maintenance Showcase');
      heroSection.parentNode.insertBefore(section, heroSection.nextSibling);
    }

    let currentSlide = 0;
    let currentPhotoIdx = 0;
    let timer = null;

    function render() {
      const lab = labs[currentSlide];
      const photos =
        Array.isArray(lab.images) && lab.images.length
          ? lab.images
          : [{ image_url: lab.image_url || '/img/cs-lab.jpg', caption: lab.name }];
      if (currentPhotoIdx >= photos.length) currentPhotoIdx = 0;
      const activePhoto = photos[currentPhotoIdx] || photos[0];

      const isMaint = Boolean(lab.is_under_maintenance);
      const maint = lab.active_maintenance;
      const amenities = [];
      if (lab.capacity) amenities.push(`👥 Seats ${lab.capacity}`);
      if (lab.has_projector) amenities.push('📽️ HD Projector');
      if (lab.has_aircon) amenities.push('❄️ Air-Conditioned');
      if (lab.has_sound) amenities.push('🔊 Sound System');

      section.innerHTML = `
        <div class="showcase-header">
          <div>
            <span class="showcase-kicker">✦ Campus Facility Showcase &amp; Live Advisories</span>
            <h2 class="h4 fw-bold text-white mt-2 mb-1">Featured Laboratories &amp; Real-Time Facility Status</h2>
            <p class="text-muted-sm mb-0">
              ${
                isAuthenticated
                  ? 'Explore campus laboratories and check real-time maintenance status before reserving a space.'
                  : 'Explore campus laboratories before signing in. Rooms undergoing maintenance are flagged in real time.'
              }
            </p>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-success bg-opacity-25 text-success border border-success border-opacity-50 rounded-pill px-3 py-2">
              ● ${esc(data.summary?.available_count || 0)} Available
            </span>
            <span class="badge badge-maintenance rounded-pill px-3 py-2">
              ⚠ ${esc(data.summary?.under_maintenance_count || 0)} Under Maintenance
            </span>
          </div>
        </div>

        <div class="showcase-stage">
          <div class="showcase-photo-wrap">
            <img class="showcase-main-img" src="${esc(activePhoto.image_url)}" alt="${esc(lab.name)}" />
            <div class="showcase-photo-overlay">
              <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                <span class="showcase-status-badge ${isMaint ? 'is-maintenance' : 'is-available'}">
                  ${isMaint ? '⚠ Under Maintenance' : '✓ Available for Booking'}
                </span>
                <span class="badge bg-dark bg-opacity-75 border border-light border-opacity-25 rounded-pill px-3 py-2">
                  ${esc(lab.building_name)}${lab.floor ? ` · ${esc(lab.floor)}` : ''}
                </span>
              </div>

              <div>
                <div class="small text-white-50 mb-1">${esc(activePhoto.caption || `${lab.name} — Facility View`)}</div>
                ${
                  photos.length > 1
                    ? `<div class="showcase-thumbs">
                        ${photos
                          .map(
                            (p, pIdx) => `
                          <button type="button" class="showcase-thumb-btn ${pIdx === currentPhotoIdx ? 'active' : ''}" data-photo-idx="${pIdx}" title="${esc(p.caption || `Photo ${pIdx + 1}`)}">
                            <img src="${esc(p.image_url)}" alt="" />
                          </button>`
                          )
                          .join('')}
                       </div>`
                    : ''
                }
              </div>
            </div>
          </div>

          <div class="showcase-info-card">
            <div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-info small fw-bold text-uppercase">${esc(lab.building_name)}</span>
                <span class="small text-muted-sm">Slide ${currentSlide + 1} of ${labs.length}</span>
              </div>
              <h3 class="h3 fw-bold text-white mb-2">${esc(lab.name)}</h3>
              <div class="d-flex flex-wrap gap-2 mb-3">
                ${amenities.map((a) => `<span class="amenity-pill">${esc(a)}</span>`).join('')}
              </div>

              ${
                isMaint
                  ? `<div class="showcase-maint-box">
                       <div class="d-flex justify-content-between align-items-center mb-1">
                         <strong class="text-warning">⚠ Active Maintenance Advisory</strong>
                         <span class="badge bg-warning text-dark">${esc(maint?.effective_status || 'Ongoing')}</span>
                       </div>
                       <div class="fw-semibold mb-1">${esc(maint?.title || 'Scheduled Facility Servicing')}</div>
                       <p class="small mb-2">${esc(maint?.description || 'This laboratory is temporarily closed for maintenance.')}</p>
                       <div class="small text-warning">
                         ⏱ Expected Completion: <strong>${esc(fmtDateTime(maint?.end_time))}</strong>
                       </div>
                     </div>`
                  : `<div class="showcase-avail-box">
                       <div class="fw-bold text-success mb-1">✓ Ready for Academic &amp; Laboratory Sessions</div>
                       <p class="small mb-0">
                         This facility has no active maintenance advisories and is open for student, faculty, and department reservation requests.
                       </p>
                     </div>`
              }
            </div>

            <div class="mt-4 pt-3 border-top border-light border-opacity-10 d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div class="d-flex align-items-center gap-2">
                <button type="button" class="btn btn-sm btn-outline-light" id="showcase-prev-btn" aria-label="Previous laboratory">← Prev</button>
                <div class="showcase-dots">
                  ${labs
                    .slice(0, 8)
                    .map(
                      (_, dIdx) =>
                        `<button type="button" class="showcase-dot ${dIdx === currentSlide ? 'active' : ''}" data-slide-idx="${dIdx}" aria-label="Slide ${dIdx + 1}"></button>`
                    )
                    .join('')}
                </div>
                <button type="button" class="btn btn-sm btn-outline-light" id="showcase-next-btn" aria-label="Next laboratory">Next →</button>
              </div>

              <div>
                ${
                  isMaint
                    ? `<button type="button" class="btn btn-outline-secondary" disabled>🔒 Under Maintenance</button>`
                    : isAuthenticated
                      ? `<a href="/reservation-form.html?building_id=${encodeURIComponent(lab.building_id || '')}&room_id=${encodeURIComponent(lab.id)}" class="btn btn-cspc">Reserve Space →</a>`
                      : `<button type="button" class="btn btn-cspc" data-bs-toggle="modal" data-bs-target="#visitor-login-modal">Sign in to Reserve →</button>`
                }
              </div>
            </div>
          </div>
        </div>
      `;

      section.querySelectorAll('[data-photo-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          currentPhotoIdx = Number(btn.getAttribute('data-photo-idx'));
          render();
        });
      });

      section.querySelectorAll('[data-slide-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          currentSlide = Number(btn.getAttribute('data-slide-idx'));
          currentPhotoIdx = 0;
          render();
        });
      });

      const prevBtn = section.querySelector('#showcase-prev-btn');
      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          currentSlide = (currentSlide - 1 + labs.length) % labs.length;
          currentPhotoIdx = 0;
          render();
        });
      }

      const nextBtn = section.querySelector('#showcase-next-btn');
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          currentSlide = (currentSlide + 1) % labs.length;
          currentPhotoIdx = 0;
          render();
        });
      }
    }

    function startAutoRotate() {
      stopAutoRotate();
      timer = setInterval(() => {
        currentSlide = (currentSlide + 1) % labs.length;
        currentPhotoIdx = 0;
        render();
      }, 6500);
    }

    function stopAutoRotate() {
      if (timer) clearInterval(timer);
    }

    section.addEventListener('mouseenter', stopAutoRotate);
    section.addEventListener('mouseleave', startAutoRotate);

    render();
    startAutoRotate();
  }

  // ==========================================================================
  // 4. AUTHENTICATED USER DASHBOARD: ROTATING ADVISORY & LAB PHOTO WIDGET
  // ==========================================================================
  function renderUserDashboardAdvisoryWidget(data) {
    const labSection = document.getElementById('laboratory-status')?.closest('section.card');
    if (!labSection) return;

    const advisories = Array.isArray(data.announcements) ? data.announcements : [];
    const labs = Array.isArray(data.labs) ? data.labs : [];

    // Combine active maintenance advisories + featured labs into rotating slides
    const slides = [
      ...advisories.map((a) => ({
        type: 'maintenance',
        title: a.title,
        subtitle: a.target_label,
        description: a.description,
        status: a.effective_status || a.status,
        end_time: a.end_time,
        image_url: a.showcase_image || '/img/cs-lab.jpg',
        room_id: a.room_id,
        building_id: a.building_id
      })),
      ...labs
        .filter((l) => !l.is_under_maintenance)
        .slice(0, 4)
        .map((l) => ({
          type: 'showcase',
          title: `${l.name} — Open for Reservations`,
          subtitle: `${l.building_name}${l.floor ? ` · ${l.floor}` : ''}`,
          description: `Seats up to ${l.capacity} attendees. Equipped with ${[
            l.has_projector ? 'Projector' : null,
            l.has_aircon ? 'Air-Conditioning' : null,
            l.has_sound ? 'Sound System' : null
          ]
            .filter(Boolean)
            .join(', ') || 'standard laboratory facilities'}.`,
          status: 'Available',
          end_time: null,
          image_url: l.image_url || '/img/it-lab1.jpg',
          room_id: l.id,
          building_id: l.building_id
        }))
    ];

    if (!slides.length) return;

    let widget = document.getElementById('user-maint-advisory-widget');
    if (!widget) {
      widget = document.createElement('section');
      widget.id = 'user-maint-advisory-widget';
      widget.className = 'user-maint-widget';
      labSection.parentNode.insertBefore(widget, labSection);
    }

    let idx = 0;

    function draw() {
      const s = slides[idx];
      const isMaint = s.type === 'maintenance';
      widget.innerHTML = `
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
          <div class="d-flex align-items-center gap-2">
            <span class="maint-banner-pill">
              <span class="maint-banner-dot"></span>
              ${isMaint ? `Live Maintenance Advisory (${esc(s.status)})` : 'Featured Laboratory Showcase'}
            </span>
            <span class="small text-muted-sm">Slide ${idx + 1} of ${slides.length}</span>
          </div>
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm btn-outline-light py-0 px-2" id="user-adv-prev" title="Previous slide">←</button>
            <button type="button" class="btn btn-sm btn-outline-light py-0 px-2" id="user-adv-next" title="Next slide">→</button>
            <button type="button" class="btn-glass-close" id="user-adv-close" aria-label="Dismiss advisory widget" title="Close">&times;</button>
          </div>
        </div>
        <div class="user-maint-slide">
          <img class="user-maint-photo" src="${esc(s.image_url)}" alt="${esc(s.title)}" />
          <div>
            <div class="small text-info fw-bold text-uppercase">${esc(s.subtitle)}</div>
            <h3 class="h5 fw-bold text-white mb-1">${esc(s.title)}</h3>
            <p class="small text-muted-sm mb-2">${esc(s.description)}</p>
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
              ${
                isMaint
                  ? `<span class="small text-warning fw-semibold">⏱ Expected completion: ${esc(fmtDateTime(s.end_time))}</span>
                     <button type="button" class="btn btn-sm btn-outline-secondary" disabled>🔒 Under Maintenance — Booking Disabled</button>`
                  : `<span class="small text-success fw-semibold">✓ Available for immediate booking</span>
                     <a href="/reservation-form.html?building_id=${encodeURIComponent(s.building_id || '')}&room_id=${encodeURIComponent(s.room_id || '')}" class="btn btn-sm btn-cspc">+ Reserve This Lab</a>`
              }
            </div>
          </div>
        </div>
      `;

      widget.querySelector('#user-adv-prev')?.addEventListener('click', () => {
        idx = (idx - 1 + slides.length) % slides.length;
        draw();
      });
      widget.querySelector('#user-adv-next')?.addEventListener('click', () => {
        idx = (idx + 1) % slides.length;
        draw();
      });
      widget.querySelector('#user-adv-close')?.addEventListener('click', () => {
        widget.hidden = true;
      });
    }

    draw();
    setInterval(() => {
      idx = (idx + 1) % slides.length;
      draw();
    }, 6000);
  }

  // ==========================================================================
  // 5. ADMIN CONTROL PANEL: MAINTENANCE & PHOTO GALLERY MANAGEMENT
  // ==========================================================================
  async function initAdminMaintenancePanel() {
    const adminNav = document.querySelector('.admin-nav');
    const tabContent = document.querySelector('.admin-main .tab-content');
    if (!adminNav || !tabContent) return;

    // 1. Add sidebar nav button if not present
    if (!adminNav.querySelector('[data-target="#pane-maintenance"]')) {
      const navBtn = document.createElement('button');
      navBtn.className = 'admin-nav-btn';
      navBtn.type = 'button';
      navBtn.setAttribute('data-target', '#pane-maintenance');
      navBtn.textContent = 'Maintenance & Showcase';
      adminNav.appendChild(navBtn);

      navBtn.addEventListener('click', () => {
        adminNav.querySelectorAll('.admin-nav-btn').forEach((b) => b.classList.remove('active'));
        navBtn.classList.add('active');
        tabContent.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('show', 'active'));
        const pane = document.getElementById('pane-maintenance');
        if (pane) pane.classList.add('show', 'active');
        loadAdminMaintenanceData();
      });

      // Ensure clicking other sidebar buttons hides #pane-maintenance
      adminNav.querySelectorAll('.admin-nav-btn:not([data-target="#pane-maintenance"])').forEach((btn) => {
        btn.addEventListener('click', () => {
          const pane = document.getElementById('pane-maintenance');
          if (pane) pane.classList.remove('show', 'active');
        });
      });
    }

    // 2. Create #pane-maintenance tab pane
    const pane = document.createElement('div');
    pane.className = 'tab-pane fade';
    pane.id = 'pane-maintenance';
    pane.setAttribute('role', 'tabpanel');
    pane.innerHTML = `
      <!-- Maintenance Logs & Schedule Manager -->
      <div class="card mb-4">
        <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <span class="fw-bold">Facility Maintenance &amp; Alert Scheduler</span>
            <div class="text-muted-sm small">Schedule or toggle maintenance per room or building, configure priority popups, and automatically block conflicting reservations.</div>
          </div>
          <button type="button" class="btn btn-sm btn-cspc" id="admin-new-maint-btn">+ Schedule Maintenance</button>
        </div>

        <div class="card-body border-bottom border-secondary border-opacity-25" id="admin-maint-form-wrap" hidden>
          <div class="d-flex justify-content-between align-items-center mb-3">
            <span class="fw-semibold text-info small text-uppercase">Schedule / Edit Maintenance Notice</span>
            <button type="button" class="btn-glass-close" id="admin-maint-close-x" aria-label="Close maintenance form" title="Close">&times;</button>
          </div>
          <form id="admin-maint-form" enctype="multipart/form-data">
            <input type="hidden" id="maint-edit-id" value="" />
            <div class="row g-3">
              <div class="col-md-3">
                <label class="form-label">Target Scope</label>
                <select class="form-select" id="maint-target-type" name="target_type" required>
                  <option value="room">Specific Laboratory / Room</option>
                  <option value="building">Entire Building</option>
                </select>
              </div>
              <div class="col-md-5" id="maint-room-select-wrap">
                <label class="form-label">Target Laboratory / Room</label>
                <select class="form-select" id="maint-room-id" name="room_id"></select>
              </div>
              <div class="col-md-5" id="maint-building-select-wrap" hidden>
                <label class="form-label">Target Building</label>
                <select class="form-select" id="maint-building-id" name="building_id"></select>
              </div>
              <div class="col-md-4">
                <label class="form-label">Alert Display Mode</label>
                <select class="form-select" id="maint-display-mode" name="display_mode">
                  <option value="both">Priority Popup + Carousel Banner</option>
                  <option value="popup">Priority Popup Modal Only</option>
                  <option value="carousel">Standard Carousel Banner Only</option>
                </select>
              </div>

              <div class="col-md-6">
                <label class="form-label">Maintenance Title</label>
                <input type="text" class="form-control" id="maint-title" name="title" placeholder="e.g. Network Switch Upgrade & AC Servicing" required />
              </div>
              <div class="col-md-3">
                <label class="form-label">Start Date &amp; Time</label>
                <input type="datetime-local" class="form-control" id="maint-start-time" name="start_time" required />
              </div>
              <div class="col-md-3">
                <label class="form-label">Expected Completion</label>
                <input type="datetime-local" class="form-control" id="maint-end-time" name="end_time" required />
              </div>

              <div class="col-md-8">
                <label class="form-label">Reason / Advisory Description</label>
                <textarea class="form-control" id="maint-description" name="description" rows="2" placeholder="Describe the maintenance work and impact on reservations..." required></textarea>
              </div>
              <div class="col-md-4">
                <label class="form-label">Status</label>
                <select class="form-select" id="maint-status" name="status">
                  <option value="Ongoing">Ongoing (Immediate Lock)</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Completed">Completed (Unlocked)</option>
                </select>
              </div>

              <div class="col-md-6">
                <label class="form-label">Upload Cover / Banner Photo (optional)</label>
                <input type="file" class="form-control" id="maint-banner-file" name="banner_image" accept="image/jpeg,image/png,image/webp" />
              </div>
              <div class="col-md-6">
                <label class="form-label">Or Banner Image URL (optional)</label>
                <input type="text" class="form-control" id="maint-banner-url" name="banner_image_url" placeholder="/img/cs-lab.jpg" />
              </div>
            </div>

            <div class="d-flex justify-content-end gap-2 mt-3">
              <button type="button" class="btn btn-sm btn-outline-secondary" id="admin-maint-cancel-btn">Cancel</button>
              <button type="submit" class="btn btn-sm btn-cspc" id="admin-maint-save-btn">Save Maintenance Notice</button>
            </div>
          </form>
        </div>

        <div class="table-responsive">
          <table class="table table-portal table-hover mb-0 align-middle">
            <thead>
              <tr>
                <th>#</th>
                <th>Facility Target</th>
                <th>Advisory Title &amp; Reason</th>
                <th>Maintenance Window</th>
                <th>Alert Mode</th>
                <th>Status</th>
                <th class="text-end">Actions</th>
              </tr>
            </thead>
            <tbody id="admin-maint-tbody">
              <tr><td colspan="7" class="text-center text-muted-sm py-4">Loading maintenance logs...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Multi-Photo Facility Gallery Manager -->
      <div class="card">
        <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <span class="fw-bold">Laboratory &amp; Building Photo Gallery Manager</span>
            <div class="text-muted-sm small">Upload multiple photos or link image URLs for each laboratory and building showcased on the public and student portals.</div>
          </div>
        </div>
        <div class="card-body">
          <form id="admin-gallery-form" class="row g-3 align-items-end mb-4" enctype="multipart/form-data">
            <div class="col-md-2">
              <label class="form-label">Target Type</label>
              <select class="form-select" id="gal-target-type" name="target_type">
                <option value="room">Laboratory / Room</option>
                <option value="building">Building</option>
              </select>
            </div>
            <div class="col-md-3" id="gal-room-wrap">
              <label class="form-label">Laboratory / Room</label>
              <select class="form-select" id="gal-room-id" name="room_id"></select>
            </div>
            <div class="col-md-3" id="gal-building-wrap" hidden>
              <label class="form-label">Building</label>
              <select class="form-select" id="gal-building-id" name="building_id"></select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Upload Photos (up to 6)</label>
              <input type="file" class="form-control" id="gal-files" name="images" accept="image/jpeg,image/png,image/webp" multiple />
            </div>
            <div class="col-md-2">
              <label class="form-label">Or Image URL(s)</label>
              <input type="text" class="form-control" id="gal-url" name="image_url" placeholder="/img/cs-lab.jpg" />
            </div>
            <div class="col-md-2">
              <label class="form-label">Caption</label>
              <input type="text" class="form-control" id="gal-caption" name="caption" placeholder="Main Lab View" />
            </div>
            <div class="col-12 d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" id="gal-is-primary" name="is_primary" checked />
                <label class="form-check-label" for="gal-is-primary">Set as primary cover photo for this facility</label>
              </div>
              <button type="submit" class="btn btn-sm btn-cspc">+ Upload / Link Photos</button>
            </div>
          </form>

          <div class="admin-gallery-grid" id="admin-gallery-grid">
            <div class="text-muted-sm small">Loading facility photos...</div>
          </div>
        </div>
      </div>
    `;

    tabContent.appendChild(pane);

    let cachedRooms = [];
    let cachedBuildings = [];
    let cachedMaint = [];

    const formWrap = pane.querySelector('#admin-maint-form-wrap');
    const maintForm = pane.querySelector('#admin-maint-form');
    const targetTypeSel = pane.querySelector('#maint-target-type');
    const roomWrap = pane.querySelector('#maint-room-select-wrap');
    const bldgWrap = pane.querySelector('#maint-building-select-wrap');
    const roomSel = pane.querySelector('#maint-room-id');
    const bldgSel = pane.querySelector('#maint-building-id');

    const galTargetType = pane.querySelector('#gal-target-type');
    const galRoomWrap = pane.querySelector('#gal-room-wrap');
    const galBldgWrap = pane.querySelector('#gal-building-wrap');
    const galRoomSel = pane.querySelector('#gal-room-id');
    const galBldgSel = pane.querySelector('#gal-building-id');

    targetTypeSel.addEventListener('change', () => {
      const isBldg = targetTypeSel.value === 'building';
      roomWrap.hidden = isBldg;
      bldgWrap.hidden = !isBldg;
    });

    galTargetType.addEventListener('change', () => {
      const isBldg = galTargetType.value === 'building';
      galRoomWrap.hidden = isBldg;
      galBldgWrap.hidden = !isBldg;
      loadGalleryImages();
    });
    galRoomSel.addEventListener('change', loadGalleryImages);
    galBldgSel.addEventListener('change', loadGalleryImages);

    pane.querySelector('#admin-new-maint-btn').addEventListener('click', () => {
      maintForm.reset();
      pane.querySelector('#maint-edit-id').value = '';
      targetTypeSel.value = 'room';
      roomWrap.hidden = false;
      bldgWrap.hidden = true;
      const now = new Date();
      const later = new Date(Date.now() + 4 * 3600 * 1000);
      pane.querySelector('#maint-start-time').value = toLocalInputValue(now);
      pane.querySelector('#maint-end-time').value = toLocalInputValue(later);
      formWrap.hidden = false;
    });

    pane.querySelector('#admin-maint-cancel-btn').addEventListener('click', () => {
      formWrap.hidden = true;
    });
    pane.querySelector('#admin-maint-close-x')?.addEventListener('click', () => {
      formWrap.hidden = true;
    });

    async function loadRoomsAndBuildings() {
      const [rData, bData] = await Promise.all([
        fetchJson('/api/admin/rooms?include_inactive=1'),
        fetchJson('/api/buildings')
      ]);
      cachedRooms = rData.rooms || [];
      cachedBuildings = bData.buildings || [];

      const roomOpts = cachedRooms
        .map((r) => `<option value="${r.id}">${esc(r.name)} (${esc(r.building_name)})</option>`)
        .join('');
      const bldgOpts = cachedBuildings
        .map((b) => `<option value="${b.id}">${esc(b.name)}</option>`)
        .join('');

      roomSel.innerHTML = roomOpts;
      bldgSel.innerHTML = bldgOpts;
      galRoomSel.innerHTML = `<option value="">All Laboratories</option>` + roomOpts;
      galBldgSel.innerHTML = `<option value="">All Buildings</option>` + bldgOpts;
    }

    async function loadMaintTable() {
      const tbody = pane.querySelector('#admin-maint-tbody');
      try {
        const data = await fetchJson('/api/admin/maintenance');
        cachedMaint = data.maintenance || [];
        if (!cachedMaint.length) {
          tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted-sm py-4">No maintenance notices scheduled yet.</td></tr>`;
          return;
        }

        const modeLabels = {
          both: 'Popup + Carousel',
          popup: 'Priority Popup',
          carousel: 'Carousel Banner'
        };

        tbody.innerHTML = cachedMaint
          .map((m) => {
            const st = m.effective_status || m.status;
            const badgeCls =
              st === 'Ongoing'
                ? 'badge-maintenance'
                : st === 'Scheduled'
                  ? 'text-bg-info'
                  : 'text-bg-secondary';
            return `
              <tr>
                <td>#${m.id}</td>
                <td>
                  <div class="fw-semibold">${esc(m.target_label)}</div>
                  <span class="badge text-bg-light border small">${esc(m.target_type.toUpperCase())}</span>
                </td>
                <td style="max-width: 300px;">
                  <div class="fw-semibold">${esc(m.title)}</div>
                  <div class="text-muted-sm small text-truncate">${esc(m.description)}</div>
                </td>
                <td class="small">
                  <div><strong>Start:</strong> ${esc(fmtDateTime(m.start_time))}</div>
                  <div><strong>End:</strong> ${esc(fmtDateTime(m.end_time))}</div>
                </td>
                <td><span class="badge text-bg-secondary">${esc(modeLabels[m.display_mode] || m.display_mode)}</span></td>
                <td><span class="badge ${badgeCls} rounded-pill">${esc(st)}</span></td>
                <td class="text-end">
                  <div class="d-inline-flex gap-1 flex-wrap justify-content-end">
                    ${
                      st !== 'Ongoing'
                        ? `<button type="button" class="btn btn-sm btn-outline-warning" data-maint-status="${m.id}" data-val="Ongoing">Set Ongoing</button>`
                        : `<button type="button" class="btn btn-sm btn-outline-success" data-maint-status="${m.id}" data-val="Completed">Complete</button>`
                    }
                    <button type="button" class="btn btn-sm btn-outline-light" data-maint-edit="${m.id}">Edit</button>
                    <button type="button" class="btn btn-sm btn-outline-danger" data-maint-del="${m.id}">Delete</button>
                  </div>
                </td>
              </tr>
            `;
          })
          .join('');

        tbody.querySelectorAll('[data-maint-status]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-maint-status');
            const status = btn.getAttribute('data-val');
            try {
              await fetchJson(`/api/admin/maintenance/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
              });
              notifyOk(`Maintenance #${id} marked as ${status}.`);
              loadMaintTable();
            } catch (err) {
              notifyErr(err.message);
            }
          });
        });

        tbody.querySelectorAll('[data-maint-edit]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = Number(btn.getAttribute('data-maint-edit'));
            const item = cachedMaint.find((x) => x.id === id);
            if (!item) return;
            pane.querySelector('#maint-edit-id').value = String(item.id);
            targetTypeSel.value = item.target_type || 'room';
            const isBldg = targetTypeSel.value === 'building';
            roomWrap.hidden = isBldg;
            bldgWrap.hidden = !isBldg;
            if (item.room_id) roomSel.value = String(item.room_id);
            if (item.building_id) bldgSel.value = String(item.building_id);
            pane.querySelector('#maint-display-mode').value = item.display_mode || 'both';
            pane.querySelector('#maint-title').value = item.title || '';
            pane.querySelector('#maint-description').value = item.description || '';
            pane.querySelector('#maint-start-time').value = toLocalInputValue(item.start_time);
            pane.querySelector('#maint-end-time').value = toLocalInputValue(item.end_time);
            pane.querySelector('#maint-status').value = item.status || 'Ongoing';
            pane.querySelector('#maint-banner-url').value = item.banner_image_url || '';
            formWrap.hidden = false;
            formWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
        });

        tbody.querySelectorAll('[data-maint-del]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-maint-del');
            if (!window.confirm(`Delete maintenance notice #${id}?`)) return;
            try {
              await fetchJson(`/api/admin/maintenance/${id}`, { method: 'DELETE' });
              notifyOk(`Maintenance notice #${id} deleted.`);
              loadMaintTable();
            } catch (err) {
              notifyErr(err.message);
            }
          });
        });
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">${esc(err.message)}</td></tr>`;
      }
    }

    maintForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = pane.querySelector('#maint-edit-id').value;
      const fd = new FormData(maintForm);
      try {
        const url = editId ? `/api/admin/maintenance/${editId}` : '/api/admin/maintenance';
        const method = editId ? 'PUT' : 'POST';
        const res = await fetchJson(url, { method, body: fd });
        notifyOk(res.message || 'Maintenance saved.');
        formWrap.hidden = true;
        loadMaintTable();
      } catch (err) {
        notifyErr(err.message);
      }
    });

    async function loadGalleryImages() {
      const grid = pane.querySelector('#admin-gallery-grid');
      const tType = galTargetType.value;
      const params = new URLSearchParams({ target_type: tType });
      if (tType === 'room' && galRoomSel.value) params.set('room_id', galRoomSel.value);
      if (tType === 'building' && galBldgSel.value) params.set('building_id', galBldgSel.value);

      try {
        const data = await fetchJson(`/api/admin/facility-images?${params.toString()}`);
        const images = data.images || [];
        if (!images.length) {
          grid.innerHTML = `<div class="text-muted-sm small py-3">No photos found for this filter. Upload or link photos above.</div>`;
          return;
        }

        grid.innerHTML = images
          .map(
            (img) => `
          <div class="admin-gallery-item">
            <img src="${esc(img.image_url)}" alt="${esc(img.caption || '')}" loading="lazy" />
            <div class="p-2 d-flex flex-column flex-fill justify-content-between">
              <div>
                <div class="fw-semibold small text-truncate">${esc(img.room_name || img.building_name || 'Facility')}</div>
                <div class="text-muted-sm small text-truncate">${esc(img.caption || img.image_url)}</div>
              </div>
              <div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top border-secondary border-opacity-25">
                ${
                  img.is_primary
                    ? `<span class="badge bg-primary rounded-pill">★ Primary Cover</span>`
                    : `<button type="button" class="btn btn-sm btn-outline-light py-0 px-2" data-gal-primary="${img.id}">Set Primary</button>`
                }
                <button type="button" class="btn btn-sm btn-outline-danger py-0 px-2" data-gal-del="${img.id}">✕</button>
              </div>
            </div>
          </div>
        `
          )
          .join('');

        grid.querySelectorAll('[data-gal-primary]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-gal-primary');
            try {
              await fetchJson(`/api/admin/facility-images/${id}/primary`, { method: 'PATCH' });
              notifyOk('Primary cover photo updated.');
              loadGalleryImages();
            } catch (err) {
              notifyErr(err.message);
            }
          });
        });

        grid.querySelectorAll('[data-gal-del]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-gal-del');
            if (!window.confirm('Remove this photo from the facility gallery?')) return;
            try {
              await fetchJson(`/api/admin/facility-images/${id}`, { method: 'DELETE' });
              notifyOk('Photo removed.');
              loadGalleryImages();
            } catch (err) {
              notifyErr(err.message);
            }
          });
        });
      } catch (err) {
        grid.innerHTML = `<div class="text-danger small">${esc(err.message)}</div>`;
      }
    }

    pane.querySelector('#admin-gallery-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formEl = e.currentTarget;
      const tType = galTargetType.value;
      if (tType === 'room' && !galRoomSel.value) {
        return notifyErr('Please select a specific Laboratory / Room before uploading.');
      }
      if (tType === 'building' && !galBldgSel.value) {
        return notifyErr('Please select a specific Building before uploading.');
      }
      const fd = new FormData(formEl);
      try {
        const res = await fetchJson('/api/admin/facility-images', {
          method: 'POST',
          body: fd
        });
        notifyOk(res.message || 'Photos uploaded.');
        pane.querySelector('#gal-files').value = '';
        pane.querySelector('#gal-url').value = '';
        pane.querySelector('#gal-caption').value = '';
        loadGalleryImages();
      } catch (err) {
        notifyErr(err.message);
      }
    });

    async function loadAdminMaintenanceData() {
      await loadRoomsAndBuildings();
      await Promise.all([loadMaintTable(), loadGalleryImages()]);
    }
  }

  // ==========================================================================
  // BOOTSTRAP ON DOM READY
  // ==========================================================================
  async function boot() {
    try {
      const [showcaseData, sessionData] = await Promise.all([
        fetchJson('/api/facility-showcase'),
        window.Portal && typeof window.Portal.getSession === 'function'
          ? window.Portal.getSession().catch(() => ({ authenticated: false }))
          : fetchJson('/api/session').catch(() => ({ authenticated: false }))
      ]);
      const popups = showcaseData.priority_popups || [];
      const announcements = showcaseData.announcements || [];

      const isHomePage = document.body.classList.contains('portal-home-page') || Boolean(document.getElementById('overview'));
      const isUserDashboard = Boolean(document.getElementById('laboratory-status') && !document.querySelector('.admin-nav'));
      const isAdminDashboard = Boolean(document.querySelector('.admin-nav'));

      let openPopupFn = null;
      if (isHomePage && popups.length) {
        openPopupFn = setupPriorityPopupModal(popups);
      }

      if (!isAdminDashboard && announcements.length) {
        renderTopBanner(announcements, openPopupFn || (() => setupPriorityPopupModal(announcements)()));
      }

      if (isHomePage) {
        renderPublicShowcaseCarousel(showcaseData, openPopupFn, sessionData);
      }

      if (isUserDashboard) {
        renderUserDashboardAdvisoryWidget(showcaseData);
      }

      if (isAdminDashboard) {
        await initAdminMaintenancePanel();
      }
    } catch (err) {
      console.warn('[maintenance-showcase] Could not initialize showcase module:', err.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

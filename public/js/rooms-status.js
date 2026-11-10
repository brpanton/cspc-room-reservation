/* Room status: public timetable of pending/approved bookings per room. */
'use strict';

(async function () {
  const P = window.Portal;
  const {
    api, getSession, renderNavbar, escapeHtml, formatTime, statusBadge,
    todayIso, toastError, ROOM_TYPE_LABELS, busy
  } = P;

  const session = await getSession();
  renderNavbar(session.user, 'rooms');

  const dateInput = document.getElementById('date');
  const buildingSel = document.getElementById('building_id');
  const typeSel = document.getElementById('room_type');
  try {
    const queryType = new URLSearchParams(window.location.search).get('type');
    if (queryType && typeSel) typeSel.value = queryType.toLowerCase();
  } catch { /* ignore bad query strings */ }
  const refreshBtn = document.getElementById('refresh-btn');
  const grid = document.getElementById('rooms-grid');
  const BUILDING_BACKGROUNDS = {
    'CCS BUILDING': '/img/640fd213-b190-4dd5-85ac-f5e48efaa979.jpg',
    'CAS BUILDING': '/img/86d642c7-aab7-4114-85ec-75a84ae1b8c0.jpg',
    'GREENBUILDING': '/img/430ad98a-b78e-4c54-b0fa-803c6eed5ef3.jpg',
    'ACADEMIC BUILDING II': '/img/6073d9fd-be4f-4d55-bc84-bde51aa8db51.jpg',
    'ACADEMIC BUILDING I': '/img/79f0c07c-b23e-4644-9550-536b84c2f5b4.jpg',
    'MULTI PURPOSE BUILDING': '/img/fc87102f-d288-4b44-81f1-022acfccb7c6.jpg',
    'MULTI PORPUSE BUILDING': '/img/fc87102f-d288-4b44-81f1-022acfccb7c6.jpg',
    'CHS BUILDING': '/img/e4edc818-0707-48a1-87d1-cb81125f6ee4.jpg',
    'CITD BUILDING': '/img/6073d9fd-be4f-4d55-bc84-bde51aa8db51.jpg',
    'LSB BUILDING': '/img/79f0c07c-b23e-4644-9550-536b84c2f5b4.jpg'
  };

  function updateBuildingBackground() {
    const selectedName = buildingSel.value?.trim().toLocaleUpperCase();
    const image = buildingSel.value ? BUILDING_BACKGROUNDS[selectedName] : null;

    if (image) {
      document.body.style.setProperty('--bg-photo', `url("${image}")`);
      document.body.style.setProperty('--bg-photo-pos', 'center center');
      document.body.classList.add('building-photo-background');
    } else {
      document.body.classList.remove('building-photo-background');
      document.body.style.removeProperty('--bg-photo');
      document.body.style.removeProperty('--bg-photo-pos');
    }
  }

  dateInput.value = todayIso();

  /* ----------------------------------------------------------- buildings --- */

  try {
    const data = await api('/api/buildings');
    const buildingDatalist = document.getElementById('building-list');
    if (buildingDatalist) {
      buildingDatalist.innerHTML =
        (data.buildings || []).map((b) => `<option value="${escapeHtml(b.name)}" data-id="${b.id}"></option>`).join('');
    }
    window.__buildingIdByName = new Map(
      (data.buildings || []).map((b) => [String(b.name).trim(), Number(b.id)])
    );
    // Keep buildingSel reference for backward compatibility (used as input value)
    buildingSel.innerHTML = '';
    updateBuildingBackground();
  } catch (err) {
    toastError(`Could not load buildings: ${err.message}`);
  }

  /* -------------------------------------------------------------- render --- */

  /** One card per room, listing its booked slots for the selected date. */
  function roomCard(room) {
    const booked = room.bookings || [];
    const isMaint = Boolean(room.is_under_maintenance || room.has_date_maintenance);
    const maint = room.active_maintenance;
    const amenities = [];
    if (room.capacity) amenities.push(`Seats ${room.capacity}`);
    if (room.has_projector) amenities.push('Projector');
    if (room.has_aircon) amenities.push('Aircon');
    if (room.has_sound) amenities.push('Sound');

    const untilStr =
      isMaint && maint && maint.end_time
        ? new Date(maint.end_time).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          })
        : '';

    const maintAlertHtml = isMaint
      ? `<div class="maint-lock-banner mt-3">
           <div class="d-flex justify-content-between align-items-center mb-1">
             <span class="badge badge-maintenance rounded-pill">⚠ Under Maintenance</span>
             ${untilStr ? `<span class="small text-warning">Until ${escapeHtml(untilStr)}</span>` : ''}
           </div>
           <div class="fw-semibold small">${escapeHtml((maint && maint.title) || 'Scheduled Facility Maintenance')}</div>
           ${maint && maint.description ? `<div class="text-muted-sm small mt-1">${escapeHtml(maint.description)}</div>` : ''}
         </div>`
      : '';

    const slots = isMaint
      ? maintAlertHtml
      : booked.length
        ? `<ul class="slot-list mt-3">${booked
            .map(
              (b) => `
          <li class="${b.status === 'Approved' ? 'slot-approved' : ''} slot-blue">
            <span>${escapeHtml(formatTime(b.start_time))} - ${escapeHtml(formatTime(b.end_time))}</span>
            ${statusBadge(b.status)}
          </li>`
            )
            .join('')}</ul>`
        : '<p class="text-info fw-semibold mb-0 mt-3">Free the whole day</p>';

    const actionHtml = isMaint
      ? `<button type="button" class="btn btn-sm btn-outline-secondary w-100 mt-3" disabled>🔒 Under Maintenance — Booking Disabled</button>`
      : `<a href="/reservation-form.html?building_id=${encodeURIComponent(room.building_id || '')}&room_id=${encodeURIComponent(room.id)}" class="btn btn-sm btn-cspc w-100 mt-3">+ Reserve this space</a>`;

    const cardStateClass = isMaint
      ? 'is-maintenance'
      : booked.length
        ? 'is-busy'
        : room.is_free_all_day
          ? 'is-free'
          : '';

    const bannerHtml =
      typeof P.renderGlassImage === 'function'
        ? P.renderGlassImage({
            src: room.image_url || '',
            alt: room.name,
            label: isMaint ? 'Under Maintenance' : 'Room Preview',
            sublabel: room.building_name || '',
            isMaintenance: isMaint,
            containerClass: 'glass-img-card-banner',
            imgClass: 'glass-img room-card-img'
          })
        : room.image_url
          ? `<img class="room-card-img" src="${escapeHtml(room.image_url)}" alt="${escapeHtml(room.name)}" loading="lazy" />`
          : '';

    return `
      <div class="col-md-6 col-xl-4">
        <div class="card room-card ${cardStateClass} h-100">
          ${bannerHtml}
          <div class="card-body d-flex flex-column">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <h2 class="h6 mb-0">${escapeHtml(room.name)}</h2>
                <div class="text-muted-sm">${escapeHtml(room.building_name)}${room.floor ? ` · ${escapeHtml(room.floor)}` : ''}</div>
              </div>
              <span class="badge ${isMaint ? 'badge-maintenance' : 'text-bg-light border'}">
                ${isMaint ? 'Under Maintenance' : escapeHtml(ROOM_TYPE_LABELS[room.room_type] || room.room_type)}
              </span>
            </div>
            <div class="mt-2">
              ${amenities.map((a) => `<span class="amenity-pill">${escapeHtml(a)}</span>`).join('')}
            </div>
            <div class="mt-auto">
              ${slots}
              ${actionHtml}
            </div>
          </div>
        </div>
      </div>`;
  }

  async function load() {
    const date = dateInput.value || todayIso();
    const params = new URLSearchParams({ date });
    const buildingName = buildingSel.value?.trim();
    if (buildingName && window.__buildingIdByName) {
      const bid = window.__buildingIdByName.get(buildingName);
      if (bid) params.set('building_id', bid);
    }

    grid.innerHTML = '<div class="col-12"><p class="text-muted-sm">Loading rooms...</p></div>';
    try {
      const data = await api(`/api/availability?${params.toString()}`);
      const selectedBuildingId = buildingSel.value;
      const selectedBuildingName = buildingSel.value?.trim() || '';
      const wantedType = (typeSel?.value || '').toLowerCase();
      const rooms = (data.rooms || []).filter((room) => {
        if (wantedType && String(room.room_type || '').toLowerCase() !== wantedType) return false;
        if (!selectedBuildingId) return true;
        return String(room.building_id) === selectedBuildingId ||
          room.building_name.trim().toLocaleLowerCase() === selectedBuildingName.toLocaleLowerCase();
      });

      document.getElementById('sum-rooms').textContent = rooms.length;
      document.getElementById('sum-free').textContent = rooms.filter((room) => room.is_free_all_day).length;
      document.getElementById('sum-bookings').textContent = rooms.reduce(
        (total, room) => total + (room.bookings || []).length, 0
      );

      if (!rooms.length) {
        const message = selectedBuildingId
          ? `No rooms found for ${escapeHtml(selectedBuildingName)}.`
          : 'No active rooms found.';
        grid.innerHTML = `<div class="col-12"><div class="card room-filter-empty"><div class="card-body text-center text-muted-sm">${message}</div></div></div>`;
        return;
      }
      grid.innerHTML = rooms.map(roomCard).join('');
    } catch (err) {
      grid.innerHTML =
        `<div class="col-12"><p class="text-danger">Could not load availability: ${escapeHtml(err.message)}</p></div>`;
    }
  }

  /* -------------------------------------------------------------- events --- */

  refreshBtn.addEventListener('click', async () => {
    updateBuildingBackground();
    busy(refreshBtn, true, 'Refreshing...');
    await load();
    busy(refreshBtn, false);
  });
  dateInput.addEventListener('change', load);
  typeSel?.addEventListener('change', load);
  buildingSel.addEventListener('input', () => {
    updateBuildingBackground();
    load();
  });

  document.addEventListener('portal-locale-change', () => {
    updateBuildingBackground();
    load();
  });

  try {
    const bc = new BroadcastChannel('cspc-availability');
    bc.addEventListener('message', () => load());
  } catch {
    window.addEventListener('storage', (e) => {
      if (e.key === 'cspc-availability-changed') load();
    });
  }

  await load();
})();
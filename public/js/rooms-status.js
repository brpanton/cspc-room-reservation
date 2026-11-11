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
             <span class="badge badge-maintenance rounded-pill">Under Maintenance</span>
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
      ? `<button type="button" class="btn btn-sm btn-outline-secondary w-100 mt-3" disabled>Under Maintenance &mdash; Booking Disabled</button>`
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

    const displayFloor = room.display_floor || room.floor || '';

    return `
      <div class="col">
        <div class="card room-card ${cardStateClass} h-100">
          ${bannerHtml}
          <div class="card-body d-flex flex-column">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <h3 class="h6 mb-0 text-white fw-bold">${escapeHtml(room.name)}</h3>
                <div class="text-muted-sm">${escapeHtml(room.building_name)}${displayFloor ? ` &middot; ${escapeHtml(displayFloor)}` : ''}</div>
              </div>
              <span class="badge ${isMaint ? 'badge-maintenance' : 'text-bg-light border'}">
                ${isMaint ? 'Under Maintenance' : escapeHtml(ROOM_TYPE_LABELS[room.room_type] || room.room_type)}
              </span>
            </div>
            <div class="mt-2 d-flex flex-wrap gap-1">
              ${amenities.map((a) => `<span class="amenity-pill">${escapeHtml(a)}</span>`).join('')}
            </div>
            <div class="mt-auto pt-3">
              ${slots}
              ${actionHtml}
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ----------------------------------------------- hierarchical grouping --- */

  /** Helper to sort floor labels naturally (Ground Floor -> 1st Floor -> 2nd Floor -> ... -> Unassigned) */
  function getFloorSortOrder(floorLabel) {
    const label = String(floorLabel || '').trim().toLowerCase();
    if (label.includes('ground') || label === 'general') return 0;
    const match = label.match(/(\d+)/);
    if (match) return parseInt(match[1], 10);
    if (label.includes('unassigned')) return 999;
    return 100;
  }

  /** Normalizes a floor label or extracts from room name or falls back to 'General / Ground Floor' */
  function resolveFloorLabel(floorRaw, roomName) {
    if (floorRaw && String(floorRaw).trim()) {
      const val = String(floorRaw).trim();
      return val.replace(/\bfloor\b/i, 'Floor');
    }
    const name = String(roomName || '').trim();
    const match = name.match(/\b([1-9])\d{2}\b/);
    if (match) {
      const digit = parseInt(match[1], 10);
      const sfx = digit === 1 ? 'st' : digit === 2 ? 'nd' : digit === 3 ? 'rd' : 'th';
      return `${digit}${sfx} Floor`;
    }
    return 'General / Ground Floor';
  }

  /**
   * Dynamically groups rooms by Building -> Floor -> Rooms.
   * Returns an array of building groups sorted alphabetically, with floors sorted logically.
   */
  function groupRoomsHierarchically(rooms) {
    const buildingMap = rooms.reduce((acc, room) => {
      const bName = (room.building_name || 'General Campus Space').trim();
      if (!acc.has(bName)) {
        acc.set(bName, {
          buildingName: bName,
          buildingId: room.building_id || null,
          floorMap: new Map()
        });
      }
      const bEntry = acc.get(bName);
      const floorLabel = resolveFloorLabel(room.floor, room.name);
      if (!bEntry.floorMap.has(floorLabel)) {
        bEntry.floorMap.set(floorLabel, []);
      }
      bEntry.floorMap.get(floorLabel).push({
        ...room,
        display_floor: floorLabel
      });
      return acc;
    }, new Map());

    // Sort buildings alphabetically
    const sortedBuildings = Array.from(buildingMap.values()).sort((a, b) =>
      a.buildingName.localeCompare(b.buildingName)
    );

    return sortedBuildings.map((b) => {
      const sortedFloors = Array.from(b.floorMap.entries())
        .sort(([floorA], [floorB]) => {
          const orderA = getFloorSortOrder(floorA);
          const orderB = getFloorSortOrder(floorB);
          if (orderA !== orderB) return orderA - orderB;
          return floorA.localeCompare(floorB);
        })
        .map(([floorName, floorRooms]) => {
          const sortedRooms = [...floorRooms].sort((r1, r2) =>
            String(r1.name || '').localeCompare(String(r2.name || ''))
          );
          return {
            floorName,
            rooms: sortedRooms
          };
        });

      const allBuildingRooms = sortedFloors.flatMap((f) => f.rooms);
      const totalRooms = allBuildingRooms.length;
      const freeRooms = allBuildingRooms.filter((r) => r.is_free_all_day).length;

      return {
        buildingName: b.buildingName,
        buildingId: b.buildingId,
        totalRooms,
        freeRooms,
        floors: sortedFloors
      };
    });
  }

  /** Renders one complete building section with prominent header, floor subheaders, and card sub-grid */
  function renderBuildingSection(bGroup) {
    const { buildingName, buildingId, totalRooms, freeRooms, floors } = bGroup;
    const safeBuildingId = (buildingId ? `bldg-${buildingId}` : `bldg-${buildingName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`);

    const floorPillsHtml = floors.length > 1
      ? `<div class="building-floor-nav">
           <span class="building-floor-nav-label">Levels:</span>
           ${floors
             .map((f, idx) => {
               const floorAnchor = `${safeBuildingId}-fl-${idx}`;
               return `<a href="#${floorAnchor}" class="building-floor-nav-pill">${escapeHtml(f.floorName)} <span class="opacity-75">(${f.rooms.length})</span></a>`;
             })
             .join('')}
         </div>`
      : '';

    const floorsHtml = floors
      .map((f, idx) => {
        const floorAnchor = `${safeBuildingId}-fl-${idx}`;
        return `
          <div class="floor-group-section" id="${floorAnchor}">
            <div class="floor-section-header">
              <span class="floor-pill-tag">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                  <polyline points="2 17 12 22 22 17"></polyline>
                  <polyline points="2 12 12 17 22 12"></polyline>
                </svg>
                <span>${escapeHtml(f.floorName)}</span>
              </span>
              <span class="floor-room-count-text">${f.rooms.length} ${f.rooms.length === 1 ? 'space' : 'spaces'}</span>
              <div class="floor-divider-line"></div>
            </div>
            <div class="row g-3 row-cols-1 row-cols-sm-2 row-cols-lg-3 row-cols-xl-4">
              ${f.rooms.map(roomCard).join('')}
            </div>
          </div>
        `;
      })
      .join('');

    return `
      <section class="building-group-section" id="${safeBuildingId}">
        <div class="building-section-header">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
            <div class="d-flex align-items-center gap-3">
              <div class="building-header-icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                  <path d="M9 22v-4h6v4"></path>
                  <path d="M8 6h.01"></path>
                  <path d="M16 6h.01"></path>
                  <path d="M12 6h.01"></path>
                  <path d="M12 10h.01"></path>
                  <path d="M12 14h.01"></path>
                  <path d="M16 10h.01"></path>
                  <path d="M16 14h.01"></path>
                  <path d="M8 10h.01"></path>
                  <path d="M8 14h.01"></path>
                </svg>
              </div>
              <div>
                <h2 class="building-header-title">${escapeHtml(buildingName)}</h2>
                <div class="building-header-meta">${floors.length} floor level${floors.length !== 1 ? 's' : ''} &middot; ${totalRooms} total space${totalRooms !== 1 ? 's' : ''}</div>
              </div>
            </div>
            <div class="d-flex align-items-center gap-2">
              <span class="building-count-badge">${totalRooms} ${totalRooms === 1 ? 'Room' : 'Rooms'}</span>
              <span class="building-avail-badge ${freeRooms > 0 ? '' : 'none'}">${freeRooms} Free</span>
            </div>
          </div>
          ${floorPillsHtml}
        </div>
        <div class="building-floors-container">
          ${floorsHtml}
        </div>
      </section>
    `;
  }

  async function load() {
    const date = dateInput.value || todayIso();
    const params = new URLSearchParams({ date });
    const selectedBuildingRaw = (buildingSel.value || '').trim();

    if (selectedBuildingRaw && window.__buildingIdByName) {
      const bid = window.__buildingIdByName.get(selectedBuildingRaw);
      if (bid) params.set('building_id', bid);
    }

    grid.innerHTML = `
      <div class="card room-filter-empty w-100">
        <div class="card-body text-center text-muted-sm py-5">
          <div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
          <div>Loading spaces and availability...</div>
        </div>
      </div>`;

    try {
      const data = await api(`/api/availability?${params.toString()}`);
      const selectedQuery = selectedBuildingRaw.toLowerCase();
      const wantedType = (typeSel?.value || '').toLowerCase();

      // Filter rooms matching all active criteria (Space type, Building)
      const filteredRooms = (data.rooms || []).filter((room) => {
        if (wantedType && String(room.room_type || '').toLowerCase() !== wantedType) {
          return false;
        }
        if (!selectedQuery) {
          return true;
        }
        const bName = String(room.building_name || '').trim().toLowerCase();
        const bId = String(room.building_id || '').trim();
        return bName === selectedQuery || bName.includes(selectedQuery) || bId === selectedQuery;
      });

      // Update summary cards
      document.getElementById('sum-rooms').textContent = filteredRooms.length;
      document.getElementById('sum-free').textContent = filteredRooms.filter((r) => r.is_free_all_day).length;
      document.getElementById('sum-bookings').textContent = filteredRooms.reduce(
        (total, room) => total + (room.bookings || []).length, 0
      );

      // Empty state handling
      if (!filteredRooms.length) {
        const message = selectedBuildingRaw
          ? `No rooms found for "${escapeHtml(selectedBuildingRaw)}" matching the active filters.`
          : 'No active rooms found matching the current criteria.';
        grid.innerHTML = `
          <div class="card room-filter-empty w-100">
            <div class="card-body text-center text-muted-sm py-5">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mb-3 text-secondary opacity-50" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M16 16s-1.5-2-4-2-4 2-4 2"></path>
                <line x1="9" y1="9" x2="9.01" y2="9"></line>
                <line x1="15" y1="9" x2="15.01" y2="9"></line>
              </svg>
              <h3 class="h6 text-light mb-1">No Spaces Available</h3>
              <p class="mb-0 small">${message}</p>
            </div>
          </div>`;
        return;
      }

      // Group hierarchically: Building -> Floor -> Rooms
      const groupedBuildings = groupRoomsHierarchically(filteredRooms);
      grid.innerHTML = groupedBuildings.map(renderBuildingSection).join('');
    } catch (err) {
      grid.innerHTML = `
        <div class="card room-filter-empty w-100 border-danger/40">
          <div class="card-body text-center text-danger py-5">
            <p class="mb-0">Could not load availability: ${escapeHtml(err.message)}</p>
          </div>
        </div>`;
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
  buildingSel.addEventListener('change', () => {
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
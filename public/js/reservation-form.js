/* Reservation form: pick a room, check conflicts, submit the request. */
'use strict';

(async function () {
  const P = window.Portal;
  const {
    api, requireRole, renderNavbar, escapeHtml, formatTime,
    statusBadge, toastOk, toastError, busy, EQUIPMENT_TYPES,
    ROOM_TYPE_LABELS, todayIso
  } = P;

  const user = await requireRole();
  if (!user) return;
  renderNavbar(user, 'reserve');

  const form = document.getElementById('reservation-form');
  const alertBox = document.getElementById('form-alert');
  const buildingSel = document.getElementById('building_id');
  const roomSel = document.getElementById('room_id');
  const roomHint = document.getElementById('room-hint');
  const capacityHint = document.getElementById('capacity-hint');
  const previewPanel = document.getElementById('preview-panel');
  const submitBtn = document.getElementById('submit-btn');
  const BUILDING_BACKGROUNDS = {
    'CCS BUILDING': '/img/640fd213-b190-4dd5-85ac-f5e48efaa979.jpg',
    'CAS BUILDING': '/img/86d642c7-aab7-4114-85ec-75a84ae1b8c0.jpg',
    'GREENBUILDING': '/img/430ad98a-b78e-4c54-b0fa-803c6eed5ef3.jpg',
    'ACADEMIC BUILDING II': '/img/6073d9fd-be4f-4d55-bc84-bde51aa8db51.jpg',
    'ACADEMIC BUILDING I': '/img/79f0c07c-b23e-4644-9550-536b84c2f5b4.jpg',
    'MULTI PURPOSE BUILDING': '/img/fc87102f-d288-4b44-81f1-022acfccb7c6.jpg',
    'MULTI PORPUSE BUILDING': '/img/fc87102f-d288-4b44-81f1-022acfccb7c6.jpg',
    'CHS BUILDING': '/img/e4edc818-0707-48a1-87d1-cb81125f6ee4.jpg',
    'CITD BUILDING': '/img/cookery-lab.jpg',
    'LSB BUILDING': '/img/chemistry-lab.jpg'
  };

  function updateBuildingBackground() {
    const selectedName = buildingSel.selectedOptions[0]?.textContent
      .trim()
      .replace(/\s+\(\d+\s+(?:rooms?|silid)\)$/i, '')
      .toLocaleUpperCase();
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

  let rooms = [];

  function showAlert(message) {
    alertBox.className = 'alert alert-danger';
    alertBox.textContent = message;
    alertBox.classList.remove('d-none');
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ------------------------------------------------- equipment checkboxes --- */

  document.getElementById('equipment-list').innerHTML = EQUIPMENT_TYPES.map((item) => `
    <div class="form-check">
      <input class="form-check-input" type="checkbox" name="equipment"
             id="eq-${item.replace(/\s+/g, '-').toLowerCase()}" value="${item}" />
      <label class="form-check-label" for="eq-${item.replace(/\s+/g, '-').toLowerCase()}">${item}</label>
    </div>`).join('');

  /* ------------------------------------------------------------- defaults --- */

  const dateInput = document.getElementById('res_date');
  dateInput.min = todayIso();
  dateInput.value = todayIso();
  document.getElementById('start_time').value = '08:00';
  document.getElementById('end_time').value = '10:00';

  /* ------------------------------------------------------------ buildings --- */

  try {
    const data = await api('/api/buildings');
    buildingSel.innerHTML =
      '<option value="">Select a building...</option>' +
      (data.buildings || []).map((b) =>
        `<option value="${b.id}">${escapeHtml(b.name)} (${b.room_count} rooms)</option>`
      ).join('');
    updateBuildingBackground();
  } catch (err) {
    buildingSel.innerHTML = '<option value="">Could not load buildings</option>';
    toastError(`Could not load buildings: ${err.message}`);
  }

  /* ---------------------------------------------------------------- rooms --- */

  async function loadRooms(buildingId, selectedRoomId = roomSel.value) {
    roomSel.disabled = true;
    roomSel.innerHTML = '<option value="">Loading rooms...</option>';
    rooms = [];
    if (!buildingId) {
      roomSel.innerHTML = '<option value="">Choose a building first</option>';
      roomHint.textContent = 'Select a building to see its rooms.';
      capacityHint.textContent = '';
      renderPreview();
      return;
    }
    try {
      const data = await api(`/api/rooms?building_id=${encodeURIComponent(buildingId)}`);
      rooms = data.rooms || [];
      roomSel.innerHTML = rooms.length
        ? '<option value="">Select a room...</option>' +
          rooms.map((r) =>
            `<option value="${r.id}">${escapeHtml(r.name)}${r.floor ? ` · ${escapeHtml(r.floor)}` : ''} - ${escapeHtml(ROOM_TYPE_LABELS[r.room_type] || r.room_type)}, seats ${r.capacity}</option>`
          ).join('')
        : '<option value="">No active rooms in this building</option>';
      if (selectedRoomId && rooms.some((room) => String(room.id) === String(selectedRoomId))) {
        roomSel.value = String(selectedRoomId);
      }
      roomSel.disabled = !rooms.length;
      roomHint.textContent = rooms.length
        ? `${rooms.length} room(s) available in this building.`
        : 'No active rooms in this building.';
    } catch (err) {
      roomSel.innerHTML = '<option value="">Could not load rooms</option>';
      roomHint.textContent = '';
      toastError(`Could not load rooms: ${err.message}`);
    }
    capacityHint.textContent = '';
    renderPreview();
  }

  function selectedRoom() {
    return rooms.find((r) => String(r.id) === String(roomSel.value)) || null;
  }

  buildingSel.addEventListener('change', () => {
    updateBuildingBackground();
    loadRooms(buildingSel.value);
  });
  form.addEventListener('reset', () => {
    window.setTimeout(updateBuildingBackground, 0);
  });
  roomSel.addEventListener('change', () => {
    const room = selectedRoom();
    capacityHint.textContent = room
      ? `"${room.name}" can seat up to ${room.capacity} people.`
      : '';
    renderPreview();
  });
  dateInput.addEventListener('change', renderPreview);
/* ------------------------------------------------------------- preview --- */

  async function renderPreview() {
    const room = selectedRoom();
    const date = dateInput.value;

    if (!room || !date) {
      previewPanel.innerHTML =
        '<p class="text-muted-sm mb-0">Pick a room and date to see what is already booked.</p>';
      return;
    }

    previewPanel.innerHTML = '<p class="text-muted-sm mb-0">Checking availability...</p>';
    try {
      const data = await api(
        `/api/availability?date=${encodeURIComponent(date)}&room_id=${encodeURIComponent(room.id)}`
      );
      const entry = (data.rooms || []).find((r) => String(r.id) === String(room.id));
      const bookings = entry ? entry.bookings : [];

      if (!bookings.length) {
        previewPanel.innerHTML =
          `<p class="mb-0 text-primary fw-semibold">Fully available on ${escapeHtml(date)}.</p>` +
          '<p class="text-muted-sm mb-0">No pending or approved bookings for this room.</p>';
        return;
      }

      previewPanel.innerHTML =
        `<p class="text-muted-sm">${bookings.length} existing booking(s) on ${escapeHtml(date)}:</p>` +
        '<ul class="slot-list">' +
        bookings.map((b) => `
          <li class="${b.status === 'Approved' ? 'slot-approved slot-blue' : ''}">
            <span>${escapeHtml(formatTime(b.start_time))} - ${escapeHtml(formatTime(b.end_time))}</span>
            ${statusBadge(b.status)}
          </li>`).join('') +
        '</ul>';

      // Warn early when the chosen window collides with an existing booking.
      const start = document.getElementById('start_time').value;
      const end = document.getElementById('end_time').value;
      if (start && end && collisions(start, end, bookings).length) {
        previewPanel.innerHTML +=
          '<div class="alert alert-warning mb-0 mt-3 py-2">' +
          'Your chosen window overlaps an existing booking. The request will be rejected as a double booking.' +
          '</div>';
      }
    } catch (err) {
      previewPanel.innerHTML =
        `<p class="text-muted-sm mb-0">Could not check availability: ${escapeHtml(err.message)}</p>`;
    }
  }

  /** Client-side mirror of the server's overlap rule. */
  function collisions(start, end, bookings) {
    const toMin = (t) => {
      const [h, m] = String(t).split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const s = toMin(start);
    const e = toMin(end);
    return bookings.filter((b) => s < toMin(b.end_time) && e > toMin(b.start_time));
  }

  ['start_time', 'end_time'].forEach((id) => {
    document.getElementById(id).addEventListener('change', renderPreview);
  });

  /* -------------------------------------------------------------- submit --- */

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alertBox.classList.add('d-none');

    const room = selectedRoom();
    if (!room) return showAlert('Please select a room.');

    const start = form.start_time.value;
    const end = form.end_time.value;
    if (end <= start) return showAlert('End time must be later than start time.');

    const purpose = form.purpose.value.trim();
    if (purpose.length < 10) {
      return showAlert('Please describe the purpose of use in at least 10 characters.');
    }

    const attendees = Number(form.attendees.value);
    if (!Number.isInteger(attendees) || attendees < 1) {
      return showAlert('Number of attendees must be a whole number of at least 1.');
    }
    if (attendees > room.capacity) {
      return showAlert(`"${room.name}" only seats ${room.capacity} people.`);
    }

    const equipment = Array.from(
      form.querySelectorAll('input[name="equipment"]:checked')
    ).map((el) => el.value);

    busy(submitBtn, true, 'Submitting...');
    try {
      const data = await api('/api/reservations', {
        method: 'POST',
        body: {
          room_id: room.id,
          res_date: form.res_date.value,
          start_time: start,
          end_time: end,
          purpose,
          attendees,
          equipment
        }
      });
      toastOk(data.message || 'Reservation submitted.');
      P.broadcastAvailabilityChange();
      setTimeout(() => P.redirectTo('/dashboard.html'), 900);
    } catch (err) {
      showAlert(err.message);
      busy(submitBtn, false);
      renderPreview();
    }
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    alertBox.classList.add('d-none');
    dateInput.value = todayIso();
    document.getElementById('start_time').value = '08:00';
    document.getElementById('end_time').value = '10:00';
    capacityHint.textContent = '';
    renderPreview();
  });

  document.addEventListener('portal-locale-change', () => {
    const selectedRoomId = roomSel.value;
    loadRooms(buildingSel.value, selectedRoomId);
    renderPreview();
  });

  renderPreview();
})();
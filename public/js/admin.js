/* Admin management: buildings, rooms and user accounts. */
'use strict';

(async function () {
  const P = window.Portal;
  const {
    api, requireRole, renderNavbar, escapeHtml, roleBadge, emptyRow,
    toastOk, toastError, busy, ROOM_TYPE_LABELS
  } = P;

  document.body.classList.add('admin-dashboard-page');

  const me = await requireRole('admin');
  if (!me) return;
  renderNavbar(me, 'admin');

  let buildings = [];
  let rooms = [];
  let users = [];

  const buildingModal = new bootstrap.Modal(document.getElementById('building-modal'));
  const roomModal = new bootstrap.Modal(document.getElementById('room-modal'));
  const userModal = new bootstrap.Modal(document.getElementById('user-modal'));

  const buildingForm = document.getElementById('building-form');
  const roomForm = document.getElementById('room-form');
  const userForm = document.getElementById('user-form');

  /** Holds the id being edited (null when creating a new record). */
  const editing = { building: null, room: null, user: null };

  /* ============================ BUILDINGS ================================ */

  const buildingsBody = document.getElementById('buildings-body');

  async function loadBuildings() {
    try {
      const data = await api('/api/buildings');
      buildings = data.buildings || [];
      renderBuildings();
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
          <button class="btn btn-sm btn-outline-danger ms-1" data-del-building="${b.id}">Delete</button>
        </td>
      </tr>`).join('');
    bindBuildingActions();
  }

  function openBuildingModal(building) {
    editing.building = building ? building.id : null;
    document.getElementById('building-modal-title').textContent =
      building ? `Edit building #${building.id}` : 'Add building';
    buildingForm.name.value = building ? building.name : '';
    buildingForm.location.value = building ? (building.location || '') : '';
    buildingModal.show();
  }

  function bindBuildingActions() {
    buildingsBody.querySelectorAll('[data-edit-building]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-edit-building'));
        openBuildingModal(buildings.find((b) => b.id === id));
      });
    });
    buildingsBody.querySelectorAll('[data-del-building]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-del-building'));
        const building = buildings.find((b) => b.id === id);
        const warning = building && building.room_count > 0
          ? `\n\nWarning: its ${building.room_count} room(s) will also be removed.`
          : '';
        if (!window.confirm(`Delete "${building ? building.name : 'this building'}"?${warning}`)) return;
        try {
          const data = await api(`/api/admin/buildings/${id}`, { method: 'DELETE' });
          toastOk(data.message);
          await Promise.all([loadBuildings(), loadRooms(), loadRoomBuildingOptions()]);
        } catch (err) {
          toastError(err.message);
        }
      });
    });
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
      buildingModal.hide();
      await Promise.all([loadBuildings(), loadRoomBuildingOptions()]);
    } catch (err) {
      toastError(err.message);
    } finally {
      busy(saveBtn, false);
    }
  });
/* =============================== ROOMS ================================= */

  const roomsBody = document.getElementById('rooms-body');
  const showInactive = document.getElementById('show-inactive-rooms');

  /** Refreshes the building dropdown inside the room modal. */
  async function loadRoomBuildingOptions() {
    const select = document.getElementById('room-building');
    select.innerHTML = buildings.map((b) =>
      `<option value="${b.id}">${escapeHtml(b.name)}</option>`
    ).join('');
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
    return out.length
      ? out.map((a) => `<span class="amenity-pill">${a}</span>`).join('')
      : '<span class="text-muted-sm">-</span>';
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
        <td>${r.is_active
          ? '<span class="badge text-bg-success">Active</span>'
          : '<span class="badge text-bg-secondary">Inactive</span>'}</td>
        <td>${escapeHtml(r.reservation_count)}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-sm btn-outline-cspc" data-edit-room="${r.id}">Edit</button>
          ${r.is_active
            ? `<button class="btn btn-sm btn-outline-danger ms-1" data-del-room="${r.id}">Delete</button>`
            : `<button class="btn btn-sm btn-outline-success ms-1" data-react-room="${r.id}">Reactivate</button>`}
        </td>
      </tr>`).join('');
    bindRoomActions();
  }

  function openRoomModal(room) {
    editing.room = room ? room.id : null;
    document.getElementById('room-modal-title').textContent =
      room ? `Edit room #${room.id}` : 'Add room';
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
/** Reactivates a soft-deleted room (admin PUT with is_active = 1). */
  async function reactivateRoom(room) {
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
      await loadRooms();
    } catch (err) {
      toastError(err.message);
    }
  }

  function bindRoomActions() {
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
        const warning = room && room.reservation_count > 0
          ? `\n\nIt has ${room.reservation_count} reservation(s), so it will be deactivated instead of deleted.`
          : '';
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
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-react-room'));
        reactivateRoom(rooms.find((r) => r.id === id));
      });
    });
  }

  document.getElementById('new-room-btn').addEventListener('click', () => openRoomModal(null));
  showInactive.addEventListener('change', loadRooms);

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
      roomModal.hide();
      await Promise.all([loadRooms(), loadBuildings()]);
    } catch (err) {
      toastError(err.message);
    } finally {
      busy(saveBtn, false);
    }
  });
/* =============================== USERS ================================= */

  const usersBody = document.getElementById('users-body');
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
        <td>${u.is_active
          ? '<span class="badge text-bg-success">Active</span>'
          : '<span class="badge text-bg-secondary">Inactive</span>'}</td>
        <td>${escapeHtml(u.reservation_count)}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-sm btn-outline-cspc" data-edit-user="${u.id}">Edit</button>
          ${Number(u.id) === Number(me.id)
            ? '<span class="text-muted-sm ms-2">You</span>'
            : `<button class="btn btn-sm btn-outline-danger ms-1" data-del-user="${u.id}">Delete</button>`}
        </td>
      </tr>`).join('');
    bindUserActions();
  }

  function openUserModal(user) {
    editing.user = user ? user.id : null;
    document.getElementById('user-modal-title').textContent =
      user ? `Edit account #${user.id}` : 'Add user account';
    // The ID number cannot be changed after creation.
    document.getElementById('user-school-id-group').classList.toggle('d-none', Boolean(user));
    roomBuildingOptionsNoop();
    userForm.school_id.value = user ? user.school_id : '';
    userForm.full_name.value = user ? user.full_name : '';
    userForm.email.value = user ? user.email : '';
    userForm.recovery_email.value = user ? (user.recovery_email || '') : '';
    userForm.role.value = user ? user.role : 'student';
    userForm.department.value = user ? (user.department || '') : '';
    userForm.password.value = '';
    userForm.password.required = !user;
    document.getElementById('user-password-hint').textContent =
      user ? '(leave blank to keep current)' : '(required)';
    userForm.is_active.checked = user ? Boolean(user.is_active) : true;
    userModal.show();
  }

  /** Placeholder kept so the modal opens even before rooms have loaded. */
  function roomBuildingOptionsNoop() {}

  async function deleteUser(user) {
    const warning = user.reservation_count > 0
      ? `\n\nThis account has ${user.reservation_count} reservation(s), so it will be deactivated instead of deleted.`
      : '';
    if (!window.confirm(`Delete the account of "${user.full_name}"?${warning}`)) return;
    try {
      const data = await api(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      toastOk(data.message);
      await loadUsers();
    } catch (err) {
      toastError(err.message);
    }
  }

  function bindUserActions() {
    usersBody.querySelectorAll('[data-edit-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-edit-user'));
        openUserModal(users.find((u) => u.id === id));
      });
    });
    usersBody.querySelectorAll('[data-del-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-del-user'));
        deleteUser(users.find((u) => u.id === id));
      });
    });
  }

  document.getElementById('new-user-btn').addEventListener('click', () => openUserModal(null));
  roleFilter.addEventListener('change', loadUsers);
  userSearch.addEventListener('input', () => {
    clearTimeout(window.__userSearchTimer);
    window.__userSearchTimer = setTimeout(loadUsers, 300);
  });

  userForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const saveBtn = document.getElementById('user-save');
    busy(saveBtn, true, 'Saving...');
    try {
      const payload = {
        full_name: userForm.full_name.value.trim(),
        email: userForm.email.value.trim(),
        recovery_email: userForm.recovery_email.value.trim() || undefined,
        role: userForm.role.value,
        department: userForm.department.value.trim(),
        is_active: userForm.is_active.checked
      };
      if (userForm.password.value) payload.password = userForm.password.value;

      let data;
      if (editing.user) {
        data = await api(`/api/admin/users/${editing.user}`, { method: 'PUT', body: payload });
      } else {
        payload.school_id = userForm.school_id.value.trim();
        payload.password = userForm.password.value;
        data = await api('/api/admin/users', { method: 'POST', body: payload });
      }
      toastOk(data.message);
      userModal.hide();
      await loadUsers();
    } catch (err) {
      toastError(err.message);
    } finally {
      busy(saveBtn, false);
    }
  });

  /* =============================== INIT ================================= */

  await loadBuildings();
  await loadRoomBuildingOptions();
  document.addEventListener('portal-locale-change', () => {
    loadBuildings();
    loadRooms();
    loadUsers();
  });
  await Promise.all([loadRooms(), loadUsers()]);
})();
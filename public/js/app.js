/* =============================================================
   CSPC Reservation Portal - shared frontend helpers
   Loaded on every page (after Bootstrap). Keeps API calls,
   session handling, navbar rendering and toasts in one place.
   ============================================================= */
'use strict';

const PORTAL_LOCALE_KEY = 'portal-locale';
let portalLocale = localStorage.getItem(PORTAL_LOCALE_KEY) || 'en-US';
const translatedTextNodes = new WeakMap();
const translatedAttributes = new WeakMap();

const FILIPINO_UI = {
  'Lab & Room Reservation': 'Sistema ng Pagpapareserba ng Lab at Silid',
  'Room and Laboratory Reservation': 'Sistemang Pagpapareserba ng Silid at Laboratoryo',
  'Laboratory/Room Reservation': 'Reserbasyon ng Laboratoryo/Silid',
  'Dashboard': 'Dashboard', 'Room Status': 'Kalagayan ng mga Silid', 'About Us': 'Tungkol sa Amin',
  'New Reservation': 'Bagong Pagpapareserba', 'Management': 'Pamamahala', 'Help Desk': 'Tanggapan ng Tulong',
  'Log in': 'Mag-log in', 'Login': 'Mag-log in', 'Log out': 'Mag-log out', 'Register': 'Magparehistro',
  'Register here': 'Magparehistro dito', 'Your account': 'Iyong account',
  'Profile & Avatar Settings': 'Mga Setting ng Profile at Larawan', 'My Reservation History': 'Kasaysayan ng Aking mga Pagpapareserba',
  'Security & Change Password': 'Seguridad at Pagbabago ng Password', 'Change password': 'Magbago ng password',
  'Student': 'Mag-aaral', 'Students': 'Mga Mag-aaral', 'Faculty': 'Guro', 'Custodian': 'Tagapangasiwa',
  'Admin': 'Admin', 'Admins': 'Mga Admin', 'Administrator Portal': 'Portal ng Administrator',
  'About the portal': 'Tungkol sa portal',
  'The Lab & Room Reservation System helps the CSPC community view room availability and manage laboratory and room booking requests.': 'Tinutulungan ng Sistema ng Pagpapareserba ng Lab at Silid ang komunidad ng CSPC na tingnan ang bakanteng silid at pamahalaan ang mga kahilingan sa pagpapareserba.',
  'Use Room Status to check availability, then submit a reservation request or contact your administrator for assistance.': 'Tingnan ang Kalagayan ng mga Silid upang malaman ang bakanteng silid, magsumite ng kahilingan, o makipag-ugnayan sa administrator para sa tulong.',
  'Got it': 'Naiintindihan ko', 'Close': 'Isara', 'Cancel': 'Kanselahin', 'Save': 'I-save', 'Edit': 'I-edit',
  'Delete': 'Tanggalin', 'Add': 'Magdagdag', 'Submit': 'Isumite', 'Search': 'Maghanap', 'Refresh': 'I-refresh',
  'Loading...': 'Naglo-load...', 'Loading rooms...': 'Naglo-load ng mga silid...',
  'System overview': 'Pangkalahatang-ideya ng sistema', 'Welcome back!': 'Maligayang pagbabalik!',
  'Overview of room bookings.': 'Pangkalahatang-ideya ng mga pagpapareserba ng silid.',
  'System online': 'Aktibo ang sistema', 'Track the status of your own room reservation requests.': 'Subaybayan ang kalagayan ng iyong mga kahilingan sa pagpapareserba.',
  'Review and act on reservation requests across all rooms.': 'Suriin at asikasuhin ang mga kahilingan sa lahat ng silid.',
  '+ New Reservation': '+ Bagong Pagpapareserba', 'Manage Rooms': 'Pamahalaan ang mga Silid',
  'View Pending': 'Tingnan ang Nakabinbin', 'Add Room': 'Magdagdag ng Silid', 'All reservation requests': 'Lahat ng kahilingan sa pagpapareserba',
  'My reservations': 'Aking mga pagpapareserba', 'Total requests': 'Kabuuang mga kahilingan', 'Total': 'Kabuuan',
  'Pending': 'Nakabinbin', 'Approved': 'Naaprubahan', 'Rejected': 'Tinanggihan', 'Cancelled': 'Kinansela',
  'All': 'Lahat', 'Room': 'Silid', 'Rooms': 'Mga Silid', 'Date': 'Petsa', 'Time': 'Oras', 'Purpose': 'Layunin',
  'Attendees': 'Mga Dadalo', 'Requester': 'Humiling', 'Status': 'Kalagayan', 'Actions': 'Mga Aksyon',
  'No reservations match this filter yet.': 'Walang tumutugmang pagpapareserba sa filter na ito.',
  'No reservations match this filter.': 'Walang tumutugmang pagpapareserba sa filter na ito.',
  'Approve': 'Aprubahan', 'Reject': 'Tanggihan', 'Approve request': 'Aprubahan ang kahilingan',
  'Reject request': 'Tanggihan ang kahilingan', 'Saving...': 'Sine-save...', 'Decision': 'Desisyon',
  'Remarks (optional)': 'Mga Tala (opsyonal)', 'Reason or instruction for the requester': 'Dahilan o tagubilin para sa humiling',
  'Confirm': 'Kumpirmahin', 'Reservation details': 'Mga detalye ng pagpapareserba', 'Building': 'Gusali',
  'Buildings': 'Mga Gusali', 'Select a building...': 'Pumili ng gusali...', 'All buildings': 'Lahat ng gusali',
  'Room / laboratory': 'Silid / laboratoryo', 'Choose a building first': 'Pumili muna ng gusali',
  'Select a building to see its rooms.': 'Pumili ng gusali upang makita ang mga silid nito.',
  'Select a room...': 'Pumili ng silid...', 'No active rooms in this building': 'Walang aktibong silid sa gusaling ito',
  'No active rooms in this building.': 'Walang aktibong silid sa gusaling ito.', 'Date': 'Petsa',
  'Start time': 'Oras ng pagsisimula', 'End time': 'Oras ng pagtatapos', 'Number of attendees': 'Bilang ng mga dadalo',
  'Purpose of use': 'Layunin ng paggamit', 'Equipment needed': 'Kagamitang kailangan', 'Submit request': 'Isumite ang kahilingan',
  'Clear': 'I-clear', 'Existing bookings for this room': 'Mga kasalukuyang pagpapareserba sa silid na ito',
  'Pick a room and date to see what is already booked.': 'Pumili ng silid at petsa upang makita ang mga nakaiskedyul na.',
  'Checking availability...': 'Sinusuri ang bakante...', 'Free the whole day': 'Bakante buong araw',
  'Free all day': 'Bakante buong araw', 'Bookings': 'Mga Pagpapareserba', 'Fully available on {date}.': 'Ganap na bakante sa {date}.',
  'No pending or approved bookings for this room.': 'Walang nakabinbin o naaprubahang pagpapareserba sa silid na ito.',
  'Room availability': 'Pagkakaroon ng mga Silid', 'Live timetable of pending and approved bookings. Rejected and cancelled requests do not occupy a room.': 'Live na talaan ng mga nakabinbin at naaprubahang pagpapareserba. Hindi humahadlang sa silid ang mga tinanggihan o kinanselang kahilingan.',
  'Rooms': 'Mga Silid', 'Seats': 'Upuan', 'Projector': 'Projector', 'Aircon': 'Aircon', 'Air-conditioning': 'Aircon',
  'Sound': 'Tunog', 'Sound system': 'Sound system', 'Free the whole day': 'Bakante buong araw',
  'No active rooms found.': 'Walang nakitang aktibong silid.', 'All buildings': 'Lahat ng gusali',
  'Request a lab or room': 'Humiling ng laboratoryo o silid',
  'Fill in the details below. Requests start as': 'Punan ang mga detalye sa ibaba. Nagsisimula ang mga kahilingan bilang',
  'reviewed by the custodian or administrator.': 'at susuriin ng tagapangasiwa o administrator.',
  'School ID number': 'Numero ng School ID', 'Full name': 'Buong pangalan', 'Full Name': 'Buong Pangalan',
  'Email address': 'Email address', 'Email': 'Email', 'I am a': 'Ako ay', 'Department': 'Departamento',
  'Password': 'Password', 'Confirm password': 'Kumpirmahin ang password', 'Create an account': 'Gumawa ng account',
  'Create account': 'Gumawa ng account', 'Already registered?': 'May account ka na ba?', 'No account yet?': 'Wala pang account?',
  'At least 8 characters': 'Hindi bababa sa 8 karakter', 'Repeat password': 'Ulitin ang password', 'Optional': 'Opsyonal',
  'Students and faculty can self-register. Staff accounts are issued by the administrator.': 'Maaaring magparehistro ang mga mag-aaral at guro. Ang mga staff account ay ibinibigay ng administrator.',
  'Letters, digits and dashes only (4-50 characters).': 'Mga titik, numero, at gitling lamang (4–50 karakter).',
  'Sign in with your school ID number or CSPC email to book a laboratory or room.': 'Mag-sign in gamit ang iyong School ID o CSPC email upang magpareserba ng laboratoryo o silid.',
  'User Login': 'Pag-login ng User', 'Admin Login': 'Pag-login ng Admin', 'Admin ID / Email': 'Admin ID / Email',
  'Enter your Admin ID or Email': 'Ilagay ang iyong Admin ID o email', 'Your password': 'Iyong password',
  'e.g. 2021-00123': 'hal. 2021-00123', 'e.g. 2021-00123 or FAC-0100': 'hal. 2021-00123 o FAC-0100',
  'e.g. Juan Dela Cruz': 'hal. Juan Dela Cruz', 'No account yet? Register here': 'Wala pang account? Magparehistro dito',
  'Sign in with CSPC Google': 'Mag-sign in gamit ang CSPC Google', 'Forgot password?': 'Nakalimutan ang password?',
  'IT Support / Help desk': 'IT Support / Tanggapan ng Tulong', 'Password recovery': 'Pagbawi ng password',
  'Enter your school email or ID to receive a password reset link.': 'Ilagay ang iyong school email o ID upang makatanggap ng link para i-reset ang password.',
  'CSPC email or ID': 'CSPC email o ID', 'Send reset link': 'Ipadala ang reset link', 'Submit a secure support request': 'Magsumite ng ligtas na kahilingan sa suporta',
  'Email:': 'Email:', 'Phone:': 'Telepono:', 'Office hours: Monday to Friday, 8:00 AM - 5:00 PM': 'Oras ng opisina: Lunes hanggang Biyernes, 8:00 AM–5:00 PM',
  'Role / Department': 'Tungkulin / Departamento', 'Email Address / Contact Number': 'Email Address / Numero ng Kontak',
  'Issue Category': 'Kategorya ng Isyu', 'Select an issue type': 'Pumili ng uri ng isyu', 'Password Reset': 'Pag-reset ng Password',
  'Login Error': 'Error sa Pag-login', 'Room Booking Issue': 'Isyu sa Pagpapareserba ng Silid', 'Other': 'Iba pa',
  'Detailed Description': 'Detalyadong Paglalarawan',
  'Describe the issue, what happened, and when it occurred.': 'Ilarawan ang isyu, kung ano ang nangyari, at kung kailan ito nangyari.',
  'Security Notice:': 'Paalala sa Seguridad:',
  'Never share your current password or sensitive credentials through this support form.': 'Huwag ibahagi ang kasalukuyang password o sensitibong impormasyon sa form na ito.',
  'Submit request': 'Isumite ang kahilingan', 'Page not found': 'Hindi makita ang pahina',
  'The page you are looking for does not exist or may have been moved.': 'Wala o nailipat na ang pahinang hinahanap mo.',
  'Go to dashboard': 'Pumunta sa dashboard', 'Check room status': 'Tingnan ang kalagayan ng silid',
  'Admin': 'Admin', 'Control panel': 'Control panel', 'Reservations': 'Mga Pagpapareserba', 'Users': 'Mga User',
  'Support': 'Suporta', 'User dashboard': 'Dashboard ng User', 'Admin Dashboard': 'Dashboard ng Admin',
  'Manage reservations, rooms, and user accounts.': 'Pamahalaan ang mga pagpapareserba, silid, at user account.',
  'Current request activity': 'Kasalukuyang aktibidad ng kahilingan', 'Reservation Status Overview': 'Pangkalahatang Kalagayan ng Pagpapareserba',
  'System Resources & User Breakdown': 'Mga Resource ng Sistema at Pagkakahati ng mga User',
  'Show resource counts': 'Ipakita ang bilang ng mga resource', 'Active rooms': 'Mga Aktibong Silid',
  'Buildings': 'Mga Gusali', 'Users': 'Mga User', 'Faculty': 'Guro', 'Custodians': 'Mga Tagapangasiwa',
  'Room snapshot': 'Buod ng mga Silid', 'This week': 'Ngayong linggo', 'Recent activity': 'Kamakailang Aktibidad',
  'Add building': 'Magdagdag ng Gusali', 'Rooms & laboratories': 'Mga Silid at Laboratoryo',
  'Show deactivated': 'Ipakita ang mga naka-deactivate', 'Add room': 'Magdagdag ng Silid',
  'User accounts': 'Mga User Account', 'All roles': 'Lahat ng tungkulin', 'Search name / ID / email': 'Maghanap ng pangalan / ID / email',
  'Add user': 'Magdagdag ng User', 'ID number': 'Numero ng ID', 'Name': 'Pangalan', 'Role': 'Tungkulin',
  'Capacity': 'Kapasidad', 'Amenities': 'Mga Pasilidad', 'Administrator access': 'Access ng Administrator',
  '+ Add New Admin': '+ Magdagdag ng Bagong Admin', 'Admin ID': 'Admin ID', 'Role / Permissions': 'Tungkulin / Pahintulot',
  'Date added': 'Petsa ng Pagdaragdag', 'Person': 'Tao', 'Role / Dept': 'Tungkulin / Departamento',
  'Contact': 'Kontak', 'Category': 'Kategorya', 'Issue': 'Isyu', 'Submitted': 'Isinumite',
  'Latest 200 requests': 'Pinakabagong 200 kahilingan', 'Location': 'Lokasyon', 'Actions': 'Mga Aksyon',
  'All roles': 'Lahat ng tungkulin', 'Active': 'Aktibo', 'Inactive': 'Hindi Aktibo', 'Open': 'Bukas',
  'In Progress': 'Isinasagawa', 'Resolved': 'Nalutas', 'Reactivate': 'Muling I-activate',
  'Building': 'Gusali', 'Room name': 'Pangalan ng Silid', 'Type': 'Uri', 'Laboratory': 'Laboratoryo',
  'Classroom': 'Silid-aralan', 'Hall': 'Bulwagan', 'Office': 'Opisina', 'Sound system': 'Sound system',
  'Projector': 'Projector', 'Air-conditioning': 'Aircon', 'At least 8 characters. Leave blank to keep the current password.': 'Hindi bababa sa 8 karakter. Iwanang blangko upang panatilihin ang kasalukuyang password.',
  'At least 8 characters.': 'Hindi bababa sa 8 karakter.', 'User account': 'User Account', 'Full name': 'Buong pangalan',
  'System management': 'Pamamahala ng Sistema', 'Maintain buildings, rooms and user accounts. Admins only.': 'Pamahalaan ang mga gusali, silid, at user account. Para lamang sa mga admin.',
  'Language preference saved.': 'Na-save ang kagustuhan sa wika.',
  'Language preference saved. Some portal text is still displayed in English.': 'Na-save ang kagustuhan sa wika. May ilang bahagi ng portal na ipinapakita pa rin sa English.',
  'Choose a new photo': 'Pumili ng bagong larawan', 'JPEG, PNG, or WebP. Maximum file size: 3 MB.': 'JPEG, PNG, o WebP. Pinakamalaking laki ng file: 3 MB.',
  'Save photo': 'I-save ang larawan', 'Remove photo': 'Alisin ang larawan', 'Profile settings': 'Mga Setting ng Profile',
  'Could not load reservations': 'Hindi ma-load ang mga pagpapareserba', 'Could not load statistics': 'Hindi ma-load ang mga istatistika',
  'Could not load buildings': 'Hindi ma-load ang mga gusali', 'Could not load rooms': 'Hindi ma-load ang mga silid',
  'Could not load users': 'Hindi ma-load ang mga user', 'Could not load availability': 'Hindi ma-load ang availability',
  'No buildings yet. Add the first one.': 'Wala pang gusali. Idagdag ang unang gusali.', 'No rooms found.': 'Walang nakitang silid.',
  'No user accounts match this filter.': 'Walang tumutugmang user account sa filter na ito.',
  'No reservations match this filter yet.': 'Walang tumutugmang pagpapareserba sa filter na ito.',
  'Cannot reach the server. Is it still running?': 'Hindi makakonekta sa server. Tumatakbo pa ba ito?',
  'Please select a room.': 'Pumili ng silid.', 'End time must be later than start time.': 'Dapat mas huli ang oras ng pagtatapos kaysa oras ng pagsisimula.',
  'Please describe the purpose of use in at least 10 characters.': 'Ilarawan ang layunin ng paggamit gamit ang hindi bababa sa 10 karakter.',
  'Number of attendees must be a whole number of at least 1.': 'Dapat buong numero na hindi bababa sa 1 ang bilang ng mga dadalo.',
  'Your chosen window overlaps an existing booking. The request will be rejected as a double booking.': 'Nagsasapawan ang napili mong oras sa kasalukuyang pagpapareserba. Tatanggihan ang kahilingan upang maiwasan ang dobleng booking.',
  'No rooms found for': 'Walang nakitang silid para sa', 'Seats': 'Upuan', 'Free the whole day': 'Bakante buong araw',
  'System online': 'Aktibo ang sistema', 'All day': 'Buong araw', 'Yesterday': 'Kahapon', 'Today': 'Ngayon',
  'by': 'ni', 'You': 'Ikaw', 'Unknown user': 'Hindi kilalang user',
  'Reservation submitted.': 'Naipadala ang kahilingan sa pagpapareserba.',
  'You do not have access to that screen.': 'Wala kang pahintulot na buksan ang pahinang iyon.',
  'Please log in to continue.': 'Mag-log in upang magpatuloy.', 'You have been logged out.': 'Nakapag-log out ka na.',
  'Account created. Welcome!': 'Nagawa na ang account. Maligayang pagdating!',
  'Could not load buildings.': 'Hindi ma-load ang mga gusali.', 'Select a room and date to see what is already booked.': 'Pumili ng silid at petsa upang makita ang mga nakaiskedyul na.',
  'No pending or approved bookings for this room.': 'Walang nakabinbin o naaprubahang pagpapareserba sa silid na ito.',
  'No rooms found.': 'Walang nakitang silid.', 'Seats': 'Upuan', 'Manage Users': 'Pamahalaan ang mga User',
  'Add New Admin': 'Magdagdag ng Bagong Admin', 'View Pending': 'Tingnan ang Nakabinbin',
  'Total requests': 'Kabuuang mga kahilingan', 'Approved': 'Naaprubahan', 'Rejected': 'Tinanggihan',
  'Cancelled': 'Kinansela', 'Open': 'Bukas', 'Pending': 'Nakabinbin'
};

function currentUiLocale() {
  return portalLocale === 'fil-PH' ? 'fil-PH' : 'en-US';
}

function translatedUiValue(source) {
  if (portalLocale !== 'fil-PH') return source;
  const normalized = String(source).trim().replace(/\s+/g, ' ');
  if (Object.prototype.hasOwnProperty.call(FILIPINO_UI, normalized)) return FILIPINO_UI[normalized];
  let match = normalized.match(/^Welcome, (.+)!$/);
  if (match) return `Maligayang pagdating, ${match[1]}!`;
  match = normalized.match(/^Welcome back, (.+)!$/);
  if (match) return `Maligayang pagbabalik, ${match[1]}!`;
  match = normalized.match(/^Could not load ([^:]+):\s*(.+)$/);
  if (match) return `Hindi ma-load ang ${FILIPINO_UI[match[1]] || match[1]}: ${match[2]}`;
  match = normalized.match(/^Could not check availability: (.+)$/);
  if (match) return `Hindi masuri ang availability: ${match[1]}`;
  match = normalized.match(/^Could not load availability: (.+)$/);
  if (match) return `Hindi ma-load ang availability: ${match[1]}`;
  match = normalized.match(/^Could not load statistics: (.+)$/);
  if (match) return `Hindi ma-load ang mga istatistika: ${match[1]}`;
  match = normalized.match(/^Could not load inventory counters: (.+)$/);
  if (match) return `Hindi ma-load ang bilang ng imbentaryo: ${match[1]}`;
  match = normalized.match(/^(.+) room\(s\) available in this building\.$/);
  if (match) return `${match[1]} silid ang bakante sa gusaling ito.`;
  match = normalized.match(/^Fully available on (.+)\.$/);
  if (match) return `Ganap na bakante sa ${match[1]}.`;
  match = normalized.match(/^No rooms found for (.+)\.$/);
  if (match) return `Walang nakitang silid para sa ${match[1]}.`;
  match = normalized.match(/^(.+) \((\d+) rooms?\)$/);
  if (match) return `${match[1]} (${match[2]} silid)`;
  match = normalized.match(/^(.+?)(?: · (.+))? - (Laboratory|Classroom|Hall|Office), seats (\d+)$/);
  if (match) return `${match[1]}${match[2] ? ` · ${translatedUiValue(match[2])}` : ''} - ${FILIPINO_UI[match[3]] || match[3]}, ${match[4]} upuan`;
  match = normalized.match(/^"(.+)" can seat up to (\d+) people\.$/);
  if (match) return `Kayang paupuin ng "${match[1]}" ang hanggang ${match[2]} tao.`;
  match = normalized.match(/^"(.+)" only seats (\d+) people\.$/);
  if (match) return `Hanggang ${match[2]} tao lamang ang kasya sa "${match[1]}".`;
  match = normalized.match(/^([0-9]+) existing booking\(s\) on (.+):$/);
  if (match) return `${match[1]} kasalukuyang pagpapareserba sa ${match[2]}:`;
  match = normalized.match(/^Cancel reservation #(\d+) for "(.+)"\?$/);
  if (match) return `Kanselahin ang pagpapareserba #${match[1]} para sa "${match[2]}"?`;
  match = normalized.match(/^Reactivate "(.+)"\?$/);
  if (match) return `Muling i-activate ang "${match[1]}"?`;
  match = normalized.match(/^(Approve|Reject) reservation #(\d+)$/);
  if (match) return `${match[1] === 'Approve' ? 'Aprubahan' : 'Tanggihan'} ang pagpapareserba #${match[2]}`;
  match = normalized.match(/^Edit (building|room|account) #(\d+)$/);
  if (match) return `I-edit ang ${({ building: 'gusali', room: 'silid', account: 'account' })[match[1]]} #${match[2]}`;
  match = normalized.match(/^(\d+) active rooms?$/);
  if (match) return `${match[1]} aktibong silid`;
  if (/^Seats \d+$/.test(normalized)) return normalized.replace('Seats ', '') + ' upuan';
  /* Dynamic strings injected by page scripts (counters, timers, statuses). */
  match = normalized.match(/^Resend code in (\d+:\d{2})$/);
  if (match) return `Ipadala muli ang code sa ${match[1]}`;
  match = normalized.match(/^(\d+) Rooms? Available Now$/);
  if (match) return `${match[1]} Bakanteng Silid Ngayon`;
  match = normalized.match(/^Show all (\d+) buildings$/);
  if (match) return `Ipakita ang lahat ng ${match[1]} gusali`;
  match = normalized.match(/^(\d+) of (\d+) rooms available$/);
  if (match) return `${match[1]} sa ${match[2]} silid ang bakante`;
  match = normalized.match(/^Until (.+)$/);
  if (match) return `Hanggang ${match[1]}`;
  match = normalized.match(/^(\d+) bookings? today$/);
  if (match) return `${match[1]} booking ngayon`;
  match = normalized.match(/^\+(\d+) more open today$/);
  if (match) return `+${match[1]} pa ang bakante ngayon`;
  match = normalized.match(/^\+(\d+) more$/);
  if (match) return `+${match[1]} pa`;
  return source;
}

Object.assign(FILIPINO_UI, {
  'Register - CSPC Lab & Room Reservation': 'Magparehistro - CSPC Lab at Room Reservation',
  'Log in - CSPC Lab & Room Reservation': 'Mag-log in - CSPC Lab at Room Reservation',
  'Admin Login - CSPC Lab & Room Reservation': 'Admin Login - CSPC Lab at Room Reservation',
  'Dashboard - CSPC Lab & Room Reservation': 'Dashboard - CSPC Lab at Room Reservation',
  'Admin Dashboard - CSPC Lab & Room Reservation': 'Dashboard ng Admin - CSPC Lab at Room Reservation',
  'Room Status - CSPC Lab & Room Reservation': 'Kalagayan ng mga Silid - CSPC Lab at Room Reservation',
  'New Reservation - CSPC Lab & Room Reservation': 'Bagong Pagpapareserba - CSPC Lab at Room Reservation',
  'Management - CSPC Lab & Room Reservation': 'Pamamahala - CSPC Lab at Room Reservation',
  'Page not found - CSPC Lab & Room Reservation': 'Hindi makita ang pahina - CSPC Lab at Room Reservation',
  'Name': 'Pangalan', 'Location': 'Lokasyon', 'Room name': 'Pangalan ng Silid',
  'Building name': 'Pangalan ng Gusali', 'Permission level': 'Antas ng Pahintulot',
  'Temporary password': 'Pansamantalang Password', 'Leave blank to auto-generate': 'Iwanang blangko upang awtomatikong gumawa',
  'Auto-generate password': 'Awtomatikong gumawa ng password',
  'The new admin will be required to change the temporary password on their first successful login.': 'Kailangang palitan ng bagong admin ang pansamantalang password sa unang matagumpay na pag-login.',
  'Create admin': 'Gumawa ng Admin', 'Add new admin': 'Magdagdag ng Bagong Admin', 'Edit administrator': 'I-edit ang Administrator',
  'Add user account': 'Magdagdag ng User Account', 'Add building': 'Magdagdag ng Gusali', 'Add room': 'Magdagdag ng Silid',
  'Save changes': 'I-save ang mga Pagbabago', 'Security check: change password': 'Pagsusuri sa Seguridad: Palitan ang Password',
  'Current temporary password': 'Kasalukuyang Pansamantalang Password', 'New password': 'Bagong Password',
  'Confirm new password': 'Kumpirmahin ang Bagong Password', 'Later': 'Mamaya', 'Update password': 'I-update ang Password',
  'Remarks (optional)': 'Mga Tala (opsyonal)', 'Reason or instruction for the requester': 'Dahilan o tagubilin para sa humiling',
  'Building': 'Gusali', 'Room': 'Silid', 'Name': 'Pangalan', 'Type': 'Uri', 'Capacity': 'Kapasidad',
  'Projector': 'Projector', 'Air-conditioning': 'Aircon', 'Sound system': 'Sound system', 'Active': 'Aktibo',
  'User account': 'User Account', 'At least 8 characters. Leave blank to keep the current password.': 'Hindi bababa sa 8 karakter. Iwanang blangko upang panatilihin ang kasalukuyang password.',
  '(optional on edit)': '(opsyonal kapag nag-e-edit)', '(leave blank to keep current)': '(iwanang blangko upang panatilihin ang kasalukuyan)',
  '(required)': '(kinakailangan)', 'Admin ID': 'Admin ID', 'Assistant Admin': 'Assistant Admin', 'Super Admin': 'Super Admin',
  'Security Notice:': 'Paalala sa Seguridad:', 'Latest 200 requests': 'Pinakabagong 200 kahilingan',
  'In progress': 'Isinasagawa', 'Resolve': 'Lutasin', 'No support tickets submitted yet.': 'Wala pang naipapasang support ticket.',
  'No administrator accounts yet.': 'Wala pang account ng administrator.', 'Unknown user': 'Hindi kilalang user',
  'Room snapshot': 'Buod ng mga Silid', 'Recent activity': 'Kamakailang Aktibidad', 'This week': 'Ngayong linggo',
  'Purpose of use': 'Layunin ng Paggamit', 'Equipment needed': 'Kagamitang Kailangan',
  'Fill in the details below. Requests start as': 'Punan ang mga detalye sa ibaba. Nagsisimula ang mga kahilingan bilang',
  'Select a room to view availability.': 'Pumili ng silid upang makita kung bakante ito.',
  'Select a building to see its rooms.': 'Pumili ng gusali upang makita ang mga silid nito.',
  'Could not load admins': 'Hindi ma-load ang mga admin', 'Could not load support tickets': 'Hindi ma-load ang mga support ticket',
  'Could not load buildings': 'Hindi ma-load ang mga gusali', 'Could not load rooms': 'Hindi ma-load ang mga silid',
  'Could not load users': 'Hindi ma-load ang mga user', 'Could not load reservations': 'Hindi ma-load ang mga pagpapareserba',
  'No reservations match this filter.': 'Walang tumutugmang pagpapareserba sa filter na ito.',
  'The selected file is not a valid JPEG, PNG, or WebP image.': 'Hindi wastong JPEG, PNG, o WebP na larawan ang napiling file.',
  'Choose a JPEG, PNG, or WebP image no larger than 3 MB.': 'Pumili ng JPEG, PNG, o WebP na larawang hindi lalampas sa 3 MB.',
  'Choose a photo before saving.': 'Pumili muna ng larawan bago mag-save.',
  'Building': 'Gusali', 'Admin': 'Admin', 'Support': 'Suporta',
  'That ID number is already registered.': 'Nakarehistro na ang ID number na iyon.',
  'That email address is already registered.': 'Nakarehistro na ang email address na iyon.',
  'ID number or email is required.': 'Kailangan ang ID number o email.',
  'Access denied. Administrator privileges are required.': 'Hindi pinahihintulutan. Kailangan ang pahintulot ng administrator.',
  'Please log in before changing your password.': 'Mag-log in muna bago palitan ang password.',
  'User not found.': 'Hindi mahanap ang user.',
  'Your current password is incorrect.': 'Mali ang kasalukuyang password.',
  'Your new password must be different from the current one.': 'Dapat iba ang bagong password sa kasalukuyang password.',
  'Password updated successfully.': 'Matagumpay na na-update ang password.',
  'A record with those details already exists.': 'Mayroon nang rekord na may ganitong mga detalye.',
  'The selected building does not exist.': 'Wala ang napiling gusali.',
  'An administrator with that ID or email already exists.': 'Mayroon nang administrator na gumagamit ng ID o email na iyon.',
  'Admin ID must match a secure format such as ADMIN-0001.': 'Dapat sumunod ang Admin ID sa ligtas na format gaya ng ADMIN-0001.',
  'Admin email must use the @cspc.edu.ph or @my.cspc.edu.ph domain.': 'Dapat gumamit ang email ng admin ng @cspc.edu.ph o @my.cspc.edu.ph domain.',
  'You cannot change your own Admin ID or permission level.': 'Hindi mo maaaring palitan ang sarili mong Admin ID o antas ng pahintulot.',
  'You cannot deactivate your own active administrator account.': 'Hindi mo maaaring i-deactivate ang sarili mong aktibong administrator account.',
  'You cannot deactivate your own account or change your own role.': 'Hindi mo maaaring i-deactivate ang sarili mong account o palitan ang sarili mong tungkulin.',
  'Please complete all support form fields.': 'Punan ang lahat ng field sa form ng suporta.',
  'Invalid support category selected.': 'Hindi wastong kategorya ng suporta ang napili.',
  'Please do not include passwords or credentials in this form. Contact the IT desk directly if needed.': 'Huwag ilagay ang password o mga kredensyal sa form na ito. Direktang makipag-ugnayan sa IT desk kung kailangan.',
  'Purpose must be 2000 characters or fewer.': 'Dapat 2000 karakter o mas maikli ang layunin.',
  'The selected room does not exist or is no longer available.': 'Wala o hindi na bakante ang napiling silid.',
  'Reservation not found.': 'Hindi mahanap ang pagpapareserba.',
  'This reservation was cancelled and can no longer be decided on.': 'Kinansela na ang pagpapareserbang ito at hindi na maaaring pagdesisyunan.',
  'The reservation conflicts with another approved booking.': 'Sumasalungat ang pagpapareserba sa isa pang naaprubahang booking.',
  'Your support request has been submitted successfully.': 'Matagumpay na naipadala ang iyong kahilingan sa suporta.',
  'Please complete all required fields.': 'Punan ang lahat ng kinakailangang field.',
  'Please select a valid role.': 'Pumili ng wastong tungkulin.',
  'Registration successful.': 'Matagumpay ang pagpaparehistro.',
  'Your profile photo has been updated.': 'Na-update ang larawan ng iyong profile.',
  'Profile photo updated.': 'Na-update ang larawan ng profile.',
  'Profile photo removed.': 'Inalis ang larawan ng profile.',
  'Choose a JPEG, PNG, or WebP image.': 'Pumili ng JPEG, PNG, o WebP na larawan.',
  'The avatar must be 3 MB or smaller.': 'Dapat 3 MB o mas maliit ang larawan sa profile.',
  'Select an avatar image to upload.': 'Pumili ng larawang ia-upload para sa profile.',
  'Your account could not be found.': 'Hindi mahanap ang iyong account.',
  'is_active must be true or false.': 'Dapat true o false ang is_active.',
  'A room name is required.': 'Kailangan ang pangalan ng silid.',
  'A building name is required.': 'Kailangan ang pangalan ng gusali.',
  'ID number may only contain letters, digits and dashes (4-50 characters).': 'Mga titik, numero, at gitling lamang ang maaaring gamitin sa ID number (4–50 karakter).',
  'Password must be at least 8 characters long.': 'Dapat hindi bababa sa 8 karakter ang password.',
  'Password must be 72 characters or fewer.': 'Dapat 72 karakter o mas maikli ang password.',
  'Please enter a valid email address.': 'Maglagay ng wastong email address.',
  'The date cannot be in the past.': 'Hindi maaaring nakaraan na ang petsa.',
  'The res_date cannot be in the past.': 'Hindi maaaring nakaraan na ang petsa ng pagpapareserba.',
  'date must be in YYYY-MM-DD format.': 'Dapat nasa YYYY-MM-DD na format ang petsa.',
  'date is not a valid calendar date.': 'Hindi wastong petsa sa kalendaryo ang petsa.',
  'time must be in HH:MM (24-hour) format.': 'Dapat nasa HH:MM (24-oras) na format ang oras.',
  'Please log in before changing your password.': 'Mag-log in muna bago palitan ang password.',
  'You cannot change your own Admin ID or permission level.': 'Hindi mo maaaring palitan ang sarili mong Admin ID o antas ng pahintulot.',
  'That email address belongs to another account.': 'Pag-aari ng ibang account ang email address na iyon.',
  'Could not load the requested data.': 'Hindi ma-load ang hinihinging datos.',
  'CSPC Lab & Room Reservation': 'CSPC Lab at Pagpapareserba ng Silid',
  'CSPC Lab & Room Reservation System · Computer Studies Department': 'Sistema ng CSPC para sa Lab at Pagpapareserba ng Silid · Departamento ng Computer Studies',
  'Secure backend access for system administrators.': 'Ligtas na access para sa mga system administrator.',
  'Secure access for authorized administrators only.': 'Ligtas na access para lamang sa mga awtorisadong administrator.',
  'User Portal': 'Portal ng User', 'System overview': 'Pangkalahatang-ideya ng sistema',
  'Current request activity': 'Kasalukuyang aktibidad ng kahilingan', 'Room status': 'Kalagayan ng Silid',
  'All buildings': 'Lahat ng gusali', 'Show deactivated': 'Ipakita ang mga naka-deactivate',
  'Show resource counts': 'Ipakita ang bilang ng mga resource', 'Administrator access': 'Access ng Administrator',
  'My reservations': 'Aking mga pagpapareserba', 'All reservation requests': 'Lahat ng kahilingan sa pagpapareserba',
  'Open': 'Bukas', 'In Progress': 'Isinasagawa', 'Resolved': 'Nalutas', 'No support tickets submitted yet.': 'Wala pang naipapasang support ticket.',
  'Change password': 'Palitan ang password', 'Create a building first.': 'Gumawa muna ng gusali.',
  'Could not load admins': 'Hindi ma-load ang mga admin', 'Could not load support tickets': 'Hindi ma-load ang mga support ticket',
  'Current temporary password': 'Kasalukuyang pansamantalang password', 'Temporary password': 'Pansamantalang password',
  'The selected building does not exist.': 'Wala ang napiling gusali.', 'This building has rooms and cannot be deleted.': 'May mga silid ang gusaling ito kaya hindi ito matatanggal.'
});

Object.assign(FILIPINO_UI, {
  'Welcome - CSPC Lab & Room Reservation': 'Maligayang Pagdating - CSPC Lab at Room Reservation',
  'Find the right space.': 'Hanapin ang tamang lugar.', 'Make every session count.': 'Gawing makabuluhan ang bawat sesyon.',
  'Check room availability, request a laboratory or venue, and keep your campus activities organized—all in one place.': 'Tingnan ang bakanteng silid, humiling ng laboratoryo o lugar, at ayusin ang mga aktibidad sa campus—lahat sa iisang portal.',
  'Sign in to get started': 'Mag-sign in upang magsimula', 'Open your dashboard →': 'Buksan ang iyong dashboard →',
  'Open admin dashboard →': 'Buksan ang dashboard ng admin →', 'Explore room status': 'Tingnan ang kalagayan ng mga silid',
  'Designed for students, faculty, custodians, and administrators': 'Para sa mga mag-aaral, guro, tagapangasiwa, at administrator',
  'Clear availability': 'Malinaw na availability', 'Easy request tracking': 'Madaling pagsubaybay sa kahilingan',
  'Check availability': 'Tingnan ang Availability', 'See room schedules before you plan your activity.': 'Tingnan ang iskedyul ng silid bago planuhin ang iyong aktibidad.',
  'Request a space': 'Humiling ng Lugar', 'Send your reservation details for staff review.': 'Ipadala ang mga detalye ng pagpapareserba para masuri ng staff.',
  'Track every request': 'Subaybayan ang Bawat Kahilingan', 'Follow approval updates from your dashboard.': 'Subaybayan ang mga update sa pag-apruba mula sa iyong dashboard.',
  'Explore campus': 'Tuklasin ang Campus', 'Spaces for your next big idea': 'Mga lugar para sa susunod mong malaking ideya',
  'View room status': 'Tingnan ang kalagayan ng silid', 'Before you book': 'Bago Magpareserba',
  'A few things to keep in mind': 'Ilang bagay na dapat tandaan',
  'Help keep CSPC learning spaces ready and welcoming for everyone.': 'Tulungan panatilihing handa at maayos para sa lahat ang mga lugar-pagkatuto ng CSPC.',
  'Submit your request in advance with an accurate purpose and attendee count.': 'Isumite nang maaga ang kahilingan at ilagay ang wastong layunin at bilang ng mga dadalo.',
  'Wait for approval before using a room; requests are not confirmed bookings.': 'Hintayin ang pag-apruba bago gamitin ang silid; hindi pa kumpirmadong booking ang kahilingan.',
  'Use equipment responsibly and leave the space clean and ready for others.': 'Gamitin nang maayos ang kagamitan at iwanang malinis at handa para sa iba ang lugar.',
  'Ready when you are': 'Handa na kapag handa ka na', 'Let’s make room for what’s next.': 'Maglaan tayo ng lugar para sa susunod.',
  'Create an account': 'Gumawa ng Account', 'Campus building information will appear here soon.': 'Malapit nang lumabas dito ang impormasyon tungkol sa mga gusali sa campus.',
  'Building highlights are temporarily unavailable. You can still view live room status.': 'Pansamantalang hindi makita ang mga gusali. Maaari mo pa ring tingnan ang live na kalagayan ng mga silid.',
  'CSPC campus facilities': 'Mga Pasilidad ng Campus ng CSPC',
  'Learning spaces': 'Mga Lugar-Pagkatuto', 'Labs, classrooms & venues': 'Mga laboratoryo, silid-aralan at lugar',
  'One simple reservation portal': 'Isang madaling portal ng pagpapareserba', 'Log in': 'Mag-log in',
  'Home': 'Simula',
  'Buildings': 'Mga Gusali',
  'FAQ / Support': 'FAQ / Suporta', 'CSPC facilities': 'Mga Pasilidad ng CSPC',
  'Explore campus buildings and the rooms available for reservation.': 'Tingnan ang mga gusali sa campus at ang mga silid na maaaring ipareserba.',
  'active rooms': 'aktibong silid', 'View Room Status': 'Tingnan ang Kalagayan ng mga Silid',
  'Laboratory and room guidelines': 'Mga Alituntunin sa Laboratoryo at Silid',
  'Submit reservations in advance and provide an accurate purpose and attendee count.': 'Magpareserba nang maaga at magbigay ng wastong layunin at bilang ng mga dadalo.',
  'Wait for approval before using a room; a submitted request is not a confirmed booking.': 'Hintayin ang pag-apruba bago gamitin ang silid; hindi pa kumpirmadong booking ang isinumiteng kahilingan.',
  'Keep rooms, equipment, and furniture in good condition, and leave the space clean.': 'Ingatan ang mga silid, kagamitan, at muwebles, at panatilihing malinis ang lugar.',
  'Report damage or access concerns to the assigned custodian or administrator.': 'Iulat sa nakatalagang tagapangasiwa o administrator ang anumang sira o suliranin sa pag-access.',
  'No building information is available yet.': 'Wala pang impormasyon tungkol sa mga gusali.',
  'CSPC campus': 'Kampus ng CSPC', 'Loading buildings...': 'Naglo-load ng mga gusali...',
  'Loading campus buildings…': 'Naglo-load ng mga gusali sa campus…',
  'Camarines Sur Polytechnic Colleges official seal': 'Opisyal na selyo ng Camarines Sur Polytechnic Colleges',
  'Edit profile photo': 'I-edit ang larawan sa profile', 'IT Support / Help desk tickets': 'Mga Ticket sa IT Support / Tanggapan ng Tulong',
  'Live inventory and user overview': 'Live na imbentaryo at pangkalahatang-ideya ng mga user',
  'Login mode selector': 'Tagapili ng paraan ng pag-login', 'Support links': 'Mga link ng suporta',
  'User': 'Gumagamit', 'and are reviewed by the custodian or administrator.': 'at susuriin ng tagapangasiwa o administrator.',
  'e.g. Capstone project consultation with the adviser (at least 10 characters)': 'hal. Konsultasyon sa capstone project kasama ang tagapayo (hindi bababa sa 10 karakter)',
  'e.g. Maria Dela Cruz': 'hal. Maria Dela Cruz',
  'Extension Cord': 'Extension Cord', 'Aircon Access': 'Paggamit ng Aircon', 'Microphone': 'Mikropono',
  'Whiteboard Markers': 'Mga Marker sa Whiteboard', 'Deactivate': 'I-deactivate',
  'Deactivate account': 'I-deactivate ang account', 'Reactivate': 'Muling I-activate',
  'Mark as resolved': 'Markahang nalutas', 'No user accounts yet.': 'Wala pang user account.',
  'No buildings found.': 'Walang nakitang gusali.', 'No rooms found for this building.': 'Walang nakitang silid sa gusaling ito.',
  'Select a room...': 'Pumili ng silid...', 'Choose a building first': 'Pumili muna ng gusali',
  'Show inactive rooms': 'Ipakita ang mga hindi aktibong silid', 'Reservation request': 'Kahilingan sa pagpapareserba',
  'Admin sections': 'Mga seksyon ng Admin', 'Statistics': 'Mga Istatistika', 'Inventory': 'Imbentaryo',
  'Loading buildings...': 'Naglo-load ng mga gusali...', 'Loading users...': 'Naglo-load ng mga user...',
  'Loading reservations...': 'Naglo-load ng mga pagpapareserba...', 'Loading availability...': 'Sinusuri ang availability...',
  'No active rooms in this building': 'Walang aktibong silid sa gusaling ito',
  'Select a building to see its rooms.': 'Pumili ng gusali upang makita ang mga silid nito.',
  'No account yet? Register here': 'Wala pang account? Magparehistro dito',
  'Return to User Login': 'Bumalik sa Pag-login ng User', 'User Login': 'Pag-login ng User',
  'Admin Login': 'Pag-login ng Admin', 'Administrator Portal': 'Portal ng Administrator',
  'Enter your Admin ID or Email': 'Ilagay ang iyong Admin ID o email',
  'e.g. name@cspc.edu.ph or 09XX-XXX-XXXX': 'hal. name@cspc.edu.ph o 09XX-XXX-XXXX',
  'e.g. 2021-00123 or name@cspc.edu.ph': 'hal. 2021-00123 o name@cspc.edu.ph',
  'Student, Faculty, System Admin': 'Mag-aaral, Guro, System Admin',
  'Optional': 'Opsyonal', 'At least 8 characters': 'Hindi bababa sa 8 karakter',
  'At least 8 characters.': 'Hindi bababa sa 8 karakter.', 'Current request activity': 'Kasalukuyang aktibidad ng kahilingan',
  'Latest 200 requests': 'Pinakabagong 200 kahilingan', 'All reservation requests': 'Lahat ng kahilingan sa pagpapareserba',
  'Reservations': 'Mga Pagpapareserba', 'View Pending': 'Tingnan ang Nakabinbin', 'Manage Users': 'Pamahalaan ang mga User',
  'Recent activity': 'Kamakailang Aktibidad', 'Room snapshot': 'Buod ng mga Silid', 'This week': 'Ngayong linggo',
  'System Resources & User Breakdown': 'Mga Resource ng Sistema at Pagkakahati ng mga User',
  'No administrator accounts yet.': 'Wala pang account ng administrator.',
  'Could not load support tickets': 'Hindi ma-load ang mga support ticket', 'Could not load admins': 'Hindi ma-load ang mga admin',
  'Loading': 'Naglo-load', 'Create an account': 'Gumawa ng account', 'Already registered?': 'May account ka na ba?',
  'Save photo': 'I-save ang larawan', 'Uploading…': 'Nag-a-upload…', 'Remove photo': 'Alisin ang larawan',
  'System status': 'Kalagayan ng sistema', 'Dashboard': 'Dashboard', 'User dashboard': 'Dashboard ng User',
  'No active rooms found.': 'Walang nakitang aktibong silid.', 'No rooms found.': 'Walang nakitang silid.',
  'No buildings yet. Add the first one.': 'Wala pang gusali. Idagdag ang unang gusali.',
  'No user accounts match this filter.': 'Walang tumutugmang user account sa filter na ito.',
  'The room capacity is too small for the number of attendees.': 'Masyadong maliit ang kapasidad ng silid para sa bilang ng mga dadalo.',
  'Booking': 'Pagpapareserba', 'Approval': 'Pag-apruba', 'Equipment': 'Kagamitan',
  'A request with these details already exists.': 'Mayroon nang kahilingang may ganitong mga detalye.',
  'Please enter a valid date.': 'Maglagay ng wastong petsa.', 'Please select a building.': 'Pumili ng gusali.',
  'The end time must be after the start time.': 'Dapat mas huli ang oras ng pagtatapos kaysa oras ng pagsisimula.',
  'Invalid ID number, email, or password.': 'Mali ang ID number, email, o password.',
  'This account has been deactivated. Please contact the administrator.': 'Na-deactivate ang account na ito. Makipag-ugnayan sa administrator.',
  'Invalid email address.': 'Hindi wastong email address.', 'Password must be at least 8 characters.': 'Dapat hindi bababa sa 8 karakter ang password.',
  'Password updated successfully.': 'Matagumpay na na-update ang password.', 'Building created.': 'Nagawa ang gusali.',
  'Room created.': 'Nagawa ang silid.', 'User created.': 'Nagawa ang user account.',
  'Changes saved.': 'Na-save ang mga pagbabago.', 'Deleted.': 'Natanggal na.',
  'For security, sign in again.': 'Para sa seguridad, mag-sign in muli.',
  'Please complete all fields before submitting your support request.': 'Punan ang lahat ng field bago isumite ang kahilingan sa suporta.',
  'Please do not include passwords or credentials in this form. Contact the IT desk directly by phone or email if needed.': 'Huwag ilagay ang password o mga kredensyal sa form na ito. Tawagan o i-email nang direkta ang IT desk kung kailangan.',
  'Your support request was submitted successfully.': 'Matagumpay na naipadala ang iyong kahilingan sa suporta.',
  'Unable to submit your support request right now.': 'Hindi maisumite ang iyong kahilingan sa suporta sa ngayon.',
  'Authenticating...': 'Pinatutunayan ang pagkakakilanlan...', 'Signing in...': 'Nagla-sign in...',
  'Reservation submitted. It is now Pending for custodian approval.': 'Naipadala ang kahilingan. Nakabinbin ito para sa pag-apruba ng tagapangasiwa.',
  'The selected room does not exist or is no longer available.': 'Wala o hindi na bakante ang napiling silid.',
  'Purpose must be 2000 characters or fewer.': 'Dapat 2000 karakter o mas maikli ang layunin.'
});

/* --------------------------------------------------------------- i18n batch ---
   Remaining untranslated UI strings, added via Object.assign so later entries
   win over the base dictionary above. Chunk 1: titles, hero, search widget. */
Object.assign(FILIPINO_UI, {
  'Welcome - CSPC Lab & Room Reservation': 'Maligayang Pagdating - CSPC Lab at Room Reservation',
  'Room Status - CSPC Lab & Room Reservation': 'Kalagayan ng mga Silid - CSPC Lab at Room Reservation',
  'New Reservation - CSPC Lab & Room Reservation': 'Bagong Pagpapareserba - CSPC Lab at Room Reservation',
  'Page not found - CSPC Lab & Room Reservation': 'Hindi Makita ang Pahina - CSPC Lab at Room Reservation',
  'Management - CSPC Lab & Room Reservation': 'Pamamahala - CSPC Lab at Room Reservation',
  'CSPC Lab & Room Reservation System · Computer Studies Department': 'CSPC Lab at Room Reservation System · Computer Studies Department',
  'Find the right space.': 'Mahanap ang tamang lugar.',
  'Make every session count.': 'Gawing makabuluhan ang bawat sesyon.',
  'Check room availability, request a laboratory or venue, and keep your campus activities organized—all in one place.': 'Tingnan ang availability ng silid, humiling ng laboratoryo o lugar, at panatiling organisado ang iyong mga aktibidad sa campus—isang lugar lamang.',
  'Sign in to get started': 'Mag-log in upang magsimula',
  'Designed for students, faculty, custodians, and administrators': 'Dinisenyo para sa mga mag-aaral, guro, tagapangasiwa, at administrator',
  'Live learning spaces preview': 'Live preview ng mga lugar na pangkatuto',
  '12+ Rooms Available Now': '12+ Bakanteng Silid Ngayon',
  'Live preview loading…': 'Naglo-load ang live preview…',
  'ROOM AVAILABILITY': 'AVAILABILITY NG MGA SILID',
  'Explore room status': 'Tingnan ang kalagayan ng silid',
  'Quick check · no login': 'Mabilis na suriin · hindi kailangan ng login',
  "See what's free before you sign in": 'Tingnan kung ano ang bakante bago mag-log in',
  'Pick a date, time slot and building to preview live availability across campus.': 'Pumili ng petsa, time slot, at gusali upang makita ang live availability sa buong campus.',
  'Time slot': 'Time slot',
  'Any time': 'Anumang oras',
  'Morning · 7:00–10:00 AM': 'Umaga · 7:00–10:00 NG',
  'Midday · 10:00 AM–1:00 PM': 'Tanghali · 10:00 NG–1:00 HN',
  'Afternoon · 1:00–4:00 PM': 'Hapon · 1:00–4:00 HN',
  'Evening · 4:00–7:00 PM': 'Gabi · 4:00–7:00 HN',
  'All buildings': 'Lahat ng gusali',
  'Check availability': 'Suriin ang availability',
  'No active rooms are listed for that building yet. Try another building.': 'Walang nakalista na aktibong silid sa gusaling iyon. Subukan ang ibang gusali.',
  'No rooms are open for': 'Walang bakanteng silid para sa',
  'No rooms are open all day on': 'Walang bakanteng silid sa buong araw noong',
  '. Try a different time or building.': '. Subukan ang ibang oras o gusali.',
  'for': 'para sa',
  'all day on': 'buong araw noong'
});

/* i18n batch - chunk 2: feature cards, live status, how it works. */
Object.assign(FILIPINO_UI, {
  'Portal benefits': 'Mga benepisyo ng portal',
  'See room schedules before you plan your activity.': 'Tingnan ang iskedyul ng silid bago magplano ng aktibidad.',
  'Request a space': 'Humiling ng lugar',
  'Send your reservation details for staff review.': 'Magpadala ng detalye ng iyong pagpapareserba para sa pagsusuri ng staff.',
  'Track every request': 'Subaybayan ang bawat kahilingan',
  'Follow approval updates from your dashboard.': 'Sundan ang mga update sa pag-apruba mula sa iyong dashboard.',
  'Live now': 'Live ngayon',
  'High-demand spaces at a glance': 'Mga high-demand na lugar sa isang sulyap',
  'Full timetable': 'Buong iskedyul',
  'Checking live room availability…': 'Sinasuri ang live na availability ng silid…',
  'No active rooms to show right now.': 'Walang aktibong silid na maipapakita sa ngayon.',
  'Live availability is temporarily unavailable. Open the full timetable to check rooms.': 'Hindi maa-access ang live availability pansamantala. Buksan ang buong iskedyul upang suriin ang mga silid.',
  'Open now:': 'Bukas ngayon:',
  'All rooms have bookings today — check another date.': 'Lahat ng silid ay may bookings ngayon — tingnan ang ibang petsa.',
  'How it works': 'Ganoon ito gumagana',
  'Book a space in three simple steps': 'Mag-book ng lugar sa tatlong hakbang',
  'From search to approval, everything stays in one place.': 'Mula sa paghahanap hanggang sa pag-apruba, nasa isang lugar ang lahat.',
  'Search a room': 'Maghanap ng silid',
  'Filter by building, date and time to find a free laboratory, classroom or hall.': 'Mag-filter ayon sa gusali, petsa, at oras upang makahanap ng bakanteng laboratoryo, silid-aralan, o bulwagan.',
  'Choose your time': 'Pumili ng oras',
  'Pick the slot that fits your activity and note the equipment you need.': 'Pumili ng slot na angkop sa iyong aktibidad at tukuyin ang kagamitan na kailangan.',
  'Send it for staff review and track the approval from your dashboard.': 'Ipadala ito para sa pagsusuri ng staff at subaybayan ang pag-apruba mula sa iyong dashboard.',
  'Get started': 'Magsimula',
  'Browse availability': 'I-browse ang availability'
});

/* i18n batch - chunk 3: featured buildings, guidelines, feedback, footer. */
Object.assign(FILIPINO_UI, {
  'Featured spaces': 'Mga tampok na lugar',
  'Popular spaces on campus': 'Mga tanyag na lugar sa campus',
  'Show all buildings': 'Ipakita ang lahat ng gusali',
  'Show less': 'Ipakita ng mas kaunti',
  'Loading campus buildings…': 'Naglo-load ang mga gusali sa campus…',
  'Campus building information will appear here soon.': 'Lalabas dito ang impormasyon tungkol sa mga gusali sa campus sa lalong madaling panahon.',
  'View room status': 'Tingnan ang kalagayan ng silid',
  'CSPC campus': 'Campus ng CSPC',
  'Before you book': 'Bago ka mag-book',
  'A few things to keep in mind': 'Mga bagay na dapat tandaan',
  'Help keep CSPC learning spaces ready and welcoming for everyone.': 'Tulungan na panatilihing handa at malugod ang mga lugar-pagkatuto ng CSPC para sa lahat.',
  'Submit your request in advance with an accurate purpose and attendee count.': 'Isumite ang iyong kahilingan nang maaga na may tamang layunin at bilang ng mga dadalo.',
  'Wait for approval before using a room; requests are not confirmed bookings.': 'Hintayin ang pag-apruba bago gamitin ang silid; ang mga kahilingan ay hindi pa kumpirmadong booking.',
  'Use equipment responsibly and leave the space clean and ready for others.': 'Gumamit ng kagamitan nang responsable at iwanang malinis at handa ang lugar para sa iba.',
  'User feedback': 'Feedback ng user',
  'Help us improve': 'Tulungan kaming pagbutihin ang',
  'by sending your experience feedback': 'sa pamamagitan ng pagpapadala ng iyong feedback sa karanasan',
  'We value your feedback': 'Pinapahalagahan namin ang iyong feedback',
  'Share your experience': 'Ibahagi ang iyong karanasan',
  'Subject': 'Paksa',
  'How can we improve?': 'Paano namin ito mapapabuti?',
  'Your feedback': 'Ang iyong feedback',
  'Tell us what worked well and what can be improved.': 'Sabihin sa amin kung ano ang naging maayos at kung ano pa ang dapat pagbutihin.',
  'Send feedback': 'Ipadala ang feedback',
  'Site footer': 'Footer ng site',
  'Contact us': 'Makipag-ugnayan sa amin',
  'Contact channels': 'Mga channel ng kontak',
  'Phone': 'Telepono',
  'Follow us': 'Sundan kami',
  'Social media': 'Mga social media',
  'You are not logged in.': 'Hindi ka naka-log in.',
  '(Log in)': '(Mag-log in)',
  'Get the mobile app': 'Kunin ang mobile app',
  'GET IT ON': 'KUHAIN SA',
  'Download on the': 'I-download sa',
  'Get it on Google Play': 'Kunin sa Google Play',
  'Download on the App Store': 'I-download sa App Store'
});

/* i18n batch - chunk 4: login modal + password-recovery flow. */
Object.assign(FILIPINO_UI, {
  'Hello': 'Kumusta',
  'Log in to your account': 'Mag-log in sa iyong account',
  'School ID or CSPC email address': 'School ID o CSPC email address',
  'e.g. 2021-00123 or name@cspc.edu.ph': 'hal. 2021-00123 o name@cspc.edu.ph',
  'School ID or CSPC mail': 'School ID o CSPC mail',
  'Admin ID or email': 'Admin ID o email',
  'Enter your Admin ID or Email': 'Ilagay ang iyong Admin ID o Email',
  'or': 'o',
  'Sign in with CSPC Google Account': 'Mag-sign in gamit ang CSPC Google Account',
  'New to the portal?': 'Bago sa portal?',
  'Reset your password': 'I-reset ang iyong password',
  'Verify your email': 'I-verify ang iyong email',
  'Choose a new password': 'Pumili ng bagong password',
  "Enter your School ID or your @cspc.edu.ph / @my.cspc.edu.ph email and we'll send a 6-digit verification code to your registered email.": 'Ilagay ang iyong School ID o ang @cspc.edu.ph / @my.cspc.edu.ph email mo at magpapadala kami ng 6-digit na verification code sa iyong naka-register na email.',
  'Enter your School ID or CSPC email address.': 'Ilagay ang iyong School ID o CSPC email address.',
  'CSPC email address': 'CSPC email address',
  'Send verification code': 'Ipadala ang verification code',
  '← Back to log in': '← Bumalik sa pag-log in',
  'We sent a 6-digit code to': 'Nagpadala kami ng 6-digit na code sa',
  '. Enter it below before it expires.': '. Ilagay ito sa ibaba bago ito mag-expire.',
  'Verification code': 'Verification code',
  'Verify code': 'I-verify ang code',
  "Didn't receive the code?": 'Hindi natanggap ang code?',
  'Resend code': 'Ipadala muli ang code',
  'Use a different email': 'Gamitin ang ibang email',
  'Back to log in': 'Bumalik sa pag-log in',
  'Choose a new password for': 'Pumili ng bagong password para sa',
  'New password': 'Bagong password',
  'Confirm new password': 'Kumpirmahin ang bagong password',
  'At least 8 characters': 'Hindi bababa sa 8 karakter',
  'Repeat new password': 'Ulitin ang bagong password',
  'Reset password': 'I-reset ang password',
  'Enter a valid email address (e.g. name@cspc.edu.ph).': 'Maglagay ng wastong email address (hal. name@cspc.edu.ph).',
  'Please use your official @cspc.edu.ph or @my.cspc.edu.ph email address.': 'Gamitin ang iyong opisyal na @cspc.edu.ph o @my.cspc.edu.ph email address.',
  'Enter the 6-digit code from your email.': 'Ilagay ang 6-digit na code mula sa iyong email.',
  'Password must be at least 8 characters long.': 'Dapat hindi bababa sa 8 karakter ang password.',
  'Passwords do not match.': 'Hindi magkapareho ang mga password.',
  'Heads up: email delivery is not configured on this server, so no email was sent. The 6-digit code was printed in the server console - check with the developer for the code.': 'Paalala: hindi naka-configure ang email delivery sa server na ito, kaya walang naipadalang email. Nasa server console ang 6-digit na code—humingi ng code sa developer.',
  'A 6-digit code was sent to your email.': 'Nagpadala kami ng 6-digit na code sa iyong email.',
  'Email delivery is not configured on this server, so no email was sent. The new code was printed in the server console.': 'Hindi naka-configure ang email delivery sa server na ito, kaya walang naipadalang email. Nasa server console ang bagong code.',
  'A new code was sent to your email.': 'Nagpadala kami ng bagong code sa iyong email.',
  'Your password has been reset. You can now log in.': 'Na-reset na ang iyong password. Maaari ka nang mag-log in.'
});

/* i18n batch - chunk 5: registration modals, Google SSO, busy labels. */
Object.assign(FILIPINO_UI, {
  'Join the portal': 'Sumali sa portal',
  'Create your account': 'Gumawa ng iyong account',
  'Students and faculty can register here. Staff accounts are issued by an administrator.': 'Maaaring mag-register dito ang mga mag-aaral at guro. Ang mga staff account ay ibinibigay ng administrator.',
  '(optional)': '(opsyonal)',
  '(optional on edit)': '(opsyonal sa pag-edit)',
  'Use at least 8 characters.': 'Gumamit ng hindi bababa sa 8 karakter.',
  'Create an admin account': 'Gumawa ng admin account',
  'Admin only': 'Para lamang sa admin',
  'Administrator accounts are protected. Use the enrollment code issued by a Super Admin — students and faculty should use the regular registration form.': 'Protektado ang mga administrator account. Gamitin ang enrollment code na ibinigay ng Super Admin—ang mga mag-aaral at guro ay gumamit ng normal na registration form.',
  'Administrator profile': 'Profile ng Administrator',
  'Admin ID number': 'Admin ID number',
  'Must use the official @cspc.edu.ph / @my.cspc.edu.ph domain.': 'Dapat gamitin ang opisyal na @cspc.edu.ph / @my.cspc.edu.ph domain.',
  'Enrollment & security': 'Enrollment at seguridad',
  'Enrollment code': 'Enrollment code',
  'Issued by a Super Admin': 'Ibinigay ng Super Admin',
  'Required — admin accounts cannot be created without it.': 'Kinakailangan—hindi makagagawa ng admin account nang wala ito.',
  'Admin level': 'Antas ng admin',
  'Create admin account': 'Gumawa ng admin account',
  'ID number may only contain letters, digits and dashes (4-50 characters).': 'Mga letra, numero, at dash lamang ang pinapayagan sa ID number (4-50 karakter).',
  'Full name must be between 3 and 120 characters.': 'Dapat 3 hanggang 120 karakter ang buong pangalan.',
  'Password must be between 8 and 72 characters.': 'Dapat 8 hanggang 72 karakter ang password.',
  'The two passwords do not match.': 'Hindi magkapareho ang dalawang password.',
  'Registration successful.': 'Matagumpay ang pagpaparehistro.',
  'Administrator access is required.': 'Kinakailangan ang access ng administrator.',
  'Admin ID must match a secure format such as ADMIN-0001.': 'Dapat katulad ng ADMIN-0001 ang format ng Admin ID.',
  'Admin email must use the @cspc.edu.ph or @my.cspc.edu.ph domain.': 'Dapat gamitin ng admin email ang @cspc.edu.ph o @my.cspc.edu.ph domain.',
  'Enter the enrollment code issued by a Super Admin.': 'Ilagay ang enrollment code na ibinigay ng Super Admin.',
  'Administrator account created.': 'Nagawa ang account ng administrator.',
  'Google sign-in was cancelled. You can try again or use your school ID instead.': 'Kinansela ang Google sign-in. Maaari kang sumubok muli o gumamit ng school ID.',
  'Google sign-in is not configured yet. Please use your school ID and password until the SSO provider is set up.': 'Hindi pa naka-configure ang Google sign-in. Gamitin ang school ID at password hanggang nakasetup ang SSO provider.',
  'Please sign in with your official CSPC Google account (@cspc.edu.ph or @my.cspc.edu.ph).': 'Mag-sign in gamit ang iyong opisyal na CSPC Google account (@cspc.edu.ph o @my.cspc.edu.ph).',
  'Access denied. Administrator privileges are required.': 'Tinanggihan ang access. Kinakailangan ang pribilehiyo ng administrator.',
  'Google sign-in could not be completed. Please log in with your school ID and password.': 'Hindi natapos ang Google sign-in. Mag-log in gamit ang school ID at password.',
  'Sending code...': 'Nagpapadala ng code...',
  'Verifying...': 'Nivi-verify...',
  'Saving...': 'Nase-save...',
  'Creating account...': 'Ginagawa ang account...',
  'Creating admin account...': 'Ginagawa ang admin account...',
  'Checking...': 'Sinasuri...',
  'Refreshing...': 'Nire-refresh...',
  'Open admin dashboard →': 'Buksan ang admin dashboard →',
  'Open your dashboard →': 'Buksan ang iyong dashboard →',
  'Checking Live Availability…': 'Sinasuri ang Live na Availability…'
});

/* i18n batch - chunk 6: cookie banner, rooms-status, dashboard/admin pages. */
Object.assign(FILIPINO_UI, {
  'Cookie consent': 'Pahintulot sa cookie',
  'Cookies on this portal': 'Mga cookie sa portal na ito',
  'We use cookies to keep you signed in and to remember your choices. Essential cookies are always active because the portal cannot work without them. With your consent, we may also use cookies to understand how the site is used and improve your experience.': 'Gumagamit kami ng cookie upang panatilihing naka-sign in ka at upang alalahanin ang iyong mga pinili. Laging aktibo ang mga mahahalagang cookie dahil hindi gumagana ang portal nang wala ang mga ito. Sa iyong pahintulot, maaari kaming gumamit ng cookie upang maunawaan kung paano ginagamit ang site at mapabuti ang iyong karanasan.',
  'Decline': 'Tumanggi',
  'Accept cookies': 'Tanggapin ang mga cookie',
  'Cookie settings': 'Mga setting ng cookie',
  'Space type': 'Uri ng silid',
  'All types': 'Lahat ng uri',
  'Hall / Venue': 'Bulwagan / Lugar',
  'Office / Study Pod': 'Opisina / Study Pod',
  'Edit profile photo': 'I-edit ang larawan ng profile',
  'Statistics': 'Mga istatistika',
  'Inventory': 'Imbentaryo',
  'e.g. Capstone project consultation with the adviser (at least 10 characters)': 'hal. Konsultasyon sa tagapayo tungkol sa capstone project (hindi bababa sa 10 karakter)',
  'and are reviewed by the custodian or administrator.': 'at sinusuri ng tagapangasiwa o administrator.',
  'Loading buildings...': 'Naglo-load ng mga gusali...',
  'Camarines Sur Polytechnic Colleges official seal': 'Opisyal na seal ng Camarines Sur Polytechnic Colleges',
  'Support links': 'Mga link sa suporta',
  'Secure backend access for system administrators.': 'Ligtas na backend access para sa mga administrator ng sistema.',
  'Secure access for authorized administrators only.': 'Ligtas na access para lamang sa mga awtorisadong administrator.',
  'Return to User Login': 'Bumalik sa User Login',
  'Admin sections': 'Mga seksyon ng admin',
  'Live inventory and user overview': 'Live na imbentaryo at pangkalahatang-ideya ng mga user',
  'Leave blank to auto-generate': 'Iwanang blangko upang awtomatikong gumawa',
  'User': 'User',
  'IT Support / Help desk tickets': 'IT Support / Mga ticket sa help desk',
  'Add new admin': 'Magdagdag ng bagong admin',
  'Permission level': 'Antas ng pahintulot',
  'Temporary password': 'Pansamantalang password',
  'Auto-generate password': 'Awtomatikong gumawa ng password',
  'The new admin will be required to change the temporary password on their first successful login.': 'Kailangang palitan ng bagong admin ang pansamantalang password sa kanyang unang matagumpay na pag-log in.',
  'Create admin': 'Gumawa ng admin',
  'Security check: change password': 'Suriin ang seguridad: palitan ang password',
  'Current temporary password': 'Kasalukuyang pansamantalang password',
  'Later': 'Mamaya',
  'Update password': 'I-update ang password',
  'Your new password and confirmation do not match.': 'Hindi magkapareho ang iyong bagong password at kumpirmasyon.'
});

/* i18n batch - chunk 7: live status card labels + misc. */
Object.assign(FILIPINO_UI, {
  'LIVE': 'LIVE',
  'Booked': 'Naka-book',
  'Free': 'Bakante',
  'Open in this slot': 'Bakante sa slot na ito',
  'Occupied': 'Okupado',
  'Available': 'Bakante',
  'Limited': 'Limitado',
  'Space': 'Lugar',
  'on': 'noong',
  'Floor': 'Palapag',
  'Photo URL': 'URL ng Larawan',
  'e.g. 2nd Floor': 'hal. Ikalawang Palapag',
  '2nd Floor': 'Ikalawang Palapag',
  '3rd Floor': 'Ikatlong Palapag'
});

/* i18n batch - chunk 8: leftover labels. Brand names (Facebook, Google Play,
   Hornet…) are intentionally kept in English; identity mappings below just
   document that so future audits stay clean. */
Object.assign(FILIPINO_UI, {
  'Repeat your password': 'Ulitin ang iyong password.',
  'Website': 'Website',
  'e.g. ADMIN-0001': 'hal. ADMIN-0001',
  'e.g. Computer Engineering': 'hal. Computer Engineering',
  'Administration': 'Administrasyon',
  'Facebook': 'Facebook',
  'Twitter / X': 'Twitter / X',
  'Instagram': 'Instagram',
  'Google Play': 'Google Play',
  'App Store': 'App Store',
  'Hornet': 'Hornet',
  'name@cspc.edu.ph': 'name@cspc.edu.ph',
  'you@cspc.edu.ph': 'you@cspc.edu.ph',
  '000000': '000000',
  'ADMIN-0001': 'ADMIN-0001',
  'f': 'f',
  'X': 'X'
});

const originalTranslateUiValue = translatedUiValue;
translatedUiValue = function (source) {
  if (portalLocale !== 'fil-PH') return source;
  const text = String(source).trim().replace(/\s+/g, ' ');
  let match = text.match(/^Missing required field\(s\): (.+)$/);
  if (match) return `Kulang ang kinakailangang field: ${match[1]}`;
  match = text.match(/^(date|res_date) must be in YYYY-MM-DD format\.$/);
  if (match) return 'Dapat nasa YYYY-MM-DD na format ang petsa.';
  match = text.match(/^(date|res_date) is not a valid calendar date\.$/);
  if (match) return 'Hindi wastong petsa sa kalendaryo ang inilagay.';
  match = text.match(/^(time|start_time|end_time) must be in HH:MM \(24-hour\) format\.$/);
  if (match) return 'Dapat nasa HH:MM (24-oras) na format ang oras.';
  match = text.match(/^The (date|res_date) cannot be in the past\.$/);
  if (match) return 'Hindi maaaring nakaraan na ang petsa.';
  match = text.match(/^(.+) must be a whole number between (\d+) and (\d+)\.$/);
  if (match) return `${match[1]} ay dapat buong numerong nasa pagitan ng ${match[2]} at ${match[3]}.`;
  match = text.match(/^(.+) must be one of: (.+)\.$/);
  if (match) return `Dapat kabilang ang ${match[1]} sa mga sumusunod: ${match[2]}.`;
  match = text.match(/^That (ID number|email address) is already registered\.$/);
  if (match) return `Nakarehistro na ang ${match[1] === 'ID number' ? 'ID number' : 'email address'} na iyon.`;
  match = text.match(/^Could not load (.+): (.+)$/);
  if (match) return `Hindi ma-load ang ${FILIPINO_UI[match[1]] || match[1]}: ${match[2]}`;
  match = text.match(/^Delete the account of "(.+)"\?([\s\S]*)$/);
  if (match) return `Tanggalin ang account ni "${match[1]}"?${match[2] ? `\n\nBabala: ${match[2].replace(/^\s+/, '')}` : ''}`;
  match = text.match(/^Delete "(.+)"\?([\s\S]*)$/);
  if (match) return `Tanggalin ang "${match[1]}"?${match[2] ? ` Babala: ${match[2]}` : ''}`;
  match = text.match(/^Are you sure you want to (deactivate|reactivate) (.+)'s account\?$/);
  if (match) return `Sigurado ka bang ${match[1] === 'deactivate' ? 'i-deactivate' : 'muling i-activate'} ang account ni ${match[2]}?`;
  match = text.match(/^(.+) - (.+), (.+) to (.+) \(requested by (.+)\)\.$/);
  if (match) return `${match[1]} - ${match[2]}, ${match[3]} hanggang ${match[4]} (hiniling ni ${match[5]}).`;
  match = text.match(/^by (.+)$/);
  if (match) return `ni ${match[1]}`;
  match = text.match(/^Reservation #(\d+) has been (approved|rejected|cancelled)\.$/);
  if (match) return `${({ approved: 'Naaprubahan', rejected: 'Tinanggihan', cancelled: 'Nakansela' })[match[2]]} ang pagpapareserba #${match[1]}.`;
  match = text.match(/^Building "(.+)" created\.$/);
  if (match) return `Nagawa ang gusaling "${match[1]}".`;
  match = text.match(/^Building #(\d+) updated\.$/);
  if (match) return `Na-update ang gusali #${match[1]}.`;
  match = text.match(/^Building #(\d+) and its rooms were deleted\.$/);
  if (match) return `Natanggal ang gusali #${match[1]} at ang mga silid nito.`;
  match = text.match(/^Room "(.+)" created\.$/);
  if (match) return `Nagawa ang silid na "${match[1]}".`;
  match = text.match(/^Room #(\d+) updated\.$/);
  if (match) return `Na-update ang silid #${match[1]}.`;
  match = text.match(/^Room #(\d+) deleted\.$/);
  if (match) return `Natanggal ang silid #${match[1]}.`;
  match = text.match(/^Room #(\d+) has (\d+) reservation\(s\), so it was deactivated instead of deleted\.$/);
  if (match) return `May ${match[2]} pagpapareserba ang silid #${match[1]}, kaya na-deactivate ito sa halip na tanggalin.`;
  match = text.match(/^Administrator (.+) was created successfully\.$/);
  if (match) return `Matagumpay na nagawa ang administrator na si ${match[1]}.`;
  match = text.match(/^Administrator (.+) was updated\.$/);
  if (match) return `Na-update ang administrator na si ${match[1]}.`;
  match = text.match(/^Administrator #(\d+) (reactivated|deactivated)\.$/);
  if (match) return `${match[2] === 'reactivated' ? 'Muling na-activate' : 'Na-deactivate'} ang administrator #${match[1]}.`;
  match = text.match(/^Account for (.+) created\.$/);
  if (match) return `Nagawa ang account ni ${match[1]}.`;
  match = text.match(/^Account #(\d+) (updated|deleted)\.$/);
  if (match) return `${match[2] === 'updated' ? 'Na-update' : 'Natanggal'} ang account #${match[1]}.`;
  match = text.match(/^Account #(\d+) has (\d+) reservation\(s\), so it was deactivated instead of deleted\.$/);
  if (match) return `May ${match[2]} pagpapareserba ang account #${match[1]}, kaya na-deactivate ito sa halip na tanggalin.`;
  match = text.match(/^Account #(\d+) has (\d+) reservation\(s\), so it was deactivated instead of deleted\.$/);
  if (match) return `May ${match[2]} pagpapareserba ang account #${match[1]}, kaya na-deactivate ito sa halip na tanggalin.`;
  match = text.match(/^Support ticket #(\d+) marked as (Open|In Progress|Resolved)\.$/);
  if (match) return `Minarkahan ang ticket ng suporta #${match[1]} bilang ${FILIPINO_UI[match[2]] || match[2]}.`;
  match = text.match(/^"(.+)" only seats (\d+) people, but (\d+) attendees were given\.$/);
  if (match) return `Hanggang ${match[2]} tao lamang ang kasya sa "${match[1]}", ngunit ${match[3]} ang bilang ng mga dadalo.`;
  match = text.match(/^"(.+)" is already booked on (.+) from (.+) to (.+) \((Pending|Approved)\)\. Please choose another time or room\.$/);
  if (match) return `Nakapagpareserba na sa "${match[1]}" noong ${match[2]} mula ${match[3]} hanggang ${match[4]} (${FILIPINO_UI[match[5]]}). Pumili ng ibang oras o silid.`;
  match = text.match(/^"(.+)" already exists in that building\.$/);
  if (match) return `Mayroon nang "${match[1]}" sa gusaling iyon.`;
  match = text.match(/^Temporary password: (.+)$/);
  if (match) return `Pansamantalang password: ${match[1]}`;
  return originalTranslateUiValue(source);
};

const originalConfirm = window.confirm.bind(window);
window.confirm = (message) => originalConfirm(translatedUiValue(String(message)));

function localizeTextNode(node) {
  let record = translatedTextNodes.get(node);
  const current = node.nodeValue;
  if (!record) {
    record = { source: current, translated: null };
    translatedTextNodes.set(node, record);
  } else if (record.translated !== null && current !== record.translated) {
    record.source = current;
  } else if (record.translated === null && current !== record.source) {
    record.source = current;
  }

  let next = translatedUiValue(record.source);
  if (portalLocale === 'fil-PH' && record.source.trim() === 'Open' && node.parentElement?.closest('.calendar-grid')) {
    next = 'Bakante';
  }
  record.translated = next;
  if (current !== next) node.nodeValue = next;
}

function localizeAttributes(element) {
  const names = ['placeholder', 'title', 'aria-label', 'alt'];
  let records = translatedAttributes.get(element);
  if (!records) {
    records = new Map();
    translatedAttributes.set(element, records);
  }
  names.forEach((name) => {
    if (!element.hasAttribute(name)) return;
    const current = element.getAttribute(name);
    let record = records.get(name);
    if (!record) {
      record = { source: current, translated: null };
      records.set(name, record);
    } else if (record.translated !== null && current !== record.translated) {
      record.source = current;
    } else if (record.translated === null && current !== record.source) {
      record.source = current;
    }
    const next = translatedUiValue(record.source);
    record.translated = next;
    if (current !== next) element.setAttribute(name, next);
  });
}

function localizeTree(root = document.documentElement) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || /^(SCRIPT|STYLE|NOSCRIPT|CODE|PRE)$/.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let node;
  while ((node = walker.nextNode())) localizeTextNode(node);
  if (root.nodeType === Node.ELEMENT_NODE) {
    localizeAttributes(root);
    root.querySelectorAll('*').forEach(localizeAttributes);
  }
  document.documentElement.lang = portalLocale === 'fil-PH' ? 'fil' : 'en';
  const title = document.querySelector('title');
  if (title && title.firstChild) localizeTextNode(title.firstChild);
}

function setPortalLocale(locale) {
  portalLocale = locale === 'fil-PH' ? 'fil-PH' : 'en-US';
  localStorage.setItem(PORTAL_LOCALE_KEY, portalLocale);
  localizeTree();
  document.dispatchEvent(new CustomEvent('portal-locale-change', { detail: { locale: portalLocale } }));
}

const portalLocalizationObserver = new MutationObserver((records) => {
  records.forEach((record) => {
    if (record.type === 'characterData') {
      localizeTextNode(record.target);
      return;
    }
    record.addedNodes.forEach((added) => {
      if (added.nodeType === Node.TEXT_NODE) localizeTextNode(added);
      else if (added.nodeType === Node.ELEMENT_NODE) localizeTree(added);
    });
    if (record.type === 'attributes') localizeAttributes(record.target);
  });
});

portalLocalizationObserver.observe(document.documentElement, {
  subtree: true,
  childList: true,
  characterData: true,
  attributes: true,
  attributeFilter: ['placeholder', 'title', 'aria-label', 'alt']
});
localizeTree();

/* ------------------------------------------------------------------ API --- */

/**
 * Thin fetch wrapper around the JSON API.
 * On failure it throws an Error carrying the HTTP status and the server's
 * `error` message so callers can simply `catch`.
 */
async function api(path, { method = 'GET', body, headers } = {}) {
  const opts = {
    method,
    headers: { Accept: 'application/json', ...(headers || {}) },
    credentials: 'same-origin'
  };
  if (body !== undefined) {
    if (body instanceof FormData) {
      opts.body = body;
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }

  let res;
  try {
    res = await fetch(path, opts);
  } catch (networkErr) {
    const err = new Error('Cannot reach the server. Is it still running?');
    err.status = 0;
    err.cause = networkErr;
    throw err;
  }

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await res.json().catch(() => ({})) : {};

  if (!res.ok) {
    const err = new Error(payload.error || `Request failed (${res.status}).`);
    err.status = res.status;
    err.code = payload.code;
    err.payload = payload;
    throw err;
  }
  return payload;
}

/* --------------------------------------------------------------- session --- */

let sessionCache = null;

/** Returns { authenticated, user } and caches it for the page's lifetime. */
async function getSession(force = false) {
  if (sessionCache && !force) return sessionCache;
  try {
    sessionCache = await api('/api/session');
  } catch {
    sessionCache = { authenticated: false, user: null };
  }
  return sessionCache;
}

/** Sends the browser to another page (full navigation, fresh JS state). */
function redirectTo(url) {
  window.location.replace(url);
}

/**
 * Page guard: ensures somebody is logged in and (optionally) that their role
 * is allowed. Redirects to the login page when the check fails.
 * Returns the user object, or null when a redirect happened.
 */
async function requireRole(...allowedRoles) {
  const { authenticated, user } = await getSession();
  if (!authenticated) {
    redirectTo('/index.html?error=login_required');
    return null;
  }
  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    redirectTo('/dashboard.html?error=forbidden');
    return null;
  }
  return user;
}
/* ------------------------------------------------------------ formatting --- */

const ROLE_LABELS = {
  student: 'Student',
  faculty: 'Faculty',
  custodian: 'Custodian',
  admin: 'Admin'
};

const ROOM_TYPE_LABELS = {
  laboratory: 'Laboratory',
  classroom: 'Classroom',
  hall: 'Hall',
  office: 'Office'
};

const EQUIPMENT_TYPES = [
  'Projector',
  'Extension Cord',
  'Aircon Access',
  'Microphone',
  'Sound System',
  'Whiteboard Markers'
];

/** Escapes text before it goes into innerHTML (prevents XSS from user data). */
function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "09:00:00" -> "9:00 AM". */
function formatTime(hhmmss) {
  const str = String(hhmmss || '');
  const [h, m] = str.split(':').map(Number);
  if (Number.isNaN(h)) return str;
  const date = new Date(2000, 0, 1, h, m || 0);
  return date.toLocaleTimeString(currentUiLocale(), { hour: 'numeric', minute: '2-digit' });
}

/** "2026-10-05" -> "Mon, Oct 5, 2026". */
function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(currentUiLocale(), {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
}

/** Short form used inside dense tables: "Oct 5, 2026". */
function formatDateShort(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(currentUiLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Turns a timestamp into a relative "2 hours ago" style string. */
function timeAgo(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(value || ''));
  if (!m) return '';
  const then = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6]));
  const secs = Math.round((Date.now() - then.getTime()) / 1000);
  const relative = new Intl.RelativeTimeFormat(currentUiLocale(), { numeric: 'auto' });
  if (secs < 60) return relative.format(0, 'second');
  const mins = Math.round(secs / 60);
  if (mins < 60) return relative.format(-mins, 'minute');
  const hours = Math.round(mins / 60);
  if (hours < 24) return relative.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return relative.format(-days, 'day');
  return formatDateShort(value);
}

/** Today in the browser's timezone as "YYYY-MM-DD" (for date input min=). */
function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}
/* --------------------------------------------------------------- badges --- */

/** Bootstrap contextual colour for each reservation status. */
const STATUS_STYLES = {
  Pending: 'warning',
  Approved: 'success',
  Rejected: 'danger',
  Cancelled: 'secondary'
};

/** A coloured pill for a reservation status. */
function statusBadge(status) {
  const tone = STATUS_STYLES[status] || 'secondary';
  return `<span class="badge rounded-pill text-bg-${tone} status-badge">${escapeHtml(status)}</span>`;
}

/** A coloured pill for a user role. */
function roleBadge(role) {
  return `<span class="role-badge role-${escapeHtml(role)}">${escapeHtml(ROLE_LABELS[role] || role)}</span>`;
}

/* ----------------------------------------------------------------- navbar --- */

/**
 * Renders the portal navbar into `#navbar-placeholder`.
 * `active` highlights the current page's link.
 */
function renderNavbar(user, active) {
  const host = document.getElementById('navbar-placeholder');
  if (!host) return;

  const link = (href, label, key) =>
    `<li class="nav-item"><a class="nav-link${active === key ? ' active' : ''}" href="${href}">${label}</a></li>`;

  const isAdmin = user && user.role === 'admin';
  const isPublicLanding = !user && document.body.classList.contains('portal-home-page');
  const initials = user
    ? String(user.full_name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase()
    : '';
  const avatarInitial = user
    ? String(user.full_name || 'U').trim().split(/\s+/).slice(0, 1).map((part) => part.charAt(0).toUpperCase()).join('') || 'U'
    : '';
  const avatarUrl = user && user.avatar_url ? escapeHtml(user.avatar_url) : '';

  let navLinks = '';
  if (user) {
    // Top header keeps only Home + Admin + About Us; the left
    // Control Panel sidebar owns all per-role page navigation.
    navLinks += link('/', 'Home', 'home');
    navLinks += link('/dashboard.html', 'Dashboard', 'dashboard');
    navLinks += link('/rooms-status.html', 'Room Status', 'rooms');
    navLinks += '<li class="nav-item"><button class="nav-link nav-link-button" type="button" id="btn-about-us">About Us</button></li>';
  } else {
    // Guest / pre-login navbar: keep it minimal — Home + About Us only.
    navLinks += link('/#overview', 'Home', 'home');
    navLinks += '<li class="nav-item"><button class="nav-link nav-link-button" type="button" id="btn-about-us">About Us</button></li>';
  }




  const adminSectionNewStyle = isAdmin
    ? `          <div class="dropdown-section">
            <div class="dropdown-section-title">Administration</div>
            <button type="button" class="dropdown-item" id="menu-add-admin">
              <span class="item-icon">➕</span>
              <span class="item-label">Add New Admin Account</span>
            </button>
          </div>
          <hr class="dropdown-divider" />`
    : `          <hr class="dropdown-divider" />`;

  const userArea = user
    ? `\n      <div class="user-profile-wrapper d-inline-flex align-items-center gap-0 position-relative" id="user-profile-wrapper">\n        <button type="button" class="profile-pill" id="profile-pill" aria-haspopup="true" aria-expanded="false">\n          <span class="avatar-circle" id="profile-avatar">${avatarInitial}</span>\n          <span class="profile-name" id="profile-name">${escapeHtml(user.full_name || 'User')}</span>\n          <span class="role-badge" id="profile-role">${String(user.role || 'STUDENT').toUpperCase()}</span>\n          <span class="dropdown-arrow">▼</span>\n        </button>\n        <div class="profile-dropdown-menu" id="profile-dropdown-menu" hidden>\n          <div class="dropdown-section">\n            <div class="dropdown-section-title">Your Account</div>\n            <button type="button" class="dropdown-item" id="menu-account-settings">\n              <span class="item-icon">⚙️</span>\n              <span class="item-label">Account Settings</span>\n            </button>\n            <button type="button" class="dropdown-item" id="menu-change-password">\n              <span class="item-icon">🔒</span>\n              <span class="item-label">Change Password</span>\n            </button>\n          </div>\n${adminSectionNewStyle}\n          <button type="button" class="dropdown-item dropdown-item-danger" id="menu-logout">\n            <span class="item-icon">🚪</span>\n            <span class="item-label">Log Out</span>\n          </button>\n        </div>\n      </div>`
      : isPublicLanding
        ? `
        <button class="btn btn-sm btn-outline-light" id="visitor-login-trigger" type="button" data-bs-toggle="modal" data-bs-target="#visitor-login-modal">Log in</button>
        <button class="btn btn-sm btn-light" id="visitor-register-trigger" type="button" data-bs-toggle="modal" data-bs-target="#visitor-register-modal">Register</button>`
        : `
        <a class="btn btn-sm btn-outline-light" href="/?auth=login">Log in</a>
        <a class="btn btn-sm btn-light" href="/?auth=register">Register</a>`;

  const savedLocale = localStorage.getItem('portal-locale') || 'en-US';
  const languageControl = `
    <label class="language-picker" title="Select language">
      <span class="language-picker-icon" aria-hidden="true">文</span>
      <select id="portal-language-select" aria-label="Select language">
        <option value="en-US"${savedLocale === 'en-US' ? ' selected' : ''} title="English (United States)">EN</option>
        <option value="fil-PH"${savedLocale === 'fil-PH' ? ' selected' : ''} title="Filipino (Philippines)">FIL</option>
      </select>
    </label>`;

  host.innerHTML = `
    <nav class="navbar navbar-expand-lg navbar-dark portal-navbar${navLinks ? '' : ' portal-navbar-slim'}">
      <div class="container portal-nav-inner">
        <a class="navbar-brand navbar-brand-hornet" href="${user ? '/dashboard.html' : '/#overview'}">
          <img class="cspc-logo hornet-logo" src="/img/hornet-logo.jpg"
               alt="HORNET logo" />
          <span class="brand-text"><span class="brand-title">Laboratory/Room Reservation</span></span>
        </a>
        ${navLinks ? `
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse"
                data-bs-target="#portalNav" aria-controls="portalNav"
                aria-expanded="false" aria-label="Toggle navigation">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse portal-nav-collapse" id="portalNav">
          <ul class="navbar-nav portal-nav-links mb-2 mb-lg-0 ${user ? 'portal-nav-authenticated' : 'portal-nav-public'}">${navLinks}</ul>
          <div class="navbar-search d-flex align-items-center">
            <div class="search-wrapper position-relative" style="max-width: 340px; width: 100%;">
              <input type="search" id="building-search" class="building-search-input" placeholder="Search buildings…" aria-label="Search buildings" autocomplete="off" />
              <span class="search-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </span>
              <div id="building-search-results" class="building-search-dropdown"></div>
            </div>
          </div>
          <div class="navbar-account-area portal-nav-utility d-flex align-items-center">${languageControl}${userArea}</div>
        </div>` : `
        <div class="navbar-account-area portal-nav-utility portal-nav-utility-slim d-flex align-items-center">${languageControl}${userArea}</div>`}
      </div>
    </nav>`;

  document.getElementById('portal-language-select')?.addEventListener('change', (event) => {
    setPortalLocale(event.target.value);
    toastInfo('Language preference saved.');
  });

  /* ------------------------------------------------ About Us modal (all pages) --- */
  (function initAboutUs() {
    const MODAL_ID = 'about-us-modal';
    const BTN_ID = 'btn-about-us';
    const modalHtml = `<!-- About Us Modal (injected by app.js when a page lacks it) -->
<div class="modal fade about-modal" id="${MODAL_ID}" tabindex="-1" aria-labelledby="about-us-title" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <div>
          <span class="profile-modal-kicker">About</span>
          <h2 class="modal-title fs-5" id="about-us-title">About CSPC Lab &amp; Room Reservation</h2>
        </div>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <p>The CSPC Laboratory and Room Reservation System streamlines booking and approval workflows for campus facilities.</p>
        <p><strong>Version:</strong> 1.0.0</p>
        <p><strong>© 2026 CSPC — Computer Studies Department</strong></p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-light" data-bs-dismiss="modal">Close</button>
      </div>
    </div>
  </div>
</div>`;

    function ensureModal() {
      if (!document.getElementById(MODAL_ID)) {
        document.body.insertAdjacentHTML('beforeend', modalHtml);
      }
    }

    /* Document-level delegation so it works no matter when renderNavbar()
       injects the #btn-about-us button into the DOM. */
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#' + BTN_ID);
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      ensureModal();
      if (!window.bootstrap) return;
      const modalEl = document.getElementById(MODAL_ID);
      const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
      modal.show();
    });
  })();

  /* ------------------------------------------- building search (all pages) --- */
  (function initBuildingSearch() {
    const searchInput = document.getElementById('building-search');
    const searchResults = document.getElementById('building-search-results');
    if (!searchInput || !searchResults) return;

    let debounceTimer = null;
    let buildings = [];

    async function loadBuildings() {
      try {
        const data = await api('/api/buildings');
        buildings = data.buildings || [];
      } catch { /* ignore — search will show no results */ }
    }
    loadBuildings();

    function showAutocomplete(query) {
      const q = query.toLowerCase().trim();
      if (!q) {
        searchResults.innerHTML = '';
        searchResults.classList.remove('show');
        return;
      }
      const matches = buildings
        .filter((b) => (b.building_name || b.name || '').toLowerCase().includes(q))
        .slice(0, 5);
      if (matches.length === 0) {
        searchResults.innerHTML = '<div class="search-dropdown-item text-muted">No matching buildings</div>';
        searchResults.classList.add('show');
        return;
      }
      searchResults.innerHTML = matches
        .map((b) => {
          const name = b.building_name || b.name;
          const rooms = Number(b.active_rooms ?? b.room_count ?? 0);
          return `
            <button class="search-dropdown-item d-flex align-items-center gap-2" type="button"
                    data-id="${b.id}" data-name="${escapeHtml(name)}">
              <div class="flex-fill">
                <div class="search-dropdown-name">${escapeHtml(name)}</div>
                <div class="search-dropdown-meta">${rooms} active room${rooms !== 1 ? 's' : ''}</div>
              </div>
              <span class="search-dropdown-arrow">›</span>
            </button>`;
        })
        .join('');
      searchResults.classList.add('show');
    }

    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        showAutocomplete(e.target.value);
      }, 150);
    });

    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim()) showAutocomplete(searchInput.value);
    });

    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.classList.remove('show');
      }
    });

    searchResults.addEventListener('click', (e) => {
      const item = e.target.closest('.search-dropdown-item');
      if (item) {
        const id = Number(item.getAttribute('data-id'));
        const name = item.getAttribute('data-name');
        searchInput.value = name;
        searchResults.classList.remove('show');
        window.location.href = `/rooms-status.html?building=${id}`;
      }
    });
  })();

  const buildingsModal = document.getElementById('buildings-preview-modal');
  if (buildingsModal) {
    let buildingsLoaded = false;
    buildingsModal.addEventListener('show.bs.modal', async () => {
      if (buildingsLoaded) return;
      const list = document.getElementById('building-preview-list');
      try {
        const data = await api('/api/buildings');
        const buildings = data.buildings || [];
        list.innerHTML = buildings.length
          ? buildings.map((building) => `
            <div class="building-preview-item">
              <div>
                <strong>${escapeHtml(building.name)}</strong>
                <span>${escapeHtml(building.location || 'CSPC campus')}</span>
              </div>
              <span class="building-room-count">${escapeHtml(building.room_count)} active rooms</span>
            </div>`).join('')
          : '<p class="text-muted-sm mb-0">No building information is available yet.</p>';
        buildingsLoaded = true;
      } catch (err) {
        list.innerHTML = `<p class="text-warning mb-0">Could not load buildings: ${escapeHtml(err.message)}</p>`;
      }
    });
  }

  const accountSettingsModalEl = document.getElementById('accountSettingsModal');
  if (accountSettingsModalEl && window.bootstrap) {

    const accountSettingsModal = new bootstrap.Modal(accountSettingsModalEl);
    const accountSettingsForm = document.getElementById('accountSettingsForm');
    const saveAccountSettingsBtn = document.getElementById('acct-save-btn');
    const cancelAccountSettingsBtn = document.getElementById('cancelAccountSettingsBtn');
    const accountSettingsCloseBtn = accountSettingsModalEl.querySelector('.btn-close');
    const avatarInput = document.getElementById('profile-avatar-input');
    const previewImg = document.getElementById('profile-avatar-preview-img');
    const previewInitials = document.getElementById('profile-avatar-preview-initials');

    /* ── Helper: fully dismiss modal and clean up backdrop/body ── */
    const dismissAccountSettingsModal = () => {
      accountSettingsModal.hide();
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    };

    /* ── Helper: resolve the current user object ── */
    const getCurrentUser = async () => {
      if (sessionCache && sessionCache.user) return sessionCache.user;
      try {
        const session = await api('/api/session');
        return session.user || null;
      } catch {
        return null;
      }
    };

    if (accountSettingsForm && saveAccountSettingsBtn) {
      accountSettingsModalEl.addEventListener('show.bs.modal', async () => {
        const u = await getCurrentUser();
        if (!u) return;
        document.getElementById('acct-full-name').value = u.full_name || '';
        document.getElementById('acct-student-id').value = u.school_id || '';
        document.getElementById('acct-email').value = u.email || '';
        document.getElementById('acct-contact').value = u.contact_number || '';
        const currentUrl = u.avatar_url;
        if (previewImg && previewInitials) {
          previewImg.src = currentUrl || '';
          previewImg.hidden = !currentUrl;
          previewInitials.hidden = Boolean(currentUrl);
          previewInitials.textContent = String(u.full_name || '?')
            .trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase() || 'MA';
        }
      });

      // Live preview when a file is selected
      avatarInput?.addEventListener('change', () => {
        const file = avatarInput.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        previewImg.src = url;
        previewImg.hidden = false;
        previewInitials.hidden = true;
      });

      // Clicking the 📷 button opens the file picker
      const avatarBtn = document.querySelector('.avatar-upload-btn');
      avatarBtn?.addEventListener('click', () => {
        avatarInput?.click();
      });

      accountSettingsForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        saveAccountSettingsBtn.disabled = true;
        saveAccountSettingsBtn.textContent = 'Saving…';
        try {
          const u = await getCurrentUser();
          // Upload avatar first if a new file was selected
          let avatarUrl = u && u.avatar_url;
          if (avatarInput?.files?.[0]) {
            const formData = new FormData();
            formData.append('avatar', avatarInput.files[0]);
            const uploadResult = await api('/api/profile/avatar', { method: 'POST', body: formData });
            avatarUrl = uploadResult.avatar_url;
          }

          const payload = {
            full_name: document.getElementById('acct-full-name').value.trim(),
            school_id: document.getElementById('acct-student-id').value.trim() || null,
            email: document.getElementById('acct-email').value.trim(),
            contact_number: document.getElementById('acct-contact').value.trim() || null,
          };
          const result = await api('/api/profile', { method: 'PATCH', body: payload });
          dismissAccountSettingsModal();
          toastOk(result.message || 'Profile updated.');
          if (result.user) {
            if (sessionCache && sessionCache.user) Object.assign(sessionCache.user, result.user);
          }
          // Update navbar avatar badge (profile pill uses #profile-avatar initials span)
          const navbarAvatar = document.getElementById('profile-avatar');
          if (navbarAvatar && avatarUrl) {
            navbarAvatar.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`;
          }
        } catch (err) {
          toastError(err.message);
        } finally {
          saveAccountSettingsBtn.disabled = false;
          saveAccountSettingsBtn.textContent = 'Save changes';
        }
      });
    }

    /* ── Isolated Account Settings modal button handlers ── */
    if (saveAccountSettingsBtn && accountSettingsForm) {
      saveAccountSettingsBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const emailInput = document.getElementById('acct-email');
        if (emailInput && emailInput.value.trim() && !emailInput.value.trim().endsWith('@my.cspc.edu.ph')) {
          toastError('Please use your institutional email (@my.cspc.edu.ph).');
          emailInput.focus();
          return;
        }

        accountSettingsForm.requestSubmit();
      });
    }

    if (cancelAccountSettingsBtn) {
      cancelAccountSettingsBtn.addEventListener('click', (event) => {
        dismissAccountSettingsModal();
      });
    }

    if (accountSettingsCloseBtn) {
      accountSettingsCloseBtn.addEventListener('click', (event) => {
        dismissAccountSettingsModal();
      });
    }

    /* data-bs-dismiss buttons inside Account Settings modal ── */
    accountSettingsModalEl.querySelectorAll('[data-bs-dismiss="modal"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        dismissAccountSettingsModal();
      });
    });

    accountSettingsModalEl.addEventListener('hidden.bs.modal', async () => {
      if (avatarInput) avatarInput.value = '';
      const u = await getCurrentUser();
      const currentUrl = u && u.avatar_url;
      if (previewImg) {
        previewImg.src = currentUrl || '';
        previewImg.hidden = !currentUrl;
      }
      if (previewInitials) {
        previewInitials.hidden = Boolean(currentUrl);
      }
    });

  }

  /* Auto-close the profile dropdown whenever any modal opens so it never
     floats on top of a modal dialog. */
  document.addEventListener('show.bs.modal', () => {
    const trigger = document.getElementById('profile-settings-trigger');
    if (trigger && window.bootstrap) {
      try {
        bootstrap.Dropdown.getOrCreateInstance(trigger).hide();
      } catch { /* dropdown not initialized yet */ }
    }
  });

  /* ------------------------------------ new-style profile pill (delegation) ---
     Handles #profile-pill / #profile-dropdown-menu on pages that render the
     user-profile-wrapper but have no page-specific handler (e.g. index.html).
     Uses document-level click delegation so it works regardless of when the
     navbar is injected. On pages where dashboard.js binds a direct listener,
     stopPropagation() in that listener prevents this delegate from firing.
     -------------------------------------------------------------------------- */

  (function initProfilePillDelegation() {
    const getPill = () => document.getElementById('profile-pill');
    const getMenu = () => document.getElementById('profile-dropdown-menu');
    const getWrapper = () => document.getElementById('user-profile-wrapper');

    function openDropdown() {
      const pill = getPill();
      const menu = getMenu();
      if (!pill || !menu) return;
      menu.classList.add('show');
      menu.removeAttribute('hidden');
      pill.classList.add('active');
      pill.setAttribute('aria-expanded', 'true');
    }

    function closeDropdown() {
      const pill = getPill();
      const menu = getMenu();
      if (!pill || !menu) return;
      menu.classList.remove('show');
      menu.setAttribute('hidden', '');
      pill.classList.remove('active');
      pill.setAttribute('aria-expanded', 'false');
    }

    /* Cache modal instances so we never create a new bootstrap.Modal on every click.
       This prevents backdrop/instance conflicts, especially when Bootstrap bundle
       is loaded only once (no duplicate script tags). */
    const modalCache = new Map();
    function getCachedModal(id) {
      if (!window.bootstrap) return null;
      if (!modalCache.has(id)) {
        const el = document.getElementById(id);
        if (el) modalCache.set(id, new bootstrap.Modal(el));
      }
      return modalCache.get(id) || null;
    }

    document.addEventListener('click', async (e) => {
      const pill = getPill();
      const menu = getMenu();
      const wrapper = getWrapper();
      if (!pill || !menu || !wrapper) return;

      /* Toggle when the pill itself is clicked */
      if (pill.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        if (menu.classList.contains('show')) {
          closeDropdown();
        } else {
          openDropdown();
        }
        return;
      }

      /* Handle menu-item clicks while the dropdown is open */
      if (menu.classList.contains('show')) {
        const item = e.target.closest('.dropdown-item');
        if (item) {
          e.preventDefault();
          e.stopPropagation();
          closeDropdown();

          if (item.id === 'menu-account-settings') {
            const modal = getCachedModal('accountSettingsModal');
            if (modal) modal.show();
          } else if (item.id === 'menu-change-password') {
            const modal = getCachedModal('changePasswordModal');
            if (modal) modal.show();
          } else if (item.id === 'menu-add-admin') {
            const modal = getCachedModal('admin-modal');
            if (modal) modal.show();
          } else if (item.id === 'menu-logout') {
            if (confirm('Are you sure you want to log out?')) {
              try {
                await api('/api/auth/logout', { method: 'POST' });
              } catch {
                /* even if the call fails, still clear session and redirect */
              }
              sessionCache = null;
              redirectTo('/?logged_out=1');
            }
          }
          return;
        }
      }

      /* Close when clicking anywhere outside the wrapper */
      if (menu.classList.contains('show') && !wrapper.contains(e.target)) {
        closeDropdown();
      }
    });
  })();

  /* ------------------------------------------- security / change password --- */

  const securityMenuItem = document.getElementById('security-settings-menu-item');
  const changePasswordModalEl = document.getElementById('change-password-modal');
  if (securityMenuItem && changePasswordModalEl && window.bootstrap) {
    const changePasswordModal = new bootstrap.Modal(changePasswordModalEl);
    const changePasswordForm = document.getElementById('change-password-form');
    const currentPwInput = document.getElementById('change-current-password');
    const newPwInput = document.getElementById('change-new-password');
    const confirmPwInput = document.getElementById('change-confirm-password');
    const strengthBar = document.getElementById('change-password-strength');
    const strengthLabel = document.getElementById('change-password-strength-label');
    const matchFeedback = document.getElementById('change-password-match');
    const savePasswordButton = document.getElementById('save-password-btn');

    const STRENGTH_LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];

    /** Same rules the backend enforces via parseStrongPassword. */
    function passwordRules(pw) {
      return {
        length: pw.length >= 8,
        uppercase: /[A-Z]/.test(pw),
        number: /[0-9]/.test(pw),
        special: /[^A-Za-z0-9]/.test(pw)
      };
    }

    /** 0-4 score: one point per met rule, +1 when 12+ chars and all rules pass. */
    function scorePassword(pw) {
      const rules = passwordRules(pw);
      let score = Object.values(rules).filter(Boolean).length;
      if (score === 4 && pw.length >= 12) score = 5;
      return pw ? Math.min(score, 5) : 0;
    }

    function refreshStrength() {
      const pw = newPwInput.value;
      const rules = passwordRules(pw);
      const score = scorePassword(pw);

      changePasswordForm.querySelectorAll('#change-password-rules li').forEach((li) => {
        li.classList.toggle('rule-met', Boolean(rules[li.dataset.rule]));
      });

      // Map the 0-5 score onto the 4-segment bar (0 = empty).
      const segments = Math.min(score, 4);
      strengthBar.dataset.score = String(segments);
      strengthLabel.textContent = pw
        ? `Password strength: ${STRENGTH_LABELS[segments]}`
        : 'Password strength';
      strengthLabel.classList.toggle('text-danger', segments === 1);
      strengthLabel.classList.toggle('text-warning', segments === 2);
      strengthLabel.classList.toggle('text-info', segments === 3);
      strengthLabel.classList.toggle('text-success', segments === 4);
    }

    function refreshMatch() {
      const pw = newPwInput.value;
      const confirm = confirmPwInput.value;
      matchFeedback.classList.remove('is-match', 'not-match');
      if (!confirm) {
        matchFeedback.textContent = '';
        return;
      }
      if (pw === confirm) {
        matchFeedback.textContent = 'Passwords match.';
        matchFeedback.classList.add('is-match');
      } else {
        matchFeedback.textContent = 'Passwords do not match yet.';
        matchFeedback.classList.add('not-match');
      }
    }

    securityMenuItem.addEventListener('click', () => {
      bootstrap.Dropdown.getOrCreateInstance(document.getElementById('profile-settings-trigger')).hide();
      changePasswordModal.show();
    });

    // Eye-icon show/hide toggles on every password field in the modal.
    changePasswordModalEl.querySelectorAll('[data-toggle-password]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.togglePassword);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.textContent = show ? '🙈' : '👁';
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      });
    });

    newPwInput.addEventListener('input', refreshStrength);
    confirmPwInput.addEventListener('input', refreshMatch);

    changePasswordForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!currentPwInput.value) {
        toastError('Enter your current password to continue.');
        currentPwInput.focus();
        return;
      }
      const rules = passwordRules(newPwInput.value);
      if (!Object.values(rules).every(Boolean)) {
        toastError('Your new password does not meet all the requirements yet.');
        newPwInput.focus();
        return;
      }
      if (newPwInput.value !== confirmPwInput.value) {
        toastError('Your new password and confirmation do not match.');
        confirmPwInput.focus();
        return;
      }

      savePasswordButton.disabled = true;
      savePasswordButton.textContent = 'Updating…';
      try {
        const data = await api('/api/admin/change-password', {
          method: 'POST',
          body: {
            current_password: currentPwInput.value,
            new_password: newPwInput.value
          }
        });
        changePasswordModal.hide();
        changePasswordForm.reset();
        refreshStrength();
        matchFeedback.textContent = '';
        toastOk(data.message);
      } catch (err) {
        toastError(err.message);
      } finally {
        savePasswordButton.disabled = false;
        savePasswordButton.textContent = 'Update password';
      }
    });

    changePasswordModalEl.addEventListener('hidden.bs.modal', () => {
      changePasswordForm.reset();
      refreshStrength();
      matchFeedback.textContent = '';
      matchFeedback.classList.remove('is-match', 'not-match');
    });
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      logoutBtn.disabled = true;
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } catch {
        /* even if the call fails, send the user back to the login page */
      }
      sessionCache = null;
      redirectTo('/?logged_out=1');
    });
  }
}
/* ----------------------------------------------------------------- toasts --- */

/** Floating feedback messages; creates its own container on first use. */
function toast(message, type = 'success') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-host';
    document.body.appendChild(host);
  }

  const el = document.createElement('div');
  el.className = `alert alert-${type === 'error' ? 'danger' : type} shadow-sm app-toast`;
  el.setAttribute('role', 'alert');
  el.textContent = String(message);
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => el.classList.remove('show'), 4200);
  setTimeout(() => el.remove(), 4800);
}

const toastOk = (m) => toast(m, 'success');
const toastError = (m) => toast(m, 'error');
const toastInfo = (m) => toast(m, 'info');

/* -------------------------------------------------------------- utilities --- */

/** Reads a query-string parameter (used for ?error=... redirects). */
function queryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/** Builds an "empty state" row spanning `colspan` columns. */
function emptyRow(colspan, message) {
  return `<tr><td colspan="${colspan}" class="text-center text-muted-sm py-4">${escapeHtml(message)}</td></tr>`;
}

/** Disables a button and shows a spinner while a request is in flight. */
function busy(button, isBusy, label = 'Working...') {
  if (!button) return;
  if (isBusy) {
    button.dataset.original = button.innerHTML;
    button.disabled = true;
    button.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' +
      escapeHtml(label);
  } else {
    button.disabled = false;
    if (button.dataset.original) button.innerHTML = button.dataset.original;
  }
}

/** Reads a form into a plain object (repeated names become arrays). */
function formToObject(form) {
  const data = new FormData(form);
  const out = {};
  for (const [key, value] of data.entries()) {
    if (key in out) {
      if (!Array.isArray(out[key])) out[key] = [out[key]];
      out[key].push(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Applies a value to a form control by name (handles checkboxes/radios). */
function setFormValue(form, name, value) {
  form.querySelectorAll(`[name="${name}"]`).forEach((field) => {
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else if (field.type === 'radio') field.checked = String(field.value) === String(value);
    else field.value = value === undefined || value === null ? '' : value;
  });
}

/* ---------------------------------------------------------------- exports --- */
/* Exposed on window so the plain <script> files on each page (no bundler)
   can share one implementation. */
/* Broadcast availability changes across tabs so the home page live cards
   stay in sync after any reservation / room / building transaction. */
function broadcastAvailabilityChange() {
  try {
    const bc = new BroadcastChannel('cspc-availability');
    bc.postMessage({ type: 'availability-changed' });
    bc.close();
  } catch {
    try { localStorage.setItem('cspc-availability-changed', String(Date.now())); } catch {}
  }
}

window.Portal = {
  setLocale: setPortalLocale,
  getLocale: currentUiLocale,
  api,
  getSession,
  requireRole,
  redirectTo,
  renderNavbar,
  roleBadge,
  statusBadge,
  ROLE_LABELS,
  ROOM_TYPE_LABELS,
  EQUIPMENT_TYPES,
  escapeHtml,
  formatTime,
  formatDate,
  formatDateShort,
  timeAgo,
  todayIso,
  toast,
  toastOk,
  toastError,
  toastInfo,
  queryParam,
  emptyRow,
  busy,
  formToObject,
  setFormValue,
  broadcastAvailabilityChange
};

/* ------------------------------------------------------------
   Stuck-backdrop cleanup safety net.
   Bootstrap sometimes leaves a .modal-backdrop attached to
   <body> when a modal fails to open/close cleanly. That stray
   backdrop (plus the .modal-open class on <body>) blocks every
   click and blurs the page.  We clean it up in two places:

   1. After every modal closes        (hidden.bs.modal)
   2. Periodically as a safety net    (setInterval)
------------------------------------------------------------ */
(function cleanupStuckBackdrops() {
  function removeStuckBackdrops() {
    // If a modal is genuinely open, leave everything alone.
    if (document.querySelector('.modal.show')) return;

    // Remove any orphaned backdrops.
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());

    // Strip the lock-scrolling class so the page is usable again.
    if (document.body.classList.contains('modal-open')) {
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
    }
  }

  // Clean up whenever any Bootstrap modal finishes closing.
  document.addEventListener('hidden.bs.modal', removeStuckBackdrops);

  // Periodic safety net: every second, check for stray backdrops.
  setInterval(removeStuckBackdrops, 1000);

  // Run once immediately on load.
  removeStuckBackdrops();
})();


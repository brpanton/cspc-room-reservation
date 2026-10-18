const pv = require('./_tmp_pv.js');
const fs = require('fs');
const file = 'routes/password-reset.js';
const src = fs.readFileSync(file, 'utf8');
const startMarker = "router.post('/verify-otp'";
const start = src.indexOf(startMarker);
if (start < 0) { console.error('V START NOT FOUND'); process.exit(1); }
const oldHead = "    const { email } = await resolveAccountEmail(rawIdentifier);";
const idx = src.indexOf(oldHead, start);
if (idx < 0) { console.error('OLD HEAD NOT FOUND'); process.exit(1); }
const block = pv.buildBlockV();
const headEnd = idx + oldHead.length;
fs.writeFileSync(file, src.slice(0, start) + block + src.slice(headEnd));
console.log('verify head replaced OK');

const part2 = require('./_tmp_part2.js');
const fs = require('fs');
const file = 'routes/password-reset.js';
const src = fs.readFileSync(file, 'utf8');
const startMarker = "router.post('/forgot-password'";
const start = src.indexOf(startMarker);
if (start < 0) { console.error('START NOT FOUND'); process.exit(1); }
const endMarker = '/* ------------------------------------------------------- step 2: verify */';
const end = src.indexOf(endMarker);
if (end < 0 || end <= start) { console.error('END NOT FOUND'); process.exit(1); }
const block = part2.buildBlock();
fs.writeFileSync(file, src.slice(0, start) + block + src.slice(end));
console.log('forgot-password handler replaced OK');

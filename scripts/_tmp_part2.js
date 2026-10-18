const a = require('./_tmp_p2a.js');
const b = require('./_tmp_p2b.js');
function buildBlock() { return a.buildBlock() + b.buildRest(); }
module.exports = { buildBlock };

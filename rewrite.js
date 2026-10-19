const fs = require('fs');
let c = '';
c += `/**\n * Reservation lifecycle.\n *\n *  POST   /api/reservations                -> create (status = 'Pending')\n *  GET    /api/reservations                -> list, scoped by role\n *  GET    /api/reservations/stats          -> dashboard statistics\n *  GET    /api/reservations/:id            -> single reservation (owner or staff)\n *  PATCH  /api/reservations/:id/decision   -> Approve / Reject (custodian, admin)\n *  PATCH  /api/reservations/:id/cancel     -> Cancel (owner or staff)\n */\n`;
fs.writeFileSync('routes/reservations.js', c);
console.log('Header written');
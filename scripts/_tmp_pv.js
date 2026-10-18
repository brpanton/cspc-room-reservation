function buildBlockV() {
  const L = [];
  L.push("router.post('/verify-otp', async (req, res, next) => {");
  L.push('  try {');
  L.push('    // DIRECT-DELIVERY: match the exact address step 1 keyed the row by');
  L.push('    // (typed CSPC email, or the primary email a School ID resolved to).');
  L.push('    const rawIdentifier = req.body.identifier !== undefined ? req.body.identifier : req.body.email;');
  L.push("    requireFields({ identifier: rawIdentifier }, ['identifier']);");
  L.push("    requireFields(req.body, ['otp']);");
  L.push('    let rowEmail;');
  L.push("    if (String(rawIdentifier).includes('@')) {");
  L.push('      rowEmail = parseEmail(rawIdentifier);');
  L.push('    } else {');
  L.push('      const resolved = await resolveAccountEmail(rawIdentifier);');
  L.push('      if (!resolved.user) {');
  L.push("        const err = new Error('No active verification code for that School ID. Request a new one.');");
  L.push('        err.status = 400;');
  L.push('        throw err;');
  L.push('      }');
  L.push('      rowEmail = resolved.email;');
  L.push('    }');
  return L.join('\n');
}
module.exports = { buildBlockV };

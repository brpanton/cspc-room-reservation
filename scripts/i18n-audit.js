/* Audit: list UI strings NOT covered by FILIPINO_UI in app.js.
   Run: node scripts/i18n-audit.js  (dev-only helper, not shipped to browser) */
'use strict';
const fs = require('fs');
const path = require('path');

const appSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
const dictMatch = appSrc.match(/const FILIPINO_UI = ({[\s\S]*?\n});/);
if (!dictMatch) { console.error('FILIPINO_UI not found'); process.exit(1); }
const FILIPINO_UI = eval('(' + dictMatch[1] + ')');
// merge every Object.assign(FILIPINO_UI, {...}) chunk (later entries win, like the browser)
for (const m of appSrc.matchAll(/Object\.assign\(FILIPINO_UI, ({[\s\S]*?\n})\);/g)) {
  Object.assign(FILIPINO_UI, eval('(' + m[1] + ')'));
}

function extractStrings(html) {
  const decode = (t) => t
    .replace(/&amp;/g, '&').replace(/&middot;/g, '·').replace(/&larr;/g, '←')
    .replace(/&rsquo;/g, '\u2019').replace(/&ndash;/g, '\u2013').replace(/&mdash;/g, '\u2014')
    .replace(/&hellip;/g, '\u2026').replace(/&nbsp;/g, ' ');
  const out = new Set();
  // strip comments/scripts/styles
  let s = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ');
  // attributes the localizer handles
  const attrRe = /\b(?:placeholder|title|aria-label|alt)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = attrRe.exec(s))) if (m[1].trim()) out.add(decode(m[1]).trim());
  // text nodes: content between > and <
  const textRe = />([^<>]+)</g;
  while ((m = textRe.exec(s))) {
    const t = decode(m[1]).replace(/\s+/g, ' ').trim();
    if (t && /[A-Za-z]/.test(t)) out.add(t);
  }
  return [...out];
}

function isCovered(str) {
  if (Object.prototype.hasOwnProperty.call(FILIPINO_UI, str)) return true;
  // dynamic patterns handled by regex rules in translatedUiValue
  const patterns = [
    /^Welcome, .+!$/, /^Welcome back, .+!$/, /^Could not load [^:]+:\s*.+$/,
    /^Could not check availability: .+$/, /^Could not load availability: .+$/,
    /^Could not load statistics.*$/, /^Missing required field\(s\): .+$/,
    /^Invalid (email|ID).+$/, /^Password must.+$/
  ];
  return patterns.some((p) => p.test(str));
}

const dir = path.join(__dirname, '..', 'public');
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : ['home.html', 'rooms-status.html', 'dashboard.html', 'reservation-form.html', 'admin-dashboard.html', 'admin-management.html', 'login.html', 'register.html', '404.html', 'admin-login.html'];

for (const f of files) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) continue;
  const missing = extractStrings(fs.readFileSync(p, 'utf8')).filter((s) => !isCovered(s));
  if (missing.length) {
    console.log(`\n=== ${f} (${missing.length} uncovered) ===`);
    missing.forEach((s) => console.log('  ' + JSON.stringify(s)));
  }
}

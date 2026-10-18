/* One-shot: convert the CAS lab HEIC photos in public/img to web-friendly JPG.
   Run: node scripts/convert-heic.js  (dev-only helper; safe to re-run) */
'use strict';
const fs = require('fs');
const path = require('path');
const convert = require('heic-convert');

const IMG_DIR = path.join(__dirname, '..', 'public', 'img');
const JOBS = [
  { src: 'btvded-fsm foodlab.heif', out: 'btvded-fsm-lab.jpg' },
  { src: 'btvtedlab.heif', out: 'btvded-lab.jpg' },
  { src: 'ctde-comlab.heif', out: 'ctde-com-lab.jpg' },
  { src: 'comlab307.heif', out: 'comlab-307.jpg' },
  { src: 'developmentlab.heif', out: 'development-lab.jpg' },
  { src: 'speech-language.heif', out: 'speech-language-lab.jpg' },
  { src: 'maclab.heif', out: 'mac-lab.jpg' },
  { src: 'openlab.heif', out: 'open-lab.jpg' },
  { src: 'cslab.heif', out: 'cs-lab.jpg' },
  { src: 'erplab.heif', out: 'erp-lab.jpg' },
  { src: 'itLab1.heif', out: 'it-lab1.jpg' },
  { src: 'itLab2.heif', out: 'it-lab2.jpg' },
  { src: 'lis-lab.heif', out: 'lis-lab.jpg' },
  { src: 'naslab.heif', out: 'nas-lab.jpg' },
  { src: 'riselab.heif', out: 'rise-lab.jpg' },
  { src: 'cookerylab.heif', out: 'cookery-lab.jpg' },
  { src: 'fabricationlab.heif', out: 'fabrication-lab.jpg' },
  { src: 'lathe.heif', out: 'lathe-lab.jpg' },
  { src: 'lathe2.heif', out: 'lathe2-lab.jpg' },
  { src: 'chemistrylab.heif', out: 'chemistry-lab.jpg' },
  { src: 'hydrauliclab.heif', out: 'hydraulic-lab.jpg' },
  { src: 'hc-lab.heic', out: 'hc-lab.jpg' },
  { src: 'physicslab.heif', out: 'physics-lab.jpg' },
  { src: 'ee-lab.heif', out: 'ee-lab.jpg' },
  { src: 'mechatronics-lab.heif', out: 'mechatronics-lab.jpg' },
  { src: 'me-lab.heif', out: 'me-lab.jpg' },
  { src: 'ectw-lab.heif', out: 'ectw-lab.jpg' }
];

(async () => {
  for (const job of JOBS) {
    const srcPath = path.join(IMG_DIR, job.src);
    const outPath = path.join(IMG_DIR, job.out);
    if (!fs.existsSync(srcPath)) { console.log(`SKIP (missing): ${job.src}`); continue; }
    const input = fs.readFileSync(srcPath);
    const buffer = await convert({ buffer: input, format: 'JPEG', quality: 0.82 });
    fs.writeFileSync(outPath, buffer);
    console.log(`${job.src} -> ${job.out} (${(buffer.length / 1024).toFixed(0)} KB)`);
  }
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });

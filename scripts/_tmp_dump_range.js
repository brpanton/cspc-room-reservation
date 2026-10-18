const fs = require('fs');
const [,, file, a, b] = process.argv;
const lines = fs.readFileSync(file, 'utf8').split('\n');
const start = Number(a), end = Number(b);
for (let i = start; i <= end && i <= lines.length; i++) {
  process.stdout.write(String(i).padStart(4) + ': ' + JSON.stringify(lines[i - 1]) + '\n');
}

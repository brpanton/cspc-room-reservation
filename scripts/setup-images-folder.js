const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const imgDir = path.join(publicDir, 'img');
const imagesDir = path.join(publicDir, 'images');
const buildingsDir = path.join(imagesDir, 'buildings');
const labsDir = path.join(imagesDir, 'laboratories');

fs.mkdirSync(buildingsDir, { recursive: true });
fs.mkdirSync(labsDir, { recursive: true });

const buildingCopies = [
  ['640fd213-b190-4dd5-85ac-f5e48efaa979.jpg', 'ccs-building.jpg'],
  ['86d642c7-aab7-4114-85ec-75a84ae1b8c0.jpg', 'cas-building.jpg'],
  ['430ad98a-b78e-4c54-b0fa-803c6eed5ef3.jpg', 'green-building.jpg'],
  ['6073d9fd-be4f-4d55-bc84-bde51aa8db51.jpg', 'academic-building-2.jpg'],
  ['79f0c07c-b23e-4644-9550-536b84c2f5b4.jpg', 'academic-building-1.jpg'],
  ['fc87102f-d288-4b44-81f1-022acfccb7c6.jpg', 'multi-purpose-building.jpg'],
  ['e4edc818-0707-48a1-87d1-cb81125f6ee4.jpg', 'chs-building.jpg'],
  ['6073d9fd-be4f-4d55-bc84-bde51aa8db51.jpg', 'citd-building.jpg'],
  ['79f0c07c-b23e-4644-9550-536b84c2f5b4.jpg', 'lsb-building.jpg']
];

for (const [src, dest] of buildingCopies) {
  const srcPath = path.join(imgDir, src);
  const destPath = path.join(buildingsDir, dest);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied building photo: ${src} -> ${dest}`);
  }
}

// Copy lab photos
const labFiles = fs.readdirSync(imgDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
for (const file of labFiles) {
  const srcPath = path.join(imgDir, file);
  const destPath = path.join(labsDir, file);
  fs.copyFileSync(srcPath, destPath);
}

console.log('Finished populating public/images/ structure.');


const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();
const avatarDir = path.join(__dirname, '..', 'uploads', 'avatars');
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      const err = new Error('Choose a JPEG, PNG, or WebP image.');
      err.status = 400;
      return callback(err);
    }
    callback(null, true);
  }
});

function imageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mime: 'image/jpeg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', mime: 'image/png' };
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { extension: 'webp', mime: 'image/webp' };
  }
  return null;
}

function oldAvatarPath(url) {
  const match = /^\/uploads\/avatars\/([a-f0-9-]+\.(?:jpg|png|webp))$/i.exec(String(url || ''));
  return match ? path.join(avatarDir, match[1]) : null;
}

router.use(requireLogin);

router.post('/avatar', (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      err.status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      err.message = err.code === 'LIMIT_FILE_SIZE'
        ? 'The avatar must be 3 MB or smaller.'
        : 'Upload one image file at a time.';
    }
    next(err);
  });
}, async (req, res, next) => {
  let savedPath;
  try {
    if (!req.file) {
      const err = new Error('Select an avatar image to upload.');
      err.status = 400;
      throw err;
    }

    const detected = imageType(req.file.buffer);
    if (!detected || detected.mime !== req.file.mimetype) {
      const err = new Error('The selected file is not a valid JPEG, PNG, or WebP image.');
      err.status = 400;
      throw err;
    }

    await fs.mkdir(avatarDir, { recursive: true });
    const filename = `${crypto.randomUUID()}.${detected.extension}`;
    savedPath = path.join(avatarDir, filename);
    await fs.writeFile(savedPath, req.file.buffer, { flag: 'wx' });

    const avatarUrl = `/uploads/avatars/${filename}`;
    const result = await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, req.session.user.id]);
    if (!result.rowCount) {
      const err = new Error('Your account could not be found.');
      err.status = 404;
      throw err;
    }

    const previousPath = oldAvatarPath(req.session.user.avatar_url);
    req.session.user.avatar_url = avatarUrl;
    if (previousPath && previousPath !== savedPath) fs.unlink(previousPath).catch(() => {});
    res.json({ message: 'Profile photo updated.', avatar_url: avatarUrl });
  } catch (err) {
    if (savedPath) await fs.unlink(savedPath).catch(() => {});
    next(err);
  }
});

router.delete('/avatar', async (req, res, next) => {
  try {
    await pool.query('UPDATE users SET avatar_url = NULL WHERE id = $1', [req.session.user.id]);
    const previousPath = oldAvatarPath(req.session.user.avatar_url);
    req.session.user.avatar_url = null;
    if (previousPath) fs.unlink(previousPath).catch(() => {});
    res.json({ message: 'Profile photo removed.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

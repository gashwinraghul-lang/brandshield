const fs = require('node:fs/promises');
const path = require('node:path');
const multer = require('multer');
const mammoth = require('mammoth');
const config = require('../config');
const { randomToken } = require('../auth/crypto');

const ALLOWED_EXTENSIONS = ['.txt', '.md', '.docx', '.png', '.jpg', '.jpeg'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ext === '.jpeg' ? '.jpg' : ext;
    cb(null, `${Date.now()}-${randomToken(8)}${safeExt}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    const error = new Error('Unsupported file type. Upload TXT, MD, DOCX, PNG or JPG.');
    error.status = 400;
    return cb(error);
  }
  // Only allow declared MIME types we understand; never trust the extension alone.
  const allowedMimes = new Set([
    'text/plain',
    'text/markdown',
    'application/octet-stream',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
  ]);
  if (file.mimetype && !allowedMimes.has(file.mimetype)) {
    const error = new Error('Unsupported file type. Upload TXT, MD, DOCX, PNG or JPG.');
    error.status = 400;
    return cb(error);
  }
  return cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

function isImage(file) {
  return Boolean(file && (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg' || /\.(png|jpe?g)$/i.test(file.originalname)));
}

function isDocx(file) {
  return Boolean(file && /\.docx$/i.test(file.originalname));
}

async function extractText(file) {
  if (!file) return '';
  if (isDocx(file)) {
    const result = await mammoth.extractRawText({ path: file.path });
    return String(result.value || '').trim();
  }
  if (isImage(file)) return '';
  return (await fs.readFile(file.path, 'utf8')).trim();
}

async function removeFile(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch {
    // File may already be gone; retention should not fail because of that.
  }
}

module.exports = { upload, extractText, removeFile, isImage, isDocx };

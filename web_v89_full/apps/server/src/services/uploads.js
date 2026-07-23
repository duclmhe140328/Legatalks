import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import multer from 'multer';
import sharp from 'sharp';
import { env } from '../config/env.js';

const configuredRoot = String(env.uploadDir || '').trim();
export const uploadRoot = configuredRoot
  ? path.resolve(configuredRoot)
  : path.join(os.homedir(), '.nexora-connect', 'uploads');
const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(serviceDirectory, '../..');
const legacyUploadRoots = [...new Set([path.resolve('uploads'), path.join(serverRoot, 'uploads')])];

await fs.mkdir(uploadRoot, { recursive: true });

// Tự động mang media từ các bản source cũ sang vùng dữ liệu bền vững ngoài project.
for (const legacyUploadRoot of legacyUploadRoots) {
  if (path.resolve(legacyUploadRoot) === path.resolve(uploadRoot)) continue;
  try {
    const entries = await fs.readdir(legacyUploadRoot, { withFileTypes: true });
    await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
      const source = path.join(legacyUploadRoot, entry.name);
      const target = path.join(uploadRoot, entry.name);
      try { await fs.copyFile(source, target, 1); } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }));
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Legacy upload migration warning:', error.message);
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  }
});

export const uploader = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const allowed =
      /^(image|video|audio)\//.test(mime) ||
      /(pdf|zip|rar|7z|gzip|tar|text|csv|json|xml|octet-stream|msword|officedocument|openxmlformats|wordprocessingml|spreadsheetml|presentationml)/.test(mime);
    cb(null, allowed);
  }
});

export async function processUpload(file) {
  const publicPath = `/uploads/${file.filename}`;
  const base = {
  url: `${env.publicServerUrl}${publicPath}`,
  name: file.originalname,
  mimeType: file.mimetype,
  size: file.size,

  type: file.mimetype.startsWith('video/')
    ? 'video'
    : file.mimetype.startsWith('image/')
      ? 'image'
      : file.mimetype.startsWith('audio/')
        ? 'audio'
        : 'file',
};

  if (!file.mimetype.startsWith('image/')) return base;

  const parsed = path.parse(file.filename);
  const optimizedName = `${parsed.name}-optimized.webp`;
  const thumbName = `${parsed.name}-thumb.webp`;
  const optimizedPath = path.join(uploadRoot, optimizedName);
  const thumbPath = path.join(uploadRoot, thumbName);

  const image = sharp(file.path).rotate();
  const metadata = await image.metadata();
  await image.clone().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(optimizedPath);
  await image.clone().resize({ width: 420, height: 420, fit: 'cover' }).webp({ quality: 72 }).toFile(thumbPath);

  return {
    ...base,
    url: `${env.publicServerUrl}/uploads/${optimizedName}`,
    hdUrl: `${env.publicServerUrl}${publicPath}`,
    thumbUrl: `${env.publicServerUrl}/uploads/${thumbName}`,
    width: metadata.width,
    height: metadata.height
  };
}

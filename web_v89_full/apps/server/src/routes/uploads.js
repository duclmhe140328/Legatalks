import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { uploader, processUpload } from '../services/uploads.js';

const router = express.Router();
router.post('/', requireAuth, uploader.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Chưa chọn file.' });
  const result = await processUpload(req.file);
  res.status(201).json(result);
}));
export default router;

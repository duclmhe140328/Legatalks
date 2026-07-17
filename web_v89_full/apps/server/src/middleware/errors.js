export function notFound(req, res) {
  res.status(404).json({ message: `Không tìm thấy ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err, req, res, next) {
  console.error(err);
  if (err.code === 11000) return res.status(409).json({ message: 'Dữ liệu đã tồn tại.', fields: err.keyValue });
  if (err.name === 'ValidationError') return res.status(400).json({ message: err.message });
  if (err.name === 'MulterError') return res.status(400).json({ message: err.message });
  res.status(err.status || 500).json({ message: err.message || 'Lỗi máy chủ.' });
}

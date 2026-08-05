import { ApiError } from '../lib/errors.js';

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err?.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid id format' });
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? 'value';
    return res.status(409).json({ error: `${field} is already taken` });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File is too large' });
  }
  if (err?.status || err?.statusCode) {
    return res.status(err.status ?? err.statusCode).json({ error: err.message ?? 'Request failed' });
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
}

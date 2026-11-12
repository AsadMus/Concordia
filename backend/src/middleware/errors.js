// Wraps async route handlers so thrown errors reach the error handler.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Turns database / validation errors into clean JSON responses.
function errorHandler(err, req, res, next) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.code === '23505') return res.status(409).json({ error: 'That value is already in use' });
  if (err.code === '23514' || err.code === '22P02' || err.code === '23502')
    return res.status(400).json({ error: 'Invalid or missing field', constraint: err.constraint || err.column });
  if (err.code === '23503') return res.status(400).json({ error: 'Referenced record does not exist' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = { asyncHandler, errorHandler, httpError };

/**
 * 404 catch-all handler for routes that don't match any defined route.
 * Must be registered AFTER all route handlers but BEFORE the error handler.
 */
export default function notFoundHandler(req, res, next) {
  const err = new Error(`Page not found: ${req.originalUrl}`);
  err.status = 404;
  next(err);
}

/**
 * Express error-handling middleware.
 * MUST have exactly 4 parameters for Express to recognize it as an error handler.
 */

// eslint-disable-next-line no-unused-vars
export default function errorHandler(err, req, res, next) {
  // If headers already sent, delegate to Express default handler
  if (res.headersSent) {
    return next(err);
  }

  const isDev = process.env.NODE_ENV !== 'production';
  const status = err.status || err.statusCode || 500;

  // Logging -- skip stack traces for 404s (they're expected, not bugs)
  if (status === 404) {
    console.warn(`404: ${req.originalUrl}`);
  } else {
    console.error('Unhandled error:', err.message);
    if (isDev) {
      console.error(err.stack);
    }
  }

  // Detect HTMX requests
  const isHtmx = req.get('HX-Request') === 'true';

  // Set Vary header for proper caching
  res.setHeader('Vary', 'HX-Request');

  // Build template data
  const templateData = {
    title: `Error ${status}`,
    status,
    message: err.message || 'Internal Server Error',
    stack: isDev ? err.stack : null,
    activePage: ''
  };

  // Render response
  if (isHtmx) {
    let html = `<h1>Error ${status}</h1><p>${templateData.message}</p>`;
    if (templateData.stack) {
      html += `<pre><code>${templateData.stack}</code></pre>`;
    }
    html += '<p><a href="/">Return to Dashboard</a></p>';
    return res.status(status).send(html);
  }

  res.status(status).render('error', templateData);
}

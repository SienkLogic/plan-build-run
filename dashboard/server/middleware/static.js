'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

/**
 * Set up static file serving and SPA fallback.
 *
 * If distDir does not exist, static serving is skipped entirely
 * (server still works for API routes without a frontend build).
 *
 * @param {import('express').Express} app
 * @param {string} distDir - Path to built frontend assets
 */
function setupStatic(app, distDir) {
  if (!fs.existsSync(distDir)) {
    return;
  }

  // Serve static files from distDir
  app.use(express.static(distDir));

  // SPA fallback: serve index.html for GET requests not matching /api/*
  app.get(/^\/(?!api\/).*/, (req, res) => {
    const indexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });
}

module.exports = { setupStatic };

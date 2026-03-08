'use strict';

const express = require('express');

const router = express.Router();
const startTime = Date.now();

/**
 * GET /api/health
 * Returns server health information.
 */
router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: '4.0.0',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;

'use strict';
// Re-export from plugins/pbr/scripts/pbr-tools.js so hooks/ scripts
// can require('./pbr-tools') without duplicating the implementation.
const path = require('path');
module.exports = require(path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'pbr-tools.js'));

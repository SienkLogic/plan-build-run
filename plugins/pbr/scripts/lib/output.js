// lib/output.js — Output formatting helpers for Plan-Build-Run tools.

const fs = require('fs');
const os = require('os');
const path = require('path');

function output(data, raw, rawValue) {
  if (raw && rawValue !== undefined) {
    process.stdout.write(String(rawValue));
  } else {
    const json = JSON.stringify(data, null, 2);
    if (json.length > 8192) {
      const tmpPath = path.join(os.tmpdir(), `pbr-${Date.now()}.json`);
      fs.writeFileSync(tmpPath, json, 'utf8');
      process.stdout.write('@file:' + tmpPath + '\n');
    } else {
      process.stdout.write(json + '\n');
    }
  }
  process.exit(0);
}

function error(msg) {
  process.stderr.write('Error: ' + msg + '\n');
  process.exit(1);
}

module.exports = { output, error };

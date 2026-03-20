#!/usr/bin/env node
/**
 * Copy PBR hooks to dist for installation.
 *
 * Dynamically discovers all .js files in hooks/ and copies them along
 * with hooks.json and hooks-schema.json to hooks/dist/.
 */

const fs = require('fs');
const path = require('path');

const HOOKS_DIR = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts');
const DIST_DIR = path.join(__dirname, '..', 'hooks', 'dist');

// Static assets to copy alongside hook scripts
const STATIC_FILES = [
  'hooks.json',
  'hooks-schema.json'
];

function build() {
  // Ensure dist directory exists
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  // Discover all .js files in hooks/
  const jsFiles = fs.readdirSync(HOOKS_DIR).filter(f => f.endsWith('.js'));

  // Copy all .js hook scripts
  let copied = 0;
  for (const file of jsFiles) {
    const src = path.join(HOOKS_DIR, file);
    const dest = path.join(DIST_DIR, file);

    console.log(`Copying ${file}...`);
    fs.copyFileSync(src, dest);
    console.log(`  → ${dest}`);
    copied++;
  }

  // Copy static assets (hooks.json, hooks-schema.json)
  for (const file of STATIC_FILES) {
    const src = path.join(HOOKS_DIR, file);
    const dest = path.join(DIST_DIR, file);

    if (!fs.existsSync(src)) {
      console.warn(`Warning: ${file} not found, skipping`);
      continue;
    }

    console.log(`Copying ${file}...`);
    fs.copyFileSync(src, dest);
    console.log(`  → ${dest}`);
    copied++;
  }

  console.log(`\nBuild complete. ${copied} files copied.`);
}

build();

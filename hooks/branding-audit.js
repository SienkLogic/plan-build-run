#!/usr/bin/env node
"use strict";

/**
 * branding-audit.js — Detect upstream GSD framework references in PBR code.
 *
 * Usage:  node scripts/branding-audit.js [directory]
 *
 * Scans the target directory (default: plugins/pbr/) for two categories of
 * upstream framework leakage:
 *   1. String matches  — literal references to GSD naming
 *   2. Structural patterns — file names, imports, path refs, template vars
 *
 * Exit 0 (PASS) when zero matches found; exit 1 (FAIL) otherwise.
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SCAN_EXTENSIONS = new Set([".js", ".md", ".tmpl", ".json"]);
const SKIP_DIRS = new Set(["node_modules", ".git"]);

// Category 1: String match patterns (applied per-line)
const STRING_PATTERNS = [
  { name: "get-shit-done (hyphenated)", regex: /get-shit-done/gi },
  { name: "get.shit.done (dotted)", regex: /get\.shit\.done/gi },
  { name: "gsd (standalone word)", regex: /\bgsd\b/gi },
  { name: "/gsd: (slash-command)", regex: /\/gsd:/gi },
  { name: "gsd-tools (tool name)", regex: /gsd-tools/gi },
  { name: "gsd-verifier (agent name)", regex: /gsd-verifier/gi },
];

// Category 2: Structural patterns (applied per-line)
const STRUCTURAL_PATTERNS = [
  {
    name: "require/import gsd module",
    regex: /(?:require\s*\(\s*['"][^'"]*gsd[^'"]*['"]\s*\))|(?:from\s+['"][^'"]*gsd[^'"]*['"])/gi,
  },
  {
    name: "workflow path with gsd",
    regex: /(?:get-shit-done|\.claude\/get-shit-done)/gi,
  },
  {
    name: "gsd_ template variable",
    regex: /\bgsd_\w+/gi,
  },
];

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

function collectFiles(dir, selfPath) {
  const results = [];

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        results.push(...collectFiles(fullPath, selfPath));
      }
      continue;
    }

    if (!entry.isFile()) continue;

    // Skip self
    if (path.resolve(fullPath) === selfPath) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!SCAN_EXTENSIONS.has(ext)) continue;

    results.push(fullPath);
  }

  return results;
}

// ---------------------------------------------------------------------------
// File-name structural check
// ---------------------------------------------------------------------------

function checkFileName(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (/gsd/i.test(base)) {
    return { pattern: "gsd in filename", file: filePath, line: 0, text: base };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Line scanning
// ---------------------------------------------------------------------------

function scanFile(filePath) {
  const stringMatches = [];
  const structuralMatches = [];

  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return { stringMatches, structuralMatches };
  }

  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    for (const pat of STRING_PATTERNS) {
      pat.regex.lastIndex = 0;
      if (pat.regex.test(line)) {
        stringMatches.push({
          pattern: pat.name,
          file: filePath,
          line: lineNum,
          text: line.trim(),
        });
      }
    }

    for (const pat of STRUCTURAL_PATTERNS) {
      pat.regex.lastIndex = 0;
      if (pat.regex.test(line)) {
        structuralMatches.push({
          pattern: pat.name,
          file: filePath,
          line: lineNum,
          text: line.trim(),
        });
      }
    }
  }

  return { stringMatches, structuralMatches };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printCategory(label, matches) {
  if (matches.length === 0) {
    console.log(`\n  ${label}: 0 matches`);
    return;
  }

  console.log(`\n  ${label}: ${matches.length} match(es)`);

  // Group by pattern
  const groups = {};
  for (const m of matches) {
    if (!groups[m.pattern]) groups[m.pattern] = [];
    groups[m.pattern].push(m);
  }

  for (const [pattern, items] of Object.entries(groups)) {
    console.log(`    [${pattern}]`);
    for (const item of items) {
      const loc = item.line > 0 ? `${item.file}:${item.line}` : item.file;
      console.log(`      ${loc}  ${item.text}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const targetDir = process.argv[2] || "plugins/pbr/";
  const resolved = path.resolve(targetDir);
  const selfPath = path.resolve(__filename);

  if (!fs.existsSync(resolved)) {
    console.error(`Error: directory not found: ${resolved}`);
    process.exit(2);
  }

  console.log(`Branding audit: scanning ${resolved}`);

  const files = collectFiles(resolved, selfPath);
  console.log(`Files to scan: ${files.length}`);

  const allString = [];
  const allStructural = [];

  // Check file names first
  for (const f of files) {
    const hit = checkFileName(f);
    if (hit) allStructural.push(hit);
  }

  // Scan file contents
  for (const f of files) {
    const { stringMatches, structuralMatches } = scanFile(f);
    allString.push(...stringMatches);
    allStructural.push(...structuralMatches);
  }

  const total = allString.length + allStructural.length;

  console.log("\n--- Results ---");
  printCategory("String matches", allString);
  printCategory("Structural patterns", allStructural);

  console.log("\n" + "=".repeat(60));
  if (total === 0) {
    console.log("BRANDING AUDIT: PASS (0 matches)");
    process.exit(0);
  } else {
    console.log(`BRANDING AUDIT: FAIL (${total} matches)`);
    process.exit(1);
  }
}

if (require.main === module || process.argv[1] === __filename) { main(); }
module.exports = { collectFiles, scanFile, checkFileName };

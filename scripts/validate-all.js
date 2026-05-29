#!/usr/bin/env node
'use strict';

// Validates every pack's manifest by running `tapestry validate` in each pack
// directory. Wired as `npm test` so contributors and CI get a fast, local,
// runnable check before publish.
//
// This is a manifest lint, NOT a substitute for the engine's load-time
// composition gate (see TESTING.md) — it's the cheap first line that catches a
// broken pack.yaml without booting the engine. Requires the tapestry CLI on PATH
// (`npm install -g @tapestry-mud/cli`).

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PACKS_DIR = path.join(__dirname, '..', 'packages', '@tapestry');

function packDirs() {
  return fs
    .readdirSync(PACKS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(PACKS_DIR, e.name, 'pack.yaml')))
    .map((e) => path.join(PACKS_DIR, e.name));
}

function main() {
  const dirs = packDirs();
  if (dirs.length === 0) {
    console.error('No packs found under packages/@tapestry');
    process.exit(1);
  }

  const failed = [];
  for (const dir of dirs) {
    const name = path.basename(dir);
    process.stdout.write(`\nValidating @tapestry/${name}...\n`);
    try {
      execSync('tapestry validate', { cwd: dir, stdio: 'inherit' });
    } catch {
      failed.push(name);
    }
  }

  if (failed.length > 0) {
    console.error(`\n${failed.length} pack(s) failed validation: ${failed.join(', ')}`);
    process.exit(1);
  }
  console.log(`\nAll ${dirs.length} packs valid.`);
}

main();

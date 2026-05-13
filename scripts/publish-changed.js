#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

const PACKS_DIR = path.join(__dirname, '..', 'packages', '@tapestry');

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'inherit', ...opts });
}

function runCapture(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

const changedFiles = runCapture('git diff --name-only HEAD~1 HEAD').split('\n').filter(Boolean);

const changedPacks = new Set();
for (const file of changedFiles) {
  const match = file.match(/^packages\/@tapestry\/([^/]+)\//);
  if (match) {
    changedPacks.add(match[1]);
  }
}

if (changedPacks.size === 0) {
  console.log('No pack directories changed. Nothing to publish.');
  process.exit(0);
}

const ciToken = process.env.REGISTRY_CI_TOKEN;
if (!ciToken) {
  console.error('ERROR: REGISTRY_CI_TOKEN environment variable not set');
  process.exit(1);
}

run(`tapestry login --token ${ciToken}`);

for (const packName of changedPacks) {
  const packDir = path.join(PACKS_DIR, packName);
  const manifestPath = path.join(packDir, 'tapestry.yaml');

  if (!fs.existsSync(manifestPath)) {
    console.error(`ERROR: No tapestry.yaml found in packages/@tapestry/${packName}`);
    process.exit(1);
  }

  const manifest = yaml.load(fs.readFileSync(manifestPath, 'utf8'));
  const { name: scopedName, version } = manifest;

  console.log(`\nProcessing ${scopedName}@${version}...`);

  try {
    run('tapestry publish', { cwd: packDir });
  } catch {
    console.error(`\nERROR: ${scopedName}@${version} already published - bump version in tapestry.yaml before merging`);
    process.exit(1);
  }

  run(`tapestry dist-tag set ${scopedName} stable ${version}`);

  console.log(`Published and tagged ${scopedName}@${version} as stable`);
}

console.log('\nAll changed packs published successfully.');

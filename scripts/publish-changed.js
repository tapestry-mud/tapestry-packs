#!/usr/bin/env node
'use strict';

// Publishes every pack whose pack.yaml version is not yet on the registry — i.e. a
// brand-new pack the registry has never seen, OR an existing pack with a bumped version.
//
// This is deliberately NOT based on a git diff. The old approach (`git diff HEAD~1 HEAD`)
// only inspected the tip commit, so any pack introduced or bumped in a non-tip commit of a
// multi-commit push was silently skipped (e.g. a new dependency pack added before the
// release commit). Comparing local manifest versions against the registry is the source of
// truth: it's idempotent, immune to commit-range/squash/force-push quirks, and re-runnable.

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

const PACKS_DIR = path.join(__dirname, '..', 'packages', '@tapestry');
const REGISTRY = (process.env.TAPESTRY_REGISTRY || 'https://registry.tapestryengine.com').replace(/\/+$/, '');
const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'inherit', ...opts });
}

// True if this exact version is already published. A 404 on the package means it's a
// brand-new pack (publish it); otherwise we check the version list.
async function isVersionPublished(scopedName, version) {
  const res = await fetch(`${REGISTRY}/v1/packages/${scopedName}`);
  if (res.status === 404) {
    return false;
  }
  if (!res.ok) {
    throw new Error(`Registry lookup failed for ${scopedName}: HTTP ${res.status}`);
  }
  const data = await res.json();
  const versions = Array.isArray(data.versions) ? data.versions.map((v) => v.version) : [];
  return versions.includes(version);
}

function readPacks() {
  const packs = [];
  for (const entry of fs.readdirSync(PACKS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const packDir = path.join(PACKS_DIR, entry.name);
    const manifestPath = path.join(packDir, 'pack.yaml');
    if (!fs.existsSync(manifestPath)) {
      continue;
    }
    const manifest = yaml.load(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest || !manifest.name || !manifest.version) {
      console.error(`ERROR: packages/@tapestry/${entry.name}/pack.yaml is missing name or version`);
      process.exit(1);
    }
    packs.push({
      packDir,
      scopedName: manifest.name,
      version: String(manifest.version),
      loadOrder: typeof manifest.load_order === 'number' ? manifest.load_order : 0,
    });
  }
  return packs;
}

async function main() {
  const packs = readPacks();
  const toPublish = [];
  for (const pack of packs) {
    const published = await isVersionPublished(pack.scopedName, pack.version);
    if (published) {
      console.log(`= ${pack.scopedName}@${pack.version} already published — skipping`);
    } else {
      console.log(`+ ${pack.scopedName}@${pack.version} not on registry — will publish`);
      toPublish.push(pack);
    }
  }

  if (toPublish.length === 0) {
    console.log('\nAll packs are up to date on the registry. Nothing to publish.');
    return;
  }

  // Publish lowest load_order first so dependencies land before dependents
  // (a dependency pack conventionally loads — and thus sorts — before its consumers).
  toPublish.sort((a, b) => a.loadOrder - b.loadOrder);

  if (DRY_RUN) {
    console.log(`\n[dry-run] Would publish (in order): ${toPublish.map((p) => `${p.scopedName}@${p.version}`).join(', ')}`);
    return;
  }

  for (const pack of toPublish) {
    console.log(`\nProcessing ${pack.scopedName}@${pack.version}...`);
    try {
      run('tapestry publish', { cwd: pack.packDir });
    } catch (e) {
      const msg = e.stderr ? e.stderr.toString().trim() : e.message;
      console.error(`\nERROR: publish failed for ${pack.scopedName}@${pack.version}: ${msg}`);
      process.exit(1);
    }
    console.log(`Published and tagged ${pack.scopedName}@${pack.version} as stable`);
  }

  console.log('\nAll new pack versions published successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

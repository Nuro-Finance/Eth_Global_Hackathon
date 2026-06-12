#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// postinstall-fix-ink-react.js — restore React 17 scope under ink (S32)
//
// Why this script exists: the LayerZero `ink` CLI rendering library bundles
// react-reconciler@0.26.2 which expects React 17. Our top-level React is 19
// (Next.js FE requirement). npm hoists react-reconciler to top-level and it
// resolves React from there → React 19's API has removed `ReactCurrentOwner`
// → react-reconciler crashes on first use → hardhat compile fails before
// LZ tasks even start running.
//
// We tried npm `overrides` with `"ink": { "react": "17.0.2" }` — npm
// accepts the syntax but doesn't actually create the separate scoped
// install (likely a hoisting/dedup heuristic disagrees with the override
// intent). Using patch-package would also work but adds a tool dependency
// for a fix that's just "copy two directories."
//
// This script does the surgical thing: ensure
// node_modules/ink/node_modules/{react,react-reconciler} exist with the
// correct versions, sourced from where they're already installed in
// other scopes. Idempotent — skips silently when the files are already
// in place. Fails soft so a missing source dir doesn't abort npm install.
//
// Removal path: when LZ ecosystem ships ink with a React-19-compatible
// react-reconciler, delete this script + its postinstall hook.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INK_NESTED = path.join(ROOT, 'node_modules/ink/node_modules');
const TARGET_REACT = path.join(INK_NESTED, 'react');
const TARGET_RECONCILER = path.join(INK_NESTED, 'react-reconciler');

// React 17 lives under the LZ toolbox's scoped node_modules — it's already
// pinned there as a transitive of @layerzerolabs/toolbox-hardhat.
const SOURCE_REACT = path.join(ROOT, 'node_modules/@layerzerolabs/toolbox-hardhat/node_modules/react');

// react-reconciler@0.26.2 is at top-level (the version that's incompatible
// with our top-level React 19, but compatible with React 17 locally). We
// copy it into ink's nested scope so its require('react') resolves locally.
const SOURCE_RECONCILER = path.join(ROOT, 'node_modules/react-reconciler');

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function readVersion(pkgDir) {
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    return pj.version;
  } catch { return null; }
}

function copyDir(src, dst) {
  // Node 16+ has fs.cpSync. Use { recursive: true } for full tree copy.
  fs.cpSync(src, dst, { recursive: true, force: true });
}

function tryCopy(label, src, dst, expectedVersionPrefix) {
  if (!exists(src)) {
    console.warn(`[postinstall:ink-react] source missing for ${label}: ${src} — skipping`);
    return false;
  }
  const sourceVersion = readVersion(src);
  if (expectedVersionPrefix && sourceVersion && !sourceVersion.startsWith(expectedVersionPrefix)) {
    console.warn(`[postinstall:ink-react] ${label} version ${sourceVersion} doesn't match expected ${expectedVersionPrefix}* — skipping (ink may be on a new ABI)`);
    return false;
  }

  // Idempotent: skip when target version already matches.
  if (exists(dst)) {
    const targetVersion = readVersion(dst);
    if (targetVersion === sourceVersion) return false;
    fs.rmSync(dst, { recursive: true, force: true });
  }

  copyDir(src, dst);
  console.log(`[postinstall:ink-react] placed ${label}@${sourceVersion} → ${path.relative(ROOT, dst)}`);
  return true;
}

(function main() {
  if (!exists(path.join(ROOT, 'node_modules/ink'))) {
    // ink isn't installed — likely a workspace where LZ deps aren't pulled in.
    // Nothing to fix.
    return;
  }

  fs.mkdirSync(INK_NESTED, { recursive: true });

  let didReact = tryCopy('react', SOURCE_REACT, TARGET_REACT, '17.');
  let didReconciler = tryCopy('react-reconciler', SOURCE_RECONCILER, TARGET_RECONCILER, '0.26');

  if (!didReact && !didReconciler) {
    console.log('[postinstall:ink-react] already in place — no changes');
  }
})();

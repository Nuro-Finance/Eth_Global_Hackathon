#!/usr/bin/env node
/**
 * Dependency verification gate.
 *
 * Scans every .ts/.tsx/.js/.jsx file in src/ for external npm imports and
 * verifies each is declared in package.json (dependencies or devDependencies).
 *
 * Failure blocks the commit via .husky/pre-push.
 *
 * Born from 2026-04-17 incident: next, react, react-dom, next-intl, and 35+
 * other FE packages were imported throughout src/ but NEVER declared in
 * package.json. Yarn Berry v4 tolerated the omission; the npm migration
 * (commit c578c18) exposed it when `npm install` purged everything undeclared
 * from node_modules. FE build died with "Cannot find package 'next-intl'".
 *
 * This gate ensures it can never happen again: every external import has a
 * corresponding declaration.
 *
 * Usage:
 *   node scripts/verify-deps.js            # verify, exit 1 on failure
 *   node scripts/verify-deps.js --list     # list all detected imports
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const PKG_JSON = path.join(ROOT, 'package.json');

// Node built-in modules (do not need to be declared)
const NODE_BUILTINS = new Set([
    'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
    'constants', 'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http',
    'http2', 'https', 'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
    'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
    'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty', 'url',
    'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]);

function isNodeBuiltin(name) {
    return NODE_BUILTINS.has(name) || name.startsWith('node:');
}

function extractPackageName(importPath) {
    // Strip node: prefix
    if (importPath.startsWith('node:')) return null;
    // Relative paths
    if (importPath.startsWith('.') || importPath.startsWith('/')) return null;
    // Path aliases (tsconfig paths like @/components/...)
    if (importPath.startsWith('@/')) return null;
    // Scoped package: @scope/name[/sub]
    if (importPath.startsWith('@')) {
        const parts = importPath.split('/');
        if (parts.length >= 2) return parts[0] + '/' + parts[1];
        return null;
    }
    // Regular package: name[/sub]
    return importPath.split('/')[0];
}

function walkDir(dir, out = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === '.next' || e.name === 'dist') continue;
            walkDir(full, out);
        } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name) && !e.name.endsWith('.d.ts')) {
            out.push(full);
        }
    }
    return out;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import\s+(?:[^'"]*?\s+from\s+)?|export\s+[^'"]*?\s+from\s+|require\s*\()\s*['"]([^'"]+)['"]/g;

function scanFile(file) {
    const content = fs.readFileSync(file, 'utf8');
    const pkgs = new Set();
    let m;
    while ((m = IMPORT_RE.exec(content))) {
        const pkg = extractPackageName(m[1]);
        if (pkg && !isNodeBuiltin(pkg)) pkgs.add(pkg);
    }
    return pkgs;
}

function main() {
    const pkgJson = JSON.parse(fs.readFileSync(PKG_JSON, 'utf8'));
    const declared = new Set([
        ...Object.keys(pkgJson.dependencies || {}),
        ...Object.keys(pkgJson.devDependencies || {}),
        ...Object.keys(pkgJson.peerDependencies || {}),
        ...Object.keys(pkgJson.optionalDependencies || {}),
    ]);

    // Check next.config.js, postcss.config.mjs, tailwind.config.mjs too —
    // these run during build and their imports must be declared.
    const extraConfigs = [
        path.join(ROOT, 'next.config.js'),
        path.join(ROOT, 'next.config.mjs'),
        path.join(ROOT, 'postcss.config.js'),
        path.join(ROOT, 'postcss.config.mjs'),
        path.join(ROOT, 'tailwind.config.js'),
        path.join(ROOT, 'tailwind.config.mjs'),
    ].filter(fs.existsSync);

    const files = [...walkDir(SRC), ...extraConfigs];

    const imports = new Map(); // pkg → set of files that import it
    for (const f of files) {
        const pkgs = scanFile(f);
        for (const p of pkgs) {
            if (!imports.has(p)) imports.set(p, new Set());
            imports.get(p).add(path.relative(ROOT, f));
        }
    }

    if (process.argv.includes('--list')) {
        const sorted = [...imports.keys()].sort();
        for (const pkg of sorted) {
            const status = declared.has(pkg) ? '✓' : '✗';
            console.log(`${status} ${pkg}  (${imports.get(pkg).size} file${imports.get(pkg).size === 1 ? '' : 's'})`);
        }
        return;
    }

    const missing = [];
    for (const [pkg, files] of imports) {
        if (!declared.has(pkg)) missing.push({ pkg, files: [...files] });
    }

    if (missing.length === 0) {
        console.log(`[verify-deps] ✓ All ${imports.size} imported packages are declared in package.json`);
        process.exit(0);
    }

    console.error(`[verify-deps] ✗ ${missing.length} package(s) imported but NOT declared in package.json:`);
    console.error('');
    for (const { pkg, files } of missing.sort((a, b) => a.pkg.localeCompare(b.pkg))) {
        console.error(`  ✗ ${pkg}`);
        const show = files.slice(0, 3);
        for (const f of show) console.error(`      ${f}`);
        if (files.length > 3) console.error(`      ...and ${files.length - 3} more`);
    }
    console.error('');
    console.error('[verify-deps] FIX: add the missing packages to package.json under "dependencies" or "devDependencies", then run your package manager install.');
    console.error('[verify-deps] This gate exists because of the 2026-04-17 incident — undeclared FE deps survived only because yarn.lock hid them.');
    process.exit(1);
}

main();

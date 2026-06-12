/**
 * PM2 Ecosystem Config — persistent process definitions for the AFI stack.
 *
 * Fixes the long-standing "process name shows as 'styles' instead of
 * 'nuro-frontend'" issue caused by `pm2 start "npx next start ..."` failing
 * to bind the --name flag when the command string starts with an interpreter.
 *
 * Usage on VPS:
 *   pm2 delete all
 *   cd /home/nuro/Nuro-Finance && pm2 start ecosystem.config.js --only nuro-api
 *   cd /home/nuro/Nuro-Finance && pm2 start /home/nuro/Nuro-Finance/ecosystem.config.js --only nuro-frontend
 *   pm2 save
 *
 * Or from either directory:
 *   pm2 start /home/nuro/Nuro-Finance/ecosystem.config.js
 *   pm2 save
 *
 * ─── PATH PINNING (S32 — Node 18 nvm coexistence) ───────────────────────────
 * Both apps explicitly pin env.PATH to a system-only path that EXCLUDES
 * nvm's bin directory. Reason: hardhat compile requires Node 18 (which
 * we install via nvm for the nuro user), and pm2's daemon could otherwise
 * inherit nvm-modified PATH from an interactive shell during `pm2 kill;
 * pm2 start` cycles, silently switching production services to Node 18.
 *
 * The pinned PATH guarantees /usr/bin/node v20.x wins for the lifetime
 * of these processes regardless of how/where the daemon was relaunched.
 * If you need a different Node for a specific app, set env.PATH on that
 * single app rather than removing this pin globally.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Explicit system-only PATH — excludes ~/.nvm/versions/node/*/bin so a
// nvm-loaded interactive shell can't accidentally bleed Node 18 into
// production via `pm2 kill && pm2 start`. /usr/bin/node v20 always wins.
const SYSTEM_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

module.exports = {
  apps: [
    {
      name: 'nuro-api',
      cwd: '/home/nuro/Nuro-Finance',
      // tsx (not ts-node) because Node's ESM loader was blocking ts-node's
      // require hook with ERR_UNKNOWN_FILE_EXTENSION on .ts files.
      // tsx handles CJS + ESM uniformly and is effectively zero-config.
      // Install once: npm install --save-dev tsx
      script: '/usr/bin/bash',
      args: '-c "./node_modules/.bin/tsx src/index.ts"',
      interpreter: 'none',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PATH: SYSTEM_PATH,
      },
      error_file: '/home/nuro/.pm2/logs/nuro-api-error.log',
      out_file: '/home/nuro/.pm2/logs/nuro-api-out.log',
    },
    {
      name: 'nuro-frontend',
      cwd: '/home/nuro/Nuro-Finance',
      script: 'node_modules/.bin/next',
      args: 'start -p 2800',
      interpreter: 'none',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '768M',
      env: {
        NODE_ENV: 'production',
        PATH: SYSTEM_PATH,
      },
      error_file: '/home/nuro/.pm2/logs/nuro-frontend-error.log',
      out_file: '/home/nuro/.pm2/logs/nuro-frontend-out.log',
    },
    // ─── Layer 3 staging — preview environment (S36 — 2026-05-24) ─────────
    // Separate checkout of the `staging` branch on port 2801. Same .env.local
    // as prod (talks to same middleware on 3000). Chris drops + risky
    // changes deploy here FIRST for smoke + walk-attest, then promote to
    // main / prod via `scripts/promote-staging-to-prod.sh`.
    //
    // Access (no DNS yet):
    //   curl http://74.50.109.203:2801/en/dashboard  (direct port)
    //
    // Future: nginx + DNS for staging.nuro.finance → port 2801.
    {
      name: 'nuro-frontend-staging',
      cwd: '/home/nuro/Nuro-Finance',
      script: 'node_modules/.bin/next',
      args: 'start -p 2801',
      interpreter: 'none',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '768M',
      env: {
        NODE_ENV: 'production',
        PATH: SYSTEM_PATH,
      },
      error_file: '/home/nuro/.pm2/logs/nuro-frontend-staging-error.log',
      out_file: '/home/nuro/.pm2/logs/nuro-frontend-staging-out.log',
    },
  ],
};

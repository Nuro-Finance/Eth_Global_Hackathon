# Staging Workflow — Layer 3 CI/CD Hardening

**Locked:** 2026-05-24 after the 5.23 wholesale-overlay regression.
**Why:** Prevent another "wiring nuked, prod down" event. Every Chris drop +
every risky FE change deploys to STAGING first, gets walk-attested, then
promotes to prod via a refusing-to-lose-wiring script.

## Topology

```
74.50.109.203 (VPS)
├── /home/cash/Cashly                          ← BE (Build_Branch) → PM2 #4 cashly-middleware (port 3000)
├── /home/cash/nuro-finance-dashboard          ← FE PROD (Build_Branch) → PM2 cashly-frontend (port 2800)
└── /home/cash/nuro-finance-dashboard-staging  ← FE STAGING (staging branch) → PM2 cashly-frontend-staging (port 2801)
```

Both FE dirs are SEPARATE clones of `RichardTheBruce/Cashly` via the `github-cashly` SSH
deploy key alias. They track DIFFERENT branches (`Build_Branch` for prod, `staging` for
staging). They share the SAME middleware on port 3000 and the SAME .env.local — staging is
a UI preview, not a data isolation environment.

## Access URLs

- **Prod:** https://app.nuro.finance (port 2800 via nginx)
- **Staging (current):** http://74.50.109.203:2801 (direct port, no DNS yet)
- **Staging (future):** https://staging.nuro.finance — requires DNS A record + nginx
  server_name block. Add when convenient; not blocking.

## Daily / per-change workflow

### Pushing a change to staging

Just push to the `staging` branch. From local:

```bash
git checkout staging
# do work
git commit -m "feat(...)"
git push origin staging
```

Then on VPS:

```bash
bash /home/cash/Cashly/scripts/deploy-staging.sh
```

The script:
1. Stashes any VPS-side .env.local drift
2. Fetches + resets to `origin/staging`
3. Restores .env.local from stash (so prod secrets survive)
4. Runs `pnpm install` (frozen first, then non-frozen as fallback)
5. `rm -rf .next && pnpm build`
6. `pm2 restart cashly-frontend-staging --update-env`
7. Smoke test (200 on /dashboard, 401 on protected API)

Total time: 3-5 min (build dominates).

### Walk-attesting on staging

Open http://74.50.109.203:2801 in a private browser window. Interactively test:
- Login flow (Google OAuth → may need the staging URL registered as a callback)
- Dashboard data render (cards, balances, transactions)
- Withdraw flow (no actual withdraw — just modal UX)
- Any feature touched by the change

If you see a regression: do NOT promote. Fix on staging branch, re-deploy, re-walk.

### Promoting staging → prod

Once staging is walk-attested clean:

```bash
bash /home/cash/Cashly/scripts/promote-staging-to-prod.sh
```

The script:
1. Verifies `Build_Branch` is a strict ancestor of `staging` (refuses non-ff)
2. Runs the **wiring-verification grep** between Build_Branch and staging
   — refuses to promote if `useQuery|useFetch|fetch\(|/api/|useSWR` lines were
   removed (the exact failure mode from 5.23 incident)
3. Fast-forwards `Build_Branch` on origin to staging SHA
4. Pulls + builds + restarts `cashly-frontend` on prod dir
5. Smoke test on https://app.nuro.finance

If verification grep fails: investigate. If intentional (e.g., a refactor
moving a hook), bypass with `PROMOTE_FORCE=1 bash promote-staging-to-prod.sh`.

## Chris drop integration (the canonical case this was built for)

```bash
# 1. Local: on staging branch, run the surgical merge per
#    AFI/Neural Net/Claude Memory/Chris Drop Integration Pattern.md
git checkout staging
# ... Phase 1 (pure-new files) + Phase 2 (visual-only) + Phase 3 (surgical jointly-owned) ...
git push origin staging

# 2. VPS: deploy to staging
ssh cash@vps "bash /home/cash/Cashly/scripts/deploy-staging.sh"

# 3. Walk-attest at http://74.50.109.203:2801
#    (Login may need staging callback registered in Google OAuth.
#     If not, smoke non-auth-gated routes.)

# 4. If clean, promote
ssh cash@vps "bash /home/cash/Cashly/scripts/promote-staging-to-prod.sh"
```

## When staging diverges from Build_Branch (after a hotfix on prod)

If you push a hotfix DIRECTLY to Build_Branch (skipping staging), the next promote will
refuse because Build_Branch is no longer an ancestor of staging. Resync:

```bash
git checkout staging
git fetch origin Build_Branch
git merge origin/Build_Branch
git push origin staging
# now staging is a strict descendant of Build_Branch again
```

Prefer NOT to hotfix prod directly. Hotfix on staging, walk, promote. The whole point
of Layer 3 is to put a 3-5 min preview between you and prod.

## What this prevents

The 2026-05-24 morning incident (Chris drop 5.23 wholesale overlay rolled back wiring,
prod down for ~30 min) would have been caught by:

- `deploy-staging.sh` first — broken render appears on staging only, prod untouched
- `promote-staging-to-prod.sh` wiring-verification grep — refuses to promote with the
  exact diff pattern that caused the failure

Both layers are now mandatory for FE changes.

## Future enhancements

1. **Subdomain DNS** for staging.nuro.finance (DNS + nginx, ~15 min)
2. **Auto-deploy on push** via GitHub Actions webhook → VPS pull script
3. **Snapshot-DB for staging** (Supabase branching) for true data isolation
4. **Husky pre-commit grep** locally (Layer 1) — catches wiring loss BEFORE push
5. **chris-drop-integrate.sh** (Layer 2) — enforces the 3-phase merge pattern as a driver

Layers 1+2 are smaller follow-ups. This (Layer 3) is the load-bearing one.

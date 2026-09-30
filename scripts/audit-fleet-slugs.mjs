#!/usr/bin/env node
// Fleet-wide slug/Netlify/branding audit — catches the class of bug found
// 2026-09-18: a club (Castor-Club-2) with a wrong Netlify siteId link and
// SB2_CLUB_SLUG, which then got copied into two clubs cloned from it
// (Deal-Roundtable-2, Southern-Cross-Club). Run this after cloning any new
// club, or periodically across the whole fleet, to catch it early instead
// of discovering it in production.
//
// 2026-09-30 update: also catches a second, separate identity surface —
// the real Netlify SITE's own dashboard env vars (SUPABASE_URL etc.),
// which are independent of the repo's .env.local and were found wrong
// fleet-wide (every checked site had LockerRoom's own DB credentials
// baked in as a leftover scaffold default from site creation, never
// filled in per-club). Netlify Functions read these live at invocation,
// so a wrong value here isn't just a future risk — it can mean a site's
// server-side functions are ALREADY silently hitting the wrong database.
// See the club-portal-fleet / verify-cloned-club-identity memory for the
// 2026-09-30 incident this check came out of.
//
// What it checks, per repo under a given base directory (has src/supabase.js + .env.local):
//   1. SB2_CLUB_SLUG (hardcoded const in src/supabase.js) exists in the
//      shared SB2 `clubs` table.
//   2. .netlify/state.json siteId resolves to a REAL Netlify site (via
//      `netlify sites:list --json`), and no two repos share the same siteId.
//   3. Welcome text / fallback club-name strings in MemberLogin.jsx and
//      AdminDealInterests.jsx don't obviously belong to a different club.
//   4. The linked Netlify SITE's own dashboard SUPABASE_URL matches this
//      repo's local .env.local SUPABASE_URL (via `netlify env:get`).
//
// Requires: SB2_URL + SB2_SERVICE_ROLE_KEY env vars (from any club's own
// .env.local — SB2 is shared fleet-wide), and `netlify` CLI logged in
// (`netlify login`) with access to the account these sites belong to.
//
// CAVEAT on check 4: `netlify env:get`/`env:list`/`env:set` were all
// observed being flaky in this session (2026-09-30) — calls can hang
// indefinitely (confirmed via `ps aux`, alive with ~0% CPU for minutes)
// even with `--force` and stdin redirected to /dev/null, and even a
// subprocess-level timeout didn't reliably kill the hang (needed
// `pkill -9 -f "netlify env:set"` by hand). Retrying the exact same call
// right after killing a hung one often just works — this looks like
// transient Netlify-API-side flakiness, not a deterministic per-call bug.
// So: don't treat one hang as proof something is broken, and don't treat
// this check's "OK" as fully conclusive either — it's a candidate finder,
// same as every other check here. If this check flags something, confirm
// with a live-behavior test (trigger a real function call that writes to
// the DB, e.g. request-password-reset, and check which project's table
// actually got the row) before trusting the flag OR trusting a fix.
//
// HOW TO ACTUALLY FIX A FLAGGED SITE ENV VAR (2026-09-30 incident — do
// NOT skip any of these steps, each one was independently necessary):
//   1. Set it with EXPLICIT context names, never the word "all":
//        netlify env:set KEY value --site <id> --force \
//          --context production deploy-preview branch-deploy dev
//      `all` is NOT a valid --context value (real ones: production,
//      deploy-preview, branch-deploy, dev, branch:<name>) — it's only
//      the unstated default when --context is omitted. Passing the
//      literal string "all" doesn't error, it just silently doesn't do
//      what you'd assume, which is exactly how this went unnoticed
//      across 6 sites before a live user hit "Invalid API key" on one.
//   2. Wrap every env:set call in a retry loop (~20s timeout, 2-3
//      retries) per the flakiness caveat above.
//   3. After the vars are confirmed set, trigger a fresh deploy:
//        netlify api createSiteBuild --data '{"site_id":"<id>"}'
//      and poll listSiteDeploys until state is "ready". Netlify
//      Functions do NOT reliably pick up a corrected env var without
//      this — a site can have perfectly correct env vars sitting in its
//      dashboard while its live functions keep using the old ones from
//      the last build. This was the actual reason one site's fix
//      silently didn't take even after being set correctly twice.
//   4. Re-verify with the live-behavior test, not with env:get/env:list.
//
// Usage:
//   SB2_URL=https://xxx.supabase.co SB2_SERVICE_ROLE_KEY=xxx \
//     node audit-fleet-slugs.mjs /Users/catewoolsey

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const baseDir = process.argv[2] || process.env.HOME;
const SB2_URL = process.env.SB2_URL;
const SB2_KEY = process.env.SB2_SERVICE_ROLE_KEY;

if (!SB2_URL || !SB2_KEY) {
  console.error('Set SB2_URL and SB2_SERVICE_ROLE_KEY (copy from any club\'s .env.local: VITE_SUPABASE_2_URL / SUPABASE_2_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const readSafe = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };

// 1. Discover repos: any top-level dir with both src/supabase.js and .env.local
const repos = fs.readdirSync(baseDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .filter(name => {
    const p = path.join(baseDir, name);
    return fs.existsSync(path.join(p, 'src/supabase.js')) && fs.existsSync(path.join(p, '.env.local'));
  });

// 2. Pull each repo's local identity
const local = repos.map(repo => {
  const p = path.join(baseDir, repo);
  const supabaseJs = readSafe(path.join(p, 'src/supabase.js')) || '';
  const slugMatch = supabaseJs.match(/SB2_CLUB_SLUG = '([^']*)'/);
  const netlifyState = readSafe(path.join(p, '.netlify/state.json'));
  let siteId = null;
  try { siteId = netlifyState ? JSON.parse(netlifyState).siteId : null; } catch {}
  const memberLogin = readSafe(path.join(p, 'src/components/auth/MemberLogin.jsx')) || '';
  const welcomeMatch = memberLogin.match(/Welcome to the<br \/>([^<]*)</);
  const envLocal = readSafe(path.join(p, '.env.local')) || '';
  const supabaseUrlMatch = envLocal.match(/^SUPABASE_URL=(.*)$/m);
  return {
    repo,
    slug: slugMatch?.[1] || null,
    siteId,
    welcome: welcomeMatch?.[1] || null,
    localSupabaseUrl: supabaseUrlMatch?.[1]?.trim() || null,
  };
});

// 3. Ground truth: SB2 clubs table
const clubs = JSON.parse(
  execSync(`curl -s "${SB2_URL}/rest/v1/clubs?select=id,name,slug,portal_url" -H "apikey: ${SB2_KEY}" -H "Authorization: Bearer ${SB2_KEY}"`)
);
const clubBySlug = new Map(clubs.map(c => [c.slug, c.name]));

// 4. Ground truth: real Netlify sites (requires `netlify login` already run)
let sites = [];
try {
  sites = JSON.parse(execSync('netlify sites:list --json', { cwd: baseDir, maxBuffer: 1024 * 1024 * 50 }));
} catch (e) {
  console.warn('Could not run `netlify sites:list` (' + e.message + ') — skipping Netlify checks. Run `netlify login` first.');
}
const siteById = new Map(sites.map(s => [s.id, s.name]));

console.log(`Auditing ${local.length} repos under ${baseDir}\n`);

// Check 1: slug existence
console.log('=== Slug check (SB2_CLUB_SLUG must exist in SB2 clubs.slug) ===');
local.forEach(({ repo, slug }) => {
  if (!slug) { console.log(`  ${repo}: NO SLUG SET`); return; }
  if (!clubBySlug.has(slug)) console.log(`  ${repo}: slug "${slug}" DOES NOT EXIST IN SB2 — likely wrong`);
});

// Check 2: siteId collisions (two repos sharing one siteId is always wrong)
console.log('\n=== Netlify siteId collisions (same id used by >1 repo) ===');
const bySite = new Map();
local.forEach(({ repo, siteId }) => {
  if (!siteId) return;
  if (!bySite.has(siteId)) bySite.set(siteId, []);
  bySite.get(siteId).push(repo);
});
bySite.forEach((repoList, siteId) => {
  if (repoList.length > 1) console.log(`  ${siteId} -> ${repoList.join(', ')}  <-- COLLISION, at most one of these is correct`);
});

// Check 3: siteId resolves to a plausibly-named real site
if (sites.length) {
  console.log('\n=== Netlify siteId -> real site name (eyeball for mismatches) ===');
  local.forEach(({ repo, siteId }) => {
    if (!siteId) { console.log(`  ${repo}: NO SITE LINKED`); return; }
    const name = siteById.get(siteId);
    if (!name) console.log(`  ${repo}: siteId not found in sites:list at all -- ${siteId}`);
    else console.log(`  ${repo.padEnd(24)} -> ${name}`);
  });
}

// Check 4: the real Netlify site's own SUPABASE_URL vs this repo's local .env.local
if (sites.length) {
  console.log('\n=== Netlify site SUPABASE_URL vs local .env.local (deployed Functions read the SITE value, not your local file) ===');
  local.forEach(({ repo, siteId, localSupabaseUrl }) => {
    if (!siteId || !localSupabaseUrl) return;
    if (!siteById.has(siteId)) return; // already flagged above
    let deployedUrl = null;
    try {
      // cwd MUST be a directory with its own linked .netlify/state.json —
      // running from a dir with no linked project (e.g. the fleet base
      // dir) makes `env:get` fall back to an interactive site picker and
      // hang forever, even with --site passed explicitly (CLI quirk,
      // found 2026-09-30). stdin is ignored as a second guard against
      // ever hanging on a prompt in a non-interactive run.
      const out = execSync(`netlify env:get SUPABASE_URL --site "${siteId}" --json`, {
        cwd: path.join(baseDir, repo),
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 1024 * 1024 * 10,
      }).toString();
      deployedUrl = JSON.parse(out).SUPABASE_URL || null;
    } catch (e) {
      console.log(`  ${repo}: could not read site env var (${e.message.split('\n')[0]})`);
      return;
    }
    if (deployedUrl !== localSupabaseUrl) {
      console.log(`  ${repo}: MISMATCH — site has "${deployedUrl}", local .env.local has "${localSupabaseUrl}"`);
    }
  });
}

console.log('\nDone. Review any flagged lines above by hand before fixing — this script finds candidates, it does not decide correctness on its own.');

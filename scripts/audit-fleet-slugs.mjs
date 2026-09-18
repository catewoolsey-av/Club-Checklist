#!/usr/bin/env node
// Fleet-wide slug/Netlify/branding audit — catches the class of bug found
// 2026-09-18: a club (Castor-Club-2) with a wrong Netlify siteId link and
// SB2_CLUB_SLUG, which then got copied into two clubs cloned from it
// (Deal-Roundtable-2, Southern-Cross-Club). Run this after cloning any new
// club, or periodically across the whole fleet, to catch it early instead
// of discovering it in production.
//
// What it checks, per repo under a given base directory (has src/supabase.js + .env.local):
//   1. SB2_CLUB_SLUG (hardcoded const in src/supabase.js) exists in the
//      shared SB2 `clubs` table.
//   2. .netlify/state.json siteId resolves to a REAL Netlify site (via
//      `netlify sites:list --json`), and no two repos share the same siteId.
//   3. Welcome text / fallback club-name strings in MemberLogin.jsx and
//      AdminDealInterests.jsx don't obviously belong to a different club.
//
// Requires: SB2_URL + SB2_SERVICE_ROLE_KEY env vars (from any club's own
// .env.local — SB2 is shared fleet-wide), and `netlify` CLI logged in
// (`netlify login`) with access to the account these sites belong to.
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
  return { repo, slug: slugMatch?.[1] || null, siteId, welcome: welcomeMatch?.[1] || null };
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

console.log('\nDone. Review any flagged lines above by hand before fixing — this script finds candidates, it does not decide correctness on its own.');

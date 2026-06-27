#!/usr/bin/env node
// Validate an API-Football key and check current WC 2026 lineup accuracy.
//
// Usage:
//   RAPIDAPI_KEY=<key> node validate-lineups.mjs
//   API_FOOTBALL_KEY=<key> node validate-lineups.mjs
//
// The script:
//   1. Validates the key via the /status endpoint
//   2. Fetches recent/upcoming WC 2026 fixtures (league 1, season 2026)
//   3. Pulls lineups for the most recent finished match
//   4. Cross-checks lineup team names against our model's known slugs
import { readFileSync } from 'node:fs';

const API_KEY = process.env.RAPIDAPI_KEY || process.env.API_FOOTBALL_KEY || process.env.X_RAPIDAPI_KEY;

if (!API_KEY) {
  console.error('\n  Error: no API key found.\n');
  console.error('  Set one of these environment variables before running:');
  console.error('    RAPIDAPI_KEY=<your_key>      node validate-lineups.mjs');
  console.error('    API_FOOTBALL_KEY=<your_key>  node validate-lineups.mjs\n');
  process.exit(1);
}

// API-Football offers two endpoints: direct (apisports) and RapidAPI proxy.
// We try both; the key format tells us which one is in use.
// RapidAPI keys are typically 50 hex chars; apisports keys are 32 hex chars.
const USE_RAPIDAPI = API_KEY.length > 40;

const BASE = USE_RAPIDAPI
  ? 'https://api-football-v1.p.rapidapi.com/v3'
  : 'https://v3.football.api-sports.io';

function headers() {
  return USE_RAPIDAPI
    ? { 'X-RapidAPI-Key': API_KEY, 'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com' }
    : { 'x-apisports-key': API_KEY };
}

async function apiFetch(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(`API error: ${JSON.stringify(json.errors)}`);
  }
  return json;
}

// ─── Known team slugs from our model ─────────────────────────────────────────
const { ratings } = JSON.parse(
  readFileSync(new URL('./data/elo-calibrated.json', import.meta.url), 'utf8')
);
const MODEL_TEAMS = new Set(Object.keys(ratings));

// Normalise a team name from the API into our slug format.
function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/\s+&\s+|\s+and\s+/gi, '-and-')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function matchScore(apiName) {
  const slug = toSlug(apiName);
  if (MODEL_TEAMS.has(slug)) return { slug, exact: true };
  // Fuzzy: check if any model slug starts with or contains our slug
  for (const s of MODEL_TEAMS) {
    if (s.startsWith(slug) || slug.startsWith(s)) return { slug: s, exact: false };
  }
  return { slug, exact: false, unknown: true };
}

// ─── Main validation flow ─────────────────────────────────────────────────────
const W = 60;
const HR = '─'.repeat(W);

console.log('\n' + '='.repeat(W));
console.log('  API-FOOTBALL KEY VALIDATION + LINEUP CHECK');
console.log('  Mode: ' + (USE_RAPIDAPI ? 'RapidAPI proxy' : 'api-sports.io direct'));
console.log('='.repeat(W));

// 1. Status / key validation
console.log('\n[1/3] Checking API key status…');
let account;
try {
  const statusData = await apiFetch('/status');
  account = statusData.response;
  const sub = account.subscription;
  const req = account.requests;
  console.log(`  ✓  Key valid`);
  console.log(`     Account : ${account.account?.email ?? 'n/a'}`);
  console.log(`     Plan    : ${sub?.plan ?? 'n/a'}`);
  console.log(`     Active  : ${sub?.active ? 'yes' : 'no'}`);
  console.log(`     Requests: ${req?.current?.toLocaleString() ?? '?'} / ${req?.limit_day?.toLocaleString() ?? '?'} today`);

  if (!sub?.active) {
    console.error('\n  ✗  Subscription is not active — lineups will not be available.');
    process.exit(1);
  }
} catch (err) {
  console.error(`\n  ✗  Key validation failed: ${err.message}`);
  process.exit(1);
}

// 2. Fetch WC 2026 fixtures (league 1 = FIFA World Cup)
console.log('\n[2/3] Fetching WC 2026 fixtures (league 1, season 2026)…');
let fixtures;
try {
  const fixtureData = await apiFetch('/fixtures?league=1&season=2026');
  fixtures = fixtureData.response ?? [];
  console.log(`  ✓  ${fixtures.length} fixtures returned`);
} catch (err) {
  console.error(`  ✗  Could not fetch fixtures: ${err.message}`);
  process.exit(1);
}

if (fixtures.length === 0) {
  console.log('\n  No WC 2026 fixtures found. Check that league=1 is correct for this key.');
  process.exit(0);
}

// Find the most recent finished match (status FT or AET or PEN)
const finished = fixtures
  .filter(f => ['FT', 'AET', 'PEN'].includes(f.fixture?.status?.short))
  .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp);

const upcoming = fixtures
  .filter(f => ['NS', 'TBD'].includes(f.fixture?.status?.short))
  .sort((a, b) => a.fixture.timestamp - b.fixture.timestamp);

console.log(`     Finished: ${finished.length}  |  Upcoming: ${upcoming.length}`);

// Print last 5 finished matches
if (finished.length > 0) {
  console.log('\n  Last 5 finished matches:');
  finished.slice(0, 5).forEach(f => {
    const d = new Date(f.fixture.timestamp * 1000).toISOString().slice(0, 10);
    const h = f.teams.home.name, a = f.teams.away.name;
    const gh = f.goals.home ?? '-', ga = f.goals.away ?? '-';
    console.log(`    ${d}  ${h} ${gh}–${ga} ${a}`);
  });
}

// 3. Fetch lineups for the most recent finished match
const target = finished[0];
if (!target) {
  console.log('\n  No finished matches to fetch lineups for.');
  process.exit(0);
}

const fid = target.fixture.id;
const dateStr = new Date(target.fixture.timestamp * 1000).toISOString().slice(0, 10);
const homeTeam = target.teams.home.name;
const awayTeam = target.teams.away.name;

console.log(`\n[3/3] Fetching lineups for fixture #${fid}`);
console.log(`      ${dateStr}  ${homeTeam} vs ${awayTeam}`);

let lineups;
try {
  const lineupData = await apiFetch(`/fixtures/lineups?fixture=${fid}`);
  lineups = lineupData.response ?? [];
} catch (err) {
  console.error(`  ✗  Could not fetch lineups: ${err.message}`);
  process.exit(1);
}

if (lineups.length === 0) {
  console.log(`  ⚠  No lineup data available for this fixture (may not be released yet).`);
  console.log(`     This is normal for matches where lineups were not confirmed via the API.`);
  process.exit(0);
}

console.log('\n' + HR);
lineups.forEach(side => {
  const name  = side.team.name;
  const form  = side.formation ?? 'unknown';
  const { slug, exact, unknown } = matchScore(name);
  const matchTag = unknown  ? `  ⚠ NOT IN MODEL (slug: ${slug})`
                 : exact    ? `  ✓ model slug: ${slug}`
                 :            `  ~ fuzzy match: ${slug}`;

  console.log(`\n  ${name}  [${form}]${matchTag}`);
  console.log(`  ${'─'.repeat(40)}`);

  const starters = (side.startXI ?? []).map(p => p.player);
  const subs     = (side.substitutes ?? []).map(p => p.player);

  console.log(`  Starting XI:`);
  starters.forEach(p => {
    const pos = (p.pos ?? '?').padEnd(2);
    const num = String(p.number ?? '').padStart(2);
    console.log(`    ${num}. [${pos}] ${p.name}`);
  });

  if (subs.length > 0) {
    console.log(`  Substitutes:`);
    subs.slice(0, 7).forEach(p => {
      const pos = (p.pos ?? '?').padEnd(2);
      const num = String(p.number ?? '').padStart(2);
      console.log(`    ${num}. [${pos}] ${p.name}`);
    });
  }

  if (side.coach?.name) console.log(`  Coach: ${side.coach.name}`);
});

// Cross-check: confirm both teams are known to our model
console.log('\n' + HR);
console.log('\n  Model cross-check:');
let allKnown = true;
lineups.forEach(side => {
  const { slug, exact, unknown } = matchScore(side.team.name);
  if (unknown) {
    console.log(`  ✗  "${side.team.name}" → slug "${slug}" is NOT in model ratings`);
    allKnown = false;
  } else {
    const rating = ratings[slug];
    console.log(`  ✓  "${side.team.name}" → ${slug}  (Elo: ${rating})`);
  }
});

if (allKnown) {
  console.log('\n  API key is valid and lineup data is consistent with the model. ✓');
} else {
  console.log('\n  ⚠  Some teams from the API do not match model slugs — may need slug mapping.');
}
console.log('');

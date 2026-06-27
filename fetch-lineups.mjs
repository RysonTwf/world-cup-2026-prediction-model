#!/usr/bin/env node
// Fetch WC 2026 lineup + injury data from api-football (via RapidAPI free tier: 100 req/day).
// Saves data/lineups-cache.json — run before sg-pools.mjs to get player-level adjustments.
//
// One-time free setup:
//   1. Sign up at https://rapidapi.com
//   2. Search for "API-Football" → Subscribe (free plan: 100 req/day)
//   3. Copy your key from the "Header Parameters" panel
//   4. export RAPIDAPI_KEY=your_key_here
//   5. node fetch-lineups.mjs
//
// After fetching: node sg-pools.mjs  (reads lineups-cache.json automatically)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// Load .env if present (key stored locally, never committed)
const envFile = new URL('./.env', import.meta.url);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

const D = f => new URL('./data/' + f, import.meta.url);
const KEY = process.env.RAPIDAPI_KEY;

if (!KEY) {
  console.error('RAPIDAPI_KEY not set.\n\nSetup (free, 100 req/day):\n  https://rapidapi.com → search "API-Football" → subscribe → copy key\n  export RAPIDAPI_KEY=your_key_here\n  node fetch-lineups.mjs');
  process.exit(1);
}

const HOST_HDR = 'api-football-v1.p.rapidapi.com';
const BASE     = `https://${HOST_HDR}/v3`;
const HEADERS  = { 'X-RapidAPI-Key': KEY, 'X-RapidAPI-Host': HOST_HDR };
const delay    = ms => new Promise(r => setTimeout(r, ms));

async function get(path) {
  const res = await fetch(BASE + path, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length) throw new Error(JSON.stringify(json.errors));
  return json.response ?? [];
}

// Slug → api-football team name fragments (for matching)
const SLUG_FRAGMENTS = {
  'argentina':'Argentina','france':'France','spain':'Spain','brazil':'Brazil',
  'england':'England','portugal':'Portugal','netherlands':'Netherlands','germany':'Germany',
  'belgium':'Belgium','colombia':'Colombia','uruguay':'Uruguay','croatia':'Croatia',
  'morocco':'Morocco','switzerland':'Switzerland','usa':'United States','mexico':'Mexico',
  'japan':'Japan','senegal':'Senegal','denmark':'Denmark','ecuador':'Ecuador',
  'australia':'Australia','south-korea':'South Korea','iran':'Iran','poland':'Poland',
  'canada':'Canada','serbia':'Serbia','wales':'Wales','ghana':'Ghana','tunisia':'Tunisia',
  'ivory-coast':'Ivory Coast','nigeria':'Nigeria','saudi-arabia':'Saudi Arabia',
  'qatar':'Qatar','egypt':'Egypt','algeria':'Algeria','scotland':'Scotland',
  'cameroon':'Cameroon','paraguay':'Paraguay','venezuela':'Venezuela','chile':'Chile',
  'peru':'Peru','czech-republic':'Czech Republic','bosnia-and-herzegovina':'Bosnia',
  'south-africa':'South Africa','new-zealand':'New Zealand','panama':'Panama',
  'jamaica':'Jamaica','honduras':'Honduras','jordan':'Jordan','haiti':'Haiti',
  'el-salvador':'El Salvador','trinidad-and-tobago':'Trinidad','guatemala':'Guatemala',
  'norway':'Norway','sweden':'Sweden','turkey':'Turkey','austria':'Austria',
  'iraq':'Iraq','uzbekistan':'Uzbekistan','cape-verde':'Cape Verde','dr-congo':'Congo',
  'curacao':'Curacao','georgia':'Georgia',
};

function slugFromName(name) {
  const n = name.toLowerCase();
  for (const [slug, frag] of Object.entries(SLUG_FRAGMENTS)) {
    if (n.includes(frag.toLowerCase())) return slug;
  }
  return null;
}

async function run() {
  // ── Step 1: Find WC 2026 league ID ───────────────────────────────────────────
  console.log('Looking up WC 2026 competition...');
  const leagues = await get('/leagues?type=Cup&name=FIFA+World+Cup&season=2026');
  let leagueId;
  if (leagues.length) {
    leagueId = leagues[0].league.id;
    console.log(`  Found: ${leagues[0].league.name} (id=${leagueId})`);
  } else {
    // Fallback to known id on api-football
    leagueId = 1;
    console.log(`  Not found by name — using default league id ${leagueId}`);
  }
  await delay(500);

  // ── Step 2: Fetch MD3 fixtures ────────────────────────────────────────────────
  console.log('Fetching group stage fixtures...');
  const allFixtures = await get(`/fixtures?league=${leagueId}&season=2026&status=NS-1H-2H-FT`);
  await delay(500);

  // api-football uses "Group Stage - 3" or "Group Phase - Matchday 3" style round names
  const md3 = allFixtures.filter(f =>
    /group.*3|matchday.*3|round.*3/i.test(f.league.round ?? '') ||
    Number(f.league.round?.replace(/\D/g, '')) === 3
  );
  const fixtures = md3.length ? md3 : allFixtures.filter(f => f.fixture.status.short === 'NS').slice(0, 25);
  console.log(`  ${fixtures.length} MD3 fixture(s) found`);

  // ── Step 3: Lineups + Injuries per fixture ───────────────────────────────────
  const output = {
    fetchedAt: new Date().toISOString(),
    leagueId,
    matches: [],
  };

  let reqCount = 3; // already used 3 above
  for (const f of fixtures) {
    if (reqCount >= 90) { console.log('  Approaching request limit — stopping early'); break; }
    const fid  = f.fixture.id;
    const home = f.teams.home.name;
    const away = f.teams.away.name;
    const hSlug = slugFromName(home);
    const aSlug = slugFromName(away);

    const entry = {
      fixtureId: fid,
      date: f.fixture.date,
      homeTeam: home, homeSlug: hSlug,
      awayTeam: away, awaySlug: aSlug,
      status: f.fixture.status.short,
      confirmedLineups: false,
      starters: { home: [], away: [] },
      absentees: { home: [], away: [] },
    };

    // Lineups (available ~1h before kickoff or during/after match)
    try {
      const lu = await get(`/fixtures/lineups?fixture=${fid}`);
      reqCount++;
      if (lu.length >= 2) {
        entry.confirmedLineups = true;
        for (const side of lu) {
          const isHome = side.team.name === home;
          const key    = isHome ? 'home' : 'away';
          entry.starters[key] = (side.startXI ?? []).map(p => p.player.name);
        }
        console.log(`  ✓ Lineups:  ${home} vs ${away}`);
      } else {
        console.log(`  · No lineup: ${home} vs ${away} (${f.fixture.status.short})`);
      }
    } catch (e) {
      console.log(`  ! Lineup error: ${e.message}`);
    }
    await delay(400);

    // Injuries (available throughout competition period)
    for (const [side, teamId, slug] of [
      ['home', f.teams.home.id, hSlug],
      ['away', f.teams.away.id, aSlug],
    ]) {
      if (reqCount >= 90) break;
      try {
        const inj = await get(`/injuries?league=${leagueId}&season=2026&team=${teamId}&fixture=${fid}`);
        reqCount++;
        entry.absentees[side] = inj.map(i => ({
          player: i.player.name,
          type: i.injury?.type ?? 'Unknown',
          reason: i.injury?.reason ?? '',
        }));
        if (inj.length) console.log(`    ⚠ ${slug}: ${inj.map(i=>i.player.name).join(', ')}`);
      } catch { /* silent */ }
      await delay(300);
    }

    output.matches.push(entry);
  }

  writeFileSync(D('lineups-cache.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(`\n→ Wrote data/lineups-cache.json  (${reqCount} API requests used)\n`);
  console.log('Now run: node sg-pools.mjs');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

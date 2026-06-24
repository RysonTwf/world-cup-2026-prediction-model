#!/usr/bin/env node
// Fetch live Singapore Pools 1X2 odds for WC 2026 fixtures.
// Run this on your OWN machine (not in the cloud environment) since
// online.singaporepools.com is geo-restricted / rate-limited to Singapore IPs.
//
// Usage:
//   node fetch-sp-odds.mjs               → fetches all upcoming WC fixtures
//   node fetch-sp-odds.mjs switzerland canada   → filters to that match
//
// Output: data/sp-odds.json  — read automatically by sg-pools.mjs

import { writeFileSync } from 'node:fs';

// SP uses a REST API behind their SPA. These endpoints were observed in
// browser DevTools (Network tab) on online.singaporepools.com/en/sports/football
const BASE    = 'https://online.singaporepools.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://online.singaporepools.com/en/sports/football',
  'Origin': 'https://online.singaporepools.com',
};
const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Step 1: Get competition list and find FIFA World Cup ─────────────────────
async function fetchCompetitions() {
  const res  = await fetch(`${BASE}/LottoInternetSports/rest/sports/getAllSportCompetitions?lang=en_US&sport=SOCCER`, { headers: HEADERS });
  if (!res.ok) throw new Error(`competitions: HTTP ${res.status}`);
  const data = await res.json();
  // Look for "FIFA World Cup" or "World Cup 2026"
  return (data.competitions ?? data).filter(c =>
    /world cup/i.test(c.competitionName ?? c.name ?? '')
  );
}

// ── Step 2: Get matches for a competition ────────────────────────────────────
async function fetchMatches(competitionId) {
  const res  = await fetch(
    `${BASE}/LottoInternetSports/rest/events/getEventsByCompetition?competitionId=${competitionId}&lang=en_US`,
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error(`matches: HTTP ${res.status}`);
  return res.json();
}

// ── Step 3: Get 1X2 odds for a match ─────────────────────────────────────────
async function fetchOdds(matchId) {
  const res  = await fetch(
    `${BASE}/LottoInternetSports/rest/odds/getGroupMatchOdds?lang=en_US&groupMatchId=${matchId}`,
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error(`odds(${matchId}): HTTP ${res.status}`);
  return res.json();
}

async function run() {
  const [filterT1, filterT2] = process.argv.slice(2).map(s => s?.toLowerCase());

  console.log('Fetching SP competitions...');
  let competitions;
  try {
    competitions = await fetchCompetitions();
  } catch (e) {
    // Fallback: try direct WC competition ID (observed as ~2000+ in 2026)
    console.warn(`  Competition fetch failed (${e.message}), trying known IDs...`);
    competitions = [{ competitionId: 1, competitionName: 'FIFA World Cup 2026' }];
  }

  if (!competitions.length) {
    console.error('No World Cup competition found on SP. Is WC 2026 currently listed?');
    process.exit(1);
  }
  console.log(`  Found: ${competitions.map(c => c.competitionName).join(', ')}`);

  const output = { fetchedAt: new Date().toISOString(), odds: [] };

  for (const comp of competitions) {
    await delay(300);
    console.log(`Fetching matches for "${comp.competitionName}"...`);
    let events;
    try {
      events = await fetchMatches(comp.competitionId ?? comp.id);
    } catch (e) {
      console.error(`  Failed: ${e.message}`);
      continue;
    }

    const matches = events.events ?? events.matches ?? events ?? [];
    console.log(`  ${matches.length} event(s)`);

    for (const m of matches) {
      const home = (m.homeTeamName ?? m.homeName ?? '').trim();
      const away = (m.awayTeamName ?? m.awayName ?? '').trim();
      if (!home || !away) continue;

      // Apply filter if specified
      if (filterT1) {
        const h = home.toLowerCase(), a = away.toLowerCase();
        if (!((h.includes(filterT1) || h.includes(filterT2)) &&
              (a.includes(filterT1) || a.includes(filterT2)))) continue;
      }

      await delay(300);
      let odds1x2 = null;
      try {
        const oddsData = await fetchOdds(m.groupMatchId ?? m.matchId ?? m.id);
        // SP returns odds in structure: { odds: [{ betType: '1X2', selections: [{name:'1',odds:x},{name:'X',odds:y},{name:'2',odds:z}] }] }
        const market = (oddsData.odds ?? oddsData.markets ?? []).find(
          o => /1x2|match result/i.test(o.betType ?? o.marketName ?? '')
        );
        if (market) {
          const sel = market.selections ?? market.outcomes ?? [];
          const byName = Object.fromEntries(sel.map(s => [s.name ?? s.outcome, parseFloat(s.odds ?? s.price)]));
          odds1x2 = {
            home: byName['1'] ?? byName['Home'] ?? null,
            draw: byName['X'] ?? byName['Draw'] ?? null,
            away: byName['2'] ?? byName['Away'] ?? null,
          };
        }
      } catch (e) {
        console.warn(`  Odds error for ${home} vs ${away}: ${e.message}`);
      }

      const entry = {
        home, away,
        kickoff: m.startTime ?? m.kickoffTime ?? null,
        matchId: m.groupMatchId ?? m.matchId ?? m.id,
        odds1x2,
      };
      output.odds.push(entry);
      console.log(`  ${home} vs ${away}:  ` +
        (odds1x2 ? `${odds1x2.home} / ${odds1x2.draw} / ${odds1x2.away}` : 'odds not available'));
    }
  }

  if (!output.odds.length) {
    console.error('\nNo odds found. SP may require login, geo-restriction (Singapore IP), or the match is not yet listed.');
    process.exit(1);
  }

  writeFileSync(new URL('./data/sp-odds.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
  console.log(`\n→ Wrote data/sp-odds.json (${output.odds.length} match(es))\n`);
  console.log('Now run: node sg-pools.mjs');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

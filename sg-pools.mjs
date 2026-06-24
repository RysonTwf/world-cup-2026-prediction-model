#!/usr/bin/env node
// Singapore Pools betting predictions for WC 2026.
// Usage:
//   node sg-pools.mjs                        → all upcoming group-stage MD3 fixtures
//   node sg-pools.mjs brazil scotland        → single fixture (neutral)
//   node sg-pools.mjs usa turkey usa         → single fixture with home advantage
//
// Enrichment pipeline (run in order before sg-pools.mjs):
//   node live-ratings.mjs                   → data/elo-live.json  (in-tournament Elo updates)
//   node fetch-lineups.mjs                  → data/lineups-cache.json  (needs RAPIDAPI_KEY)
//   node sg-pools.mjs                       → picks up both files automatically
import { readFileSync, existsSync } from 'node:fs';
import { expectedGoals } from './elo.mjs';
import {
  buildScoreMatrix,
  market1X2, marketHT1X2, market2H1X2,
  marketAH, marketH1X2,
  marketOU, marketHTOU,
  marketBands, marketBTTS, marketOddEven,
  marketCorrectScore, marketHTFT,
  marketWhichHalf, marketFirstTeam,
} from './markets.mjs';

// ── Rating source: prefer live (in-tournament) over frozen ────────────────────
const liveFile   = new URL('./data/elo-live.json',       import.meta.url);
const frozenFile = new URL('./data/elo-calibrated.json', import.meta.url);
const usingLive  = existsSync(liveFile);
const ratingData = JSON.parse(readFileSync(usingLive ? liveFile : frozenFile, 'utf8'));
const ratings    = ratingData.ratings;
const frozenRatings = usingLive
  ? JSON.parse(readFileSync(frozenFile, 'utf8')).ratings
  : ratings;
if (usingLive) {
  const n = ratingData.matchesApplied ?? '?';
  console.log(`\n[live-ratings] Using in-tournament Elo (${n} WC matches applied).`);
} else {
  console.log('\n[ratings] Using frozen pre-tournament Elo. Run node live-ratings.mjs for in-tournament updates.');
}

// ── Lineup cache (from fetch-lineups.mjs) ────────────────────────────────────
const lineupFile   = new URL('./data/lineups-cache.json', import.meta.url);
const lineupData   = existsSync(lineupFile)
  ? JSON.parse(readFileSync(lineupFile, 'utf8')) : null;
if (lineupData) console.log(`[lineups]  Lineup cache loaded (fetched ${lineupData.fetchedAt?.slice(0,16) ?? '?'}).`);
else            console.log('[lineups]  No lineup cache. Run node fetch-lineups.mjs (needs RAPIDAPI_KEY) for player-level adjustments.');

// ── Player-impact table ───────────────────────────────────────────────────────
const playerImpacts = JSON.parse(
  readFileSync(new URL('./data/player-impacts.json', import.meta.url), 'utf8')
);

// Compute lineup Elo adjustment for a team from cached data.
// Returns { delta, reasons[] } — delta is negative (team is weaker without key players).
function lineupAdjustment(slug, sideKey, fixtureEntry) {
  if (!fixtureEntry || !playerImpacts[slug]) return { delta: 0, reasons: [] };
  const impacts = playerImpacts[slug];
  const reasons = [];

  if (fixtureEntry.confirmedLineups && fixtureEntry.starters[sideKey]?.length) {
    // Compare expected key players to confirmed starters
    const starters = fixtureEntry.starters[sideKey].map(n => n.toLowerCase());
    for (const [player, impact] of Object.entries(impacts)) {
      const inXI = starters.some(s => s.includes(player.split(' ').pop().toLowerCase()));
      if (!inXI) reasons.push({ player, impact, source: 'lineup' });
    }
  }

  // Add injury/suspension absentees (may overlap with lineup — deduplicate)
  for (const absentee of (fixtureEntry.absentees?.[sideKey] ?? [])) {
    const n = absentee.player.toLowerCase();
    for (const [player, impact] of Object.entries(impacts)) {
      const alreadyListed = reasons.some(r => r.player === player);
      if (!alreadyListed && n.includes(player.split(' ').pop().toLowerCase())) {
        reasons.push({ player, impact, source: absentee.type });
      }
    }
  }

  const delta = -reasons.reduce((s, r) => s + r.impact, 0);
  return { delta, reasons };
}

// USA, Canada, Mexico are co-hosts — get home advantage when playing.
const HOSTS = new Set(['usa', 'mexico', 'canada']);

// ── Match-stakes feature ──────────────────────────────────────────────────────
// Stakes are derived from group standings and applied as an Elo modifier.
// Applied to the TEAM rating only (not HOME_ADV) — the home crowd effect survives
// rotation; the lineup quality drop is better modeled as "weaker effective rating."
//
// *** UNCALIBRATED PLACEHOLDER VALUES ***
// Fit these from backtesting once MD3 results are available.
// Reasoning: ~50 Elo ≈ 0.125 goals expected-goal shift; consistent with typical
// rotation depth in dead-rubber group finals.
const STAKES_SECURE = -50; // Team has 6 pts (already qualified) — likely rotating key players
const STAKES_DEAD   = -80; // Team has 0 pts (eliminated) — playing youth/backups, no stakes
const STAKES_LIVE   =   0; // Team still fighting — full effort assumed

function buildStakesMap() {
  let wc;
  try {
    wc = JSON.parse(readFileSync(new URL('./data/wc2026-results.json', import.meta.url), 'utf8'));
  } catch {
    return {}; // file not found — no stakes adjustment
  }
  const table = {};
  for (const m of wc.matches) {
    const g = m.group;
    if (!table[g]) table[g] = {};
    for (const [slug, gf, ga] of [[m.t1, m.g1, m.g2], [m.t2, m.g2, m.g1]]) {
      if (!table[g][slug]) table[g][slug] = { pts: 0, gd: 0 };
      const s = table[g][slug];
      s.gd += gf - ga;
      if (gf > ga) s.pts += 3; else if (gf === ga) s.pts += 1;
    }
  }
  const map = {};
  for (const group of Object.values(table)) {
    const teams = Object.entries(group).sort(([,a],[,b]) => b.pts - a.pts || b.gd - a.gd);
    for (let i = 0; i < teams.length; i++) {
      const [slug, { pts }] = teams[i];
      if (pts === 6) {
        map[slug] = { label: 'SAFE',  delta: STAKES_SECURE };
      } else if (pts === 0 && i >= 2) {
        map[slug] = { label: 'ELIM',  delta: STAKES_DEAD   };
      } else {
        map[slug] = { label: 'LIVE',  delta: STAKES_LIVE   };
      }
    }
  }
  return map;
}

const STAKES_MAP = buildStakesMap();

// Remaining Group Stage (MD3) fixtures — pairs not yet played as of 2026-06-24.
const FIXTURES = [
  { group: 'A', team1: 'Mexico',          t1: 'mexico',                team2: 'Czech Republic',     t2: 'czech-republic'         },
  { group: 'A', team1: 'South Korea',     t1: 'south-korea',           team2: 'South Africa',       t2: 'south-africa'           },
  { group: 'B', team1: 'Canada',          t1: 'canada',                team2: 'Switzerland',        t2: 'switzerland'            },
  { group: 'B', team1: 'Qatar',           t1: 'qatar',                 team2: 'Bosnia & Herz.',     t2: 'bosnia-and-herzegovina' },
  { group: 'C', team1: 'Brazil',          t1: 'brazil',                team2: 'Scotland',           t2: 'scotland'               },
  { group: 'C', team1: 'Morocco',         t1: 'morocco',               team2: 'Haiti',              t2: 'haiti'                  },
  { group: 'D', team1: 'USA',             t1: 'usa',                   team2: 'Turkey',             t2: 'turkey'                 },
  { group: 'D', team1: 'Australia',       t1: 'australia',             team2: 'Paraguay',           t2: 'paraguay'               },
  { group: 'E', team1: 'Germany',         t1: 'germany',               team2: 'Ecuador',            t2: 'ecuador'                },
  { group: 'E', team1: 'Ivory Coast',     t1: 'ivory-coast',           team2: 'Curaçao',            t2: 'curacao'                },
  { group: 'F', team1: 'Netherlands',     t1: 'netherlands',           team2: 'Tunisia',            t2: 'tunisia'                },
  { group: 'F', team1: 'Sweden',          t1: 'sweden',                team2: 'Japan',              t2: 'japan'                  },
  { group: 'G', team1: 'Belgium',         t1: 'belgium',               team2: 'New Zealand',        t2: 'new-zealand'            },
  { group: 'G', team1: 'Iran',            t1: 'iran',                  team2: 'Egypt',              t2: 'egypt'                  },
  { group: 'H', team1: 'Spain',           t1: 'spain',                 team2: 'Uruguay',            t2: 'uruguay'                },
  { group: 'H', team1: 'Saudi Arabia',    t1: 'saudi-arabia',          team2: 'Cape Verde',         t2: 'cape-verde'             },
  { group: 'I', team1: 'France',          t1: 'france',                team2: 'Norway',             t2: 'norway'                 },
  { group: 'I', team1: 'Iraq',            t1: 'iraq',                  team2: 'Senegal',            t2: 'senegal'                },
  { group: 'J', team1: 'Argentina',       t1: 'argentina',             team2: 'Jordan',             t2: 'jordan'                 },
  { group: 'J', team1: 'Austria',         t1: 'austria',               team2: 'Algeria',            t2: 'algeria'                },
  { group: 'K', team1: 'Portugal',        t1: 'portugal',              team2: 'Colombia',           t2: 'colombia'               },
  { group: 'K', team1: 'Uzbekistan',      t1: 'uzbekistan',            team2: 'DR Congo',           t2: 'dr-congo'               },
  { group: 'L', team1: 'England',         t1: 'england',               team2: 'Panama',             t2: 'panama'                 },
  { group: 'L', team1: 'Ghana',           t1: 'ghana',                 team2: 'Croatia',            t2: 'croatia'                },
];

// ── Formatting helpers ────────────────────────────────────────────────────────

const W = 72;
const HR = (c = '─') => c.repeat(W);
const pct  = (p, d = 1) => (p * 100).toFixed(d) + '%';
const fair = p => (1 / p).toFixed(2);
// "  58.3%  1.72"
const pc = p => `${pct(p).padStart(6)}  ${fair(p).padStart(5)}`;

function printMatch(fix, showEV = false) {
  const rA = ratings[fix.t1], rB = ratings[fix.t2];
  if (!rA || !rB) { console.error(`  [SKIP] Missing rating for ${fix.t1} or ${fix.t2}`); return null; }

  // ── Lineup adjustment from fetch-lineups.mjs data ────────────────────────
  const fixtureEntry = lineupData?.matches?.find(
    m => (m.homeSlug === fix.t1 && m.awaySlug === fix.t2) ||
         (m.homeSlug === fix.t2 && m.awaySlug === fix.t1)
  );
  const adjA = lineupAdjustment(fix.t1, fixtureEntry?.homeSlug === fix.t1 ? 'home' : 'away', fixtureEntry);
  const adjB = lineupAdjustment(fix.t2, fixtureEntry?.homeSlug === fix.t2 ? 'home' : 'away', fixtureEntry);

  const eA = rA + adjA.delta;
  const eB = rB + adjB.delta;

  // Home advantage: host team gets +130 Elo (single-sided — only home team's attack boosted).
  const hb = HOSTS.has(fix.t1) ? 130 : HOSTS.has(fix.t2) ? -130 : 0;
  const lA = expectedGoals(eA, eB, hb > 0 ? hb : 0);
  const lB = expectedGoals(eB, eA, hb < 0 ? -hb : 0);
  const matrix = buildScoreMatrix(lA, lB);

  const homeTag = hb > 0 ? `  [${fix.team1} at home +130]`
                : hb < 0 ? `  [${fix.team2} at home +130]`
                : '  [neutral]';
  const n1 = fix.team1, n2 = fix.team2;

  // Rating display — show frozen → live delta if live ratings are active
  const fA = frozenRatings[fix.t1] ?? rA;
  const fB = frozenRatings[fix.t2] ?? rB;
  const deltaA = rA - fA, deltaB = rB - fB;
  const fmtDelta = d => d === 0 ? '' : ` (${d > 0 ? '+' : ''}${Math.round(d)} WC form)`;
  const eloLine = `  Elo: ${n1} ${rA}${fmtDelta(deltaA)}  |  ${n2} ${rB}${fmtDelta(deltaB)}`;

  console.log('\n' + HR('='));
  console.log(`  GROUP ${fix.group}  |  ${n1.toUpperCase()}  vs  ${n2.toUpperCase()}${homeTag}`);
  console.log(eloLine);

  // Lineup adjustment notes
  if (adjA.reasons.length || adjB.reasons.length) {
    console.log('  Player absences:');
    for (const r of adjA.reasons) console.log(`    ${n1}: ${r.player} absent (${r.source}) → −${r.impact} Elo`);
    for (const r of adjB.reasons) console.log(`    ${n2}: ${r.player} absent (${r.source}) → −${r.impact} Elo`);
    const effLine = [];
    if (adjA.delta) effLine.push(`${n1} effective ${eA}`);
    if (adjB.delta) effLine.push(`${n2} effective ${eB}`);
    if (effLine.length) console.log(`  → Effective: ${effLine.join('  |  ')}`);
  } else if (fixtureEntry?.confirmedLineups) {
    console.log('  Lineups confirmed — all key players present.');
  } else {
    console.log('  Lineups: not yet announced (run node fetch-lineups.mjs closer to kickoff).');
  }
  console.log(`  Expected goals: ${n1} ${lA.toFixed(2)} – ${n2} ${lB.toFixed(2)}  (total ${(lA+lB).toFixed(2)})`);
  console.log(HR('='));

  // ── 1X2 + HT Result ────────────────────────────────────────────────────────
  const r  = market1X2(matrix);
  const ht = marketHT1X2(lA, lB);
  const col1W = 32;

  console.log(`\n  ${'MATCH RESULT (1X2)'.padEnd(col1W)}  HALF-TIME RESULT`);
  console.log(HR());
  const rows1x2 = [
    [n1 + ' Win', r.w1, n1 + ' HT Win', ht.w1],
    ['Draw',      r.d,  'Draw HT',       ht.d],
    [n2 + ' Win', r.w2, n2 + ' HT Win', ht.w2],
  ];
  rows1x2.forEach(([la, pa, lb, pb]) => {
    console.log(`  ${la.padEnd(22)}${pc(pa).padEnd(col1W - 22)}  ${lb.padEnd(16)}${pc(pb)}`);
  });

  // ── Asian Handicap ────────────────────────────────────────────────────────
  // Show 5 lines from the favorite's perspective.
  // Columns: Handicap | Fav Win% | Fair | Dog Win% | Fair | Push%
  const favA = lA >= lB;
  const fav  = favA ? n1 : n2;
  const dog  = favA ? n2 : n1;
  const fShort = fav.length > 10 ? fav.substring(0, 10) : fav;
  const dShort = dog.length > 10 ? dog.substring(0, 10) : dog;

  console.log(`\n  ASIAN HANDICAP`);
  console.log(HR());
  console.log(`  ${'Handicap'.padEnd(28)}${'Fav Win%'.padStart(7)}  ${'Odds'.padStart(5)}   ${'Dog Win%'.padStart(8)}  ${'Odds'.padStart(5)}   Push%`);
  console.log(`  ${HR('·')}`);

  [0.5, 1.0, 1.5, 2.0, 2.5].forEach(l => {
    const line  = favA ? -l : l;
    const ah    = marketAH(matrix, line);
    const favP  = favA ? ah.winA : ah.winB;
    const dogP  = favA ? ah.winB : ah.winA;
    const label = `${fShort} -${l.toFixed(1)}  /  ${dShort} +${l.toFixed(1)}`;
    const pushStr = ah.push > 0.002 ? pct(ah.push, 1).padStart(5) : '  —  ';
    console.log(
      `  ${label.padEnd(28)}${pct(favP).padStart(7)}  ${fair(favP).padStart(5)}   ${pct(dogP).padStart(8)}  ${fair(dogP).padStart(5)}   ${pushStr}`
    );
  });

  // ── Handicap 1X2 ─────────────────────────────────────────────────────────
  const rawDiff = Math.abs(lA - lB);
  const h1x2Mag = Math.max(0, Math.round(rawDiff));
  const h1x2Line = favA ? -h1x2Mag : h1x2Mag;
  const h12 = marketH1X2(matrix, h1x2Line);
  const hDesc = h1x2Mag === 0 ? '0 (level)' : `${fav} -${h1x2Mag}`;

  console.log(`\n  HANDICAP 1X2  (${hDesc})`);
  console.log(HR());
  console.log(`  ${n1.padEnd(20)} Win      ${pc(h12.winA)}`);
  console.log(`  ${'Draw'.padEnd(20)}          ${pc(h12.push)}`);
  console.log(`  ${n2.padEnd(20)} Win      ${pc(h12.winB)}`);

  // ── Over / Under ──────────────────────────────────────────────────────────
  console.log(`\n  OVER / UNDER (Full Match)`);
  console.log(HR());
  console.log(`  ${'Line'.padEnd(8)}${'Over%'.padStart(7)}  ${'Odds'.padStart(5)}   ${'Under%'.padStart(7)}  ${'Odds'.padStart(5)}`);
  [0.5, 1.5, 2.5, 3.5, 4.5].forEach(l => {
    const ou = marketOU(matrix, l);
    console.log(`  ${('OU ' + l.toFixed(1)).padEnd(8)}${pct(ou.over).padStart(7)}  ${fair(ou.over).padStart(5)}   ${pct(ou.under).padStart(7)}  ${fair(ou.under).padStart(5)}`);
  });

  console.log(`\n  OVER / UNDER (Half-Time)`);
  console.log(HR());
  console.log(`  ${'Line'.padEnd(8)}${'Over%'.padStart(7)}  ${'Odds'.padStart(5)}   ${'Under%'.padStart(7)}  ${'Odds'.padStart(5)}`);
  [0.5, 1.5, 2.5].forEach(l => {
    const htu = marketHTOU(lA, lB, l);
    console.log(`  ${('HT ' + l.toFixed(1)).padEnd(8)}${pct(htu.over).padStart(7)}  ${fair(htu.over).padStart(5)}   ${pct(htu.under).padStart(7)}  ${fair(htu.under).padStart(5)}`);
  });

  // ── Total Bands + BTTS + Odd/Even ─────────────────────────────────────────
  const bands = marketBands(matrix);
  const btts  = marketBTTS(matrix);
  const oe    = marketOddEven(matrix);

  console.log(`\n  TOTAL GOALS BANDS    BOTH TEAMS TO SCORE    ODD / EVEN`);
  console.log(HR());
  console.log(`  0–1 goals  ${pc(bands['0-1'])}   Yes  ${pc(btts.yes)}   Odd   ${pc(oe.odd)}`);
  console.log(`  2–3 goals  ${pc(bands['2-3'])}   No   ${pc(btts.no)}   Even  ${pc(oe.even)}`);
  console.log(`  4+  goals  ${pc(bands['4+'])}`);

  // ── Team to Score First ────────────────────────────────────────────────────
  const tf = marketFirstTeam(matrix, lA, lB);

  const sh = market2H1X2(lA, lB);
  console.log(`\n  TEAM TO SCORE FIRST              2ND HALF RESULT`);
  console.log(HR());
  const s1 = n1.length > 14 ? n1.substring(0, 14) : n1;
  const s2 = n2.length > 14 ? n2.substring(0, 14) : n2;
  console.log(`  ${n1.padEnd(28)} ${pc(tf.teamA)}   ${s1} Win    ${pc(sh.w1)}`);
  console.log(`  ${n2.padEnd(28)} ${pc(tf.teamB)}   ${'Draw'.padEnd(14)} ${pc(sh.d)}`);
  console.log(`  ${'No Goal (0-0)'.padEnd(28)} ${pc(tf.noGoal)}   ${s2} Win    ${pc(sh.w2)}`);

  // ── Half-Time / Full-Time ─────────────────────────────────────────────────
  const htft = marketHTFT(lA, lB);
  const htftSorted = Object.entries(htft).sort(([, a], [, b]) => b - a);
  const desc = {
    '1/1': `${n1} HT lead → ${n1} FT Win`,
    '1/X': `${n1} HT lead → Draw FT`,
    '1/2': `${n1} HT lead → ${n2} FT Win`,
    'X/1': `Draw HT → ${n1} FT Win`,
    'X/X': 'Draw HT → Draw FT',
    'X/2': `Draw HT → ${n2} FT Win`,
    '2/1': `${n2} HT lead → ${n1} FT Win`,
    '2/X': `${n2} HT lead → Draw FT`,
    '2/2': `${n2} HT lead → ${n2} FT Win`,
  };

  console.log(`\n  HALF-TIME / FULL-TIME`);
  console.log(HR());
  htftSorted.forEach(([k, p]) => {
    console.log(`  ${k}   ${desc[k].padEnd(42)}  ${pc(p)}`);
  });

  // ── Which Half ─────────────────────────────────────────────────────────────
  const wh = marketWhichHalf(lA, lB);

  console.log(`\n  WHICH HALF HAS MORE GOALS`);
  console.log(HR());
  console.log(`  1st Half      ${pc(wh.first)}`);
  console.log(`  Equal         ${pc(wh.equal)}`);
  console.log(`  2nd Half      ${pc(wh.second)}`);

  // ── Correct Score ─────────────────────────────────────────────────────────
  const cs = marketCorrectScore(matrix, 12);

  console.log(`\n  CORRECT SCORE  (top 12 by probability)`);
  console.log(HR());
  for (let i = 0; i < 12; i += 3) {
    const row = cs.slice(i, i + 3)
      .map(x => `${x.score}  ${pct(x.prob)}  @${fair(x.prob)}`.padEnd(22))
      .join('  ');
    console.log(`  ${row}`);
  }

  // ── Fair Odds Summary — key markets at a glance ────────────────────────
  const ou25 = marketOU(matrix, 2.5);
  console.log(`\n  ${'─'.repeat(W)}`);
  console.log(`  FAIR ODDS QUICK REFERENCE  (beat these to have edge)`);
  console.log(`  ${'─'.repeat(W)}`);
  console.log(`  1X2 :  ${n1} @ ${fair(r.w1).padEnd(6)}  Draw @ ${fair(r.d).padEnd(6)}  ${n2} @ ${fair(r.w2)}`);
  const ahHalf = marketAH(matrix, favA ? -0.5 : 0.5);
  console.log(`  AH  :  ${fav} -0.5 @ ${fair(favA ? ahHalf.winA : ahHalf.winB).padEnd(6)}  ${dog} +0.5 @ ${fair(favA ? ahHalf.winB : ahHalf.winA)}`);
  console.log(`  O/U :  Over 2.5 @ ${fair(ou25.over).padEnd(6)}  Under 2.5 @ ${fair(ou25.under)}`);
  console.log(`  BTTS:  Yes @ ${fair(btts.yes).padEnd(6)}  No @ ${fair(btts.no)}`);
  console.log(`  ${'─'.repeat(W)}`);
  console.log('');

  return { r, ou25, ahHalf, btts, favA, n1, n2, fav, dog };
}

// ── EV display helper ─────────────────────────────────────────────────────────
// spOdds = { h: decimal, d: decimal, a: decimal }
function printEV(matchResult, spOdds) {
  if (!matchResult || !spOdds) return;
  const { r, n1, n2 } = matchResult;
  const evH = r.w1 * spOdds.h - 1;
  const evD = r.d  * spOdds.d - 1;
  const evA = r.w2 * spOdds.a - 1;
  const fmt  = ev => (ev >= 0 ? '+' : '') + (ev * 100).toFixed(1) + '%';
  const flag = ev => ev > 0.02 ? '  ◄ +EV' : ev > 0 ? '  ◄ marginal' : '';

  console.log(`\n  EV CHECK  (SP odds you entered)`);
  console.log('─'.repeat(W));
  console.log(`  ${n1} Win    SP ${spOdds.h.toFixed(2)}  fair ${fair(r.w1)}   EV ${fmt(evH)}${flag(evH)}`);
  console.log(`  Draw         SP ${spOdds.d.toFixed(2)}  fair ${fair(r.d)}   EV ${fmt(evD)}${flag(evD)}`);
  console.log(`  ${n2} Win    SP ${spOdds.a.toFixed(2)}  fair ${fair(r.w2)}   EV ${fmt(evA)}${flag(evA)}`);
  const best = [['1', evH], ['X', evD], ['2', evA]].filter(([, e]) => e > 0);
  if (best.length === 0) {
    console.log(`\n  No +EV on 1X2. Model sees no edge at these SP prices.`);
  } else {
    console.log(`\n  Best bet: ${best.map(([k]) => k).join(' / ')} has positive EV at current SP prices.`);
  }
  console.log('');
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function pickAndShow() {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(res => rl.question(q, res));

  console.log('\n' + '='.repeat(W));
  console.log('  SINGAPORE POOLS — WC 2026 Group Stage MD3');
  console.log('  Fair odds (1÷prob), no SP margin. Compare to SP lines to find value.');
  console.log('='.repeat(W));

  // Group fixtures by group letter for a tidier menu
  const groups = {};
  FIXTURES.forEach((f, i) => {
    if (!groups[f.group]) groups[f.group] = [];
    groups[f.group].push({ f, i });
  });

  console.log('');
  Object.entries(groups).forEach(([g, items]) => {
    items.forEach(({ f, i }) => {
      const home = HOSTS.has(f.t1) ? ' ⌂' : HOSTS.has(f.t2) ? ' ⌂' : '';
      console.log(`  ${String(i + 1).padStart(2)}.  Group ${g}  ${f.team1} vs ${f.team2}${home}`);
    });
  });
  console.log(`\n   0.  Show all matches`);
  console.log('');

  let choice;
  while (true) {
    const raw = await ask('  Select a match (0–' + FIXTURES.length + '): ');
    const n = parseInt(raw.trim(), 10);
    if (!isNaN(n) && n >= 0 && n <= FIXTURES.length) { choice = n; break; }
    console.log('  Please enter a number between 0 and ' + FIXTURES.length);
  }

  console.log('');
  if (choice === 0) {
    rl.close();
    FIXTURES.forEach(printMatch);
  } else {
    const result = printMatch(FIXTURES[choice - 1]);
    const raw = await ask('  Enter SP decimal odds for EV check  (e.g.  1.65 3.80 4.20)  or Enter to skip: ');
    rl.close();
    const parts = raw.trim().split(/\s+/).map(Number).filter(n => n > 1);
    if (parts.length >= 3) {
      printEV(result, { h: parts[0], d: parts[1], a: parts[2] });
    } else if (raw.trim()) {
      console.log('  Need 3 numbers > 1 (home draw away). Skipping EV check.\n');
    }
  }
}

const args = process.argv.slice(2);

if (args.length === 0) {
  pickAndShow();
} else if (args.length >= 2) {
  // Parse --sp h d a anywhere in args
  const spIdx = args.indexOf('--sp');
  let spOdds = null;
  let cleanArgs = args;
  if (spIdx !== -1) {
    const odds = args.slice(spIdx + 1, spIdx + 4).map(Number);
    if (odds.length === 3 && odds.every(n => n > 1)) {
      spOdds = { h: odds[0], d: odds[1], a: odds[2] };
    }
    cleanArgs = args.filter((_, i) => i < spIdx || i > spIdx + 3);
  }

  const [t1slug, t2slug, homeSlug] = cleanArgs;
  if (!ratings[t1slug] || !ratings[t2slug]) {
    console.error(`Unknown slug(s). Available:\n  ${Object.keys(ratings).sort().join(', ')}`);
    process.exit(1);
  }
  const label = s => s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  if (homeSlug === t1slug)      { HOSTS.add(t1slug); HOSTS.delete(t2slug); }
  else if (homeSlug === t2slug) { HOSTS.add(t2slug); HOSTS.delete(t1slug); }
  else if (homeSlug)            { HOSTS.clear(); }
  const fix = FIXTURES.find(f => f.t1 === t1slug && f.t2 === t2slug)
           ?? { group: '?', team1: label(t1slug), t1: t1slug, team2: label(t2slug), t2: t2slug };
  const result = printMatch(fix);
  if (spOdds) printEV(result, spOdds);
} else {
  console.log('Usage:');
  console.log('  node sg-pools.mjs                             → interactive match picker');
  console.log('  node sg-pools.mjs <team1> <team2>             → single match (neutral)');
  console.log('  node sg-pools.mjs <team1> <team2> <home>      → with home advantage');
  console.log('  node sg-pools.mjs <team1> <team2> --sp h d a  → + EV check vs SP odds');
  console.log(`\nSlugs: ${Object.keys(ratings).sort().join(', ')}`);
}

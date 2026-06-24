#!/usr/bin/env node
// Singapore Pools betting predictions for WC 2026.
// Usage:
//   node sg-pools.mjs                        → all upcoming group-stage MD3 fixtures
//   node sg-pools.mjs brazil scotland        → single fixture (neutral)
//   node sg-pools.mjs usa turkey usa         → single fixture with home advantage
import { readFileSync } from 'node:fs';
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

const { ratings } = JSON.parse(
  readFileSync(new URL('./data/elo-calibrated.json', import.meta.url), 'utf8')
);

// USA, Canada, Mexico are co-hosts — get home advantage when playing.
const HOSTS = new Set(['usa', 'mexico', 'canada']);

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
const pc = (p, pad = 6) => `${pct(p).padStart(pad)}  ${fair(p).padStart(5)}`;

function printMatch(fix) {
  const rA = ratings[fix.t1], rB = ratings[fix.t2];
  if (!rA || !rB) { console.error(`  [SKIP] Missing rating for ${fix.t1} or ${fix.t2}`); return; }

  // Home advantage: host team gets +75 Elo (matches matchProb convention).
  const hb = HOSTS.has(fix.t1) ? 75 : HOSTS.has(fix.t2) ? -75 : 0;
  const lA = expectedGoals(rA, rB, hb);
  const lB = expectedGoals(rB, rA, -hb / 2);
  const matrix = buildScoreMatrix(lA, lB);

  const homeTag = hb > 0 ? `  [${fix.team1} at home +75]`
                : hb < 0 ? `  [${fix.team2} at home +75]`
                : '  [neutral]';
  const n1 = fix.team1, n2 = fix.team2;

  console.log('\n' + HR('═'));
  console.log(`  GROUP ${fix.group}  ┃  ${n1.toUpperCase()}  vs  ${n2.toUpperCase()}${homeTag}`);
  console.log(`  Elo: ${n1} ${rA}  │  ${n2} ${rB}`);
  console.log(`  Expected goals: ${n1} ${lA.toFixed(2)} – ${n2} ${lB.toFixed(2)}  (total ${(lA+lB).toFixed(2)})`);
  console.log(HR('═'));

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
  rl.close();

  console.log('');
  if (choice === 0) {
    FIXTURES.forEach(printMatch);
  } else {
    printMatch(FIXTURES[choice - 1]);
  }
}

const args = process.argv.slice(2);

if (args.length === 0) {
  pickAndShow();
} else if (args.length >= 2) {
  const [t1slug, t2slug, homeSlug] = args;
  if (!ratings[t1slug] || !ratings[t2slug]) {
    console.error(`Unknown slug(s). Available:\n  ${Object.keys(ratings).sort().join(', ')}`);
    process.exit(1);
  }
  const label = s => s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  // If a 3rd arg is given, override the host set so home advantage resolves correctly.
  if (homeSlug === t1slug)      { HOSTS.add(t1slug); HOSTS.delete(t2slug); }
  else if (homeSlug === t2slug) { HOSTS.add(t2slug); HOSTS.delete(t1slug); }
  else if (homeSlug)            { HOSTS.clear(); }           // explicit neutral
  const fix = FIXTURES.find(f => f.t1 === t1slug && f.t2 === t2slug)
           ?? { group: '?', team1: label(t1slug), t1: t1slug, team2: label(t2slug), t2: t2slug };
  printMatch(fix);
} else {
  console.log('Usage:');
  console.log('  node sg-pools.mjs                         → all MD3 group fixtures');
  console.log('  node sg-pools.mjs <team1> <team2>         → single match (neutral)');
  console.log('  node sg-pools.mjs <team1> <team2> <home>  → with home advantage');
  console.log(`\nSlugs: ${Object.keys(ratings).sort().join(', ')}`);
}

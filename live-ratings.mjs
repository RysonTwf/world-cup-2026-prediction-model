#!/usr/bin/env node
// Apply WC 2026 in-tournament results to the frozen calibrated ratings.
// Produces data/elo-live.json — picked up automatically by predict.mjs and sg-pools.mjs.
//   node live-ratings.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { HOME_ADV } from './elo.mjs';

const D = (f) => new URL(`./data/${f}`, import.meta.url);

const { ratings: base }     = JSON.parse(readFileSync(D('elo-calibrated.json'), 'utf8'));
const { ratings: baseForm } = JSON.parse(readFileSync(D('elo-form.json'),       'utf8'));
const { matches, updated }  = JSON.parse(readFileSync(D('wc2026-results.json'), 'utf8'));

// Clone base ratings — live ratings walk forward from the calibrated snapshot.
const R  = { ...base };
const RF = { ...baseForm };

const HOST   = new Set(['usa', 'mexico', 'canada']);

const expectedScore = (a, b, hb = 0) => 1 / (1 + Math.pow(10, (b - (a + hb)) / 400));
const gMult = (gd) => { const d = Math.abs(gd); return d <= 1 ? 1 : d === 2 ? 1.5 : (11 + d) / 8; };

// K = 55 for World Cup matches (same as calibrate.mjs baseK).
// No recency weight — all WC matches are recent and equally informative.
const K_WC = 55;

let applied = 0;
const log = [];

for (const m of matches) {
  // FT, AET, and PEN all count — g1/g2 is the score at the end of play (before any shootout),
  // so a PEN match still scores as a draw for rating purposes (a shootout is close to a coin flip).
  if (!['FT', 'AET', 'PEN'].includes(m.status) || m.g1 == null || m.g2 == null) continue;

  const t1 = m.t1, t2 = m.t2;
  if (R[t1] == null || R[t2] == null) continue;

  const hb    = HOST.has(t1) ? HOME_ADV / 2 : HOST.has(t2) ? -HOME_ADV / 2 : 0;
  const score = m.g1 > m.g2 ? 1 : m.g1 < m.g2 ? 0 : 0.5;
  const gm    = gMult(m.g1 - m.g2);
  const k     = K_WC * gm;

  // ── Elo update ────────────────────────────────────────────────────────────
  const expElo = expectedScore(R[t1], R[t2], hb);
  const dElo   = k * (score - expElo);
  const before1 = R[t1], before2 = R[t2];
  R[t1] += dElo;
  R[t2] -= dElo;

  // ── Form update ───────────────────────────────────────────────────────────
  const expForm = expectedScore(RF[t1], RF[t2], hb);
  const dForm   = k * (score - expForm);
  RF[t1] += dForm;
  RF[t2] -= dForm;

  log.push({
    date: m.date, group: m.group,
    team1: m.team1, team2: m.team2,
    score: `${m.g1}–${m.g2}`,
    delta1: +dElo.toFixed(1), delta2: +(-dElo).toFixed(1),
    elo1Before: Math.round(before1), elo1After: Math.round(R[t1]),
    elo2Before: Math.round(before2), elo2After: Math.round(R[t2]),
  });
  applied++;
}

// Round final ratings.
const liveRatings = {}, liveForm = {};
for (const s of Object.keys(base)) {
  liveRatings[s] = Math.round(R[s]);
  liveForm[s]    = Math.round(RF[s] ?? base[s]);
}

// Print summary: biggest movers.
console.log(`\nLive ratings: ${applied} WC 2026 matches applied (data through ${updated.slice(0, 10)})\n`);

const moves = Object.keys(base).map(s => ({
  slug: s, base: base[s], live: liveRatings[s], delta: liveRatings[s] - base[s],
})).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

console.log('  Biggest movers from pre-tournament baseline:');
for (const { slug, base: b, live, delta } of moves.slice(0, 12)) {
  const sign = delta >= 0 ? '+' : '';
  console.log(`  ${slug.padEnd(24)} ${b} → ${live}  (${sign}${delta})`);
}

writeFileSync(D('elo-live.json'), JSON.stringify({
  generatedAt:   new Date().toISOString(),
  dataThrough:   updated,
  matchesApplied: applied,
  ratings:       liveRatings,
  formRatings:   liveForm,
  matchLog:      log,
}, null, 2) + '\n');

console.log(`\n→ wrote data/elo-live.json`);

#!/usr/bin/env node
// Apply WC 2026 group-stage results on top of frozen calibrated ratings.
// Saves data/elo-live.json — run before sg-pools.mjs for MD3 predictions.
//   node live-ratings.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { expectedScore } from './elo.mjs';

const D = f => new URL('./data/' + f, import.meta.url);
const { ratings: base }  = JSON.parse(readFileSync(D('elo-calibrated.json'), 'utf8'));
const { matches }        = JSON.parse(readFileSync(D('wc2026-results.json'), 'utf8'));

const HOME_ADV = 130;
const WC_K     = 55;
const HOSTS    = new Set(['usa', 'mexico', 'canada']);
const gMult    = gd => { const d = Math.abs(gd); return d <= 1 ? 1 : d === 2 ? 1.5 : (11 + d) / 8; };

const R       = { ...base };
const totals  = {};          // cumulative Elo delta per team across all WC matches

for (const m of matches) {
  if (m.g1 == null || m.g2 == null) continue;
  const ra = R[m.t1], rb = R[m.t2];
  if (ra == null || rb == null) continue;

  const hb   = HOSTS.has(m.t1) ? HOME_ADV : HOSTS.has(m.t2) ? -HOME_ADV : 0;
  const exp  = expectedScore(ra, rb, Math.max(0, hb));
  const gd   = m.g1 - m.g2;
  const score = gd > 0 ? 1 : gd < 0 ? 0 : 0.5;
  const delta = WC_K * gMult(gd) * (score - exp);

  R[m.t1] = ra + delta;
  R[m.t2] = rb - delta;
  totals[m.t1] = (totals[m.t1] ?? 0) + delta;
  totals[m.t2] = (totals[m.t2] ?? 0) - delta;
}

// Round for storage
for (const k of Object.keys(R)) R[k] = Math.round(R[k]);

// Display
const W = 54;
console.log(`\n${'═'.repeat(W)}`);
console.log('  In-tournament Elo changes (WC 2026 MD1 + MD2)');
console.log('═'.repeat(W));
console.log('  Team                   Before   After    Δ');
console.log('  ' + '─'.repeat(W - 2));

const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a);
for (const [slug, d] of sorted) {
  if (Math.abs(d) < 1) continue;
  const before = base[slug] ?? '?';
  const after  = R[slug]  ?? '?';
  const sign   = d >= 0 ? '+' : '';
  console.log(`  ${slug.padEnd(22)} ${String(before).padStart(5)}    ${String(after).padStart(5)}  ${sign}${Math.round(d)}`);
}

const n = matches.filter(m => m.g1 != null).length;
writeFileSync(D('elo-live.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'elo-calibrated.json + wc2026-results.json',
  matchesApplied: n,
  ratings: R,
}, null, 2) + '\n');
console.log(`\n→ Wrote data/elo-live.json  (${n} WC matches applied)\n`);

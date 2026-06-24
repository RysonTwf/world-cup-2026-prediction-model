#!/usr/bin/env node
// Dead-rubber backtest: compare model calibration with and without stakes adjustment
// on historical tournament group-stage matches where one or both teams had nothing to play for.
//
// Data source: results.json (Euro 2024, Copa America 2024 group stage matches)
// These are the only tournament group-stage matches in the training dataset.
// NOTE: sample size is small (~7 usable dead-rubber matches). Results are directional
// only — insufficient to calibrate STAKES_SECURE / STAKES_DEAD precisely.
//   node backtest-stakes.mjs
import { readFileSync } from 'node:fs';
import { matchProb } from './elo.mjs';

const { ratings } = JSON.parse(readFileSync(new URL('./data/elo-calibrated.json', import.meta.url), 'utf8'));
const rps3 = (p, y) => 0.5 * ((p[0]-y[0])**2 + (p[0]+p[1]-y[0]-y[1])**2);

// Dead-rubber matches identified from historical tournament group stage data.
// Standings reconstructed manually from competition data.
// Format: { h, a, hg, ag, hStatus, aStatus, note }
// Statuses: 'SAFE' (6pts qualified), 'LIVE', 'ELIM' (0pts eliminated)
const DEAD_RUBBER_MATCHES = [
  // Euro 2024 Group F MD3 (Jun 26 2024)
  { h:'georgia',       a:'portugal',    hg:2, ag:0, hStatus:'LIVE', aStatus:'SAFE',
    note:'Euro 2024 Grp F MD3 — Portugal 6pts(SAFE, likely rotating). Georgia 1pt(LIVE). Result: 2-0 upset.' },
  { h:'czech-republic',a:'turkey',      hg:1, ag:2, hStatus:'LIVE', aStatus:'LIVE',
    note:'Euro 2024 Grp F MD3 — both teams live (Czech 1pt, Turkey 3pts). No dead rubber.' },

  // Euro 2024 Group D MD3 (Jun 25 2024)
  { h:'france',        a:'poland',      hg:1, ag:1, hStatus:'SAFE', aStatus:'ELIM',
    note:'Euro 2024 Grp D MD3 — France 4pts(SAFE-leaning, likely to rotate). Poland 0pts(ELIM). Result: 1-1.' },
  { h:'netherlands',   a:'austria',     hg:2, ag:3, hStatus:'LIVE', aStatus:'LIVE',
    note:'Euro 2024 Grp D MD3 — Netherlands 1pt vs Austria 3pts. Both live. No dead rubber.' },

  // Euro 2024 Group E MD3 (Jun 26 2024)
  { h:'ukraine',       a:'belgium',     hg:0, ag:0, hStatus:'ELIM', aStatus:'LIVE',
    note:'Euro 2024 Grp E MD3 — Ukraine 0pts(ELIM). Belgium 3pts(LIVE). Ukraine dead rubber side.' },

  // Copa America 2024 Group D MD3 (Jul 3 2024)
  { h:'brazil',        a:'colombia',    hg:1, ag:1, hStatus:'LIVE', aStatus:'SAFE',
    note:'Copa Am 2024 Grp D MD3 — Colombia 6pts(SAFE). Brazil 4pts(LIVE, needed result). Result: 1-1.' },
  { h:'costa-rica',    a:'paraguay',    hg:2, ag:1, hStatus:'LIVE', aStatus:'ELIM',
    note:'Copa Am 2024 Grp D MD3 — Paraguay 0pts(ELIM). Costa Rica 1pt(LIVE). Cost Rica win.' },
];

// Stakes Elo deltas to test (placeholder values from sg-pools.mjs)
const STAKES_SECURE = -50;
const STAKES_DEAD   = -80;

function stakeDelta(status) {
  if (status === 'SAFE') return STAKES_SECURE;
  if (status === 'ELIM') return STAKES_DEAD;
  return 0;
}

function predict(hSlug, aSlug, hDelta = 0, aDelta = 0) {
  const rh = ratings[hSlug], ra = ratings[aSlug];
  if (!rh || !ra) return null;
  // No home advantage — these are tournament neutral/host venues
  return matchProb(rh + hDelta, ra + aDelta, 0);
}

console.log('\n=== Dead-rubber backtest (' + DEAD_RUBBER_MATCHES.length + ' matches) ===');
console.log('Comparing model predictions WITH vs WITHOUT stakes adjustment.\n');
console.log('Uncalibrated stakes: SAFE=' + STAKES_SECURE + ' Elo,  ELIM=' + STAKES_DEAD + ' Elo\n');

let rpsBase = 0, rpsStakes = 0, n = 0;
const summary = [];

for (const m of DEAD_RUBBER_MATCHES) {
  const pBase   = predict(m.h, m.a);
  const pStakes = predict(m.h, m.a, stakeDelta(m.hStatus), stakeDelta(m.aStatus));
  if (!pBase || !pStakes) {
    console.log(`  SKIP (missing rating): ${m.h} vs ${m.a}`);
    continue;
  }
  const actual = m.hg > m.ag ? 0 : m.hg < m.ag ? 2 : 1;
  const yVec   = [actual===0?1:0, actual===1?1:0, actual===2?1:0];

  const pbArr = [pBase.winA,   pBase.draw,   pBase.winB];
  const psArr = [pStakes.winA, pStakes.draw, pStakes.winB];
  const rpsB  = rps3(pbArr, yVec);
  const rpsS  = rps3(psArr, yVec);
  rpsBase += rpsB; rpsStakes += rpsS; n++;

  const hLabel = m.h.padEnd(14), aLabel = m.a.padEnd(14);
  const result = `${m.hg}-${m.ag}`;
  const dir = rpsS < rpsB ? 'BETTER' : rpsS > rpsB ? 'WORSE ' : 'SAME  ';
  summary.push({ m, pbArr, psArr, rpsB, rpsS, dir });

  console.log(`  ${hLabel} ${m.hStatus.padEnd(5)} vs ${aLabel} ${m.aStatus.padEnd(5)}  result ${result}`);
  console.log(`    Base:   ${m.h} ${(pbArr[0]*100).toFixed(1)}%  draw ${(pbArr[1]*100).toFixed(1)}%  ${m.a} ${(pbArr[2]*100).toFixed(1)}%   RPS ${rpsB.toFixed(4)}`);
  console.log(`    Stakes: ${m.h} ${(psArr[0]*100).toFixed(1)}%  draw ${(psArr[1]*100).toFixed(1)}%  ${m.a} ${(psArr[2]*100).toFixed(1)}%   RPS ${rpsS.toFixed(4)}  [${dir}]`);
  console.log(`    ${m.note}`);
  console.log('');
}

console.log('─'.repeat(72));
console.log(`  TOTALS (${n} matches):`);
console.log(`    Base  model avg RPS: ${(rpsBase/n).toFixed(4)}`);
console.log(`    Stakes-adj avg RPS:  ${(rpsStakes/n).toFixed(4)}`);
const delta = ((rpsStakes - rpsBase) / rpsBase * 100).toFixed(1);
console.log(`    Change: ${rpsStakes < rpsBase ? '-' : '+'}${Math.abs(+delta)}%  (${rpsStakes < rpsBase ? 'stakes IMPROVE' : 'stakes WORSEN'} calibration on this sample)`);
console.log('');
console.log('  ⚠ Only ' + n + ' matches — directional signal only, not statistically significant.');
console.log('  Recalibrate STAKES_SECURE and STAKES_DEAD after WC 2026 MD3 (24 matches incl.');
console.log('  4 full dead rubbers and 7 partial ones) using this same script.');

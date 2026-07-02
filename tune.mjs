#!/usr/bin/env node
// Hyperparameter tuner — coordinate descent over (DC_RHO, HOME_ADV, goalsBase, goalsScale)
// to minimise walk-forward RPS on results.json.  Same evaluation protocol as backtest.mjs
// (burn-in 150, out-of-sample, no look-ahead).
//   node tune.mjs
import { readFileSync, existsSync } from 'node:fs';

const D = f => new URL(`./data/${f}`, import.meta.url);

// Data-driven seeds (2016-2025) from build-seeds.mjs — same priors calibrate.mjs uses.
const seedsFile = D('seeds.json');
const SEED = existsSync(seedsFile)
  ? JSON.parse(readFileSync(seedsFile, 'utf8')).seeds
  : (() => { console.warn('[tune] data/seeds.json not found — run node build-seeds.mjs first. Using flat 1500 prior.'); return {}; })();

const BURN_IN = 150;
const { matches } = JSON.parse(readFileSync(D('results.json'), 'utf8'));

function pmf(k, lam) {
  if (lam <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lam);
  for (let i = 1; i <= k; i++) p *= lam / i;
  return p;
}

function dcTau(a, b, l, m, rho) {
  if (a === 0 && b === 0) return 1 - l * m * rho;
  if (a === 0 && b === 1) return 1 + l * rho;
  if (a === 1 && b === 0) return 1 + m * rho;
  if (a === 1 && b === 1) return 1 - rho;
  return 1;
}

const baseK = (n = '') => {
  n = n.toLowerCase();
  if (/world cup(?!.*qual)/.test(n)) return 55;
  if (/world cup.*qual|qualification/.test(n)) return 40;
  if (/copa america|euro championship\b|asian cup|africa cup|gold cup/.test(n)) return 50;
  if (/nations league|nations cup/.test(n)) return 32;
  if (/friendl/.test(n)) return 18;
  return 28;
};
const gMult = gd => { const d = Math.abs(gd); return d <= 1 ? 1 : d === 2 ? 1.5 : (11 + d) / 8; };
const rps3 = (p, y) => 0.5 * ((p[0]-y[0])**2 + (p[0]+p[1]-y[0]-y[1])**2);

function evaluate({ rho, homeAdv, goalsBase, goalsScale }) {
  const R = {};
  const getR = (s, nm) => { const k = s ?? `ghost:${nm}`; if (R[k] == null) R[k] = s && SEED[s] != null ? SEED[s] : 1500; return R[k]; };
  const setR = (s, nm, v) => { R[s ?? `ghost:${nm}`] = v; };
  const expScore = (a, b, hb) => 1 / (1 + Math.pow(10, (b - (a + hb)) / 400));

  let rpsSum = 0, n = 0, i = 0;

  for (const m of matches) {
    if (m.hg == null || m.ag == null) continue;
    const ra = getR(m.homeSlug, m.homeName), rb = getR(m.awaySlug, m.awayName);

    if (i >= BURN_IN) {
      const lA = Math.max(0.3, Math.min(3.5, goalsBase + (ra + homeAdv - rb) / goalsScale));
      const lB = Math.max(0.3, Math.min(3.5, goalsBase + (rb - ra) / goalsScale));
      let winA = 0, draw = 0, winB = 0;
      for (let a = 0; a <= 8; a++) {
        const pA = pmf(a, lA);
        for (let b = 0; b <= 8; b++) {
          const tau = dcTau(a, b, lA, lB, rho);
          const p = pA * pmf(b, lB) * tau;
          if (a > b) winA += p; else if (a < b) winB += p; else draw += p;
        }
      }
      const total = winA + draw + winB;
      const probs = [winA/total, draw/total, winB/total];
      const actual = m.hg > m.ag ? 0 : m.hg < m.ag ? 2 : 1;
      const y = [actual===0?1:0, actual===1?1:0, actual===2?1:0];
      rpsSum += rps3(probs, y);
      n++;
    }

    // Use full homeAdv in Elo update (consistent with backtest.mjs; neutral-venue ratings
    // emerge naturally since most results.json games are genuinely competitive internationals).
    const exp = expScore(ra, rb, homeAdv);
    const score = m.hg > m.ag ? 1 : m.hg < m.ag ? 0 : 0.5;
    const delta = baseK(m.leagueName) * gMult(m.hg - m.ag) * (score - exp);
    setR(m.homeSlug, m.homeName, ra + delta);
    setR(m.awaySlug, m.awayName, rb - delta);
    i++;
  }

  return rpsSum / n;
}

// ── Coordinate descent ────────────────────────────────────────────────────────

const PARAMS = [
  { name: 'rho',        init: -0.13, lo: -0.35, hi: -0.03, step: 0.01 },
  { name: 'homeAdv',    init: 150,   lo:  40,   hi:  260,  step: 10   },
  { name: 'goalsBase',  init: 1.35,  lo:  0.90, hi:  1.80, step: 0.05 },
  { name: 'goalsScale', init: 400,   lo:  250,  hi:  600,  step: 25   },
];

const cur = Object.fromEntries(PARAMS.map(p => [p.name, p.init]));
const baseline = evaluate(cur);
console.log(`\nBaseline RPS (current params): ${baseline.toFixed(5)}`);
console.log('Params:', JSON.stringify(cur));
console.log('\nRunning coordinate descent...\n');

let changed = true, pass = 0;
while (changed && pass < 20) {
  changed = false;
  pass++;
  for (const { name, lo, hi, step } of PARAMS) {
    let best = evaluate(cur), bestVal = cur[name];
    const nSteps = Math.round((hi - lo) / step);
    for (let j = 0; j <= nSteps; j++) {
      const v = Math.round((lo + j * step) * 1e6) / 1e6;
      const rps = evaluate({ ...cur, [name]: v });
      if (rps < best - 1e-9) { best = rps; bestVal = v; }
    }
    if (Math.abs(bestVal - cur[name]) > 1e-9) {
      console.log(`  pass ${pass}  ${name.padEnd(12)} ${String(cur[name]).padEnd(8)} → ${bestVal}  (RPS ${best.toFixed(5)})`);
      cur[name] = bestVal;
      changed = true;
    }
  }
}

const finalRps = evaluate(cur);
console.log('\n=== OPTIMAL PARAMETERS ===');
for (const { name } of PARAMS) console.log(`  ${name.padEnd(14)} ${cur[name]}`);
console.log(`\n  Baseline RPS:   ${baseline.toFixed(5)}`);
console.log(`  Optimised RPS:  ${finalRps.toFixed(5)}`);
console.log(`  Improvement:    ${((baseline - finalRps) / baseline * 100).toFixed(2)}%`);
console.log('\nApply these values:');
console.log(`  elo.mjs         DC_RHO = ${cur.rho}  /  base = ${cur.goalsBase}  /  scale = ${cur.goalsScale}`);
console.log(`  calibrate.mjs   HOME_ADV = ${cur.homeAdv}`);
console.log(`  backtest.mjs    HOME_ADV = ${cur.homeAdv}`);

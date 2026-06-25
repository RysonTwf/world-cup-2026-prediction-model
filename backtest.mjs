#!/usr/bin/env node
// Walk-forward, OUT-OF-SAMPLE backtest of the Elo+form ensemble.
// Both models are evaluated on the same 811 matches; no look-ahead.
//   node backtest.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { matchProb, expectedScore } from "./elo.mjs";

const D = (f) => new URL(`./data/${f}`, import.meta.url);
const SEED = {
  argentina:2085,france:2065,spain:2055,brazil:2045,england:2000,portugal:1980,netherlands:1965,germany:1945,belgium:1925,italy:1915,colombia:1890,uruguay:1875,croatia:1870,morocco:1840,switzerland:1825,usa:1830,mexico:1825,japan:1810,senegal:1795,denmark:1790,ecuador:1760,australia:1735,"south-korea":1730,iran:1720,poland:1715,canada:1700,serbia:1695,wales:1665,ghana:1665,tunisia:1655,"ivory-coast":1655,nigeria:1645,"saudi-arabia":1640,qatar:1630,egypt:1620,algeria:1615,scotland:1610,cameroon:1600,paraguay:1595,venezuela:1590,chile:1580,peru:1575,"czech-republic":1570,"bosnia-and-herzegovina":1545,"south-africa":1520,"new-zealand":1495,panama:1480,jamaica:1460,honduras:1440,jordan:1420,haiti:1380,"el-salvador":1370,"trinidad-and-tobago":1360,guatemala:1345,
  norway:1880,sweden:1755,turkey:1740,austria:1720,iraq:1595,uzbekistan:1635,"cape-verde":1595,"dr-congo":1650,curacao:1545,
  georgia:1530
};
const HOME_ADV = 150, BURN_IN = 150;
const FORM_HALFLIFE_DAYS = 90;

const baseK = (n = "") => { n = n.toLowerCase();
  if (/world cup(?!.*qual)/.test(n)) return 55;
  if (/world cup.*qual|qualification/.test(n)) return 40;
  if (/copa america|euro championship\b|asian cup|africa cup|gold cup/.test(n)) return 50;
  if (/nations league|nations cup/.test(n)) return 32;
  if (/friendl/.test(n)) return 18;
  return 28; };
const gMult = (gd) => { const d = Math.abs(gd); return d <= 1 ? 1 : d === 2 ? 1.5 : (11 + d) / 8; };

const { matches } = JSON.parse(readFileSync(D("results.json"), "utf8"));
const nowSec = matches[matches.length - 1]?.ts ?? Math.floor(Date.now() / 1000);
const recencyForm = (ts) => Math.pow(0.5, ((nowSec - ts) / (30.44 * 86400)) / FORM_HALFLIFE_DAYS);

// Rating state — both models start from SEED.
const R = {}, RF = {};
const getR  = (s, nm) => { const k = s ?? `ghost:${nm}`; if (R[k]  == null) R[k]  = s && SEED[s] != null ? SEED[s] : 1500; return R[k]; };
const getRF = (s, nm) => { const k = s ?? `ghost:${nm}`; if (RF[k] == null) RF[k] = s && SEED[s] != null ? SEED[s] : 1500; return RF[k]; };
const setR  = (s, nm, v) => { R[s  ?? `ghost:${nm}`] = v; };
const setRF = (s, nm, v) => { RF[s ?? `ghost:${nm}`] = v; };

const rps3 = (p, y) => 0.5 * ((p[0] - y[0]) ** 2 + (p[0] + p[1] - y[0] - y[1]) ** 2);

// Accumulators for three models: elo, form, ensemble.
let n = 0, i = 0;
const acc = { elo: {}, form: {}, ens: {} };
for (const m of ["elo", "form", "ens"]) {
  acc[m] = { hit: 0, brier: 0, logloss: 0, rps: 0, favN: 0, favHit: 0 };
}
let eH = 0, eD = 0, eA = 0, baseHome = 0, baseElo = 0, rpsU = 0;
const BINS = 10;
const calib = Array.from({ length: BINS }, () => ({ sumP: 0, sumY: 0, n: 0 }));

for (const m of matches) {
  if (m.hg == null || m.ag == null) continue;
  const ra  = getR(m.homeSlug,  m.homeName),  rb  = getR(m.awaySlug,  m.awayName);
  const raF = getRF(m.homeSlug, m.homeName),  rbF = getRF(m.awaySlug, m.awayName);

  if (i >= BURN_IN) {
    const pElo  = matchProb(ra,  rb,  HOME_ADV);
    const pForm = matchProb(raF, rbF, HOME_ADV);
    const probs = {
      elo:  [pElo.winA,  pElo.draw,  pElo.winB],
      form: [pForm.winA, pForm.draw, pForm.winB],
      ens:  [(pElo.winA+pForm.winA)/2, (pElo.draw+pForm.draw)/2, (pElo.winB+pForm.winB)/2],
    };

    const actual = m.hg > m.ag ? 0 : m.hg < m.ag ? 2 : 1;
    const y = [actual===0?1:0, actual===1?1:0, actual===2?1:0];

    for (const key of ["elo", "form", "ens"]) {
      const p = probs[key], a = acc[key];
      const pred = p.indexOf(Math.max(...p));
      if (pred === actual) a.hit++;
      a.brier   += (p[0]-y[0])**2 + (p[1]-y[1])**2 + (p[2]-y[2])**2;
      a.logloss += -Math.log(Math.max(1e-12, p[actual]));
      a.rps     += rps3(p, y);
      if (Math.max(...p) >= 0.5) { a.favN++; if (pred === actual) a.favHit++; }
    }

    // Calibration on ensemble.
    const ep = probs.ens;
    for (let k = 0; k < 3; k++) {
      const b = Math.min(BINS-1, Math.floor(ep[k] * BINS));
      calib[b].sumP += ep[k]; calib[b].sumY += y[k]; calib[b].n++;
    }

    rpsU += rps3([1/3,1/3,1/3], y);
    if (actual === 0) { eH++; baseHome++; }
    if (actual === 1) eD++;
    if (actual === 2) eA++;
    if ((expectedScore(ra, rb, HOME_ADV) >= 0.5 ? 0 : 2) === actual) baseElo++;
    n++;
  }

  // Update Elo (competition K, no recency — walk-forward convention).
  const exp = expectedScore(ra, rb, HOME_ADV);
  const score = m.hg > m.ag ? 1 : m.hg < m.ag ? 0 : 0.5;
  const kBase = baseK(m.leagueName) * gMult(m.hg - m.ag);
  setR(m.homeSlug, m.homeName, ra + kBase * (score - exp));
  setR(m.awaySlug, m.awayName, rb - kBase * (score - exp));

  // Update form (same K but with 90-day recency weighting).
  const expF = expectedScore(raF, rbF, HOME_ADV);
  const kF   = kBase * recencyForm(m.ts);
  setRF(m.homeSlug, m.homeName, raF + kF * (score - expF));
  setRF(m.awaySlug, m.awayName, rbF - kF * (score - expF));

  i++;
}

const ece = calib.reduce((s, b) => s + (b.n ? Math.abs(b.sumP/b.n - b.sumY/b.n) * b.n : 0), 0) / (3 * n);
const pct = (x) => (x * 100).toFixed(1) + "%";

console.log(`\n=== Walk-forward backtest — ${n} of ${matches.length} matches (burn-in ${BURN_IN}) ===`);
console.log(`Eval outcome split: home ${pct(eH/n)}  draw ${pct(eD/n)}  away ${pct(eA/n)}\n`);

console.log(`COMPONENT MODELS`);
for (const [key, label] of [["elo", "Elo (18-mo)"], ["form", `Form (${FORM_HALFLIFE_DAYS}d)`]]) {
  const a = acc[key];
  console.log(`  ${label.padEnd(14)}  Acc ${pct(a.hit/n)}  Brier ${(a.brier/n).toFixed(3)}  Log-loss ${(a.logloss/n).toFixed(3)}  RPS ${(a.rps/n).toFixed(4)}`);
}

console.log(`\nENSEMBLE (equal-weight average)`);
const e = acc.ens;
console.log(`  Accuracy (top pick):   ${pct(e.hit/n)}`);
console.log(`  Favourite acc (p≥50%): ${pct(e.favHit/e.favN)}  (${e.favN} matches)`);
console.log(`  Brier (3-way, ↓):      ${(e.brier/n).toFixed(3)}`);
console.log(`  Log-loss (↓):          ${(e.logloss/n).toFixed(3)}`);
console.log(`  RPS (↓):               ${(e.rps/n).toFixed(4)}`);
console.log(`  ECE (calibration, ↓):  ${(ece * 100).toFixed(1)}%\n`);

console.log(`BASELINES (same matches)`);
console.log(`  Always pick home:      ${pct(baseHome/n)}`);
console.log(`  Pick higher-Elo team:  ${pct(baseElo/n)}`);
console.log(`  Coin-flip (uniform):   Brier ${(2*(1/3)**2+(1-1/3)**2).toFixed(3)} · log-loss ${(-Math.log(1/3)).toFixed(3)} · RPS ${(rpsU/n).toFixed(4)}\n`);

console.log(`CALIBRATION (reliability — ensemble predicted vs observed per probability band)`);
for (const [k, b] of calib.entries()) {
  if (!b.n) continue;
  console.log(`  ${String(k*10).padStart(2)}–${String((k+1)*10).padStart(3)}%   model said ${(b.sumP/b.n*100).toFixed(0).padStart(3)}%  →  happened ${(b.sumY/b.n*100).toFixed(0).padStart(3)}%   (n=${b.n})`);
}
console.log(`\nLive title odds (full 50k-sim tournament model, conditioned on real results): https://cup26matches.com`);

writeFileSync(D("model-backtest.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  method: `Walk-forward out-of-sample ensemble: Elo (18-mo half-life) + form (${FORM_HALFLIFE_DAYS}-day half-life), equal weights. Burn-in ${BURN_IN} skipped.`,
  totalMatches: matches.length, evaluated: n, burnIn: BURN_IN,
  outcomeSplit: { home: +(eH/n).toFixed(4), draw: +(eD/n).toFixed(4), away: +(eA/n).toFixed(4) },
  model: {
    accuracy: +(e.hit/n).toFixed(4), brier: +(e.brier/n).toFixed(4),
    logloss: +(e.logloss/n).toFixed(4), rps: +(e.rps/n).toFixed(4),
    ece: +ece.toFixed(4), favouriteAccuracy: +(e.favHit/e.favN).toFixed(4), favouriteCount: e.favN,
  },
  baselines: {
    alwaysHome: +(baseHome/n).toFixed(4), eloPickNoDraw: +(baseElo/n).toFixed(4),
    uniformBrier: 0.6667, uniformLogloss: 1.0986, uniformRps: +(rpsU/n).toFixed(4),
  },
  calibration: {
    bins: calib.map((c,k) => ({
      range: [k/10,(k+1)/10], n: c.n,
      avgPred: c.n ? +(c.sumP/c.n).toFixed(4) : null,
      obsFreq: c.n ? +(c.sumY/c.n).toFixed(4) : null,
    })),
    ece: +ece.toFixed(4),
  },
  components: {
    elo:  { accuracy: +(acc.elo.hit/n).toFixed(4),  brier: +(acc.elo.brier/n).toFixed(4),  logloss: +(acc.elo.logloss/n).toFixed(4),  rps: +(acc.elo.rps/n).toFixed(4) },
    form: { accuracy: +(acc.form.hit/n).toFixed(4), brier: +(acc.form.brier/n).toFixed(4), logloss: +(acc.form.logloss/n).toFixed(4), rps: +(acc.form.rps/n).toFixed(4) },
  },
}, null, 2) + "\n");
console.log("→ wrote data/model-backtest.json");

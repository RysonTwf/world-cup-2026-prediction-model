// Singapore Pools market probabilities from the Dixon-Coles bivariate Poisson model.
// All functions operate on a pre-built score matrix (buildScoreMatrix) except the
// half-time markets, which receive raw lambdas so they can split goals across halves.
import { poissonPmf, DC_RHO } from './elo.mjs';

const MAX = 9; // 0..9 goals per team; P(>9 | λ≤3.5) < 0.001

function dcTau(a, b, l, m, rho) {
  if (a === 0 && b === 0) return 1 - l * m * rho;
  if (a === 0 && b === 1) return 1 + l * rho;
  if (a === 1 && b === 0) return 1 + m * rho;
  if (a === 1 && b === 1) return 1 - rho;
  return 1;
}

// Full-match Dixon-Coles score matrix. matrix[a][b] = P(teamA scores a, teamB scores b).
export function buildScoreMatrix(lA, lB, rho = DC_RHO, max = MAX) {
  return Array.from({ length: max + 1 }, (_, a) => {
    const pA = poissonPmf(a, lA);
    return Array.from({ length: max + 1 }, (_, b) =>
      pA * poissonPmf(b, lB) * dcTau(a, b, lA, lB, rho)
    );
  });
}

// Plain Poisson matrix (no DC correction) used for half-time sub-matches.
function plainMatrix(lA, lB, max = MAX) {
  return Array.from({ length: max + 1 }, (_, a) => {
    const pA = poissonPmf(a, lA);
    return Array.from({ length: max + 1 }, (_, b) => pA * poissonPmf(b, lB));
  });
}

// ── 1X2 ─────────────────────────────────────────────────────────────────────

function result1X2(m) {
  let w1 = 0, d = 0, w2 = 0;
  m.forEach((row, a) => row.forEach((p, b) => {
    if (a > b) w1 += p; else if (a < b) w2 += p; else d += p;
  }));
  const t = w1 + d + w2;
  return { w1: w1 / t, d: d / t, w2: w2 / t };
}

export const market1X2 = m => result1X2(m);

// Goals per half empirically ~45 / 55 split.
export const marketHT1X2 = (lA, lB) => result1X2(plainMatrix(lA * 0.45, lB * 0.45));
export const market2H1X2  = (lA, lB) => result1X2(plainMatrix(lA * 0.55, lB * 0.55));

// ── Asian Handicap ───────────────────────────────────────────────────────────
// line is from Team 1's perspective (negative = T1 gives goals, positive = T1 receives).

function ahSingleLine(m, line) {
  let wa = 0, push = 0, wb = 0;
  m.forEach((row, a) => row.forEach((p, b) => {
    const adj = a - b + line;
    if (Math.abs(adj) < 1e-9) push += p;
    else if (adj > 0) wa += p;
    else wb += p;
  }));
  const t = wa + push + wb;
  return { winA: wa / t, push: push / t, winB: wb / t };
}

// Quarter-ball handicaps (±0.25, ±0.75, ±1.25 …) are split bets: average of the
// two adjacent half-ball lines. No push is possible after averaging.
export function marketAH(m, line) {
  const h4 = Math.round(line * 4);
  if (h4 % 2 !== 0) {
    const lo = ahSingleLine(m, (h4 - 1) / 4);
    const hi = ahSingleLine(m, (h4 + 1) / 4);
    return { winA: (lo.winA + hi.winA) / 2, push: 0, winB: (lo.winB + hi.winB) / 2 };
  }
  return ahSingleLine(m, line);
}

// Handicap 1X2 — same math as whole-number AH but the "push" is explicitly the draw.
export const marketH1X2 = (m, line) => ahSingleLine(m, line);

// ── Over / Under ─────────────────────────────────────────────────────────────

export function marketOU(m, line) {
  let over = 0, push = 0, under = 0;
  m.forEach((row, a) => row.forEach((p, b) => {
    const tot = a + b;
    if (Math.abs(tot - line) < 1e-9) push += p;
    else if (tot > line) over += p;
    else under += p;
  }));
  const t = over + push + under;
  return { over: over / t, push: push / t, under: under / t };
}

export const marketHTOU = (lA, lB, line) =>
  marketOU(plainMatrix(lA * 0.45, lB * 0.45), line);

// ── Total Goals bands: 0-1 / 2-3 / 4+ ───────────────────────────────────────

export function marketBands(m) {
  let b01 = 0, b23 = 0, b4p = 0;
  m.forEach((row, a) => row.forEach((p, b) => {
    const t = a + b;
    if (t <= 1) b01 += p; else if (t <= 3) b23 += p; else b4p += p;
  }));
  const t = b01 + b23 + b4p;
  return { '0-1': b01 / t, '2-3': b23 / t, '4+': b4p / t };
}

// ── BTTS ─────────────────────────────────────────────────────────────────────

export function marketBTTS(m) {
  let yes = 0, no = 0;
  m.forEach((row, a) => row.forEach((p, b) => {
    if (a > 0 && b > 0) yes += p; else no += p;
  }));
  const t = yes + no;
  return { yes: yes / t, no: no / t };
}

// ── Odd / Even total goals ────────────────────────────────────────────────────

export function marketOddEven(m) {
  let odd = 0, even = 0;
  m.forEach((row, a) => row.forEach((p, b) => {
    if ((a + b) % 2 === 0) even += p; else odd += p;
  }));
  const t = odd + even;
  return { odd: odd / t, even: even / t };
}

// ── Correct score ─────────────────────────────────────────────────────────────

export function marketCorrectScore(m, topN = 12) {
  const scores = [];
  m.forEach((row, a) => row.forEach((p, b) => scores.push({ score: `${a}-${b}`, prob: p })));
  const total = scores.reduce((s, x) => s + x.prob, 0);
  return scores
    .map(x => ({ score: x.score, prob: x.prob / total }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, topN);
}

// ── Half-Time / Full-Time ─────────────────────────────────────────────────────
// HT goals ~ Poisson(0.45λ), 2H goals ~ Poisson(0.55λ), independent.

export function marketHTFT(lA, lB, max = MAX) {
  const htA = lA * 0.45, htB = lB * 0.45;
  const shA = lA * 0.55, shB = lB * 0.55;
  const out = { '1/1': 0, '1/X': 0, '1/2': 0, 'X/1': 0, 'X/X': 0, 'X/2': 0, '2/1': 0, '2/X': 0, '2/2': 0 };
  for (let ha = 0; ha <= max; ha++) {
    const pHA = poissonPmf(ha, htA);
    for (let hb = 0; hb <= max; hb++) {
      const pHT = pHA * poissonPmf(hb, htB);
      const hr = ha > hb ? '1' : ha < hb ? '2' : 'X';
      for (let sa = 0; sa <= max; sa++) {
        const pSA = poissonPmf(sa, shA);
        for (let sb = 0; sb <= max; sb++) {
          const fta = ha + sa, ftb = hb + sb;
          const fr = fta > ftb ? '1' : fta < ftb ? '2' : 'X';
          out[`${hr}/${fr}`] += pHT * pSA * poissonPmf(sb, shB);
        }
      }
    }
  }
  const t = Object.values(out).reduce((s, p) => s + p, 0);
  Object.keys(out).forEach(k => out[k] /= t);
  return out;
}

// ── Which half has more goals ─────────────────────────────────────────────────

export function marketWhichHalf(lA, lB, max = MAX) {
  const htA = lA * 0.45, htB = lB * 0.45;
  const shA = lA * 0.55, shB = lB * 0.55;
  let first = 0, second = 0, equal = 0;
  for (let ha = 0; ha <= max; ha++) {
    const pHA = poissonPmf(ha, htA);
    for (let hb = 0; hb <= max; hb++) {
      const htG = ha + hb;
      const pHT = pHA * poissonPmf(hb, htB);
      for (let sa = 0; sa <= max; sa++) {
        const pSA = poissonPmf(sa, shA);
        for (let sb = 0; sb <= max; sb++) {
          const p = pHT * pSA * poissonPmf(sb, shB);
          const shG = sa + sb;
          if (htG > shG) first += p;
          else if (htG < shG) second += p;
          else equal += p;
        }
      }
    }
  }
  const t = first + second + equal;
  return { first: first / t, second: second / t, equal: equal / t };
}

// ── Team to score first ───────────────────────────────────────────────────────
// P(A scores first | match) ≈ (1 - P(0-0)) × λA/(λA+λB).
// Valid approximation for independent Poisson arrival processes.

export function marketFirstTeam(m, lA, lB) {
  const p00 = m[0][0];
  const rate = lA + lB;
  const pGoal = 1 - p00;
  return {
    teamA:  (lA / rate) * pGoal,
    noGoal: p00,
    teamB:  (lB / rate) * pGoal,
  };
}

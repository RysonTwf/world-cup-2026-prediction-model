// Elo + Dixon-Coles bivariate Poisson — the match model behind https://cup26matches.com
// References: World Football Elo; Maher (1982); Dixon & Coles (1997).
// Dixon-Coles ρ, HOME_ADV, and the expectedGoals base/scale below are all fitted by
// coordinate descent (see tune.mjs) minimising walk-forward RPS on results.json.
export const DC_RHO = -0.15;
export const HOME_ADV = 130;

function dcTau(a, b, lambda, mu, rho) {
  if (a === 0 && b === 0) return 1 - lambda * mu * rho;
  if (a === 0 && b === 1) return 1 + lambda * rho;
  if (a === 1 && b === 0) return 1 + mu * rho;
  if (a === 1 && b === 1) return 1 - rho;
  return 1;
}

// Elo win expectancy (logistic on rating difference).
export function expectedScore(ratingA, ratingB, homeBonusA = 0) {
  return 1 / (1 + Math.pow(10, (ratingB - (ratingA + homeBonusA)) / 400));
}

// Rating difference → expected goals (Poisson λ). Flat denominator keeps single-match variance
// near real football upset frequency.
export function expectedGoals(rating, opponent, homeBonus = 0) {
  const diff = (rating + homeBonus) - opponent;
  const lambda = 1.25 + diff / 375;
  return Math.max(0.3, Math.min(3.5, lambda));
}

export function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

export function poissonSample(lambda, rng = Math.random) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

// 1X2 probabilities via Dixon-Coles bivariate Poisson over 0–8 goals each side.
// homeBonusA > 0 = team A at home; < 0 = team B at home.
// Convention: only the home team's attack rate gets the bonus (single-sided).
export function matchProb(ratingA, ratingB, homeBonusA = 0) {
  const lambda = expectedGoals(ratingA, ratingB, homeBonusA > 0 ? homeBonusA : 0);
  const mu     = expectedGoals(ratingB, ratingA, homeBonusA < 0 ? -homeBonusA : 0);
  let winA = 0, draw = 0, winB = 0;
  for (let a = 0; a <= 8; a++) {
    const pA = poissonPmf(a, lambda);
    for (let b = 0; b <= 8; b++) {
      const tau = dcTau(a, b, lambda, mu, DC_RHO);
      const p = pA * poissonPmf(b, mu) * tau;
      if (a > b) winA += p; else if (a < b) winB += p; else draw += p;
    }
  }
  const total = winA + draw + winB;
  return { winA: winA / total, draw: draw / total, winB: winB / total, expectedGoalsA: lambda, expectedGoalsB: mu };
}

// Ensemble: simple average of Elo model and form model (90-day half-life) probabilities.
// Both models use the same Dixon-Coles framework; only the rating inputs differ.
export function ensembleProb(rEloA, rEloB, rFormA, rFormB, homeBonusA = 0) {
  const pElo  = matchProb(rEloA,  rEloB,  homeBonusA);
  const pForm = matchProb(rFormA, rFormB, homeBonusA);
  return {
    winA: (pElo.winA + pForm.winA) / 2,
    draw: (pElo.draw  + pForm.draw)  / 2,
    winB: (pElo.winB + pForm.winB) / 2,
    expectedGoalsA: (pElo.expectedGoalsA + pForm.expectedGoalsA) / 2,
    expectedGoalsB: (pElo.expectedGoalsB + pForm.expectedGoalsB) / 2,
  };
}

// Sample a scoreline (for Monte Carlo). allowDraw=false → penalty shootout nudge toward higher Elo.
export function sampleMatch(ratingA, ratingB, homeBonusA = 0, allowDraw = true, rng = Math.random) {
  const eA = expectedGoals(ratingA, ratingB, homeBonusA > 0 ? homeBonusA : 0);
  const eB = expectedGoals(ratingB, ratingA, homeBonusA < 0 ? -homeBonusA : 0);
  let goalsA = poissonSample(eA, rng);
  let goalsB = poissonSample(eB, rng);
  if (!allowDraw && goalsA === goalsB) {
    if (rng() < expectedScore(ratingA, ratingB, homeBonusA)) goalsA += 1; else goalsB += 1;
  }
  return { goalsA, goalsB };
}

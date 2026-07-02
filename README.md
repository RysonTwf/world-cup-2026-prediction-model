# 🏆 World Cup 2026 Prediction Model

An open-source statistical model that forecasts **2026 FIFA World Cup** matches and title odds —
**Elo ratings → Dixon-Coles bivariate Poisson → Monte Carlo simulation**. No machine-learning
black box, no scraped bookmaker odds: just transparent, reproducible football maths.

**▶ Live predictions (full 48-team, 50,000-simulation model):** **https://cup26matches.com**
· [How it works / methodology](https://cup26matches.com/en/methodology/)
· [Live insight feed](https://cup26matches.com/en/live/)
· [Interactive bracket simulator](https://cup26matches.com/en/simulator/)

> 🔴 **The tournament is LIVE (Jun 11 – Jul 19).** The production model now **conditions on real
> results**: finished matches are locked, eliminated teams collapse to 0%, the actual bracket
> (incl. the new best-third qualification, solved with bipartite matching) is used, and only the
> remaining matches are simulated — re-run automatically within minutes of every full-time whistle.
>
> This repo open-sources the **core match model + our honest backtest** so you can run, inspect
> and reproduce the numbers.

---

## Why it's worth a look

It's tested the honest way — **walk-forward, out-of-sample** on **913 real internationals**
(Oct 2023 – Jun 2026). Every match is predicted using only data available *before* kickoff, then
scored against the actual result — with **proper scoring rules** (RPS, log-loss, Brier), not just
accuracy, because accuracy alone rewards lucky guessing. Reproduce it yourself in one command:

```bash
node backtest.mjs
```

| Metric (811 evaluated, 150 burn-in) | Model | Baseline |
|---|---|---|
| **Ranked Probability Score** (the football standard, ↓) | **0.166** | coin-flip 0.240 |
| Log-loss (↓) | **0.86** | coin-flip 1.10 |
| Brier score (↓) | **0.50** | coin-flip 0.67 |
| **Expected Calibration Error** (↓) | **1.4%** | < 5% = well-calibrated |
| Correct result (win/draw/loss) | **62%** | always-home 49% · higher-Elo pick 60% |
| When a clear favourite (p ≥ 50%) | **68%** | — |

### Is it calibrated? (the chart that matters)

A forecaster is honest when the things it calls "70%" happen about 70% of the time. Pooling every
probability the model issued across the out-of-sample matches:

| Model said | Actually happened | n |
|---|---|---|
| 6% | 6% | 254 |
| 15% | 15% | 433 |
| 25% | 24% | 720 |
| 35% | 35% | 194 |
| 45% | 49% | 156 |
| 55% | 53% | 154 |
| 65% | 69% | 154 |
| 74% | 71% | 115 |
| 85% | 88% | 96 |
| 91% | 92% | 13 |

> _**Changelog** — Jun 27, 2026: Group stage completed (72/72 matches); long-run priors switched
> from hand-crafted to **data-driven `data/seeds.json`** (10 years of real internationals, see
> [`build-seeds.mjs`](./build-seeds.mjs)); `DC_RHO`, `HOME_ADV`, and the goals-model base/scale
> re-fitted by coordinate descent ([`tune.mjs`](./tune.mjs)) — RPS improved to 0.166, ECE to 1.4%.
> Added lineup/injury-aware Elo adjustments ([`fetch-lineups.mjs`](./fetch-lineups.mjs) +
> `data/player-impacts.json`) and a Singapore Pools EV calculator
> ([`fetch-sp-odds.mjs`](./fetch-sp-odds.mjs)). · Jun 24: Home advantage formula corrected
> (single-sided). · Jun 11: Monte Carlo raised to **50,000 trials**; in-tournament conditioning
> live; backtest extended with RPS + reliability curve + ECE. · Jun 7: goal-model variance
> denominator 350→400; per-team strength priors applied on the live site._

No model is a crystal ball — football is high-variance and draws are genuinely hard. These are
well-calibrated estimates, and we make **no claim to beat the betting market**.

## 📊 Live track record (2026)

The model's call on **every finished match** of the tournament, updated as it happens:

<!-- TRACK-RECORD:START -->
**49/82 correct picks (60%) · avg RPS 0.156** (coin-flip ≈ 0.245) · updated 2026-07-01

| Date | Result | Model's pick | |
|---|---|---|---|
| 2026-07-01 | Mexico 2–0 Ecuador | Mexico 54% | ✅ |
| 2026-07-01 | England 2–1 DR Congo | England 59% | ✅ |
| 2026-07-01 | Belgium 3–2 aet Senegal | Senegal 43% | ❌ |
| 2026-07-01 | USA 2–0 Bosnia & Herzegovina | USA 77% | ✅ |
| 2026-06-30 | Netherlands 1–1 (2–3 p) Morocco | Morocco 42% | ❌ |
| 2026-06-30 | Ivory Coast 1–2 Norway | Norway 48% | ✅ |
| 2026-06-30 | France 3–0 Sweden | France 80% | ✅ |
| 2026-06-29 | Brazil 2–1 Japan | Japan 38% | ❌ |
| 2026-06-29 | Germany 1–1 (3–4 p) Paraguay | Germany 54% | ❌ |
| 2026-06-28 | Canada 1–0 South Africa | Canada 64% | ✅ |
| 2026-06-27 | Argentina 3–1 Jordan | Argentina 78% | ✅ |
| 2026-06-27 | Austria 3–3 Algeria | Algeria 42% | ❌ |
| 2026-06-27 | Portugal 0–0 Colombia | Colombia 43% | ❌ |
| 2026-06-27 | Uzbekistan 1–3 DR Congo | DR Congo 39% | ✅ |
| 2026-06-27 | England 2–0 Panama | England 66% | ✅ |
| 2026-06-27 | Croatia 2–1 Ghana | Croatia 58% | ✅ |
| 2026-06-26 | Belgium 5–1 New Zealand | Belgium 47% | ✅ |
| 2026-06-26 | Iran 1–1 Egypt | Iran 38% | ❌ |
| 2026-06-26 | Spain 1–0 Uruguay | Spain 75% | ✅ |
| 2026-06-26 | Saudi Arabia 0–0 Cape Verde | Cape Verde 35% | ❌ |
| 2026-06-26 | France 1–4 Norway | France 45% | ❌ |
| 2026-06-26 | Iraq 0–5 Senegal | Senegal 59% | ✅ |
| 2026-06-25 | USA 2–3 Turkey | USA 50% | ❌ |
| 2026-06-25 | Australia 0–0 Paraguay | Australia 49% | ❌ |
| 2026-06-25 | Germany 1–2 Ecuador | Germany 44% | ❌ |
| 2026-06-25 | Ivory Coast 2–0 Curaçao | Ivory Coast 54% | ✅ |
| 2026-06-25 | Netherlands 3–1 Tunisia | Netherlands 68% | ✅ |
| 2026-06-25 | Sweden 1–1 Japan | Japan 76% | ❌ |
| 2026-06-24 | Mexico 3–0 Czech Republic | Mexico 73% | ✅ |
| 2026-06-24 | South Korea 0–1 South Africa | South Korea 63% | ❌ |
| 2026-06-24 | Canada 1–2 Switzerland | Canada 43% | ❌ |
| 2026-06-24 | Bosnia & Herzegovina 3–1 Qatar | Bosnia & Herzegovina 37% | ✅ |
| 2026-06-24 | Scotland 0–3 Brazil | Brazil 63% | ✅ |
| 2026-06-24 | Morocco 4–2 Haiti | Morocco 73% | ✅ |
| 2026-06-23 | Portugal 5–0 Uzbekistan | Portugal 52% | ✅ |
| 2026-06-23 | Colombia 1–0 DR Congo | Colombia 56% | ✅ |
| 2026-06-23 | England 0–0 Ghana | England 75% | ❌ |
| 2026-06-23 | Panama 0–1 Croatia | Croatia 49% | ✅ |
| 2026-06-22 | France 3–0 Iraq | France 75% | ✅ |
| 2026-06-22 | Norway 3–2 Senegal | Norway 41% | ✅ |
| 2026-06-22 | Argentina 2–0 Austria | Argentina 68% | ✅ |
| 2026-06-22 | Jordan 1–2 Algeria | Algeria 53% | ✅ |
| 2026-06-21 | Belgium 0–0 Iran | Iran 41% | ❌ |
| 2026-06-21 | New Zealand 1–3 Egypt | Egypt 50% | ✅ |
| 2026-06-21 | Spain 4–0 Saudi Arabia | Spain 82% | ✅ |
| 2026-06-21 | Uruguay 2–2 Cape Verde | Uruguay 46% | ❌ |
| 2026-06-20 | Germany 2–1 Ivory Coast | Germany 48% | ✅ |
| 2026-06-20 | Ecuador 0–0 Curaçao | Ecuador 57% | ❌ |
| 2026-06-20 | Netherlands 5–1 Sweden | Netherlands 69% | ✅ |
| 2026-06-20 | Tunisia 0–4 Japan | Japan 76% | ✅ |
| 2026-06-19 | Scotland 0–1 Morocco | Morocco 67% | ✅ |
| 2026-06-19 | Brazil 3–0 Haiti | Brazil 69% | ✅ |
| 2026-06-19 | USA 2–0 Australia | USA 39% | ✅ |
| 2026-06-19 | Turkey 0–1 Paraguay | Turkey 37% | ❌ |
| 2026-06-18 | Czech Republic 1–1 South Africa | Czech Republic 37% | ❌ |
| 2026-06-18 | Mexico 1–0 South Korea | Mexico 50% | ✅ |
| 2026-06-18 | Switzerland 4–1 Bosnia & Herzegovina | Switzerland 71% | ✅ |
| 2026-06-18 | Canada 6–0 Qatar | Canada 79% | ✅ |
| 2026-06-17 | Portugal 1–1 DR Congo | Portugal 48% | ❌ |
| 2026-06-17 | Uzbekistan 1–3 Colombia | Colombia 60% | ✅ |
| 2026-06-17 | England 4–2 Croatia | England 52% | ✅ |
| 2026-06-17 | Ghana 1–0 Panama | Panama 43% | ❌ |
| 2026-06-16 | France 3–1 Senegal | France 51% | ✅ |
| 2026-06-16 | Iraq 1–4 Norway | Norway 65% | ✅ |
| 2026-06-16 | Argentina 3–0 Algeria | Argentina 60% | ✅ |
| 2026-06-16 | Austria 3–1 Jordan | Austria 45% | ✅ |
| 2026-06-15 | Belgium 1–1 Egypt | Egypt 37% | ❌ |
| 2026-06-15 | Iran 2–2 New Zealand | Iran 53% | ❌ |
| 2026-06-15 | Spain 0–0 Cape Verde | Spain 82% | ❌ |
| 2026-06-15 | Saudi Arabia 1–1 Uruguay | Uruguay 46% | ❌ |
| 2026-06-14 | Germany 7–1 Curaçao | Germany 67% | ✅ |
| 2026-06-14 | Ivory Coast 1–0 Ecuador | Ecuador 38% | ❌ |
| 2026-06-14 | Netherlands 2–2 Japan | Japan 42% | ❌ |
| 2026-06-14 | Sweden 5–1 Tunisia | Tunisia 36% | ❌ |
| 2026-06-13 | Qatar 1–1 Switzerland | Switzerland 73% | ❌ |
| 2026-06-13 | Brazil 1–1 Morocco | Morocco 39% | ❌ |
| 2026-06-13 | Haiti 0–1 Scotland | Scotland 41% | ✅ |
| 2026-06-13 | Australia 2–0 Turkey | Australia 46% | ✅ |
| 2026-06-12 | Canada 1–1 Bosnia & Herzegovina | Canada 77% | ❌ |
| 2026-06-12 | USA 4–1 Paraguay | USA 52% | ✅ |
| 2026-06-11 | Mexico 2–0 South Africa | Mexico 75% | ✅ |
| 2026-06-11 | South Korea 2–1 Czech Republic | South Korea 60% | ✅ |

_Every call is listed — hits and misses. Probabilities are the model's frozen pre-match numbers (ratings don't re-fit mid-tournament), so nothing here is retro-fitted. Reproduce with `node track-record.mjs`._
<!-- TRACK-RECORD:END -->

## 🧩 Embeddable widgets & open data

Run a blog, forum or fan site? The live model is embeddable — free, auto-updating all tournament:

```html
<!-- Live title-race board (top-10 championship odds, 50k sims) -->
<iframe src="https://cup26matches.com/embed/title-race/" width="100%" height="430"
  style="border:0;border-radius:12px" loading="lazy" title="World Cup 2026 title odds"></iframe>

<!-- Real-time next-match strip (live W/D/L, rotates at kickoff) -->
<iframe src="https://cup26matches.com/embed/next-match/" width="100%" height="92"
  style="border:0;border-radius:10px" loading="lazy" title="Next World Cup 2026 match"></iframe>
```

More widgets + copy-paste snippets: **[cup26matches.com/en/widgets](https://cup26matches.com/en/widgets/)**

**Open data** (CC BY 4.0 — free to use/quote/chart with a link back): the full per-team tournament
probabilities, regenerated after every match —
[probabilities.json](https://cup26matches.com/data/probabilities.json) ·
[probabilities.csv](https://cup26matches.com/data/probabilities.csv)

## Quick start

No dependencies. Node 18+.

```bash
git clone https://github.com/Hicruben/world-cup-2026-prediction-model.git
cd world-cup-2026-prediction-model

node predict.mjs brazil argentina      # head-to-head probabilities (Elo+form ensemble)
node predict.mjs usa mexico usa        # 3rd arg = home team (host bonus)
node sg-pools.mjs                      # Singapore Pools betting predictions (interactive menu)
node sg-pools.mjs brazil scotland      # single match, all markets
node sg-pools.mjs colombia ghana --sp 1.65 3.80 4.20   # + EV check vs SP odds
node backtest.mjs                      # reproduce the accuracy numbers
node backtest-stakes.mjs               # dead-rubber stakes backtest (recalibrate after MD3)
node build-seeds.mjs                   # refresh data-driven 10-year priors → data/seeds.json
node calibrate.mjs                     # rebuild ratings from data/results.json
node live-ratings.mjs                  # apply in-tournament WC results → data/elo-live.json
node tune.mjs                          # coordinate-descent search for DC_RHO/HOME_ADV/goals params
node fetch-lineups.mjs                 # confirmed lineups + injuries (needs RAPIDAPI_KEY)
node fetch-sp-odds.mjs                 # live Singapore Pools odds (run on your local machine)
node validate-lineups.mjs              # sanity-check an API-Football key + WC lineup coverage
```

Example — head-to-head:

```
$ node predict.mjs spain germany

  spain (Elo 2074)  vs  germany (Elo 1927)   [neutral]

  spain            win   53.2%  ████████████████
  draw                   26.8%  ████████
  germany          win   20.0%  ██████
```

## Singapore Pools betting predictions

`sg-pools.mjs` derives **every common SP market** from the same Dixon-Coles score matrix used
for the match probabilities. Run it with no arguments for an interactive match picker:

```
$ node sg-pools.mjs

   1.  Group A  Mexico vs Czech Republic ⌂
   2.  Group A  South Korea vs South Africa
   ...
  24.  Group L  Ghana vs Croatia
   0.  Show all matches

  Select a match (0–24):
```

Each match outputs fair decimal odds (1 ÷ probability, **no bookmaker margin**) across:

| Market | Detail |
|---|---|
| 1X2 + Half-Time 1X2 | Win / Draw / Win |
| Asian Handicap | ±0.5, ±1.0, ±1.5, ±2.0, ±2.5 — push shown for whole-number lines |
| Handicap 1X2 | 3-way with explicit draw option |
| Over / Under | Full-match 0.5 → 4.5 · Half-time 0.5 → 2.5 |
| Total Goals bands | 0–1 / 2–3 / 4+ |
| BTTS | Both Teams to Score Yes / No |
| Odd / Even | Total goals |
| Team to Score First | Team A / Team B / No Goal |
| Half-Time / Full-Time | All 9 HT/FT combinations, sorted by probability |
| Which Half More Goals | 1st / Equal / 2nd |
| 2nd Half Result | Win / Draw / Win |
| Correct Score | Top 12 scorelines with fair odds |

Compare these numbers against SP's published lines to spot value bets. The probabilities are
the same frozen pre-tournament ratings used everywhere else — no mid-tournament re-fitting.

## How it works

1. **Team strength (Elo + form ensemble).** Each nation starts from a **data-driven prior**
   (`data/seeds.json` — a full Elo run over 10 years / ~9,600 real internationals, see
   [`build-seeds.mjs`](./build-seeds.mjs)), then is calibrated on recent results — wins over strong
   sides in important games move a rating more than friendlies. A second pass with a 90-day
   half-life produces a pure-form rating; `predict.mjs` and `track-record.mjs` average the two
   models' Dixon-Coles probabilities (`ensembleProb`). Once the tournament starts,
   [`live-ratings.mjs`](./live-ratings.mjs) walks both rating sets forward through every finished
   WC match so predictions reflect in-tournament momentum, not just pre-tournament form. See
   [`calibrate.mjs`](./calibrate.mjs).
2. **Each match (Dixon-Coles Poisson).** Ratings → expected goals → a Dixon-Coles bivariate
   Poisson gives win/draw/loss probabilities. The Dixon-Coles correction fixes plain Poisson's
   well-known under-count of low-scoring draws (0-0, 1-1). Home advantage is applied single-sided
   (only the home team's attack rate is boosted). `DC_RHO`, `HOME_ADV`, and the goals-model
   base/scale are all fitted by coordinate descent minimising walk-forward RPS on 811 out-of-sample
   matches — see [`tune.mjs`](./tune.mjs) and [`elo.mjs`](./elo.mjs).
3. **News & lineups.** [`fetch-lineups.mjs`](./fetch-lineups.mjs) pulls confirmed starting XIs and
   injury reports from API-Football and caches them to `data/lineups-cache.json`.
   `data/player-impacts.json` maps each team's key players to an estimated Elo value; `sg-pools.mjs`
   docks a team's effective rating when a key player is confirmed absent, so late-breaking injury
   or rotation news feeds directly into the match probabilities rather than being modeled separately.
4. **The tournament (Monte Carlo).** The live site plays all 104 matches **50,000 times** through
   the real bracket to get championship & advancement odds — and, now the tournament is underway,
   **locks every finished result** (real standings, real qualifiers, real bracket slots) and
   simulates only what's left. Full write-up:
   [cup26matches.com/methodology](https://cup26matches.com/en/methodology/).

## Files

| File | What |
|---|---|
| `elo.mjs` | The match model — Elo, Dixon-Coles τ, Poisson, `matchProb`, `ensembleProb`, `sampleMatch` |
| `markets.mjs` | Derives all SP betting markets from a Dixon-Coles score matrix |
| `build-seeds.mjs` | Builds `data/seeds.json` — data-driven 10-year Elo priors from real internationals |
| `calibrate.mjs` | Build calibrated Elo + form ratings from `data/results.json` |
| `live-ratings.mjs` | Walk Elo + form ratings forward through finished WC 2026 matches → `data/elo-live.json` |
| `tune.mjs` | Coordinate descent over `DC_RHO`/`HOME_ADV`/goals params, minimising walk-forward RPS |
| `backtest.mjs` | Walk-forward out-of-sample evaluation (RPS, log-loss, Brier, ECE + reliability curve) |
| `backtest-stakes.mjs` | Dead-rubber stakes backtest — re-run to calibrate stakes penalties |
| `predict.mjs` | CLI head-to-head predictor (Elo+form ensemble, live ratings if available) |
| `sg-pools.mjs` | Singapore Pools betting predictions — lineup/injury-adjusted, with EV calculator |
| `fetch-lineups.mjs` | Pulls confirmed lineups + injuries from API-Football → `data/lineups-cache.json` |
| `fetch-sp-odds.mjs` | Scrapes live Singapore Pools 1X2 odds → `data/sp-odds.json` |
| `validate-lineups.mjs` | Validates an API-Football key and checks current WC lineup coverage |
| `track-record.mjs` | Regenerates the live 2026 track-record table in this README |
| `data/results.json` | 961 real international results (Oct 2023 – Jun 2026) |
| `data/seeds.json` | Data-driven 10-year Elo priors for 63 teams (`build-seeds.mjs` output) |
| `data/elo-calibrated.json` | Calibrated Elo for 63 teams (48 finalists + 15 additional WC 2026 participants) |
| `data/elo-form.json` | 90-day half-life form ratings (ensemble's second component) |
| `data/elo-live.json` | Elo + form ratings walked forward through finished WC 2026 matches |
| `data/wc2026-results.json` | Finished 2026 World Cup matches — full 72/72 group stage (feeds the track record) |
| `data/player-impacts.json` | Estimated Elo value of each team's key players, for lineup/injury adjustments |
| `data/model-backtest.json` | Saved backtest metrics |

## License

MIT — see [LICENSE](./LICENSE). Built by [Cup26 AI](https://cup26matches.com). If you use it,
a link back is appreciated. ⭐ the repo if you find it useful!

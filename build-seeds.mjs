#!/usr/bin/env node
// Compute data-driven Elo seed ratings from 10 years of international results.
// Source: martj42/international_results (2016-01-01 → 2025-12-31).
// Output: data/seeds.json  — loaded by calibrate.mjs as the initial prior.
//   node build-seeds.mjs
import { writeFileSync } from 'node:fs';

const D = f => new URL('./data/' + f, import.meta.url);

// martj42 team name → our slug (only WC 2026 participants)
const NAME_TO_SLUG = {
  'Argentina':'argentina','France':'france','Spain':'spain','Brazil':'brazil',
  'England':'england','Portugal':'portugal','Netherlands':'netherlands','Germany':'germany',
  'Belgium':'belgium','Colombia':'colombia','Uruguay':'uruguay','Croatia':'croatia',
  'Morocco':'morocco','Switzerland':'switzerland','United States':'usa','Mexico':'mexico',
  'Japan':'japan','Senegal':'senegal','Denmark':'denmark','Ecuador':'ecuador',
  'Australia':'australia','South Korea':'south-korea','Iran':'iran','Poland':'poland',
  'Canada':'canada','Serbia':'serbia','Wales':'wales','Ghana':'ghana',
  'Tunisia':'tunisia','Ivory Coast':'ivory-coast',"Côte d'Ivoire":'ivory-coast',
  'Nigeria':'nigeria','Saudi Arabia':'saudi-arabia','Qatar':'qatar','Egypt':'egypt',
  'Algeria':'algeria','Scotland':'scotland','Cameroon':'cameroon','Paraguay':'paraguay',
  'Venezuela':'venezuela','Chile':'chile','Peru':'peru',
  'Czech Republic':'czech-republic','Czechia':'czech-republic',
  'Bosnia and Herzegovina':'bosnia-and-herzegovina',
  'South Africa':'south-africa','New Zealand':'new-zealand','Panama':'panama',
  'Jamaica':'jamaica','Honduras':'honduras','Jordan':'jordan','Haiti':'haiti',
  'El Salvador':'el-salvador','Trinidad and Tobago':'trinidad-and-tobago',
  'Guatemala':'guatemala','Norway':'norway','Sweden':'sweden','Turkey':'turkey',
  'Austria':'austria','Iraq':'iraq','Uzbekistan':'uzbekistan',
  'Cape Verde':'cape-verde','DR Congo':'dr-congo','Curaçao':'curacao',
  'Curacao':'curacao','Georgia':'georgia',
};

// K-factor by tournament
function baseK(tournament = '') {
  const t = tournament.toLowerCase();
  if (/^fifa world cup$/.test(t)) return 55;
  if (/world cup qual|qualification/.test(t)) return 40;
  if (/copa am[eé]rica|uefa euro(?:pean)?(?:\s+championship)?$|african cup of nations$|gold cup$|afc asian cup$/.test(t)) return 50;
  if (/nations league/.test(t)) return 32;
  if (/friendl/.test(t)) return 18;
  return 28;
}

const HOME_ADV  = 130;
const expScore  = (a, b, hb) => 1 / (1 + Math.pow(10, (b - (a + hb)) / 400));
const gMult     = gd => { const d = Math.abs(gd); return d <= 1 ? 1 : d === 2 ? 1.5 : (11 + d) / 8; };

// No recency decay for seed computation — all 10 years treated equally.
// Recency is applied later in calibrate.mjs (fine-tuning on 2023-2026 data).

const START = new Date('2016-01-01');
const END   = new Date('2026-01-01'); // exclude WC 2026 itself

console.log('Fetching martj42/international_results...');
const res  = await fetch('https://raw.githubusercontent.com/martj42/international_results/master/results.csv');
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const text  = await res.text();
const lines = text.split('\n');
// header: date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
// columns 3 and 4 (scores) and 8 (neutral) are simple; no commas inside them.
// The tricky columns are tournament (5) and city (6) which can occasionally have commas.
// We only need cols 0-5 and 8, so parse by splitting on comma with care:
function parseLine(line) {
  // Simple split is fine for the columns we need because team names and scores don't have commas.
  const cols = line.split(',');
  if (cols.length < 9) return null;
  // neutral is the last column (index 8)
  const neutral = cols[cols.length - 1]?.trim() === 'TRUE';
  const date = new Date(cols[0]);
  if (isNaN(date.getTime())) return null;
  const home = cols[1].trim();
  const away = cols[2].trim();
  const hg   = parseInt(cols[3]);
  const ag   = parseInt(cols[4]);
  // tournament might be split across multiple cols if it has commas; rejoin cols 5..n-3
  const tournament = cols.slice(5, cols.length - 3).join(',').trim();
  return { date, home, away, hg, ag, tournament, neutral };
}

// Parse + filter
const matches = [];
for (let i = 1; i < lines.length; i++) {
  const row = lines[i].trim();
  if (!row) continue;
  const m = parseLine(row);
  if (!m) continue;
  if (isNaN(m.hg) || isNaN(m.ag)) continue;
  if (m.date < START || m.date >= END) continue;
  matches.push(m);
}
console.log(`Parsed ${matches.length} matches (2016-2025)`);

// Elo from flat 1500 prior — all teams participate, not just WC2026 teams
const R = {};
const get = name => R[name] ?? 1500;

let applied = 0;
for (const m of matches) {
  const ra = get(m.home), rb = get(m.away);
  const hb    = m.neutral ? 0 : HOME_ADV;
  const exp   = expScore(ra, rb, hb);
  const score = m.hg > m.ag ? 1 : m.hg < m.ag ? 0 : 0.5;
  const k     = baseK(m.tournament) * gMult(m.hg - m.ag);
  const delta = k * (score - exp);
  R[m.home] = ra + delta;
  R[m.away] = rb - delta;
  applied++;
}
console.log(`Applied ${applied} matches`);

// Extract seeds for WC 2026 slugs (first match wins for alias names)
const seeds = {};
for (const [name, slug] of Object.entries(NAME_TO_SLUG)) {
  if (!slug || seeds[slug] != null) continue;
  if (R[name] != null) seeds[slug] = Math.round(R[name]);
}

// Check coverage
const allSlugs = [...new Set(Object.values(NAME_TO_SLUG).filter(Boolean))];
const missing  = allSlugs.filter(s => seeds[s] == null);
if (missing.length) console.warn('  No data for:', missing.join(', '));

// Display ranked list
const W = 52;
console.log(`\n${'═'.repeat(W)}`);
console.log('  Data-driven seeds from 2016–2025 results');
console.log('═'.repeat(W));
const sorted = Object.entries(seeds).sort(([,a],[,b]) => b - a);
let rank = 1;
for (const [slug, r] of sorted) {
  console.log(`  ${String(rank++).padStart(2)}.  ${slug.padEnd(28)} ${r}`);
}

writeFileSync(D('seeds.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'martj42/international_results (2016-01-01 → 2025-12-31)',
  matchesApplied: applied,
  baseRating: 1500,
  seeds,
}, null, 2) + '\n');
console.log(`\n→ Wrote data/seeds.json (${Object.keys(seeds).length} teams)\n`);
console.log('Next: node calibrate.mjs && node backtest.mjs');

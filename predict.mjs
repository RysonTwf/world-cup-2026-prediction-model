#!/usr/bin/env node
// Predict any head-to-head from the calibrated ensemble (Elo + form).
//   node predict.mjs brazil argentina            (neutral venue)
//   node predict.mjs usa mexico usa               (3rd arg = home team)
import { readFileSync } from "node:fs";
import { ensembleProb } from "./elo.mjs";

// Use live in-tournament ratings if available, else fall back to frozen calibrated.
let elo, form, ratingsSource;
try {
  const live = JSON.parse(readFileSync(new URL("./data/elo-live.json", import.meta.url), "utf8"));
  elo  = live.ratings;
  form = live.formRatings;
  ratingsSource = `live (${live.matchesApplied} WC matches applied, through ${live.dataThrough?.slice(0, 10)})`;
} catch {
  ({ ratings: elo  } = JSON.parse(readFileSync(new URL("./data/elo-calibrated.json", import.meta.url), "utf8")));
  ({ ratings: form } = JSON.parse(readFileSync(new URL("./data/elo-form.json",       import.meta.url), "utf8")));
  ratingsSource = "calibrated (pre-tournament, frozen)";
}
const [a, b, home] = process.argv.slice(2);

if (!a || !b) {
  console.log("Usage: node predict.mjs <teamA> <teamB> [homeTeam]\n");
  console.log("Teams:\n  " + Object.keys(elo).sort().join(", "));
  process.exit(0);
}
if (elo[a] == null || elo[b] == null) {
  console.error(`Unknown team: ${elo[a] == null ? a : b}\nAvailable: ${Object.keys(elo).sort().join(", ")}`);
  process.exit(1);
}

const hb = home === a ? 150 : home === b ? -150 : 0;
const p  = ensembleProb(elo[a], elo[b], form[a] ?? elo[a], form[b] ?? elo[b], hb);
const bar = (x) => "█".repeat(Math.round(x * 30));

console.log(`\n  ${a} (Elo ${elo[a]} / Form ${form[a] ?? "—"})  vs  ${b} (Elo ${elo[b]} / Form ${form[b] ?? "—"})${hb ? `   [${home} at home]` : "   [neutral]"}\n`);
console.log(`  ${a.padEnd(16)} win  ${(p.winA * 100).toFixed(1).padStart(5)}%  ${bar(p.winA)}`);
console.log(`  ${"draw".padEnd(16)}      ${(p.draw * 100).toFixed(1).padStart(5)}%  ${bar(p.draw)}`);
console.log(`  ${b.padEnd(16)} win  ${(p.winB * 100).toFixed(1).padStart(5)}%  ${bar(p.winB)}`);
console.log(`\n  expected goals (ensemble):  ${p.expectedGoalsA.toFixed(2)} – ${p.expectedGoalsB.toFixed(2)}`);
console.log(`  (Ratings source: ${ratingsSource}; form signal uses 90-day half-life)\n`);
console.log("  Full 48-team tournament title odds (50,000 sims, conditioned on real results): https://cup26matches.com");

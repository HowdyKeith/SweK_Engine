// tools/ship/takeSurvey.mjs -- the command for brain/surveySeat.mjs (export-free on purpose): fly the survey seat on the needs-and-limits task and print what it scores against the tuned rule it sits on.
//   node tools/ship/takeSurvey.mjs [--from 1] [--to 20] [--kinds far,both] [--profile standard] [--seconds 600] [--sd 0.1]
// flies seeds from..to of each kind with the survey seat (profile) and with the tuned rule on the Round 8 constants, on the same dives with the same noisy gauge, and prints each arm's mean score, the paired
// difference with its standard error, the better / worse / same counts, the crushed and stranded dives and the seat's scheduled rollout seconds a dive. Reads nothing but its arguments. About 3 s a dive.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as S from "../../brain/surveySeat.mjs";
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const from = Number(val("--from", "1")), to = Number(val("--to", "20")), kinds = val("--kinds", "far,both").split(","), profile = val("--profile", "standard"), seconds = Number(val("--seconds", String(T.SECONDS))), sd = Number(val("--sd", String(T.GAUGE.sd)));
if (!(to >= from) || kinds.some((k) => !T.KINDS.includes(k)) || !(seconds > 0) || !(sd >= 0)) { console.error("usage: takeSurvey.mjs [--from N] [--to M] [--kinds far,both] [--profile " + S.PROFILE_NAMES.join("|") + "] [--seconds 600] [--sd 0.1]"); process.exit(2); }
const set = T.setOf(kinds, from, to), opts = { gauge: { sd, hz: T.GAUGE.hz }, seconds }, seats = [];
const rule = T.evaluate(T.flyDecision(U.tunedSeat(S.SURVEY_CONSTANTS, U.WIDE_BOUNDS)), set, opts);
const seat = T.evaluate(T.flyDecision((c) => { const s = S.surveySeat({ profile, overrides: seconds !== T.SECONDS ? { seconds } : {} })(c); seats.push(s); return s; }), set, opts);
const d = seat.runs.map((r, i) => r.score - rule.runs[i].score), n = d.length, m = d.reduce((a, b) => a + b, 0) / n, se = Math.sqrt(d.reduce((a, x) => a + (x - m) * (x - m), 0) / Math.max(1, n - 1) / n);
const cost = seats.length ? seats.reduce((a, s) => a + s.stats.rolloutSeconds, 0) / seats.length : 0;
console.log(`survey seat (profile ${profile}) against the tuned rule: ${n} dives (seeds ${from}-${to} of ${kinds.join(" and ")}, ${seconds} s, gauge sd ${sd})`);
console.log(`  tuned rule ${rule.score.toFixed(4)}   survey seat ${seat.score.toFixed(4)}   paired difference ${m >= 0 ? "+" : ""}${m.toFixed(4)} (se ${se.toFixed(4)}; better ${d.filter((x) => x > 1e-9).length}, worse ${d.filter((x) => x < -1e-9).length}, same ${d.filter((x) => Math.abs(x) <= 1e-9).length})`);
console.log(`  crushed ${rule.crashed} / ${seat.crashed}, stranded ${rule.stranded} / ${seat.stranded} (rule / seat); the seat schedules ${Math.round(cost)} rollout seconds a dive`);

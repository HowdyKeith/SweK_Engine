// WebGLEngine/tools/ship/flyCourseLift-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyCourseLift-selfcheck.mjs      (seconds; it flies nothing and starts no process)
//
// THE GATE OF THE COURSE-LIFT ROUND (registered in brain/FLY_COURSE_LIFT_WIP.md before tools/ship/flyCourseLift.mjs and tools/ship/takeFlyCourseLift.mjs existed, and before the tally-share
// round had run): do the course-chosen flies gain least from the richer scene, on the tally-share round's fresh lives?
//
//   1  THE ROUND'S NUMBERS      the pairs by draw, alpha, the data (the tally-share round's file, read and not flown); the registration says the same and was committed before that file
//   2  THE RECORDS              made here on the tally-share round's shape: the lift, the 24 pair differences, L; its checks first; the command reads only
// SABOTAGE LOG (2026-11-28) -- byte-safe runner, this gate alone, rows red: H1 the lift as a share 2 | H2 the second pair turned round 5 | H3 each fly against the next draw's pair 0 --
//   A FINDING: the made lifts were constant within an arm; a draw-dependent fixture now holds it, H3b 1 | H4 the tally-share round's checks skipped 1 | H5 alpha 0.05 0 -- A FINDING: no made
//   reading fell between 0.01 and 0.05; 18 of 24 now does, H5b 1 | H6 the command takes any word 1 | M1 an expectation moved 1.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import * as E from "./flyCourseLift.mjs";
import * as FS from "./flyTallyShare.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
const F = Object.fromEntries(Object.entries(E.FILES).map(([k, f]) => [k, FS.fileOf(fs.readFileSync(path.join(ENG, f)))]));

console.log("flyCourseLift-selfcheck -- the course-lift round (do the course-chosen flies gain least from the richer scene?): the numbers, the records\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! the pairs by draw: HOMEP against COURSE64 and HOME16 against H16BYC, home-chosen first; alpha 0.01; the tally-share round's files and flies", J(E.PAIRS) === J([["HOMEP", "COURSE64"], ["HOME16", "H16BYC"]]) && E.ALPHA === 0.01 &&
        E.FILES === FS.FILES && E.SEEDS === FS.SEEDS);
    ok("!! the lift is the own tally's home in the 26-type scene less in the plain, both from the tally-share round's records", E.liftOf({ ownType: 0.61, ownPlain: 0.55 }) === 0.61 - 0.55);
    // git: the registration's commit is an ancestor of the commit that first added the tally-share round's results file (or that file is not committed yet)
    const git = (a) => execFileSync("git", a, { cwd: ENG, encoding: "utf8" }).trim();
    const reg = git(["log", "--diff-filter=A", "--format=%H", "--", "brain/FLY_COURSE_LIFT_WIP.md"]).split("\n").pop(), res = git(["log", "--diff-filter=A", "--format=%H", "--", FS.RESULTS]).split("\n").pop();
    let before = !res; if (res && reg) { try { execFileSync("git", ["merge-base", "--is-ancestor", reg, res], { cwd: ENG }); before = reg !== res; } catch { before = false; } }
    ok("!! THE REGISTRATION WAS COMMITTED BEFORE THE TALLY-SHARE ROUND'S RESULTS FILE (by git), so the pattern was named before the lives it is read on were flown", !!reg && before, `registration ${reg ? reg.slice(0, 9) : "none"}, results ${res ? res.slice(0, 9) : "not committed yet"}`);
    const note = src("brain/FLY_COURSE_LIFT_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: the tally-share round's file, the lift, the pairs by draw, L over 24, the expectations",
        /\*\*The tally-share round's results file\*\*/.test(note) && /A fly's \*\*lift\*\* is ownType less ownPlain/.test(note) && /The pair is \*\*by draw\*\*: HOMEP against COURSE64/.test(note) &&
        /\*\*L: is the home-chosen fly's lift larger than its course-chosen pair's\?\*\* The 24 differences/.test(note) && /L: \*\*ABOVE about 60\*\*, CANNOT 35, BELOW 5\./.test(note));
});

console.log("\n2. THE RECORDS (made here on the tally-share round's shape)");
section(() => {
    const wh = (a, s) => F.types.lines.find((r) => r.kind === "fly" && r.arm === a && r.s === s).weightsHash, cf = FS.committedFour(F, "HOMEP", 1);
    const made = (lift) => { const fl = FS.ARMS.flatMap((a) => FS.SEEDS.map((s) => ({ kind: "fly", arm: a, s, weightsHash: wh(a, s), ownPlain: 0.55, ownType: 0.55 + lift(a, s), truePlain: 0.9, trueType: 0.95 })));
        const f1 = fl[0]; return [{ kind: "reproduce", arm: "HOMEP", s: 1, weightsHash: wh("HOMEP", 1), ...cf }, ...fl, { kind: "recheck", arm: "HOMEP", s: 1, ownPlain: f1.ownPlain, ownType: f1.ownType, truePlain: f1.truePlain, trueType: f1.trueType }]; };
    const homeMore = made((a) => (a === "HOMEP" || a === "HOME16" ? 0.04 : 0.02)), R = E.reading(homeMore, F);
    ok("!! home-chosen lifted 0.04 and course-chosen 0.02: L is 24 above, ABOVE; each pair alone 12 above; each arm's mean lift", R.checks.length === 0 && R.L.word === E.WORDS[0] && R.L.above === 24 && R.L.below === 0 &&
        R.byPair["HOMEP-COURSE64"].above === 12 && R.byPair["HOME16-H16BYC"].above === 12 && Math.abs(R.arms.HOMEP - 0.04) < 1e-12 && Math.abs(R.arms.H16BYC - 0.02) < 1e-12, R.checks.join("; "));
    const less = E.reading(made((a) => (a === "HOMEP" || a === "HOME16" ? 0.02 : 0.04)), F), same = E.reading(made(() => 0.03), F);
    ok("!! and it can go the other way, or neither: course-chosen lifted more is BELOW; all lifted the same is CANNOT (24 ties, against the claim)", less.L.word === E.WORDS[1] && less.L.below === 24 && same.L.word === E.WORDS[2] && same.L.ties === 24);
    const mixed = made((a, s) => (a === "HOMEP" ? 0.04 : a === "COURSE64" ? 0.02 : a === "HOME16" ? 0.02 : 0.04)), M = E.reading(mixed, F);
    ok("!! the pair is BY DRAW AND BY ARM: HOMEP above COURSE64 and HOME16 below H16BYC is 12 above and 12 below, CANNOT -- not the arms pooled", M.L.above === 12 && M.L.below === 12 && M.L.word === E.WORDS[2] &&
        J(E.pairDiffs(mixed.filter((r) => r.kind === "fly")).slice(0, 2).map((x) => [x.pair, x.s])) === J([["HOMEP-COURSE64", 1], ["HOMEP-COURSE64", 2]]));
    // H3 and H5 went 0 red on the first draft: every made lift was constant within an arm (so pairing the wrong draws changed nothing), and no made reading fell between 0.01 and 0.05.
    const byDraw = E.reading(made((a, s) => 0.03 + 0.001 * s + (a === "HOMEP" || a === "HOME16" ? 0.0005 : 0)), F);
    ok("!! the pair is the SAME DRAW: lifts rising with the draw and the home-chosen 0.0005 above their own draw's pair is 24 above -- against the NEXT draw it would be mostly below", byDraw.L.above === 24 && byDraw.L.below === 0);
    const near = E.reading(made((a, s) => (a === "HOMEP" || a === "HOME16" ? (s <= 9 ? 0.04 : 0.02) : 0.03)), F);
    ok("!! alpha is 0.01: 18 above and 6 below of 24 (two-sided p 0.023) is CANNOT, not ABOVE", near.L.above === 18 && near.L.below === 6 && near.L.p > 0.01 && near.L.p < 0.05 && near.L.word === E.WORDS[2], near.L.p.toFixed(4));
    const broken = E.reading(homeMore.slice(0, -1), F);
    ok("!! the tally-share round's own checks come first: its file missing its second flight leaves every reading null, named as that round's", broken.L === null && /^the tally-share round's file: .*flown a second time/.test(broken.checks[0] || ""));
    const LL = E.readingLines(R);
    ok("readingLines prints the checks, each arm's lift, L's word and each pair alone", /^the checks hold/.test(LL[0]) && LL.some((l) => l.trim() === E.WORDS[0]) && LL.filter((l) => /described: .* alone/.test(l)).length === 2);
    const csrc = src("tools/ship/takeFlyCourseLift.mjs"), me = src("tools/ship/flyCourseLift-selfcheck.mjs");
    ok("!! the command only reads: its one word is `read`, it reads the tally-share round's results file, and nothing in it flies or spawns", /argv\.length === 1 && argv\[0\] === "read"/.test(csrc) && /path\.join\(ENG, FS\.RESULTS\)/.test(csrc) &&
        !/flyOne|reproduceOne|fourOf|spawn|child_process/.test(csrc) && !/FS\.(flyOne|reproduceOne|fourOf)\(/.test(me));
});

console.log(`\nflyCourseLift-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

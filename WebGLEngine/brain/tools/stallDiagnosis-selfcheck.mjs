// WebGLEngine/brain/tools/stallDiagnosis-selfcheck.mjs -- v2852
//
// Run: node brain/tools/stallDiagnosis-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES brain/tools/stallDiagnosis.mjs and its wiring into brain-maze.html.
//
// KEITH'S REPORT: "the walker will run into a wall and instead of looking for a secondary path... it should
// realize it is stopped, but not stuck." STOPPED, NOT STUCK is the diagnosis. The walker is standing where the
// field told it to stand, correctly refusing to enter a wall.
//
// THREE CAUSES PRODUCE THAT SYMPTOM AND THEY HAVE OPPOSITE FIXES -- which is the same shape as the model
// bench's refused-versus-malformed split and the occlusion taxonomy. Two of them are not walker problems at all,
// and NO amount of evolving a new policy would fix them: a policy cannot learn its way out of a gradient that
// is not there, only learn to compensate for a broken map.
//
// AND THE MOST INTERESTING ONE WAS ALREADY DOCUMENTED IN THE PAGE AND CHECKED NOWHERE. brain-maze.html derives
// that a wall is only impassable if crossing it costs more than the longest possible detour --
// 1 + slopeK*(WALL_H/CELL) > W*H -- and scales WALL_H in the size dropdown's onchange handler. THAT IS THE ONLY
// PLACE THE INVARIANT IS MAINTAINED, and nothing verified it. At 48^2 the fixed 4000 is fine; at 72^2 it needs
// 6911 and at 96^2 it needs 12287. If that handler is ever bypassed, Dijkstra's shortest path goes THROUGH a
// wall, the field points into it, and the walker stalls exactly as reported.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wallCost, wallsAreImpassable, detectStall, diagnose } from "./stallDiagnosis.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const page = fs.readFileSync(path.join(ENG, "brain-maze.html"), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const G = { cell: 4, slopeK: 3 };

// 1. THE WALL INVARIANT, which the page derives and never checked
{
    ok("wall cost matches the page's cost model", wallCost(4000, G) === 1 + 3 * (4000 / 4));
    ok("!! WALL_H 4000 is sufficient at 48x48 -- the size the page boots at", wallsAreImpassable(48, 48, 4000, G).ok);
    ok("!! ...and NOT sufficient at 72x72", wallsAreImpassable(72, 72, 4000, G).ok === false, `needs ${wallsAreImpassable(72, 72, 4000, G).neededWallH}`);
    ok("!! ...nor at 96x96", wallsAreImpassable(96, 96, 4000, G).ok === false, `needs ${wallsAreImpassable(96, 96, 4000, G).neededWallH}`);

    // the page's own scaling rule must clear the bar at EVERY selectable size
    const sizes = [...page.matchAll(/<option value="(\d+)">size:/g)].map((m) => +m[1]);
    ok("the selectable sizes are found in the page", sizes.length >= 3, sizes.join(", "));
    const scaled = (N) => Math.max(4000, Math.ceil(N * N * 4 / 3 * 1.3));
    const bad = sizes.filter((N) => !wallsAreImpassable(N, N, scaled(N), G).ok);
    ok("!! the page's scaling rule keeps walls impassable at EVERY selectable size", bad.length === 0,
        bad.length ? `fails at ${bad.join(", ")}` : sizes.map((N) => `${N}->${scaled(N)}`).join("  "));
    ok("...and the failure message says what actually goes wrong, not just 'too low'",
        /shortest path will go THROUGH a wall/.test(wallsAreImpassable(96, 96, 4000, G).why));
}

// 2. STALL DETECTION -- and the cases that must NOT read as a stall
{
    const still = Array.from({ length: 40 }, () => ({ x: 10, z: 10 }));
    ok("a motionless walker is detected", detectStall(still).stalled === true);
    const moving = Array.from({ length: 40 }, (_, i) => ({ x: i * 2, z: 0 }));
    ok("a moving walker is not", detectStall(moving).stalled === false);
    ok("!! a walker sitting AT THE GOAL is not a stall", detectStall(still.map((p) => ({ ...p, atGoal: true }))).stalled === false);
    ok("too little history is not a stall either", detectStall([{ x: 0, z: 0 }]).stalled === false);
    const crawl = Array.from({ length: 40 }, (_, i) => ({ x: i * 0.005, z: 0 }));
    ok("a crawl below the threshold counts as stalled", detectStall(crawl).stalled === true);
}

// 3. THE DIAGNOSIS NAMES WHICH OF THE FOUR, in the order of cheapest fix
{
    const stall = { stalled: true, moved: 0.1 };
    const ok48 = { W: 48, H: 48, wallH: 4000, ...G };
    ok("!! cheap walls are caught FIRST, before anything about the field", diagnose({ stall, grid: { W: 96, H: 96, wallH: 4000, ...G }, field: { truncated: true, minima: 5 } }).cause === "WALLS_TOO_CHEAP");
    ok("a truncated field is named when the walls are fine", diagnose({ stall, grid: ok48, field: { truncated: true, iters: 82, needed: 140 } }).cause === "FIELD_TRUNCATED");
    ok("a basin is named when the field is complete", diagnose({ stall, grid: ok48, field: { truncated: false, minima: 3 } }).cause === "FIELD_HAS_BASIN");
    ok("!! only when the MAP is sound is the walker blamed", diagnose({ stall, grid: ok48, field: { truncated: false, minima: 0 } }).cause === "WALKER");
    ok("...and the first three say plainly that the walker is NOT at fault",
        [{ W: 96, H: 96, wallH: 4000, ...G }].every((g) => diagnose({ stall, grid: g, field: {} }).walkerAtFault === false));
    ok("no stall means no diagnosis", diagnose({ stall: { stalled: false }, grid: ok48, field: {} }).stalled === false);
    const w = diagnose({ stall, grid: { W: 96, H: 96, wallH: 4000, ...G }, field: {} });
    ok("!! the fix is a NUMBER, not advice", /raise WALL_H to at least 12287/.test(w.fix), w.fix);
    const t = diagnose({ stall, grid: ok48, field: { truncated: true, iters: 82, needed: 140 } });
    ok("...and the truncated fix quotes ran-versus-needed", /ran 82, needed 140/.test(t.fix));
    const walker = diagnose({ stall, grid: ok48, field: { truncated: false, minima: 0 } });
    ok("!! and the walker verdict records that evolving a policy would not have fixed the others",
        /evolving a new policy would NOT have helped/.test(walker.detail));
}

// 4. THE WIRING, and that it cannot break the walker it watches
{
    ok("the page imports the diagnosis", /from "\.\/brain\/tools\/stallDiagnosis\.mjs"/.test(page));
    ok("...aliased, because the page already owns a diagnose()", /diagnose as diagnoseStall/.test(page));
    ok("it samples the walker and detects a stall", /detectStall\(_walkHist/.test(page));
    ok("!! the field lookup is TDZ-guarded, so a diagnostic cannot break what it diagnoses",
        /typeof P !== "undefined"/.test(page) && /temporal dead zone/.test(page));
    ok("it reports the cause on the HUD line, not only to the console", /STALLED: " \+ d\.cause/.test(page));
    ok("...and logs the FIX beside it", /console\.warn\("\[maze stall\] " \+ d\.cause \+ " -- " \+ d\.fix\)/.test(page));
    ok("it reports a cause CHANGE rather than every frame", /_lastStall\.cause !== d\.cause/.test(page));
}

console.log("stallDiagnosis-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);

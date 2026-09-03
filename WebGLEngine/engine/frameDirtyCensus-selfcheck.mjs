// WebGLEngine/engine/frameDirtyCensus-selfcheck.mjs -- v4183
//
// GATES engine/frameDirtyCensus.mjs -- the census engine/frameDirty.js has been waiting for since v4174.
//
// *** THE RATCHET IS THE WHOLE MECHANISM AND SECTION 4 IS IT. *** A census written once and never enforced
// becomes a stale list within two rounds. Here the ticker list is EXTRACTED from main.js rather than
// maintained, so a new per-frame ticker appears as UNEXAMINED, pushes the count past the baseline, and this
// gate goes red until somebody writes a verdict for it. That is what keeps it a census.
//
// Section 3 pins the thing that most wants to be got wrong: a verdict must answer "can this move pixels",
// and main.js's own comments answer "is this expensive". Seventeen tickers claim to be cheap no-ops; none of
// that is evidence, and a census built from those comments would have been confidently wrong.
//
// Run: node engine/frameDirtyCensus-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { fileURLToPath } from "node:url";
import { tickersIn, census, report, coveredIn, VERDICTS, ANIMATES, REACTIVE, INERT, UNEXAMINED, UNEXAMINED_BASELINE, UNGUARDED_BASELINE, STILL_UNGUARDED_REASON } from "./frameDirtyCensus.mjs";
import { FrameDirty } from "./frameDirty.js";
import { readFileSync } from "node:fs";
import { codeOnly } from "../tools/ship/sourceScan.mjs";

let pass = 0, fail = 0;
// v4380 -- THIS PRINTED ITS FAIL LINE TO STDERR, ALONE AMONG THE 29 GATES IN THE RED REGISTER. It still exited 1,
// so the sweep saw the red -- but every consumer in this tree scrapes STDOUT for "  FAIL  ", so the REASON was
// invisible: the red register recorded this gate's line only because somebody once read it by hand. A red whose
// reason cannot be read is most of the way to a red nobody opens, which is what tools/ship/registerDrift-selfcheck.mjs
// exists to catch. The verdict is unchanged; only the stream is.
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  FAIL  " + m); } };
const MAIN = readFileSync(fileURLToPath(new URL("../main.js", import.meta.url)), "utf8");

// 1) THE EXTRACTION IS MECHANICAL, so it cannot go stale the way a maintained list would.
{
    const t = tickersIn(MAIN);
    ok(t.length >= 55, `the loop's per-frame tickers are read out of main.js itself (${t.length} found)`);
    ok(t.includes("dayNightCycle") && t.includes("gpuParticles") && t.includes("weather"),
        "including the ones that plainly animate");
    ok(t.includes("systemPerf") && t.includes("camera"), "and the ones that plainly do not");
    ok(t.length === new Set(t).size, "each name appears once, however many times it is ticked");
    ok(t.join(",") === [...t].sort().join(","), "and the list is sorted, so a diff between rounds is readable");
    ok(tickersIn("").length === 0 && tickersIn("function nothing() {}").length === 0, "a source with no loop yields nothing rather than throwing");

    // it must read the LOOP, not the whole file -- a tick call in an unrelated function is not a per-frame tick
    ok(!t.includes("_wadAnimator"), "a call guarded behind an if inside the loop is still counted, but nothing outside the loop is");
}

// 2) EVERY VERDICT CARRIES A REASON. A verdict without one cannot be reviewed, only believed.
{
    const names = Object.keys(VERDICTS);
    ok(names.length > 30, `${names.length} tickers have been given a verdict`);
    // *** THE FIRST VERSION OF THIS CHECK MEASURED CHARACTERS AND WAS WRONG. *** It demanded more than 20,
    // and went red on audio's "sound has no pixels" -- nineteen characters and arguably the best reason in
    // the table. LENGTH IS A BAD PROXY FOR "a reason rather than a label"; what actually separates them is
    // that a reason is a clause and a label is a word. So: at least three words, which admits the good short
    // one and still rejects "animates" restated as its own justification.
    ok(names.every((n) => typeof VERDICTS[n].why === "string" && VERDICTS[n].why.trim().split(/\s+/).length >= 3),
        "every one of them carries a written reason of at least three words -- a clause, not a label");
    ok(names.every((n) => VERDICTS[n].why.toLowerCase() !== VERDICTS[n].verdict),
        "and no reason is merely the verdict repeated back");
    ok(names.every((n) => [ANIMATES, REACTIVE, INERT].includes(VERDICTS[n].verdict)),
        "and a verdict from the fixed set -- UNEXAMINED is never written down, it is what ABSENCE means");
    ok(Object.isFrozen(VERDICTS), "the table is frozen");

    // the verdicts must be about the picture, not about cost
    const src = readFileSync(fileURLToPath(new URL("./frameDirtyCensus.mjs", import.meta.url)), "utf8");
    const reasons = names.map((n) => VERDICTS[n].why).join(" ");
    ok(!/\bcheap\b|\bfast\b|microsecond/i.test(reasons),
        "*** no reason argues from COST -- the question is whether it can move pixels, and a cheap tick can animate while a costly one changes nothing ***");
    ok(/dayNightCycle/.test(src) && /advances the hour/.test(src),
        "and the worked example is in the file: dayNightCycle is microseconds of work and it moves the sun, so it ANIMATES");
}

// 3) *** THE COST COMMENTS IN main.js ARE NOT EVIDENCE, AND THE CENSUS SAYS SO. ***
{
    const src = readFileSync(fileURLToPath(new URL("./frameDirtyCensus.mjs", import.meta.url)), "utf8");
    ok(/CAN THIS MOVE PIXELS/.test(src), "the module states the question it is answering");
    ok(/not "IS THIS EXPENSIVE"|NOT "IS THIS EXPENSIVE/i.test(src), "and the question it is NOT answering");

    // count the tickers that advertise themselves as no-ops, so the claim in the header is a measurement
    const lines = MAIN.split("\n");
    const start = lines.findIndex((l) => /^function loop\(/.test(l));
    const re = /^\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\.(?:tick|update|step|animate)\(/;
    const seen = new Map();
    for (let i = start; i < lines.length && lines[i] !== "}"; i++) {
        const m = lines[i].match(re); if (!m) continue;
        let ctx = "";
        for (let k = Math.max(0, i - 6); k < i; k++) if (/^\s*\/\//.test(lines[k])) ctx += lines[k] + " ";
        if (!seen.has(m[1])) seen.set(m[1], /no-op|cheap|only ticks|when idle/i.test(ctx));
    }
    const claiming = [...seen.values()].filter(Boolean).length;
    ok(claiming > 10, `${claiming} tickers carry a nearby comment calling themselves cheap or a no-op`);
    // and at least one of THOSE is classified as an animator, which is the proof the two questions differ
    const cheapAnimators = [...seen].filter(([n, cheap]) => cheap && VERDICTS[n]?.verdict === ANIMATES).map(([n]) => n);
    ok(cheapAnimators.length > 0,
        `*** and at least one of them ANIMATES anyway (${cheapAnimators.join(", ")}) -- which is the proof that "cheap" and "static" are different claims ***`);
}

// 4) *** THE RATCHET. *** UNEXAMINED may only go down.
{
    const c = census(MAIN, []);
    ok(c.total === tickersIn(MAIN).length, "the census covers every extracted ticker");
    ok(c.animates + c.reactive + c.inert + c.unexamined === c.total, "every ticker lands in exactly one bucket");
    ok(c.unexamined <= UNEXAMINED_BASELINE,
        `UNEXAMINED is ${c.unexamined}, at or below the frozen baseline of ${UNEXAMINED_BASELINE} -- a new ticker in the loop pushes this over and this check goes red until somebody decides what it is`);
    ok(UNEXAMINED_BASELINE < c.total, "the baseline is a real ratchet, not a number large enough to admit everything");

    // a ticker with no verdict really does read as unexamined
    const fake = census("function loop(t) {\n    somethingBrandNew.tick(dt);\n}\n", []);
    ok(fake.total === 1 && fake.unexamined === 1, "an unknown ticker is UNEXAMINED by absence, not silently ignored");
    ok(/nobody has decided/.test(fake.rows[0].why), "and says so in the reason a reader would look at");
}

// 5) *** THE NUMBER THAT DECIDES WHETHER THE FLAG MAY BE ENABLED. *** An ANIMATES ticker with no registered
//    source is a system that can change the picture while the flag believes the scene is still.
{
    const none = census(MAIN, []);
    ok(none.unguarded.length > 20, `with no probes registered, ${none.unguarded.length} animators are unguarded`);
    ok(none.unguarded.includes("dayNightCycle") && none.unguarded.includes("weather"),
        "including ones that would freeze a sky mid-sunset");

    // registering by name reduces it, exactly
    const some = census(MAIN, ["dayNightCycle", "weather", "gpuParticles"]);
    ok(some.unguarded.length === none.unguarded.length - 3, "registering three animators removes exactly three from the unguarded list");
    ok(!some.unguarded.includes("weather"), "and by name");

    // *** AND THE FLAG IS STILL DISABLED, BECAUSE unguarded IS NOT ZERO. ***
    ok(none.unguarded.length > 0, "the count is not zero");
    const mainCode = codeOnly(MAIN);
    const at = mainCode.indexOf("new FrameDirty");
    ok(/enabled\s*:\s*false/.test(mainCode.slice(at, at + 200)),
        "*** so main.js still constructs the flag DISABLED -- the census does not itself license turning it on, it says how far there is to go ***");
    ok(new FrameDirty({}).enabled === false, "and off remains the module default");
}

// 6) THE REPORT is readable by a person at a console, which is where this gets used.
{
    const r = report(MAIN, ["camera"]);
    ok(/per-frame tickers/.test(r) && /UNEXAMINED/.test(r), "the report names the totals");
    ok(/unguarded animators/.test(r), "and the number that matters");
    ok(r.split("\n").length >= 4, "over several lines rather than one long string");
}

// 7) THE WIRING. Probes registered, and the census reachable from a console -- but the flag still off.
{
    const nc = MAIN;                       // string literals matter here (module paths, source names)
    const code = codeOnly(MAIN);
    ok(/import \{[^}]*frameDirtyCensus[^}]*\} from/.test(nc.replace(/\s+/g, " ")), "main.js imports the census");
    ok(/frameDirty\.census\s*=\s*async function/.test(code), "and exposes it as an async method, because reading the source is a fetch");

    // *** THE FETCH IS THE POINT: a list baked in at build time would describe a file that no longer exists ***
    const fn = code.slice(code.indexOf("frameDirty.census = async"), code.indexOf("frameDirty.census = async") + 900);
    ok(/await fetch/.test(fn), "the census READS main.js at call time rather than carrying a baked-in list");
    ok(/catch/.test(fn) && /could not read/.test(nc), "and says so plainly when it cannot, instead of reporting an empty census as a clean one");

    // the probes the census justified
    for (const name of ["dayNight", "weather", "projectiles", "debris", "agents"]) {
        ok(nc.includes('addSource("' + name + '"'), `a probe is registered for ${name}`);
    }
    // *** remotePlayers IS THE ONE A LOCAL-ONLY CENSUS WOULD MISS, and the reason is written at the probe ***
    ok(/remotePlayers/.test(code), "the agents probe includes remote players");
    ok(/no local input at all|nothing about this machine's input/.test(nc),
        "with the reason recorded: another player's avatar moves with no local input, so no amount of watching this keyboard would reveal it");

    // and dayNightCycle's role as the worked example survives into main.js
    ok(/"Cheap" and "static" are|different claims/.test(nc),
        "and the cost-versus-motion distinction is restated where the probes are, not only in the census module");

    // *** STILL OFF. *** The census does not license enabling it; it measures the distance.
    const at = code.indexOf("new FrameDirty");
    ok(/enabled\s*:\s*false/.test(code.slice(at, at + 200)), "the flag is still constructed disabled");
}

// 8) *** COVERAGE IS DECLARED AT THE PROBE, AND ONLY AT A PROBE. ***
{
    const nc = MAIN;

    // Every covers list must be an argument to addSource and nothing else. While wiring this round a regex
    // stamped one onto the XRSessionManager constructor instead -- a second argument that constructor
    // ignores, so it was syntactically valid, silently meaningless, and node --check said nothing at all.
    const coversAt = [...nc.matchAll(/\{ covers: \[/g)].map((m) => m.index);
    ok(coversAt.length >= 5, coversAt.length + " probes declare what they guard");
    let misplaced = 0;
    for (const idx of coversAt) {
        const before = nc.slice(Math.max(0, idx - 700), idx);
        if (!/addSource\(/.test(before)) misplaced++;
    }
    ok(misplaced === 0, "*** every covers list belongs to an addSource call -- none has drifted onto a constructor that would ignore it ***");
    ok(!/new XRSessionManager\([\s\S]{0,3000}?\}, \{ covers:/.test(nc), "and the XR session manager takes no covers argument");

    // the flag can report what it COVERS, which is a different question from how many probes exist
    const fd = new FrameDirty({});
    fd.addSource("a", () => false, { covers: ["one", "two"] });
    fd.addSource("b", () => false, { covers: ["two", "three", "four"] });
    fd.addSource("c", () => false);
    ok(fd.sources().length === 3, "three probes registered");
    ok(fd.covered().join(",") === "four,one,three,two", "covering four DISTINCT tickers between them, de-duplicated (two appears in both) and sorted");
    // The fixture is chosen so the counts CANNOT match by coincidence: three probes, four covered tickers,
    // one of them shared. An earlier version had three and three and asserted they differ, which was the
    // fixture being wrong rather than the claim.
    ok(fd.covered().length === 4 && fd.sources().length === 3,
        "and the two counts differ (4 covered, 3 probes), which is exactly why the census asks for covered() rather than sources()");

    // *** THIS IS A MEASURING INSTRUMENT READING LOW, WHICH IS WORSE THAN NO INSTRUMENT BECAUSE IT LOOKS LIKE
    // DATA. *** Before coverage existed the census matched probe NAMES against ticker names, so a probe
    // called "agents" guarding aiManager, botManager and remotePlayers was credited with none of them.
    const byName = census(MAIN, fd.sources());
    const byCoverage = census(MAIN, ["aiManager", "botManager", "remotePlayers", "centipedeManager", "birthSpawner"]);
    ok(byCoverage.unguarded.length < byName.unguarded.length,
        "counting by what a probe COVERS credits " + (byName.unguarded.length - byCoverage.unguarded.length) + " more systems than counting by probe name");
}

// 9) *** THE SECOND RATCHET: COVERAGE MAY ONLY IMPROVE. ***
//    The first version of section 8 counted PROBES that declared a covers list and required at least five.
//    Deleting one probe's declaration left five others, the gate stayed green, and a system had silently
//    become unguarded -- the exact failure a census exists to prevent, inside the census's own gate.
{
    const covered = coveredIn(MAIN);
    ok(covered.length >= 20, covered.length + " tickers are declared as covered by some probe, read from main.js's own covers lists");
    ok(covered.includes("remotePlayers") && covered.includes("dayNightCycle"),
        "including the two the census singles out -- a remote avatar that moves with no local input, and a sun that moves every frame");

    const c = census(MAIN, covered);
    ok(c.unguarded.length <= UNGUARDED_BASELINE,
        "UNGUARDED animators are " + c.unguarded.length + ", at or below the frozen baseline of " + UNGUARDED_BASELINE +
        " -- removing a probe's coverage pushes this over and the check goes red");
    ok(UNGUARDED_BASELINE > 0, "and the baseline is honestly non-zero: there is still work before the flag may default on");
    ok(UNGUARDED_BASELINE < c.animates, "while being well under the animator count, so it is a real ratchet rather than a number that admits everything");

    // the ones still unguarded are named, so the remaining work is a list rather than a feeling
    ok(c.unguarded.length === 0 || c.unguarded.every((n) => typeof n === "string"), "and the remainder is reported by name");
}

// 10) *** THE RATCHETS MOVED, AND THE ONE THAT DID NOT REACH ZERO SAYS WHY. ***
{
    const covered = coveredIn(MAIN);
    const c = census(MAIN, covered);
    // v4231: 14 -> 0. The remaining fourteen were read one at a time, and ELEVEN OF THEM ANIMATE -- so
    // writing the verdicts honestly pushed UNGUARDED from 1 to 12 before six probes brought it back. That
    // direction is the point: a census whose numbers only ever improve is not measuring anything, and the
    // eleven were invisible precisely because nobody had looked.
    ok(UNEXAMINED_BASELINE === 0, "UNEXAMINED reached ZERO -- 25 -> 14 (v4184) -> 0 (v4231); every ticker in the loop now carries a verdict");
    ok(c.unexamined === 0, "...and the live census agrees, so no ticker is riding on a name instead of a reading");
    ok(UNGUARDED_BASELINE === 1, "and UNGUARDED from 8 to 1, held there through eleven new animators");
    ok(c.unguarded.length <= 1, "which the live census agrees with");

    // *** THE LAST ONE IS NAMED AND EXPLAINED, RATHER THAN CLOSED BY INVENTING A FIELD. ***
    ok(c.unguarded.length === 0 || Object.keys(STILL_UNGUARDED_REASON).includes(c.unguarded[0]),
        "the animator still unguarded carries a written reason for being so");
    ok(/writing the probe rather than finding it/.test(JSON.stringify(STILL_UNGUARDED_REASON)),
        "*** and the reason is the honest one: a baseline of zero reached by adding a field to the thing being measured is not the same as a baseline of zero ***");
    ok(UNGUARDED_BASELINE > 0, "so the baseline is one, not zero");

    // the emitters are covered by the system they emit INTO, not by probes of their own
    ok(covered.includes("torchLighter") && covered.includes("memoryShimmer"),
        "torchLighter and memoryShimmer are covered");
    ok(/three particle streams per torch|EMITTERS/.test(MAIN),
        "by the particles probe, because they draw nothing themselves -- a third category after 'animates' and 'writes DOM': systems that animate THROUGH a system already guarded");
}

// 11) *** THE HUD READOUT IS OUTSIDE THE DRAW GUARD, WHICH IS THE DEFECT THIS ROUND FOUND IN v4174. ***
//     The guard exists to skip the GL draw. hud.update() writes textContent -- fps, chunk count, position,
//     weather, time of day -- and drawing nothing on the canvas, it has no business being skipped with it.
//     Inside the guard, a static 3D scene froze a LIVE DIAGNOSTIC, which is exactly what morphDigits' v3531
//     rule forbids: a reader must never be shown a number they cannot trust. It was inside the non-XR branch
//     too, so a headset froze it as well.
{
    const iGuardClose = MAIN.indexOf("close the dirty-flag draw guard");
    const iHud = MAIN.indexOf('profStart("hudUpdate")');
    const iDecision = MAIN.indexOf("frameDirty.shouldRender()");
    ok(iGuardClose > 0 && iHud > 0 && iDecision > 0, "the three positions are findable");
    ok(iHud > iGuardClose, "*** hudUpdate runs AFTER the guard closes, so a skipped frame still refreshes the readouts ***");
    ok(iDecision < iGuardClose, "while the decision is still made before the draw");

    // and the panels were already outside it, which is why only one of the twelve had to move
    const iPanels = MAIN.indexOf('profStart("hudPanels")');
    ok(iPanels > 0 && iPanels < iDecision, "the DOM panels were already ticked BEFORE the guard, so only hud.update was on the wrong side");
    ok(/MOVED OUT OF THE DIRTY-FLAG GUARD/.test(MAIN), "and the move is explained where it happened");
    ok(/my own mistake at v4174|MY OWN/i.test(MAIN), "including whose mistake it was");
}

console.log(`frameDirtyCensus-selfcheck: ${pass} passed, ${fail} failed`);
console.log("unchecked here: whether each verdict is CORRECT. A verdict is a judgement about what a subsystem\n" +
            "does, and this gate checks that one exists, carries a reason, and is not argued from cost -- not\n" +
            "that it is right. What it does guarantee is that no ticker can enter the loop unexamined in\n" +
            "silence, which is the failure a census exists to prevent.");
process.exit(fail ? 1 : 0);

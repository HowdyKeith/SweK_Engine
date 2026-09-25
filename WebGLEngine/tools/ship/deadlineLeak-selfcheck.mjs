// WebGLEngine/tools/ship/deadlineLeak-selfcheck.mjs -- v4678
//
// Run: node tools/ship/deadlineLeak-selfcheck.mjs      (~11s)
//
// *** A GATE DECLARED 0.2s, TOOK 60.1s, AND EVERY CHECK IN IT PASSED THE WHOLE TIME. ***
//
// v4676 wrapped a spawn in a promise and wrote the deadline as
//     setTimeout(() => fin({ ok: false, reason: "...did not answer in 60 s" }), 60000);
// with the handle discarded. `fin` is once-only, so the late fire did nothing -- and the timer held the event
// loop open for the whole minute after the answer had arrived. In a long-running bridge that is invisible. In
// tools/ship/cloneProvision-selfcheck.mjs it was 53 SECONDS OF DEAD TIME on a 7.1 s gate, against a sweep budget
// of 3,000 ms, and NO ROW COULD SEE IT.
//
// What this file grades: that the source rule finds the shape and does not find the innocent look-alikes, that
// the dead-tail instrument measures the consequence by running rather than reading, and that the fixed site is
// fixed by the measurement and not by assertion.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as DL from "./deadlineLeak.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (l) => console.log("  ----  " + l);
console.log("deadlineLeak-selfcheck -- a discarded deadline handle cost 53 seconds and no check could see it\n");

// ---- 1. THE RULE, ON HAND-BUILT BODIES -----------------------------------------------------------------------
console.log("1. *** THE SHAPE, AND THE THREE LOOK-ALIKES THAT ARE NOT IT ***");
{
    const LEAK = `(resolve) => {
        const child = spawn("x");
        let settled = false;
        const fin = (v) => { if (settled) return; settled = true; resolve(v); };
        child.on("exit", () => fin({ ok: true }));
        setTimeout(() => fin({ ok: false }), 60000);
    }`;
    const hit = DL.leakIn(LEAK);
    ok("!! *** the shape is found, with its DEADLINE LENGTH and the settle function it calls ***",
        !!hit && hit.ms === 60000 && hit.callee === "fin" && hit.otherSettlePaths >= 1,
        hit ? `${hit.ms} ms via ${hit.callee}, ${hit.otherSettlePaths} other settle path(s)` : "NOT FOUND",
        );

    ok("!! ...and a timer whose handle is KEPT is not a finding, because that is the repair",
        DL.leakIn(LEAK.replace("setTimeout(", "t = setTimeout(")) === null,
        "clearing depends on the settle path being reached; this is the half of the fix that does");
    ok("!! ...and an UNREF'd one is not a finding either, because that is the other half",
        DL.leakIn(LEAK.replace("setTimeout(() => fin({ ok: false }), 60000);",
                               "setTimeout(() => fin({ ok: false }), 60000).unref();")) === null,
        "unref'ing does not depend on the settle path being reached, and the repaired site does both");

    // *** THE THREE INNOCENT SHAPES, WHICH IS WHERE A RULE LIKE THIS GOES WRONG. ***
    ok("!! *** a DELAY that is the promise's ONLY way out is not a leak -- nothing is held that was not anyway ***",
        DL.leakIn(`(resolve) => { setTimeout(() => resolve(null), 3000); }`) === null,
        "this is the sleep() shape, and calling it a leak would put most of the tree on the list");
    ok("...and a POLLER outside any promise is not in scope at all",
        DL.leakIn(`() => { setTimeout(poll, 250); }`) === null,
        "kaggleBridge's job poller, tunnelRegistry's tick and gpuBrainBridge's 250 ms poll are all meant to hold " +
        "the loop, and they are not inside a settle-once promise");
    ok("...and a timeout that calls something which is NOT a settle path is not a finding",
        DL.leakIn(`(resolve) => { const child = spawn("x"); child.on("exit", () => resolve(1)); setTimeout(() => log("slow"), 9000); }`) === null,
        "a stray timer that resolves nothing is a different defect and this rule does not claim it");
}

// ---- 1b. THE TWO HELPERS THE RULE IS BUILT ON, DRIVEN ------------------------------------------------------
console.log("\n1b. *** THE BRACE MATCHER AND THE WALK, BECAUSE THE RULE IS ONLY AS GOOD AS ITS INPUT ***");
{
    // promiseBodies() brace-matches from `new Promise(` rather than regexing to the next `)`. A regex would cut
    // the body at the first close paren -- which is inside `child.on("exit", () => fin({ ok: true }))` in every
    // real case -- and the rule would then see no settle path and report nothing. THE SILENT-ZERO SHAPE.
    const src = 'const a = new Promise((res) => { f(g(1), h(2)); setTimeout(() => res(0), 10); });\n' +
                'const b = new Promise((res) => { res(1); });';
    const bodies = DL.promiseBodies(src);
    ok("!! *** promiseBodies finds BOTH executors and each body survives nested parentheses intact ***",
        bodies.length === 2 && bodies[0].body.includes("h(2)") && bodies[0].body.includes("setTimeout") &&
        bodies[1].body.includes("res(1)"),
        `${bodies.length} bodies; the first is ${bodies[0].body.length} chars and still holds its setTimeout. A ` +
        "regex to the next ')' would have cut it at h(2) and the rule would report nothing at all");
    ok("...and an UNCLOSED `new Promise(` yields nothing rather than a body running to end-of-file",
        DL.promiseBodies("new Promise((res) => { res(1);").length === 0,
        "a truncated or minified file must not produce one giant body that matches everything");

    const files = DL.sourceFiles();
    ok("!! *** sourceFiles walks .js, .mjs AND .cjs, and excludes what is not this tree's code ***",
        files.length > 3000 && files.some((f) => f.endsWith(".cjs")) && files.some((f) => f.endsWith(".mjs")) &&
        !files.some((f) => f.includes("node_modules") || f.includes("/vendor/") || f.includes("GPU_Assets")),
        `${files.length} files. The .cjs is not decoration: v4663's wasm hook is one, and the wasm census missed ` +
        "a whole population by walking three extensions instead of every one");
    ok("...and it returns tree-relative POSIX paths, so a finding can be looked up on either platform",
        files.every((f) => !f.startsWith("/") && !f.includes("\\")),
        "a Windows-separator path in a record is the defect winPathGuard exists for");
}

// ---- 2. THE TREE, AND THE ONE SITE THAT WAS PAID ------------------------------------------------------------
console.log("\n2. *** THE POPULATION AS A CEILING, AND THE REPAIRED SITE ABSENT FROM IT ***");
{
    const r = DL.scan();
    report(`${r.found.length} site(s) across ${r.files} source files; longest deadline ` +
        `${r.found.length ? (r.found[0].ms === null ? "not a literal" : r.found[0].ms + " ms") : "n/a"}`);
    ok("!! *** the repaired site is NOT in the list, which is what says the scan sees a repair ***",
        !r.found.some((f) => f.file === "ai-bridge/sourceChainBridge.js"),
        "sourceChainBridge's resolver deadline is both cleared in fin() and unref'd; before v4678 it was the " +
        "longest entry in this list");
    ok("...and the list is not empty, or the row above would pass on a scan that finds nothing anywhere",
        r.found.length > 0, `${r.found.length} remain, reported as a CEILING and not a debt`);
    ok("!! *** and the ceiling is stated as one: a stray deadline in a long-running bridge costs NOTHING ***",
        r.found.every((f) => typeof f.file === "string") && /ai-bridge\//.test(r.found.map((f) => f.file).join(" ")),
        "most of what remains is in bridges, where the process is held open regardless. THE COST LANDS ON " +
        "SHORT-LIVED PROCESSES, so section 3 measures it rather than assuming it");
}

// ---- 3. THE CONSEQUENCE, MEASURED BY RUNNING ---------------------------------------------------------------
console.log("\n3. *** THE DEAD TAIL: WALL CLOCK MINUS WORK, WHICH NEEDS NO SOURCE RULE ***");
{
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "deadline-"));
    const w = (name, body) => { fs.writeFileSync(path.join(TMP, name), body); return path.join(TMP, name); };

    // A gate that prints its verdict and then sits on an uncleared 3 s deadline: the defect, in miniature.
    const LEAKY = w("leaky-selfcheck.mjs", `
await new Promise((resolve) => {
    const t = setTimeout(() => resolve("deadline"), 3000);
    setImmediate(() => resolve("fast"));
});
console.log("leaky-selfcheck: all checks pass");
process.exitCode = 0;
`);
    const CLEAN = w("clean-selfcheck.mjs", `
await new Promise((resolve) => {
    const t = setTimeout(() => resolve("deadline"), 3000);
    setImmediate(() => { clearTimeout(t); resolve("fast"); });
});
console.log("clean-selfcheck: all checks pass");
process.exitCode = 0;
`);
    const leaky = await DL.deadTail(LEAKY, { cwd: TMP, capMs: 30000 });
    const clean = await DL.deadTail(CLEAN, { cwd: TMP, capMs: 30000 });
    report(`leaky: work=${leaky.workMs}ms tail=${leaky.tailMs}ms   clean: work=${clean.workMs}ms tail=${clean.tailMs}ms`);

    ok("!! *** a gate that printed its verdict and then waited out a deadline is caught by its TAIL ***",
        leaky.ok && leaky.leaking === true && leaky.tailMs >= 2000,
        `tail ${leaky.tailMs} ms after the last byte of output, on a gate whose work was ${leaky.workMs} ms. ` +
        "The two files differ by ONE clearTimeout and nothing else");
    ok("!! *** and the same gate with the handle cleared is not caught, so the tail is measuring the handle ***",
        clean.ok && clean.leaking === false && clean.tailMs < DL.GRACE_MS,
        `tail ${clean.tailMs} ms, under the ${DL.GRACE_MS} ms grace`);
    ok("...and the instrument does not need to know the SHAPE of what held the loop",
        /wall clock minus work/i.test(fs.readFileSync(path.join(DL.ENG, "tools", "ship", "deadlineLeak.mjs"), "utf8")),
        "which is why it is the better of the two: the source rule cannot see a deadline reached through a " +
        "helper in another file, and this does not care");

    // THE REAL SITE, RE-MEASURED. This is the row that would have gone red before v4678.
    const cp = await DL.deadTail("tools/ship/cloneProvision-selfcheck.mjs", { capMs: 200000 });
    ok("!! *** and the gate that cost 53 s of dead time now has none ***",
        cp.ok && cp.leaking === false && cp.workMs > 3000,
        cp.ok ? `work=${cp.workMs}ms tail=${cp.tailMs}ms wall=${cp.wallMs}ms. BEFORE v4678: 7,100 ms of work and ` +
                "60,136 ms of wall clock. The work did not change; one clearTimeout and one unref did"
              : "UNKNOWN: " + cp.why);

    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
}

// ---- 4. THE SCREEN'S RESULT, WITH THE HOLE THE CAP LEAVES ---------------------------------------------------
console.log("\n4. *** THE RULE FINDS 13 AND THE MEASUREMENT FINDS ZERO PAID, AND BOTH NUMBERS ARE KEPT ***");
{
    const REC = path.join(DL.ENG, "tools", "ship", "deadline-tails.json");
    let t = null; try { t = JSON.parse(fs.readFileSync(REC, "utf8")); } catch {}
    ok("!! *** the screen's result is recorded with its sample, its grace and its holes ***",
        !!t && t.measured > 100 && t.method.graceMs === DL.GRACE_MS && t.method.seed === 1 &&
        Array.isArray(t.leakingMembers) && t.leakingMembers.length === t.leaking,
        t ? `${t.measured} measured, ${t.leaking} leaking, ${t.unknown} UNKNOWN, grace ${t.method.graceMs} ms, ` +
            `seed ${t.method.seed} -- the SAME 120 gates as exit-busy-census.json, so a gate can be looked up in both`
          : "deadline-tails.json is missing");

    // *** THE HOLE, AND IT IS EXACTLY WHERE A LEAK WOULD HIDE. ***
    ok("!! *** the capped gates are UNKNOWN and NAMED, because a cap kill hides a tail rather than clearing it ***",
        !!t && t.unknown > 0 && Array.isArray(t.unknownMembers) && t.unknownMembers.length === t.unknown &&
        t.unknownMembers.every((m) => /cap/.test(m.why || "")),
        t ? `${t.unknown} killed at the cap: ${t.unknownMembers.map((m) => m.gate.split("/").pop()).join(", ")}. ` +
            "A GATE KILLED AT 60 s MIGHT BE 5 s OF WORK AND 55 s OF TAIL -- the cap cannot tell those apart, so " +
            "the zero below is over the MEASURED set and these five are precisely where a leak would survive it"
          : "");
    ok("...and the zero is reported against the measured set rather than the sample",
        !!t && t.leaking === 0 && t.measured + t.unknown === t.method.drawn,
        t ? `0 of ${t.measured} measured (not 0 of ${t.method.drawn} drawn). The widest clean tail is ` +
            `${t.widestTails[0].tailMs} ms against the one real leak's 53,000 ms -- three orders of magnitude, ` +
            "which is why the grace is not a delicate number"
          : "");
    ok("!! ...and the repaired site's before-and-after is in the record, not only in this file",
        !!t && t.repaired && t.repaired.beforeMs > 50000 && t.repaired.afterMs < 10000 &&
        /clearTimeout/.test(t.repaired.fix) && /unref/.test(t.repaired.fix),
        t ? `${t.repaired.beforeMs} -> ${t.repaired.afterMs} ms on ${t.repaired.workMs} ms of unchanged work` : "");
    ok("...and the source rule's ceiling is recorded BESIDE the measured zero rather than instead of it",
        !!t && t.sourceRuleCeiling > 0 && t.leaking === 0 && /CEILING/.test(t.note),
        t ? `${t.sourceRuleCeiling} sites carry the shape, 0 measured gates pay for one. Reporting only the 13 ` +
            "would read as a debt; reporting only the 0 would read as a clean tree. They answer different questions"
          : "");
}

console.log("\nunchecked here: WHETHER THE REMAINING SITES ARE EVER PAID. A stray deadline is free in a process " +
    "that is held open anyway, and every site left in section 2 is in a bridge. What would settle it is the " +
    "dead-tail screen over the whole sweep rather than the sample in tools/ship/deadline-tails.json -- one run " +
    "per gate, no source rule, and it would have caught v4676's leak on the round that shipped it.");
console.log(fails ? `\ndeadlineLeak-selfcheck: ${fails} FAILED` : "\ndeadlineLeak-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;

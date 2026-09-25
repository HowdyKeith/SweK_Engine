// WebGLEngine/tools/ship/exitBusy.mjs -- v4677
//
// *** HOW MUCH MAIN-THREAD WORK IS STILL QUEUED AT THE INSTANT A GATE CALLS process.exit(). ***
//
// WHY THIS EXISTS. v4663 converted 48 gates off process.exit() because calling it during a live platform
// teardown trips libuv's `!(handle->flags & UV_HANDLE_CLOSING)` assert on Windows -- a fast-fail AFTER a clean
// scoreline. It picked those 48 by asking DOES THIS GATE COMPILE A WASM MODULE, which is a CAUSE. The defect is
// a SYMPTOM. v4667's clone-verify duly produced four more that compile no wasm, and wasmTeardown-selfcheck
// could only state the population as "at least 52, at most 1708" -- the honest width, and useless as a list.
//
// *** THE FIRST INSTRUMENT I BUILT FOR THIS MEASURED ZERO, AND THAT IS RECORDED HERE RATHER THAN DELETED. ***
// It was a `node --require` hook that patched process.exit to park the main thread with
//     Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300)
// and read process.cpuUsage() across the park. The appeal was that it needs no source edit and exits exactly
// where the gate said to. It reported 0.1-0.2 ms for ALL FOUR gates already known to be busy -- against 7 to
// 104 ms taken by hand. A 500x disagreement, and the hook was the wrong one:
//
//     THE WORK IS ON THE MAIN THREAD. Atomics.wait PARKS the main thread, so queued foreground tasks cannot
//     run, and a window that forbids the work from happening measures the absence of the work. It is the
//     sabotage-that-measures-zero shape, pointed at a measurement.
//
// Proven in one process, at one moment, with all three windows side by side on range-selfcheck:
//     awaited timer, FIRST window   43.9 ms CPU  (35.4 user / 8.5 system), gcCount 0
//     awaited timer, SECOND window   1.1 ms
//     Atomics.wait, parked           0.1 ms
// So: the loop has to be allowed to TURN, the work is a BURST that one turn drains, and it is not GC.
//
// *** WHICH FORCES THE METHOD: A PATCHED COPY, NOT A HOOK. *** An awaited window cannot be reached from inside
// a synchronous process.exit(). A hook could only get one by SWALLOWING the exit and letting the loop drain --
// and then every line after a gate's early bail runs, in a gate that had already decided to stop. That is a
// hook that rewrites the program it is measuring. So the terminal statement is replaced in a COPY written
// beside the original (so every relative import still resolves), and the copy still exits with the gate's own
// verdict. The cost is that only a gate whose LAST STATEMENT is the exit can be screened this way.
//
// WHAT THIS CANNOT SEE, named rather than papered over:
//   * A gate whose process.exit() is NOT its last statement. 360 of 1772 gates end without one at all -- and
//     those are the SAFE shape, not an omission: a gate that falls off the end never calls process.exit() and
//     cannot trip this crash. But a gate that exits from inside a branch is a real gap, and it is counted.
//   * WINDOWS. Every reading is taken on the box that runs it. A busy gate here is a CANDIDATE. The rig's
//     clone-verify is still the only instrument for the fact.
//   * WHY the work is queued. The number says there is a burst, not what put it there.
//
// *** AND THE COPY IS VISIBLE TO THE TREE, WHICH COST A FALSE RED BEFORE IT WAS NOTICED. ***
// tools/ship/wiringClaims-selfcheck.mjs came back BUSY and RED in the first screen. Run by hand it is green.
// The cause is this file: while a gate's copy is on disk, a gate that WALKS THE TREE sees an extra .mjs beside
// the original and adjudicates it. Confirmed by planting a copy by hand and watching the same row go red.
// A walk keyed on the `-selfcheck.mjs` suffix does not see it -- the suffix is `.__exitbusy.mjs` on purpose --
// but a walk over all .mjs files does. The CPU reading is unaffected (the window measures the copy's own
// process), so the classification stands; the EXIT CODE does not, and a screen that quietly reported a gate as
// failing when the instrument made it fail would be worse than no screen. So `measure` can take a BASELINE run
// of the unpatched gate and report `perturbed` when the two exit codes disagree -- the interference named
// rather than left in the data.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const COPY_SUFFIX = ".__exitbusy.mjs";
export const MARKER = "[[EXITBUSY]]";

/** The last statement, if it is a terminal verdict exit. `expr` is the code the gate exits WITH, so the copy
 *  can carry the same verdict and the runner can report whether the gate passed as well as how busy it was. */
export function terminalExit(src) {
    const s = String(src || "").trimEnd();
    let m = /process\.exit\s*\(([^()]*)\)\s*;?$/.exec(s);
    if (m) return { kind: "process.exit", expr: m[1].trim() || "0", cut: s.length - m[0].length };
    m = /process\.exitCode\s*=\s*([^;\n]*);?$/.exec(s);
    if (m) return { kind: "process.exitCode", expr: m[1].trim() || "0", cut: s.length - m[0].length };
    return null;
}

/**
 * The probe that replaces the terminal statement. THREE windows, and the second two are the controls:
 *   win1   -- an awaited 300 ms window starting where the gate wanted to leave. The reading.
 *   win2   -- the SAME window again. A burst shows up as win1 >> win2; a steady background cost as win1 ~ win2,
 *             which is a different animal and must not be reported as a teardown hazard.
 *   parked -- Atomics.wait over the same span. Near zero by construction, and it is here so the next reader can
 *             see WHY the obvious hook does not work rather than having to rediscover it.
 */
export function probeFor(expr, windowMs = 300) {
    return `
{
    const __win = async () => {
        const c = process.cpuUsage();
        await new Promise((r) => setTimeout(r, ${windowMs}));
        const d = process.cpuUsage(c);
        return { cpuMs: (d.user + d.system) / 1000, userMs: d.user / 1000, systemMs: d.system / 1000 };
    };
    const __w1 = await __win();
    const __w2 = await __win();
    const __ia = new Int32Array(new SharedArrayBuffer(4));
    const __c3 = process.cpuUsage();
    Atomics.wait(__ia, 0, 0, ${windowMs});
    const __d3 = process.cpuUsage(__c3);
    console.log("${MARKER} " + JSON.stringify({
        win1: __w1, win2: __w2, parkedMs: (__d3.user + __d3.system) / 1000, windowMs: ${windowMs},
        node: process.version, platform: process.platform,
    }));
}
process.exit(${expr});
`;
}

/** Delete any probe copy a killed run left in the tree. Called before AND after a sweep: a stray copy is a
 *  fixture, fixtureLitter is right to hunt them, and one left behind would be imported by nothing but would
 *  still show up in a git status and in the next boundary walk. */
export function sweepStrays(root = ENG) {
    const gone = [];
    const walk = (dir) => {
        let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.name === "node_modules" || e.name === ".git" || e.name === "vendor" || e.name === "GPU_Assets") continue;
            const q = path.join(dir, e.name);
            if (e.isDirectory()) walk(q);
            else if (e.name.endsWith(COPY_SUFFIX)) { try { fs.unlinkSync(q); gone.push(q); } catch {} }
        }
    };
    walk(root);
    return gone;
}

/**
 * Measure one gate. Returns a row whose `ok:false` means UNKNOWN and never "quiet" -- a gate killed at the cap,
 * or one that crashed before the probe, has no reading, and v4663's own notes are about a screen that turned a
 * missing measurement into a clean bill.
 */
export function measure(gateRel, { capMs = 90000, windowMs = 300, cwd = ENG, withBaseline = false } = {}) {
    const opts_withBaseline = withBaseline;
    const abs = path.join(cwd, gateRel);
    let src;
    try { src = fs.readFileSync(abs, "utf8"); } catch (e) { return { gate: gateRel, ok: false, why: "unreadable" }; }
    const t = terminalExit(src);
    if (!t) return { gate: gateRel, ok: false, why: "no terminal exit statement", screenable: false };

    const copy = abs.replace(/\.mjs$/, COPY_SUFFIX);
    const body = src.trimEnd().slice(0, t.cut) + probeFor(t.expr, windowMs);
    let r;
    try {
        fs.writeFileSync(copy, body);
        const t0 = Date.now();
        r = spawnSync(process.execPath, [copy], { cwd, timeout: capMs, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
        r.wallMs = Date.now() - t0;
    } catch (e) {
        return { gate: gateRel, ok: false, why: "spawn failed: " + ((e && e.message) || e), screenable: true };
    } finally { try { fs.unlinkSync(copy); } catch {} }

    // Located by indexOf, not by a built regex: MARKER is all bracket characters, and the first spelling of this
    // line built a pattern out of it that threw "unterminated character class" on every call.
    const all = (r.stdout || "") + "\n" + (r.stderr || "");
    const at = all.lastIndexOf(MARKER + " ");
    const hit = at < 0 ? null : [null, all.slice(at + MARKER.length + 1).split("\n")[0]];
    if (!hit) {
        return { gate: gateRel, ok: false, screenable: true, kind: t.kind, wallMs: r.wallMs,
                 why: r.signal ? "killed at the " + capMs + " ms cap (" + r.signal + ")"
                               : "no marker; the gate exited " + r.status + " before the probe" };
    }
    let m; try { m = JSON.parse(hit[1]); } catch { return { gate: gateRel, ok: false, screenable: true, why: "marker unparseable" }; }
    const base = opts_withBaseline ? baselineExit(gateRel, { capMs, cwd }) : undefined;
    return {
        gate: gateRel, ok: true, screenable: true, kind: t.kind,
        baseExitCode: base,
        perturbed: base === undefined ? undefined : base !== r.status,
        win1Ms: m.win1.cpuMs, win2Ms: m.win2.cpuMs, parkedMs: m.parkedMs,
        userMs: m.win1.userMs, systemMs: m.win1.systemMs,
        windowMs: m.windowMs, exitCode: r.status, wallMs: r.wallMs, node: m.node, platform: m.platform,
    };
}

/** Run the gate UNPATCHED and report only its status, so a screen can tell a gate that was already red from
 *  one this instrument made red. Cheap enough to spend on the members that matter. */
export function baselineExit(gateRel, { capMs = 90000, cwd = ENG } = {}) {
    const r = spawnSync(process.execPath, [gateRel], { cwd, timeout: capMs, stdio: "ignore" });
    return r.signal ? null : r.status;
}

/** *** THE LINE, STATED WITH ITS ARGUMENT RATHER THAN CHOSEN. ***
 *  BUSY means a BURST: the first window costs real CPU and the second does not, so the work was queued and one
 *  turn of the loop drained it -- which is exactly the state process.exit() destroys mid-flight.
 *  FLOOR_MS is 5: the quietest gates measured on this box read 0.1-1.1 ms, and the four gates the rig actually
 *  crashed on read 7.0 ms at the lowest. 5 sits between those two, and it is a reading of THIS box, not a law.
 *  RATIO is 5: a gate whose second window costs as much as its first has a STEADY cost, not a teardown burst,
 *  and calling that the same defect would put the wrong gates on the list. */
export const FLOOR_MS = 5;
export const RATIO = 5;

/**
 * *** AND "late" IS HERE BECAUSE THE FIRST SCREEN FOUND IT, NOT BECAUSE IT WAS DESIGNED IN. ***
 * Two of 114 gates measured a BUSIER SECOND WINDOW than first -- probeLab 2.4 then 36.7 ms, fsrGPU 1.0 then
 * 15.3. Their work is queued but does not start inside the first 300 ms. Under a floor-on-win1 rule they read
 * QUIET, which is the wrong answer twice over: they are not quiet, and filing them as quiet would have made the
 * population estimate look tighter than it is. So they get their own name, and the estimate is stated as a
 * FLOOR: a single window can only under-read a burst that has not begun.
 */
export function classify(row) {
    if (!row || !row.ok) return "unknown";
    const busy1 = row.win1Ms >= FLOOR_MS, busy2 = row.win2Ms >= FLOOR_MS;
    if (busy1 && row.win1Ms >= RATIO * Math.max(row.win2Ms, 0.2)) return "busy";
    if (busy1 && busy2) return "steady";
    if (busy1) return "busy";
    if (busy2) return "late";
    return "quiet";
}

/** Every gate in the tree, by the tree's own definition of one (the -selfcheck.mjs suffix buildKnowledgeIndex
 *  uses). Names only, no lexing. */
export function allGates(dir = ENG, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === ".git" || e.name === "vendor" || e.name === "GPU_Assets") continue;
        const q = path.join(dir, e.name);
        if (e.isDirectory()) allGates(q, out);
        else if (/-selfcheck\.mjs$/.test(e.name)) out.push(path.relative(ENG, q).split(path.sep).join("/"));
    }
    return out;
}

/** A SEEDED sample, so the next reader gets the same gates and can check the number rather than take it.
 *  mulberry32 is the tree's generator -- the same one skillbookBridge exports. */
export function pickSample(gates, n, seed = 1) {
    let a = (seed | 0) + 0x6D2B79F5;
    const rnd = () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pool = gates.slice();
    const out = [];
    while (out.length < n && pool.length) out.push(...pool.splice(Math.floor(rnd() * pool.length), 1));
    return out;
}

/** A Wilson score interval, so the estimate carries its width instead of a bare fraction. A proportion from a
 *  sample of 150 read as a point estimate is a number without its provenance. */
export function wilson(k, n, z = 1.96) {
    if (!n) return { lo: 0, hi: 1, p: 0 };
    const p = k / n, d = 1 + (z * z) / n;
    const c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    return { p, lo: Math.max(0, (c - m) / d), hi: Math.min(1, (c + m) / d) };
}

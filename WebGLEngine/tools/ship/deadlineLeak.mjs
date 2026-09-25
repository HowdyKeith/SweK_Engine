// WebGLEngine/tools/ship/deadlineLeak.mjs -- v4678
//
// *** A DEADLINE TIMER WHOSE HANDLE IS THROWN AWAY HOLDS THE EVENT LOOP FOR ITS FULL LENGTH, AND IN A SERVER
// THAT IS INVISIBLE. ***
//
// FOUND BY ASKING WHY A GATE DECLARED 200 ms AND TOOK 60 s. ai-bridge/sourceChainBridge.js's resolver probe
// wrapped a spawn in a promise and wrote
//
//     setTimeout(() => fin({ ok: false, reason: "...did not answer in 60 s" }), 60000);
//
// with the handle discarded. `fin` is once-only, so the late fire was HARMLESS -- the verdict was already
// resolved and the temp dir already cleaned. What it was not is FREE: the timer kept the loop alive for the
// whole sixty seconds after the answer arrived. MEASURED on tools/ship/cloneProvision-selfcheck.mjs:
//
//     before   60,136 ms wall, of which 7,100 ms was work        (8.4x, and 53 s of it dead)
//     after     7,158 ms wall
//
// The sweep's per-gate budget is 3,000 ms, so that one uncleared handle put a gate twenty times over budget for
// no computation at all -- and no row could see it, because every check the gate makes passed the whole time.
//
// *** WHICH SHAPE IS THE DEFECT, AND WHICH LOOKS IDENTICAL AND IS NOT. *** A discarded setTimeout handle is
// ordinary and correct in most of this tree: a poll that means to keep running (kaggleBridge's job poller,
// tunnelRegistry's tick, gpuBrainBridge's 250 ms poll), a deliberately delayed retry (portHandoff re-listening
// after a second), a pulse that restores state (ballAlerts). Those timers are SUPPOSED to hold the loop, or
// live in a process that is held open anyway.
//
// The defect is narrower and is decidable by reading:
//
//     1. the setTimeout sits INSIDE a `new Promise(...)` executor, and
//     2. its callback calls a SETTLE-ONCE function -- resolve/reject, or a named wrapper guarded by a flag, and
//     3. the promise has ANOTHER settle path (an exit/error/data listener, another callback), so the deadline
//        is a fallback rather than the only way out, and
//     4. the handle is neither assigned to a variable nor `.unref()`-ed.
//
// Point 3 is what separates a leak from a plain delay: if the timeout is the ONLY settle path, nothing is being
// held open that was not going to be held anyway. Point 4 is the repair, and there are two of them -- clearing
// depends on the settle path being reached, unref'ing does not, and the fixed site does both.
//
// WHAT THIS CANNOT SEE, named rather than papered over:
//   * A leak reached through a helper -- `withDeadline(p, ms)` in another file -- since the rule is per-function.
//   * setInterval. The same argument applies and the tree's intervals are mostly deliberate pollers; they are
//     counted separately and not called findings.
//   * WHETHER THE HOLD IS PAID. A stray deadline in a long-running bridge costs nothing observable. The cost
//     lands on short-lived processes: gates, CLI tools, the ship sweep. So a finding here is a CANDIDATE, and
//     the number that settles it is a gate's wall clock against its work.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly } from "./sourceScan.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Every .js/.mjs under the engine that is not vendored. */
export function sourceFiles(root = ENG, out = []) {
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === ".git" || e.name === "vendor" || e.name === "GPU_Assets") continue;
        const q = path.join(root, e.name);
        if (e.isDirectory()) sourceFiles(q, out);
        else if (/\.(js|mjs|cjs)$/.test(e.name)) out.push(path.relative(ENG, q).split(path.sep).join("/"));
    }
    return out;
}

/** The `new Promise(` executor bodies in a source, by brace matching from the opening paren. */
export function promiseBodies(code) {
    const out = [];
    const re = /new Promise\s*\(/g;
    let m;
    while ((m = re.exec(code))) {
        let depth = 0, i = m.index + m[0].length - 1, start = i;
        for (; i < code.length; i++) {
            const c = code[i];
            if (c === "(") depth++;
            else if (c === ")") { depth--; if (depth === 0) break; }
        }
        if (depth === 0) out.push({ at: m.index, body: code.slice(start + 1, i) });
    }
    return out;
}

/**
 * The finding rule, applied to ONE promise executor body.
 * @returns null, or { ms, callee, otherSettlePaths } -- ms is null when the delay is not a literal.
 */
export function leakIn(body) {
    // A discarded handle: `setTimeout(` not preceded by `= ` and not followed by `.unref()` on the same call.
    const calls = [];
    const re = /(^|[^.\w])setTimeout\s*\(/g;
    let m;
    while ((m = re.exec(body))) {
        const before = body.slice(Math.max(0, m.index - 40), m.index + m[1].length);
        if (/[=:]\s*$/.test(before) || /\breturn\s*$/.test(before) || /\bawait\s*$/.test(before)) continue;
        // brace-match the call
        let depth = 0, i = m.index + m[0].length - 1, start = i;
        for (; i < body.length; i++) {
            const c = body[i];
            if (c === "(") depth++;
            else if (c === ")") { depth--; if (depth === 0) break; }
        }
        if (depth !== 0) continue;
        const call = body.slice(start + 1, i);
        if (/\.unref\s*\(\s*\)/.test(body.slice(i, i + 20))) continue;   // setTimeout(...).unref()
        calls.push(call);
    }
    if (!calls.length) return null;

    // Which settle functions does this executor have? `resolve`/`reject` by name, plus a once-only wrapper:
    // a local function guarded by a boolean that then calls resolve.
    const wrappers = new Set(["resolve", "reject"]);
    for (const w of body.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*\bif\s*\(\s*\w+\s*\)\s*return\s*;/g))
        wrappers.add(w[1]);
    for (const w of body.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]{0,400}?\bresolve\s*\(/g))
        wrappers.add(w[1]);

    for (const call of calls) {
        const named = [...wrappers].find((w) => new RegExp("\\b" + w + "\\s*\\(").test(call));
        if (!named) continue;
        // Point 3: is there ANOTHER settle path outside this timeout callback?
        const rest = body.split(call).join("");
        const others = [...wrappers].reduce((n, w) => n + (rest.match(new RegExp("\\b" + w + "\\s*\\(", "g")) || []).length, 0);
        if (others === 0) continue;   // the deadline is the ONLY way out: not a leak
        const msM = /,\s*(\d[\d_]*)\s*\)?\s*$/.exec(call) || /,\s*([A-Za-z_$][\w$.|? ]*\|\|\s*(\d[\d_]*))\s*$/.exec(call);
        const ms = msM ? Number(String(msM[2] || msM[1]).replace(/_/g, "")) : null;
        return { ms: Number.isFinite(ms) ? ms : null, callee: named, otherSettlePaths: others };
    }
    return null;
}

/** The tree, scanned. Comment-stripped, because every file repaired by this round explains the defect in prose
 *  that contains the pattern -- including this one. */
export function scan(root = ENG) {
    const found = [];
    for (const rel of sourceFiles(root)) {
        let code;
        try { code = codeOnly(fs.readFileSync(path.join(root, rel), "utf8")); } catch { continue; }
        if (!code.includes("setTimeout")) continue;
        for (const p of promiseBodies(code)) {
            const hit = leakIn(p.body);
            if (hit) found.push({ file: rel, ...hit });
        }
    }
    return { files: sourceFiles(root).length, found: found.sort((a, b) => (b.ms || 0) - (a.ms || 0)) };
}

/**
 * *** THE DEAD TAIL: WALL CLOCK MINUS WORK, MEASURED BY RUNNING. ***
 *
 * The source rule above is decidable and incomplete -- it cannot see a deadline reached through a helper in
 * another file, and it cannot tell a stray timer that costs nothing from one that costs a minute. This can. It
 * times from a gate's LAST BYTE OF OUTPUT to its process exit. A gate that has printed its verdict and then
 * sits there is paying for a handle nobody released, whatever shape that handle has.
 *
 * It is the instrument that would have found v4676's leak on the round that shipped it, and it costs one run.
 *
 * NOT A LEAK: a gate whose final work produces no output (a long teardown, an awaited flush) has a real tail.
 * So a tail is a CANDIDATE, and `graceMs` is the line below which nothing is reported -- 250 ms, which is above
 * every clean gate measured on this box (3-6 ms) and far below the 53,000 ms the one real leak cost.
 */
export const GRACE_MS = 250;
export function deadTail(gateRel, { capMs = 200000, cwd = ENG, spawn } = {}) {
    const sp = spawn || require_spawn();
    return new Promise((resolve) => {
        const t0 = Date.now();
        let last = t0, settled = false, killTimer = null;
        const child = sp(process.execPath, [gateRel], { cwd });
        const done = (v) => { if (settled) return; settled = true; if (killTimer) clearTimeout(killTimer); resolve(v); };
        if (child.stdout) child.stdout.on("data", () => { last = Date.now(); });
        if (child.stderr) child.stderr.on("data", () => { last = Date.now(); });
        child.on("error", (e) => done({ gate: gateRel, ok: false, why: String((e && e.message) || e) }));
        child.on("exit", (code) => {
            const wall = Date.now() - t0, work = last - t0;
            done({ gate: gateRel, ok: true, workMs: work, tailMs: wall - work, wallMs: wall, exitCode: code,
                   leaking: (wall - work) >= GRACE_MS });
        });
        // The cap is cleared on settle -- which is the defect this whole file is about, so it is not left leaking
        // here. And the kill is RE-CHECKED rather than assumed: boundaryLint's KILL_NOT_VERIFIED is right that a
        // signal sent is not a process gone, and the whole point of this instrument is that a process outliving
        // its apparent end is a thing that happens. `killed` is read off the child's own exit event.
        killTimer = setTimeout(() => {
            let dead = false;
            child.once("exit", () => { dead = true; });
            try { child.kill("SIGKILL"); } catch {}
            const settleAfterKill = setTimeout(() => done({
                gate: gateRel, ok: false, killed: dead,
                why: "killed at the " + capMs + " ms cap" + (dead ? "" : " AND STILL RUNNING after SIGKILL"),
            }), 500);
            if (settleAfterKill.unref) settleAfterKill.unref();
        }, capMs);
        if (killTimer.unref) killTimer.unref();
    });
}
function require_spawn() { return spawnRef; }
import { spawn as spawnRef } from "node:child_process";

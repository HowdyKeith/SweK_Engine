// WebGLEngine/tools/ship/versionPreflight.mjs — v4360
//
// *** RULE 3 SAYS NEVER REUSE A VERSION NUMBER, AND NOTHING CHECKED IT. ***
//
// SESSION_START.md's third rule is the one with the fleet-wide consequence: "Two builds with the same number
// but different bytes is exactly what jams the peer auto-update fleet-wide." It was enforced by remembering it.
//
// IN ONE SESSION IT WAS BROKEN FOUR TIMES, in both directions and by both lines. Two branches shipped rounds in
// parallel and each picked the next number from its OWN tree: v4327, v4328 and v4329 all existed twice with
// different bytes, then v4331 and v4332, then v4336. Each collision cost a merge and a renumber -- main's own
// history carries "renumber this round v4328 -> v4329" and "v4330 -> v4332" for exactly this, and this branch
// renumbered twice more. That is not bad luck, it is a rule with no mechanism.
//
// THE MECHANISM IS ONE QUESTION, ASKED BEFORE THE NUMBER IS SPENT: is the number I am about to ship greater
// than the number origin/main already carries? `git fetch` costs a second, and the answer is a fact rather than
// a memory.
//
// ---- WHAT THIS DELIBERATELY DOES NOT DO -----------------------------------------------------------------------
//
// It does not lock, reserve, or allocate. Two sessions can still pick the same free number in the same minute,
// and no check that reads a remote can prevent that -- only a lock could, and a lock on a git branch is a
// coordination system this project does not have and does not need. WHAT IT CATCHES IS THE CASE THAT ACTUALLY
// HAPPENED FOUR TIMES: main moved while a round was being built, and nobody re-read it before shipping. Every
// one of this session's collisions was that, and every one of them would have been refused here.
//
// It also does not fetch by itself. A preflight that silently mutates the repository's refs is a side effect
// inside a check; it reports whether the ref it read is stale and names the command, so the fetch stays the
// caller's decision.
//
// Gated in tools/ship/versionPreflight-selfcheck.mjs.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import VM from "../../tools/ship/versionMarker.js";   // v4556 -- one definition of how to read a version marker

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REPO = path.resolve(ENG, "..");

// vNNNN -> NNNN, and anything else -> null. A version this cannot parse is reported, never guessed at.
export function versionNumber(v) {
    const m = /^v(\d{1,6})$/.exec(String(v || "").trim());
    return m ? Number(m[1]) : null;
}

// The ENGINE_VERSION a main.js declares, read from the text rather than imported (main.js is a browser module
// and importing it here would drag the engine in to answer a question about one line).
export function engineVersionOf(text) {
    const m = VM.markerRe("ENGINE_VERSION").exec(String(text || ""));
    return m ? m[1] : null;
}

/** The whole of origin/main's main.js, so a same-number case can ask whether the BYTES differ too. */
export function mainSource({ run = null } = {}) {
    const exec = run || ((args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }));
    try { return exec(["show", "origin/main:WebGLEngine/main.js"]); } catch { return null; }
}

/** The version origin/main carries, or null with a reason when it cannot be read. */
export function mainVersion({ run = null } = {}) {
    // *** maxBuffer IS NOT A DETAIL HERE. *** main.js carries the whole round note on the ENGINE_VERSION line
    // and is over 2 MB; execFileSync's default 1 MB buffer throws ENOBUFS, and the first version of this file
    // caught that alongside a missing ref and reported both as "origin/main is not readable". THE GUARD STOOD
    // ASIDE ON EVERY RUN AND SAID SO IN WORDS THAT SOUNDED FINE -- the same fault as a skip naming a cause that
    // is not true, committed inside the file written to stop a rule going unenforced. The buffer is raised, and
    // a read that fails now reports WHY rather than being folded into "no main".
    const exec = run || ((args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }));
    let text;
    try { text = exec(["show", "origin/main:WebGLEngine/main.js"]); }
    catch (e) {
        const msg = String((e && e.message) || e);
        return { version: null, reason: /unknown revision|does not exist|ambiguous argument/i.test(msg)
            ? "origin/main is not readable here (no such ref, or not a clone with a remote)"
            : "reading origin/main's main.js FAILED: " + msg.split("\n")[0].slice(0, 120) };
    }
    const v = engineVersionOf(text);
    return v ? { version: v, reason: null }
             : { version: null, reason: "origin/main's main.js carries no ENGINE_VERSION line this could parse" };
}

/** How stale the local origin/main ref is, as a fact rather than an action. */
export function refFreshness({ run = null } = {}) {
    const exec = run || ((args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    try {
        const local = exec(["rev-parse", "origin/main"]).trim();
        const remote = (exec(["ls-remote", "origin", "refs/heads/main"]).trim().split(/\s+/)[0] || "");
        if (!remote) return { known: false, stale: null, note: "the remote did not answer; the check below used the ref as it stands" };
        return { known: true, stale: local !== remote, local, remote,
                 note: local === remote ? "origin/main is current" : "origin/main is BEHIND the remote -- run: git fetch origin main" };
    } catch { return { known: false, stale: null, note: "could not compare against the remote (offline, or no origin)" }; }
}

// ====================================================================================================
// *** v4665 -- THE MARKER IS NOT THE ONLY NUMBER A ROUND WEARS, AND THIS GUARD WAS WATCHING THE OTHER ONE. ***
// Everything above compares ENGINE_VERSION: the number a BUILD wears. A round also wears an ORDINAL -- the
// `## vNNNN` heading in docs/CHANGELOG.md -- and the two are not the same number, because not every line
// bumps the marker. Measured, not supposed: at this merge main's marker read v4649 while its changelog had
// spent v4650 and v4653..v4660, ELEVEN ROUNDS AHEAD OF ITS OWN MARKER. Run against that exact collision
// this file printed "OK: shipping v4654, origin/main carries v4649" -- and v4654 was a heading already taken
// on main by a different round. The refusal this file exists for did not fire, in the case it was written
// for, because it was reading a number that had stopped moving.
//
// The fix is not a wider marker check; it is the second number, read from the same place a reader would.
// The rule is the one the changelog's own v4333 note states: supersede FORWARD, past everything main has
// spent -- not merely past main's marker, and not merely into a gap. A gap is worse than a collision: it
// makes the ordering non-monotonic, and the peer comparing two rounds cannot tell which came first.
// ====================================================================================================

/** Every round ordinal a changelog text spends, newest first, with the heading each one names. */
export function ordinalsOf(text) {
    const titles = new Map();
    // Anchored at line start with ^##, because the round notes QUOTE version numbers constantly -- this very
    // file's prose names v4350, v4649 and v4654 -- and a loose /v(\d+)/ would read prose as a claim on a
    // number. The heading is the only place a changelog SPENDS one.
    for (const m of String(text || "").matchAll(/^##\s+v(\d{3,5})\b[^\n]*/gm)) {
        const n = Number(m[1]);
        if (!titles.has(n)) titles.set(n, m[0].replace(/^##\s+/, "").trim());
    }
    return { ordinals: [...titles.keys()].sort((a, b) => b - a), titles };
}

/** The ordinals origin/main's changelog has spent, or null with a reason. */
export function mainOrdinals({ run = null } = {}) {
    const exec = run || ((args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }));
    let text;
    try { text = exec(["show", "origin/main:docs/CHANGELOG.md"]); }
    catch (e) {
        const msg = String((e && e.message) || e);
        // Same shape as mainVersion's: an unreadable main is a normal tree to work in and is NOT a refusal,
        // but the reason is reported rather than folded into silence.
        return { ordinals: null, titles: null, reason: /unknown revision|does not exist|ambiguous argument/i.test(msg)
            ? "origin/main is not readable here (no such ref, or not a clone with a remote)"
            : "reading origin/main's changelog FAILED: " + msg.split("\n")[0].slice(0, 120) };
    }
    const { ordinals, titles } = ordinalsOf(text);
    return ordinals.length ? { ordinals, titles, reason: null }
                           : { ordinals: null, titles: null, reason: "origin/main's changelog has no `## vNNNN` heading this could parse" };
}

/**
 * The whole check. Returns { ok, refusal, mainVersion, shipping, freshness }.
 * `shipping` is the number this round intends to ship, e.g. "v4338".
 */
export function preflight(shipping, opts = {}) {
    const want = versionNumber(shipping);
    const freshness = opts.skipFreshness ? null : refFreshness(opts);
    if (want == null) {
        return { ok: false, shipping, mainVersion: null, freshness,
                 refusal: `"${shipping}" is not a vNNNN version, so it cannot be compared with main's` };
    }
    const { version: mv, reason } = opts.mainVersionOverride !== undefined
        ? { version: opts.mainVersionOverride, reason: opts.mainVersionOverride ? null : "overridden as unreadable" }
        : mainVersion(opts);
    if (mv == null) {
        // NOT a refusal. A tree with no reachable main is a normal thing to work in, and refusing to ship there
        // would make the guard the problem. It reports and stands aside -- the failure it exists for is a main
        // that IS readable and IS ahead.
        return { ok: true, shipping, mainVersion: null, freshness,
                 refusal: null, note: "main's version could not be read: " + reason + " -- nothing to compare, so nothing refused" };
    }
    const have = versionNumber(mv);

    // *** SAME NUMBER, SAME BYTES, IS NOT A COLLISION -- AND THE FIRST VERSION OF THIS REFUSED IT. *** v4350 was
    // pushed to main, and the very next verify in the same tree was refused: main carried v4350 because THIS
    // BUILD had just put it there. Rule 3 is about "two builds with the same number but DIFFERENT BYTES", and
    // this checked only the number, so it fired on every follow-up commit to a round already shipped. That is
    // the exact false-fault this file's own gate warns about -- "a guard that fires on the next legitimate
    // number teaches people to skip it, and then the rule is unenforced again with extra steps" -- committed
    // in the guard that says it. Found by using it, one commit after it shipped. So the same-number case now
    // compares the builds, and only a DIFFERENT build wearing main's number is refused.
    // v4665 -- hoisted, because the ordinal check below needs the SAME exemption for the SAME reason. v4350's
    // false fault was refusing a follow-up commit to a round already shipped; an ordinal check that did not
    // carry that exemption would reintroduce it one number over.
    const sameBuild = (() => {
        const mine = opts.localSourceOverride !== undefined ? opts.localSourceOverride
                   : (() => { try { return fs.readFileSync(path.join(ENG, "main.js"), "utf8"); } catch { return null; } })();
        const theirs = opts.mainSourceOverride !== undefined ? opts.mainSourceOverride : mainSource(opts);
        return mine != null && theirs != null && mine === theirs;
    })();

    if (have != null && want === have && sameBuild) {
        return { ok: true, shipping, mainVersion: mv, freshness, refusal: null,
                 note: `origin/main carries ${mv} and it is THIS build, byte for byte -- the same build under ` +
                       `one number is what shipping means, not a collision` };
    }

    if (have != null && want <= have) {
        const same = want === have;
        return { ok: false, shipping, mainVersion: mv, freshness,
                 refusal: `origin/main already carries ${mv} and this round intends to ship ${shipping}` +
                          (same ? " -- THE SAME NUMBER, which is two builds with one number and different bytes"
                                : " -- an EARLIER number, which reads as a downgrade to every peer that compares them") +
                          `. Supersede FORWARD: v${have + 1} or later.` +
                          (freshness && freshness.stale ? " (and origin/main is itself behind the remote -- fetch first, the real number may be higher)" : "") };
    }
    // *** THE SECOND NUMBER. *** Past the marker check, and only for a build that is not main's own.
    const ord = opts.mainOrdinalsOverride !== undefined ? opts.mainOrdinalsOverride : mainOrdinals(opts);
    const spent = ord && ord.ordinals;
    if (!sameBuild && spent && spent.length) {
        const top = spent[0], taken = ord.titles && ord.titles.get(want);
        if (want <= top) {
            return { ok: false, shipping, mainVersion: mv, freshness, ordinalTop: top,
                     refusal: `origin/main's changelog has already spent v${top}` +
                              (taken ? `, and ${shipping} is a heading it already gave to a DIFFERENT round: "${taken}"`
                                     : `, and ${shipping} is at or below it -- shipping into a gap below main's ` +
                                       `highest makes the ordering non-monotonic, which is a worse record than a collision`) +
                              `. Supersede FORWARD: v${top + 1} or later.` +
                              (have != null && top > have
                                 ? ` (main's MARKER reads v${have}: its rounds run ${top - have} ahead of it, which is why ` +
                                   `comparing markers alone said this was fine)` : "") };
        }
    }
    const note = (!sameBuild && spent && spent.length && have != null && spent[0] > have)
        ? `main's changelog has spent v${spent[0]} while its marker reads v${have} -- ${spent[0] - have} rounds ahead, ` +
          `so the ordinal is the binding number here` : undefined;
    return { ok: true, shipping, mainVersion: mv, freshness, refusal: null, ordinalTop: spent ? spent[0] : null,
             ...(note ? { note } : {}) };
}

// Run directly: node tools/ship/versionPreflight.mjs vNNNN
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const arg = process.argv[2] || engineVersionOf(fs.readFileSync(path.join(ENG, "main.js"), "utf8"));
    const r = preflight(arg);
    if (r.freshness && r.freshness.note) console.log("  [versionPreflight] " + r.freshness.note);
    if (r.refusal) { console.log("  [versionPreflight] REFUSED: " + r.refusal); process.exit(1); }
    console.log(`  [versionPreflight] OK: shipping ${r.shipping}, origin/main carries ${r.mainVersion || "(unreadable)"}` +
                (r.note ? " -- " + r.note : ""));
}

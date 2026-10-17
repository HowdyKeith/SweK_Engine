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
import { parseArgs, refusalLines } from "./cliArgs.mjs";   // v4871 -- the CLI grew an option, so it reads argv the tree's one way

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

// ====================================================================================================
// *** v4846 -- WHETHER origin/main EXISTS IS A QUESTION FOR GIT'S EXIT STATUS, AND THIS FILE ASKED ITS WORDS. ***
// mainVersion and mainOrdinals decided "no such ref" by testing the thrown message against
// /unknown revision|does not exist|ambiguous argument/ -- while their own exec IGNORED STDERR, so the message
// never carried a word git said; it was always "Command failed: git show ...". And git's wording for this case
// is none of the three anyway: it is "fatal: invalid object name 'origin/main'." Measured on the rig in a
// `git clone --depth 1 --branch <feature>` clone, which fetches its own branch and nothing else: the reason
// came back "reading origin/main's main.js FAILED: Command failed: git show origin/main:WebGLEngine/main.js"
// and section 5 of the gate went red. refFreshness folded the same missing LOCAL ref into "could not compare
// against the remote (offline, or no origin)", which names the network for a fault that is in the clone.
//
// So absence is ASKED first, of the one command whose exit status answers it: rev-parse --verify --quiet exits
// 1 for a name that does not resolve, silently. Any other failure (128 is git's die(): no repository, a broken
// one) is a different fact and is reported in git's own first stderr line, never as a ref to go and fetch.
// And when the ref IS there and the read still fails, stderr is now piped so the reason is git's sentence.
// ====================================================================================================

/** The command that puts origin/main into a clone that lacks it -- named in every reason that says so. */
export const FETCH_MAIN = "git fetch --depth 1 origin main:refs/remotes/origin/main";
export const ABSENT_REASON = "origin/main is not in this clone (a --branch or --single-branch clone fetches only its own branch) -- run: " + FETCH_MAIN;

/** The git runner the readers below default to: stderr PIPED, so a failure carries git's own sentence. */
export function gitRunner(cwd = REPO, extra = {}) {
    return (args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], ...extra });
}

// git's own first stderr line out of a thrown failure; the error's first line only when git said nothing
// (ENOBUFS, a spawn that never started, an injected hook that threw a plain Error).
function gitLine(e) {
    const said = String((e && e.stderr) || "").split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    return (said || String((e && e.message) || e).split("\n")[0]).slice(0, 160);
}

/**
 * Is refs/remotes/origin/main in this clone? Decided by EXIT STATUS: { present: true, sha } when the probe
 * exits 0, { present: false, absent: true } when it exits 1, and { present: false, absent: false, reason }
 * for anything else. An injected run hook reports a failed command the way execFileSync does -- by throwing
 * an error that carries .status (and .stderr) -- so a fixture that answers every call still reads as present.
 */
export function originMainRef(exec) {
    try { return { present: true, sha: String(exec(["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main^{commit}"]) || "").trim() }; }
    catch (e) {
        if (e && e.status === 1) return { present: false, absent: true };
        return { present: false, absent: false, reason: "git could not be asked whether origin/main exists: " + gitLine(e) };
    }
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
    // v4846 -- and WHY is git's own sentence: absence is asked of the probe's exit status first, and a present
    // ref whose read still fails reports the first line git wrote to stderr, which is now piped rather than
    // ignored. (The message regex this replaced never matched: it read a message git's words were not in.)
    const exec = run || gitRunner();
    const ref = originMainRef(exec);
    if (!ref.present) return { version: null, absent: ref.absent, reason: ref.absent ? ABSENT_REASON : ref.reason };
    let text;
    try { text = exec(["show", "origin/main:WebGLEngine/main.js"]); }
    catch (e) { return { version: null, absent: false, reason: "reading origin/main's main.js FAILED: " + gitLine(e) }; }
    const v = engineVersionOf(text);
    return v ? { version: v, absent: false, reason: null }
             : { version: null, absent: false, reason: "origin/main's main.js carries no ENGINE_VERSION line this could parse" };
}

/** How stale the local origin/main ref is, as a fact rather than an action. */
export function refFreshness({ run = null } = {}) {
    // v4846 -- SPLIT, because one catch named the network for every failure. A clone with no LOCAL origin/main
    // has nothing to compare, and the cure is a fetch into that ref (named); a remote that cannot be reached is
    // a different fact with a different cure, reported in git's own words. `cause` says which, so a caller can
    // branch on it rather than on prose: "absent", "git", "unreachable", "no-remote-main".
    const exec = run || gitRunner();
    const ref = originMainRef(exec);
    if (!ref.present) {
        return { known: false, stale: null, cause: ref.absent ? "absent" : "git",
                 note: ref.absent ? ABSENT_REASON + " -- there is no local ref to compare with the remote" : ref.reason };
    }
    let remote;
    try { remote = (String(exec(["ls-remote", "origin", "refs/heads/main"]) || "").trim().split(/\s+/)[0] || ""); }
    catch (e) {
        return { known: false, stale: null, cause: "unreachable",
                 note: "the remote could not be reached (offline, or no origin remote): " + gitLine(e) +
                       " -- the check below used the local origin/main as it stands" };
    }
    if (!remote) return { known: false, stale: null, cause: "no-remote-main", note: "the remote answered but carries no refs/heads/main; the check below used the ref as it stands" };
    const local = ref.sha;
    return { known: true, stale: local !== remote, local, remote,
             // v4846: the fetch NAMED, as ABSENT_REASON names it -- in a --branch clone a bare `git fetch origin main` moves
             // only FETCH_HEAD, and the ref this compares stays where it was
             note: local === remote ? "origin/main is current" : "origin/main is BEHIND the remote -- run: " + FETCH_MAIN };
}

// ====================================================================================================
// *** v4667 -- THE MARKER IS NOT THE ONLY NUMBER A ROUND WEARS, AND THIS GUARD WAS WATCHING THE OTHER ONE. ***
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

// *** v4667 -- AND ASKING MAIN ALONE WAS STILL THE WRONG QUESTION. *** The ordinal check above shipped
// reading origin/main's changelog, and within the hour it passed v4661 for this branch while
// origin/claude/v4661-complete-singles already carried a round of that number. The murmuration line STAGES
// EACH ROUND ON ITS OWN BRANCH before main sees it, so main's highest ordinal is a lower bound on what has
// been spent, not the high-water mark -- and a renumber that clears only main clears nothing. Measured at
// that moment: main 4660, two branches 4661 and 4662, this branch 4665. A guard that asks only the trunk
// reads a number that is TRUE AND INSUFFICIENT, which is the same shape as reading a marker that has
// stopped moving -- twice in one round, two different wrong numbers, both of them real.
//
// Every remote ref is asked now. That is more git than the marker path does, so it is bounded: refs are
// listed once and each changelog is read once, and a ref whose changelog cannot be read is SKIPPED WITH ITS
// NAME KEPT rather than silently dropped, because "I could not look" and "nothing there" are the distinction
// this tree keeps insisting on.

/** Every remote ref's highest spent ordinal, as { ref, top } rows, plus the refs that could not be read. */
export function refOrdinals({ run = null, refsOverride = null, readOverride = null } = {}) {
    const exec = run || ((args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }));
    let refs = refsOverride;
    if (!refs) {
        try {
            refs = exec(["for-each-ref", "--format=%(refname)", "refs/remotes"]).split("\n")
                     .map((r) => r.trim()).filter((r) => r && !/\/HEAD$/.test(r));
        } catch { return { rows: [], unreadable: [], reason: "no remote refs could be listed" }; }
    }
    const rows = [], unreadable = [];
    for (const ref of refs) {
        let text;
        try { text = readOverride ? readOverride(ref) : exec(["show", ref + ":docs/CHANGELOG.md"]); }
        catch { unreadable.push(ref); continue; }
        const { ordinals, titles } = ordinalsOf(text);
        if (ordinals.length) rows.push({ ref, top: ordinals[0], ordinals, titles });
        else unreadable.push(ref);
    }
    return { rows, unreadable, reason: null };
}

/** The highest ordinal any ref has spent, ignoring the one this branch is shipping from. */
export function highWater(opts = {}) {
    // v4667 -- *** A BRANCH DOES NOT COLLIDE WITH ITSELF, AND THAT HAD TO BE SAID RATHER THAN RELIED ON. ***
    // The first version took no selfRef and passed only because this branch's PUSHED state was one round
    // behind its working tree. Push the round and the next run refuses it, naming this very branch -- a guard
    // that goes red the moment you do the thing it just approved, which is precisely the false fault v4350
    // taught this file to refuse. The upstream of the current branch is excluded, derived rather than named.
    const self = opts.selfRef !== undefined ? opts.selfRef : (() => {
        const exec = opts.run || ((args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
        try { return "refs/remotes/" + exec(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).trim(); }
        catch { return null; }                              // no upstream: nothing to exclude, and that is fine
    })();
    const { rows, unreadable } = refOrdinals(opts);
    // v4854 -- *** AND A BRANCH ALREADY MERGED INTO THIS BUILD DOES NOT COLLIDE WITH IT EITHER. *** The other session's
    // v4854 was merged here to be shipped, and this check refused v4854 because that branch's ref still named it -- for a
    // different round, it said, when it was the very round this build carries. A ref whose tip is an ancestor of HEAD has
    // every heading it holds in this build's own changelog; its numbers are this build's, not a rival's. An ancestry test
    // that cannot be run (a shallow clone) counts as NOT merged, the side that refuses -- and refs supplied by a fixture are
    // never asked of the real repository: the gate's fixture names real branches, and the first draft read their real ancestry.
    const merged = new Set(opts.mergedRefs !== undefined ? opts.mergedRefs : (opts.refsOverride || opts.readOverride) ? [] : (() => {
        const exec = opts.run || ((args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
        return rows.map((r) => r.ref).filter((ref) => ref !== self && (() => { try { exec(["merge-base", "--is-ancestor", ref, "HEAD"]); return true; } catch { return false; } })());
    })());
    let top = null, where = null, titles = null;
    for (const r of rows) {
        if (self && r.ref === self) continue;
        if (merged.has(r.ref)) continue;
        if (top == null || r.top > top) { top = r.top; where = r.ref; titles = r.titles; }
    }
    // `self` is returned rather than left implicit: preflight needs it to skip this branch when
    // naming who spent a number, and re-deriving it there would be the same fact computed twice.
    return { top, where, titles, rows, unreadable, self, merged };
}

/** The ordinals origin/main's changelog has spent, or null with a reason. */
export function mainOrdinals({ run = null } = {}) {
    // Same shape as mainVersion's: an unreadable main is a normal tree to work in and is NOT a refusal,
    // but the reason is reported rather than folded into silence.
    // v4846 -- and the same cure: absence from the probe's exit status, a failed read in git's own words.
    const exec = run || gitRunner();
    const ref = originMainRef(exec);
    if (!ref.present) return { ordinals: null, titles: null, absent: ref.absent, reason: ref.absent ? ABSENT_REASON : ref.reason };
    let text;
    try { text = exec(["show", "origin/main:docs/CHANGELOG.md"]); }
    catch (e) { return { ordinals: null, titles: null, absent: false, reason: "reading origin/main's changelog FAILED: " + gitLine(e) }; }
    const { ordinals, titles } = ordinalsOf(text);
    return ordinals.length ? { ordinals, titles, absent: false, reason: null }
                           : { ordinals: null, titles: null, absent: false, reason: "origin/main's changelog has no `## vNNNN` heading this could parse" };
}

// ====================================================================================================
// *** v4871 -- THE HIGH-WATER WAS READ FROM THIS CLONE'S COPY OF EVERY BRANCH, AND ONLY main WAS EVER ASKED
// WHETHER ITS COPY WAS CURRENT. ***
// highWater() reads refs/remotes/origin/*, which is what this clone saw at its last fetch, and refFreshness()
// compares one of those refs with the remote: main. MEASURED, TWICE IN ONE WEEK:
//   v4838 -- one session pushed its v4838 at 17:01; another spent v4838 on a different round at 23:29, its own
//            preflight passing. Its view of the first branch predated the push, so the number read as free.
//            The label was released for one round and left in the changelog for the other.
//   v4853 -- a full fetch here showed v4853 free; another session pushed v4853 minutes later, while this
//            round was being bookkept. Caught only because the preflight was asked again after the push.
// The first is a stale view and is closed below: every branch head the remote holds is compared with this
// clone's copy (`git ls-remote --heads`, which reads and never writes), and a number is refused while any
// copy is behind or missing -- a number free in a stale view is not free. The cure is one fetch, named.
// The second is a race no read can close: two sessions can each see a number free in the same minute.
// What a read CAN do is shrink the window, so tools/ship/shipVerdict.mjs asks again AFTER the fifteen-minute
// verify (with a fresh fetch) and turns a SHIP into DO NOT SHIP when the label went in the meantime.
// ====================================================================================================

/** The fetch that brings every branch head into this clone -- a --branch or shallow clone included. */
export const FETCH_ALL = 'git fetch origin "+refs/heads/*:refs/remotes/origin/*"';

const HEX = /^[0-9a-f]{40,64}$/;
const listed = (names, n = 6) => names.slice(0, n).join(", ") + (names.length > n ? ` and ${names.length - n} more` : "");

/**
 * Is this clone's copy of every remote branch the remote's? { known, stale, unfetched, remoteCount, cause, note }.
 * `stale` moved on the remote since the last fetch; `unfetched` exist there and never reached this clone. A
 * branch deleted on the remote but still copied here is neither: its numbers stay spent, which is the side
 * that refuses. An unreachable remote is reported and stands aside, as refFreshness's does.
 */
export function branchFreshness({ run = null } = {}) {
    const exec = run || gitRunner();
    let remoteText;
    try { remoteText = String(exec(["ls-remote", "--heads", "origin"]) || ""); }
    catch (e) {
        return { known: false, stale: [], unfetched: [], remoteCount: null, cause: "unreachable",
                 note: "the remote's branch heads could not be listed (offline, or no origin remote): " + gitLine(e) +
                       " -- the high-water below used this clone's copies as they stand" };
    }
    const remote = new Map();
    for (const line of remoteText.split(/\r?\n/)) {
        const [sha, ref] = line.trim().split(/\s+/);
        if (sha && HEX.test(sha) && ref && ref.startsWith("refs/heads/")) remote.set(ref.slice("refs/heads/".length), sha);
    }
    let localText;
    try { localText = String(exec(["for-each-ref", "--format=%(objectname) %(refname)", "refs/remotes/origin"]) || ""); }
    catch (e) { return { known: false, stale: [], unfetched: [], remoteCount: remote.size, cause: "git", note: "this clone's remote refs could not be listed: " + gitLine(e) }; }
    const local = new Map();
    for (const line of localText.split(/\r?\n/)) {
        const [sha, ref] = line.trim().split(/\s+/);
        if (sha && HEX.test(sha) && ref && ref.startsWith("refs/remotes/origin/") && ref !== "refs/remotes/origin/HEAD") local.set(ref.slice("refs/remotes/origin/".length), sha);
    }
    const stale = [], unfetched = [];
    for (const [name, sha] of remote) {
        if (!local.has(name)) unfetched.push(name);
        else if (local.get(name) !== sha) stale.push(name);
    }
    stale.sort(); unfetched.sort();
    const current = !stale.length && !unfetched.length;
    return { known: true, stale, unfetched, remoteCount: remote.size, cause: current ? null : "behind",
             note: current ? `all ${remote.size} of the remote's branch heads are in this clone as the remote holds them`
                           : `${stale.length} branch head(s) moved on the remote since this clone fetched` +
                             (stale.length ? ` (${listed(stale)})` : "") + ` and ${unfetched.length} never reached it` +
                             (unfetched.length ? ` (${listed(unfetched)})` : "") + ` -- run: ${FETCH_ALL}` };
}

// ====================================================================================================
// *** v4871 -- AND THE LEDGER'S ORDINALS COLLIDE THE SAME WAY, WHERE NO TEXT CONFLICT SHOWS IT. ***
// gateSweep.mjs's closings are keyed `sinceNNN`, picked by hand as the next number. At v4842 both lines had
// written since529-since532 in different parts of the file; git merged them cleanly into one object literal
// that declared each key twice, and the later declaration silently won -- eight of the denoiser arc's gates
// left the surplus arithmetic. gateSweep-selfcheck's duplicate-key row caught it, AFTER the merge. Two
// questions are asked here BEFORE one: which ordinal is free on every branch, and does any closing this
// branch added share its key with another unmerged branch's closing for a different round.
// ====================================================================================================

export const LEDGER = "WebGLEngine/tools/ship/gateSweep.mjs";

/** Every closing a gateSweep.mjs text declares: Map("since554" -> its `at`, or null when none is near). */
export function closingsOf(text) {
    const out = new Map(), s = String(text || "");
    const re = /^[ \t]*(since\d+):[ \t]*Object\.freeze\(\{/gm;
    const hits = [...s.matchAll(re)];
    hits.forEach((m, i) => {
        // the `at` of THIS closing: looked for before the next closing starts, never in a neighbour's body
        const body = s.slice(m.index + m[0].length, i + 1 < hits.length ? hits[i + 1].index : m.index + m[0].length + 2000);
        const at = /\bat:\s*"([^"]*)"/.exec(body);
        if (!out.has(m[1])) out.set(m[1], at ? at[1] : null);
    });
    return out;
}
const ordinal = (key) => Number(String(key).replace(/^since/, ""));

/**
 * The closings census across refs. Returns { next, top, where, collisions, unreadable, read }:
 * `next` is one past the highest ordinal declared in this tree, on main or on any other ref; `collisions` are
 * the closings this tree declares that main does not, whose key another unmerged ref declares for a different
 * `at`. Each ref's ledger is read by blob id, once per distinct blob, so a hundred branches sharing a file cost one parse.
 */
export function closingCensus({ run = null, refs = null, mineText = null, mainRef = "refs/remotes/origin/main", self = undefined, merged = null } = {}) {
    const exec = run || gitRunner();
    const byBlob = new Map(), unreadable = [];
    const ledgerAt = (rev) => {
        let id;
        try { id = String(exec(["rev-parse", "--verify", "--quiet", `${rev}:${LEDGER}`]) || "").trim(); } catch { return null; }
        if (!id) return null;
        if (!byBlob.has(id)) { try { byBlob.set(id, closingsOf(exec(["cat-file", "blob", id]))); } catch { byBlob.set(id, null); } }
        return byBlob.get(id);
    };
    const mine = closingsOf(mineText != null ? mineText : (() => { try { return fs.readFileSync(path.join(REPO, LEDGER), "utf8"); } catch { return ""; } })());
    const main = ledgerAt(mainRef) || new Map();
    let all = refs;
    if (!all) {
        try { all = exec(["for-each-ref", "--format=%(refname)", "refs/remotes"]).split(/\r?\n/).map((r) => r.trim()).filter((r) => r && !/\/HEAD$/.test(r)); }
        catch { all = []; }
    }
    const me = self !== undefined ? self : (() => { try { return "refs/remotes/" + exec(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).trim(); } catch { return null; } })();
    const isMerged = merged ? (r) => merged.has(r) : (r) => { try { exec(["merge-base", "--is-ancestor", r, "HEAD"]); return true; } catch { return false; } };
    // what this tree adds to main: keys main lacks, and keys main holds for a different round (a merge would declare both)
    const added = [...mine].filter(([k, at]) => !main.has(k) || main.get(k) !== at);
    const collisions = [];
    for (const [k, at] of added) if (main.has(k) && main.get(k) !== at) collisions.push({ key: k, ref: mainRef, theirs: main.get(k), mine: at });
    let top = Math.max(0, ...[...mine.keys(), ...main.keys()].map(ordinal)), where = "this tree or main";
    let read = 0;
    for (const ref of all) {
        if (ref === mainRef) continue;
        const theirs = ledgerAt(ref);
        if (!theirs) { unreadable.push(ref); continue; }
        read++;
        for (const k of theirs.keys()) { const n = ordinal(k); if (n > top) { top = n; where = ref; } }
        if (ref === me || !added.length || isMerged(ref)) continue;
        for (const [k, at] of added) if (theirs.has(k) && theirs.get(k) !== at) collisions.push({ key: k, ref, theirs: theirs.get(k), mine: at });
    }
    return { next: top + 1, top, where, collisions, unreadable, read };
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
    // v4667 -- hoisted, because the ordinal check below needs the SAME exemption for the SAME reason. v4350's
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
    // v4871 -- *** THE VIEW BEFORE THE NUMBERS READ FROM IT. *** Every check below reads this clone's copies of the
    // branches; a copy behind the remote is how v4838 was spent twice. Skipped with skipFreshness (every fixture's
    // SEALED default), and a fixture states the answer with branchFreshnessOverride rather than asking the network.
    const bf = opts.branchFreshnessOverride !== undefined ? opts.branchFreshnessOverride : opts.skipFreshness ? null : branchFreshness(opts);
    if (bf && bf.known && (bf.stale.length || bf.unfetched.length)) {
        return { ok: false, shipping, mainVersion: mv, freshness, branchFreshness: bf, staleView: true,
                 refusal: `the branches this would check ${shipping} against are this clone's copies, and they are not the remote's: ` +
                          bf.note.replace(/ -- run: .*$/, "") +
                          `. A number free in a stale view is not free -- v4838 was spent twice exactly this way. Run: ${FETCH_ALL} and ask again.` };
    }
    // *** THE SECOND NUMBER. *** Past the marker check, and only for a build that is not main's own.
    const ord = opts.mainOrdinalsOverride !== undefined ? opts.mainOrdinalsOverride : mainOrdinals(opts);
    const spent = ord && ord.ordinals;

    // v4667 -- AND THE HIGH-WATER ACROSS EVERY REF, WHICH MAIN'S CHANGELOG IS ONLY A LOWER BOUND ON.
    // Checked BEFORE main's own, because it is the stronger claim: a number free on main and taken on a
    // pushed branch is taken, and finding that out at the merge is what this file exists to prevent.
    const hw = opts.highWaterOverride !== undefined ? opts.highWaterOverride : highWater(opts);
    // v4871 -- *** NOT `!sameBuild` ANY MORE: THAT EXEMPTED EVERY NUMBER ASKED ABOUT FROM AN UN-BUMPED TREE. *** sameBuild
    // means this tree IS main's build, and the exemption exists for one question: may main's own number be asked
    // about again (v4350's follow-up commit) -- answered yes, above, by the early return for `want === have`. For any
    // OTHER number the tree is not that build's claim on it, and the exemption skipped both checks below: the
    // ritual "run versionPreflight before picking a number" asks from a tree still identical to main, so every
    // candidate number was approved without being compared with a single branch. MEASURED at v4864: asked about
    // v4864 from main's v4863 tree, this answered OK while refs/remotes/origin/ccr-6c3eeb7c-pxz6kx carried a
    // v4864 heading and highWater() itself returned 4864 for that ref. v4853's collision was picked the same way.
    if (hw && hw.top != null && want <= hw.top && !(spent && spent.length && want <= spent[0])) {
        // v4667 -- THE TITLE COMES FROM WHICHEVER REF SPENT THE NUMBER, not from the highest one. The first
        // version read hw.titles, which belongs to the ref holding the high-water mark, so asking about v4661
        // printed the v4662 branch's entry for that number instead of the branch that actually named it. A
        // refusal that names the WRONG round is worse than one that names none: it sends the reader to a
        // file that does not hold what they were told is there.
        const holder = (hw.rows || []).find((r) => r.titles && r.titles.has(want) && r.ref !== hw.self && !(hw.merged && hw.merged.has(r.ref)));
        const taken = holder && holder.titles.get(want);
        return { ok: false, shipping, mainVersion: mv, freshness, ordinalTop: spent ? spent[0] : null, highWater: hw.top,
                 refusal: `v${hw.top} is already spent on ${hw.where}` +
                          (taken ? `, and ${shipping} is a heading ${holder.ref} already gave to a different round: "${taken}"`
                                 : `, and ${shipping} is at or below it`) +
                          ` -- a round staged on a branch has spent its number even though main has not seen it yet` +
                          (spent && spent.length ? ` (origin/main is only at v${spent[0]}, which is why asking the trunk alone said this was fine)` : "") +
                          `. Supersede FORWARD: v${hw.top + 1} or later.` };
    }
    if (spent && spent.length) {   // v4871: and here, for the same reason
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
    // v4871 -- *** AND THE LEDGER'S OWN NUMBERS, which no text conflict shows. *** A fixture supplies closingsOverride;
    // one that supplies refs or reads (SEALED does) is never asked of the real repository, as with `merged` above.
    const cc = opts.closingsOverride !== undefined ? opts.closingsOverride
             : (opts.refsOverride || opts.readOverride || opts.highWaterOverride !== undefined) ? null
             : closingCensus({ ...(opts.run ? { run: opts.run } : {}), self: hw && hw.self !== undefined ? hw.self : undefined, merged: hw && hw.merged ? hw.merged : null });
    if (cc && cc.collisions && cc.collisions.length) {
        const c = cc.collisions[0];
        return { ok: false, shipping, mainVersion: mv, freshness, closings: cc,
                 refusal: `gateSweep.mjs's closing ${c.key}, which this tree adds for "${c.mine}", is declared on ${c.ref} for "${c.theirs}"` +
                          (cc.collisions.length > 1 ? ` (and ${cc.collisions.length - 1} more: ${cc.collisions.slice(1).map((x) => `${x.key} on ${x.ref}`).join(", ")})` : "") +
                          ` -- merged, one object literal declares the key twice and the later silently wins, as since529-since532 did at v4842.` +
                          ` Renumber this tree's closing to since${cc.next} or later.` };
    }
    const note = (!sameBuild && spent && spent.length && have != null && spent[0] > have)
        ? `main's changelog has spent v${spent[0]} while its marker reads v${have} -- ${spent[0] - have} rounds ahead, ` +
          `so the ordinal is the binding number here` : undefined;
    return { ok: true, shipping, mainVersion: mv, freshness, refusal: null, ordinalTop: spent ? spent[0] : null,
             ...(bf ? { branchFreshness: bf } : {}), ...(cc ? { closings: cc } : {}), ...(note ? { note } : {}) };
}

/**
 * v4871 -- the numbers a NEW round should take: one past everything any ref has spent (this tree, main's marker and
 * changelog, and every other ref's changelog, this branch's own pushed rounds included), and one past every ledger closing.
 */
export function nextFree(opts = {}) {
    // every input injectable the way preflight's are, so a fixture states the world instead of reading this repository
    const local = opts.localSourceOverride !== undefined ? opts.localSourceOverride
                : (() => { try { return fs.readFileSync(path.join(ENG, "main.js"), "utf8"); } catch { return ""; } })();
    const localChlog = opts.localChangelogOverride !== undefined ? opts.localChangelogOverride
                     : (() => { try { return fs.readFileSync(path.join(REPO, "docs", "CHANGELOG.md"), "utf8"); } catch { return ""; } })();
    const mv = opts.mainVersionOverride !== undefined ? { version: opts.mainVersionOverride } : mainVersion(opts);
    const mo = opts.mainOrdinalsOverride !== undefined ? opts.mainOrdinalsOverride : mainOrdinals(opts);
    const ro = refOrdinals(opts);
    const seen = [versionNumber(engineVersionOf(local)), versionNumber(mv.version), ...((mo && mo.ordinals) || []).slice(0, 1),
                  ...ordinalsOf(localChlog).ordinals.slice(0, 1), ...ro.rows.map((r) => r.top)].filter((n) => n != null);
    const top = Math.max(0, ...seen);
    const holder = ro.rows.find((r) => r.top === top);
    const cc = opts.closingsOverride !== undefined ? opts.closingsOverride : closingCensus(opts.run ? { run: opts.run } : {});
    return { version: "v" + (top + 1), versionTop: top, versionWhere: holder ? holder.ref : "this tree or main",
             closing: "since" + cc.next, closingTop: cc.top, closingWhere: cc.where, unreadable: [...new Set([...ro.unreadable, ...(cc.unreadable || [])])] };
}

// Run directly: node tools/ship/versionPreflight.mjs [vNNNN]      -- may this round ship as vNNNN?
//               node tools/ship/versionPreflight.mjs --next       -- which version and ledger closing should a new round take?
// v4871: parsed by cliArgs, the tree's one parser, with the version as its positional word.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const CLI = { values: {}, flags: ["--next"], positional: true };
    const cli = parseArgs(process.argv.slice(2), CLI);
    if (cli.errors.length) { for (const l of refusalLines("versionPreflight", cli.errors, CLI)) console.error(l); process.exit(2); }
    const bf = branchFreshness();
    if (cli.flags.has("--next")) {
        if (bf.known && bf.cause === "behind") console.log("  [versionPreflight] NOTE  " + bf.note + " -- the numbers below may be higher");
        else if (!bf.known) console.log("  [versionPreflight] NOTE  " + bf.note);
        const n = nextFree();
        console.log(`  [versionPreflight] next version: ${n.version}   (highest spent: v${n.versionTop}, on ${n.versionWhere})`);
        console.log(`  [versionPreflight] next ledger closing: ${n.closing}   (highest declared: since${n.closingTop}, on ${n.closingWhere})`);
        if (n.unreadable.length) console.log(`  [versionPreflight] ${n.unreadable.length} ref(s) carried no changelog or ledger to read: ${n.unreadable.slice(0, 4).join(", ")}${n.unreadable.length > 4 ? " ..." : ""}`);
        process.exit(0);
    }
    const arg = cli.rest[0] || engineVersionOf(fs.readFileSync(path.join(ENG, "main.js"), "utf8"));
    const r = preflight(arg, { branchFreshnessOverride: bf });
    if (r.freshness && r.freshness.note) console.log("  [versionPreflight] " + r.freshness.note);
    if (bf.note && !r.staleView) console.log("  [versionPreflight] " + bf.note);
    if (r.refusal) { console.log("  [versionPreflight] REFUSED: " + r.refusal); process.exit(1); }
    console.log(`  [versionPreflight] OK: shipping ${r.shipping}, origin/main carries ${r.mainVersion || "(unreadable)"}` +
                (r.closings ? `; ledger: next closing since${r.closings.next}` : "") + (r.note ? " -- " + r.note : ""));
}

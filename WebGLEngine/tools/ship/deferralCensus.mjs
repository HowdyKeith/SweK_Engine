// WebGLEngine/tools/ship/deferralCensus.mjs -- v4479
//
// *** THE INSTRUMENT BUILT TO STOP DEFERRALS LIVING IN PROSE HAS ITSELF BEEN LIVING IN PROSE. ***
//
// v3313 audited four "its own round" notes by hand and found three already settled. v3314 widened that to
// fifteen files: SEVEN WERE ALREADY SETTLED, FOUR WERE NEVER DEFERRALS AT ALL. v3340 drew the right conclusion
// and built tools/ship/nextRounds.mjs -- a standing backlog where each entry carries a BLOCKER that can be
// checked instead of a priority that cannot. Its header states the failure mode exactly:
//
//     "The failure mode is not forgetting to write things down; it is writing them down in prose that nothing
//      ever re-reads, so a finished item keeps advertising itself as open and the next reader spends a round
//      rediscovering that."
//
// MEASURED AT v4479: NEXT_ROUNDS holds 10 entries, 6 of them open, and NOT ONE mentions a version at or above
// v4000. It was written at v3340 and the tree has shipped more than eleven hundred rounds since. Meanwhile the
// prose kept coming: 181 lines in this tree match a deferral phrase.
//
// So the backlog is the finished item that kept advertising itself. That is not an argument against it -- the
// design is right and this file does not replace it. What was missing is the half that makes a backlog
// maintainable: SOMETHING THAT ENUMERATES THE PROSE, so the gap between what the tree says it owes and what it
// has written down is a number rather than a feeling.
//
// ------------------------------------------------------------------------------------------------------------
// *** WHAT THIS FILE REFUSES TO DO, AND WHY THAT IS THE DESIGN. ***
//
// It does not decide whether a deferral is open. It cannot: "is this still owed" is a question about the tree's
// behaviour, and answering it means reading a file -- which is exactly what v3313 and v3314 did by hand, four
// and fifteen times. A classifier that guessed would be a MENTION TEST, and this tree's own record on those is
// three wrong in one session by curriculum.mjs's count, plus gateQuality's prose ratchet, plus the reachLicences
// pattern list that red-flagged an innocent entry the first time it ran.
//
// So every class below is decided from STRUCTURE ON ONE LINE, or on the line adjacent to it -- an adjacency a
// reader can verify at a glance -- and everything else is reported as UNDECIDED. Undecided is not a synonym for
// open. It means NOTHING HAS EVER ADJUDICATED THIS, which is the actual finding and is a bigger number than
// anybody would have guessed: 120, across 110 files.
//
// THE FIRST DRAFT CLASSIFIED ON A FOUR-LINE CONTEXT WINDOW AND WAS WRONG IMMEDIATELY. It called
// physics/em/skinDepth-selfcheck.mjs:172 an ANTIDOTE because the words "goes red" appear two lines away, in an
// unrelated sentence. That is the whole hazard in one example, caught before the file was written rather than
// after, and it is why the window is now one line either side and the classes are keyed on tokens rather than
// on sentiment.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NEXT_ROUNDS } from "./nextRounds.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE_ROOT = path.resolve(HERE, "..", "..");   // tools/ship -> WebGLEngine

/** The phrases the tree actually uses. Derived from reading it, not invented. */
export const PHRASES = Object.freeze([
    "a round of its own", "its own round", "a separate round",
    "a later round", "worth a round", "is a different round",
]);

const alt = PHRASES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
/** LOOSE matches the phrase anywhere -- including inside a longer word. Kept so the trap can be counted. */
export const LOOSE = new RegExp("(" + alt + ")", "i");
/** TIGHT requires a word boundary. The difference between them is a real defect, not a nicety -- see SUBSTRING. */
export const TIGHT = new RegExp("(" + alt + ")\\b", "i");

export const CLASS = Object.freeze({
    HISTORY: "history",       // inside a shipped round note: a record of a deferral, not an open one
    SUBSTRING: "substring",   // "its own roundING" -- the phrase is not there at all
    NEGATED: "negated",       // "rather than in its own round" -- says the OPPOSITE
    SATISFIED: "satisfied",   // the same or next line says the round happened
    ANTIDOTE: "antidote",     // an ANTIDOTE block: a tripwire, which is a deferral that IS watched
    UNDECIDED: "undecided",   // nothing structural decides it -- reading the file is the only way
});

// A shipped round note. main.js and brain/brain.js are handled wholesale: every deferral phrase in them sits
// inside a version comment by construction, and their long prose blocks are this tree's own commentary on
// rounds already shipped. Counting those as open work would count the changelog as a backlog.
const VERSION_LINE = /^\s*(\/\/\s*)?(const (ENGINE_VERSION|BRAIN_BUILD)|\/\/ v\d{3,4} --)/;
export const HISTORY_FILES = Object.freeze(["main.js", "brain/brain.js"]);

// Says the opposite of a deferral: the round was NOT split off.
const NEGATION = /(rather than (in )?(its own|a separate|a later)|not (on )?anything a later round|is not (its own|a later)|instead of (its own|a later))/i;
// Says the deferred round happened. Same line or the next one only.
const SATISFACTION = /(this is that round|this round does|DONE at v\d{3,4}|SETTLED at v\d{3,4})/i;
// The literal token. An antidote is a deferral with a tripwire attached, which is the state this file wants more of.
const ANTIDOTE_TOKEN = /\bANTIDOTE\b/;

/** Files whose subject IS deferral bookkeeping. Counting their quotations would count the audit as the debt. */
export const BOOKKEEPING = Object.freeze([
    "tools/ship/deferralAudit-selfcheck.mjs",
    "tools/ship/nextRounds.mjs",
    "tools/ship/deferralCensus.mjs",
    "tools/ship/deferralCensus-selfcheck.mjs",
]);

/**
 * Classify ONE line. `prev` and `next` are its neighbours and nothing further: a wider window is what made the
 * first draft call an unrelated sentence an antidote.
 */
export function classifyLine(rel, line, prev = "", next = "") {
    if (!LOOSE.test(line)) return null;
    if (HISTORY_FILES.includes(rel) || VERSION_LINE.test(line)) return CLASS.HISTORY;
    if (!TIGHT.test(line)) return CLASS.SUBSTRING;
    if (NEGATION.test(line)) return CLASS.NEGATED;
    if (SATISFACTION.test(line) || SATISFACTION.test(next)) return CLASS.SATISFIED;
    if (ANTIDOTE_TOKEN.test(line) || ANTIDOTE_TOKEN.test(prev)) return CLASS.ANTIDOTE;
    return CLASS.UNDECIDED;
}

const SKIP_DIR = /node_modules|[/\\]vendor[/\\]|[/\\]dist[/\\]|\.git/;

export function sourceFiles(root = ENGINE_ROOT) {
    const out = [];
    (function walk(d) {
        let entries;
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const p = path.join(d, e.name);
            if (SKIP_DIR.test(p)) continue;
            if (e.isDirectory()) walk(p);
            else if (/\.(mjs|js|html)$/.test(e.name)) out.push(p);
        }
    })(root);
    return out.sort();
}

export function census({ root = ENGINE_ROOT, includeBookkeeping = false } = {}) {
    const rows = [];
    for (const f of sourceFiles(root)) {
        const rel = path.relative(root, f).split(path.sep).join("/");
        if (!includeBookkeeping && BOOKKEEPING.includes(rel)) continue;
        let lines;
        try { lines = fs.readFileSync(f, "utf8").split("\n"); } catch { continue; }
        lines.forEach((l, i) => {
            const cls = classifyLine(rel, l, lines[i - 1] || "", lines[i + 1] || "");
            if (cls) rows.push({ file: rel, line: i + 1, cls, text: l.trim() });
        });
    }
    const counts = Object.fromEntries(Object.values(CLASS).map((c) => [c, 0]));
    rows.forEach((r) => { counts[r.cls]++; });
    const undecided = rows.filter((r) => r.cls === CLASS.UNDECIDED);
    return {
        rows, counts, total: rows.length,
        undecided,
        undecidedFiles: new Set(undecided.map((r) => r.file)).size,
    };
}

/**
 * *** THE BACKLOG'S CURRENCY, WHICH IS THE FINDING THIS FILE EXISTS FOR. ***
 * Not "is the backlog right" -- nothing can check that -- but "when did anybody last touch it", derived from
 * the newest version any entry names. The same shape releaseLedger uses for the releases page: a lag, reported
 * as a number, so a record that has stopped being maintained says so instead of looking maintained.
 */
export function backlogCurrency(engineVersion = readEngineVersion(), entries = NEXT_ROUNDS) {
    // `entries` is injectable for ONE reason: a hardcoded `newest` that happens to equal today's maximum
    // produces the identical answer, so no comparison against today's backlog can see it. Feeding a synthetic
    // backlog is the only way to show the number is DERIVED rather than remembered -- and that sabotage went
    // 0 RED until this parameter existed.
    const text = JSON.stringify(entries);
    const versions = [...text.matchAll(/v(\d{3,4})/g)].map((m) => Number(m[1]));
    const newest = versions.length ? Math.max(...versions) : null;
    const now = Number(String(engineVersion).replace(/^v/, ""));
    return {
        entries: entries.length,
        open: entries.filter((r) => r.state !== "CLOSED").length,
        closed: entries.filter((r) => r.state === "CLOSED").length,
        newestVersionNamed: newest,
        engineVersion: now,
        lagVersions: newest === null ? null : now - newest,
    };
}

export function readEngineVersion(root = ENGINE_ROOT) {
    const m = fs.readFileSync(path.join(root, "main.js"), "utf8").match(/const ENGINE_VERSION = "(v\d+)"/);
    return m ? m[1] : null;
}

/**
 * How much of the prose the backlog actually knows about. A deferral is MATCHED when some NEXT_ROUNDS entry
 * names its file. That is a weak test on purpose -- a strong one would need the classifier this file refuses
 * to build -- and a weak test that reports a small number is more useful than a strong-sounding one that
 * cannot be checked.
 */
export function backlogReach(c = census()) {
    const named = JSON.stringify(NEXT_ROUNDS);
    const matched = c.undecided.filter((r) => named.includes(r.file));
    return { undecided: c.undecided.length, matchedByBacklog: matched.length, files: [...new Set(matched.map((r) => r.file))] };
}

/**
 * FROZEN AT v4479, so every count this round states can be re-derived by the gate that states it.
 * These move when the tree does, and they are SUPPOSED to: the row that checks them names the class that
 * changed rather than showing a number that moved.
 */
export const CENSUS_AT_V4479 = Object.freeze({
    at: "v4479",
    // The classes, AFTER this round's three repairs. Frozen so the gate re-derives every number the round
    // states rather than quoting one, and so a class that moves is NAMED instead of showing a number that did.
    // *** THESE ARE POST-BUMP. THE ROUND'S OWN NOTE MOVED THEM AND THE GATE NAMED THE CLASS THAT MOVED. ***
    // Frozen at 181/49 while the note was being written, the row went red the moment v4479's own version
    // comment landed in main.js and brain/brain.js -- two more `history` hits, because a round note about
    // deferrals is full of deferral phrases. It reported "drifted: history 49 -> 51" rather than a total that
    // had changed, which is v4399's rule doing its job on the round that wrote it.
    total: 183,
    history: 51,        // inside a shipped round note -- the changelog is not a backlog
    substring: 2,       // "its own roundING": the phrase is not there at all
    negated: 2,         // "rather than in its own round": says the opposite
    satisfied: 5,       // marked SETTLED adjacent to the claim -- 2 before this round, 5 after
    antidote: 5,        // an ANTIDOTE block: a deferral that IS watched, which is the state to want more of
    undecided: 118,
    undecidedFiles: 108,
    // *** WHAT THE ROUND FOUND BY HAND, WHICH IS WHY THE UNDECIDED NUMBER MATTERS. *** Two files were opened
    // and THREE stale notes came out, two of them in one paragraph. Each was settled within four rounds of
    // being written and went on advertising itself for sixty-six versions. Checked against EXPORTS, never
    // against a sentence: misWgsl.mjs's STRATEGY table has bsdf/light/mis/misRenorm, and
    // microfacetAnisoWgsl.mjs carries Daniso, lambdaAniso and an anisotropic visible-normal sampler.
    settledHere: Object.freeze([
        Object.freeze({ file: "physics/render/microfacetSampleWgsl-selfcheck.mjs", was: "combining two estimators is a round of its own", settledAt: "v4413", evidence: "physics/render/misWgsl.mjs exports STRATEGY" }),
        Object.freeze({ file: "physics/render/microfacetVndf-selfcheck.mjs", was: "an anisotropic D is a round of its own", settledAt: "v4412", evidence: "physics/render/microfacetAnisoWgsl.mjs exports Daniso/lambdaAniso" }),
        Object.freeze({ file: "physics/render/microfacetVndf-selfcheck.mjs", was: "the MIS weights are computed and never used", settledAt: "v4413", evidence: "physics/render/misWgsl.mjs exports STRATEGY" }),
    ]),
    // The backlog as this round FOUND it, before adding to it. This is the finding, not a footnote:
    // 925 versions with nothing added, by a file whose own subject is records that stop being re-read.
    backlogFound: Object.freeze({ entries: 10, open: 6, newestVersionNamed: 3553, lagVersions: 925, reachOf118: 0 }),
    backlogAfter: Object.freeze({ entries: 14, open: 10, added: 4, reach: 1 }),
});

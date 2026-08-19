// WebGLEngine/tools/ship/pagePlacement.mjs -- v3576
// ---------------------------------------------------------------------------------------------------------------
// *** 228 PAGES ARE SILENTLY UNPLACED, AND pageSections.mjs's OWN DOCTRINE IS THAT THIS MUST NOT HAPPEN. ***
//
// That file says it plainly, about UNPLACED: "an unplaced page and a page nobody has got to look identical, and
// the second one gets placed by a guess." UNPLACED holds 18 entries. The tree holds 348 pages, SECTIONS places
// 102, so 228 ARE IN EXACTLY THE STATE THE MECHANISM EXISTS TO PREVENT -- not refused with a reason, just never
// reached. v3575 reported the count from the other side (349 of 451 launchables in no panel) and said the fix was
// upstream. This is upstream.
//
// ================================================================================================================
// AND THE FIRST THING TO SAY IS THAT "JUST PLACE THEM" IS ARITHMETICALLY IMPOSSIBLE
// ================================================================================================================
//
// Keith's rule at v3434 is fifteen per panel. There are 15 panels, so the whole cabinet holds 225, of which 102
// are used: *** 123 FREE SLOTS AGAINST 228 PAGES. A SHORTFALL OF 105, WHICH IS AT LEAST SEVEN MORE PANELS. ***
//
// So this tool does NOT place anything, and that is the design rather than a limitation. Two reasons, and the
// second is the real one:
//
//   THE CAPACITY SAYS IT CANNOT BE DONE inside the current cabinet, so any tool that placed everything would
//   have to violate the cap silently -- reintroducing the flat row that v2513 built sections to prevent.
//
//   *** NAMING A PANEL IS NAMING A SUBJECT, AND THAT IS KEITH'S CALL, NOT A CLASSIFIER'S. *** pageSections is
//   full of decisions no token overlap could reach: roundhouse belongs with the physics lab because it drives
//   it; sampling has no chip of its own because a thirteenth button was the thing to avoid; celltrack holds one
//   page ON PURPOSE. A tool that auto-assigned would be a SECOND registry disagreeing with the first, which is
//   the defect this session has now found in nine files, three, four, and 59 of 82.
//
// SO IT PROPOSES AND REPORTS, AND WRITES NOTHING. The output is a work list with evidence attached, and every
// suggestion is a sentence Keith can accept in one line of pageSections.mjs or reject without argument.
//
// ================================================================================================================
// THE EVIDENCE, AND WHY A WEAK MATCH PRODUCES NO SUGGESTION AT ALL
// ================================================================================================================
//
// The only evidence that is not hand-typed is the page's TITLE (340 of 340 have a real one) and its FILENAME.
// Descriptions are empty across the board, so there is nothing else to read. A page is scored against each panel
// by token overlap with the pages ALREADY IN IT -- the panels are the labelled examples, which is the one honest
// training signal available.
//
// *** A SCORE BELOW THE FLOOR YIELDS NO SUGGESTION, RATHER THAN THE NEAREST PANEL. *** Nearest-anything is how a
// classifier turns "I do not know" into a confident wrong answer, and a wrong placement is worse than no
// placement here: a page filed in the wrong drawer is FOUND ONCE AND NEVER LOOKED FOR AGAIN, while a page in
// Arriving is still visibly owed. The floor is reported alongside the counts so the trade is visible rather than
// buried in a constant.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SECTIONS, MAX_PER_PANEL, UNPLACED } from "./pageSections.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENG = path.resolve(HERE, "..", "..");

/** Words that carry no subject information. Kept short on purpose: an aggressive stop list hides evidence. */
const STOP = new Set(["html", "the", "a", "an", "and", "or", "of", "in", "on", "for", "to", "with", "is", "it",
    "its", "that", "this", "at", "by", "as", "swek", "engine", "demo", "page", "lab", "test", "v", "vs", "2", "3", "3d"]);

// *** THE FIRST RUN OF THIS TOOL PROPOSED 21 PAGES FOR Box3D ON THE EVIDENCE OF A TYPOGRAPHIC SEPARATOR. ***
// Titles in page-index.json carry HTML ENTITIES -- &middot; &mdash; &amp; -- and stripping non-letters turned
// them into the tokens "middot", "mdash" and "amp". Those appear in dozens of unrelated titles, cleared the
// score floor easily, and produced THE LARGEST AND MOST CONFIDENT SUGGESTION GROUP IN THE REPORT, built entirely
// on punctuation.
//
// *** THAT IS THE EXACT FAILURE THIS FILE'S HEADER WARNS ABOUT, COMMITTED BY THE FILE ITSELF ON ITS FIRST RUN.
// The floor was supposed to stop "I do not know" becoming a confident wrong answer, and a floor cannot do that
// when the EVIDENCE IS CONTAMINATED -- a common noise token scores exactly like a common subject token. ***
// Entities are decoded and then dropped, rather than only being added to STOP, because the next entity somebody
// puts in a title would walk straight back in through a list that has to be remembered.
const ENTITY = /&(#\d+|#x[0-9a-f]+|[a-z]+);/gi;

/** Filename + title into a bag of lowercase tokens. Both, because either alone loses cases the other catches. */
export function tokens(file, title = "") {
    const clean = String(title).replace(ENTITY, " ");
    const raw = (String(file).replace(/\.html?$/i, "") + " " + clean)
        .toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ");
    return new Set(raw.filter((w) => w && w.length > 1 && !STOP.has(w)));
}

/** Read the page list the rest of the ship tooling already derives. No second walker. */
export function readPages() {
    const j = JSON.parse(fs.readFileSync(path.join(ENG, "page-index.json"), "utf8"));
    const byFile = new Map(j.pages.map((p) => [p.f, p.t || p.f]));
    // launch-index carries eight pages the page walker misses; fold them in so the inventory is of the TREE
    try {
        const L = JSON.parse(fs.readFileSync(path.join(ENG, "launch-index.json"), "utf8"));
        for (const e of L.entries) if (e.kind === "page" && !byFile.has(e.id)) byFile.set(e.id, e.display || e.id);
    } catch { /* absent is reported by the caller, not papered over here */ }
    return byFile;
}

/**
 * *** THE THREE BUCKETS MUST PARTITION THE TREE. *** placed + reasoned + silent = every page, with no overlap.
 * A page that fell through all three would be invisible to exactly the tool built to find invisible pages.
 */
export function inventory() {
    const pages = readPages();
    const placed = new Map();
    for (const s of SECTIONS) for (const f of s.pages) placed.set(f, s.id);
    const reasoned = new Set(UNPLACED.keys());
    const silent = [];
    for (const f of pages.keys()) if (!placed.has(f) && !reasoned.has(f)) silent.push(f);
    // pages named in SECTIONS that no longer exist in the tree: a registry pointing at nothing
    const ghosts = [...placed.keys()].filter((f) => !pages.has(f));
    return { pages, placed, reasoned, silent: silent.sort(), ghosts,
             total: pages.size, counts: { placed: placed.size, reasoned: reasoned.size, silent: silent.length } };
}

/** The arithmetic that makes "just place them" answerable rather than arguable. */
export function capacity(inv = inventory()) {
    const per = SECTIONS.map((s) => ({ id: s.id, label: s.label, used: s.pages.length,
                                       free: Math.max(0, MAX_PER_PANEL - s.pages.length) }));
    const free = per.reduce((a, p) => a + p.free, 0);
    const need = inv.counts.silent;
    const shortfall = Math.max(0, need - free);
    return { panels: SECTIONS.length, cap: MAX_PER_PANEL, totalSlots: SECTIONS.length * MAX_PER_PANEL,
             used: inv.counts.placed, free, need, shortfall,
             extraPanelsNeeded: Math.ceil(shortfall / MAX_PER_PANEL), per };
}

/**
 * Panel profiles: the tokens of the pages already filed there. The panels ARE the labelled examples.
 *
 * *** TOKENS ARE WEIGHTED BY HOW FEW PANELS CONTAIN THEM, AND THE UNWEIGHTED VERSION GOT box3d-blobs.html
 * FILED UNDER SAMPLING & METHODS. *** A raw count rewards a word for being COMMON, which is the opposite of
 * what makes it evidence: "physics" appears in five panels and says nothing about which one, while "box3d"
 * appears in one and says everything. Two hits on "physics" outscored one hit on "box3d" and the wrong panel
 * won -- a second contamination of the same shape as the entity bug above, and it survived that fix because
 * "physics" is a REAL subject word, just not a DISCRIMINATING one.
 *
 * The weight is 1 / (panels containing the token), so a token unique to one panel counts fully and a token
 * spread across five counts a fifth. Nothing is dropped: a common word still contributes, just not decisively.
 */
export function panelProfiles(inv = inventory()) {
    const raw = new Map();
    for (const s of SECTIONS) {
        const bag = new Map();
        for (const f of s.pages) for (const t of tokens(f, inv.pages.get(f) || "")) bag.set(t, (bag.get(t) || 0) + 1);
        raw.set(s.id, { id: s.id, label: s.label, bag, size: s.pages.length });
    }
    const spread = new Map();                       // how many panels contain each token
    for (const p of raw.values()) for (const t of p.bag.keys()) spread.set(t, (spread.get(t) || 0) + 1);
    for (const p of raw.values()) {
        const w = new Map();
        for (const [t, n] of p.bag) w.set(t, n / spread.get(t));
        p.bag = w;
    }
    return raw;
}

export const SCORE_FLOOR = 1.5; // reported, not hidden: see the header on why nearest-anything is refused.
// v3576 -- LOWERED FROM 2 WHEN THE WEIGHTING LANDED, because weighted scores are smaller by construction: a
// token in five panels now contributes 0.2 where it used to contribute 1. Leaving the floor at 2 would have
// quietly rejected the DISCRIMINATING single-token matches (one hit on a panel-unique word scores 1) while the
// generic ones it was meant to stop had already been cut. THE FLOOR AND THE WEIGHTING ARE ONE DECISION.

/**
 * Score one page against every panel and return a suggestion ONLY if the evidence clears the floor and the panel
 * has room. Ties are refused too -- two panels equally plausible is not a placement, it is a question.
 */
export function suggestFor(file, inv = inventory(), prof = panelProfiles(inv)) {
    const tk = tokens(file, inv.pages.get(file) || "");
    const scored = [];
    for (const p of prof.values()) {
        let score = 0; const hits = [];
        for (const t of tk) if (p.bag.has(t)) { score += p.bag.get(t); hits.push(t); }
        if (score > 0) scored.push({ panel: p.id, label: p.label, score, hits, full: p.size >= MAX_PER_PANEL });
    }
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || best.score < SCORE_FLOOR) return { file, suggestion: null, why: "no panel shares enough vocabulary", scored };
    if (scored[1] && Math.abs(scored[1].score - best.score) < 1e-9) return { file, suggestion: null, why: "tied between " + best.label + " and " + scored[1].label, scored };
    if (best.full) return { file, suggestion: null, why: best.label + " fits but is at the cap of " + MAX_PER_PANEL, scored };
    return { file, suggestion: best.panel, label: best.label, score: best.score, evidence: best.hits, scored };
}

export function suggestAll(inv = inventory()) {
    const prof = panelProfiles(inv);
    const rows = inv.silent.map((f) => suggestFor(f, inv, prof));
    const placeable = rows.filter((r) => r.suggestion);
    const byPanel = new Map();
    for (const r of placeable) { if (!byPanel.has(r.suggestion)) byPanel.set(r.suggestion, []); byPanel.get(r.suggestion).push(r); }
    return { rows, placeable, unreached: rows.filter((r) => !r.suggestion), byPanel };
}

/**
 * The pages no existing panel can claim, grouped by the token they most share. *** THESE ARE PROPOSED PANEL
 * SUBJECTS, NOT PANEL NAMES. *** A shared token is evidence that a subject exists; what to call it, and whether
 * it deserves a chip, is the judgement pageSections is full of and this tool has no standing to make.
 */
export function clusters(inv = inventory(), { minSize = 3 } = {}) {
    const un = suggestAll(inv).unreached.map((r) => r.file);
    const byToken = new Map();
    for (const f of un) for (const t of tokens(f, inv.pages.get(f) || "")) {
        if (!byToken.has(t)) byToken.set(t, []);
        byToken.get(t).push(f);
    }
    const out = [];
    const taken = new Set();
    for (const [t, files] of [...byToken.entries()].sort((a, b) => b[1].length - a[1].length)) {
        const fresh = files.filter((f) => !taken.has(f));
        if (fresh.length < minSize) continue;
        fresh.forEach((f) => taken.add(f));
        out.push({ token: t, size: fresh.length, files: fresh.slice(0, MAX_PER_PANEL), overflow: Math.max(0, fresh.length - MAX_PER_PANEL) });
    }
    return { clusters: out, clustered: taken.size, stillAlone: un.length - taken.size, unreachedTotal: un.length };
}

export function reportLines() {
    const inv = inventory(), cap = capacity(inv), sug = suggestAll(inv), cl = clusters(inv);
    const L = [];
    L.push("[pagePlacement] what is in a panel, what is not, and what it would take");
    L.push("");
    L.push("  tree pages          " + inv.total);
    L.push("  placed in a panel   " + inv.counts.placed);
    L.push("  unplaced WITH a reason (UNPLACED)  " + inv.counts.reasoned);
    L.push("  *** SILENTLY UNPLACED             " + inv.counts.silent + " ***");
    if (inv.ghosts.length) L.push("  registry entries pointing at files that no longer exist: " + inv.ghosts.join(", "));
    L.push("");
    L.push("  CAPACITY: " + cap.panels + " panels x " + cap.cap + " = " + cap.totalSlots +
           " slots, " + cap.used + " used, " + cap.free + " free");
    L.push("  against " + cap.need + " pages -> SHORTFALL " + cap.shortfall +
           ", at least " + cap.extraPanelsNeeded + " more panels");
    L.push("  *** SO 'JUST PLACE THEM' IS ARITHMETICALLY IMPOSSIBLE INSIDE THE CURRENT CABINET. ***");
    L.push("");
    L.push("  SUGGESTED (evidence clears the floor of " + SCORE_FLOOR + ", panel has room): " + sug.placeable.length);
    for (const [panel, rows] of [...sug.byPanel.entries()].sort((a, b) => b[1].length - a[1].length)) {
        const s = SECTIONS.find((x) => x.id === panel);
        L.push("    " + (s ? s.label : panel).padEnd(22) + rows.length + " page(s), room for " +
               (MAX_PER_PANEL - s.pages.length));
        for (const r of rows.slice(0, 4)) L.push("        " + r.file.padEnd(30) + " " + r.score.toFixed(2) + "  [" + r.evidence.join(" ") + "]");
        if (rows.length > 4) L.push("        ... and " + (rows.length - 4) + " more");
    }
    L.push("");
    L.push("  NO SUGGESTION: " + sug.unreached.length + " -- refused rather than filed by nearest-anything");
    L.push("  of those, " + cl.clustered + " fall into " + cl.clusters.length +
           " token clusters that look like SUBJECTS WITHOUT A PANEL:");
    for (const c of cl.clusters.slice(0, 10))
        L.push("    \"" + c.token + "\"  " + c.size + " pages   e.g. " + c.files.slice(0, 3).join(", "));
    L.push("  and " + cl.stillAlone + " share nothing with anything -- genuinely one-off pages");
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}

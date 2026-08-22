// WebGLEngine/tools/ship/orphanDisposition.mjs -- v3601
// ---------------------------------------------------------------------------------------------------------------
// v3451 SAID "READ THEM ONE AT A TIME" AND HAS BEEN ASKED EIGHT TIMES. READING THEM FOUND THAT THE READING HAD
// ALREADY BEEN DONE, IN PROSE, IN FILES, WHERE NOTHING RE-DERIVES IT.
//
// v3548 sorted graveyard's 104 actionable orphans by evidence already in the tree and v3558 took the
// read-one-at-a-time list to a number small enough to be a task. THE PILE IS **ELEVEN** -- and my own note
// closing v3600 said thirteen, which is this tree's oldest rule collected again: A NUMBER NOTHING DERIVES IS A
// MEMORY. The list here is DERIVED from orphanTriage.classify() on every run and never typed, so it cannot
// drift from the census it is about.
//
// ================================================================================================================
// THE FINDING: SEVERAL OF THE ELEVEN ARE ALREADY DECIDED, AND THE DECISION IS A COMMENT
// ================================================================================================================
//
// brain/rl/occlusionTaxonomy.js line 149 says, of two members of this pile: "So the pair was right and the TASK
// was wrong: bptt.js and occludedHuntEnv.js are worth keeping." THAT IS A DISPOSITION. It was reached by a real
// round, it is correct, and it is written in a sibling module's comment where graveyard cannot read it -- so
// both files land on an undecided-debt pile by default, and have done for every round since.
//
// tools/ship/nextRounds.mjs carries another: physics/imagePair.mjs "declares the pair INCOMPLETE because only
// one side exists". simulation/lbm/lbm2d.js carries a third about lbmShader.js ("the same constants ... so the
// two can never drift apart"). And the handoff's open list carries dispositions for livePanel.js and
// radarManager.js that live in a person's notes and not in the tree at all.
//
// *** THIS IS THE SHAPE THIS TREE NAMES MORE THAN ANY OTHER, ARRIVING AT THE LEVEL OF A DECISION RATHER THAN A
// VALUE: A FACT WRITTEN DOWN WHERE NOTHING RE-DERIVES IT. *** unwiredRegister.mjs exists precisely to hold
// "finished capability nobody calls, with a stated blocker" and it names ZERO of the eleven.
//
// ================================================================================================================
// THE CONTROL, AND IT IS WHAT MAKES THIS A FINDING RATHER THAN AN ACCUSATION
// ================================================================================================================
//
// Every one of those non-gate mentions is PROSE AND NOT AN IMPORT -- checked line by line, not counted.
// skillTrial.mjs is named in ai-bridge/server.js and ai-bridge/skillbookBridge.js, which looks exactly like a
// live HTTP consumer and is two comments describing what the button runs; suspiciousZero.mjs is named in
// physics/instruments.mjs, errorSign.mjs and corroborate.mjs, all prose. SO GRAVEYARD'S RESOLVER IS RIGHT AND
// THE PILE IS A REAL GATE-ONLY PILE. Without this control the round would read as "the classifier is wrong",
// and it is not: the classifier is right and the record is somewhere it cannot look. v3451's own defect --
// A PROSE MENTION COUNTING AS A CONSUMER -- is shown NOT firing here, which is the only way to tell the two
// diagnoses apart.
//
// ================================================================================================================
// AND ONE CHECK I NEARLY BUILT THAT COULD NOT HAVE FAILED
// ================================================================================================================
//
// The signal I first reached for was "is it imported by a gate named for something ELSE" -- a consumer test.
// IT IS TRUE FOR ALL ELEVEN BY CONSTRUCTION: v3558's classifier already routes anything with a DEDICATED gate
// (a <basename>-selfcheck.mjs anywhere in the tree) out of this pile, so every survivor's importers are gates
// named for something else, necessarily. ASKING A QUESTION WHOSE ANSWER IS STRUCTURALLY GUARANTEED IS NOT
// EVIDENCE -- v3551's defect exactly, in the round examining v3551's own classifier. Caught before it was
// built, and the gate DRIVES the collapse rather than describing it.
//
// What survives is the COUNT of distinct gate consumers, and it is offered as EVIDENCE OF DEGREE AND NOT AS A
// VERDICT: suspiciousZero.mjs is imported by FOUR gates across four unrelated subjects (plasmaKrbn, census,
// crossDevice, lensTidal), coverage.mjs by THREE including the ship-list gateQuality, occludedHuntEnv.js by
// THREE occlusion gates, skillTrial.mjs by TWO -- and seven members by exactly ONE. A module four unrelated
// gates depend on is doing the job v3448 called legitimate; a module one gate imports is the ambiguous case.
// THE COUNT RANKS; IT DOES NOT DECIDE, and a count presented as a verdict is the defect this file is about.
//
// NOTHING IS RATCHETED AND graveyard's NUMBER IS NOT TOUCHED. No disposition here is invented: each is QUOTED
// from the tree with its file and line, and the members with no recorded disposition are listed AS UNDECIDED
// rather than given one, because writing seven reasons would be fabricating provenance at scale (v3548).
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { classify, ENG } from "./orphanTriage.mjs";

/** A disposition ALREADY IN THE TREE, quoted with where it lives. `needle` is re-found on every run. */
export const RECORDED = [
    { module: "brain/rl/bptt.js", at: "brain/rl/occlusionTaxonomy.js",
      needle: "bptt.js and occludedHuntEnv.js are worth keeping",
      says: "KEEP -- a real round settled it: the pair was right and the TASK was wrong." },
    { module: "brain/rl/occludedHuntEnv.js", at: "brain/rl/occlusionTaxonomy.js",
      needle: "bptt.js and occludedHuntEnv.js are worth keeping",
      says: "KEEP -- same sentence, same round; it names both files." },
    { module: "physics/imagePair.mjs", at: "tools/ship/nextRounds.mjs",
      needle: "declares the pair INCOMPLETE because only one side exists",
      says: "INCOMPLETE BY DESIGN -- it is half a consistency pair and says so; the other side is a round." },
    { module: "simulation/lbm/lbmShader.js", at: "simulation/lbm/lbm2d.js",
      needle: "so the two can never drift apart",
      says: "SHARED-CONSTANTS SIBLING -- lbm2d states the relationship; it is WGSL and unrunnable in the sandbox." },
];

/** Members with NO disposition anywhere in the tree. Listed, NOT decided. */
export function undecided(pile) {
    const named = new Set(RECORDED.map((r) => r.module));
    return pile.filter((m) => !named.has(m));
}

/** Every gate that imports a module, by resolved specifier -- an IMPORT, never a mention. */
export function gateConsumers(rel, files) {
    const base = rel.split("/").pop().replace(/\.m?js$/, "");
    const re = new RegExp("from\\s+[\"'][^\"']*\\b" + base + "(\\.m?js)?[\"']");
    return files.filter((f) => f !== rel && /-selfcheck\.mjs$/.test(f) && re.test(readFileSync(join(ENG, f), "utf8")));
}

/** Non-gate files NAMING a module, split into IMPORT and PROSE. The control: prose must not count. */
export function nonGateMentions(rel, files) {
    const base = rel.split("/").pop().replace(/\.m?js$/, "");
    const imp = new RegExp("from\\s+[\"'][^\"']*\\b" + base + "(\\.m?js)?[\"']");
    // *** THE NAME TEST MUST NAME THE FILE, NOT THE CONCEPT. A first version matched the bare basename and
    // reported coverage.mjs "mentioned" in SIXTY-FOUR files -- every occurrence of the English word "coverage".
    // AN IMPLAUSIBLE NUMBER IS A FINDING ABOUT THE INSTRUMENT (v3448), and the fix is to require the EXTENSION:
    // a reference to a module names a FILE. A HYPHEN IS NOT A BOUNDARY EITHER: \\b let bzw-coverage.mjs\n    // match coverage.mjs, so the guard refuses a preceding word character OR dash. ***
    const name = new RegExp("(?<![\\w-])" + base + "\\.m?js\\b");
    const out = { imports: [], prose: [] };
    for (const f of files) {
        if (f === rel || /-selfcheck\.mjs$/.test(f)) continue;
        if (/orphanTriage\.mjs$|orphanDisposition\.mjs$|^main\.js$/.test(f)) continue;   // registers and the changelog
        const src = readFileSync(join(ENG, f), "utf8");
        if (!name.test(src)) continue;
        (imp.test(src) ? out.imports : out.prose).push(f);
    }
    return out;
}

/** THE QUESTION THAT CANNOT FAIL, driven so the collapse is seen rather than asserted. */
export function guaranteedQuestion(pile, files) {
    // "is it imported by a gate named for something other than itself" -- true for every member, necessarily,
    // because a module WITH a same-named gate was routed out of this pile before it ever got here.
    let holds = 0;
    for (const m of pile) {
        const base = m.split("/").pop().replace(/\.m?js$/, "");
        const dedicated = files.some((f) => f.endsWith("/" + base + "-selfcheck.mjs") || f === base + "-selfcheck.mjs");
        const cons = gateConsumers(m, files);
        if (!dedicated && cons.length > 0) holds++;
    }
    return { members: pile.length, holds, discriminates: holds !== pile.length };
}

export const MEASURED_V3601 = {
    pileSize: 11,
    myNoteSaid: 13,
    recordedDispositions: 4,
    undecidedCount: 7,
    unwiredRegisterNames: 0,
    gateConsumerCounts: { "tools/roundhouse/suspiciousZero.mjs": 4, "tools/roundhouse/coverage.mjs": 3,
                          "brain/rl/occludedHuntEnv.js": 3, "tools/roundhouse/skillTrial.mjs": 2 },
    control: "EVERY non-gate mention of every member is PROSE and NOT an import -- checked line by line. " +
             "skillTrial.mjs is named in ai-bridge/server.js and skillbookBridge.js, which looks like a live " +
             "HTTP consumer and is two comments. SO GRAVEYARD'S RESOLVER IS RIGHT and the pile is real.",
    guaranteedQuestion: "'imported by a gate named for something else' is TRUE FOR ALL ELEVEN BY CONSTRUCTION, " +
                        "because v3558 routes anything with a dedicated gate out of the pile first. v3551's " +
                        "defect, caught before it was built; the gate drives the collapse.",
    notClaimed: "NO disposition is invented -- each is QUOTED from the tree with its file. The seven with no " +
                "record are listed AS UNDECIDED. Nothing is ratcheted and graveyard's count is untouched.",
};

function allFiles() {
    const out = [];
    const walk = (abs, pre) => {
        for (const e of readdirSync(abs, { withFileTypes: true })) {
            const rel = pre ? pre + "/" + e.name : e.name;
            if (e.isDirectory()) { if (!/^(node_modules|\.git)$/.test(e.name)) walk(join(abs, e.name), rel); }
            else if (/\.m?js$/.test(e.name)) out.push(rel);
        }
    };
    walk(ENG, "");
    return out;
}

export function reportLines() {
    const L = [];
    const files = allFiles();
    const pile = classify().split.unclassified.slice();
    L.push("[orphanDisposition] graveyard's read-one-at-a-time pile, read one at a time");
    L.push("");
    L.push("  THE PILE IS " + pile.length + " (derived from orphanTriage.classify(), never typed).");
    if (pile.length !== MEASURED_V3601.myNoteSaid)
        L.push("  MY OWN NOTE CLOSING v3600 SAID " + MEASURED_V3601.myNoteSaid + " -- a number nothing derives is a memory.");
    L.push("");
    L.push("1. ALREADY DECIDED, AND THE DECISION IS A COMMENT (quoted, with where it lives)");
    for (const r of RECORDED) {
        const live = existsSync(join(ENG, r.at)) && readFileSync(join(ENG, r.at), "utf8").includes(r.needle);
        L.push("   " + r.module);
        L.push("      " + r.says);
        L.push("      source: " + r.at + (live ? "  [still there]" : "  [!! THE SENTENCE IS GONE -- re-read the file]"));
    }
    L.push("");
    L.push("2. NO DISPOSITION ANYWHERE IN THE TREE -- LISTED, NOT DECIDED");
    for (const m of undecided(pile)) {
        const c = gateConsumers(m, files);
        L.push("   " + m.padEnd(38) + c.length + " gate consumer" + (c.length === 1 ? "" : "s"));
    }
    L.push("");
    L.push("3. THE CONTROL: every non-gate mention is PROSE, not an import");
    let proseTotal = 0, importTotal = 0;
    for (const m of pile) {
        const n = nonGateMentions(m, files);
        proseTotal += n.prose.length; importTotal += n.imports.length;
        if (n.prose.length) L.push("   " + m.padEnd(38) + "prose in: " + n.prose.join(", "));
    }
    L.push("   TOTALS: " + proseTotal + " prose mentions, " + importTotal + " imports.");
    L.push("   " + (importTotal === 0 ? "GRAVEYARD'S RESOLVER IS RIGHT -- the pile is a real gate-only pile."
                                      : "!! AN IMPORT EXISTS -- a member is NOT an orphan; re-run graveyard."));
    L.push("");
    L.push("4. THE QUESTION THAT CANNOT FAIL, DRIVEN");
    const g = guaranteedQuestion(pile, files);
    L.push("   'imported by a gate named for something else' holds for " + g.holds + " of " + g.members +
           " -- " + (g.discriminates ? "it discriminates" : "IT DISCRIMINATES NOTHING, which is why it is not used"));
    L.push("");
    L.push("  " + MEASURED_V3601.notClaimed);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}

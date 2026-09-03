#!/usr/bin/env node
// WebGLEngine/tools/ship/citedSources-selfcheck.mjs -- v4258
//
// Run: node tools/ship/citedSources-selfcheck.mjs
//
// *** TWO RECORDS OF THE SAME FACT, GROWN FROM OPPOSITE ENDS, WITH ZERO OVERLAP. ***
//
// world/reachedLicences.mjs is filled by ASSESSMENT rounds: somebody read a repository, decided, and wrote
// down what the licence was and usually that nothing was taken. Module headers are filled by BUILD rounds:
// somebody took an idea and wrote down whose it was, in the file where the idea landed.
//
// Censused at v4258: 54 distinct `owner/repo (LICENCE)` citations in module headers, and NOT ONE of them was
// in the register -- while all eleven register entries appeared in NO header. The two sets were disjoint.
// That is not a small bookkeeping gap; it means the register answers "what did we look at and refuse" and
// nothing at all answers "whose ideas are in the code".
//
// v4257 built the vendored register and noted this shape was unchecked. This is the check.
//
// *** WHAT THIS GATE DOES NOT DO: demand the 52 be imported. *** Each entry needs grantorHoldsRights,
// licenceExists, redistributable and a `why` that says what was taken -- judgements made one source at a
// time, and inventing them to clear a number would be worse than owing it. The number is a ratchet instead.
"use strict";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { REACHED_SOURCES, UNREGISTERED_CITED_BASELINE } from "../../world/reachedLicences.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Every `owner/repo (LICENCE)` in the first 6 KB of a module -- the header, where this tree states provenance.
 *
 * Deliberately narrow. It matches a citation that names a LICENCE, because that is the shape an author uses
 * when they are recording a grant rather than mentioning a project in passing. A bare `owner/repo` would drag
 * in every URL and path in the tree, and a scan that flags everything teaches people to ignore it.
 */
function citedRepos() {
    const RE = /\b([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\s*\((MIT|Apache-?2\.0|BSD-?3|BSD-3-Clause|GPL-3\.0[^),]*|AGPL-3\.0|CC0)[,)]/g;
    const hits = new Map();
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (/node_modules|^\.git$|^vendor$|GPU_Assets|demos_code/.test(e.name)) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(mjs|js)$/.test(e.name)) continue;
            const s = fs.readFileSync(p, "utf8").slice(0, 6000);
            let m; RE.lastIndex = 0;
            while ((m = RE.exec(s))) {
                const repo = m[1];
                if (/\.js$/.test(repo)) continue;   // "ev/esSprites.js" is a path, not a repository
                if (!hits.has(repo)) hits.set(repo, { licence: m[2], files: new Set() });
                hits.get(repo).files.add(path.relative(ENG, p));
            }
        }
    };
    walk(ENG);
    return hits;
}

console.log("citedSources-selfcheck -- whose ideas are in the code, and whether anything says so\n");

// =============================================================================================================
console.log("1. the census, and the disjointness that is the whole finding");
{
    const cited = citedRepos();
    const reg = new Set(REACHED_SOURCES.map((e) => e.repo.toLowerCase()));
    const names = [...cited.keys()];
    const registered = names.filter((r) => reg.has(r.toLowerCase()));
    const missing = names.filter((r) => !reg.has(r.toLowerCase()));
    ok("!! the scan finds a substantial population -- it is not looking for something rare",
        names.length >= 40, names.length + " distinct repositories cited WITH a licence in a module header, " +
        "across " + [...cited.values()].reduce((a, v) => a + v.files.size, 0) + " files");
    ok("!! *** AND AT v4260 EXACTLY " + registered.length + " OF THEM ARE IN THE REGISTER ***",
        registered.length >= 2,
        "registered: " + (registered.join(", ") || "none") + ". Before this round it was ZERO -- the two sets " +
        "were completely disjoint, and all " + REACHED_SOURCES.length + " register entries appeared in no " +
        "header at all. *** THE REGISTER ANSWERS 'WHAT DID WE LOOK AT AND REFUSE'; NOTHING ANSWERED 'WHOSE " +
        "IDEAS ARE IN THE CODE'. ***");
    // *** THIS READ `<=` AND A SABOTAGE WALKED THROUGH IT. *** Raising the baseline to 999 left the gate
    // green, because a bound is satisfied more easily the looser it gets -- so the number guarding the debt
    // could be edited upward and nothing would say so. The debt is EXACTLY measurable, so the assertion is
    // equality: the baseline must BE the debt, not bound it. Progress means editing it down in the same
    // commit that clears an entry, and any rise is a red check and a visible diff rather than a quiet
    // loosening. A ratchet whose stop can be moved is not a ratchet.
    ok("!! *** THE DEBT IS EXACTLY " + missing.length + ", AND THE BASELINE MUST EQUAL IT (" + UNREGISTERED_CITED_BASELINE + ") ***",
        missing.length === UNREGISTERED_CITED_BASELINE,
        "a ratchet rather than a demand. Importing 52 entries would mean inventing grantorHoldsRights, " +
        "licenceExists and a `why` for each -- judgements, one source at a time -- and fabricating them to " +
        "clear a number is worse than owing it. A round that takes an idea from a new source and records it " +
        "moves this down; one that takes without recording moves it UP and goes red.");
    report("still owed, first twelve: " + missing.slice(0, 12).join(", "));
}

// =============================================================================================================
console.log("\n2. *** #53 WAS BUILT BEFORE IT WAS RECORDED, WHICH IS WHY IT SAT OPEN ***");
{
    const sfx = REACHED_SOURCES.find((e) => /loov\/jsfx/.test(e.repo));
    const anim = REACHED_SOURCES.find((e) => /animatelo/.test(e.repo));
    ok("!! loov/jsfx is registered, and its taking is audio/sfxModel.mjs",
        !!sfx && sfx.takenPaths.includes("audio/sfxModel.mjs") && fs.existsSync(path.join(ENG, "audio/sfxModel.mjs")),
        "built at v4190 -- a parameter block in, a buffer of samples out, so a gate can render a sound and " +
        "hash it. The register entry is four rounds younger than the code.");
    ok("!! gibbok/animatelo is registered, and its taking is ui/domAnimation.mjs",
        !!anim && anim.takenPaths.includes("ui/domAnimation.mjs") && fs.existsSync(path.join(ENG, "ui/domAnimation.mjs")),
        "built at v4191. Its header already read 'DOM ANIMATIONS AS DATA, AND AS SOMETHING THE DIRTY FLAG CAN " +
        "SEE' -- which is backlog #53's own wording, in the file, since before the item was written down as " +
        "outstanding.");
    // *** AND THE TAKINGS ARE REAL FILES WITH REAL CONSUMERS, not a citation attached to nothing. ***
    const consumers = (rel) => {
        let n = 0;
        const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (/node_modules|^\.git$|^vendor$/.test(e.name)) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(mjs|js|html)$/.test(e.name)) continue;
            if (path.relative(ENG, p) === rel) continue;
            if (fs.readFileSync(p, "utf8").includes(path.basename(rel))) n++;
        } };
        walk(ENG); return n;
    };
    const cs = consumers("audio/sfxModel.mjs"), ca = consumers("ui/domAnimation.mjs");
    ok("!! *** BOTH TAKINGS HAVE CONSUMERS: sfxModel " + cs + ", domAnimation " + ca + " ***",
        cs >= 5 && ca >= 3,
        "which is what separates this from #39's finding -- modules wired to nothing but their own gates. " +
        "These are used, and that is precisely why the missing register entries mattered rather than being " +
        "tidy-mindedness.");
}

// =============================================================================================================
console.log("\n3. what the scan cannot see, stated so the number is not read as complete");
{
    const cited = citedRepos();
    ok("   the scan reads headers only -- the first 6 KB of each .mjs/.js",
        cited.size > 0,
        "a citation further down a long file is invisible to it, and so is any provenance written in a .html " +
        "page, a .md doc or a comment that names a repository WITHOUT a licence in brackets. The count is a " +
        "floor on the debt, never a ceiling.");
    // *** THE COPYLEFT SUBSET IS COUNTED, NOT ASSERTED. *** The closing note first said "four of the 52
    // carry GPL-3.0 or AGPL-3.0" from memory of the listing; it is checked here so the sentence cannot go
    // stale the next time one is cited, which is exactly how a prose number rots.
    const copyleft = [...cited.entries()].filter(([, v]) => /GPL/.test(v.licence)).map(([r]) => r);
    ok("!! *** AND THE RECIPROCAL SUBSET IS NAMED: " + copyleft.length + " of the cited sources are (A)GPL ***",
        copyleft.length === 4,
        copyleft.join(", ") + ". These are the ones a person should read first, because the register's " +
        "severity scale has RECIPROCAL above no-redistribution for a reason: a taking that is fine under MIT " +
        "can be a source-disclosure obligation under GPL, and none of the four is an entry yet, so none has " +
        "been through that judgement.");
    report("*** AND IT CANNOT TELL A TAKING FROM A REFUSAL. *** ui/gazeDwell.mjs names Ramotion/vr-menu-demo " +
           "in order to say its code is REFUSED; render/silhouette.mjs names img2threejs to say its NUMBERS " +
           "were not taken. Both are citations of a refusal, which is the shape reachedLicences' own " +
           "ElasticProgress entry documents as 'the opposite of taken'. A scan flags the mention and a person " +
           "decides -- which is why this gate reports a POPULATION and never auto-files an entry.");
}

// =============================================================================================================
// ---- v4258 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL -----------------------
//
// (world/reachedLicences.mjs md5 261adecd9cd7e0f25f53d977ad44e240 before and after all three.)
//
//   A  the debt baseline raised to 999. -> *** ALL GREEN ON THE FIRST RUN, AND THE CHECK WAS THE PROBLEM. ***
//      It asserted `missing <= BASELINE`, and a bound is satisfied more easily the looser it gets, so the
//      number guarding the debt could be edited upward and nothing would say so. The debt is EXACTLY
//      measurable, so the assertion is now equality -- the baseline must BE the debt, not bound it. Progress
//      means editing it down in the commit that clears an entry; a rise is a red check and a visible diff.
//      With that change the sabotage goes 1 RED. *** A RATCHET WHOSE STOP CAN BE MOVED IS NOT A RATCHET, ***
//      and the same shape is worth looking for in the four ratchets #134 records as red at HEAD.
//
//   B  loov/jsfx's takenPaths emptied, so it is registered while claiming nothing was taken. -> 1 RED. The
//      register's value is not the row, it is the row AGREEING WITH THE TREE.
//
//   C  gibbok/animatelo renamed so it no longer matches the citation. -> 2 RED, and the pair is the point:
//      the registered count falls to 1 AND the debt rises to 53. One edit moves both halves of the census,
//      which is what says the two numbers are reading the same fact from opposite ends.
//
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether any of the 52 is a source that FORBIDS what was done with it. The scan " +
    "reads the licence an author typed in brackets and does not verify it upstream, and reachedLicences' " +
    "severity machinery -- ENCUMBERED, reciprocal, no-redistribution -- is not applied to any of them, " +
    "because they are not entries yet -- the four reciprocal ones are named in section 3 and are where a " +
    "person should start.");
process.exit(fails ? 1 : 0);

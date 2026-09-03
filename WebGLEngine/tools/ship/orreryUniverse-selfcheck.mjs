// WebGLEngine/tools/ship/orreryUniverse-selfcheck.mjs -- v4432
//
// Run: node tools/ship/orreryUniverse-selfcheck.mjs
//
// Grades world/orreryUniverse.mjs, orrery-universe.json, and the upstreamFrom() repair -- #139.
//
// *** SECTION 2 IS THE ONE THAT MATTERS AND IT GRADES A MECHANISM, NOT AN INSTANCE. *** The round found one
// misspelled owner. A check that asserted "the wasm body says justjake" would pass forever and catch nothing
// else. What is asserted instead is the RULE: no provenance file may leave a contested owner unresolved, and
// the resolution is the majority over the same repo name. That would have caught this one before anybody
// looked at GitHub, and catches the next one.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as U from "../../world/orreryUniverse.mjs";
import { upstreamFrom } from "../../world/orreryAuthor.mjs";
import { biomeIdFor, BIOME_ORDER } from "../../world/repoHeightfield.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const UNI = JSON.parse(fs.readFileSync(path.join(ENG, "orrery-universe.json"), "utf8"));
const AUTH = JSON.parse(fs.readFileSync(path.join(ENG, "orrery-authors.json"), "utf8"));

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const walk = (d, out = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p, out); else out.push(p);
    }
    return out;
};
const biomeOf = (p) => BIOME_ORDER[biomeIdFor(p)];

// ---- 1. THE AXES: ONE REACHABLE, TWO REFUSED WITH REASONS RATHER THAN WITH PROXIES ---------------------------
{
    say("#139 asked for three axes. What came back when each was tried?");
    const reach = U.AXES.filter((a) => a.reachable), ref = U.AXES.filter((a) => !a.reachable);
    say("  reachable: " + reach.map((a) => a.axis).join(", ") + "   refused: " + ref.map((a) => a.axis).join(", "));
    ok("three axes were asked for and each carries a verdict",
        U.AXES.length === 3 && reach.length === U.MEASURED_AT_V4432.axesReachable &&
        ref.length === U.MEASURED_AT_V4432.axesRefused);
    ok("!! every refusal names the endpoint it tried and why it failed -- not just that it did",
        ref.every((a) => a.via && a.why && a.why.length > 40),
        "a refusal without a mechanism is indistinguishable from not having looked");
    ok("...and the stored data records them too, so the refusal survives without this module",
        Array.isArray(UNI.refused) && UNI.refused.length === ref.length &&
        UNI.refused.every((r) => r.why && r.notASubstitute),
        "each also says what a LOCAL proxy would have measured instead, and why that is a different quantity " +
        "wearing the right label");
    ok("the reachable axis is actually present on every body",
        UNI.bodies.length === U.MEASURED_AT_V4432.upstreams &&
        UNI.bodies.every((b) => typeof b.language === "string" && b.language.length),
        `${UNI.bodies.length} bodies, languages: ${[...new Set(UNI.bodies.map((b) => b.language))].sort().join(", ")}`);
}

// ---- 2. *** THE OWNER NOBODY HAD ASKED ABOUT, AND THE RULE THAT NOW RESOLVES IT *** --------------------------
{
    say("");
    const readme = path.join(ENG, "vendor", "wasm", "quickjs", "quickjs-emscripten-core", "README.md");
    const text = fs.readFileSync(readme, "utf8");
    const wrong = (text.match(/github\.com\/justjakel\//g) || []).length;
    const right = (text.match(/github\.com\/justjake\//g) || []).length;
    say(`  the file the scanner reads: ${wrong} occurrence(s) of justjakel, ${right} of justjake`);
    ok("the file really does disagree with itself -- otherwise there is nothing here to report",
        wrong === U.MEASURED_AT_V4432.wrongOccurrencesInFile &&
        right === U.MEASURED_AT_V4432.rightOccurrencesInFile && wrong === 1 && right > 20,
        "and the single wrong one is line 5, the identity line, which is the only line anything read");

    const res = upstreamFrom(text);
    ok("!! *** upstreamFrom resolves the owner by MAJORITY over the repo the first URL names ***",
        res.owner === U.MEASURED_AT_V4432.realOwner && res.repo === "quickjs-emscripten",
        `${JSON.stringify(res.contested)} -- it took the FIRST URL before v4432, and the first is not more ` +
        "authoritative than the other twenty-nine");
    ok("...and it REPORTS the disagreement rather than silently resolving it",
        Array.isArray(res.contested) && res.contested.length === 2 &&
        res.contested[0].count > res.contested[1].count,
        "a vote that hides the losing side is a second guess wearing a first guess's confidence");

    // *** THE RULE, NOT THE INSTANCE: no body may be left carrying a contested owner. ***
    const contested = AUTH.bodies.filter((b) => b.upstream && b.upstream.contested);
    say("  bodies whose provenance file names more than one owner for their repo: " +
        (contested.length ? contested.map((b) => b.name).join(", ") : "none"));
    ok("!! every recorded owner is the majority one, for every body, not just the one this round found",
        AUTH.bodies.every((b) => !b.upstream || !b.upstream.contested ||
            b.upstream.contested[0].owner === b.upstream.owner),
        `${contested.length} contested of ${AUTH.bodies.length}; a check naming "wasm" or "justjake" would ` +
        "pass forever and catch nothing else");
    ok("the correction moved exactly the record that was wrong and left the others alone",
        AUTH.bodies.filter((b) => b.upstream && b.upstream.owner === "justjakel").length === 0 &&
        AUTH.bodies.filter((b) => b.upstream && b.upstream.owner === "justjake").length === 1 &&
        AUTH.counts.withUpstream === 11,
        "gifenc's git:// URL and htmx's LICENSE-blob URL say more about where the bytes came from than a repo " +
        "root does, so a canonical URL is synthesised ONLY when the vote overrides the first URL's owner");
    ok("and the vendored text was NOT edited -- the stray L is still in the file, as measured",
        wrong === 1,
        "whether upstream shipped it cannot be decided from here (its README is behind a per-repo endpoint), " +
        "so the DERIVED record is corrected and the QUOTED text is left alone");
}

// ---- 3. THE LANGUAGE AXIS AGAINST THE ANSWER THE TREE ALREADY HAD --------------------------------------------
{
    say("");
    say("GitHub's language against world/repoHeightfield.js's LANGUAGE_BIOME, for the same bodies");
    const tally = { agree: 0, built: 0, transpiled: 0, paperwork: 0, unexplained: 0 };
    const verdicts = [];
    const rows = [];
    for (const b of AUTH.bodies) {
        if (!b.upstream || !b.upstream.owner) continue;
        const dir = path.join(ENG, "vendor", b.name);
        if (!fs.existsSync(dir)) continue;
        const files = walk(dir);
        const byExt = new Map();
        for (const f of files) {
            const e = (f.split(".").pop() || "").toLowerCase();
            byExt.set(e, (byExt.get(e) || 0) + fs.statSync(f).size);
        }
        const dominantExt = [...byExt.entries()].sort((x, y) => y[1] - x[1])[0][0];
        const codeFiles = files.filter((f) => !U.PAPERWORK.has(path.basename(f))).length;
        const u = UNI.bodies.find((x) => x.owner === b.upstream.owner && x.repo === b.upstream.repo);
        const want = U.extsFor(u ? u.language : null);
        const upstreamLanguageFiles = files.filter((f) => want.includes((f.split(".").pop() || "").toLowerCase())).length;
        const c = U.classifyLanguage({ dominantExt, treeBiome: biomeOf("x." + dominantExt),
                                       ghLanguage: u ? u.language : null, biomeOf, codeFiles,
                                       upstreamLanguageFiles });
        tally[c.verdict]++;
        verdicts.push({ name: b.name, verdict: c.verdict, language: u ? u.language : null, byExt });
        rows.push(`${b.name} ${c.verdict}`);
    }
    say("  " + rows.join("   "));
    say(`  agree ${tally.agree}  built ${tally.built}  transpiled ${tally.transpiled}  ` +
        `paperwork ${tally.paperwork}  unexplained ${tally.unexplained}`);
    ok("the two answers agree on most bodies, which is what makes the exceptions worth reading",
        tally.agree === U.MEASURED_AT_V4432.languageAgree && tally.agree >= 6 &&
        tally.built === U.MEASURED_AT_V4432.languageBuilt &&
        tally.transpiled === U.MEASURED_AT_V4432.languageTranspiled);
    // *** AND BUILT_EXT WENT UNTESTED THE MOMENT THE ORDERING WAS FIXED. *** Before it, adding "js" to the
    // artifact set misclassified jolt and went red. After it, jolt is caught by the absence test first, so
    // BUILT_EXT is only consulted for box3d and wasm and a bogus entry costs nothing -- inert today and
    // wrong the first time a JS body's biomes disagree. The tree's own legend already knows which extensions
    // are source, so the set is held against it rather than against a list somebody remembers to update.
    const sourceExts = [...U.BUILT_EXT].filter((e) => biomeOf("x." + e) !== biomeOf("x.unknownextension"));
    ok("!! no extension the tree calls SOURCE may sit in the build-artifact set",
        sourceExts.length === 0,
        `BUILT_EXT is ${[...U.BUILT_EXT].join(" ")}; LANGUAGE_BIOME classifies none of them, which is what ` +
        '"build artifact" has to mean. Adding "js" cost zero red once the ordering was fixed');
    ok("...and the two output mechanisms are genuinely different, not one rule written twice",
        fs.readdirSync(path.join(ENG, "vendor", "jolt")).filter((f) => /\.(cpp|h|hpp|cc)$/.test(f)).length === 0 &&
        walk(path.join(ENG, "vendor", "box3d")).filter((f) => /\.(c|h)$/.test(f)).length > 10,
        "vendor/jolt has no C++ at all while vendor/box3d has 15 .c/.h files -- so 'the source is absent' " +
        "explains jolt and NOT box3d, and 'the dominant extension is an artifact' explains box3d and NOT jolt");
    ok("!! *** and NO disagreement is unexplained -- each has a named mechanism ***",
        tally.unexplained === U.MEASURED_AT_V4432.languageUnexplained && tally.unexplained === 0,
        `${tally.built} have a BUILD ARTIFACT as their dominant extension (a 1.45 MB .a, 511 KB of .wasm), ` +
        `${tally.transpiled} have NOT ONE FILE of their upstream language (jolt is C++ and taichi-js is ` +
        `TypeScript; both are one bundled .js here), and ${tally.paperwork} carries no code at all. ` +
        "THREE MECHANISMS, and neither of the first " +
        "two fits the other's cases -- box3d and wasm DO vendor their source, jolt's .js is source everywhere " +
        "else in this tree. An unexplained disagreement would be a defect; these are two questions with " +
        "two correct answers");
    // *** AND AN "agree" THAT NOTHING CORROBORATES IS NOT EVIDENCE. *** orrery-universe.json is fetched from
    // GitHub and this gate has no network, so a corrupted language cannot be re-checked against its source.
    // MEASURED: flipping three.js from JavaScript to TypeScript read ALL PASS -- both map to "forest", so the
    // biome comparison agreed with itself about a value that was wrong. What CAN be checked offline is that
    // the vendored bytes corroborate the claim: a body whose two answers agree must actually contain files of
    // the language GitHub named. vendor/draco holds .js and no .ts, so the flip goes red now.
    const uncorroborated = verdicts.filter((v) => v.verdict === "agree")
        .filter((v) => !U.extsFor(v.language).some((e) => v.byExt.has(e)))
        .map((v) => `${v.name} claims ${v.language}, has none`);
    say("  agreeing bodies whose vendored bytes do NOT contain the claimed language: " +
        (uncorroborated.length ? uncorroborated.join("; ") : "none"));
    ok("!! every agreeing body's vendored bytes CONTAIN the language GitHub named -- the offline corroboration",
        uncorroborated.length === 0,
        "the fetched data cannot be re-fetched here, so an agreement that rests only on two maps landing in " +
        "one biome is not evidence. Flipping three.js to TypeScript cost ZERO RED before this check");
    ok("...and the data says when it was fetched, because an unstamped external reading cannot go stale visibly",
        typeof UNI.built === "string" && /^\d{4}-\d{2}-\d{2}$/.test(UNI.built) && typeof UNI.source === "string",
        `built ${UNI.built}`);
    ok("...and the paperwork body really does carry no code, rather than being classified as convenient",
        fs.readdirSync(path.join(ENG, "vendor", "slug")).every((f) => U.PAPERWORK.has(f)),
        "vendor/slug is " + fs.readdirSync(path.join(ENG, "vendor", "slug")).join(" and ") + " -- nothing else");
}

// ---- 4. A CATEGORY BECOMES A PLANE, WHICH IS THE ONLY ORBITAL ELEMENT IT CAN HONESTLY BE ---------------------
{
    say("");
    const langs = UNI.bodies.map((b) => b.language);
    const el = UNI.bodies.map((b) => ({ b, a: U.axesFor(b, langs) }));
    const byLang = new Map();
    for (const { b, a } of el) {
        const k = b.language;
        if (byLang.has(k) && byLang.get(k) !== a.inclinationDeg) byLang.set(k, NaN); else byLang.set(k, a.inclinationDeg);
    }
    ok("!! every body of one language lands in ONE plane, and different languages in different planes",
        [...byLang.values()].every(Number.isFinite) &&
        new Set(byLang.values()).size === new Set(langs).size,
        `${new Set(langs).size} languages -> ${new Set(byLang.values()).size} inclinations. A language is not ` +
        "an ordered quantity, so it cannot be a radius without inventing an order; a plane is a category");
    ok("...and the ordering is derived from the data, not typed",
        /langs\.indexOf\(body\.language\)/.test(fs.readFileSync(path.join(ENG, "world", "orreryUniverse.mjs"), "utf8")) &&
        U.axesFor({ language: "C", stars: 1, createdAt: "2020-01-01" }, ["C", "JavaScript"]).inclinationDeg ===
        U.axesFor({ language: "C", stars: 1, createdAt: "2020-01-01" }, ["JavaScript", "C"]).inclinationDeg,
        "the list is sorted inside axesFor, so the caller's order cannot change any body's plane");
    const three = UNI.bodies.find((b) => b.repo === "three.js"), gif = UNI.bodies.find((b) => b.repo === "gifenc");
    ok("stars become a radius on a log scale, because linearly eight of nine would be the same dot",
        U.axesFor(three, langs).radius / U.axesFor(gif, langs).radius < 2.5 && three.stars / gif.stars > 300 &&
        (three.stars / gif.stars) / (U.axesFor(three, langs).radius / U.axesFor(gif, langs).radius) > 100,
        `${three.stars} and ${gif.stars} stars is a factor of ${(three.stars / gif.stars).toFixed(0)}; the radii ` +
        `are ${U.axesFor(three, langs).radius.toFixed(2)} and ${U.axesFor(gif, langs).radius.toFixed(2)}`);
}

console.log("orreryUniverse-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);

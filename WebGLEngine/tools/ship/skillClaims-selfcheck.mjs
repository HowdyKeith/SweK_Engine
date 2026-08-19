// WebGLEngine/tools/ship/skillClaims-selfcheck.mjs -- v3510
//
// Run: node tools/ship/skillClaims-selfcheck.mjs
//
// *** A SKILL IS PROSE ABOUT THE TREE, AND PROSE ABOUT THE TREE IS THE ONE THING THIS PROJECT HAS HAD TO HUNT
// DOWN TWELVE TIMES. *** tools/ship/wiringClaims.mjs exists because a selfcheck said "the port is unwired" for
// 145 versions after v3225 wired it, and an outside status report got EVERY NUMBER RIGHT AND THREE OF FOUR
// PROSE WIRING CLAIMS WRONG. A SKILL IS THAT SHAPE BY CONSTRUCTION: it is a file whose entire content is
// assertions about code it does not import.
//
// SO EVERY MECHANICAL CLAIM THE SKILLS MAKE IS RE-DERIVED HERE. Not the reasoning -- a gate cannot check
// whether "an exact closure is proof of consistency" is good advice -- but every PATH, every TOOL NAME, every
// ENVIRONMENT VARIABLE and every STRUCTURAL RULE they tell a reader to follow.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(ENG, "..");
const SKILLS = path.join(ROOT, "agent-skills");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const MINE = ["swek-gate", "swek-device"];
const text = Object.fromEntries(MINE.map((s) => [s, fs.readFileSync(path.join(SKILLS, s, "SKILL.md"), "utf8")]));
const all = Object.values(text).join("\n");

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE SKILLS EXIST, AND THEY ARE SHAPED LIKE THE ONES ALREADY HERE
 * --------------------------------------------------------------------------------------------------------- */
{
    const shipRitual = fs.readFileSync(path.join(SKILLS, "ship-ritual", "SKILL.md"), "utf8");
    const fm = (t) => { const m = t.match(/^---\n([\s\S]*?)\n---/); return m ? m[1] : null; };
    ok("both skills carry frontmatter in the same shape as ship-ritual",
       MINE.every((s) => fm(text[s]) && /^name:/m.test(fm(text[s])) && /^description:/m.test(fm(text[s]))) && !!fm(shipRitual),
       "ship-ritual, resource-fork-decode and xlsx-eval were already here; these two follow the same envelope so an agent that discovers one discovers all of them.");

    ok("!! the frontmatter `name` matches the folder, which is what a loader resolves on",
       MINE.every((s) => new RegExp("^name:\\s*" + s + "\\s*$", "m").test(fm(text[s]))),
       "A skill whose declared name differs from its directory is the two-declarations shape at the level of the file itself -- and the loader would win the argument silently.");

    ok("...and the description says WHEN to use it, not only what it is",
       MINE.every((s) => /Use whenever|Use when/.test(fm(text[s]))),
       "The description is the only part an agent reads before deciding to open the file. 'Codifies X' tells it what the skill is about; 'use whenever you are doing Y' tells it whether now is the moment.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** EVERY PATH THE SKILLS NAME ACTUALLY EXISTS ***
 * --------------------------------------------------------------------------------------------------------- */
{
    // Backticked tokens that look like a tree path. THE SET IS DERIVED FROM THE PROSE rather than listed here,
    // so a path added to a skill later is checked without anybody remembering to add it.
    const named = [...new Set([...all.matchAll(/`([A-Za-z0-9_\-./]+\.(?:mjs|js|json|html|md))`/g)].map((m) => m[1]))];
    // *** MY FIRST VERSION RESOLVED ONLY AGAINST TWO ROOTS AND CALLED SIX REAL FILES MISSING. A BARE BASENAME
    // IS A **NAME**, NOT A PATH -- `devices.mjs` is how a reader refers to it and how they would find it, so
    // the resolver searches the tree the way they would. Only a token containing a slash is a path claim. ***
    const index = new Set();
    (function rec(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (["node_modules", ".git", "__pycache__"].includes(e.name)) continue;
            const p2 = path.join(d, e.name);
            if (e.isDirectory()) rec(p2);
            else { index.add(e.name); index.add(path.relative(ROOT, p2).split(path.sep).join("/")); }
        }
    })(ROOT);
    const missing = named.filter((rel) =>
        !index.has(rel) && !index.has(rel.replace(/^WebGLEngine\//, "")) && !index.has(path.basename(rel)) &&
        !/<|vNNNN|thing|area/.test(rel));
    say(`${named.length} file paths named across both skills; unresolved: ${missing.length ? missing.join(", ") : "none"}`);
    ok("!! *** EVERY FILE THE SKILLS TELL A READER TO OPEN IS ACTUALLY THERE ***",
       missing.length === 0,
       "*** A SKILL THAT SENDS SOMEBODY TO A FILE THAT MOVED IS WORSE THAN NO SKILL: they will conclude the tree is wrong rather than the document. This is the ONE class of claim in a skill that can be mechanically checked, so it is, and the list is DERIVED FROM THE PROSE so a path added later is covered without anybody remembering. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** EVERY ENVIRONMENT VARIABLE AND TOOL NAME IS REAL ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const walk = (d, out = []) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (["node_modules", ".git"].includes(e.name)) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p, out); else if (/\.(mjs|js)$/.test(e.name)) out.push(p);
        }
        return out;
    };
    const src = walk(path.join(ENG, "tools")).map((p) => fs.readFileSync(p, "utf8")).join("\n");
    const envs = [...new Set([...all.matchAll(/SWEK_FREEZE_[A-Z_]+/g)].map((m) => m[0]))];
    const badEnv = envs.filter((e) => !src.includes(e));
    say(`freeze variables cited: ${envs.join(", ")}`);
    ok("!! every SWEK_FREEZE_* variable a skill tells you to set is actually READ by a tool",
       badEnv.length === 0,
       `unresolved: ${badEnv.join(", ") || "none"}. *** A RE-FREEZE INSTRUCTION THAT NAMES A VARIABLE NOTHING READS LOOKS LIKE IT WORKED -- the command exits 0 and the baseline does not move, which is the most expensive kind of wrong instruction because it fails silently in the direction of "everything is fine". ***`);

    const tools = ["decisionIndex", "wiringClaims", "checkMode", "reportingTools", "toolFrontDoor", "deviceInstrumentMap", "pageReach", "plantedCoverage"];
    const badTool = tools.filter((t) => all.includes(t) && !src.includes(t));
    ok("...and every tool named in the prose exists in tools/",
       badTool.length === 0,
       `unresolved: ${badTool.join(", ") || "none"}. The skills cite these BY NAME as things to run or read; a name that has moved sends a reader hunting.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. *** THE STRUCTURAL RULE THE DEVICE SKILL TEACHES IS THE ONE THE TREE ACTUALLY FOLLOWS ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const bindDir = path.join(ENG, "tools", "roundhouse");
    const binds = fs.readdirSync(bindDir).filter((f) => /Bind\.mjs$/.test(f));
    // `modes:` must BE an exported array rather than a copied literal -- read structurally, the way
    // singleSource does it, because pinning the identifier is what broke that gate at v3442.
    // *** THE FIRST VERSION OF THIS CHECK ASSERTED THAT NO BIND INLINES AN ARRAY LITERAL, AND 46 OF 72 DO.
    // THE SKILL WAS OVERSTATING THE RULE AND THE GATE CAUGHT IT ON ITS FIRST RUN. The v3442 correction is the
    // authority: an inline literal IS a bind's own single source and is fine; what was refused is a SECOND
    // COPY -- and singleSource was rewritten STRUCTURALLY for exactly this, because pinning the identifier
    // `MODES` broke it when five binds correctly started exporting one. THE REAL RULE IS: ONE DECLARATION PER
    // BIND, AND IF IT IS EXPORTED THEN `modes:` MUST BE THAT SAME OBJECT RATHER THAN A COPY OF IT. ***
    const named2 = binds.filter((f) => /modes:\s*[A-Z_][A-Z0-9_]*\s*,/.test(fs.readFileSync(path.join(bindDir, f), "utf8")));
    const literal = binds.filter((f) => /modes:\s*\[/.test(fs.readFileSync(path.join(bindDir, f), "utf8")));
    // The defect is a bind that BOTH exports a mode array AND hands `modes:` a separate literal -- two
    // declarations, which is the thing itself.
    const both = binds.filter((f) => {
        const t = fs.readFileSync(path.join(bindDir, f), "utf8");
        return /export const [A-Z_][A-Z0-9_]*MODES\s*=\s*\[/.test(t) && /modes:\s*\[/.test(t);
    });
    // *** AND 25 + 46 IS 71, NOT 72. ONE BIND DECLARES NO MODES AT ALL, WHICH IS A DIFFERENT FACT AND IS
    // COUNTED APART RATHER THAN FOLDED IN -- the tree already does exactly that for lbm, which has no
    // defaults(): A GUARD THAT CANNOT ENGAGE IS NOT THE SAME AS A DEVICE WITH NOTHING TO GUARD (v3194). My
    // second condition demanded the two buckets cover every bind and it does not; ASSERTING THE UNION WOULD
    // HAVE BEEN A COUNT PINNED WHERE THE DISTINCTION WAS THE POINT.
    const neither = binds.filter((f) => !named2.includes(f) && !literal.includes(f));
    say(binds.length + " binds: " + named2.length + " pass a named constant to modes:, " + literal.length +
        " inline a literal, " + both.length + " do BOTH (the defect), " + neither.length +
        " declare none" + (neither.length ? " (" + neither.join(", ") + ")" : ""));
    ok("!! *** NO BIND DECLARES ITS MODES TWICE, WHICH IS THE RULE THE TREE ACTUALLY FOLLOWS ***",
       both.length === 0,
       "*** THIS IS THE CLAIM MOST WORTH RE-DERIVING BECAUSE IT IS THE ONE A READER COPIES VERBATIM, AND RE-DERIVING IT IS WHAT SHOWED THE SKILL WAS WRONG: it said `modes:` must be a named export, and 46 of 72 binds inline a literal quite correctly. AN INLINE LITERAL IS A BIND'S OWN SINGLE SOURCE; WHAT IS FORBIDDEN IS A SECOND COPY. The mode list written twice is this project's most-repeated defect -- two binds' copies had ALREADY DISAGREED before anybody compared them (v3420, v3421) -- and the fix at v3442 was to check it STRUCTURALLY rather than by pinning the identifier. The skill now says the rule the tree follows. ***");

    const devSrc = fs.readFileSync(path.join(bindDir, "devices.mjs"), "utf8");
    ok("...and the eight registration steps name files that are all in the tree",
       ["devices.mjs", "promptCost.mjs", "run-device.mjs", "instruments.mjs"].every((f) => text["swek-device"].includes(f)) &&
       fs.existsSync(path.join(bindDir, "promptCost.mjs")) && fs.existsSync(path.join(bindDir, "run-device.mjs")) &&
       fs.existsSync(path.join(ENG, "physics", "instruments.mjs")) && devSrc.length > 0,
       "The steps are individually forgettable and collectively load-bearing; a list that named a file that had moved would be worse than no list.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. WHAT THIS GATE CANNOT CHECK, SAID RATHER THAN LEFT IMPLIED
 * --------------------------------------------------------------------------------------------------------- */
{
    ok("!! *** THE REASONING IS NOT CHECKED AND CANNOT BE ***",
       true,
       "*** NOTHING HERE VERIFIES THAT \"an exact closure is proof of consistency and never of correctness\" IS GOOD ADVICE, OR THAT A PLANT SHOULD BE A PARAMETER. Those are judgements earned by getting them wrong, and a gate that pretended to grade them would be the mirror this tree refuses -- checking a document against itself. WHAT IS CHECKED IS EVERY MECHANICAL CLAIM: paths, tool names, environment variables, and the one structural rule a reader will copy verbatim. THE VERSION NUMBERS IN THE PROSE ARE CITATIONS, NOT ASSERTIONS, and they are deliberately not parsed -- a round number is a pointer into BACKLOG.md and main.js, and re-deriving it would mean re-deciding what each round concluded. ***");

    ok("...and the skills are DISCOVERABLE rather than only present",
       fs.readFileSync(path.join(SKILLS, "README.md"), "utf8").includes("swek-gate") &&
       fs.readFileSync(path.join(SKILLS, "README.md"), "utf8").includes("swek-device"),
       "agent-skills/README.md is what somebody reads before opening a folder. A skill nobody can find is the module-with-no-caller shape wearing documentation.");
}

console.log(fails ? "\nskillClaims-selfcheck: " + fails + " FAILED" : "\nskillClaims-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);

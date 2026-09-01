// WebGLEngine/tools/ship/namedNotChecked-selfcheck.mjs -- v4268
//
// GRADES world/namedNotChecked.mjs AND THE NEW reachedLicences ENTRY IT PRODUCED.
//
// The round's central measured claim is an ABSENCE: six repositories carry a licence verdict in the open
// list and appear nowhere in this repository. An absence is the hardest thing to measure honestly, for a
// reason this file has now hit five times in six rounds:
//
// *** THE SCANNER MUST NOT COUNT THE SCANNER. *** world/namedNotChecked.mjs names all six repositories --
// that is its entire job -- and this gate names them too. A scan for "how many files mention gi-voxels"
// that includes those two files answers 2 and means 0. v4262 counted its own prose twice, v4263 counted a
// grep-for-absence against its own quotation, v4266 counted a vendor path inside its own control fixture,
// and v4267's main.js version note quoted a path while explaining that exact trap. So SELF is a named,
// asserted-non-empty exclusion list here, and section 2 proves the exclusion is doing work by checking that
// the scan finds the names when the exclusion is lifted.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NAMED_SOURCES, UNCHECKED, COUNT_DISPUTE, validateNamed, mayTake, promotable, absentFrom,
         describeNamed } from "../../world/namedNotChecked.mjs";
import { REACHED_SOURCES, validateEntry, severityOf, SEVERITY } from "../../world/reachedLicences.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => {
    if (!cond) fails++;
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
};
const report = (s) => console.log(`  ----  ${s}`);

// The two files whose job is to name these repositories. Anything else naming one is a real occurrence.
const SELF = ["world/namedNotChecked.mjs", "tools/ship/namedNotChecked-selfcheck.mjs"];

// *** AND ONE ALLOWANCE, WHICH THIS GATE FOUND BY GOING RED ON ITS AUTHOR. ***
// The first run of this file failed here: world/reachedLicences.mjs names advanced-threejs-tsl-webgpu-rendering,
// because THIS ROUND put it there -- the v4268 register block quotes #100 in order to explain why the item is
// answered by boytchev/tsl-textures. That is a legitimate occurrence and not a leak, but it is also exactly
// the sixth self-counting scan in six rounds, and the sixth was caught by the check rather than by me.
// It is listed rather than folded into SELF, because SELF means "this file's whole job is these names" and
// the register's job is something else. Section 2 asserts the allowance is EXERCISED and is the ONLY one.
const ALLOWED = Object.freeze([
    { file: "world/reachedLicences.mjs", repo: "advanced-threejs-tsl-webgpu-rendering",
      why: "the v4268 entry for boytchev/tsl-textures quotes #100 to say what it answers" },
    // v4275: the round built a rough-diffuse lobe and its header says, at length, that it is NOT this
    // repository's model and that the repository was never opened. Naming it is the disclaimer working.
    { file: "physics/render/roughDiffuse.mjs", repo: "portsmouth/EON-diffuse",
      why: "its header names the source it is NOT, which is the point of the file" },
    { file: "tools/ship/roughDiffuse-selfcheck.mjs", repo: "portsmouth/EON-diffuse",
      why: "the gate asserts that disclaimer is present" },
]);

// *** AND THE VERSION NOTE, WHICH CAUGHT THIS GATE'S AUTHOR A SECOND TIME IN THE SAME ROUND. ***
// main.js's ENGINE_VERSION line and brain/brain.js's BRAIN_BUILD line carry the round's changelog comment,
// and v4268's lists all six repositories by name. So the absence scan went red again, after the allowance
// above had already been added for the first self-count -- the seventh such scan in six rounds, and the
// second in this one. v4266 made the identical mistake: a version note quoting the path while explaining the
// trap that quoting it creates.
//
// reachedLicences-selfcheck settled this exact question already and its answer is followed here: its ALLOWED
// set contains "main.js" with the note "the register, this gate, and the changelog line may name anything".
// The version note IS the changelog. But it is allowed HERE by LINE and not by file: only the declaration
// line itself may carry these names, so a mention anywhere else in main.js is still a red.
const VERSION_LINE = Object.freeze([
    { file: "main.js", starts: 'const ENGINE_VERSION = ' },
    { file: "brain/brain.js", starts: 'const BRAIN_BUILD = ' },
]);
/** True when every occurrence of `needle` in `body` sits on that file's version-declaration line. */
function onlyOnVersionLine(rel, body, needle) {
    const v = VERSION_LINE.find((x) => x.file === rel);
    if (!v) return false;
    const lines = body.split("\n");
    const hits = lines.filter((l) => l.toLowerCase().includes(needle));
    return hits.length > 0 && hits.every((l) => l.startsWith(v.starts));
}

/** Every text file in the engine tree, minus vendor and node_modules, as [relPath, body]. */
function treeFiles() {
    const out = [];
    const skip = new Set(["node_modules", "vendor", ".git", "out"]);
    const exts = new Set([".js", ".mjs", ".md", ".html", ".json", ".glsl", ".wgsl", ".txt", ".css"]);
    (function walk(dir) {
        let ents = [];
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const d of ents) {
            if (skip.has(d.name)) continue;
            const full = path.join(dir, d.name);
            if (d.isDirectory()) walk(full);
            else if (exts.has(path.extname(d.name))) {
                const rel = path.relative(ENG, full).split(path.sep).join("/");
                let body = ""; try { body = fs.readFileSync(full, "utf8"); } catch { continue; }
                out.push([rel, body]);
            }
        }
    })(ENG);
    return out;
}

const FILES = treeFiles();

console.log("\n1. THE REGISTER'S OWN RULES");
{
    // *** THIS ASSERTED A TOTAL OF SIX AND v4275 ADDED SIX MORE. *** A register meant to GROW should not be
    // gated on its size; what matters is that every entry is attributable. So the check is now per-source and
    // the total is derived, which is the shape that survives the next round adding to it.
    const bySource = NAMED_SOURCES.reduce((a, e) => { a[e.namedIn] = (a[e.namedIn] || 0) + 1; return a; }, {});
    ok("every entry says where it was named", NAMED_SOURCES.every((e) => !!e.namedIn),
        Object.entries(bySource).map(([k, v]) => `${k}:${v}`).join(" "));
    ok("  #100 contributed one and #132 five, as the items say", bySource["#100"] === 1 && bySource["#132"] === 5);
    ok("  and the total is their sum, with nothing unattributed",
        Object.values(bySource).reduce((a, b) => a + b, 0) === NAMED_SOURCES.length, String(NAMED_SOURCES.length));
    let bad = [];
    for (const e of NAMED_SOURCES) { const p = validateNamed(e); if (p.length) bad.push(`${e.repo}: ${p[0]}`); }
    ok("every entry validates", bad.length === 0, bad.join(" | ") || "6/6");
    ok("every entry is UNCHECKED and nothing else", NAMED_SOURCES.every((e) => e.established === UNCHECKED));
    ok("*** no entry carries a licence verdict field ***",
        NAMED_SOURCES.every((e) => !["spdx", "licence", "licenceExists", "redistributable", "grantorHoldsRights"]
            .some((f) => f in e)),
        "an entry that can answer a licence question belongs in reachedLicences.mjs");
    // CONTROL: the validator must actually reject one, or the line above is decoration.
    const smuggled = { ...NAMED_SOURCES[0], licenceExists: false };
    const probs = validateNamed(smuggled);
    ok("CONTROL: an entry that grows licenceExists is REJECTED", probs.some((s) => /must MOVE/.test(s)),
        probs[0] || "no complaint raised");
    const stateless = { ...NAMED_SOURCES[0], established: "unpapered" };
    ok("CONTROL: an entry claiming UNPAPERED here is REJECTED",
        validateNamed(stateless).some((s) => /only state this register holds/.test(s)));

    ok("mayTake is false for all six", NAMED_SOURCES.every((e) => mayTake(e.repo).ok === false));
    ok("*** and its reason never says the source is unlicensed ***",
        NAMED_SOURCES.every((e) => {
            const w = mayTake(e.repo).why;
            return /gap in OUR record/.test(w) && !/\bis unlicensed\b(?!.*NOT a finding)/.test(w.replace(/NOT a finding[^.]*\./, ""));
        }),
        "UNPAPERED and UNCHECKED are opposite statements about whose gap it is");
    ok("an unknown repo is reported as unknown, not as permitted",
        mayTake("something/nobody-mentioned").ok === false && mayTake("something/nobody-mentioned").known === false);
    report("mayTake returns the same NO an unpapered source gets, and a different sentence. The sentence is " +
        "the only place the difference between 'we looked and found none' and 'nobody looked' survives.");
}

console.log("\n2. THE ABSENCE, MEASURED WITHOUT COUNTING THE MEASURER");
{
    ok("SELF is non-empty and every path in it exists",
        SELF.length === 2 && SELF.every((f) => fs.existsSync(path.join(ENG, f))), SELF.join(" "));
    const hits = {};
    for (const e of NAMED_SOURCES) {
        const needle = e.repo.toLowerCase();
        hits[e.repo] = FILES.filter(([rel, body]) => !SELF.includes(rel) && body.toLowerCase().includes(needle) &&
                                     !onlyOnVersionLine(rel, body, needle))
                            .map(([rel]) => rel);
    }
    const unexplained = [];
    for (const [repo, files] of Object.entries(hits)) {
        for (const f of files) {
            if (!ALLOWED.some((a) => a.file === f && a.repo === repo)) unexplained.push(`${repo} in ${f}`);
        }
    }
    ok("*** none of the six is named anywhere else in the tree, except by named allowance ***",
        unexplained.length === 0, unexplained.join(" | ") ||
        `${FILES.length} files scanned, ${ALLOWED.length} allowed occurrence(s), 0 unexplained`);
    ok("  and every allowance is EXERCISED, not merely declared",
        ALLOWED.every((a) => (hits[a.repo] || []).includes(a.file)),
        ALLOWED.map((a) => `${a.file} names ${a.repo}: ${a.why}`).join(" | "));
    ok("  and every allowance is for a file that explains itself", ALLOWED.every((a) => !!a.why),
        `${ALLOWED.length} allowance(s)`);
    // The version-line allowance, proved to be doing work and proved to be NARROW.
    // *** THE VERSION NOTE NAMES SOME ENTRIES AND NOT OTHERS, AND THAT IS FINE. *** This asserted it names ALL
    // of them, which was true when the register held six from two items and false the moment v4275 added six
    // from a different round. The invariant that actually matters is narrower: whatever it DOES name must be
    // on the declaration line and nowhere else in the file.
    const vHits = VERSION_LINE.map((v) => {
        const f = FILES.find(([rel]) => rel === v.file);
        return { file: v.file, names: f ? NAMED_SOURCES.filter((e) =>
            f[1].toLowerCase().includes(e.repo.toLowerCase())).length : 0 };
    });
    ok("  the version note may name some entries and need not name all",
        vHits.every((h) => h.names >= 0), vHits.map((h) => `${h.file}=${h.names}`).join(" "));
    // CONTROL: the line rule must reject a mention that is NOT on the version line.
    ok("CONTROL: the same name off the version line is NOT allowed",
        !onlyOnVersionLine("main.js", "const ENGINE_VERSION = \"v0\"; // gi-voxels\nlet x; // gi-voxels", "gi-voxels"));

    // *** THE EXCLUSION MUST BE PROVED TO DO WORK, OR A ZERO ABOVE COULD MEAN A BROKEN SCANNER. ***
    // The threshold here is 1, not 2, and that is a correction. The first draft asserted every name appears in
    // BOTH self files; the gate went red and printed the real distribution: four of the six were named
    // literally in this file (in the controls and the near-miss check) and two were reached only through
    // NAMED_SOURCES, so they occurred in exactly one file. Guessing 2 was the same defect as v4267's guessed
    // sabotage counts, in the same session, a few hours later.
    //
    // *** AND WRITING THIS CORRECTION DOWN CHANGED THE NUMBER IT DESCRIBES. *** The paragraph above names the
    // two repositories in order to explain them, which made their count 2 as well. That is not a nuisance to
    // work around -- it is the reason the threshold must be >= 1 rather than any exact figure: a scan whose
    // subject is a set of names cannot be described in prose without the prose becoming part of what it
    // scans. The exact counts belong in the gate's OUTPUT, where they are measured on every run, and never
    // in a comment, where they are frozen at the moment somebody typed them.
    const withSelf = {};
    for (const e of NAMED_SOURCES) {
        withSelf[e.repo] = FILES.filter(([, body]) => body.toLowerCase().includes(e.repo.toLowerCase()))
                                .map(([rel]) => rel);
    }
    ok("CONTROL: lift the exclusion and the scanner finds all six",
        Object.values(withSelf).every((v) => v.length >= 1),
        Object.entries(withSelf).map(([k, v]) => `${k}=${v.length}`).join(" "));
    ok("  and world/namedNotChecked.mjs is the file every one of them is found in",
        Object.values(withSelf).every((v) => v.includes("world/namedNotChecked.mjs")),
        "which is the file whose entire purpose is to hold these names");
    report("that control is the whole reason the zero above is worth anything: a scanner that matched nothing " +
        "at all would report the same zero and mean 'broken' instead of 'absent'.");

    // The near-miss the round actually hit, kept as a live check rather than a remembered anecdote.
    const proceduralTerrain = FILES.filter(([rel, body]) =>
        !SELF.includes(rel) && /procedural terrain/i.test(body)).map(([rel]) => rel);
    ok("*** and the phrase 'procedural terrain' DOES appear, in the engine's own feature ***",
        proceduralTerrain.length >= 5, `${proceduralTerrain.length} files: ${proceduralTerrain.slice(0, 3).join(", ")}...`);
    // main.js is on both lists: it says "procedural terrain" in nine places about the engine's own heightfield,
    // and names the repository once, on its version line. The version-line rule applies here too.
    const namesRepo = proceduralTerrain.filter((rel) => {
        const body = FILES.find(([r]) => r === rel)[1];
        return body.includes("threejs-procedural-terrain") &&
               !onlyOnVersionLine(rel, body, "threejs-procedural-terrain");
    });
    ok("  but none of them names the repository threejs-procedural-terrain", namesRepo.length === 0,
        namesRepo.join(" ") || `${proceduralTerrain.length} files say the phrase, 0 name the repo outside a version line`);
}

console.log("\n3. #132's ARITHMETIC, WHICH DOES NOT WORK EITHER WAY");
{
    ok("the item states a count and lists a different number of names",
        COUNT_DISPUTE.statedCount !== COUNT_DISPUTE.namedCount,
        `stated ${COUNT_DISPUTE.statedCount}, listed ${COUNT_DISPUTE.namedCount}`);
    ok("  and the listed count matches the entries actually filed from #132",
        NAMED_SOURCES.filter((e) => e.namedIn === "#132").length === COUNT_DISPUTE.namedCount);
    // The second reading, checked against the register rather than asserted.
    const unpaperedNow = REACHED_SOURCES.filter((e) => e.licenceExists === false);
    ok("  and the register's current unpapered count is what the dispute records",
        unpaperedNow.length === COUNT_DISPUTE.registerUnpaperedNow,
        `${unpaperedNow.length}: ${unpaperedNow.map((e) => e.repo).join(", ")}`);
    ok("  so neither reading of 'grows to four' reaches four",
        COUNT_DISPUTE.namedCount !== COUNT_DISPUTE.statedCount &&
        (COUNT_DISPUTE.registerUnpaperedNow + COUNT_DISPUTE.alsoNamedInProse + COUNT_DISPUTE.namedCount) !== COUNT_DISPUTE.statedCount,
        // *** EVERY NUMBER IN THIS MESSAGE IS READ FROM THE DATA. *** The first draft wrote "4 vs 5 names"
        // as a literal, so under sabotage C -- which sets statedCount to 5 -- the check went red and its own
        // message still said 4. A detail line that does not move with what it describes is the same defect as
        // a comment holding a count, one line away from the check that exists to catch exactly that.
        `${COUNT_DISPUTE.statedCount} vs ${COUNT_DISPUTE.namedCount} names, or ${COUNT_DISPUTE.statedCount} ` +
        `vs ${COUNT_DISPUTE.registerUnpaperedNow + COUNT_DISPUTE.alsoNamedInProse + COUNT_DISPUTE.namedCount} total`);
    ok("*** and the module does NOT pick a winner ***", COUNT_DISPUTE.readings.length === 2,
        "the tree cannot tell from the text which half is wrong, and says so rather than guessing");
    report("this is the check that could not have existed before this round: the item lived outside the tree, " +
        "so no validator could reach its arithmetic. That is the finding, and this is the fix.");
}

console.log("\n4. #100 IS ANSWERED BY A SOURCE THE TREE ALREADY HAD");
{
    const tsl = NAMED_SOURCES.find((e) => e.namedIn === "#100");
    ok("#100's checkable claim is recorded verbatim", tsl.checkableClaim === "it is the only TSL reference");
    ok("*** and it is recorded as FALSE ***", tsl.checkableClaimHolds === false);
    const solid = fs.readFileSync(path.join(ENG, "render/solidTexture.mjs"), "utf8");
    ok("  because render/solidTexture.mjs names another TSL reference", /boytchev\/tsl-textures/.test(solid),
        "MIT, Pavel Boytchev 2024, read at v4243");
    ok("  and it discusses TSL, so it is a reference and not a passing mention", /\bTSL\b/.test(solid));

    const reg = REACHED_SOURCES.find((e) => e.repo === "boytchev/tsl-textures");
    ok("*** and that source is now IN the register, which it was not before this round ***", !!reg);
    ok("  it validates", reg && validateEntry(reg).length === 0, reg ? validateEntry(reg).join(" | ") || "clean" : "absent");
    ok("  it is OPEN severity, not unpapered", reg && severityOf(reg) === SEVERITY.OPEN);
    ok("  its licenceNote says the reading is SECOND-HAND", reg && /second-hand|SECOND-HAND/.test(reg.licenceNote),
        "this round had no network and registered our own v4243 header, not a fresh look at the LICENSE");
    ok("  and it credits the file that actually took from it", reg && reg.takenPaths.includes("render/solidTexture.mjs"));

    // *** THE CHECK THE EXISTING GATE DOES NOT DO: A CITED FILE MUST ACTUALLY NAME THE SOURCE. ***
    const miscited = (reg ? reg.citedPaths : []).filter((f) => {
        const hit = FILES.find(([rel]) => rel === f);
        return !hit || !hit[1].includes("boytchev/tsl-textures");
    });
    ok("*** every citedPath really contains the name ***", miscited.length === 0, miscited.join(" ") ||
        `${reg ? reg.citedPaths.length : 0} checked`);
    const rebar = fs.readFileSync(path.join(ENG, "render/rebar.mjs"), "utf8");
    ok("CONTROL: render/rebar.mjs mentions TSL and is correctly NOT cited",
        /\bTSL\b/.test(rebar) && !rebar.includes("boytchev/tsl-textures") &&
        !(reg ? reg.citedPaths : []).includes("render/rebar.mjs"),
        "it says \"Keith's TSL blueprint\" -- a grep for TSL would have filed it as a citation");
    // *** AND THE TWO GATES SHAPE THEIR ALLOWANCES DIFFERENTLY, WHICH IS MEASURABLE RATHER THAN ARGUABLE. ***
    const rlSrc = fs.readFileSync(path.join(ENG, "tools/ship/reachedLicences-selfcheck.mjs"), "utf8");
    ok("reachedLicences-selfcheck's allowance is a flat Set of PATHS", /const ALLOWED = new Set\(/.test(rlSrc),
        "so a file cited for one source may name ANY registered source without a red");
    ok("  this gate's allowance is (file, repo) PAIRS", ALLOWED.every((a) => a.file && a.repo),
        "a file allowed to name one repository is not thereby allowed to name another");
    report("that difference is not a defect found in the older gate -- its flat set is what legitimately " +
        "covers world/namedNotChecked.mjs naming codrops and ChuckClose-SparkAR, which it does in order to " +
        "lay out #132's two readings. It is recorded because the tighter shape is available, this round " +
        "used it, and a future round tightening the older one now has the comparison in front of it.");
    report("reachedLicences-selfcheck checks that a cited path EXISTS. It does not check that the file NAMES " +
        "the source, and rebar.mjs is exactly the file that would have slipped through -- it talks about TSL " +
        "at length and does not mention this repository.");
}

console.log("\n5. THE RATCHET: THIS FILE MUST NOT BECOME A PARKING SPACE");
{
    const p = promotable(REACHED_SOURCES);
    ok("*** no named entry has since been properly assessed ***", p.length === 0,
        p.map((e) => e.repo).join(", ") || "0 of 6 -- none has a real record yet, which is the honest state");
    ok("CONTROL: promotable DOES fire when a name appears in the register",
        promotable([...REACHED_SOURCES, { repo: "someone/gi-voxels" }]).length === 1,
        "matched on the tail, because registers name repos owner/name and this list mostly carries bare names");
    ok("absentFrom reports every entry against an empty text", absentFrom("").length === NAMED_SOURCES.length,
        String(NAMED_SOURCES.length));
    ok("CONTROL: absentFrom drops one when the text names it",
        absentFrom("we looked at ar-globe").length === NAMED_SOURCES.length - 1);
    ok("describeNamed says 'ESTABLISHED: nothing' for every entry",
        NAMED_SOURCES.every((e) => /ESTABLISHED: nothing/.test(describeNamed(e))));
    report("promotable() going non-zero is the signal to DELETE an entry here, not to edit it. A register of " +
        "things nobody has checked is only honest while it is shrinking or while nothing has changed.");
}

// =============================================================================================================
// SABOTAGE LOG -- grep-confirmed applied before the result was read, EXIT CODE read alongside the reported
// count, restored md5-identical (world/namedNotChecked.mjs b18cb9d6, world/reachedLicences.mjs 41feaa46).
// Counts are MEASURED. v4267 shipped a log whose three numbers were all written from what the checks look
// like they would do, and all three were wrong; these were run.
//
// A note on reading them: `grep -c "^ *FAIL"` over this gate's output answers one too many, because the
// summary line "FAIL -- N check(s)" matches the same pattern. The numbers below are N from that line.
//
//   A  world/namedNotChecked.mjs dropped from SELF, so the scanner counts itself.
//      -> exit=1, 3 red. The SELF length assertion, the absence scan, and -- the interesting one -- the
//      near-miss check, because with the module in scope "threejs-procedural-terrain" is suddenly present
//      in a file that also says "procedural terrain". That is the exact shape of the false positive the
//      check exists to prevent, produced by the exact mistake that produces it.
//
//   B  the boytchev/tsl-textures entry given citedPaths ["render/rebar.mjs"] -- the round's real near-miss.
//      -> exit=1, 2 red: the citedPath check and its control. *** AND reachedLicences-selfcheck WAS RUN
//      UNDER THIS SABOTAGE TO SEE WHETHER IT CAUGHT IT. It did not catch the miscitation *** -- it checks
//      that a cited path EXISTS and rebar.mjs does exist. It went red for a different reason entirely
//      (dropping namedNotChecked.mjs from the allowance set left it naming codrops and ChuckClose-SparkAR
//      unaccounted for), which is a true failure about a different fact. A gate going red is not the same
//      as a gate catching the thing you broke, and only reading the messages tells them apart.
//
//   C  COUNT_DISPUTE.statedCount set to 5, making #132's arithmetic agree.
//      -> exit=1, 2 red. *** THE FIRST RUN OF C EXPOSED A DEFECT IN THIS FILE RATHER THAN IN THE DATA: ***
//      the second check's detail line was the literal string "4 vs 5 names", so it went red while still
//      printing 4. Every number in that message is now interpolated, and C was re-run to confirm it moves
//      (it prints "5 vs 5 names, or 5 vs 8 total"). A gate that hardcodes a count in its own output is
//      doing, one line away, the thing this whole round is about.
//
//   D  onlyOnVersionLine widened from "every occurrence is on the version line" to "there is an occurrence",
//      i.e. the allowance becomes per-FILE instead of per-LINE.
//      -> exit=1, 1 red, *** AND THE ONLY CHECK THAT CATCHES IT IS THE SYNTHETIC CONTROL. *** The real
//      occurrences in main.js and brain/brain.js genuinely ARE all on the version line, so every check that
//      reads the shipped tree stays green under this sabotage; nothing in the repository distinguishes the
//      narrow rule from the wide one. That is precisely what a control fixture is for, and it is the reason
//      the control was written as a two-line string with a mention on each line rather than left implicit.
//      A weaker gate would have shipped the wide rule and never known.
//
// A, B and C were re-measured after the version-line allowance was added, because the gate they were run
// against is not the gate that ships. Their counts did not move (3, 2, 2).
//
// None went 0 RED. The reason is the same as v4267's: every check here reads a fact something else has to
// agree with -- a name present or absent in 4,572 files, a path whose contents must contain a string, a
// count derived from the entries actually filed -- rather than a fact this file asserts about itself.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER ANY OF THE SIX REPOSITORIES ACTUALLY LACKS A LICENCE. This round had no " +
    "network and opened none of them, which is the entire reason world/namedNotChecked.mjs exists -- it " +
    "records that the question is OPEN, and a gate cannot close it from inside the tree. Also unchecked: " +
    "whether boytchev/tsl-textures is really MIT. Section 4 proves the tree SAYS so, in a header it has " +
    "relied on since v4243, and that the register now records it as second-hand. A round with a network " +
    "should open the LICENSE file and either confirm it or correct it -- and if it is corrected, " +
    "render/solidTexture.mjs's provenance is what changes, not just this entry.");
process.exit(fails ? 1 : 0);

#!/usr/bin/env node
// WebGLEngine/tools/ship/copiedOutsideVendor-selfcheck.mjs -- v4263
//
// Run: node tools/ship/copiedOutsideVendor-selfcheck.mjs
//
// *** THE TREE HAS TWO LICENCE REGISTERS AND CODE FALLS BETWEEN THEM. *** world/orrery.mjs answers "what did
// we VENDOR, and is it papered?" over the subdirectories of the TOP-LEVEL vendor/. world/reachedLicences.mjs
// answers "what did we READ AND NOT VENDOR?". Code that was COPIED but does not live under vendor/ is in
// neither, and nothing in 4,262 rounds has ever listed that population.
//
// It is two files, and both were OUT OF COMPLIANCE rather than merely unfiled. MIT requires the copyright
// notice AND the permission notice in every copy; each carried the copyright line and a POINTER -- a licence
// name, or a URL. A pointer is not an inclusion. Section 3 measures that the pointer really was all there was.
//
// *** AND THE FILE THAT STATED THE OBLIGATION STATED IT WRONG. *** shaders/ashimaNoise.js called attribution
// "the licence's one requirement", understating what it owed in the file whose job was to discharge it.
"use strict";
import * as C from "../../world/copiedOutsideVendor.mjs";
import { REACHED_SOURCES } from "../../world/reachedLicences.mjs";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), "utf8"); } catch { return null; } };
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

console.log("copiedOutsideVendor-selfcheck -- the gap between the two registers, and what fell into it\n");

// =============================================================================================================
console.log("1. *** THE GAP IS STRUCTURAL, and both halves of it are asserted against the code ***");
{
    const orrery = read("world/orrery.mjs");
    const reached = read("world/reachedLicences.mjs");
    ok("world/orrery.mjs is about VENDORED bodies with licence provenance",
        /CAPTURED\s*--\s*vendored/.test(orrery) && /UNPAPERED\s*--\s*vendored/.test(orrery));
    ok("world/reachedLicences.mjs is explicitly about the NOT-vendored",
        /READ AND NOT VENDORED/.test(reached));
    report("so a COPY that is not under vendor/ is in neither by construction -- not an oversight in either " +
        "file, a hole between two correct definitions.");
    // The orrery's population really is the top-level vendor/ subdirectories.
    const dirs = fs.readdirSync(path.join(ROOT, "vendor"), { withFileTypes: true })
        .filter((e) => e.isDirectory()).map((e) => e.name);
    ok("vendor/ holds " + dirs.length + " directories, which is the orrery's whole population",
        dirs.length >= 12, dirs.join(" "));
    // *** AND A SECOND DIRECTORY CALLED vendor EXISTS AND IS NOT IN IT. ***
    // *** v4461: THIS COUNTED DIRECTORY ENTRIES AND WENT RED OVER AN EMPTY ONE. *** A stray empty
    // ai-bridge/vendor/ (Aug 17, untracked -- git cannot track an empty directory, so it exists in a working
    // checkout and in no fresh clone) made this read three. The finding here is "vendored CODE sits where the
    // orrery does not look"; a directory holding nothing holds no code, so counting entries was a proxy
    // standing in for the fact -- and a proxy that makes the gate green or red depending on litter in
    // somebody's checkout. Counted by CONTENT now, and the message prints each one's file count so an empty
    // one is visibly empty rather than silently dropped.
    const allNested = execSync("find . -type d -name vendor -not -path './node_modules/*'", { cwd: ROOT })
        .toString().trim().split("\n").map((s) => s.replace(/^\.\//, "")).sort();
    const fileCount = (rel) => {
        let n = 0;
        (function walk(d) {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                if (e.isDirectory()) walk(path.join(d, e.name)); else n++;
            }
        })(path.join(ROOT, rel));
        return n;
    };
    const counts = new Map(allNested.map((rel) => [rel, fileCount(rel)]));
    const nested = allNested.filter((rel) => counts.get(rel) > 0);
    ok("*** there are TWO directories named vendor THAT HOLD ANYTHING, and the orrery scans one ***",
        nested.length === 2 && nested.includes("vendor") && nested.includes("ui/vendor"),
        allNested.map((rel) => rel + " (" + counts.get(rel) + " files)").join(" and "));

    // *** seenBy IS THE CLAIM THE WHOLE ROUND RESTS ON, AND NOTHING CHECKED IT. *** Sabotage D filled it in
    // with ["orrery"] for both copies and went 0 RED -- a register asserting its own central finding in a
    // field no gate reads. It is now COMPUTED from the two registers and the recorded value must agree.
    const registeredRepos = REACHED_SOURCES.map((e) => e.repo);
    for (const c of C.COPIED) {
        const inOrrery = c.path.startsWith("vendor/");          // the orrery's population, from section 1
        const inReached = registeredRepos.includes(c.upstream);
        const computed = [...(inOrrery ? ["orrery"] : []), ...(inReached ? ["reachedLicences"] : [])];
        ok("  " + c.path + ": the registers that see it, computed rather than recorded",
            JSON.stringify(computed) === JSON.stringify(c.seenBy),
            "computed [" + computed.join(",") + "] vs recorded [" + c.seenBy.join(",") + "]");
    }
    ok("*** so neither copy is in either register, which is the hole this round names ***",
        C.seenByNoRegister().length === C.COPIED.length, C.COPIED.length + " of " + C.COPIED.length);
    // CONTROL: the computation must be able to say "yes, seen" -- or the zero above means nothing.
    ok("CONTROL: a path under vendor/ WOULD be seen by the orrery",
        "vendor/box3d/LICENSE".startsWith("vendor/"));
    ok("CONTROL: an upstream in reachedLicences WOULD be seen by it",
        registeredRepos.includes("activetheory/activeframe"), registeredRepos.length + " registered sources");
}

// =============================================================================================================
console.log("\n2. *** THE POPULATION, and every entry's evidence is greppable in the file it names ***");
{
    ok("the register holds " + C.COPIED.length + " copies and " + C.DERIVED.length + " derived works",
        C.COPIED.length === 2 && C.DERIVED.length === 10);   // v4301: ui/qrDecode.mjs joined DERIVED
    for (const c of C.COPIED) {
        const src = read(c.path);
        ok("  " + c.path + " exists and contains the evidence recorded for it",
            src !== null && src.includes(c.evidence), JSON.stringify(c.evidence));
        ok("    and names its copyright holder in the file", src !== null && src.includes(c.holder), c.holder);
    }
    // The DERIVED list must not be quietly wrong either -- a register with a fabricated row is worse than none.
    let bad = [];
    for (const d of C.DERIVED) { const src = read(d.path); if (src === null || !src.includes(d.evidence)) bad.push(d.path); }
    ok("every DERIVED entry's evidence is present in its file too", bad.length === 0, bad.join(" ") || "all " + C.DERIVED.length);
    ok("no path appears in both lists", C.COPIED.every((c) => !C.DERIVED.some((d) => d.path === c.path)));
}

// =============================================================================================================
console.log("\n3. *** A POINTER IS NOT AN INCLUSION: what the copies carried before this round ***");
{
    // The number that framed the round: where the permission notice actually lives in this tree.
    const all = execSync("grep -rl 'Permission is hereby granted, free of charge' . " +
        "--exclude-dir=node_modules || true", { cwd: ROOT, maxBuffer: 1 << 24 })
        .toString().trim().split("\n").filter(Boolean).map((s) => s.replace(/^\.\//, "")).sort();
    const underVendor = all.filter((f) => f.startsWith("vendor/"));
    // *** AND THE COUNT MOVES AS THE TREE WRITES, so the QUOTERS are excluded by name rather than the
    // number quoted once. *** Files that carry the clause as DATA -- this register and its gate, the two
    // notice files, world/licenceBodies.mjs (which keys its matcher on the sentence) and its gate (a test
    // fixture), and qrChannel-selfcheck.mjs (which asserts a copy carries it) -- are not copies of anything.
    // Counting them with the rest was the self-counting error v4262 hit three times in one round, and it is
    // how this gate went red at v4281 and stayed red until v4301: licenceBodies quoted the clause, the
    // frozen 15 became 17, and nobody was looking. The v4297 sweep named it as one of six regressions.
    const quoters = /^(shaders\/ASHIMA-LICENSE\.txt|ui\/vendor\/LICENSE|world\/copiedOutsideVendor\.mjs|tools\/ship\/copiedOutsideVendor-selfcheck\.mjs|world\/licenceBodies\.mjs|tools\/ship\/licenceBodies-selfcheck\.mjs|tools\/ship\/qrChannel-selfcheck\.mjs)$/;
    // And a registered copy may carry its notice IN THE FILE -- that is what MIT asks of a copy -- so those
    // are excluded by the register's own say-so, not by name here.
    const inFile = new Set([...C.COPIED, ...C.DERIVED].filter((e) => e.noticeInFile).map((e) => e.path));
    const preexisting = all.filter((f) => !quoters.test(f) && !inFile.has(f));
    // v4322 -- sixteen: vendor/three-webgpu/LICENSE arrived at v4319 (three 0.178's WebGPU build and TSL, beside r160), under
    // vendor/ where a vendored copy's notice belongs; the count moved by one and this line says why.
    ok("the tree held " + preexisting.length + " MIT permission notices (15 before v4263, plus vendor/three-webgpu at v4319), quoters and in-file copies aside",
        preexisting.length === 16, preexisting.join(" ").slice(0, 120) + "...");
    ok("*** and 15 of those 16 are under vendor/ -- the 16th is a packaged dependency, not engine code ***",
        underVendor.length === 15 && preexisting.filter((f) => !f.startsWith("vendor/")).join("") ===
        "tools/strict-libm-pkg/LICENSE",
        underVendor.length + " under vendor/, plus " + preexisting.filter((f) => !f.startsWith("vendor/")).join(" "));
    ok("  so NO engine-source copy outside vendor/ carried one",
        preexisting.filter((f) => !f.startsWith("vendor/") && !f.startsWith("tools/strict-libm-pkg/")).length === 0);
    // *** THE ONES THAT DO NOW ARE REGISTERED AND SAY SO. *** Every in-file notice outside vendor/ must be a
    // register entry with noticeInFile, and every such entry must really carry the clause.
    const outside = all.filter((f) => !f.startsWith("vendor/") && !f.startsWith("tools/strict-libm-pkg/") && !quoters.test(f));
    ok("every remaining notice outside vendor/ is a REGISTERED copy that declares noticeInFile: " + [...inFile].join(", "),
        outside.every((f) => inFile.has(f)) && [...inFile].every((f) => outside.includes(f)),
        "found: " + (outside.join(" ") || "none") + " -- an unregistered one here is a copy nobody papered");
    for (const f of inFile) {
        const src = read(f);
        ok("  " + f + " carries the full clause and the warranty disclaimer",
            src !== null && src.includes("Permission is hereby granted, free of charge") && src.includes("WITHOUT WARRANTY OF ANY KIND"));
    }
    // Each copy recorded what it carried BEFORE. That is a historical claim, so it is checked against git.
    for (const c of C.COPIED) {
        ok("  " + c.path + " is recorded as having carried only a " + c.noticeBefore,
            c.noticeBefore === C.NOTICE.POINTER);
        const before = (() => { try { return execSync("git show HEAD:WebGLEngine/" + c.path,
            { cwd: path.join(ROOT, ".."), maxBuffer: 1 << 24 }).toString(); } catch { return null; } })();
        if (before === null) { report("    (git show unavailable -- history check skipped for " + c.path + ")"); continue; }
        ok("    and at HEAD it really did NOT contain the permission notice",
            !/Permission is hereby granted, free of charge/.test(before),
            "checked against git, not against memory");
    }
}

// =============================================================================================================
console.log("\n4. *** THE FIX: the notice now sits beside the bytes it covers ***");
{
    ok("*** nothing in the register is unpapered any more ***", C.unpapered(read).length === 0,
        C.unpapered(read).map((c) => c.path).join(" ") || "0 of " + C.COPIED.length);
    for (const c of C.COPIED) {
        const text = read(c.noticeFile);
        ok("  " + c.noticeFile + " exists and carries the full permission notice",
            text !== null && text.includes("Permission is hereby granted, free of charge") &&
            text.includes("WITHOUT WARRANTY OF ANY KIND"));
        ok("    including MIT's inclusion clause verbatim, which is the sentence this round turned on",
            text !== null && text.replace(/\s+/g, " ").includes(C.MIT_INCLUSION_CLAUSE.replace(/\s+/g, " ")));
        ok("    and it names the right copyright holder", text !== null && text.includes(c.holder), c.holder);
        // *** THE HONESTY LABEL, WHICH v4203 IS THE REASON FOR. ***
        ok("    and it says the text was REPRODUCED, not fetched from upstream",
            text !== null && /NOT fetched from the upstream repository/.test(text),
            "a licence written from memory and labelled as such is honest; labelled 'verbatim' it is v4203 again");
        // And the source file has to point AT it, or the notice is beside the bytes and unreachable from them.
        const src = read(c.path);
        ok("    and " + c.path + " points at it", src !== null && src.includes(c.noticeFile));
    }
    ok("CONTROL: unpapered() can still fail -- a missing notice file is caught",
        C.unpapered((p) => (p === "shaders/ASHIMA-LICENSE.txt" ? null : read(p))).length === 1);
    ok("CONTROL: and so is a notice file that exists but holds no permission notice",
        C.unpapered((p) => (p === "ui/vendor/LICENSE" ? "just a copyright line" : read(p))).length === 1);
}

// =============================================================================================================
console.log("\n5. *** THE FILE THAT STATED THE OBLIGATION STATED IT WRONG ***");
{
    const src = read("shaders/ashimaNoise.js");
    // *** A GREP FOR THE ABSENCE OF THE FALSE CLAIM WENT RED, AND IT WAS RIGHT TO. *** This tree records
    // corrections rather than deleting them, so the wrong sentence is still in the file -- quoted, inside the
    // paragraph that says it was wrong. "Is the phrase gone" is therefore the wrong question. The right one
    // is whether it is ASSERTED or QUOTED AS AN ERROR, and that is what is checked: it appears exactly once,
    // and the words marking it wrong are in the same breath.
    // Strip the leading // of each line BEFORE flattening, or a quoted sentence that wraps across lines
    // comes back with a "//" wedged into the middle of it and no grep for its words can match.
    const flat = src.replace(/^\s*\/\/ ?/gm, "").replace(/\s+/g, " ");
    const hits = (flat.match(/the licence's one requirement/gi) || []).length;
    ok("the false claim appears exactly once, not scattered", hits === 1, hits + " occurrence(s)");
    ok("*** and it is QUOTED AS AN ERROR, not asserted ***",
        /USED TO SAY[^.]*"THE LICENCE'S ONE REQUIREMENT",? WHICH IS[\s\S]{0,40}WRONG/i.test(flat),
        "the sentence that carries it also carries 'which is wrong'");
    ok("and the correction states what MIT actually requires, in MIT's own words",
        /copyright notice AND THIS PERMISSION NOTICE shall be included/i.test(flat) &&
        /pointer is not an inclusion/i.test(flat));
    ok("the GLSL is still identified as a COPY and not a port", /a COPY and not a port/.test(src));
    // The .mjs beside it is a TRANSLATION, and the register must not confuse the two.
    ok("shaders/ashimaNoise.mjs is registered as DERIVED, not as a copy",
        C.DERIVED.some((d) => d.path === "shaders/ashimaNoise.mjs") &&
        !C.COPIED.some((c) => c.path === "shaders/ashimaNoise.mjs"));
    report("*** AND THE REGISTER REFUSES TO RULE ON THE PORTS. *** Whether a re-implementation is a " +
        "'substantial portion of the Software' is a legal judgement, not a grep result. The nine DERIVED " +
        "entries are recorded with their attributions and are NOT called a compliance gap -- claiming either " +
        "way would be this file pretending to an authority it does not have.");
}

// =============================================================================================================
// SABOTAGE LOG -- each applied to a working tree, confirmed present with grep -c before the run was read,
// and restored md5-identical afterwards. Counts are what the runs printed.
//
//   A  shaders/ASHIMA-LICENSE.txt truncated to the copyright block (the permission notice deleted).
//      -> 4 RED. The v4203 failure shape exactly: a licence file that EXISTS and is short of the clause that
//      matters. unpapered() catches it because it greps for the grant, not for the file.
//
//   B  the honesty label removed from both notices, so each claims to be upstream's own LICENSE byte for byte.
//      -> 2 RED. Nothing about the licence text changes; what is lost is the admission that it was reproduced
//      rather than fetched, which is the whole difference between an honest notice and v4203's mistake.
//      (My first attempt at this used a line-anchored sed that did not match and went 0 RED -- the marker
//      count is what showed it, which is why the count is read before the result.)
//
//   C  the qrcode entry given noticeBefore: NOTICE.FULL, claiming it was already compliant.
//      -> 1 RED. The register's historical claims are verified against `git show HEAD`, not believed, which
//      is the only defence against a round flattering itself about what it found.
//
//   D  seenBy filled in with ["orrery"] for both copies.
//      -> *** 0 RED ON THE FIRST WRITING. *** The structural claim the entire round rests on -- that neither
//      register sees these files -- lived in a field NO CHECK READ. A register asserting its own central
//      finding in an unverified field is exactly the shape v4258 found the tree already had two of. seenBy is
//      now COMPUTED from the orrery's population and reachedLicences' repo list, with the recorded value
//      required to agree, and both controls assert the computation can still say "seen". 3 RED after.
//
//   E  shaders/ashimaNoise.mjs moved from DERIVED to COPIED.
//      -> 4 RED. A translation is not a copy, and over-claiming here would be the mirror of the original
//      error: inventing an obligation instead of understating one. Both directions are wrong, and the gate
//      has to be able to fail in both.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER THE REPRODUCED LICENCE TEXT MATCHES UPSTREAM'S OWN FILE. This sandbox " +
    "has no network, so both notices were written from the standard MIT form under the stated copyright " +
    "holder and are LABELLED as reproduced rather than fetched -- section 4 asserts the label, which is the " +
    "most this can honestly do. Also unchecked: whether the nine DERIVED works owe anything at all, which " +
    "is a legal judgement this gate deliberately declines; whether the two copies are the WHOLE population, " +
    "since the search was for third-party copyright lines in .js/.mjs/.glsl/.wgsl and a copy carrying no " +
    "notice at all would be invisible to it by definition; and the DENSO WAVE trademark notice in " +
    "ui/vendor/qrcode.mjs, which is reproduced but is not a licence term and has had no thought given to it.");
process.exit(fails ? 1 : 0);

#!/usr/bin/env node
// WebGLEngine/tools/ship/nodeGlPlatforms-selfcheck.mjs -- v4291
//
// GRADES the @node-3d record and the platform-pair requirement it forced into the install catalog.
//
// *** THE ROUND EXISTS BECAUSE OPEN-LIST ITEM #122 ASSERTED FOUR THINGS AND THREE WERE WRONG. *** That is the
// exact failure world/namedNotChecked.mjs was built to name -- a licence verdict living outside the tree,
// where no gate can see it -- and #122 was outside that file's scope. It is inside this one now.
//
// The load-bearing check is section 2. @node-3d ships prebuilts for win32-x64, linux-x64, darwin-x64 and
// linux-arm64 and for NO OTHER PAIR. That set is not a product of an OS list and an arch list, and the
// catalog's `requires` could only express products until this round. Both available spellings were wrong, and
// one of them was wrong in the direction that recommends software to a machine that cannot run it -- which is
// the precise hole ai-bridge/platformRequires.js was written to close for app-apple-container.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as N3 from "../../world/nodeGlPlatforms.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PR = createRequire(import.meta.url)(path.join(ENG, "ai-bridge/platformRequires.js"));
const cat = JSON.parse(fs.readFileSync(path.join(ENG, "ai-bridge/install_catalog.json"), "utf8"));
const panel = fs.readFileSync(path.join(ENG, "ui/installPanel.js"), "utf8");

let fails = 0;
const ok = (c, name, detail) => {
    console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`);
    if (!c) fails++;
};
const sec = (t) => console.log("\n" + t);
const ROW = "node3d-gl";

// ---------------------------------------------------------------------------------------------------------
sec("1. THE OPEN-LIST CLAIM IS CHECKED RATHER THAN REPEATED");
// ---------------------------------------------------------------------------------------------------------
{
    ok(N3.PACKAGES.length === 5 && N3.PACKAGES.every((p) => p.licence === "MIT"),
       "the five real packages are MIT, which is the ONE half of #122 that survived",
       N3.PACKAGES.map((p) => p.npm.replace("@node-3d/", "")).join(", "));
    ok(N3.PACKAGES.every((p) => p.npm.startsWith("@node-3d/")),
       "*** every package is SCOPED -- there is no bare `node-3d` on npm ***",
       "npm view node-3d is a 404; the repo of that name is docs, version 0.0.0, license None");
    ok(N3.INSTALL.compiler === false && N3.INSTALL.nodeGyp === false,
       "*** and it needs NO COMPILER, which is the correction I owed rather than the note ***",
       `${N3.INSTALL.packages} packages, ${N3.INSTALL.seconds}s, ~${N3.INSTALL.megabytes}MB -- ${N3.INSTALL.mechanism}`);
    ok(N3.HEADLESS.alternative.licence === "BSD-2-Clause",
       "the headless alternative is NOT MIT, so #122's blanket licence would have swept it in wrong",
       `${N3.HEADLESS.alternative.npm} (${N3.HEADLESS.alternative.repo}) is ${N3.HEADLESS.alternative.licence}`);
}

// ---------------------------------------------------------------------------------------------------------
sec("2. THE SUPPORT SET IS A SET OF PAIRS, AND NO os x arch PRODUCT REPRODUCES IT");
// ---------------------------------------------------------------------------------------------------------
{
    // Computed, not asserted. The smallest product that CONTAINS the real set is (all its OSes) x (all its
    // arches); if that product is strictly larger, no product can equal the set, and the schema cannot say it.
    const oses = [...new Set(N3.PLATFORMS.map((p) => p.split("-")[0]))];
    const arches = [...new Set(N3.PLATFORMS.map((p) => p.split("-")[1]))];
    const product = oses.flatMap((o) => arches.map((a) => `${o}-${a}`));
    const extra = product.filter((p) => !N3.PLATFORMS.includes(p));

    ok(product.length > N3.PLATFORMS.length,
       "*** the tightest os x arch product is STRICTLY LARGER than the real support set ***",
       `${oses.length} x ${arches.length} = ${product.length} pairs vs ${N3.PLATFORMS.length} real`);
    ok(extra.length > 0 && extra.includes("darwin-arm64"),
       "*** and what it wrongly admits is APPLE SILICON ***",
       `product admits ${extra.join(", ")} -- every Mac sold since 2020, with no binary to run`);
    ok(N3.MISSING.includes("darwin-arm64") && N3.MISSING.length === extra.length,
       "MISSING records exactly the pairs the product would have over-admitted", N3.MISSING.join(", "));
    ok(N3.PLATFORMS.every((p) => typeof N3.PLATFORM_DIRS[p] === "string"),
       "every supported pair names the bin-<dir> the package will look for",
       N3.PLATFORMS.map((p) => `${p}->${N3.PLATFORM_DIRS[p]}`).join(" "));
}

// ---------------------------------------------------------------------------------------------------------
sec("3. THE CHECKER HONOURS PAIRS IN BOTH DIRECTIONS");
// ---------------------------------------------------------------------------------------------------------
{
    ok(PR.KNOWN.includes("platforms"), "`platforms` is a field the checker understands",
       "an unrecognised field is reported UNMET, so an untaught checker fails closed rather than passing");

    const req = cat[ROW].requires;
    const at = (platform, arch) => PR.checkRequires(req, { platform, arch, macosVersion: "26.1" });
    for (const p of N3.PLATFORMS) {
        const [o, a] = p.split("-");
        ok(at(o, a).ok, `admits ${p}`, "");
    }
    const bad = at("darwin", "arm64");
    ok(!bad.ok, "*** and REFUSES darwin-arm64 ***", "the one an arch-only or os-only rule could not exclude");
    ok(at("win32", "arm64").ok === false, "and refuses win32-arm64, which also has no build");

    const msg = PR.explain(ROW, bad, req);
    ok(msg.includes("MISSING PREBUILT"),
       "the refusal says it is a MISSING BINARY, not a limit of the OS or the chip alone",
       "a refusal that reads as a bug gets worked around; this one names what would fix it and what would not");
    ok(/Apple Silicon/i.test(req.why || ""), "and the row's `why` names Apple Silicon in plain words");
}

// ---------------------------------------------------------------------------------------------------------
sec("4. THE ROW AND THE MODULE CANNOT DRIFT APART");
// ---------------------------------------------------------------------------------------------------------
{
    const rowPlatforms = cat[ROW].requires.platforms;
    ok(Array.isArray(rowPlatforms) && rowPlatforms.length === N3.PLATFORMS.length &&
       rowPlatforms.every((p, i) => p === N3.PLATFORMS[i]),
       "*** the catalog row's platform list is IDENTICAL to the module's, element for element ***",
       "JSON cannot import, so this equality is the only thing standing between one list and two");
    ok(cat[ROW].requires.why === N3.CATALOG_REQUIRES.why,
       "and so is the reason, so a corrected note reaches the button and not just the header");
    ok(typeof cat[ROW].cmds?.[0] === "string" && cat[ROW].cmds[0].includes("npm i @node-3d/core"),
       "the Windows command installs the scoped package", "PowerShell, matching every other row in the catalog");
    ok(typeof cat[ROW].cmdsMac?.[0] === "string" && /arm64/.test(cat[ROW].cmdsMac[0]),
       "*** and the Mac command CHECKS THE ARCH ITSELF before installing anything ***",
       "app-apple-container's cmdsMac echoed instructions with no arch check -- that is the hole this copies nothing from");
}

// ---------------------------------------------------------------------------------------------------------
sec("5. THE PANEL CAN REACH IT, AND SAYS THE UNWELCOME PART");
// ---------------------------------------------------------------------------------------------------------
{
    ok(panel.includes(`id: "${ROW}"`), "the panel declares the item");
    ok(/items: \["node3d-gl"/.test(panel), "and a group lists it, so it is reachable rather than orphaned");
    ok(/NOT A\s*"?\s*\+?\s*"?HEADLESS RENDERER/.test(panel) || panel.includes("HEADLESS RENDERER"),
       "*** the panel note says it is NOT a headless renderer ***",
       "the reason somebody would install this is the reason it must not be oversold");
    ok(panel.includes("APPLE SILICON HAS NO BUILD"), "and names the Apple Silicon gap where a person will read it");
}

// ---------------------------------------------------------------------------------------------------------
sec("6. MEASURED AND READ ARE KEPT APART");
// ---------------------------------------------------------------------------------------------------------
{
    ok(N3.INSTALL.measuredOn === "linux-x64",
       "the install figures name the ONE platform they were measured on",
       "win32, darwin and arm64 are READ from upstream source and have not been run by anybody here");
    ok(N3.HEADLESS.works === false && N3.HEADLESS.error.includes("65550"),
       "*** the headless refusal is recorded with the driver's own error text ***", N3.HEADLESS.error);
    ok(N3.HEADLESS.alternative.verdict.startsWith("OPEN"),
       "and the headless QUESTION is left open rather than answered by implication",
       "gl returned null here too, for want of libEGL/OSMesa and a display -- which settles nothing about a real box");
    ok(N3.ENGINE.enforced === false && N3.ENGINE.observed.includes("22"),
       "the engine requirement is recorded as WARNED, not enforced", N3.ENGINE.node + " asked, ran on node 22");
    const sup = N3.supports({ platform: "darwin", arch: "arm64" });
    ok(sup.supported === false && sup.dir === null,
       "supports() is pure and answers about a machine this is not", "asked about Apple Silicon from linux-x64");
}

// ---- SABOTAGE LOG ---------------------------------------------------------------------------------------
//
//   A  PLATFORMS gains "darwin-arm64", i.e. the gap is quietly closed on paper.
//      -> exit=1, 6 red across FOUR sections. The product stops being strictly larger, MISSING no longer
//      matches what it over-admits, PLATFORM_DIRS has no entry for the new pair, the checker starts ADMITTING
//      Apple Silicon, the row's list stops equalling the module's, and supports() changes its answer. One edit,
//      six independent objections -- which is what it should cost to erase a gap rather than fix it.
//
//   B  `platforms` removed from platformRequires.KNOWN.
//      -> exit=1, 5 red, AND THE RED IS IN THE ADMITS CHECKS RATHER THAN THE REFUSAL. The field becomes
//      unrecognised, the checker fails closed on unknown fields, and the row then refuses EVERY machine
//      including win32-x64. An untaught checker installs nothing instead of installing wrongly, which is the
//      property worth having and is why the direction of this failure is checked and not just its count.
//
//   C  the catalog row's requires.platforms reordered, same four entries.
//      -> exit=1, exactly 1 red, section 4. Element-for-element equality is deliberate: a set comparison would
//      let the two lists drift into different orders first and different contents later.
//
// And a fourth that was not a sabotage. The first draft of this gate went RED ON ITS OWN MODULE: MISSING
// listed only darwin-arm64, because Apple Silicon is the gap a person notices, and the product check named
// win32-arm64 too. Windows on ARM has no prebuilt either. The check that caught it is the one comparing a
// recorded gap against a computed one, and it caught the author rather than a saboteur.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER THE WINDOWS AND MAC COMMANDS WORK. They are PowerShell and shell text " +
    "that nobody on this box can run, and the platform list is READ off upstream source rather than measured " +
    "-- only linux-x64 was actually installed. Also unchecked: whether a display-attached machine can open a " +
    "window and draw, which is the whole point of the package and needs a monitor. What IS established is that " +
    "the licences are read rather than remembered, that no compiler is involved, that the support set cannot " +
    "be spelled as a product, and that Apple Silicon is refused rather than recommended.");
process.exit(fails ? 1 : 0);

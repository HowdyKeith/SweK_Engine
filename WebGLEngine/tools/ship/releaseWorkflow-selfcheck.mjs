// WebGLEngine/tools/ship/releaseWorkflow-selfcheck.mjs -- v3947
//
// Run: node tools/ship/releaseWorkflow-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES .github/workflows/release.yml -- the CI release, which rig.html called "THE HIGHEST-VALUE ITEM ON THIS
// PAGE" and which did not exist: the repository had no .github/workflows directory at all.
//
// *** A RELEASE WORKFLOW IS THE WORST PLACE IN A REPOSITORY FOR A SECOND DECLARATION. *** The obvious way to
// build a zip in YAML is `zip -r` with an exclude list written inline. packagerBridge.js ALREADY declares that
// list -- SKIP_FILES holds github.json, gmail.json, twitch-eventsub.json and thirteen more -- and a YAML copy
// that drifted by one line would publish a credential to a public downloads page. Quietly, because a zip that
// is slightly too big looks exactly like a zip. So the property this file defends is not "the workflow works",
// it is THE WORKFLOW OWNS NO OPINION ABOUT WHAT IS IN A RELEASE.
//
// AND IT IS CHECKED ON COMMENT-STRIPPED TEXT, because this workflow's comments discuss `zip -r` at length while
// explaining why it does not use one -- a raw-source check would read the explanation as the offence. That trap
// has been hit twice in this tree by gates written in the same session that named it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(ENG, "..");
const WF = path.join(ROOT, ".github", "workflows", "release.yml");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("releaseWorkflow-selfcheck -- the CI release, and the one opinion it must not hold\n");

if (!fs.existsSync(WF)) {
    ok("!! .github/workflows/release.yml exists", false, "the rig entry that asked for this is still open");
    console.log("\nreleaseWorkflow-selfcheck: 1 FAILED");
    process.exit(1);
}
const raw = fs.readFileSync(WF, "utf8");
// comments stripped: the prose here argues ABOUT zip -r, and a check reading raw text would fire on the argument
const code = raw.split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join("\n");

// ---- 1. IT OWNS NO OPINION ABOUT WHAT IS IN A RELEASE ------------------------------------------------------
{
    console.log("1. *** THE EXCLUDE LIST LIVES IN ONE PLACE, AND IT IS NOT THIS FILE ***");
    ok("!! the workflow calls the shared packer",
        /tools\/ship\/packRelease\.mjs/.test(code),
        "packRelease.mjs resolves makeInstallable() -- the same call the GitHub panel's Release button makes, so " +
        "CI and the button cannot produce different archives");
    ok("!! ...and does NOT roll its own archive",
        !/\bzip\s+-r/.test(code) && !/Compress-Archive/.test(code) && !/tar\s+-c/.test(code),
        "*** THE FAILURE MODE OF A DRIFTED COPY IS PUBLISHING A CREDENTIAL, NOT A BROKEN BUILD. *** A second " +
        "exclude list would go stale the first time SKIP_FILES gained a name, and an over-full zip looks " +
        "exactly like a zip to everybody downstream.");
    const pack = fs.readFileSync(path.join(ENG, "tools", "ship", "packRelease.mjs"), "utf8");
    const packCode = pack.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! ...and the CLI it calls holds no packing logic either, or the problem just moved one file along",
        /makeInstallable/.test(packCode) && !/\bzip\s+-r/.test(packCode) && !/SKIP_FILES\s*=/.test(packCode),
        "it resolves the bridge and calls it; a wrapper that re-listed the skips would be the same defect " +
        "wearing a .mjs extension");
}

// ---- 2. A TAG THAT DISAGREES WITH THE TREE IS REFUSED ------------------------------------------------------
{
    console.log("\n2. *** THE MISLABELED BUILD, REFUSED WHERE IT IS STILL CHEAP ***");
    ok("!! the tag is compared against ENGINE_VERSION",
        /engineVersion\(\)/.test(code) && /GITHUB_REF_NAME|ref_name/.test(code),
        "the tag is what everybody downloads BY, so a tag saying one thing while main.js says another ships a " +
        "build under a name that is not its own -- the exact failure the ship ritual was written for");
    ok("!! ...and the mismatch EXITS rather than warning",
        /refusing to publish a mislabeled build/.test(code) && /exit 1/.test(code),
        "a warning in a log nobody reads after the release is already published is not a gate");
    ok("!! ...and a tree with no marker at all is refused too, not defaulted",
        /no ENGINE_VERSION marker/.test(code) && /exit 2/.test(code),
        "defaulting to a date, which the packer does for its own reasons, would name a release after a day " +
        "instead of a build");
    ok("the version is READ from the packer rather than parsed again in YAML",
        !/ENGINE_VERSION\s*=\s*\\?"/.test(code.replace(/engineVersion\(\)/g, "")),
        "a second regex over main.js in a shell one-liner is how the two readings start disagreeing");
}

// ---- 3. THE REPO'S OWN SHIP GATE RUNS, AND THE SECRET CHECK IS DERIVED ------------------------------------
{
    console.log("\n3. THE HARD-FAIL GATE IS THE ONE THE TREE ALREADY OWNS");
    ok("!! verify_zip.py runs against the built artifact",
        /verify_zip\.py/.test(code),
        "mislabeled build, nested project root and an implausible size -- the three the ship-ritual skill names");
    const vz = path.join(ROOT, "agent-skills", "ship-ritual", "scripts", "verify_zip.py");
    ok("!! ...and the script it names is actually there",
        fs.existsSync(vz),
        "*** A WORKFLOW POINTING AT A MOVED SCRIPT FAILS ONLY WHEN SOMEBODY CUTS A RELEASE, *** which is the " +
        "worst moment to discover it -- the same argument rigJobs-selfcheck makes about a page a person acts on");
    ok("!! the credential sweep DERIVES its names from SKIP_FILES",
        /SKIP_FILES/.test(code) && /packagerBridge\.js/.test(code),
        "a hand-typed list of secret filenames in YAML is the second declaration this whole file is about, and " +
        "the one whose drift cannot be taken back once a release is public");
    ok("!! ...and refuses to pass VACUOUSLY if that list ever reads empty",
        /refusing to pass vacuously/.test(code),
        "*** AN EMPTY LIST MAKES A LOOP OVER IT SUCCEED. *** A regex that stops matching -- because somebody " +
        "reformatted SKIP_FILES -- would turn this from a check into a green tick, which is worse than not " +
        "having it, because it would be trusted.");
}

// ---- 4. THE ARTIFACT IS OPENED SOMEWHERE OTHER THAN WHERE IT WAS BUILT --------------------------------------
{
    console.log("\n4. BUILD ONCE, OPEN IT ELSEWHERE -- the half of the matrix idea this project can use");
    const winVerify = /windows-latest/.test(code);
    ok("!! the built zip is unpacked and exercised on ubuntu, macOS AND Windows",
        /ubuntu-latest/.test(code) && /macos-latest/.test(code) && winVerify,
        "*** rig.html's complaint was 'you hand-carry a zip to a house in another town' -- which is a build that " +
        "has never been opened anywhere else. *** Vizza's six artifacts exist because six platforms need six " +
        "BINARIES; this engine ships one platform-independent zip, so six builds would be six identical files " +
        "and a number that looks like coverage. Verifying the ONE artifact on three OSes tests what " +
        "hand-carrying never did.");
    ok("!! ...and Windows is in that list on purpose",
        winVerify,
        "the tree's recurring platform bug is path handling that only fails on Windows -- todo-selfcheck and " +
        "webgpuProbe both shipped POSIX-shell assumptions this year, and the ritual has a 'Windows path law'");
    ok("...and the smoke test makes the tree ANSWER rather than checking the file arrived",
        /shipRitual\.mjs/.test(code),
        "shipRitual reads version markers, walks the gate tree and rebuilds nothing -- an unzip that only " +
        "checked the byte count would pass on a truncated archive");
    ok("!! ...and the markers are re-read AFTER the round trip through zip",
        /BRAIN_BUILD/.test(code) && /markers disagree after unpack/.test(code),
        "the two markers are a deliberate cross-check; confirming they still agree in the SHIPPED copy is a " +
        "different claim from confirming it in the tree that built it");
}

// ---- 5. PUBLISHING IS THE NARROW PATH ---------------------------------------------------------------------
{
    console.log("\n5. THE ONLY STEP THAT CANNOT BE UNDONE IS THE MOST CONDITIONAL");
    ok("!! publishing requires a real pushed TAG, not a manual click",
        /github\.event_name == 'push'/.test(code) && /ref_type == 'tag'/.test(code),
        "the manual button builds and verifies and publishes NOTHING, so the whole path can be exercised " +
        "without putting anything on the releases page");
    ok("!! ...and it waits for the cross-OS verify, not just the build",
        /needs:\s*\[\s*build\s*,\s*verify\s*\]/.test(code),
        "publishing on `needs: build` alone would attach an artifact that no other machine had opened -- which " +
        "is the state this workflow exists to end");
    ok("...and gh --verify-tag refuses to invent a tag",
        /--verify-tag/.test(code),
        "gh release create will happily CREATE a missing tag otherwise, which would mint a release for a commit " +
        "nobody tagged");
    ok("the token is the workflow's own, with contents:write and nothing else",
        /permissions:/.test(code) && /contents:\s*write/.test(code) && !/secrets\.[A-Z_]*(PAT|TOKEN)/.test(code.replace(/github\.token/g, "")),
        "no personal access token is referenced; a release workflow needs to write releases and nothing more");
}

console.log(fails ? `\nreleaseWorkflow-selfcheck: ${fails} FAILED` : "\nreleaseWorkflow-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);

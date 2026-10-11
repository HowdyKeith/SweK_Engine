// WebGLEngine/tools/ship/publishHygiene-selfcheck.mjs -- v4831
//
// *** THREE COPIES OF THE ENGINE WERE ONE PACK AWAY FROM A PUBLIC RELEASE, AND THE TEXT THAT PUT THEM THERE HAD NO GATE. ***
//
// Keith's rig, the day v4828 was published: `git status` in C:\SweK_src listed SweK_Engine_v4826_clone/,
// SweK_Engine_v4827_clone/ and SweK_Engine_v4828_clone/ -- INSIDE the project -- beside the untracked Tasker state
// ai-bridge/server.js persists. ai-bridge/packagerBridge.js zips the whole project root minus a short skip list, and
// neither was on it. They came from the GitHub panel's "export commands": its clone went to "../<repo>_<ver>_clone"
// while its own steps 5 and 6 run from WebGLEngine/, so "../" was the project root. Its pack step then ran
// `packRelease --out ..` from inside the clone's WebGLEngine/, which v4824's outDirRefusal refuses -- the exported route
// could not publish as written either. (Checked on the three published zips: v4826, v4828 and v4829 carry none of it;
// v4829 is exactly its commit's tracked files minus the packer's deliberate skips. The rig moved them out by hand.)
//
// THREE SECTIONS. (1) the packer keeps a clone and the Tasker state out by RULE, driven on a real temp tree;
// (2) the exported commands, walked line by line with the working directory tracked through cd/pushd/popd, put the clone
// beside the project, pack to a folder the packer accepts, and hand gh the zip the packer writes; (3) a red the rotation
// returns says which row -- the 2026-10-10 rotation's one headlessGpu red was never explained, because the only run that
// knew why had its output discarded, and nineteen re-runs were green.
//
// SABOTAGES, each restored, each RED on its own row: _skipDir's /_clone$/ deleted (section 1); "tasker-state.json" dropped
// from SKIP_FILES (section 1); the export's clone put back at "../" (section 2, the clone row); its pack put back at
// `--out ../../` + releaseDir, two levels too far out (section 2: the pack row, which requires the folder BESIDE the
// project because one level further is C:\ on the rig, and the gh row); the gh path's zip name spelled with the version and no prefix
// (section 2, the gh row); popd deleted (section 2, steps 5 and 6 run in the clone); runGate's failRows emptied
// (section 3).
"use strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { publishCommands } from "../../ui/publishCommands.mjs";
import { runGate } from "./redCensus.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const packager = require_(path.join(ENG, "ai-bridge", "packagerBridge.js"));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("publishHygiene-selfcheck -- what a release can carry, and the commands that make one\n");

// =============================================================================================================
sec("1. *** THE PACKER KEEPS A CLONE OF THE PROJECT AND THE RIG'S TASKER STATE OUT, BY RULE ***");
{
    // Driven on a real tree in the temp folder, through the same _copyTree makeInstallable uses.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "swek-pubhyg-"));
    const put = (rel, body = "x") => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); };
    put("WebGLEngine/main.js");
    put("WebGLEngine/ai-bridge/server.js");
    put("WebGLEngine/ai-bridge/tasker-state.json", '{"config":{"autoremoteKey":"not-for-a-release"}}');
    put("SweK_Engine_v4828_clone/WebGLEngine/main.js");
    put(".SweK_Engine_clone.tmp/WebGLEngine/main.js");
    put("WebGLEngine/render/clone_helpers/notAClone.js");   // a directory merely CONTAINING the word is kept
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "swek-pubhyg-out-"));
    packager._copyTree(root, dest);
    const has = (rel) => fs.existsSync(path.join(dest, rel));
    say(`copied: main.js ${has("WebGLEngine/main.js")}, server.js ${has("WebGLEngine/ai-bridge/server.js")}, ` +
        `tasker-state.json ${has("WebGLEngine/ai-bridge/tasker-state.json")}, the _clone ${has("SweK_Engine_v4828_clone")}, ` +
        `the .tmp staging ${has(".SweK_Engine_clone.tmp")}, clone_helpers ${has("WebGLEngine/render/clone_helpers/notAClone.js")}`);
    ok("!! *** a pack of a project holding a clone of itself and the Tasker state carries neither ***",
        has("WebGLEngine/main.js") && has("WebGLEngine/ai-bridge/server.js") && has("WebGLEngine/render/clone_helpers/notAClone.js") &&
        !has("WebGLEngine/ai-bridge/tasker-state.json") && !has("SweK_Engine_v4828_clone") && !has(".SweK_Engine_clone.tmp"),
        "the panel's \"<repo>_<ver>_clone\", githubBridge's \".<prefix>_clone.tmp\" staging folder and ai-bridge/tasker-state.json " +
        "stay out; the engine's own files go in, and so does a folder whose name merely contains the word. NAME-KEYED, like " +
        "every skip beside it, so it holds whoever made the folder.");
    fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(dest, { recursive: true, force: true });

    // ...and the rule cannot eat a real directory: every directory the repository tracks, by name.
    const tracked = execFileSync("git", ["ls-files"], { cwd: path.resolve(ENG, ".."), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
        .split("\n").filter(Boolean);
    const dirs = new Set();
    for (const f of tracked) { const parts = f.split("/"); for (let i = 0; i < parts.length - 1; i++) dirs.add(parts[i]); }
    const eaten = [...dirs].filter((d) => packager._skipDir(d) && !packager.SKIP_DIRS.has(d));
    ok("!! ...and no directory the repository tracks matches the clone rule",
        dirs.size > 100 && eaten.length === 0,
        `${dirs.size} distinct tracked directory names, ${eaten.length} matched by the clone patterns${eaten.length ? ": " + eaten.join(", ") : ""}. ` +
        "A skip that matched a tracked folder would ship a release missing it, quietly -- a smaller zip looks like a zip.");
}

// =============================================================================================================
sec("2. *** THE EXPORTED COMMANDS, WALKED LIKE A SHELL: every path resolved, every one where it belongs ***");
{
    // The rig's layout, on POSIX paths: the project at /rig/SweK_src, the commands started in its WebGLEngine/.
    const P = "/rig/SweK_src", START = P + "/WebGLEngine", REPO = "HowdyKeith/SweK_Engine", VER = "v4831";
    const lines = publishCommands({ repo: REPO, branch: "main", ver: VER, notes: "n" });
    let cwd = START; const stack = []; const ev = [];
    const projectOf = (d) => (path.basename(d) === "WebGLEngine" ? path.dirname(d) : null);
    for (const raw of lines) {
        if (!raw.trim() || raw.trim().startsWith("#")) continue;
        for (const cmd of raw.split(" && ")) {
            const w = cmd.trim().split(/\s+/);
            if (w[0] === "cd") cwd = path.posix.resolve(cwd, w[1]);
            else if (w[0] === "pushd") { stack.push(cwd); cwd = path.posix.resolve(cwd, w[1]); }
            else if (w[0] === "popd") cwd = stack.pop() || cwd;
            else if (w[0] === "git" && w[1] === "clone") ev.push({ k: "clone", at: path.posix.resolve(cwd, w[w.length - 1]) });
            else if (w[0] === "node" && w[1] === "tools/ship/packRelease.mjs") {
                const out = path.posix.resolve(cwd, w[w.indexOf("--out") + 1]), prefix = w[w.indexOf("--prefix") + 1];
                ev.push({ k: "pack", cwd, out, zip: path.posix.join(out, prefix + "_" + VER + ".zip"),
                          refused: packager.outDirRefusal(out, { projectRoot: projectOf(cwd) || cwd, external: "" }) });
            }
            else if (w[0] === "gh" && w[1] === "release") ev.push({ k: "gh", cwd, zip: path.posix.resolve(cwd, w[4]) });
            else if (w[0] === "node" && /shipVerdict|refreshReleases|releaseLedger/.test(w[1] || "")) ev.push({ k: path.basename(w[1], ".mjs"), cwd });
        }
    }
    const clones = ev.filter((e) => e.k === "clone"), packs = ev.filter((e) => e.k === "pack"), ghs = ev.filter((e) => e.k === "gh");
    for (const e of ev) say(`${e.k.padEnd(16)} ${e.at || e.out || e.zip || ""}${e.cwd ? "  (cwd " + e.cwd + ")" : ""}`);

    const inside = (d, root) => d === root || d.startsWith(root + "/");
    ok("!! *** the clone goes BESIDE the project, never inside it ***",
        clones.length === 2 && clones.every((c) => !inside(c.at, P) && path.posix.dirname(c.at) === path.posix.dirname(P)),
        `${clones.map((c) => c.at).join(", ")} -- the project is ${P}. The exported text used to clone to "../", which from ` +
        `WebGLEngine/ is the project root: Keith's rig held three such clones the day v4828 was packed.`);
    const verdictRun = ev.find((e) => e.k === "shipVerdict");
    ok("!! ...and the verdict runs IN the clone, where what is graded is what was fetched",
        !!verdictRun && verdictRun.cwd === clones[0].at + "/WebGLEngine",
        `shipVerdict's cwd ${verdictRun && verdictRun.cwd}`);
    ok("!! *** every pack writes to a folder the packer ACCEPTS, outside the tree it zips ***",
        // BESIDE the project, not merely outside it: one more "../" lands on the parent's parent -- on the rig that is C:\,
        // where Windows refuses to create a file (the v4823 EPERM), and outDirRefusal cannot see it, because the path
        // is outside the project and that is all it asks
        packs.length === 2 && packs.every((p) => p.refused === null && !inside(p.out, P) && !inside(p.out, clones[0].at) &&
            path.posix.dirname(p.out) === path.posix.dirname(P)),
        packs.map((p) => `from ${p.cwd} to ${p.out}: ${p.refused === null ? "accepted" : "REFUSED -- " + p.refused}`).join("; ") +
        ". The exported text used to pack with --out .. from the clone's WebGLEngine/, inside the clone's own project, which " +
        "v4824's outDirRefusal refuses -- so the route it printed could not publish.");
    ok("!! *** gh is handed exactly the zip the packer just wrote ***",
        ghs.length === 2 && ghs.every((g, i) => g.zip === packs[i].zip),
        ghs.map((g, i) => `${g.zip} ${g.zip === (packs[i] && packs[i].zip) ? "==" : "!="} ${packs[i] && packs[i].zip}`).join("; "));
    const back = ev.filter((e) => e.k === "refreshReleases" || e.k === "releaseLedger-selfcheck");
    ok("!! ...and steps 5 and 6 run back in the tree serving the panel, by a command and not a sentence",
        back.length === 2 && back.every((e) => e.cwd === START) && stack.length === 0,
        `${back.map((e) => e.k + " in " + e.cwd).join(", ")}; pushd/popd balanced: ${stack.length === 0}`);

    // the panel spends the module rather than a copy of the text
    const panel = fs.readFileSync(path.join(ENG, "ui", "githubPanel.js"), "utf8");
    ok("!! the GitHub panel's export button prints THESE lines -- one generator, no second copy to drift",
        /import \{ publishCommands \} from "\.\/publishCommands\.mjs";/.test(panel) && /return publishCommands\(\{/.test(panel) &&
        !/_clone"/.test(panel),
        "ui/githubPanel.js imports ui/publishCommands.mjs and its exportCommands returns publishCommands(...).join; no clone path is spelled in the panel");
}

// =============================================================================================================
sec("3. *** A RED THE ROTATION RETURNS SAYS WHICH ROW ***");
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-pubhyg-gate-"));
    const red = path.join(dir, "red-selfcheck.mjs"), green = path.join(dir, "green-selfcheck.mjs");
    fs.writeFileSync(red, 'console.log("  PASS  a row that held");\nconsole.log("  FAIL  !! the row that broke   detail 42");\nprocess.exit(1);\n');
    fs.writeFileSync(green, 'console.log("  PASS  fine");\n');
    const r = runGate(red, { timeoutMs: 30000 }), g = runGate(green, { timeoutMs: 30000 });
    fs.rmSync(dir, { recursive: true, force: true });
    say(`red fixture: code ${r.code}, failRows ${JSON.stringify(r.failRows)}; green fixture: code ${g.code}, failRows ${JSON.stringify(g.failRows)}`);
    const rot = fs.readFileSync(path.join(ENG, "tools", "ship", "sweepRotation.mjs"), "utf8");
    ok("!! *** redCensus.runGate keeps the FAIL rows of a red run, and the rotation prints them under its RED line ***",
        r.code === 1 && Array.isArray(r.failRows) && r.failRows.length === 1 && /the row that broke/.test(r.failRows[0]) &&
        g.code === 0 && Array.isArray(g.failRows) && g.failRows.length === 0 &&
        /failRows = r\.failRows \|\| \[\];/.test(rot) && /for \(const f of \(r\.failRows \|\| \[\]\)\) console\.log/.test(rot),
        "the 2026-10-10 rotation returned tools/ship/headlessGpu-selfcheck.mjs red once (exit 1 in 5,033 ms) and it was green on " +
        "all nineteen re-runs -- three direct, eight under flakeProbe, eight through runGate itself. The one run that knew which " +
        "row failed had its output thrown away here. It is kept now, and printed.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: what a release can carry that the repository does not, and the commands the GitHub panel " +
    "prints for making one. Both were measured on the rig rather than imagined: three clones of the engine and the Tasker " +
    "state sat inside the project the day v4828 was packed, and the printed route could not publish." +
    "\nWHAT IS NOT CLAIMED: that cmd.exe and a POSIX shell agree on every line -- the paths are walked with POSIX rules and " +
    "use forward slashes, which cmd's cd and pushd accept, but no Windows shell ran them here. The panel's own Clone -> " +
    "verify and Publish buttons go through githubBridge, which clones to engineParentDir() and never into the project; " +
    "tools/ship/cloneSource-selfcheck.mjs holds that route. The headlessGpu red itself stays unexplained.");
process.exit(fails ? 1 : 0);

// WebGLEngine/ui/publishCommands.mjs -- v4831
//
// *** THE GITHUB PANEL'S "EXPORT COMMANDS", AS A PURE FUNCTION, BECAUSE THE TEXT IT PRINTED PUT A CLONE INSIDE THE PROJECT. ***
//
// ui/githubPanel.js built these lines inline. Its step 3 cloned to "../<repo>_<ver>_clone" while its own steps 5 and 6 run
// from WebGLEngine/ -- so "../" was the PROJECT ROOT and the clone landed inside it. Keith's rig held three of them
// (v4826, v4827, v4828) the day v4828 was packed, and ai-bridge/packagerBridge.js walks the whole project root, so a pack
// from that folder would have nested three full copies of the engine in a public release. Its step 4 then ran
// `packRelease --out ..` from inside the clone's WebGLEngine/, which is inside the clone's own project, and v4824's
// outDirRefusal refuses exactly that -- so the exported route could not publish as written. NO GATE READ THIS TEXT.
//
// THE CONVENTION, STATED ONCE AND USED BY EVERY LINE: the commands start in <project>/WebGLEngine -- the tree serving the
// panel, where steps 5 and 6 have always run. The clone goes BESIDE the project (../../), the zip goes to a release
// folder beside both (the packer's own suggestion, <repo>_release), and pushd/popd return to the start -- both work in
// cmd.exe and in a POSIX shell, where "back in the tree" had been a sentence and not a command.
// tools/ship/publishHygiene-selfcheck.mjs walks the lines, tracks the working directory through cd/pushd/popd, and
// checks every path against the packer's own refusal rule.
"use strict";

/**
 * @param {{repo?: string, branch?: string, ver?: string, notes?: string, draft?: boolean, prerelease?: boolean}} o
 * @returns {string[]} the lines, in order
 */
export function publishCommands({ repo = "", branch = "", ver = "", notes = "", draft = false, prerelease = false } = {}) {
    const er = (repo || "").trim() || "owner/repo";
    const v = (ver || "").trim() || "vNNNN";
    const name = er.split("/").pop();
    const cloneDir = "../../" + name + "_" + v + "_clone";
    const releaseDir = "../../" + name + "_release";
    const zip = releaseDir + "/" + name + "_" + v + ".zip";
    const relNotes = (notes || "").trim() || ("Engine build " + v);
    const flags = [];
    if (draft) flags.push("--draft");
    if (prerelease) flags.push("--prerelease");
    const gh = "gh release create " + v + " " + zip + " --repo " + er + " --title " + v + " --notes " + JSON.stringify(relNotes);
    const clone = "git clone --depth 1" + (branch ? " --branch " + branch : "") + " https://github.com/" + er + ".git " + cloneDir;
    const pack = "node tools/ship/packRelease.mjs --out " + releaseDir + " --prefix " + name;
    return [
        "# Run from <this project>/WebGLEngine -- the tree serving this panel. Every path below is relative to it:",
        "# the clone goes BESIDE the project, never inside it, and the zip to " + name + "_release beside both.",
        "",
        "# ---- step 3: clone the repo beside this one, and verify THE CLONE -------------------",
        clone,
        "pushd " + cloneDir + "/WebGLEngine",
        // v4776 -- the provisioning step the chain runs (sourceChainBridge._provision) and this export left out:
        // a fresh clone has no Playwright, so without it every browser gate is red for the missing install --
        // 110 of them on Keith's rig the first time these commands were followed by hand.
        "cd tools/render-qa && npm install --no-audit --no-fund && cd ../..",
        "node tools/ship/shipVerdict.mjs --version " + v + " --markers \"SweK Dictate,/dictate/type\"",
        "# must print: [ship] SHIP  --  stop here and do not publish if it does not",
        "",
        "# ---- step 4: publish the tree that just passed (needs `gh auth login` once) ----------",
        // The clone's WebGLEngine sits at the same depth below the shared parent as the serving tree's, so "../../" names
        // the same folder from both -- the release folder is one place whichever tree packs.
        pack,
        gh + (flags.length ? " " + flags.join(" ") : ""),
        "popd",
        "",
        "# ---- steps 5 + 6: record the release and ask whether the fleet runs what is built -----",
        "node tools/ship/refreshReleases.mjs --write",
        "node tools/ship/releaseLedger-selfcheck.mjs",
        "",
        "# ---- shortcuts (each skips a step above; same warning applies) ------------------------",
        "# Release current engine  =  step 4 alone, tagging + zipping THIS tree as-is:",
        pack + " && " + gh + (flags.length ? " " + flags.join(" ") : ""),
        "# Get newer source  =  step 3's clone alone, no verify:",
        clone,
        "",
        "# No credentials are printed here. `gh release create` uses your own `gh auth login` session;",
        "# a token-based curl equivalent exists but is deliberately not generated, since a token pasted",
        "# into a command a terminal keeps in history is a token that outlives the terminal.",
    ];
}

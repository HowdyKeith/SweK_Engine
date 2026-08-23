// WebGLEngine/tools/ship/sharpBridge-selfcheck.mjs -- v3948
//
// Run: node tools/ship/sharpBridge-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/sharpBridge.js -- apple/ml-sharp, one photograph to a 3D Gaussian splat.
//
// *** WHAT THIS FILE CAN AND CANNOT PROVE, SAID ONCE AND HONESTLY. *** No prediction has ever run in this
// sandbox: there is no PyTorch and no weights here, so nothing below the CLI boundary is observed. Every check
// here is about the half that does not need a model -- the refusals, the path safety, and the licence surface.
// ONE REAL RUN ON GALAXINA is what turns the rest from a documented contract into a fact, and the bridge's own
// header says so rather than letting a green gate imply otherwise.
//
// *** THE PROPERTY THAT MATTERS MOST IS NOT "DOES IT WORK", IT IS "WHERE DOES THE OUTPUT LAND". *** The ml-sharp
// weights are licensed for Research Purposes only -- LICENSE_MODEL rules out "commercial exploitation, product
// development or use in any commercial product or service" -- and this engine publishes public release zips. A
// splat written where packagerBridge would copy it rides into the next release, and a release is a
// REDISTRIBUTION. That is the check with a consequence outside the repository, so it gets driven both ways.
"use strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(ENG, "..");
const require_ = createRequire(import.meta.url);
const S = require_(path.join(ENG, "ai-bridge", "sharpBridge.js"));
const P = require_(path.join(ENG, "ai-bridge", "packagerBridge.js"));
const PY = require_(path.join(ENG, "ai-bridge", "pythonResolve.js"));

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("sharpBridge-selfcheck -- where a research-licensed splat is allowed to land\n");

// ---- 1. THE OUTPUT CANNOT RIDE INTO A RELEASE --------------------------------------------------------------
{
    console.log("1. *** A RELEASE ZIP IS A REDISTRIBUTION, AND THE WEIGHTS ARE RESEARCH-ONLY ***");
    ok("!! a destination the packer WOULD copy is refused",
        S.wouldBePackaged(path.join(ROOT, "WebGLEngine", "splats")) === true,
        "*** THIS IS THE ONE CHECK HERE WITH A CONSEQUENCE OUTSIDE THE REPOSITORY. *** A .ply under a copied " +
        "path is swept up by _copyTree and published on the releases page under terms that forbid it.");
    ok("!! ...and the test is 'would the packer copy it', NOT 'is it inside the project'",
        S.wouldBePackaged(path.join(ROOT, "WebGLEngine", "ai-bridge", "asset_library", "x")) === false,
        "*** THE FIRST VERSION OF THIS BRIDGE ASKED THE CRUDER QUESTION AND REFUSED ITS OWN DEFAULT. *** " +
        "asset_library is inside the tree AND in SKIP_DIRS -- measured: the built release zip contains zero " +
        "entries matching it. A proxy for a rule is not the rule, and this one failed toward refusing correct " +
        "paths, which is the direction nobody notices until the feature is useless.");
    ok("...and any path outside the project is fine",
        S.wouldBePackaged(os.tmpdir()) === false && S.wouldBePackaged(path.join(os.homedir(), ".voxelbridge")) === false);
    ok("!! the rule is READ from the packer, not retyped here",
        /SKIP_DIRS/.test(fs.readFileSync(path.join(ENG, "ai-bridge", "sharpBridge.js"), "utf8")) &&
        !!(P.SKIP_DIRS && typeof P.SKIP_DIRS.has === "function"),
        "packagerBridge exports SKIP_DIRS so this question has one answer; a second copy would drift exactly " +
        "like a second exclude list, and this tree has spent two rounds on that shape already");
    // Asserted as the exact guard line rather than by carving the function body out with string splits, which
    // is how the FIRST version of this check failed: it sliced on the first "}" and tested a fragment that did
    // not contain the line it was looking for. A check that is hard to read is a check that can be wrong quietly.
    ok("!! ...and with no packer to ask, the answer is the SAFE one rather than a guess",
        /if \(!skipDirs \|\| typeof skipDirs\.has !== "function"\) return true;/
            .test(fs.readFileSync(path.join(ENG, "ai-bridge", "sharpBridge.js"), "utf8")),
        "an unanswerable question about redistributing research-licensed output resolves to 'yes, it would be " +
        "packaged' -- failing CLOSED, because the cost of the two mistakes is not symmetric: refusing a safe " +
        "path wastes a minute, and allowing an unsafe one publishes the file");

    // the default destination must actually satisfy the rule the bridge enforces, or the feature refuses itself
    const d = S.defaultOutDir();
    ok("!! the DEFAULT destination passes the bridge's own test",
        S.wouldBePackaged(d) === false,
        "driven rather than assumed: " + d + ". A default that its own guard rejects is a feature that cannot " +
        "be used without an argument, which is how the first version of this file behaved.");
}

// ---- 2. IT REFUSES BEFORE IT SPAWNS ANYTHING ---------------------------------------------------------------
{
    console.log("\n2. EVERY REFUSAL LANDS BEFORE A PROCESS STARTS OR A DIRECTORY IS MADE");
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "sharpgate-"));
    const cases = [
        [{}, /no image/i, "no image at all"],
        [{ image: path.join(scratch, "nope.png") }, /no such image/i, "an image that is not there"],
        [{ image: path.join(ENG, "main.js") }, /not an image/i, "a file that is not an image"],
    ];
    for (const [arg, re, what] of cases) {
        const r = await S.predict(Object.assign({ outDir: scratch }, arg));
        ok("refuses " + what, r.ok === false && re.test(r.error || ""), (r.error || "").slice(0, 70));
    }
    ok("!! ...and none of those refusals created anything",
        fs.readdirSync(scratch).length === 0,
        "a refusal that leaves a directory behind is how the next run finds state it did not make");
    // the packaging refusal must fire even for a VALID image, i.e. it is not merely a side effect of the ext check
    const img = path.join(scratch, "x.png"); fs.writeFileSync(img, "not really a png, but the extension is what is checked");
    const bad = await S.predict({ image: img, outDir: path.join(ROOT, "WebGLEngine", "splats") });
    ok("!! the packaging refusal fires on a VALID image too, so it is a real gate and not a side effect",
        bad.ok === false && /redistribution/i.test(bad.error || ""),
        (bad.error || "").slice(0, 100));
    fs.rmSync(scratch, { recursive: true, force: true });
}

// ---- 3. THE LICENCE IS IN FRONT OF THE PERSON, NOT IN A HEADER ----------------------------------------------
{
    console.log("\n3. *** THE TERMS TRAVEL WITH EVERY REPLY ***");
    const st = await S.status();
    ok("!! status() carries the licence",
        !!(st && st.licence && st.licence.url),
        "whoever is about to press the button is the person who needs to see the terms, not whoever read the " +
        "module header once");
    ok("!! ...and it says research-only and NOT commercial, in fields a caller can branch on",
        st.licence.research_only === true && st.licence.commercial_use === false,
        "prose alone would leave a UI free to render an encouraging sentence; a boolean is checkable");
    ok("...and names both licences, because the code and the weights are licensed separately",
        /LICENSE_MODEL/.test(st.licence.model) && /LICENSE/.test(st.licence.code));
    ok("!! nothing in the bridge downloads weights into the tree",
        !/curl|wget|https?:\/\/[^\s"']*\.(pt|pth|ckpt|safetensors)/i.test(fs.readFileSync(path.join(ENG, "ai-bridge", "sharpBridge.js"), "utf8")),
        "torch fetches them into its own cache on the machine that runs them; vendoring them would put " +
        "research-licensed weights in a public zip");
}

// ---- 4. IT SAYS WHICH PART IS MISSING, NOT JUST 'NO' -------------------------------------------------------
{
    console.log("\n4. THREE INDEPENDENT FACTS, REPORTED ON THEIR OWN EVIDENCE");
    const st = await S.status();
    ok("status names the python it found (or says it found none)",
        typeof st.python === "string" && typeof st.pythonVersion === "string",
        st.python ? st.python + " " + st.pythonVersion : "(none)");
    ok("!! ...and 'not ready' comes with WHICH part is missing",
        st.ready === true || (typeof st.why === "string" && st.why.length > 20),
        "*** THE MISATTRIBUTED SKIP IS A BUG THIS TREE HAS PAID FOR TWICE *** -- browserSafety and mpmGpuPage " +
        "both printed 'no chromium' when chromium was present and playwright was not. Here: " +
        (st.ready ? "ready" : JSON.stringify((st.why || "").slice(0, 80))));
    ok("...and a box with no model still answers rather than throwing",
        st.ok === true);

    // *** THE `-m` ASSUMPTION WAS A REAL BUG, FOUND BY READING SOMEBODY ELSE'S INTEGRATION. ***
    // apple/ml-sharp documents a CONSOLE SCRIPT (`sharp predict -i -o`). This bridge first spelled that as
    // `python -m sharp predict`, which needs a __main__.py an entry-point-only package does not ship -- so on a
    // box where ml-sharp was installed and working, status() would have said "not installed". Reading
    // Sharp-ML/SHARP-ML (which skips the CLI entirely and calls create_predictor) is what made the spelling
    // visible as an assumption rather than a fact.
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "sharpBridge.js"), "utf8");
    ok("!! the documented console script is tried FIRST, not just the -m spelling",
        /cmd: "sharp"/.test(src) && /"-m", "sharp"/.test(src),
        "both are tried because install layouts differ; the one the README documents goes first");
    ok("!! ...and predict() uses the SAME resolution status() reported, not a second hardcoded spelling",
        /_resolveInvocation\(cand\)/.test(src.split("async function predict")[1] || ""),
        "*** A STATUS THAT PROBES ONE COMMAND WHILE THE RUN SPAWNS ANOTHER IS THE TWO-DECLARATIONS DEFECT WITH " +
        "A GREEN LIGHT IN FRONT OF IT *** -- it would report ready and then fail, which is worse than reporting " +
        "not-ready honestly.");
    ok("...and the failure message names every spelling it tried",
        st.ready === true || /tried .*sharp/.test(st.why || ""),
        "a bridge that cannot say how it tried to invoke the thing cannot be re-diagnosed on the next box: " +
        (st.why || "").slice(0, 60));
}

// ---- 5. THE PYTHON PROBE IS SHARED, AND IT PROBES ----------------------------------------------------------
{
    console.log("\n5. *** A NAME ON PATH IS NOT AN INTERPRETER ***");
    ok("!! the bridge uses the shared resolver rather than a fifth copy",
        /require\("\.\/pythonResolve\.js"\)/.test(fs.readFileSync(path.join(ENG, "ai-bridge", "sharpBridge.js"), "utf8")),
        "*** FOUR BRIDGES RESOLVED PYTHON AND ONLY ONE CHECKED THE ANSWER: *** grep -c PYOK over " +
        "agentReachBridge, autoInstall, camoufoxBridge and cellTrackingBridge reads 0, 0, 0, 3. Three copies " +
        "carried the Windows Store-stub bug the fourth had already diagnosed, in the same directory.");
    ok("!! ...and the resolver REJECTS something that runs but is not python",
        PY.verify({ cmd: process.platform === "win32" ? "cmd" : "/bin/echo", base: [] }) === false,
        "the Store alias prints its own 'not found' text and exits 9009 -- a spawn succeeds, so only asking it " +
        "to print a version it cannot fake tells the two apart. Driven with a stand-in that really does run.");
    ok("...and accepts the real one on this box",
        !!PY.resolve(),
        PY.label(PY.resolve()) + " " + PY.version(PY.resolve()));
}

// ---- 6. IT IS REACHABLE ------------------------------------------------------------------------------------
{
    console.log("\n6. THERE IS A DOOR");
    const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("!! both routes are dispatched",
        /"\/sharp\/status"/.test(server) && /"\/sharp\/predict"/.test(server) && /sharpBridge\.js/.test(server),
        "a bridge with no route is the module-with-no-caller shape this tree names everywhere");
    ok("...and it is required LAZILY, so a tree without the file still boots",
        /require\("\.\/sharpBridge\.js"\)/.test(server) && !/^const sharpBridge/m.test(server),
        "the python probe should run when somebody asks, not on every server start");
}

console.log(fails ? `\nsharpBridge-selfcheck: ${fails} FAILED` : "\nsharpBridge-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);

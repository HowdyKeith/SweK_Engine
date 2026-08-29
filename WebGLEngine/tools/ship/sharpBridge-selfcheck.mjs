// WebGLEngine/tools/ship/sharpBridge-selfcheck.mjs -- v3948
//
// Run: node tools/ship/sharpBridge-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/sharpBridge.js -- apple/ml-sharp, one photograph to a 3D Gaussian splat.
//
// *** WHAT THIS FILE CAN AND CANNOT PROVE, SAID ONCE AND HONESTLY, AND THE LINE MOVED ONCE ALREADY. ***
//
// THE LOCAL PATH IS NOT OBSERVED: there is no PyTorch and no weights on this box, so `sharp predict` is a
// documented contract here and ONE REAL RUN ON GALAXINA is what turns it into a fact.
//
// THE MODAL PATH IS FULLY DRIVEN, AND THAT WAS WORTH NOTICING. The remote route needs only something that
// speaks the endpoint's contract -- not a GPU -- so section 5b stands up a real HTTP server, sends a real
// image, and checks the bytes that come back are the bytes written to disk. It found the collision bug on its
// first run: two photographs with the same basename, and the second overwrote the first. That is end-to-end
// evidence a photograph can become a .ply, on the half of the feature that can carry it.
//
// Everything else here is about the half that needs no model at all -- the refusals, the path safety, and the
// licence surface -- which is the part with a consequence outside the repository.
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

// ---- 5b. THE MODAL PATH, DRIVEN FOR REAL AGAINST A STAND-IN ENDPOINT ----------------------------------------
//
// *** THIS IS THE ONE PART OF THE FEATURE THAT CAN BE FULLY DRIVEN FROM HERE, SO IT IS. *** The local path needs
// PyTorch and weights that do not exist on this box; the REMOTE path needs only something that speaks the
// endpoint's contract, and a fifteen-line HTTP server is that. Real socket, real bytes, real file on disk --
// which makes this the only end-to-end evidence the round has that a photograph can become a .ply at all.
{
    console.log("\n5b. *** THE MODAL ROUTE, END TO END, WITHOUT A GPU ***");
    const http = await import("node:http");
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "sharpmodal-"));
    const outDir = path.join(scratch, "out");
    const cfgPath = path.join(scratch, "sharp.json");
    const PLY = Buffer.from("ply\nformat binary_little_endian 1.0\nelement vertex 0\nend_header\n");
    let sawToken = null, sawBytes = 0;

    const srv = http.createServer((req, res) => {
        let b = ""; req.on("data", (d) => { b += d; }); req.on("end", () => {
            let j = {}; try { j = JSON.parse(b || "{}"); } catch {}
            sawToken = j.token; sawBytes = Buffer.from(j.image_b64 || "", "base64").length;
            if (j.token !== "s3cret") { res.writeHead(401, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ detail: "bad or missing token" })); }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, ply_b64: PLY.toString("base64"), bytes: PLY.length }));
        });
    });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const url = "http://127.0.0.1:" + srv.address().port + "/";
    const img = path.join(scratch, "photo.png");
    fs.writeFileSync(img, Buffer.from("89504e470d0a1a0a", "hex"));

    // A fresh module instance per config, because CFG is read at require time via SHARP_CFG.
    const load = (cfg) => {
        fs.writeFileSync(cfgPath, JSON.stringify(cfg));
        process.env.SHARP_CFG = cfgPath;
        const p = path.join(ENG, "ai-bridge", "sharpBridge.js");
        delete require_.cache[require_.resolve(p)];
        return require_(p);
    };

    let M = load({ endpoint: url, token: "s3cret" });
    let st = await M.status();
    ok("!! a configured endpoint makes status() report where=modal",
        st.where === "modal" && st.remote === true,
        "the remote path is checked FIRST, because it is what makes this feature exist on a box with no CUDA -- " +
        "every Mac in the fleet, and the Shield");
    ok("!! ...and status NEVER echoes the token back",
        !JSON.stringify(st).includes("s3cret"),
        "*** A STATUS ROUTE THAT RETURNED THE SECRET WOULD PUT IT IN EVERY BROWSER TAB THAT POLLS. *** Only " +
        "whether there IS one is reported: remoteHasToken=" + st.remoteHasToken);

    const r = await M.predict({ image: img, outDir });
    ok("!! predict() reaches the endpoint and writes the .ply it returned",
        r.ok === true && !!r.ply && fs.existsSync(r.ply),
        r.ok ? path.basename(r.ply) : (r.error || "").slice(0, 90));
    ok("...and the endpoint really received the image bytes", sawBytes === 8, sawBytes + " bytes");
    ok("!! ...and the token travelled in the BODY, not the URL",
        sawToken === "s3cret",
        "a query string lands in proxy logs and browser history, and this token is the only thing between a " +
        "stranger and a rented GPU");
    ok("...and the file on disk is byte-for-byte what the endpoint sent",
        !!r.ply && fs.readFileSync(r.ply).equals(PLY));
    ok("...and the reply says which route ran", /^modal:/.test(r.invocation || ""), r.invocation);

    const r2 = await M.predict({ image: img, outDir });
    ok("!! a second photograph of the same name does not overwrite the first",
        r2.ok === true && r2.ply !== r.ply && fs.existsSync(r.ply),
        "the name is derived from the source image, so without a collision check the second run would silently " +
        "destroy the first: " + (r2.name || r2.error));

    M = load({ endpoint: url, token: "wrong" });
    const bad = await M.predict({ image: img, outDir });
    ok("!! a rejected token is a clear refusal that names the secret to check",
        bad.ok === false && /token/i.test(bad.error || ""),
        "401 from a serverless endpoint is otherwise one of the least self-explanatory failures there is: " +
        (bad.error || "").slice(0, 80));

    M = load({ endpoint: url });
    st = await M.status();
    ok("!! an endpoint with no token is not 'ready', and says why BEFORE any call is made",
        st.ready === false && /token/i.test(st.why || ""),
        (st.why || "").slice(0, 70));

    srv.close();
    delete process.env.SHARP_CFG;
    delete require_.cache[require_.resolve(path.join(ENG, "ai-bridge", "sharpBridge.js"))];
    fs.rmSync(scratch, { recursive: true, force: true });
}

// ---- 5c. THE RECIPE ITSELF -----------------------------------------------------------------------------------
{
    console.log("\n5c. THE DEPLOY RECIPE IS PRESENT AND HOLDS NO SECRETS");
    const mp = path.join(ENG, "modal", "sharp_modal.py");
    ok("!! the Modal app exists where the bridge's instructions say it does",
        fs.existsSync(mp),
        "a documented deploy command pointing at a missing file is the rig.html failure one directory over");
    const m = fs.readFileSync(mp, "utf8");
    ok("!! it reads its token from a Modal SECRET, never a literal",
        /os\.environ\.get\("SHARP_TOKEN"/.test(m) && !/SHARP_TOKEN\s*=\s*["'][A-Za-z0-9_-]{8,}/.test(m),
        "*** THIS FILE SHIPS IN THE RELEASE ZIP *** -- it is our own code and belongs there, which is precisely " +
        "why a hardcoded token in it would be published");
    ok("!! ...and compares it in constant time",
        /compare_digest/.test(m),
        "a plain == leaks the token's length through timing to anybody patient; the fix costs one import");
    ok("!! the endpoint refuses an unauthenticated call at all",
        /status_code=401/.test(m),
        "an open endpoint is somebody else's GPU bill AND research-licensed weights served to the public");
    ok("...and it carries the licence in its own reply",
        /Research Purposes only/.test(m),
        "the terms follow the output rather than living only where the deployer read them once");
    ok("!! it does not hardcode a weights URL",
        !/https?:\/\/[^\s"']*\.(pt|pth|ckpt|safetensors)/i.test(m),
        "ml-sharp owns its own downloader; a second declaration of a checkpoint location is the kind that rots " +
        "silently and is discovered as a 404 during a deploy");
}

// ---- 5d. THE INSTALL BUTTON, DRIVEN FOR REAL WITHOUT TOUCHING THE NETWORK ------------------------------------
//
// v4104 -- *** A REAL git clone AGAINST github.com/apple/ml-sharp IS THE SAME "CANNOT BE OBSERVED HERE" LINE
// THIS FILE ALREADY DRAWS FOR predict()'s LOCAL PATH, FOR THE SAME REASON. *** So the clone step itself joins
// predict() in "one real run on Galaxina is what turns it into a fact" -- but the CHAINING (clone exit 0 walks
// into pip without a second click), the ALREADY-RUNNING refusal, and the RESUME-FROM-AN-EXISTING-CHECKOUT path
// need no network at all, and are driven for real: a scratch dir with an EMPTY requirements.txt makes real pip
// exit near-instantly with nothing to install, so this is pip actually running rather than pip mocked.
{
    console.log("\n5d. *** THE INSTALL BUTTON: RESUME, CHAIN, AND REFUSE, ALL DRIVEN FOR REAL ***");
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "sharpinstall-"));
    const srcDir = path.join(scratch, "ml-sharp");
    fs.mkdirSync(path.join(srcDir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(srcDir, "requirements.txt"), "");   // nothing to install -> pip exits fast, no network

    const load = () => {
        process.env.SHARP_SRC_DIR = srcDir;
        const p = path.join(ENG, "ai-bridge", "sharpBridge.js");
        delete require_.cache[require_.resolve(p)];
        return require_(p);
    };

    let M = load();
    ok("!! SRC_DIR is exported and honours the override, so this section proves the SHIPPED code path",
        M.SRC_DIR === srcDir, M.SRC_DIR);
    ok("!! before any install, installStatus() is null rather than a fabricated idle object",
        (await M.status()).installJob === null);

    const r1 = M.install();
    ok("!! a checkout that ALREADY EXISTS skips straight to pip -- no re-clone of a tree that is already there",
        r1.ok === true && r1.kind === "pip", JSON.stringify(r1));

    const r2 = M.install();
    ok("!! ...and a SECOND call while the first is still running is REFUSED, not queued or restarted",
        r2.ok === false && /already running/i.test(r2.error || ""), r2.error);

    const deadline = Date.now() + 15000;
    let job = null;
    while (Date.now() < deadline) {
        job = M.installStatus();
        if (job && job.done) break;
        await new Promise((r) => setTimeout(r, 100));
    }
    ok("!! the job actually finishes (real pip, real exit) within a generous wall-clock budget",
        !!job && job.done === true, job ? ("code " + job.code) : "(timed out waiting)");
    ok("!! ...and a job that installed nothing still reports a clean exit, not a fabricated success",
        job && job.code === 0, "pip -r on an empty requirements.txt has nothing to fail on");
    // uptimeMs is computed fresh on every call (Date.now() - startedAt), so it legitimately differs by a few ms
    // between the two calls below -- compared on everything ELSE, which is the part that would drift if
    // status() ever grew its own second copy of the job's kind/done/code/tail.
    {
        const a = (await M.status()).installJob, b = M.installStatus();
        const strip = (x) => ({ kind: x.kind, done: x.done, code: x.code, tail: x.tail });
        ok("...and status().installJob mirrors installStatus() rather than being a second declaration of the same state",
            JSON.stringify(strip(a)) === JSON.stringify(strip(b)));
    }

    // A THIRD call, now that the job is done, must be ALLOWED (this is "resume", not "once ever").
    const r3 = M.install();
    ok("!! once a job finishes, Install can be pressed again -- a broken step must be retryable",
        r3.ok === true, JSON.stringify(r3));
    // give the second run's fast pip a moment to finish before the fixture is torn down under it
    await new Promise((r) => setTimeout(r, 800));

    delete process.env.SHARP_SRC_DIR;
    delete require_.cache[require_.resolve(path.join(ENG, "ai-bridge", "sharpBridge.js"))];
    fs.rmSync(scratch, { recursive: true, force: true });

    // The clone step itself (no .git yet) is the part that would touch the real network -- proven from source,
    // same technique section 4 already uses for the -m spelling: the exact repo URL and the chained exit
    // handler that walks a successful clone into the pip step are both really there.
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "sharpBridge.js"), "utf8");
    ok("!! a missing checkout clones the REAL upstream repo, not a placeholder URL",
        /"clone"/.test(src) && /"https:\/\/github\.com\/apple\/ml-sharp"/.test(src));
    ok("!! ...and a successful clone (exit 0) walks straight into pip, rather than requiring a second click",
        /if \(code === 0\) _runPip\(cand\)/.test(src));
    ok("SRC_DIR resolves outside the project the same way CFG and the weights cache already do",
        M.wouldBePackaged(srcDir) === false);
}

// ---- 6. IT IS REACHABLE ------------------------------------------------------------------------------------
{
    console.log("\n6. THERE IS A DOOR");
    const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("!! all four routes are dispatched",
        /"\/sharp\/status"/.test(server) && /"\/sharp\/predict"/.test(server) && /"\/sharp\/config"/.test(server) &&
        /"\/sharp\/install"/.test(server) && /sharpBridge\.js/.test(server),
        "a bridge with no route is the module-with-no-caller shape this tree names everywhere");
    ok("...and it is required LAZILY, so a tree without the file still boots",
        /require\("\.\/sharpBridge\.js"\)/.test(server) && !/^const sharpBridge/m.test(server),
        "the python probe should run when somebody asks, not on every server start");
}

console.log(fails ? `\nsharpBridge-selfcheck: ${fails} FAILED` : "\nsharpBridge-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);

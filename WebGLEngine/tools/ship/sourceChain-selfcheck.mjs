// WebGLEngine/tools/ship/sourceChain-selfcheck.mjs -- v3964
//
// Run: node tools/ship/sourceChain-selfcheck.mjs   (1678ms MEASURED, from gate-timings.json; no network, no
// clone -- v4014's launch section spins up two real short-lived HTTP servers on ephemeral ports, which is
// where the added time goes)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** WHAT THIS DEFENDS IS A REFUSAL, WHICH IS THE ONLY KIND OF CHECK WORTH HAVING HERE. ***
//
// Keith asked for one button: clone, run, auto-export. The chain deliberately stops before the export, and the
// whole value of that decision lives in one predicate -- canPublish(). If it ever returns true for a tree that
// did not pass, the feature is worse than not having it: it puts a green tick in front of an unverified release.
//
// So every path into publish() is driven here, and the ones that must be REFUSED are the point. A gate that
// only proved the happy path would pass just as well against a bridge whose guard had been deleted.
//
// *** IT DOES NOT CLONE. *** A real clone is hundreds of megabytes over the network, and it would make this gate
// slow, flaky and dependent on GitHub being up -- so the state machine is driven directly. The one real
// end-to-end run this feature has had is recorded in the changelog rather than repeated every round: a clone of
// v3963 verified RED on exactly two lines (BACKLOG.md and TODO.md, which .gitignore withholds so no clone can
// ever contain them) and GREEN once v3964's verify.mjs read that rule. That is what the chain is FOR, and it
// found it on its first run.
import fs from "node:fs";
import os from "node:os";   // v4016 -- section 8b builds real fixture trees to resolve a launcher name against
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const chain = require_(path.join(ROOT, "ai-bridge", "sourceChainBridge.js"));

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("sourceChain-selfcheck -- the chain stops before the release, and proves it\n");

// ---- 1. the refusals, driven through the real predicate ---------------------------------------------------
// Each case sets the module's state the way a real run would leave it, then asks the SHIPPING function.
const S = () => chain.status();

ok("!! *** a fresh bridge refuses to publish -- nothing has been cloned ***",
    !chain.canPublish().ok, chain.canPublish().why);

const pubNow = await chain.publish({});
ok("!! ...and publish() ITSELF refuses, not just the predicate the UI reads",
    pubNow && pubNow.ok === false && /refusing to publish/.test(pubNow.error || ""),
    (pubNow && pubNow.error || "").slice(0, 90));

// ---- 2. EVERY BRANCH OF THE GUARD, DRIVEN -----------------------------------------------------------------
// canPublish takes the state as an argument precisely so this can exist. Describing the RED-verify refusal in
// prose would pass just as well against a bridge with that branch deleted; here it is CALLED.
{
    const cases = [
        ["a run still in flight",           { phase: "verifying", clone: { path: ROOT }, verified: true },  false, /still running/],
        ["nothing cloned yet",              { phase: "done", clone: null, verified: null },                 false, /nothing has been cloned/],
        ["*** a clone that FAILED verify ***", { phase: "done", clone: { path: ROOT }, verified: false },   false, /FAILED verification/],
        ["a clone never verified at all",   { phase: "done", clone: { path: ROOT }, verified: null },       false, /has not been verified/],
        ["a green clone that has vanished", { phase: "done", clone: { path: "/no/such/dir" }, verified: true }, false, /no longer at/],
        ["a green clone, still there",      { phase: "done", clone: { path: ROOT }, verified: true },       true,  /^$/],
    ];
    let allowed = 0;
    for (const [label, st, want, why] of cases) {
        const r = chain.canPublish(st);
        if (r.ok) allowed++;
        ok((want ? "allows " : "!! REFUSES ") + label, r.ok === want && why.test(r.why || ""), r.why || "(allowed)");
    }
    // *** THE COUNT IS THE CLAIM. *** Six states, and exactly one may publish. A guard that started returning
    // true for two of them would still pass every line above if the lines were read one at a time.
    ok("!! *** exactly ONE of the six states may publish ***", allowed === 1, allowed + " allowed");
}

// ---- 3. the source properties that keep the chain honest ---------------------------------------------------
const src = noComments(fs.readFileSync(path.join(ROOT, "ai-bridge", "sourceChainBridge.js"), "utf8"));
const code = codeOnly(fs.readFileSync(path.join(ROOT, "ai-bridge", "sourceChainBridge.js"), "utf8"));

// *** VERIFY MUST RUN IN THE CLONE. *** Running this box's gates would grade the tree already serving the page,
// which is by definition fine -- a check that always passes, in front of a release button.
ok("!! *** verify is spawned with the CLONE's directory as cwd, not this tree's ***",
    /cloneEngine/.test(src) && /_spawnIn\(cloneEngine/.test(src),
    "grading the running tree would be a check that cannot fail, which is worse than no check");

// *** AND THE PACKER MUST BE THE CLONE'S. *** packagerBridge computes PROJECT_ROOT from its own location, so
// calling makeInstallable() from here would zip THIS tree under the clone's green tick.
ok("!! *** the zip is built by the CLONE's packRelease.mjs, never this tree's packagerBridge ***",
    /packRelease\.mjs/.test(src) && !/makeInstallable/.test(code),
    "packagerBridge resolves PROJECT_ROOT from its own path -- calling it here would publish the tree that was " +
    "never verified, with a green tick in front of it");

ok("publish re-reads the version marker and refuses a tree that changed since it passed",
    /_versionInTree\(root\)/.test(src) && /what passed verification/.test(
        fs.readFileSync(path.join(ROOT, "ai-bridge", "sourceChainBridge.js"), "utf8")));

// The chain must not reach the release by itself. A start() that called publish() would be the auto-export the
// design rejected, and it would look identical from outside until the day it published something broken.
const startBody = (src.match(/async function start\([\s\S]*?\n\}/) || [""])[0];
ok("!! *** start() never calls publish() -- the chain stops at the verdict ***",
    startBody.length > 0 && !/publish\(/.test(startBody),
    "one button starts the chain; the irreversible step stays behind a result somebody saw");

// ---- 4. route ownership, the segment rule this tree learned at v3951 ----------------------------------------
ok("owns() matches its own path and its children", chain.owns("/source-chain") && chain.owns("/source-chain/status"));
ok("!! ...and does NOT swallow a longer sibling segment", !chain.owns("/source-chainer") && !chain.owns("/source-chains/x"),
    "prefix matching made real pages unreachable at v3951; this is the segment rule");

// ---- 5. it is actually wired into the server -----------------------------------------------------------------
const server = noComments(fs.readFileSync(path.join(ROOT, "ai-bridge", "server.js"), "utf8"));
// Pinned to the bridge's OWN NAME, which is the form bridgeCensus can see. The first cut dispatched through a
// local `_chain` alias inside a lazy require, and the census went red -- "IMPORTED BUT NEVER ROUTED: dead code
// carrying a route table" -- because it looks for `<bridgeName>.owns(`. This line then caught my own rewiring
// when I fixed that, which is the gate doing exactly its job to the person who wrote it.
ok("!! the bridge is DISPATCHED in server.js, by its own name -- a route nothing calls is the v3963 defect again",
    /sourceChainBridge\.owns\(/.test(server) && /sourceChainBridge\.handle\(/.test(server));

// ---- 6. and the UI gates its button on the SERVER's answer, not its own ---------------------------------------
const panel = noComments(fs.readFileSync(path.join(ROOT, "ui", "githubPanel.js"), "utf8"));
// *** PINNED TO THE INITIALISATION, NOT THE STRING. *** The first cut of this matched /chainPub.disabled = true/
// and passed while the init line said `false`, because the onclick handler ALSO disables the button while it
// works -- two occurrences, and the check was reading the wrong one. A probe that flipped the init and stayed
// green is what found it. The property is that the button is disabled AT CONSTRUCTION, so it is matched
// together with the dimming that only the construction does.
ok("!! the Publish button starts DISABLED rather than being switched off by a later poll",
    /chainPub\.disabled = true;\s*chainPub\.style\.opacity\s*=\s*"\.45"/.test(panel),
    "a button enabled at render and disabled by the first poll is publishable during the gap");
ok("!! ...and its enabled state is read from the server's canPublish, never recomputed in the page",
    /st\.canPublish/.test(panel) && /chainSync/.test(panel),
    "two copies of 'may I publish' is one copy that drifts open");

// ---- 7. THE BUG THE CHAIN FOUND ON ITS FIRST RUN, PINNED SO IT CANNOT COME BACK ----------------------------
// Three files assumed the working copy and the repository contain the same files. BACKLOG.md and TODO.md are in
// .gitignore -- withheld from the mirror on purpose -- so no clone can contain them, and each file broke a
// different way: verify.mjs FAILED (2 lines), its root-finder silently fell back to ".", and
// changelogCurrency CRASHED with ENOENT. All three now read tools/ship/withheld.mjs, which is where
// rootLayout-selfcheck's own v3945 comment already said the rule belonged.
{
    const withheldSrc = fs.readFileSync(path.join(ROOT, "tools", "ship", "withheld.mjs"), "utf8");
    ok("!! the withheld rule has ONE home", /export function withheldFromMirror/.test(withheldSrc));
    // *** v4016 -- THIS ASSERTED A FROZEN LIST OF THREE IMPORTERS AND ONE OF THEM CORRECTLY STOPPED BEING ONE. ***
    // v3964 wrote the list when all three genuinely handled a withheld file. v4003 then DELIBERATELY removed
    // withheldFromMirror from changelogCurrency-selfcheck.mjs -- the changelog record became tracked, so its
    // absence means a broken tree rather than a clone, and the withheld-skip was firing everywhere and silently
    // switching the guard off (forty rounds shipped undescribed while it "passed"). Removing it was the fix.
    // The gate kept demanding the import anyway and had been red ever since. *** THE SAME SPECIES AS v3140's
    // module count and v4013's rescue threshold: a true statement frozen into a law that outlived the thing it
    // described. *** The load-bearing property was never "everyone imports it" -- a file with no withheld file to
    // reason about needs nothing. It is "NOBODY KEEPS A SECOND COPY": reason about .gitignore, and you must read
    // the one home rather than restate it. changelogCurrency does neither now and passes; the day anyone puts
    // that reasoning back without the import, this goes red again, which is the thing worth catching.
    for (const f of ["verify.mjs", "changelogCurrency-selfcheck.mjs", "rootLayout-selfcheck.mjs"]) {
        const src = noComments(fs.readFileSync(path.join(ROOT, "tools", "ship", f), "utf8"));
        const imports = /withheldFromMirror/.test(src);
        const restates = /\.gitignore/.test(src);
        ok("   " + f + (imports ? " reads the one home" : " has no withheld rule of its own to keep"),
            imports || !restates,
            imports ? "" : (restates ? "*** RESTATES the .gitignore rule instead of importing withheld.mjs ***"
                                     : "reasons about no withheld file, so it needs nothing -- v4003 removed its " +
                                       "import on purpose when the changelog record became tracked"));
    }
    // The loophole and its guard travel together: a caller taking the exemption must also take the limit.
    ok("!! ...and the fence that stops the exemption covering README.md ships WITH the rule",
        /export function neverWithheld/.test(withheldSrc),
        "a helper that hands out a loophole and leaves the guard behind is worse than no helper");
    const vsrc = noComments(fs.readFileSync(path.join(ROOT, "tools", "ship", "verify.mjs"), "utf8"));
    ok("!! verify no longer uses a WITHHELD file as the landmark for finding the project root",
        !/existsSync\(path\.join\(d, "BACKLOG\.md"\)\)/.test(vsrc),
        "it fell back to '.' on a clone, so every marker search ran against WebGLEngine instead of the project");
}

// ---- 8. LAUNCH: THE CLONE HAD A FOLDER AND NO WAY TO RUN IT ------------------------------------------------
// v4014 -- Keith, right after publishing a verified clone: "I would want to next see the button to launch new
// version that we just cloned." canPublish() and _launchGuard() are the SAME SHAPE ON PURPOSE -- a pure
// predicate over an injectable clone record, so every refusal is DRIVEN here rather than described, without a
// network clone and without spawning a real process.
{
    const g1 = chain._launchGuard(null);
    ok("!! REFUSES nothing has been cloned", g1.ok === false && /nothing has been cloned/.test(g1.why));

    const g2 = chain._launchGuard({ path: "/no/such/dir/at/all" });
    ok("!! REFUSES a clone that has vanished from disk", g2.ok === false && /no longer at/.test(g2.why));

    const g3 = chain._launchGuard({ path: ROOT });
    ok("!! ALLOWS a clone that is genuinely still there", g3.ok === true);

    // *** THE TWO PLUMBING PRIMITIVES, DRIVEN FOR REAL RATHER THAN ASSUMED CORRECT. *** No real launcher is
    // spawned by this gate -- that part is Windows/Mac-only and this box may be neither -- but the port-finder
    // and the health-poller are pure Node APIs this box genuinely has, so they are run against a real ephemeral
    // server rather than mocked.
    const port = await chain._freePort();
    ok("!! _freePort() returns a real, currently-unused port", Number.isInteger(port) && port > 0 && port < 65536);

    const http = await import("node:http");
    const srv = http.createServer((req, res) => { res.writeHead(200); res.end("ok"); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const healthyPort = srv.address().port;
    const healthy = await chain._waitHealthy(healthyPort, 3000);
    ok("!! *** _waitHealthy sees a real server that answers /health with anything under 500 ***", healthy === true);
    await new Promise((r) => srv.close(r));

    const t0 = Date.now();
    const unhealthy = await chain._waitHealthy(port, 1200);
    const elapsed = Date.now() - t0;
    ok("!! ...and REFUSES to call nothing listening 'healthy'", unhealthy === false);
    ok("!! *** AND IT IS TIME-BOXED, NOT INDEFINITE *** -- v4006's rule for this exact shape",
        elapsed < 5000, elapsed + "ms against a 1200ms budget; a launch nobody can tell has hung is worse than one that reports it");
}

// ---- 8b. THE LAUNCHER NAME IS READ FROM THE TREE, NOT ASSERTED ABOUT IT -------------------------------------
// v4016 -- *** THE BUG THIS SECTION EXISTS FOR SHIPPED IN v4014 AND WOULD HAVE FAILED ON EVERY CLONE. ***
// launcherName() named START_NODE_Engine.bat / START_BUN_Full.bat by convention and never checked. Both are
// RIG-LOCAL AND UNTRACKED; cloneEngineSource() builds its clone with `git clone`, so a clone has exactly the
// tracked tree and neither of those. launch() then looked for a file that could not be there -- correct on the
// box that wrote the name, wrong in the only place the feature runs.
{
    const sysadmin = require_("../../ai-bridge/sysadminBridge.js");
    const cands = sysadmin.launcherCandidates();
    ok("!! launcherCandidates() offers more than one name", Array.isArray(cands) && cands.length > 1, cands.join(", "));

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swek-launcher-"));
    try {
        // *** THE CASE THAT ACTUALLY BROKE: a git-clone-shaped tree, holding only TRACKED launchers. ***
        for (const n of ["SweK_Run.bat", "Start_Everything.bat"]) fs.writeFileSync(path.join(tmp, n), "");
        const picked = sysadmin.launcherName(tmp);
        ok("!! *** A CLONE-SHAPED TREE RESOLVES TO A LAUNCHER THAT IS REALLY THERE ***",
            fs.existsSync(path.join(tmp, picked)), "picked " + picked +
            " -- v4014 picked START_NODE_Engine.bat here and refused to launch");

        // THE RIG'S OWN PREFERENCE MUST STILL WIN WHERE THE FILE GENUINELY EXISTS -- the autostart registry
        // entry points at launcherPath() and must not start naming something else on a box that has the real one.
        fs.writeFileSync(path.join(tmp, cands[0]), "");
        ok("!! ...and the PREFERRED name still wins when it is genuinely present",
            sysadmin.launcherName(tmp) === cands[0], "so a rig that has " + cands[0] + " keeps using it");

        // AN EMPTY TREE NAMES WHAT WAS EXPECTED rather than returning nothing -- the caller's error message is
        // the only thing a person sees, and "no launcher found" with no name in it is not actionable.
        const bare = fs.mkdtempSync(path.join(os.tmpdir(), "swek-bare-"));
        ok("!! an empty tree still reports the EXPECTED name, so the refusal can say what it wanted",
            sysadmin.launcherName(bare) === cands[0]);
        fs.rmSync(bare, { recursive: true, force: true });
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

    // AND launch() MUST ASK ABOUT THE CLONE, NOT ABOUT ITSELF. The v4014 line called launcherName() with no
    // argument -- resolving against the RUNNING tree -- and then looked for that answer inside the clone.
    ok("!! *** launch() resolves the launcher against the CLONE's root, not the running tree ***",
        /launcherName\(root\)/.test(src),
        "two directories and one name is how v4014 got this wrong");
    ok("...and a refusal lists what it looked for", /looked for: /.test(src));
}

// ---- 9b. A SECOND LAUNCH STOPS THE FIRST, AND NEVER TOUCHES PRODUCTION -------------------------------------
// v4103 -- Keith: "old swek launcher is still running, and old kpop listener is still running too, not
// closing" -- then "closing manually would be dangerous as a user could not easily tell which is old." Root
// cause: _freePort() hands out a fresh OS port on EVERY launch() call by design (v4014, so a preview never
// fights production for :8787), and nothing ever tracked what an earlier call had started. Click launch three
// times, get three orphaned engines nobody can tell apart.
//
// *** NO WINDOWS BOX TO DRIVE THE REAL SPAWN ON, SO THE SOURCE PROPERTIES ARE WHAT CAN BE PROVEN HERE -- SAME
// TECHNIQUE AS SECTION 8b's launcherName() REGRESSION. *** The load-bearing claim is narrow and checkable
// without a process tree: the stop targets R.launched.port (a port THIS bridge itself recorded), never PORT
// (production's own bound port) -- so a launch this bridge never made is structurally unreachable, not just
// unlikely.
{
    ok("!! *** the SECOND launch stops the FIRST, before requesting a new port ***",
        /if \(R\.launched && R\.launched\.port\)/.test(src) &&
        /portHandoff\.js"\)\.freePort\(R\.launched\.port/.test(src) &&
        src.indexOf("R.launched.port)") < src.indexOf("await _freePort()"),
        "the auto-stop must run before a new port is requested, or a crash mid-launch leaks the old preview");

    ok("!! ...and it can ONLY ever target a port THIS bridge recorded, never production's own PORT",
        !/freePort\(PORT[,)]/.test(src),
        "freePort(PORT) would let a preview launch kill the engine serving the page it was clicked from");

    ok("!! the window gets a REAL title instead of the empty string `start` used as its dummy arg",
        /const title = "SweK Verify v"/.test(src) && /"start", title, "\/d"/.test(src),
        "an unlabeled console window is indistinguishable from production -- the exact danger Keith named");

    ok("!! R.launched is recorded after a successful spawn, and surfaced on status()",
        /R\.launched = \{ port, root, version: R\.clone\.version, at: Date\.now\(\) \}/.test(src) &&
        /launched: R\.launched,/.test(src));
}

// ---- 9. LAUNCH IS ROUTED, AND THE PANEL HAS A BUTTON FOR IT --------------------------------------------------
ok("!! /source-chain/launch is dispatched by handle()", /route === "\/launch"/.test(src));
{
    const panel2 = noComments(fs.readFileSync(path.join(ROOT, "ui", "githubPanel.js"), "utf8"));
    ok("!! the panel has a launch button wired to /source-chain/launch",
        /source-chain\/launch/.test(panel2), "a route with no caller is the v3963 defect this same file already gates for Publish");
}

console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
process.exit(fails ? 1 : 0);

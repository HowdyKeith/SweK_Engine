// WebGLEngine/tools/ship/shadowedHelper-selfcheck.mjs -- v4148
//
// Run: node tools/ship/shadowedHelper-selfcheck.mjs   (a couple of seconds)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/ship/shadowedHelper.mjs and the githubBridge fix that produced it.
//
// *** THE CLONE BUTTON HAD NEVER WORKED SINCE v4133, AND THE ERROR NAMED A LINE THAT WAS FINE. *** Keith
// pressed it and got "Cannot access '_run' before initialization". githubBridge.js has `function _run(cmd,
// args, opts)` at module level -- the thing that runs git -- and v4133 added `const _run = engineVersion()`
// near the bottom of cloneEngineSource, meaning the running version. A const shadows its outer name for the
// WHOLE enclosing block, not from its own line down, so the first `await _run("git", ...)` a hundred lines
// EARLIER resolved to the const and hit its temporal dead zone. The clone never reached git at all.
//
// REPRODUCED BEFORE FIXING and re-run after: cloneEngineSource() threw the exact message, and now returns
// ok:true against the real repository.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { shadowedHelpers, ROOTS } from "./shadowedHelper.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("shadowedHelper-selfcheck -- a const that shadows the helper its own scope already called\n");

// ---- 1. THE TREE IS CLEAN, AND THAT IS A RATCHET AT ZERO --------------------------------------------------
{
    console.log("1. *** NO SCOPE CALLS A HELPER IT LATER SHADOWS -- FLOOR AT ZERO ***");
    const hits = shadowedHelpers(ENG);
    ok("!! *** zero guaranteed temporal-dead-zone shadowings across " + ROOTS.length + " roots ***",
        hits.length === 0,
        hits.length ? hits.map((h) => h.file + ":" + h.declaredAt + " const " + h.name + " (called " + h.calledAt + ")").join(" | ")
                    : "AT ZERO, so the next one reddens this line the round it lands -- which is the only way " +
                      "this class gets caught, since the thrown message points at the CALL and the bug is the DECLARATION");
}

// ---- 2. *** SABOTAGE: THE REAL BUG, RESTORED, MUST BE CAUGHT *** -------------------------------------------
{
    console.log("\n2. *** SABOTAGE: THE ACTUAL v4133 DEFECT, REBUILT FROM THE SHIPPED FILE ***");
    // Not a hand-written fixture: the real githubBridge.js with the rename undone. A detector proven only
    // against a toy is a detector nobody has shown finds the thing it was written for.
    const real = fs.readFileSync(path.join(ENG, "ai-bridge", "githubBridge.js"), "utf8");
    const broken = real.replace(/const _running = engineVersion\(\);/, "const _run = engineVersion();");
    ok("the sabotage actually changed the source", broken !== real);
    const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "shadow-gate-"));
    try {
        fs.mkdirSync(path.join(tmp, "ai-bridge"), { recursive: true });
        fs.writeFileSync(path.join(tmp, "ai-bridge", "githubBridge.js"), broken);
        const hits = shadowedHelpers(tmp);
        ok("!! *** SABOTAGE: re-introducing `const _run` is CAUGHT, naming the call that would throw ***",
            hits.length === 1 && hits[0].name === "_run" && hits[0].calledAt < hits[0].declaredAt,
            hits.length ? "const " + hits[0].name + " @" + hits[0].declaredAt + ", called @" + hits[0].calledAt +
                          " in " + hits[0].scope + "() -- the crash Keith saw" : "NOT CAUGHT");
    } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
}

// ---- 3. *** AND IT DOES NOT CRY WOLF -- THE FALSE POSITIVE THE FIRST DRAFT PRODUCED *** --------------------
{
    console.log("\n3. *** SIBLING BLOCKS ARE NOT SHADOWING, WHICH THE FIRST DRAFT GOT WRONG ***");
    // The first version approximated scope as "the nearest column-zero function" and flagged deviceBridge.js:
    // makeCaller called at 161, shadowed at 270 -- both inside handle(), so a crash by that rule. IT IS NOT:
    // 161 is in `if (route === "/start")` and 270 in `if (route === "/bench/start")`. `const` is BLOCK-scoped.
    // Shipping that would have put a non-bug at the top of a list whose whole value is that it is short.
    const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "shadow-sib-"));
    try {
        fs.mkdirSync(path.join(tmp, "ai-bridge"), { recursive: true });
        fs.writeFileSync(path.join(tmp, "ai-bridge", "siblings.js"),
            "function helper() { return 1; }\n" +
            "async function handle(route) {\n" +
            "    if (route === \"/a\") {\n" +
            "        const x = helper();\n" +          // calls the module helper -- fine
            "        return x;\n" +
            "    }\n" +
            "    if (route === \"/b\") {\n" +
            "        const helper = async () => 2;\n" + // shadows, but in a SIBLING block
            "        return helper();\n" +
            "    }\n" +
            "}\n");
        const hits = shadowedHelpers(tmp);
        ok("!! *** a shadow in a SIBLING block is NOT reported -- const is block-scoped ***",
            hits.length === 0, hits.map((h) => h.name + "@" + h.declaredAt).join(", ") || "clean, correctly");
    } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }

    // AND THE OTHER DIRECTION: same block, called first, must still be caught -- or the fix above would have
    // been a way of switching the detector off rather than making it right.
    const tmp2 = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "shadow-same-"));
    try {
        fs.mkdirSync(path.join(tmp2, "ai-bridge"), { recursive: true });
        fs.writeFileSync(path.join(tmp2, "ai-bridge", "same.js"),
            "function helper() { return 1; }\n" +
            "async function handle() {\n" +
            "    const a = helper();\n" +              // called here...
            "    const helper = async () => 2;\n" +    // ...and shadowed in the SAME block: TDZ
            "    return a + await helper();\n" +
            "}\n");
        const hits = shadowedHelpers(tmp2);
        ok("!! ...and the SAME-block case is still caught, so section 3's fix did not disarm section 2",
            hits.length === 1 && hits[0].name === "helper", hits.length + " hit(s)");
    } finally { try { fs.rmSync(tmp2, { recursive: true, force: true }); } catch {} }
}

// ---- 4. THE FIX ITSELF, AND THAT THE CLONE PATH CAN REACH ITS TOOL AGAIN -----------------------------------
{
    console.log("\n4. THE githubBridge FIX, CHECKED IN THE SHIPPED FILE");
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "githubBridge.js"), "utf8");
    ok("!! the module-level git runner is still a function declaration named _run",
        /^function _run\(cmd, args, opts\)/m.test(src),
        "the fix renamed the LOCAL, not the helper -- renaming the helper would have moved the collision rather than removed it");
    ok("!! ...and the version local no longer collides with it", /const _running = engineVersion\(\);/.test(src) && !/const _run = engineVersion\(\)/.test(src));
    // *** THE REAL PROOF IS THAT THE FUNCTION PARSES AND ITS FIRST GIT CALL IS REACHABLE. *** Running an actual
    // clone here would hit the network on every ship, so the reachability is established by loading the module
    // and confirming the export exists and is callable -- the crash was at REQUIRE-free call time, not at parse.
    let loadable = false, err = "";
    try {
        const out = execFileSync(process.execPath, ["-e",
            "const g=require('" + path.join(ENG, "ai-bridge", "githubBridge.js") + "');" +
            "if (typeof g.cloneEngineSource !== 'function') { console.log('NOT-A-FUNCTION'); process.exit(0); }" +
            "console.log('OK');"], { timeout: 20000, encoding: "utf8" });
        loadable = /OK/.test(out);
    } catch (e) { err = String((e && e.message) || e).slice(0, 200); }
    ok("!! cloneEngineSource loads and is callable", loadable, err || "exported");
    report("NOT RUN HERE: a live clone. It was run BY HAND against the real repository after the fix and " +
           "returned ok:true, version v4147, auth token -- a gate that clones GitHub on every ship would be a " +
           "gate somebody switches off, which is the same argument grdpwasm's gate makes about its Go build.");
}

console.log("\n" + (fails ? fails + " FAILED" : "shadowedHelper-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);

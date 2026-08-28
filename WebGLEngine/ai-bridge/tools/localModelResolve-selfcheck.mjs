// ai-bridge/tools/localModelResolve-selfcheck.mjs
//
// Run: node ai-bridge/tools/localModelResolve-selfcheck.mjs
// RUNTIME 227ms MEASURED (median of 3 -- 221/227/240 ms). Every check drives a REAL ephemeral
// http.createServer on a real port rather than a
// mocked fetch, because the thing under test IS an HTTP conversation with somebody else's server -- and the
// contract it has to satisfy is that server's, not one this gate invented.
//
// v4016 -- Keith: "can we set up the mac to use https://github.com/drumih/turbo-fieldfare". Most of the wiring
// was already there: aiProviders' mlxChat (v1138) speaks OpenAI-compatible Chat Completions and DEFAULTS to
// http://127.0.0.1:8080, which is TurboFieldfareServer's own default port. It would have failed anyway.
//
// *** THE PLACEHOLDER "default" WAS SENT AS A MODEL NAME TO A SERVER THAT COMPARES MODEL NAMES EXACTLY. ***
// Read out of turbo-fieldfare's own source rather than assumed -- Sources/TurboFieldfareServer/Core/
// OpenAIModels.swift: `guard request.model == modelID else { throw ServerRequestError.unknownModel }`. One
// string compare, no aliasing, no "default". So an unconfigured engine talking to a perfectly healthy server
// got an HTTP error, and the old message then asked whether a server was running at the address that had
// just answered it -- the least useful thing it could say, and the second half of this fix.
//
// THE NAME WAS NEVER SECRET: /v1/models is part of the same OpenAI-compatible surface, mlxInstallBridge's
// detect() has been reading it since v1139, and it threw the answer away. SAME SPECIES AS v4015 ONE VERSION
// EARLIER: a signal the tree already collected and discarded.
"use strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };

const AP = require_(path.join(ENG, "ai-bridge", "aiProviders.js"));
const MIB = require_(path.join(ENG, "ai-bridge", "mlxInstallBridge.js"));

// A stand-in for TurboFieldfareServer that keeps the ONE property that broke this: the model name is compared
// exactly, and anything else is refused. `served` is what /v1/models publishes and what /v1/chat/completions
// will accept -- one value, so the two can never silently disagree the way a hand-typed config does.
function serverServing(served, { modelsRoute = true } = {}) {
    const seen = [];
    const srv = http.createServer((req, res) => {
        const url = (req.url || "").split("?")[0];
        if (url === "/v1/models") {
            if (!modelsRoute) { res.writeHead(404); res.end("not found"); return; }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ object: "list", data: [{ id: served, object: "model", owned_by: "turbofieldfare" }] }));
            return;
        }
        if (url === "/v1/chat/completions") {
            let body = "";
            req.on("data", (d) => { body += d; });
            req.on("end", () => {
                let j = {}; try { j = JSON.parse(body); } catch {}
                seen.push(j.model);
                if (j.model !== served) {   // TurboFieldfare's own guard, reproduced exactly
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: { message: "unknown model", code: "unknown_model" } }));
                    return;
                }
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "READY" } }] }));
            });
            return;
        }
        res.writeHead(404); res.end("not found");
    });
    return new Promise((resolve) => srv.listen(0, "127.0.0.1", () =>
        resolve({ srv, seen, base: "http://127.0.0.1:" + srv.address().port, close: () => new Promise((r) => srv.close(r)) })));
}

console.log("localModelResolve-selfcheck -- does the engine ask the local server what it serves, or guess?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE EXACT SHAPE THAT FAILED: A HEALTHY SERVER, AND A PLACEHOLDER MODEL NAME ***");
{
    const s = await serverServing("gemma-4-26b-a4b-it");
    const r = await AP.mlxChat("Reply with exactly READY.", { mlxHost: s.base, model: "" });
    ok("!! *** with nothing configured, the chat SUCCEEDS against a server that checks the model name ***",
        r.ok === true && r.text === "READY",
        r.ok ? "model resolved to " + r.model : "error: " + r.error);
    ok("!! ...and the name it sent was the server's OWN, never the placeholder",
        s.seen.length === 1 && s.seen[0] === "gemma-4-26b-a4b-it" && !s.seen.includes("default"),
        "sent: " + JSON.stringify(s.seen));
    await s.close();
}

// ---------------------------------------------------------------------------
console.log("\n2. *** SABOTAGE: THE OLD BEHAVIOUR, AGAINST THE SAME SERVER ***");
{
    // NOT a description of the old bug -- the old code path DRIVEN. Passing model:"default" explicitly is
    // exactly what the previous version did with no config, so this reproduces the failure rather than
    // asserting it once happened.
    const s = await serverServing("gemma-4-26b-a4b-it");
    const r = await AP.mlxChat("Reply with exactly READY.", { mlxHost: s.base, model: "default" });
    ok("!! *** sending the old placeholder against the same live server FAILS ***", r.ok === false,
        "which is the bug this round fixes, reproduced rather than remembered: " + r.error);
    ok("!! ...and the error NAMES WHAT THE SERVER DOES SERVE rather than asking if it is running",
        /gemma-4-26b-a4b-it/.test(r.error) && /is up and serving/.test(r.error) && !/is a local OpenAI-compatible server running/.test(r.error),
        r.error);
    await s.close();
}

// ---------------------------------------------------------------------------
console.log("\n3. *** AN EXPLICIT CHOICE IS NEVER OVERRIDDEN BY THE PROBE ***");
{
    const s = await serverServing("gemma-4-26b-a4b-it");
    const r = await AP.mlxChat("hi", { mlxHost: s.base, model: "gemma-4-26b-a4b-it" });
    ok("a configured model is used as given and no resolve is needed", r.ok === true && r.model === "gemma-4-26b-a4b-it");
    ok("!! ...and exactly ONE request reached the completions route, so the probe did not run",
        s.seen.length === 1, "requests seen: " + s.seen.length);
    await s.close();
}

// ---------------------------------------------------------------------------
console.log("\n4. *** A SERVER TOO MINIMAL TO PUBLISH /v1/models BEHAVES EXACTLY AS BEFORE ***");
{
    // The fallback is what keeps this from being a REGRESSION for the servers v1138 was written against.
    const s = await serverServing("default", { modelsRoute: false });
    const r = await AP.mlxChat("hi", { mlxHost: s.base, model: "" });
    ok("!! with no /v1/models to ask, it falls back to the old placeholder rather than refusing outright",
        r.ok === true && s.seen[0] === "default",
        "sent: " + JSON.stringify(s.seen) + " -- servers that accepted 'default' before still work");
    await s.close();

    const gone = await AP.resolveLocalModel("http://127.0.0.1:1", { timeout: 500 });
    ok("!! ...and an address with nothing on it returns ok:false rather than throwing",
        gone.ok === false && /unreachable|http_/.test(gone.error), gone.error);
}

// ---------------------------------------------------------------------------
console.log("\n5. *** resolveLocalModel READS THE SERVER'S LIST, IT DOES NOT INVENT ONE ***");
{
    const s = await serverServing("some-model-nobody-hardcoded");
    const got = await AP.resolveLocalModel(s.base);
    ok("!! the model comes back from the wire, so no name is baked into this tree",
        got.ok === true && got.model === "some-model-nobody-hardcoded" && got.models.length === 1,
        JSON.stringify(got.models));
    // A base already carrying /v1 must not become /v1/v1/models.
    const versioned = await AP.resolveLocalModel(s.base + "/v1");
    ok("!! a base URL that already ends in /v1 is not doubled", versioned.ok === true && versioned.model === "some-model-nobody-hardcoded");
    await s.close();

    const SRC = fs.readFileSync(path.join(ENG, "ai-bridge", "aiProviders.js"), "utf8");
    ok("!! *** and no gemma model id is hardcoded in the provider ***", !/gemma-4-26b/i.test(SRC),
        "the whole point is asking the server; a name typed here would drift the first time drumih renames one");
}

// ---------------------------------------------------------------------------
console.log("\n6. *** THE CATALOG ADMITS SOMETHING IT CANNOT INSTALL ***");
{
    const cat = MIB.catalog();
    const tf = cat.items.find((i) => i.id === "turbofieldfare");
    ok("!! TurboFieldfare is in the local-server catalog", !!tf, tf ? tf.label : "MISSING");
    ok("!! ...and is marked NOT installable, because it is a source build and not a package",
        tf && tf.installable === false,
        "every other entry is a pip/brew line this bridge can spawn; this one is git clone + swift build");
    ok("...and the others are still marked installable, so the flag is specific rather than blanket",
        cat.items.filter((i) => i.id !== "turbofieldfare").every((i) => i.installable === true));
    ok("!! its port is the one mlxChat already defaults to, so detect() finds it with nothing added",
        tf && tf.port === 8080, "port " + (tf && tf.port));
    ok("...and the note carries the real steps a person needs", tf && /swift build/.test(tf.run) &&
        /Apple Silicon/.test(tf.note) && /turbo-fieldfare/.test(tf.note));

    // install() MUST REFUSE RATHER THAN SPAWN. Checked on every platform: on non-Mac the macOS guard fires
    // first, so the source-build refusal is driven directly to prove it exists on the path that reaches it.
    const CAT = require_(path.join(ENG, "ai-bridge", "mlxInstallBridge.js"));
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "mlxInstallBridge.js"), "utf8");
    // *** v4090 -- THIS CHECK WAS LOOKING FOR A TOKEN A REFACTOR HAD RENAMED, AND FAILED FOR THAT REASON ALONE.
    // *** It ordered the refusal against `src.indexOf("spawn(cmd, args")`, and v4037 made the spawn INJECTABLE --
    // `spawnImpl(cmd, args, { windowsHide: true })`, with `spawnImpl = spawn` as the default param -- precisely so
    // this gate could drive the failure branches without spawning anything. So indexOf returned -1, and
    // `12413 < -1` is false: THE ORDERING NEVER CHANGED, THE NAME DID. The refusal is still on line 154 and the
    // spawn still on line 158, verified by reading them.
    //
    // A SECOND HARDCODED LITERAL WOULD ROT THE SAME WAY, so this no longer greps the whole file for one. It
    // extracts install()'s OWN BODY (brace-matched from its declaration) and asks the question the sentence
    // actually makes -- is the refusal ahead of the spawn IN THIS FUNCTION -- which is also stricter than the
    // original: the old form compared against the FIRST `spawn(cmd, args` anywhere in the file, and uninstall()
    // below carries a byte-for-byte identical spawn, so a future edit moving install()'s refusal after its spawn
    // could still have passed on uninstall()'s copy.
    // THE PARAMETER LIST IS ITSELF A DESTRUCTURED OBJECT -- `install(id, { spawnImpl = spawn, _isMac = isMac } = {})`
    // -- so "brace-match from the first {" grabs the PARAMS and returns a 64-char stub. That is not hypothetical:
    // the first version of this extractor did exactly that, and the seam assertion below then passed VACUOUSLY on
    // the stub (its regex matches the declaration prefix, and its negative had nothing to find). Close the
    // parameter PARENS first, then brace-match the body.
    const installBody = (() => {
        const start = src.indexOf("async function install(id,");
        if (start < 0) return "";
        let p = 0, bodyOpen = -1;
        for (let j = src.indexOf("(", start); j < src.length; j++) {
            if (src[j] === "(") p++;
            else if (src[j] === ")") { p--; if (p === 0) { bodyOpen = src.indexOf("{", j); break; } }
        }
        if (bodyOpen < 0) return "";
        let depth = 0;
        for (let j = bodyOpen; j < src.length; j++) {
            if (src[j] === "{") depth++;
            else if (src[j] === "}") { depth--; if (depth === 0) return src.slice(start, j + 1); }
        }
        return "";
    })();
    ok("...and install()'s body was actually extracted, so the ordering below is not measured on a stub",
        installBody.length > 500 && installBody.includes("return new Promise"),
        installBody.length + " chars. THE FIRST VERSION OF THIS EXTRACTOR RETURNED 64 -- the destructured " +
        "parameter object -- and the seam check below passed vacuously on it. A scope check that silently " +
        "extracts nothing turns every assertion against it into a check of the empty string");
    const refusalAt = installBody.indexOf("if (!item.install)");
    const spawnAt = installBody.search(/spawnImpl\(cmd, args/);
    ok("!! install() refuses a source-build entry before reaching the spawn",
        /if \(!item\.install\) return \{ ok: false, installable: false/.test(installBody) &&
        refusalAt >= 0 && spawnAt >= 0 && refusalAt < spawnAt,
        "the refusal is ahead of the spawn IN install()'s OWN BODY (refusal at offset " + refusalAt + ", spawn at " +
        spawnAt + " of a " + installBody.length + "-char body), not a check after the fact -- and scoped to that " +
        "body rather than to the file, because uninstall() carries an identical spawn that would otherwise " +
        "satisfy the ordering on install()'s behalf");
    ok("...and the spawn it is ordered against is the INJECTABLE seam, not a bare child_process call",
        /async function install\(id, \{ spawnImpl = spawn/.test(installBody) && !/[^I]\bspawn\(cmd, args/.test(installBody),
        "v4037 made it `spawnImpl = spawn` as a default param so this gate can drive the failure branches " +
        "without spawning anything. Asserting the seam is present stops a future edit from quietly reverting to " +
        "a direct spawn() and taking the testability with it -- which is what the old token was accidentally " +
        "guarding, and lost the moment it was renamed");
    const r = await CAT.install("turbofieldfare");
    ok("...and asking for it returns ok:false with instructions, on any platform", r.ok === false && !!r.error);
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);

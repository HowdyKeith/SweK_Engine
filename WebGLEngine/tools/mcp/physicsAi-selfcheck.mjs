// WebGLEngine/tools/mcp/physicsAi-selfcheck.mjs -- v4067
//
// Gates tools/mcp/physicsAi.mjs -- the MCP shim over the physics proposer registry.
//
// *** THE FAILURE THIS GATE EXISTS FOR IS DRIFT, NOT BREAKAGE. *** An MCP shim's natural shape is to hand-type
// a description of the thing it wraps: the list of proposer ids, the fields runProposer returns, which knobs
// have a search. proposers.mjs gained a whole new return field (`searched`) one round before this shim was
// written, and a typed copy would already have been wrong. A shim that answers confidently from a stale copy is
// worse than no shim, because the caller cannot tell. So the property under test is DERIVATION: the tool
// answers must change when the registry changes, and the gate proves that by CHANGING THE REGISTRY and
// re-asking rather than by reading the source and believing it.
//
// *** AND THE SECOND PROPERTY IS A REFUSAL: grantLicence AND applyKnobs MUST NOT BE REACHABLE. *** They are the
// registry's write path and apply path. proposers.mjs already refuses a forged {pass:true}, so exposing them
// would not be exploitable -- they are still absent, because an MCP client is by construction something other
// than this repo's own runs, and the licence ratchet has never been reachable from outside before.
//
// The live half drives a REAL MCP handshake over stdio -- initialize, tools/list, tools/call -- because "the
// handlers return the right thing" and "this process speaks MCP" are different claims and only one of them is
// provable by calling functions.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadRegistry, buildTools } from "./physicsAi.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const SRC = fs.readFileSync(path.join(HERE, "physicsAi.mjs"), "utf8");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (l) => console.log("  ----  " + l);
const j = (r) => JSON.parse(r.content[0].text);
console.log("physicsAi-selfcheck -- the MCP shim over the physics AI, and the two things it must not become\n");

const loaded = await loadRegistry();
const T = buildTools(loaded);

console.log("1. EVERY TOOL ANSWERS FROM THE REAL REGISTRY");
{
    const list = j(await T.physics_list_proposers.handler({}));
    const live = loaded.proposers.listProposers();
    ok("!! the proposer list matches listProposers() exactly -- same ids, same count, same order",
        list.registered.length === live.length &&
        list.registered.every((r, i) => r.id === live[i].id),
        list.registered.length + " proposers, " + list.counts.adaptive + " adaptive / " + list.counts.static +
        " static. Not a list typed in the shim -- read off the registry on every call");
    ok("...and the NOT_REGISTERED refusals travel with it, reasons included",
        Object.keys(list.notRegistered).length === Object.keys(loaded.registry.NOT_REGISTERED).length &&
        Object.values(list.notRegistered).every((v) => typeof v === "string" && v.length > 20),
        Object.keys(list.notRegistered).length + " instruments deliberately unregistered, each with its reason -- " +
        "a registry that silently omitted them would be indistinguishable from one that forgot");

    const run = j(await T.physics_run_proposer.handler({ id: "schrodinger-grid" }));
    ok("!! run returns runProposer's OWN object, field for field -- nothing reshaped in transit",
        ["id", "tier", "tried", "best", "bestScore", "verdict", "adopted", "scored", "accepted",
         "acceptedRank", "acceptedScore", "acceptedVerdict", "adjudicated", "searched"].every((k) => k in run),
        "including `searched`, which proposers.mjs only started returning one round ago -- a hand-typed shape " +
        "would already be missing it");

    const lic = j(await T.physics_licences.handler({}));
    ok("licences read back with their tiers and the path they came from",
        lic.licences.length === live.length && typeof lic.licencePath === "string" && Array.isArray(lic.tiers),
        lic.licences.length + " rows from " + path.basename(lic.licencePath));
}

console.log("\n2. *** DERIVATION, PROVEN BY CHANGING THE REGISTRY UNDER IT ***");
{
    // A shim that typed its own list would answer identically here. That is the whole test.
    const before = j(await T.physics_list_proposers.handler({})).registered.length;
    loaded.proposers.registerProposer({
        id: "gate-probe-instrument", instrument: "gate-probe", knobs: ["N"],
        propose: () => [{ N: 1 }], score: (c) => 1 / c.N,
        adjudicate: (c) => ({ pass: c.N >= 4, evidence: { N: c.N } }),
        search: { knob: "N", cheap: 1, costly: 64, integer: true, make: (N) => ({ N }) },
    });
    const after = j(await T.physics_list_proposers.handler({}));
    const row = after.registered.find((r) => r.id === "gate-probe-instrument");
    ok("!! a proposer registered AFTER the tools were built appears without touching the shim",
        after.registered.length === before + 1 && !!row,
        before + " -> " + after.registered.length + " proposers. THE LIST IS READ, NOT REMEMBERED");
    ok("!! ...and its search shape is read off the proposer, not guessed from its name",
        row.searchKind === "adaptive-bisect" && row.searchKnob === "N" &&
        row.searchRange.cheap === 1 && row.searchRange.costly === 64 && row.searchRange.integer === true,
        JSON.stringify(row.searchRange) + " -- the same fields registerProposer stored");
    const cmp = j(await T.physics_compare_paths.handler({ id: "gate-probe-instrument" }));
    ok("!! and compare finds its TRUE edge (N=4 passes, N=3 does not) through the shim",
        cmp.comparable === true && cmp.adaptiveAccepted === 4 && cmp.failingSide === 3 &&
        cmp.boundaryVerified === true,
        "static picked " + cmp.staticAccepted + " from its one-item list; the search found the edge at " +
        cmp.adaptiveAccepted + " with " + cmp.failingSide + " verified failing");
    // Restore, so nothing below sees the probe instrument.
    loaded.proposers.resetRegistry(); loaded.registry.registerAll();
}

console.log("\n3. THE REFUSALS -- ASSERTED BY MECHANISM, NOT BY PROMISE");
{
    const names = Object.keys(T);
    ok("!! *** NO TOOL REACHES grantLicence OR applyKnobs *** -- the write path and the apply path",
        !names.some((n) => /grant|apply|adopt|write|set_?licence/i.test(n)),
        "exposed: " + names.join(", ") + ". Reading the licences is offered; changing them is not");
    const code = SRC.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    ok("...and neither is even CALLED in the shim's code, so no tool can reach one indirectly",
        !/\bgrantLicence\s*\(/.test(code) && !/\bapplyKnobs\s*\(/.test(code),
        "checked against the source with comments stripped -- the prose above discusses both by name, and a " +
        "raw-source grep would have been satisfied by the discussion rather than by the absence");
    ok("!! NO tool declares an outputSchema -- the anti-second-declaration property",
        !/outputSchema/.test(code),
        "declaring one would be a second copy of runProposer's return shape, which is the exact drift this " +
        "file is built to avoid");
}

console.log("\n4. UNKNOWN INPUTS ARE REFUSED BY NAME, NOT ANSWERED EMPTILY");
{
    const bad = await T.physics_run_proposer.handler({ id: "no-such-thing" });
    ok("!! an unknown id is an error that NAMES the ids that exist",
        bad.isError === true && /no proposer 'no-such-thing'/.test(bad.content[0].text) &&
        /schrodinger-grid/.test(bad.content[0].text),
        "an empty result would read as 'nothing to report' about a real instrument");
    const noSearch = j(await T.physics_compare_paths.handler({ id: "lz-window" }));
    ok("!! comparing a proposer with no search says so rather than pretending to have searched",
        noSearch.comparable === false && /declares no `search`/.test(noSearch.why) && !!noSearch.static,
        "it still returns the static answer, so the call is useful without being misleading");
    const noRange = await T.physics_probe_monotone.handler({ id: "lz-window" });
    ok("...and probing one with no declared range refuses instead of inventing bounds",
        noRange.isError === true && /no search/.test(noRange.content[0].text));
}

console.log("\n5. *** THE PROBE THAT LICENSES A SEARCH, THROUGH THE SHIM ***");
{
    const lz = j(await T.physics_probe_monotone.handler({ id: "lz-window", cheap: 1, costly: 40 }));
    ok("!! lz-window reads NON-monotone through the shim, which is why it has no search",
        lz.monotone === false && lz.flips > 1 && /more than one flip/.test(lz.verdict),
        "flips=" + lz.flips + " over " + lz.samples + " samples. The Landau-Zener sweep rings, so a bisection " +
        "would find AN edge and report it with the confidence of the right one");
    const sg = j(await T.physics_probe_monotone.handler({ id: "schrodinger-grid" }));
    ok("!! ...and schrodinger-grid reads monotone, on its own declared range",
        sg.monotone === true && sg.flips === 1 && /valid/.test(sg.verdict),
        "flips=" + sg.flips + " -- one mechanism, both answers");
    ok("...and each result says HOW it built its candidates, because that is an assumption for a knob with no make()",
        /search\.make\(\)/.test(sg.madeCandidateBy) && /assuming a single knob/.test(lz.madeCandidateBy),
        "schrodinger used its own make(); lz-window has none, so the shim assumed one knob and SAYS so");
}

console.log("\n6. THE RESOLVER NAMES WHICH HALF IS MISSING -- THE BUG THIS FILE WAS WRITTEN AFTER HITTING");
{
    const code = SRC.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    ok("!! the SDK, its transport and its peer `zod` are each resolved in their own try, with their own message",
        (code.match(/return \{ error:/g) || []).length >= 3 && /ITS PEER/.test(SRC),
        "the first draft resolved the SDK by explicit path and zod by BARE SPECIFIER, which does not resolve " +
        "from tools/mcp/ -- so a present SDK reported itself as 'not installed'. Same misattribution " +
        "playwrightResolve.mjs exists to end for chromium");
    ok("...and every dependency goes through ONE resolver rather than each guessing",
        /function importEither\(/.test(code) && (code.match(/importEither\(/g) || []).length >= 4,
        "one place knows where ai-bridge/node_modules is; a fourth dependency added later inherits it");
}

console.log("\n7. LIVE: A REAL MCP HANDSHAKE OVER STDIO");
{
    const sdkThere = fs.existsSync(path.join(ENG, "ai-bridge", "node_modules", "@modelcontextprotocol", "sdk"));
    if (!sdkThere) {
        report("live half SKIPPED -- @modelcontextprotocol/sdk is not installed here (it is an " +
               "optionalDependency; run `npm install` in ai-bridge/).");
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-6 call the handlers directly, and calling a " +
               "function proves nothing about whether this process speaks the protocol. ***");
    } else {
        const proc = spawn(process.execPath, [path.join(HERE, "physicsAi.mjs")], { cwd: ENG, stdio: ["pipe", "pipe", "pipe"] });
        let buf = ""; const pending = new Map(); let nextId = 0;
        proc.stdout.on("data", (d) => {
            buf += d.toString();
            let i;
            while ((i = buf.indexOf("\n")) >= 0) {
                const line = buf.slice(0, i); buf = buf.slice(i + 1);
                if (!line.trim()) continue;
                try { const m = JSON.parse(line); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } catch {}
            }
        });
        // *** THE TIMEOUT IS CLEARED ON RESOLVE, AND LEAVING IT UNCLEARED COST THIS GATE SIXTY SECONDS PER
        // RUN. *** The first draft armed a 60s rejection timer per request and never cancelled it. Every call
        // SUCCEEDED in milliseconds and every check passed -- and then the pending timers held Node's event
        // loop open until the last one fired, so a live half whose real work totals ~430ms took 60.8s wall
        // clock, three times running, consistently enough to look like a genuine measurement. It was about to
        // be recorded in gateBudget.mjs as this gate's cost. A HANG AND A COST ARE DIFFERENT FACTS AND THE
        // STOPWATCH CANNOT TELL THEM APART: what separated them was that 60.8s is suspiciously close to a
        // round 60s, and that timing the handlers directly found 430ms.
        const rpc = (method, params) => new Promise((res, rej) => {
            const id = ++nextId;
            const timer = setTimeout(() => { pending.delete(id); rej(new Error("timeout on " + method)); }, 30000);
            pending.set(id, (m) => { clearTimeout(timer); res(m); });
            proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
        });
        try {
            const init = await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "gate", version: "1" } });
            ok("!! initialize completes and the server identifies itself",
                init.result && init.result.serverInfo && init.result.serverInfo.name === "swek-physics-ai",
                init.result ? init.result.serverInfo.name + " v" + init.result.serverInfo.version : "no serverInfo");
            proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

            const tl = await rpc("tools/list", {});
            const advertised = tl.result.tools.map((t) => t.name).sort();
            ok("!! tools/list advertises exactly the handlers buildTools() produces -- no third list anywhere",
                JSON.stringify(advertised) === JSON.stringify(Object.keys(T).sort()),
                advertised.join(", "));
            ok("!! ...and NOT ONE advertises an outputSchema over the wire",
                tl.result.tools.every((t) => !t.outputSchema),
                "checked on the actual protocol payload, not on the source");
            ok("!! no mutating tool is reachable over the protocol",
                !advertised.some((n) => /grant|apply|adopt|write/i.test(n)),
                "the refusal in section 3 is a property of what a CLIENT can see, so it is re-checked here");

            const call = await rpc("tools/call", { name: "physics_compare_paths", arguments: { id: "md-timestep" } });
            const got = JSON.parse(call.result.content[0].text);
            ok("!! *** tools/call runs the real search end to end: the shortlist's dt against the measured edge ***",
                got.comparable === true && got.knob === "dt" && got.staticAccepted === 0.012 &&
                got.adaptiveAccepted > got.staticAccepted && got.boundaryVerified === true,
                "dt " + got.staticAccepted + " -> " + got.adaptiveAccepted.toPrecision(6) + " (cheap is a BIG " +
                "timestep here), edge verified, " + got.staticAdjudications + " -> " + got.adaptiveAdjudications +
                " adjudications. THIS IS THE WHOLE POINT OF THE SHIM, over a real transport");

            const missing = await rpc("tools/call", { name: "physics_grant_licence", arguments: {} });
            ok("!! a client asking for a tool that does not exist is refused, not silently ignored",
                missing.result && missing.result.isError === true && /not found/i.test(missing.result.content[0].text),
                missing.result ? missing.result.content[0].text.slice(0, 60) : "no result");
        } finally { proc.kill(); }
    }
}

console.log(fails ? `\nphysicsAi-selfcheck: ${fails} FAILED` : "\nphysicsAi-selfcheck: all checks pass");
if (fails) process.exit(1);

// WebGLEngine/tools/ship/modelCatalogue-selfcheck.mjs -- v2826
//
// Run: node tools/ship/modelCatalogue-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/roundhouse/modelCatalogue.mjs + the /device/models and /device/pull routes.
//
// THE CATALOGUE IS A LIST I WROTE FROM DOCUMENTATION, so the thing that must be gated is NOT that the tags are
// correct -- I cannot prove that here, and claiming to would be the Fresnel table-values mistake again. What is
// gated is that the code TREATS THEM AS UNVERIFIED until a real registry says otherwise, that the fit arithmetic
// is right, and that the install route cannot be talked into fetching something that is not on the list.
//
// AND THE BUG THIS ROUND ACTUALLY CAUGHT: the first describePeer sized CPU peers purely by MEMORY, so a CPU box
// with 16GB was assigned a 14B -- which loads fine and then generates at about a token a second. Memory is not
// the binding constraint on a CPU peer; throughput is. Pinned below, because the failure looks like success.

import { createRequire } from "node:module";
import { prose } from "./sourceScan.mjs";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { CATALOGUE, KV_OVERHEAD_GB, CPU_MAX_PARAMS, requiredGB, fitsIn, modelsFor, bestFor, unifiedBudgetGB, describePeer, verifyAgainstInstalled, unverifiedTags, assignModels } from "../roundhouse/modelCatalogue.mjs";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. THE CATALOGUE ADMITS WHAT IT IS
{
    ok("every entry ships UNVERIFIED (a recalled tag is a guess, not a fact)", CATALOGUE.every((e) => e.verified === false));
    ok("unverifiedTags names all of them until a registry is consulted", unverifiedTags().length === CATALOGUE.length);
    ok("every entry carries a tag, params and a size", CATALOGUE.every((e) => e.tag && e.params > 0 && e.approxGB > 0));
    ok("every entry carries a STRUCTURED-OUTPUT note (the property that matters for a proposer)", CATALOGUE.every((e) => typeof e.jsonNote === "string" && e.jsonNote.length > 10));
    ok("size grows with parameter count (an internally consistent list)",
        [...CATALOGUE].sort((a, b) => a.params - b.params).every((e, i, arr) => i === 0 || e.approxGB >= arr[i - 1].approxGB));
    ok("tags are unique", new Set(CATALOGUE.map((e) => e.tag)).size === CATALOGUE.length);
}

// 2. THE FIT ARITHMETIC
{
    const e = CATALOGUE.find((x) => x.params === 7);
    ok("required = artifact + KV overhead", Math.abs(requiredGB(e) - (e.approxGB + KV_OVERHEAD_GB)) < 1e-9);
    ok("a 7B fits an 8GB card, a 14B does not", fitsIn(e, 8) && !fitsIn(CATALOGUE.find((x) => x.params === 14), 8));
    ok("modelsFor returns largest-first", modelsFor(30).every((x, i, a) => i === 0 || x.params <= a[i - 1].params));
    ok("bestFor(8) picks the largest that fits, not the largest overall", bestFor(8).params === 8);
    ok("bestFor returns null rather than a lie when nothing fits", bestFor(1) === null);
    ok("unified budget reserves room for the OS", unifiedBudgetGB(16) === 12 && unifiedBudgetGB(2) === 0);
}

// 3. THE CPU THROUGHPUT CAP -- the bug this round caught
{
    const cpu = describePeer({ name: "cpu", url: "u", kind: "cpu", memoryGB: 16 });
    const gpu = describePeer({ name: "gpu", url: "u", kind: "gpu", memoryGB: 16 });
    ok("a CPU peer is capped by PARAMETER COUNT, not just memory", cpu.canRun.every((t) => CATALOGUE.find((e) => e.tag === t).params <= CPU_MAX_PARAMS), cpu.canRun.join(","));
    ok("...so a 16GB CPU box is NOT handed a 14B", !cpu.canRun.includes("qwen2.5:14b") && cpu.best !== "qwen2.5:14b", String(cpu.best));
    ok("...while a GPU peer with the same memory IS", gpu.canRun.includes("qwen2.5:14b"));
    ok("the cap is reported, not silent", cpu.cappedByThroughput === CPU_MAX_PARAMS && gpu.cappedByThroughput === null);
    ok("a CPU peer is flagged batch-only rather than excluded (this workload is batch)", cpu.batchOnly === true && cpu.canRun.length > 0);
}

// 4. THE FLEET, as actually described
{
    const rig = describePeer({ name: "rig", url: "u", kind: "gpu", memoryGB: 8 });
    const mac16 = describePeer({ name: "mac", url: "u", kind: "unified", totalRamGB: 16 });
    ok("the 8GB card tops out below 14B", rig.best !== null && CATALOGUE.find((e) => e.tag === rig.best).params <= 9, String(rig.best));
    ok("a 16GB unified Mac reaches a class the 8GB card cannot", CATALOGUE.find((e) => e.tag === mac16.best).params > CATALOGUE.find((e) => e.tag === rig.best).params,
        `${rig.best} vs ${mac16.best}`);
    const nothing = describePeer({ name: "toaster", url: "u", kind: "gpu", memoryGB: 1 });
    ok("a peer that can run nothing says so explicitly", nothing.nothingFits === true && nothing.best === null);
}

// 5. ASSIGNMENT: one model per peer, nothing swaps
{
    const fleet = [
        describePeer({ name: "rig", url: "u", kind: "gpu", memoryGB: 8 }),
        describePeer({ name: "macA", url: "u", kind: "unified", totalRamGB: 16 }),
        describePeer({ name: "cpu", url: "u", kind: "cpu", memoryGB: 16 }),
    ];
    const a = assignModels(fleet);
    ok("every peer gets exactly one model", a.length === 3 && a.every((x) => x.model));
    ok("models are DISTINCT (two peers on one model measure the same thing twice)", new Set(a.map((x) => x.model)).size === 3, a.map((x) => x.model).join(","));
    ok("each assignment respects that peer's own capability", a.every((x) => fleet.find((p) => p.name === x.peer).canRun.includes(x.model)));
    const impossible = assignModels([describePeer({ name: "toaster", url: "u", kind: "gpu", memoryGB: 1 })]);
    ok("a peer that fits nothing gets null WITH a reason", impossible[0].model === null && !!impossible[0].reason);
}

// 6. VERIFICATION replaces belief with a lookup
{
    const v = verifyAgainstInstalled(["qwen2.5:7b", "llama3.1:8b-instruct-q4_K_M"]);
    const exact = v.find((e) => e.tag === "qwen2.5:7b");
    const variant = v.find((e) => e.tag === "llama3.1:8b");
    ok("an exactly-present tag becomes verified+installed", exact.verified === true && exact.installed === true);
    ok("a DIFFERENT QUANT of the same family is family-present but NOT verified", variant.familyPresent === true && variant.installed === false && variant.verified === false);
    ok("an absent family is neither", v.find((e) => e.tag === "gemma3:27b").familyPresent === false);
    ok("verification does not mutate the shipped catalogue", CATALOGUE.every((e) => e.verified === false));
}

// 7. THE INSTALL ROUTE cannot be talked into arbitrary weights
{
    const bridge = require(path.join(ENG, "ai-bridge", "deviceBridge.js"));
    const call = (url, method = "GET", body = null) => new Promise(async (r) => {
        const req = { url, method, on(ev, cb) { if (ev === "data" && body) cb(JSON.stringify(body)); if (ev === "end") cb(); return req; } };
        await bridge.handle(req, {}, { sendJson: (o, c = 200) => r({ body: o, code: c }) });
    });
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (u) => (String(u).includes("/api/tags")
        ? { ok: true, json: async () => ({ models: [{ name: "qwen2.5:7b" }] }) }
        : { ok: true, json: async () => ({ status: "success" }) });
    try {
        for (const bad of ["evil/backdoor:latest", "../../etc/passwd", "", "qwen2.5:7b; rm -rf /"]) {
            const r = await call("/device/pull", "POST", { tag: bad });
            ok(`/pull REFUSES a non-catalogue tag: ${JSON.stringify(bad).slice(0, 28)}`, r.code === 400 && r.body.error === "not-in-catalogue");
        }
        const good = await call("/device/pull", "POST", { tag: CATALOGUE[0].tag });
        ok("/pull accepts a catalogue tag", good.code === 200 && good.body.ok === true);
        const m = await call("/device/models?memoryGB=8&kind=gpu");
        ok("/models returns the catalogue with install state and a peer description", m.body.ok && Array.isArray(m.body.catalogue) && !!m.body.peer && Array.isArray(m.body.unverified));
        ok("/models marks what is actually installed", m.body.catalogue.find((e) => e.tag === "qwen2.5:7b").installed === true);
    } finally { globalThis.fetch = realFetch; }
}

// 8. the page uses it honestly
{
    const html = fs.readFileSync(path.join(ENG, "device.html"), "utf8");
    ok("page: fetches the catalogue", /\/device\/models/.test(html));
    ok("page: offers install-on-demand", /\/device\/pull/.test(html) && /id="install"/.test(html));
    ok("page: lets the peer's memory be stated", /id="mem"/.test(html) && /id="memkind"/.test(html));
    ok("page: DISABLES models that do not fit rather than hiding them", /disabled/.test(html) && /too big for this peer/.test(html));
    ok("page: surfaces how many tags are unverified", /unverified/.test(html));
}


// 9. REMOTE PEERS -- they consume none of the fleet's hardware, so none of the memory arithmetic applies
{
    const { DEFAULT_REMOTE_INTERVAL_MS } = await import("../roundhouse/modelCatalogue.mjs");
    const r = describePeer({ name: "gemini", url: "remote", kind: "remote", model: "gemini-2.5-flash", provider: "gemini" });
    ok("a remote peer NAMES its model rather than being sized", r.best === "gemini-2.5-flash" && r.canRun.length === 1);
    ok("...and its budget is NULL, not zero (the concept does not apply)", r.budgetGB === null);
    ok("...it carries no throughput cap and is not batch-only", r.cappedByThroughput === null && r.batchOnly === false);
    ok("...and it is PACED, because a free tier is per-minute tight", r.minIntervalMs >= 1000, r.minIntervalMs + "ms");
    ok("local peers are NOT paced (they are limited by their own speed)", describePeer({ name: "l", url: "u", kind: "gpu", memoryGB: 8 }).minIntervalMs === 0);
    const noModel = describePeer({ name: "x", url: "u", kind: "remote" });
    ok("a remote peer with NO model is refused WITH a reason", noModel.nothingFits === true && /must NAME its model/.test(noModel.reason || ""));

    // a mixed fleet: three local kinds plus a remote one
    const fleet = [
        describePeer({ name: "rig", url: "u", kind: "gpu", memoryGB: 8 }),
        describePeer({ name: "mac", url: "u", kind: "unified", totalRamGB: 16 }),
        describePeer({ name: "cpu", url: "u", kind: "cpu", memoryGB: 16 }),
        describePeer({ name: "gem", url: "u", kind: "remote", model: "gemini-2.5-flash", provider: "gemini" }),
    ];
    const a = assignModels(fleet);
    ok("a MIXED fleet assigns all four peers", a.length === 4 && a.every((x) => x.model));
    ok("...the remote one keeps its named model and provider", a[3].model === "gemini-2.5-flash" && a[3].provider === "gemini" && a[3].kind === "remote");
    ok("...and its pacing survives assignment", a[3].minIntervalMs >= 1000);
    ok("...while the local ones stay unpaced and distinct", a.slice(0, 3).every((x) => x.minIntervalMs === 0) && new Set(a.map((x) => x.model)).size === 4);
    ok("DEFAULT_REMOTE_INTERVAL_MS sits inside a 10 RPM ceiling", DEFAULT_REMOTE_INTERVAL_MS >= 6000);
}

console.log("modelCatalogue-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);

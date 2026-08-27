// tools/ship/localModelRun-selfcheck.mjs
//
// Run: node tools/ship/localModelRun-selfcheck.mjs
// RUNTIME 89ms MEASURED (median of 3 -- 89/101/84 ms, date(1) around the run). All arithmetic and injected
// fakes; it opens no socket and launches no browser. The two REAL browser renders this rests on were done
// separately with Playwright and are recorded in webgpu-llm.html.
//
// v4032 -- THIS IS THE FIRST THING IN THE TREE THAT CAN SPEND A GIGABYTE OF SOMEBODY'S DISK AND BANDWIDTH ON
// A CLICK, SO THE PROPERTY THAT MATTERS IS WHEN IT REFUSES.
//
//     THE DOWNLOAD DOOR IS THE PROBE'S VERDICT, NOT A SECOND OPINION ABOUT IT.
//
// downloadGate() must CALL verdictFor() rather than restate its rules: a second copy of "can this box run it"
// drifts, and the copy that drifts is never the one being read (v3527). A gate asserting only "blocked boxes
// are blocked" would pass against a reimplementation on the day it was written and go quietly wrong later, so
// section 1 checks the CALL as well as the behaviour.
//
// *** AND THE OPPOSITE FAILURE IS JUST AS REAL: A DOOR THAT NEVER OPENS. *** The probe never says "yes" -- it
// cannot, because VRAM is unreadable, so an unknown is unconditional on every box. A gate that refused on
// unknowns would refuse forever, everywhere, and would LOOK CAREFUL while making the feature impossible.
// Keith's own box is the fixture for this: both models read MAYBE with two unknowns each, and both must be
// allowed through with those unknowns SHOWN.
//
// NO NETWORK IS USED. `importer` and `fetchImpl` are injected, so the 404 branch, the network-error branch,
// the out-of-memory branch and the whole state machine are driven here -- while the real CDN import and the
// real weight download are NOT exercised, which the module's header says plainly and this one repeats.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";
import { downloadGate, parseRepoId, preflightRepo, progressLine, fmtBytes, createRunner,
         RUN_STATES, TRANSFORMERS_CDN } from "../../ui/localModelRun.js";
import { MODELS } from "../../ui/localModelProbe.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l) => console.log("  ----  " + l);
const SRC = fs.readFileSync(path.join(ENG, "ui", "localModelRun.js"), "utf8");

// KEITH'S ACTUAL BOX, from the page he pasted at v4032: Intel UHD 620, a real adapter, f16, 10.74 GB quota,
// and a 2.15 GB maxBufferSize proxy under both models' stated VRAM. Used as the fixture rather than an
// invented one, because the interesting case is the one a real reader hit.
const KEITH = {
    secureContext: true, gpuNamespace: true, adapter: true, hasF16: true,
    limits: { maxBufferSize: 2.15e9, maxStorageBufferBindingSize: 2.15e9 },
    softwareRenderer: false, quotaBytes: 10.74e9, usageBytes: 0,
    persisted: false, persistAvailable: true, modelCached: false,
    adapterInfo: { vendor: "intel", architecture: "gen-9" }, vramBytes: null, errors: [],
};

console.log("localModelRun-selfcheck -- when does the download door refuse, and when must it open?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE DOOR IS THE PROBE'S VERDICT, AND IT IS CALLED RATHER THAN COPIED ***");
{
    const code = codeOnly(SRC), text = noComments(SRC);
    ok("!! *** downloadGate CALLS verdictFor ***",
        /verdictFor\(facts, model\)/.test(code) && /from "\.\/localModelProbe\.js"/.test(text),
        "a second copy of the rules would drift, and the copy that drifts is never the one being read");
    // The rules themselves must NOT be restated here. If this file ever grows its own adapter/quota tests, the
    // two will disagree eventually and nothing will compare them.
    ok("!! ...and does NOT restate the probe's own rules",
        !/softwareRenderer\s*===\s*true/.test(code) && !/quotaBytes\s*<\s*model\.bytes/.test(code),
        "the blockers live in localModelProbe.js; this file decides what to DO about them, never what they are");

    // BEHAVIOUR, on real blocker shapes.
    ok("!! a SOFTWARE RENDERER closes the door",
        downloadGate({ ...KEITH, softwareRenderer: true }, MODELS[0]).allowed === false);
    ok("!! an INSECURE ORIGIN closes the door",
        downloadGate({ ...KEITH, secureContext: false }, MODELS[0]).allowed === false,
        "a LAN IP cannot get WebGPU at all, so a download there would be a gigabyte spent on a certain failure");
    ok("!! NO ADAPTER closes the door", downloadGate({ ...KEITH, adapter: false }, MODELS[0]).allowed === false);
    ok("!! *** A QUOTA SMALLER THAN THE MODEL closes the door ***",
        downloadGate({ ...KEITH, quotaBytes: 100e6 }, MODELS[0]).allowed === false,
        "this is the one that would otherwise fill a disk and then fail");
    ok("!! ...and the refusal NAMES what ruled it out rather than just saying no",
        /RULED THIS OUT/.test(downloadGate({ ...KEITH, adapter: false }, MODELS[0]).why));
}

// ---------------------------------------------------------------------------
console.log("\n2. *** AND IT MUST OPEN ON 'MAYBE', OR THE FEATURE IS IMPOSSIBLE EVERYWHERE ***");
{
    for (const m of MODELS) {
        const g = downloadGate(KEITH, m);
        say(`${m.label}: state=${g.state} allowed=${g.allowed} blockers=${g.blockers.length} unknowns=${g.unknowns.length}`);
        ok(`!! *** ${m.label} on Keith's real box is ALLOWED ***`, g.allowed === true && g.state === "maybe",
            "the VRAM unknown is UNCONDITIONAL on every box -- refusing on unknowns would refuse forever while " +
            "looking careful (v3103's rule runs both ways: unknown is not yes, and unknown is not no)");
        ok(`!! ...and its unknowns are HANDED BACK, not swallowed by the yes`, g.unknowns.length >= 2,
            "the proxy gap (2.15 GB against a stated 4-6 GB) belongs in front of the reader, beside the button");
    }
    ok("!! the unknowns really do include the proxy-vs-requirement line",
        downloadGate(KEITH, MODELS[0]).unknowns.some((u) => /closest available proxy/.test(u)));
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE REPO ID IS PARSED, NOT PASTED INTO A URL ***");
{
    ok("!! a normal id parses", parseRepoId("onnx-community/some-model").ok === true);
    ok("!! *** a full URL is REFUSED rather than concatenated ***", parseRepoId("https://evil.example/x").ok === false,
        "a URL pasted into a path builder becomes a request somewhere nobody intended");
    ok("!! *** path traversal is REFUSED ***", parseRepoId("../../etc/passwd").ok === false && parseRepoId("a/../b").ok === false);
    ok("!! an empty id is refused with a sentence", parseRepoId("   ").ok === false && /no model id/.test(parseRepoId("").error));
    ok("!! a bare name with no owner is refused", parseRepoId("gemma").ok === false);
    ok("!! ...and every refusal carries a reason a reader can act on",
        ["", "gemma", "https://x/y", "a/../b"].every((s) => (parseRepoId(s).error || "").length > 10));
}

// ---------------------------------------------------------------------------
console.log("\n4. *** PREFLIGHT: A TYPO COSTS ONE SMALL REQUEST, NOT HALF A GIGABYTE ***");
{
    const fake = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    const good = await preflightRepo("owner/model", { fetchImpl: fake(200, { model_type: "gemma3" }) });
    ok("!! a resolvable repo passes and reports its architecture", good.ok === true && good.architecture === "gemma3");
    const four04 = await preflightRepo("owner/nope", { fetchImpl: fake(404, null) });
    ok("!! *** a 404 gets its OWN sentence, because it is nearly always a typo or a missing ONNX build ***",
        four04.ok === false && /check the id/.test(four04.error), four04.error.slice(0, 80));
    const five00 = await preflightRepo("owner/model", { fetchImpl: fake(503, null) });
    ok("!! ...and another status is reported as that status, not as a 404",
        five00.ok === false && /503/.test(five00.error) && !/check the id/.test(five00.error),
        "'the host is down' and 'you typed it wrong' are different facts");
    const netErr = await preflightRepo("owner/model", { fetchImpl: async () => { throw new Error("getaddrinfo ENOTFOUND"); } });
    ok("!! a network failure is named as a network failure", netErr.ok === false && netErr.stage === "network");
    const badJson = await preflightRepo("owner/model", { fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error("not json"); } }) });
    ok("!! ...and a repo whose config will not parse is still USABLE, not a hard failure",
        badJson.ok === true && badJson.architecture === null,
        "an unparseable config is not proof the model is absent; the absence is reported as null rather than guessed");
    const badId = await preflightRepo("https://x/y", { fetchImpl: fake(200, {}) });
    ok("!! *** a malformed id never reaches fetch at all ***", badId.ok === false && badId.stage === "id");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** PROGRESS THAT DOES NOT INVENT A PERCENTAGE ***");
{
    const withTotal = progressLine({ file: "model.onnx", loaded: 500, total: 1000 });
    ok("!! a real total gives a real percentage", withTotal.pct === 50 && /50\.0%/.test(withTotal.text));
    const noTotal = progressLine({ file: "model.onnx", loaded: 5 * 1048576 });
    ok("!! *** NO total -> pct is NULL and the text says the size was not reported ***",
        noTotal.pct === null && /not reported/.test(noTotal.text) && /5\.0 MB/.test(noTotal.text),
        "a bar showing 0% or a guessed denominator is a number the reader will believe -- v2579's rule, wearing " +
        "a progress bar: " + JSON.stringify(noTotal.text));
    ok("!! a zero total is treated as ABSENT, not as a division by zero",
        progressLine({ loaded: 10, total: 0 }).pct === null);
    ok("!! fmtBytes returns NULL for an unknown count rather than '0 B'",
        fmtBytes(null) === null && fmtBytes(undefined) === null && fmtBytes(0) === "0 B",
        "'nothing yet' and 'zero bytes' are different facts and only one of them is a measurement");
    ok("!! ...and scales through the units", fmtBytes(1536) === "1.5 KB" && fmtBytes(1.5 * 1073741824) === "1.50 GB");
}

// ---------------------------------------------------------------------------
console.log("\n6. *** THE STATE MACHINE, AND THE ORDER THAT KEEPS THE GIGABYTE BEHIND THE CHEAP CHECK ***");
{
    const order = [];
    const fake200 = async () => { order.push("preflight"); return { ok: true, status: 200, json: async () => ({ model_type: "x" }) }; };
    const importer = async () => {
        order.push("import");
        return { pipeline: async (task, repo, opts) => { if (opts.progress_callback) opts.progress_callback({ file: "w.onnx", loaded: 1, total: 2 }); return async () => [{ generated_text: "hello" }]; } };
    };
    const r = createRunner({ importer, fetchImpl: fake200 });
    const seen = [];
    r.on((ev) => { if (ev.type === "state") seen.push(ev.state); });
    ok("!! a fresh runner is idle", r.state === "idle");
    const res = await r.load("owner/model");
    ok("!! a good load reaches ready", res.ok === true && r.state === "ready", "states: " + seen.join(" -> "));
    ok("!! *** THE PREFLIGHT RAN BEFORE THE LIBRARY WAS EVEN IMPORTED ***",
        order[0] === "preflight" && order.indexOf("import") > order.indexOf("preflight"),
        "order: " + order.join(" -> ") + ". Importing first would spend the CDN fetch (and then the weights) " +
        "before finding out the id was mistyped");
    ok("!! ...and every state passed through is a declared one", seen.every((s) => RUN_STATES.includes(s)));
    const gen = await r.generate("hi");
    ok("!! generate returns the text", gen.ok === true && gen.text === "hello");

    // A BAD REPO NEVER REACHES THE IMPORT.
    const order2 = [];
    const r2 = createRunner({
        importer: async () => { order2.push("import"); return { pipeline: async () => async () => [] }; },
        fetchImpl: async () => { order2.push("preflight"); return { ok: false, status: 404 }; },
    });
    const bad = await r2.load("owner/nope");
    ok("!! *** a 404 repo FAILS WITHOUT IMPORTING THE LIBRARY ***",
        bad.ok === false && r2.state === "failed" && !order2.includes("import"),
        "order: " + order2.join(" -> ") + " -- the cheap check is what stands between a typo and a download");

    // AN OUT-OF-MEMORY IS RECOGNISED AND SAID, because it is the failure Keith's box is most likely to hit.
    const r3 = createRunner({
        importer: async () => ({ pipeline: async () => { throw new Error("Failed to allocate buffer size 4294967296"); } }),
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    });
    const oom = await r3.load("owner/model");
    ok("!! *** an allocation failure is flagged as a likely OOM, not left as raw ONNX text ***",
        oom.ok === false && oom.likelyOom === true,
        "this is the predicted failure on a box whose maxBufferSize proxy is under the model's stated VRAM -- " +
        "the probe SHOWED that gap before the click, and naming it here closes the loop");
    ok("!! ...and a non-memory failure is NOT mislabelled as one",
        (await createRunner({
            importer: async () => { throw new Error("network unreachable"); },
            fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
        }).load("owner/model")).likelyOom === false);
    ok("!! generate before ready refuses rather than throwing",
        (await createRunner({}).generate("x")).ok === false);
    ok("!! a listener that throws cannot break a download",
        (() => { const rr = createRunner({}); rr.on(() => { throw new Error("bad listener"); }); rr.reset(); return rr.state === "idle"; })());
}

// ---------------------------------------------------------------------------
console.log("\n7. *** WHAT THIS ROUND COULD NOT DRIVE, NAMED RATHER THAN IMPLIED ***");
{
    const text = noComments(SRC);
    ok("!! the CDN url is PINNED to a version, not floating on latest",
        /@huggingface\/transformers@\d+\.\d+\.\d+/.test(TRANSFORMERS_CDN), TRANSFORMERS_CDN);
    ok("!! *** the module SAYS the real import and the real download are unexercised here ***",
        /UNEXERCISED HERE/.test(SRC) && /huggingface\.co/.test(SRC),
        "no network reaches huggingface.co or jsdelivr from the container this was written in, and a gate that " +
        "implied otherwise would be the worst kind of green");
    ok("!! ...and the reason no repo id is hardcoded is written down as a REFUSAL",
        /A GUESS THAT 404s ON SOMEBODY ELSE'S MACHINE/.test(SRC),
        "MODELS carries gemma-gem's sizes under ids that are not HuggingFace repos; inventing one would land " +
        "the failure on the reader");
    ok("!! no invented repo id shipped in the source",
        !/onnx-community\/[a-z0-9-]+/i.test(text),
        "a plausible-looking id nobody could check is exactly the shape this file refuses to ship");
}

// ---------------------------------------------------------------------------
console.log("\n8. *** THE PAGE OPENS THE DOOR FROM THE GATE, NOT FROM ITS OWN OPINION ***");
{
    const PAGE = fs.readFileSync(path.join(ENG, "webgpu-llm.html"), "utf8");
    const pcode = codeOnly(PAGE), ptext = noComments(PAGE);
    ok("!! the page imports the runner rather than re-deriving any of it",
        /from "\/ui\/localModelRun\.js"/.test(ptext) && /downloadGate/.test(pcode));
    ok("!! *** the button is rendered ONLY on downloadGate().allowed ***",
        /downloadGate\(f, m\)/.test(pcode) && /g\.allowed/.test(pcode),
        "the door's condition is the gate's answer; a page that decided for itself would be the second copy");
    ok("!! *** a refused box gets a REASON, not a missing button ***",
        /Download is not offered on this box/.test(ptext) && /x\.g\.blockers/.test(pcode),
        "Keith's report was 'i do not see a option to download' -- an absent button with no sentence is exactly " +
        "the confusion that produced it, one level up");
    ok("!! the huggingface download is announced BEFORE the click, in the open branch",
        /downloads weights from huggingface\.co/i.test(ptext),
        "hundreds of megabytes to gigabytes of somebody's disk and connection is not a side effect to discover");
    ok("!! ...and the OOM suspicion is surfaced on failure rather than left as raw ONNX text",
        /likelyOom/.test(pcode) && /out-of-memory/.test(ptext));
    // SEVENTH TIME THIS SPECIES HAS BITTEN IN THIS TREE, and this draft was no exception: `$("genBox")` puts the
    // element id in a STRING LITERAL, which codeOnly() blanks to `$("")`, so the pattern could never match.
    // Both halves of this check are about TEXT the page contains, so both are on noComments.
    ok("!! the generate box starts hidden and is shown only once ready",
        /display:none/.test(ptext) && /genBox"\)\.style\.display = ""/.test(ptext),
        "a generate box visible before a model is loaded is a button that cannot work");
    // MEASURED IN A REAL BROWSER, both branches, recorded here because the gate cannot launch one per ship.
    ok("!! *** the browser verification is RECORDED with what it drove ***",
        // v4075 -- the record it is checking for IS a comment (webgpu-llm.html's `// *** VERIFIED IN A REAL
        // BROWSER, BOTH BRANCHES (Chromium 141) ***`), so this hunts prose deliberately and the comment
        // line-joins are unwrapped rather than stripped -- stripping would delete the subject.
        /VERIFIED IN A REAL BROWSER/.test(PAGE.replace(/\n\s*\/\/\s?/g, " ")),
        "rendered twice under Chromium 141: with this container's real facts (no adapter) the door refuses and " +
        "names why; with Keith's facts injected the input and button appear, the generate box stays hidden, and " +
        "a malformed id is refused by parseRepoId before any network");
}

console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
process.exit(fails ? 1 : 0);

// WebGLEngine/tools/ship/voxtralBrowser-selfcheck.mjs -- v4115
//
// Run: node tools/ship/voxtralBrowser-selfcheck.mjs   (~3s; last section drives real Chromium)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ui/voxtralBrowser.js + voxtral.html -- the opt-in wrapper around a 2.5 GB third-party speech model.
//
// *** THE WORD "OPT-IN" IS THE ENTIRE FEATURE, SO IT IS THE THING THIS FILE PROVES. ***
// A page that fetches 2.5 GB of weights and executes 9.4 MB of somebody else's WebAssembly has exactly two
// properties worth checking, and neither is visible by looking at it:
//
//   1. It must download NOTHING until a person says so. Section 2 proves that from the state machine (no
//      arrangement of facts can make nextStep name a download from `idle`), and section 8 proves it from the
//      OUTSIDE, in a real browser, by intercepting every request the page makes and asserting the only ones
//      that happen on load are its own two modules. A regex over source could not tell you that.
//   2. It must execute ONLY the exact build that was verified. Section 3 flips a single byte and requires a
//      refusal -- not a warning, a refusal.
//
// *** AND IT GRADES THE HONESTY, BECAUSE THE NUMBERS HERE ARE BORROWED. *** Every speed figure on the page is
// upstream's, measured on a DGX Spark. Section 4 requires them to stay labelled as upstream's, requires
// estimateWallClock to refuse to hand back a bare number without the hardware attached, and requires
// MEASURED_HERE to keep saying out loud that no transcription was ever run where this was built.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { codeOnly, noComments } from "./sourceScan.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { UPSTREAM, ARTEFACTS, WEIGHTS, UPSTREAM_BENCH, MEASURED_HERE, REFUSED, STAGES,
         gb, humanBytes, humanDuration, estimateWallClock, initialState, nextStep,
         blockersFrom, warningsFrom, sha256Hex, verifyArtefact, costLines } from "../../ui/voxtralBrowser.js";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("voxtralBrowser-selfcheck -- an opt-in that is proven, not promised\n");

/**
 * *** codeOnly() IS FOR JAVASCRIPT SOURCE, AND voxtral.html IS NOT ONE -- THIS GATE SHIPPED THAT BUG FOR ABOUT
 * TEN MINUTES AND ONLY ONE CHECK OUT OF FOUR NOTICED. *** Handed the raw page, codeOnly collapsed 15852
 * characters to 3030 and DROPPED THE ENTIRE <script> BLOCK. The one positive assertion ("the page calls
 * nextStep") failed and gave it away; the three NEGATIVE assertions beside it -- no requestAdapter, no
 * duplicated digest, no TTS -- all passed against wreckage, which is the worst possible outcome: a green check
 * that proves nothing. So the page's module is extracted FIRST and codeOnly is applied to the JavaScript only.
 */
function pageCode(file) {
    const raw = fs.readFileSync(path.join(ENG, file), "utf8");
    const bodies = [...raw.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
    return { raw, js: codeOnly(bodies), jsRaw: bodies, text: noComments(raw) };
}

/**
 * *** A NEGATIVE ASSERTION MUST FIRST PROVE ITS HAYSTACK EXISTS. *** "X is absent" is true of an empty string,
 * so every absence check below is preceded by this. It is the general form of the bug above: the danger is not
 * that a check is wrong, it is that a check is VACUOUS and looks identical to a passing one.
 */
const nonVacuous = (label, hay, minLen = 2000) =>
    ok("   [haystack] " + label + " is real text (" + hay.length + " chars), so the absence checks below mean something",
        hay.length >= minLen,
        "an absence proven against an empty string is not a proof");

// ---- 1. PROVENANCE AND PINS --------------------------------------------------------------------------------
{
    console.log("1. PROVENANCE OF SOMEBODY ELSE'S CODE");
    ok("the licence is recorded and permissive", UPSTREAM.license === "Apache-2.0", UPSTREAM.license);
    ok("!! ...and recorded as VERIFIED rather than assumed from a badge",
        /LICENSE file present and read/.test(UPSTREAM.licenseVerified),
        "last round's sileo had no LICENSE at all and only checking found it -- so this states how it was checked");
    ok("the exact commit is pinned, not a branch", /^[0-9a-f]{40}$/.test(UPSTREAM.commit), UPSTREAM.commit);
    for (const [k, a] of Object.entries(ARTEFACTS)) {
        ok("   " + k + " digest is a well-formed SHA-256", /^[0-9a-f]{64}$/.test(a.sha256));
        ok("   " + k + " size is pinned too", Number.isInteger(a.bytes) && a.bytes > 0, a.bytes + " bytes");
    }
    ok("!! nothing large is actually vendored into the tree",
        !fs.existsSync(path.join(ENG, "vendor", "voxtral", ARTEFACTS.wasm.name)),
        "the biggest vendored asset here is 3.5 MB; this wasm is 9.4 MB, so the page asks the user to supply " +
        "it and verifies it instead of growing every release zip by a curiosity");
}

// ---- 2. *** THE OPT-IN INVARIANT, PROVEN OVER EVERY ARRANGEMENT OF FACTS *** --------------------------------
{
    console.log("\n2. *** FROM `idle`, NOTHING CAN MAKE THE MACHINE NAME A DOWNLOAD ***");
    const SPENDING = new Set(["load-module", "download-weights", "transcribe"]);
    ok("a fresh state is inert", initialState().stage === "idle" && initialState().consented === false);
    ok("!! *** the first step is ALWAYS consent, and it says nothing has happened yet ***",
        nextStep(initialState()).action === "consent" &&
        /nothing has been downloaded/.test(nextStep(initialState()).detail));

    // Fuzz every combination of the facts the page can hold. None may unlock spending without consent.
    let checked = 0, leaked = null;
    const vals = { gpuNamespace: [true, false, null], adapter: [true, false, null],
                   softwareRenderer: [true, false, null], quotaBytes: [null, 0, 1e9, 5e9, 1e12] };
    for (const w of vals.gpuNamespace) for (const a of vals.adapter) for (const sr of vals.softwareRenderer)
    for (const q of vals.quotaBytes) {
        const facts = { gpuNamespace: w, adapter: a, softwareRenderer: sr, quotaBytes: q };
        for (const st of [initialState(), { ...initialState(), moduleReady: true },
                          { ...initialState(), moduleReady: true, weightsReady: true }]) {
            checked++;
            const step = nextStep(st, facts);
            if (SPENDING.has(step.action)) { leaked = { facts, st, step }; }
        }
    }
    ok("!! *** " + checked + " fact/state combinations, and NOT ONE reaches a download without consent ***",
        leaked === null,
        leaked ? "LEAK: " + JSON.stringify(leaked) :
        "this is what opt-in has to mean. Even a state that claims moduleReady and weightsReady cannot " +
        "transcribe while consented is false -- so a bug that flips a readiness flag still cannot spend");

    // With consent, it must actually progress -- an invariant that only ever says "no" is useless.
    const clean = { gpuNamespace: true, adapter: true, softwareRenderer: false, quotaBytes: 1e12 };
    let s = { ...initialState(), consented: true };
    ok("...and WITH consent it proceeds to the module", nextStep(s, clean).action === "load-module");
    s = { ...s, moduleReady: true };
    ok("...then to the weights, as a SEPARATE second decision", nextStep(s, clean).action === "download-weights");
    ok("!! ...and the two gates are not the same size, which is why they are two",
        nextStep({ ...initialState(), consented: true }, clean).bytes < nextStep(s, clean).bytes,
        "9.4 MB of verifiable engine, then 2.5 GB of unverifiable weights -- agreeing to the first is not " +
        "agreeing to the second");
    s = { ...s, weightsReady: true };
    ok("...and finally to transcribe", nextStep(s, clean).action === "transcribe");
    ok("a hard blocker outranks readiness", nextStep(s, { ...clean, adapter: false }).action === "blocked");
    ok("STAGES is ordered and complete", STAGES[0] === "idle" && STAGES[STAGES.length - 1] === "ready");
}

// ---- 3. *** ONE FLIPPED BYTE MUST BE A REFUSAL, NOT A WARNING *** -------------------------------------------
{
    console.log("\n3. *** THE DIGEST CHECK IS THE ONLY THING STANDING BETWEEN A USER AND ARBITRARY WASM ***");
    const bytes = new Uint8Array(4096);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 0xff;
    const digest = await sha256Hex(bytes);
    const art = { name: "synthetic", bytes: bytes.length, sha256: digest };

    const good = await verifyArtefact(bytes, art);
    ok("the correct bytes verify", good.ok === true, good.reason);

    const flipped = bytes.slice(); flipped[2048] ^= 0x01;          // exactly one bit, in the middle
    const bad = await verifyArtefact(flipped, art);
    ok("!! *** ONE FLIPPED BIT is refused ***", bad.ok === false && /MISMATCH/.test(bad.reason),
        "same length, one bit different -- if this passed, the pin would be decoration");
    ok("   ...and the refusal says it will NOT be executed", /will not be executed/.test(bad.reason));
    ok("   ...and reports what it actually got, so a person can compare",
        /^[0-9a-f]{64}$/.test(bad.got || "") && bad.got !== art.sha256);

    const short = await verifyArtefact(bytes.slice(0, 4095), art);
    ok("!! a wrong LENGTH is reported as a wrong length, not as a digest mismatch",
        short.ok === false && /wrong size/.test(short.reason),
        "'expected 4096 bytes, got 4095' tells a person they grabbed the wrong file; 'digest differs' does not");
    ok("no bytes at all is refused", (await verifyArtefact(null, art)).ok === false);
    ok("!! an empty buffer cannot pass by hashing to something", (await verifyArtefact(new Uint8Array(0), art)).ok === false);
}

// ---- 4. *** BORROWED NUMBERS MUST STAY LABELLED AS BORROWED *** ---------------------------------------------
{
    console.log("\n4. *** EVERY SPEED FIGURE HERE IS UPSTREAM'S, AND MUST KEEP SAYING SO ***");
    ok("!! *** the benchmark block declares it was NOT measured here ***", UPSTREAM_BENCH.measuredHere === false,
        "this tree's rule is that a measurement carries who took it; promoting a citation to evidence is the " +
        "exact failure the claim ledger exists to stop");
    ok("   ...and names the hardware it came from", /DGX Spark/.test(UPSTREAM_BENCH.hardware));
    ok("   the WASM figure is genuinely the slow one", UPSTREAM_BENCH.asrWasm.rtf > 10);
    ok("   ...and upstream's own native figure is kept beside it for contrast",
        UPSTREAM_BENCH.asrNativeQ4.rtf < 1,
        "RTF " + UPSTREAM_BENCH.asrNativeQ4.rtf + " native vs " + UPSTREAM_BENCH.asrWasm.rtf + " in the browser " +
        "-- the reader should be able to see what the tab is costing them");

    const e = estimateWallClock(16);
    ok("!! *** estimateWallClock cannot return a bare number ***",
        e.isFloor === true && /DGX/.test(e.hardware) && /FLOOR/.test(e.caveat),
        "a caller that wants 'how long will this take' is handed the hardware it was measured on in the same " +
        "object, so it cannot render the figure without rendering where it came from");
    ok("   ...and the arithmetic matches upstream's own row", Math.abs(e.seconds - UPSTREAM_BENCH.asrWasm.wallS) < 2,
        e.seconds.toFixed(1) + "s computed vs " + UPSTREAM_BENCH.asrWasm.wallS + "s reported");
    ok("   zero audio is zero time, not NaN", estimateWallClock(0).seconds === 0 && estimateWallClock(null).seconds === 0);

    ok("!! *** MEASURED_HERE says out loud that nothing was ever transcribed ***",
        /NO transcription was ever run/.test(MEASURED_HERE.note) && /do not read it as one/.test(MEASURED_HERE.note),
        "the module loading is a real result and it is a SMALL one; without this line a reader would take " +
        "'260 ms to instantiate' as evidence the thing works");
    ok("   ...and admits the adapter was software", /swiftshader/.test(MEASURED_HERE.where));
}

// ---- 5. REFUSALS AS DATA, EACH WITH ITS NUMBER --------------------------------------------------------------
{
    console.log("\n5. WHAT IT WILL NOT DO, AND WHY, WITH THE NUMBER");
    ok("refusals are structured, not prose", REFUSED.length >= 3 &&
        REFUSED.every((r) => r.what && r.why && r.wouldNeed));
    const tts = REFUSED.find((r) => /text-to-speech/.test(r.what));
    ok("!! *** TTS is refused, and refused WITH ITS NUMBER ***",
        !!tts && /104/.test(tts.why),
        "RTF 104 is not 'slow', it is unusable -- and piper already does this faster than real time here. A " +
        "refusal that just said 'not supported' would read as an oversight");
    ok("!! the absence of an end-to-end run is itself declared",
        REFUSED.some((r) => /000/.test(r.why) && /huggingface/.test(r.why)));
    ok("!! and it refuses to predict speed on the reader's machine",
        REFUSED.some((r) => /YOUR machine/.test(r.what)),
        "the only honest per-machine number is the one the page measures after a real run");
    {
        const pg = pageCode("voxtral.html");
        nonVacuous("voxtral.html's script", pg.js);
        ok("no refusal is quietly implemented anyway -- TTS appears nowhere in the page's code",
            !/tts|synthes/i.test(pg.js));
    }
}

// ---- 6. UNKNOWN IS NOT A "NO" -------------------------------------------------------------------------------
{
    console.log("\n6. v3103'S RULE, BOTH WAYS: AN UNREAD NUMBER CANNOT BECOME A REFUSAL");
    ok("!! no facts at all blocks nothing", blockersFrom(null).length === 0 && blockersFrom(undefined).length === 0,
        "a probe that could not run must not be reported as hardware that cannot run it");
    ok("an unknown quota does not block", blockersFrom({ gpuNamespace: true, adapter: true, quotaBytes: null }).length === 0);
    ok("a quota genuinely smaller than the weights DOES block",
        blockersFrom({ gpuNamespace: true, adapter: true, quotaBytes: 1e8 }).length === 1);
    ok("!! a SOFTWARE adapter warns but never blocks",
        blockersFrom({ gpuNamespace: true, adapter: true, softwareRenderer: true }).length === 0 &&
        warningsFrom({ softwareRenderer: true }).some((w) => /SOFTWARE/.test(w)),
        "swiftshader is how the prototype ran -- refusing it would refuse the only configuration ever tested");
    ok("!! a cleared quota still warns that it is a ceiling",
        warningsFrom({ quotaBytes: 1e12 }).some((w) => /CEILING/.test(w)),
        "v4113's finding, reused rather than re-derived: a quota is a promise, not a reservation");
    ok("humanDuration reads correctly at the boundaries",
        humanDuration(59) === "59s" && humanDuration(60) === "1m" && humanDuration(225) === "3m 45s" &&
        humanDuration(3600) === "1h", humanDuration(225));
    ok("gb() formats and survives nonsense", gb(2.5e9) === "2.50 GB" && gb(null) === "unknown");
    ok("!! humanBytes picks a scale a reader can compare -- the engine is MB, the weights are GB",
        humanBytes(ARTEFACTS.wasm.bytes) === "9.39 MB" && humanBytes(WEIGHTS.approxBytes) === "2.50 GB",
        "rendering the page caught gb() calling the 9.4 MB engine '0.01 GB'. The two gates are supposed to LOOK " +
        "three orders of magnitude apart, because that is why they are two gates -- got " +
        humanBytes(ARTEFACTS.wasm.bytes) + " and " + humanBytes(WEIGHTS.approxBytes));
    ok("   ...and survives nonsense", humanBytes(null) === "unknown" && humanBytes(512) === "512 B");
    ok("costLines names whisperBridge as the thing that already does this",
        costLines().some((l) => /whisperBridge/.test(l.v)));
}

// ---- 7. ONE DEFINITION, NOT A SECOND COPY -------------------------------------------------------------------
{
    console.log("\n7. THE PAGE READS THE MODULE RATHER THAN RESTATING IT");
    const pg = pageCode("voxtral.html");
    const text = pg.text, code = pg.js;
    nonVacuous("voxtral.html's script", code);
    ok("!! voxtral.html imports the shared module", /voxtralBrowser\.js/.test(text));
    ok("!! ...and reuses the SHARED probe rather than re-querying WebGPU itself",
        /localModelProbe\.js/.test(text) && !/requestAdapter/.test(code),
        "localModelProbe already carries v4113's quota honesty; a second WebGPU query here would be a second " +
        "copy that drifts");
    ok("!! ...and does NOT restate the digests as literals",
        !new RegExp(ARTEFACTS.wasm.sha256).test(code),
        "a pinned hash written twice is a pinned hash that will disagree with itself one day");
    ok("!! the page asks nextStep() rather than deciding for itself when to spend",
        /nextStep\(/.test(code),
        "the invariant section 2 proves is only worth anything if the page actually routes through it");
    const modCode = codeOnly(fs.readFileSync(path.join(ENG, "ui", "voxtralBrowser.js"), "utf8"));
    nonVacuous("ui/voxtralBrowser.js", modCode);
    ok("the module is pure -- no DOM in the judgement half", !/document\.|window\./.test(modCode));
}

// ---- 8. *** THE REAL BROWSER: WATCH EVERY REQUEST THE PAGE MAKES *** ----------------------------------------
console.log("\n8. *** SOURCE CANNOT PROVE A PAGE DOWNLOADS NOTHING. INTERCEPT IT AND LOOK. ***");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-7 read source and state, and neither can show");
        report("    what a loaded page actually puts on the wire.");
    } else {
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const pg = await (await b.newContext()).newPage();
        const errs = [], asked = [];
        pg.on("pageerror", (e) => errs.push(String(e.message)));
        await pg.route("**/*", (route) => {
            const u = new URL(route.request().url());
            asked.push(u.host + u.pathname);
            const p = path.join(ENG, decodeURIComponent(u.pathname));
            if (u.host === "localhost:8787" && fs.existsSync(p) && fs.statSync(p).isFile()) {
                const ext = path.extname(p);
                return route.fulfill({ status: 200, body: fs.readFileSync(p),
                    contentType: ext === ".js" || ext === ".mjs" ? "text/javascript"
                               : ext === ".html" ? "text/html" : "application/octet-stream" });
            }
            return route.fulfill({ status: 404, body: "not found" });
        });
        await pg.goto("http://localhost:8787/voxtral.html", { waitUntil: "load" }).catch(() => {});
        await pg.waitForTimeout(500);

        ok("!! the page loads with no script error", errs.length === 0, errs.join(" | "));

        // *** THE FACT KEYS ARE A CONTRACT WITH ANOTHER MODULE, SO CHECK THEM AGAINST THAT MODULE, NOT MEMORY. ***
        // blockersFrom() originally read `facts.webgpu`, which localModelProbe has never emitted. The blocker
        // could not fire on real data and nothing caught it, because the gate fuzzed the same invented name --
        // code and test agreeing with each other proves only that they agree. This runs the REAL probe and
        // requires every key the judgement reads to exist in what it actually returns.
        const realKeys = await pg.evaluate(async () => {
            const m = await import("/ui/localModelProbe.js");
            return Object.keys(await m.probeLocalModel());
        });
        for (const k of ["gpuNamespace", "adapter", "softwareRenderer", "quotaBytes"]) {
            ok("!! '" + k + "' is a key localModelProbe genuinely returns", realKeys.includes(k),
                "blockersFrom/warningsFrom read this; if the probe does not emit it, the check silently never " +
                "fires. Probe returned: " + realKeys.join(", "));
        }
        const offsite = asked.filter((u) => !u.startsWith("localhost:8787"));
        const staged = asked.filter((u) => /vendor\/voxtral/.test(u));
        const hf = asked.filter((u) => /huggingface/.test(u));
        ok("!! *** ON LOAD IT REQUESTS NOTHING OFF THIS ORIGIN *** ",
            offsite.length === 0, offsite.length ? offsite.join(", ") : "requested: " + asked.join(", "));
        ok("!! *** and NOTHING from huggingface, and NOT EVEN the staged engine ***",
            hf.length === 0 && staged.length === 0,
            "the engine directory is only touched by a button; a page that probed for it on load would be " +
            "downloading 9.4 MB from a user who never agreed");

        // The cost has to be legible BEFORE the decision, or "informed" is doing no work in "informed consent".
        const shown = await pg.evaluate(() => document.body.innerText);
        ok("!! *** the headline cost is on screen BEFORE any button is pressed ***",
            /14\.1/.test(shown) && /slower than real time/i.test(shown),
            "the whole reason this is opt-in is that it is 14x slower than real time; burying that below a " +
            "fold would make the consent meaningless");
        ok("   ...and it names the hardware the figure came from", /DGX Spark/.test(shown));
        ok("   ...and says the tree already does this natively", /whisperBridge/.test(shown));
        ok("   ...and the refusals are rendered, not just exported", /text-to-speech/.test(shown) && /104/.test(shown));

        // Consent must unlock the engine step -- and STILL not fetch anything by itself.
        const before = asked.length;
        await pg.click("#consent");
        await pg.waitForTimeout(300);
        ok("!! *** consenting alone still downloads nothing ***", asked.length === before,
            "consent unlocks the button; it does not press it. " + (asked.length - before) + " new requests");
        ok("   ...and it does unlock the engine buttons",
            await pg.evaluate(() => !document.getElementById("stagedBtn").disabled),
            "an invariant that never lets anything happen would also pass every check above");
        ok("   ...while the weights button stays disabled behind the second gate",
            await pg.evaluate(() => document.getElementById("weights").disabled));

        // And the staged path, when pressed, must ask for exactly the engine -- and fail honestly when absent.
        await pg.click("#stagedBtn");
        await pg.waitForTimeout(400);
        ok("!! pressing the engine button DOES reach for the engine (and only it)",
            asked.some((u) => /vendor\/voxtral/.test(u)) && !asked.some((u) => /huggingface/.test(u)));
        ok("!! ...and a missing engine fails visibly instead of silently",
            /nothing staged there/i.test(await pg.evaluate(() => document.body.innerText)));
        await b.close();
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);

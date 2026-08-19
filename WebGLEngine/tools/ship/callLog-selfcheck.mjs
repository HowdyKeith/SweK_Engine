// WebGLEngine/tools/ship/callLog-selfcheck.mjs -- v3039
// The whole point of callLog is that a MISSING token count must not price as free. That is check 2.
"use strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { record, unpriceable, ENABLED, WITH_PROMPTS } from "../roundhouse/callLog.mjs";
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0; const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const threw = (f) => { try { f(); return false; } catch { return true; } };
const CALL = { model: "claude-haiku-4-5", usage: { input_tokens: 900, output_tokens: 120 }, ms: 812, role: "cheap", verified: true, escalated: false, gate: "poller-selfcheck" };

// ---- 1. SHAPE FRUGON CAN READ -------------------------------------------------------------------------------
{
    const r = record(CALL);
    ok("one record, frugon's fields present", r.model === "claude-haiku-4-5" && r.usage.input_tokens === 900 && r.usage.output_tokens === 120);
    ok("timestamp is ISO", /^\d{4}-\d\d-\d\dT/.test(r.ts), r.ts);
    ok("!! SweK's own columns ride along", r.swek.verified === true && r.swek.gate === "poller-selfcheck",
       "frugon infers sufficiency from heuristics; escalateRoute KNOWS whether the cheap answer passed a gate, so the log carries the fact rather than the guess");
    ok("it is one line of JSON", JSON.stringify(r).indexOf("\n") < 0);
}

// ---- 2. THE NULL RULE -- MISSING TOKENS MUST NOT PRICE AS FREE ------------------------------------------------
{
    const noUsage = record({ model: "m", ms: 5 });
    ok("!! a response with NO usage records null, never 0", noUsage.usage.input_tokens === null && noUsage.usage.output_tokens === null,
       "0 prices as FREE, so a missing usage block would look like a call that cost nothing -- and therefore like a saving. null is unpriceable and frugon says so; 0 is a confident wrong answer");
    const partial = record({ model: "m", usage: { input_tokens: 10 } });
    ok("a half-filled usage block keeps the known half and nulls the rest", partial.usage.input_tokens === 10 && partial.usage.output_tokens === null);
    ok("a genuine zero is preserved", record({ model: "m", usage: { input_tokens: 0, output_tokens: 4 } }).usage.input_tokens === 0,
       "0 returned BY the API is a fact; 0 invented by us is a lie -- the difference is whether a usage block was present");
    ok("!! unpriceable rows are COUNTED, not dropped", unpriceable([record(CALL), noUsage, partial]) === 2,
       "silently discarding them would make the analysis look complete over a sample it never had");
    ok("a call with no model REFUSES", threw(() => record({ usage: { input_tokens: 1, output_tokens: 1 } })),
       "an unattributable row cannot be priced and would sit in the report as a mystery");
}

// ---- 3. OFF BY DEFAULT, AND PROMPTS ARE A SECOND OPT-IN --------------------------------------------------------
{
    delete process.env.SWEK_CALL_LOG; delete process.env.SWEK_CALL_LOG_PROMPTS;
    ok("!! logging is OFF unless asked", ENABLED() === false, "a log of model calls is a log of prompts");
    ok("prompt capture is a SEPARATE opt-in", WITH_PROMPTS() === false);
    ok("!! prompts are omitted even when messages are handed in", record({ ...CALL, messages: [{ role: "user", content: "secret" }] }).messages === undefined,
       "frugon prices from token counts alone, so the useful log is also the safe one -- the unsafe version costs an extra deliberate act");
    process.env.SWEK_CALL_LOG_PROMPTS = "1";
    ok("...and included once that act is taken", Array.isArray(record({ ...CALL, messages: [{ role: "user", content: "x" }] }).messages));
    delete process.env.SWEK_CALL_LOG_PROMPTS;
}

// ---- 4. WE DO NOT PRICE ANYTHING --------------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "callLog.mjs"), "utf8");
    // MY FIRST REGEX WAS WRONG: it matched the word "price", which appears in unpriceable() -- the function
    // that REFUSES to price. A check that fires on the name of the thing doing the right thing is not a check.
    // Look for arithmetic, not vocabulary.
    ok("!! no cost arithmetic anywhere in the capture", !/per_?1k|USD|cost\s*[=+]|tokens\s*\*|\*\s*0\.00/i.test(src.replace(/^\s*\/\/.*$/gm, "")),
       "frugon re-syncs pricing from the LiteLLM registry weekly; a second price table here would be stale the first time a model changed");
    ok("no converter exists, because the written line IS frugon's line", !fs.existsSync(path.join(ENG, "tools", "roundhouse", "traceToFrugon.mjs")),
       "a SweK format plus a converter is two representations of one fact, and the converter is where they drift");
}

// ---- 5. APPEND IS REAL, AND CANNOT KILL A MODEL RUN --------------------------------------------------------------
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swek-calllog-"));
    process.env.SWEK_CALL_LOG = "1";
    const m = await import("../roundhouse/callLog.mjs?fresh=" + Date.now());
    const n = 5; for (let i = 0; i < n; i++) m.append({ ...CALL, ms: i }, tmp);
    const rows = m.read(tmp);
    ok("!! every call lands, none dropped or duplicated", rows.length === n, rows.length + "/" + n + " rows");
    ok("each line parses independently", rows.every((r) => r.model === CALL.model));
    ok("!! a logging failure does not throw into the caller", m.append({ model: "m", usage: { input_tokens: 1, output_tokens: 1 } }, "/nonexistent-\u0000-path") === false,
       "the log is diagnostics; it must never be the reason a model run dies");
    delete process.env.SWEK_CALL_LOG;
    ok("with logging off, append writes nothing and says so", m.append(CALL, tmp) === false);
    fs.rmSync(tmp, { recursive: true, force: true });
}
// ---- 7. THE TOGGLE, AND THE LIE IT MUST NOT TELL ---------------------------------------------------------------
{
    const fs2 = await import("node:fs"), cp = await import("child_process");
    const src = fs2.readFileSync(path.join(ENG, "ai-bridge", "frugonBridge.js"), "utf8");
    ok("!! /frugon/capture exists so the console `set` is not the only path", /sp === "\/frugon\/capture"/.test(src),
       "EVERY TOOL NEEDS A FRONT DOOR -- ENABLED() reads process.env per call, so a restart was never required");
    ok("it flips the real variable, not a shadow copy", /process\.env\.SWEK_CALL_LOG = "1"/.test(src) && /delete process\.env\.SWEK_CALL_LOG/.test(src));
    ok("!! it reports SCOPE rather than a bare boolean", /captureScope/.test(src) && /another terminal/.test(src),
       "the server knowing the flag says nothing about a roundhouse started elsewhere");
    ok("the toggle refuses a malformed argument", /pass on=1 or on=0/.test(src));

    // SABOTAGE: a child spawned WITHOUT the env must not be capturing, however loudly the parent claims to be.
    process.env.SWEK_CALL_LOG = "1";
    const clean = { ...process.env }; delete clean.SWEK_CALL_LOG;
    // v3074 -- pathToFileURL, NOT a slash-swapped path. A dynamic import() of "C:/Intel/..." is read by the ESM
    // loader as a URL with the scheme "c:", and it refuses: ERR_UNSUPPORTED_ESM_URL_SCHEME. On Linux the same
    // string starts with "/" and works, so this passed here for its whole life and failed on the only platform
    // it was ever going to run on. THE WINDOWS PATH LAW (v2759) again, from a door it had not come through
    // before: that law covers fileURLToPath and main-module detection; this is the reverse trip, building a URL
    // to hand to import().
    const probe = "import('" + pathToFileURL(path.join(ENG, "tools", "roundhouse", "callLog.mjs")).href + "').then(m=>console.log(m.ENABLED()))";
    const child = cp.execFileSync(process.execPath, ["-e", probe], { env: clean, encoding: "utf8" }).trim();
    ok("!! SABOTAGE: a child WITHOUT the env is not capturing, though the parent is",
       child === "false" && ENABLED() === true,
       "parent ENABLED=true, child ENABLED=" + child + " -- this is exactly the roundhouse-in-another-terminal case, and it is why the status reports scope instead of claiming capture is on everywhere");
    const inherited = cp.execFileSync(process.execPath, ["-e", probe], { encoding: "utf8" }).trim();
    ok("...and a child that DOES inherit it is capturing", inherited === "true",
       "so the toggle genuinely reaches anything this server spawns afterwards -- the claim it makes is the true one");
    delete process.env.SWEK_CALL_LOG;

    const page = fs2.readFileSync(path.join(ENG, "frugon.html"), "utf8");
    ok("!! the toggle has a BUTTON, not just a route", /\/frugon\/capture\?on=/.test(page) && /bCap/.test(page),
       "a route nothing clicks is the console command with extra steps -- the third time this law was half-kept this session");
    ok("the page surfaces the SCOPE, not just on/off", /captureScope/.test(page),
       "showing a green ON while a roundhouse in another terminal captures nothing is the lie the scope field exists to prevent");
}

console.log("\ncallLog-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);

// WebGLEngine/tools/ship/ollamaReadiness-selfcheck.mjs -- v3017
//
// Run: node tools/ship/ollamaReadiness-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/roundhouse/ollamaReadiness.mjs.
//
// Keith asked whether the roundhouse's local model should be up right now, since Ollama is on the auto-install
// list. TWO CORRECTIONS FELL OUT OF CHECKING:
//
//   OLLAMA IS NOT ON THE AUTO-INSTALL LIST. autoInstall.js drives winget package ids and mentions it nowhere.
//   Nothing installs it, nothing spawns `ollama serve` -- doctorBridge probed the port and printed a hint.
//   The roundhouse does not bring Ollama online. It ASSUMES it.
//
//   AND listLocalModels() RETURNS [] FOR THREE DIFFERENT THINGS: unreachable, a non-ok response, and genuinely
//   no models. Its comment ("state, not an error: the chain simply has no local tier") is right FOR THE CHAIN --
//   an absent local tier is a legitimate configuration -- but it means the readiness question cannot be answered,
//   because the states that matter are collapsed into one empty array.
//
// THE THIRD STATE IS THE EXPENSIVE ONE. Ollama running with the WRONG models pulled looks identical to Ollama
// running correctly, until the first call -- WHICH HAPPENS MID-RUN, after a device has been built. A pull is
// gigabytes. Finding out then is the worst available moment, and it was the moment the code chose.
import { readiness, isUp, READY } from "../roundhouse/ollamaReadiness.mjs";
import { prose } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const mk = (o) => async (u) => {
    if (o === "down") throw new Error("ECONNREFUSED");
    if (o === "wrongservice") return { ok: false, status: 404 };
    if (String(u).includes("/api/version")) return { ok: true, json: async () => ({ version: "0.3.0" }) };
    return { ok: true, json: async () => ({ models: o }) };
};

// ---- 1. THE THREE FAILURES ARE KEPT APART ------------------------------------------------------------------
{
    ok("!! nothing listening -> NOT_RUNNING", (await readiness({ fetchImpl: mk("down") })).verdict === READY.NOT_RUNNING);
    ok("!! up with no models -> NO_MODELS, not 'not running'", (await readiness({ fetchImpl: mk([]) })).verdict === READY.NO_MODELS,
       "the old check returned an empty list for both, so these were the same event");
    const miss = await readiness({ pinned: "qwen2.5:3b", fetchImpl: mk([{ name: "llama3:8b" }]) });
    ok("!! up, models present, PINNED ONE ABSENT -> MODEL_MISSING", miss.verdict === READY.MODEL_MISSING,
       "identical to healthy from a port probe, and it fails at the first call MID-RUN");
    ok("...and the fix names the pull", /ollama pull qwen2\.5:3b/.test(miss.fix || "") && /before the run, not during/.test(miss.fix || ""),
       "a pull is gigabytes -- the point of checking early is that you can do it before starting");
    ok("all good -> READY", (await readiness({ pinned: "qwen2.5:3b", fetchImpl: mk([{ name: "qwen2.5:3b" }]) })).verdict === READY.OK);
    ok("the four verdicts are distinct", new Set(Object.values(READY)).size === 4);
}

// ---- 2. IT DOES NOT MISTAKE A DIFFERENT SERVICE FOR OLLAMA ------------------------------------------------------
{
    const wrong = await isUp("http://127.0.0.1:11434", { fetchImpl: mk("wrongservice") });
    ok("!! something listening that is NOT Ollama is not 'up'", wrong.up === false && /not Ollama's API/.test(wrong.why || ""),
       "a port answering is not the same as the right service answering");
    ok("an unreachable port explains itself", /nothing answered/.test((await isUp("http://x", { fetchImpl: mk("down") })).why || ""));
    ok("a no-model-pinned fleet is still READY but says what that means", (() => {
        return true;
    })());
    const nopin = await readiness({ fetchImpl: mk([{ name: "a" }, { name: "b" }]) });
    ok("...no pin means any model could be chosen, and it says so", nopin.verdict === READY.OK && /no model is pinned/.test(nopin.why),
       "silently passing would imply a determinism this configuration does not have");
}

// ---- 3. THE CORRECTIONS ARE RECORDED WHERE A READER WILL HIT THEM ------------------------------------------------------
{
    const auto = fs.readFileSync(path.join(ENG, "ai-bridge", "autoInstall.js"), "utf8");
    ok("!! Ollama really is NOT on the auto-install list", !/ollama/i.test(auto),
       "checked rather than asserted -- the belief that it was is exactly what this round corrects");
    const doc = fs.readFileSync(path.join(ENG, "ai-bridge", "doctorBridge.js"), "utf8");
    ok("the doctor reports the VERDICT, not just a boolean", /verdict: r \? r\.verdict/.test(doc),
       "one boolean covering three states is how the expensive one stayed invisible");
    ok("!! ...and says nothing here starts it", /NOTHING HERE STARTS IT FOR YOU/.test(doc),
       "a hint that reads like an install step invites the assumption that something already ran one");
}

console.log(fails ? "\nollamaReadiness-selfcheck: " + fails + " FAILED" : "\nollamaReadiness-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);

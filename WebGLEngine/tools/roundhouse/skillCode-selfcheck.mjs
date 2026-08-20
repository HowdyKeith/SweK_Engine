// tools/roundhouse/skillCode-selfcheck.mjs
//
// Run: node tools/roundhouse/skillCode-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// v3710. The dangerous object here is NOT the skill library, it is the sentence "the code did not throw".
// Voyager keeps a skill on exactly that plus an LLM critic approving the model's own work; this file asserts
// that skillCode CANNOT say it. Two properties are checked BY MECHANISM rather than by reading the prose that
// promises them, because a check that counts a warning as the thing it warns about has now happened here
// seven-plus times:
//   (A) NO COMPILATION OF TEXT anywhere in skillCode.mjs -- no eval, no new Function, no import() of a
//       variable. That is the generation path, and SKILL_GENERATION_REFUSED is only a declaration if the
//       mechanism is absent.
//   (B) runSkill's state set is exactly { ran, threw }. A "certified"/"passed"/"ok" state would let a caller
//       read execution as evidence.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly } from "../ship/sourceScan.mjs";
import { makeCodeSkill, codeBook, runSkill, RUN_STATES, SKILL_GENERATION_REFUSED, certificationBelongsTo } from "./skillCode.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const HERE = path.dirname(fileURLToPath(import.meta.url));
// CLOSED BY IDENTITY, never by name -- this file discusses eval() and new Function() at length and would
// otherwise count its own explanation as the defect (v3677/v3680/v3681/v3696, four instances).
const SUBJECT = path.join(HERE, "skillCode.mjs");
const src = fs.readFileSync(SUBJECT, "utf8");
const code = codeOnly(src);

// ---- 1. THE SCHEMA IS THE DECLARATION ---------------------------------------------------------------------
{
    const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
    const strBody = threw(() => makeCodeSkill({ id: "a", trigger: "t", run: "return 1 + 1" }));
    ok("!! a skill body arriving as TEXT is refused by name", typeof strBody === "string" && /run FUNCTION/.test(strBody),
        "the mirror of makeStrategy's 'a strategy needs a hint to inject' -- that schema cannot hold code, this one cannot hold a string");
    ok("a skill needs an id and a trigger", threw(() => makeCodeSkill({ trigger: "t", run: () => 1 })) && threw(() => makeCodeSkill({ id: "a", run: () => 1 })));
}

// ---- 2. COMPOSITION: LATER SKILLS CALL EARLIER ONES --------------------------------------------------------
{
    const lo = makeCodeSkill({ id: "clamp01", trigger: "malformed", run: (x) => Math.min(1, Math.max(0, Number(x) || 0)) });
    const hi = makeCodeSkill({ id: "percent", trigger: "malformed", uses: ["clamp01"], run: (x, ctx) => `${(ctx.call("clamp01", x) * 100).toFixed(1)}%` });
    const book = codeBook([lo, hi]);
    const r = runSkill(book, "percent", 5);
    ok("!! a later skill composes an earlier one through the book", r.state === "ran" && r.value === "100.0%",
        "clamp01(5) -> 1 -> '100.0%' -- the composition Voyager's library is FOR, with the edge declared and readable");

    // ORDER IS ENFORCED, NOT ASSUMED: registering the caller first must refuse.
    let msg = null; try { codeBook([hi, lo]); } catch (e) { msg = e.message; }
    ok("!! a skill declaring uses of an unregistered id is refused by name", typeof msg === "string" && /not in the book yet/.test(msg),
        "later-calls-earlier is a CHECK here, not a convention -- and a cycle cannot be built");

    // An UNDECLARED edge must not quietly work, or `uses` stops describing the book.
    const sneak = codeBook([lo, makeCodeSkill({ id: "sneak", trigger: "malformed", run: (x, ctx) => ctx.call("clamp01", x) })]);
    const sr = runSkill(sneak, "sneak", 5);
    ok("!! an undeclared composition throws instead of silently working", sr.state === "threw" && /without declaring it/.test(sr.error),
        "otherwise `uses` is documentation rather than the edge list");
}

// ---- 3. *** 'RAN' IS NOT 'CERTIFIED' -- THE VOYAGER FAILURE, ASSERTED BY MECHANISM *** ---------------------
// WHEN THIS GOES RED because somebody added a verdict state, the correct response is to route that judgement
// through skillbook.trial -- NEVER to widen the set here.
{
    ok("!! runSkill's state set is EXACTLY { ran, threw } -- there is no verdict state",
        RUN_STATES.length === 2 && RUN_STATES.includes("ran") && RUN_STATES.includes("threw"),
        "states: " + RUN_STATES.join(" / ") + " -- 'the code did not throw' is what Voyager accepts and it is not evidence that a skill helped");

    const book = codeBook([makeCodeSkill({ id: "boom", trigger: "malformed", run: () => { throw new Error("nope"); } })]);
    const t = runSkill(book, "boom", 1);
    ok("!! a throwing body reports threw AND carries no value", t.state === "threw" && !("value" in t), "error: " + t.error);

    ok("no result path in skillCode mentions a pass/certified verdict",
        !/state\s*:\s*["'`](certified|passed|pass|ok|good)["'`]/i.test(code),
        "asserted through codeOnly, so the prose above explaining the refusal cannot satisfy it");

    ok("certification is named as somebody else's job", /skillbook\.trial/.test(certificationBelongsTo()) && /Z_MIN/.test(certificationBelongsTo()));
}

// ---- 4. *** THE GENERATION REFUSAL, ASSERTED BY ABSENT MECHANISM *** ---------------------------------------
{
    ok("!! skillCode compiles no text: no eval, no new Function, no dynamic import",
        !/\beval\s*\(/.test(code) && !/new\s+Function\s*\(/.test(code) && !/\bimport\s*\(/.test(code),
        "SKILL_GENERATION_REFUSED is a DECLARATION only while the mechanism is absent -- prose refusing to generate is not a refusal to generate");
    ok("!! skillCode writes nothing", !/writeFileSync|createWriteStream|appendFileSync|\.write\s*\(/.test(code),
        "the same no-write-path property the curriculum proposer carries");
    const R = SKILL_GENERATION_REFUSED;
    ok("!! the refusal is DATA with a why, an examined-when and an expiry -- the plantRefused shape",
        R.refused === true && R.why.length > 80 && !!R.examined && !!R.expiresIf && !!R.notClaimed,
        "a refusal without an expiry is a permanent opinion; this one names what would overturn it");
    ok("the expiry does not accept sandboxing alone", /certification/i.test(R.expiresIf),
        "isolating execution fixes the mirror, NOT 'it ran' being read as evidence -- both halves or neither");
}

console.log();
if (fails) { console.log("skillCode-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("skillCode-selfcheck: all checks pass");

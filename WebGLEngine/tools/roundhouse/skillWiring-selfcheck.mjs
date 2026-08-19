// WebGLEngine/tools/roundhouse/skillWiring-selfcheck.mjs -- v3397
//
// *** THE SKILLBOOK GETS ITS CALLER, AND THE CLAIM THIS ROUND MAKES IS "REACHABLE", NOT "BETTER". ***
//
// v3395 shipped hintsFor() and nothing called it -- the shipping-with-no-caller pattern this tree keeps finding,
// named by the patch's own author before I read it. withCritic now consults the book on every rejected claim.
//
// TWO PROPERTIES, AND THE SECOND IS THE ONE THAT KEEPS THIS HONEST:
//
//   1. A PROVEN strategy whose trigger THIS verdict raised reaches the proposer.
//   2. *** THE SHIPPED BOOK IS EMPTY, SO THE WIRING CHANGES NOTHING AT ALL -- every verdict is deep-equal to
//      what the same critic produced before it existed. *** A round that wired a module and quietly altered the
//      agent loop would be two changes wearing one label.
//
// AND THE HINTS ARE KEPT OUT OF `issues`. An issue is a MECHANICAL FACT read off the device; a hint is ADVICE
// FROM A STATISTICAL BOOK, believed because a two-arm trial cleared a noise bar. Appending one to the other
// would make a strategy that survived a z-test indistinguishable from a name read straight off the registry --
// and the proposer would have no way to weigh them differently.
"use strict";
import { withCritic, critiqueClaim } from "./deviceCritic.mjs";
import { makeStrategy, hintsFor } from "./skillbook.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

const DEVICE = { name: "fixture", observables: ["alpha", "beta"], modes: ["one"] };
/** A proposer that always names an observable this device does not have -- so a trigger always fires. */
const badCaller = async (role) => (role === "proposer" ? { claim: { observable: "alphaa", max: 1 } } : {});

/** Drive withCritic and capture every verdict the critic produced. */
async function verdicts(opts) {
    const seen = [];
    const wrapped = withCritic(badCaller, DEVICE, { maxRounds: 2, onTurn: (t) => seen.push(t.verdict), ...opts });
    await wrapped("proposer", { device: "fixture" });
    return seen;
}

// ---- 1. THE NULL TEST: AN EMPTY BOOK CHANGES NOTHING -----------------------------------------------------
{
    const ENG = path.join(path.dirname(fileURLToPath(import.meta.url)));
    ok("!! the shipped book really is absent, which is what makes the next check meaningful",
        !fs.existsSync(path.join(ENG, "skillbook.json")),
        "no skillbook.json on disk. If one were shipped this gate would be measuring a different tree");
    const plain = await verdicts({});
    ok("!! *** with no book, no verdict carries a `hints` field at all -- not even an empty one ***",
        plain.length > 0 && plain.every((v) => !("hints" in v)),
        plain.length + " verdicts, none with hints. AN EMPTY FIELD IS STILL A FIELD: attaching `hints: []` " +
        "would change every payload in the agent loop while claiming to change nothing");
    const direct = critiqueClaim({ observable: "alphaa", max: 1 }, DEVICE.observables);
    ok("...and the wired verdict is deep-equal to what critiqueClaim produces on its own",
        JSON.stringify(plain[0]) === JSON.stringify(direct),
        "the wiring is inert until somebody fills the book, so THIS ROUND CHANGES NO BEHAVIOUR and says so " +
        "rather than implying the agent got better");
}

// ---- 2. A PROVEN STRATEGY REACHES THE PROPOSER ------------------------------------------------------------
{
    const ev = { before: 0.65, after: 0.05, n: 40 };          // z = 5.63, PROVEN
    const book = { strategies: [{ ...makeStrategy({ id: "s1", trigger: "observable-unknown", hint: "PICK FROM THE MENU", evidence: ev }), state: "PROVEN" }] };
    const withBook = await verdicts({ skillbook: book });
    ok("!! *** a PROVEN strategy whose trigger this verdict raised reaches the critique ***",
        withBook.some((v) => (v.hints || []).includes("PICK FROM THE MENU")),
        "the claim named an observable the device does not have, which is the `observable-unknown` trigger, and " +
        "the hint came back with the critique the proposer sees");
    ok("...and it did NOT get folded into `issues`",
        withBook.every((v) => (v.issues || []).every((i) => !/PICK FROM THE MENU/.test(i))),
        "a mechanical fact and a statistically-believed hint stay in separate fields, so a reader can weigh them " +
        "differently. Merging them would be free and would destroy the distinction the whole book rests on");
}

// ---- 3. AND EVERY GUARD THE BOOK ALREADY HAD SURVIVES THE WIRING ------------------------------------------
{
    const mk = (id, state, hint) => ({ ...makeStrategy({ id, trigger: "observable-unknown", hint }), state });
    const book = { strategies: [mk("p", "PROVEN", "YES"), mk("u", "UNDERPOWERED", "NO-U"), mk("r", "RETIRED", "NO-R"), mk("q", "PROPOSED", "NO-Q")] };
    const got = await verdicts({ skillbook: book });
    const all = got.flatMap((v) => v.hints || []);
    ok("!! only PROVEN survives the trip -- UNDERPOWERED, RETIRED and PROPOSED are all filtered",
        all.includes("YES") && !all.some((h) => /^NO-/.test(h)),
        "got " + JSON.stringify([...new Set(all)]) + ". The filter lives in hintsFor and the wiring does not " +
        "re-implement it, so there is ONE definition of what may reach a prompt");
    const other = { strategies: [mk("x", "PROVEN", "WRONG-TRIGGER")] };
    other.strategies[0].trigger = "target-without-tol";
    const g2 = await verdicts({ skillbook: other });
    ok("...and a PROVEN strategy for a trigger this verdict did NOT raise stays out",
        g2.every((v) => !(v.hints || []).includes("WRONG-TRIGGER")),
        "the claim had a comparator and no target, so `target-without-tol` never fired. A book that injected " +
        "everything it had proven would be a prompt-stuffer rather than a critic");
}

// ---- 4. THE COST OF THE WIRING IS ONE READ, NOT ONE PER TURN ----------------------------------------------
{
    const src = fs.readFileSync(new URL("./deviceCritic.mjs", import.meta.url), "utf8");
    const inLoop = /critique:\s*\(task, cand\)[\s\S]*?load\(/.test(src);
    ok("the book is not re-read inside the critique loop",
        !inLoop && /hintsFor\(/.test(src),
        "a disk read per turn would put file I/O inside an agent roundtrip. The book is passed in, or read once " +
        "by hintsFor's own default");
    ok("...and a throwing book cannot break the loop",
        /catch \{ hints = \[\]; \}/.test(src),
        "a corrupt skillbook.json degrades to NO HINTS rather than taking down the critic -- the same shape as " +
        "the onTurn observer beside it, which has always been wrapped for exactly this reason");
}

console.log(failed ? "\n[skillWiring-selfcheck] FAILED " + failed : "\n[skillWiring-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);

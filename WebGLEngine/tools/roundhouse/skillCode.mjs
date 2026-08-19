import { pathToFileURL } from "node:url";
// tools/roundhouse/skillCode.mjs
//
// Run: node tools/roundhouse/skillCode.mjs            (front door: skillbook.html, "Executable skills")
// Gated by tools/roundhouse/skillCode-selfcheck.mjs.
//
// v3710 -- THE SECOND VOYAGER COMPONENT, MINUS THE THIRD. Voyager's skill library is an EVER-GROWING SET OF
// EXECUTABLE, COMPOSABLE PROGRAMS where later skills call earlier ones. skillbook.mjs has the far stronger
// CERTIFICATION (a measured before/after clearing Z_MIN, with UNDERPOWERED for "measured, too small to
// decide") but its CONTENT is narrower: makeStrategy THROWS without a hint string, so the schema cannot hold
// code and nothing in this tree has ever executed a stored skill. That narrowness was never DECLARED -- and an
// unexamined subject and an examined one that said no are indistinguishable from outside (v3707's lesson,
// which is why beamDevice carries plantRefused rather than a paragraph). This file declares it.
//
// WHAT THIS IS: skills whose body is a REAL FUNCTION IN THIS TREE, written by a person, registered here,
// composable through the book, and certified -- when anybody certifies them -- by skillbook's existing trial.
//
// WHAT THIS IS NOT, AND THE ORDER MATTERS:
//   * NOT a generator. See SKILL_GENERATION_REFUSED below. This is the one Voyager component SweK has now
//     refused three times (the curriculum proposer has NO write path, asserted by mechanism through codeOnly;
//     composePropose never repairs a reply; and here).
//   * NOT a certifier. runSkill returns "ran" or "threw" AND NOTHING ELSE. *** "THE CODE DID NOT THROW" IS
//     PRECISELY THE VOYAGER FAILURE *** -- it is what Voyager accepts, alongside an LLM critic approving the
//     model's own work, and it is the shortcut that becomes tempting the exact moment a skill is callable and
//     there is a real stack trace to point at. A skill that ran is a skill that ran. Whether it HELPED is a
//     measured before/after question and it belongs to skillbook.trial, not here.
//   *** WHEN A LINE HERE GOES RED because somebody wanted runSkill to return a verdict, the correct response
//   is to route that judgement through skillbook's trial -- NEVER to widen this file's return states. ***

/** The refusal, declared as DATA so a checker can read it -- not as prose a mention test would find. */
export const SKILL_GENERATION_REFUSED = Object.freeze({
    refused: true,
    what: "writing skill bodies -- Voyager's third component (re-prompt the model with the execution error until the program works)",
    why: "A LOOP THAT GENERATES ITS OWN WORK CAN ALSO MARK IT PASSED. A generated skill would be code this tree "
       + "runs against the same tree its gates measure, which is the mirror problem one level up: the thing "
       + "under test and the thing doing the testing stop being independent. SweK has refused the write path "
       + "twice already for the same reason and this is the third.",
    examined: "v3709-v3710, after Keith corrected the claim that nothing of Voyager remained to take",
    expiresIf: "a skill body can be executed somewhere that CANNOT reach the tree the gates read, AND the "
             + "certification stays a measured before/after rather than 'it ran'. Sandboxing alone does not "
             + "expire it -- the certification half is the load-bearing half.",
    notClaimed: "that generated skills could never be safe here; only that nothing in this file may write one",
});

const STATES = Object.freeze(["ran", "threw"]);   // THE COMPLETE SET. There is deliberately no "certified".

/**
 * A skill whose body is a function. `uses` NAMES the skills this one composes, and the book refuses a
 * registration whose `uses` is not already present -- so later skills call earlier ones and a cycle cannot be
 * built. Voyager gets that ordering from time; this gets it from a check.
 */
export function makeCodeSkill({ id, trigger, run, uses = [], evidence = null }) {
    if (!id || typeof id !== "string") throw new Error("skillCode: a skill needs an id");
    if (!trigger || typeof trigger !== "string") throw new Error("skillCode: a skill needs a trigger");
    // The mirror of makeStrategy's "a strategy needs a hint to inject". THE SCHEMA IS THE DECLARATION: that
    // file cannot hold code and this one cannot hold a string pretending to be code.
    if (typeof run !== "function") throw new Error("skillCode: a skill needs a run FUNCTION, not a string. A body that arrives as text would have to be compiled, and compiling text is the generation path this file refuses -- see SKILL_GENERATION_REFUSED.");
    if (!Array.isArray(uses) || uses.some((u) => typeof u !== "string")) throw new Error("skillCode: uses must be a list of skill ids");
    return Object.freeze({ id, trigger, run, uses: Object.freeze([...uses]), evidence });
}

/**
 * Build the book IN ORDER. A skill may only declare `uses` of ids already registered; the refusal is by name
 * so a typo reads as a typo instead of silently composing nothing.
 */
export function codeBook(skills = []) {
    const byId = new Map();
    for (const s of skills) {
        if (!s || typeof s.run !== "function") throw new Error("skillCode: the book takes skills from makeCodeSkill");
        if (byId.has(s.id)) throw new Error(`skillCode: duplicate skill id ${s.id}. Two bodies under one name is the same defect as two spellings of one constant.`);
        for (const u of s.uses) {
            if (!byId.has(u)) throw new Error(`skillCode: ${s.id} declares uses of ${u}, which is not in the book yet. Later skills call earlier ones; register ${u} first, or fix the name.`);
        }
        byId.set(s.id, s);
    }
    return Object.freeze({
        ids: () => [...byId.keys()],
        get: (id) => byId.get(id) || null,
        size: byId.size,
    });
}

/**
 * Run one skill. Composition happens ONLY through ctx.call, so a skill's reachable surface is exactly what it
 * declared in `uses` -- an undeclared call is refused rather than quietly working.
 * RETURNS A STATE, NEVER A VERDICT.
 */
export function runSkill(book, id, input, { depth = 0 } = {}) {
    const skill = book.get(id);
    if (!skill) return { state: "threw", id, error: `no skill ${id} in the book` };
    if (depth > 32) return { state: "threw", id, error: "skillCode: composition too deep" };
    const ctx = Object.freeze({
        call(otherId, otherInput) {
            if (!skill.uses.includes(otherId)) {
                throw new Error(`skillCode: ${id} called ${otherId} without declaring it in uses. An undeclared edge is a composition nobody can read off the book.`);
            }
            const r = runSkill(book, otherId, otherInput, { depth: depth + 1 });
            if (r.state === "threw") throw new Error(`skillCode: ${otherId} threw inside ${id}: ${r.error}`);
            return r.value;
        },
    });
    try {
        const value = skill.run(input, ctx);
        // *** v3711 -- AN ASYNC BODY'S FAILURE ARRIVES AFTER THIS FUNCTION HAS RETURNED. Measured: a skill whose
        // run is `async () => { throw }` came back state "ran" with a REJECTED PROMISE as its value, because the
        // try/catch had already exited. That is "the code did not throw" in its purest form, in the file written
        // to refuse it -- found by the first real skill that needed an await (labSkills.tolFor imports the device
        // registry). A PROMISE IS NOT A VALUE, so the sync runner refuses one BY NAME rather than passing it on.
        // *** WHEN THIS GOES RED, the fix is to call runSkillAsync -- NEVER to let the thenable through. ***
        if (value && typeof value.then === "function") {
            // AND THE REFUSAL MUST NOT LEAVE A LIVE REJECTION BEHIND. Measured at v3711: refusing the promise
            // without this line printed all 17 PASS lines and then EXITED 1 on an unhandled rejection -- a crash
            // at a distance, from a body we already declined to run, which reads exactly like a gate failing for
            // its own reasons. The rejection has already been REPORTED BY NAME below; this only stops it killing
            // a process that has correctly refused it.
            if (typeof value.catch === "function") value.catch(() => {});
            return { state: "threw", id, error: `skillCode: ${id} returned a promise. runSkill is synchronous and cannot see an async body fail -- its rejection would arrive after this returned, reported as "ran". Use runSkillAsync.` };
        }
        return { state: "ran", id, value };
    } catch (e) {
        return { state: "threw", id, error: e && e.message ? e.message : String(e) };
    }
}

/**
 * The async runner. Same two states, same composition rules -- it AWAITS the body, so a rejection is a `threw`
 * like any other. ctx.call awaits too, which is what lets an async skill compose a sync one and vice versa.
 */
export async function runSkillAsync(book, id, input, { depth = 0 } = {}) {
    const skill = book.get(id);
    if (!skill) return { state: "threw", id, error: `no skill ${id} in the book` };
    if (depth > 32) return { state: "threw", id, error: "skillCode: composition too deep" };
    const ctx = Object.freeze({
        async call(otherId, otherInput) {
            if (!skill.uses.includes(otherId)) {
                throw new Error(`skillCode: ${id} called ${otherId} without declaring it in uses. An undeclared edge is a composition nobody can read off the book.`);
            }
            const r = await runSkillAsync(book, otherId, otherInput, { depth: depth + 1 });
            if (r.state === "threw") throw new Error(`skillCode: ${otherId} threw inside ${id}: ${r.error}`);
            return r.value;
        },
    });
    try {
        return { state: "ran", id, value: await skill.run(input, ctx) };
    } catch (e) {
        return { state: "threw", id, error: e && e.message ? e.message : String(e) };
    }
}

/** Every state runSkill can return, exported so a checker reads the set instead of re-typing it. */
export const RUN_STATES = STATES;

/**
 * What this module refuses to answer. Kept as a function so a caller asking "did it work?" gets a sentence
 * rather than a boolean it would have believed.
 */
export function certificationBelongsTo() {
    return "skillbook.trial -- a MEASURED before/after clearing Z_MIN, with UNDERPOWERED when the measurement "
         + "was taken and is too small to decide. runSkill says only that a body ran or threw, and 'it ran' is "
         + "not evidence that it helped.";
}

// ---- front door ------------------------------------------------------------------------------------------
// A MODULE WITH NO CALLER IS UNFINISHED. skillbook.html renders this; running the file directly prints the
// same three things without a browser.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const demo = [
        makeCodeSkill({ id: "clamp01", trigger: "malformed", run: (x) => Math.min(1, Math.max(0, Number(x) || 0)) }),
        makeCodeSkill({ id: "percent", trigger: "malformed", uses: ["clamp01"], run: (x, ctx) => `${(ctx.call("clamp01", x) * 100).toFixed(1)}%` }),
    ];
    const book = codeBook(demo);
    console.log("[skillCode] a skill library whose entries are CODE, not hints\n");
    console.log("  book:", book.ids().join(", "), `(${book.size})`);
    console.log("  compose:", JSON.stringify(runSkill(book, "percent", 0.5)));
    // A BODY THAT REALLY THROWS. The first spelling of this line passed { bad: true } and printed state "ran",
    // because Number({}) || 0 is 0 -- A DEMO LABEL NO CHECK READS, claiming a throw it never caused (v3710).
    const boom = codeBook([makeCodeSkill({ id: "boom", trigger: "malformed", run: () => { throw new Error("nope"); } })]);
    console.log("  a body that throws:", JSON.stringify(runSkill(boom, "boom", 1)));
    console.log("  states:", RUN_STATES.join(" / "), "-- there is no 'certified' and that is the point");
    console.log("\n  CERTIFICATION BELONGS TO:", certificationBelongsTo());
    console.log("\n  REFUSED:", SKILL_GENERATION_REFUSED.what);
    console.log("    why:", SKILL_GENERATION_REFUSED.why);
    console.log("    expires if:", SKILL_GENERATION_REFUSED.expiresIf);
    console.log("    NOT CLAIMED:", SKILL_GENERATION_REFUSED.notClaimed);
}

#!/usr/bin/env node
// WebGLEngine/tools/ship/frameGraph-selfcheck.mjs -- v4293
//
// GRADES the derived frame graph, and the constant it replaced.
//
// *** THE POINT IS THAT A NUMBER DESCRIBING CODE SHOULD COME FROM THE CODE. *** bloomFused.mjs's ROUND_TRIPS
// was five hand-typed integers about render/bloomPass.js. v4284 typed one of them wrong, the gate caught it,
// and a person corrected it by hand -- leaving four others that nobody had checked and a definition of "span"
// that existed only in the author's head.
//
// Section 3 is the load-bearing one. It does not ask whether the numbers are RIGHT -- it asks whether they are
// DERIVED, by mutating the source they claim to describe and watching them move. A constant that agrees with
// the source it was copied from is indistinguishable from one that derives it, until the source changes.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as FG from "../../render/frameGraph.mjs";
import * as BF from "../../render/bloomFused.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ENG, BF.BLOOM_SOURCE), "utf8");
let fails = 0;
const ok = (c, name, detail) => {
    console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`);
    if (!c) fails++;
};
const sec = (t) => console.log("\n" + t);
const G = FG.parsePasses(SRC);

// ---------------------------------------------------------------------------------------------------------
sec("1. THE CHAIN CAN BE READ OFF THE SOURCE, IN ORDER, WITH EACH DRAW ATTRIBUTED");
// ---------------------------------------------------------------------------------------------------------
{
    ok(G.draws.length === 6, "six draws are found in bloomPass.js", `${G.draws.length} gl.drawArrays sites`);
    const progs = G.draws.map((d) => d.program);
    ok(progs.every((p) => typeof p === "string" && p.length > 0),
       "every draw is attributed to the program bound before it", progs.join(" -> "));
    ok(G.draws.every((d) => typeof d.target === "string" && d.target.length > 0),
       "and to the framebuffer it writes", [...new Set(G.draws.map((d) => d.target))].join(", "));
    const cond = G.draws.filter((d) => d.conditional);
    ok(cond.length === 2, "exactly two draws sit inside a guard", cond.map((d) => d.program).join(", "));
    ok(cond.every((d) => /Strength|Visibility/.test(d.guard || "")),
       "*** and the guards are carried out with them, not just a boolean ***",
       cond.map((d) => `${d.program}: ${d.guard}`).join(" | "));
    ok(progs.indexOf("brightProg") === 0 && progs[progs.length - 1] === "compositeProg",
       "the order is bright first and composite last, as a reader of the method would see",
       "order is a property of a 100-line method and was not written down anywhere before this");
    console.log("\n" + FG.describe(G.draws).split("\n").map((l) => "        " + l).join("\n"));
}

// ---------------------------------------------------------------------------------------------------------
sec("2. THE TWO SPANS ARE DIFFERENT RANGES, AND EACH FIELD NOW SAYS WHICH ONE IT MEANS");
// ---------------------------------------------------------------------------------------------------------
const fusable = FG.spanOf(G.draws, FG.SPANS.fusable.first, FG.SPANS.fusable.last);
const enclosing = FG.spanOf(G.draws, FG.SPANS.enclosing.first, FG.SPANS.enclosing.last);
{
    ok(fusable.count !== enclosing.count,
       "*** the two spans genuinely differ, which is why one object describing both was confusing ***",
       `fusable ${fusable.count} draws, enclosing ${enclosing.count} draws`);
    ok(fusable.conditional === 0 && enclosing.conditional === 2,
       "the fusable span is unconditional and the enclosing one is not",
       "that difference is the whole reason a fused pass cannot simply swallow the span");
    ok(FG.intermediatesOf(fusable) === fusable.targets.length - 1,
       "an intermediate is every target but the LAST -- the final one is the span's output",
       `${fusable.targets.length} targets, ${FG.intermediatesOf(fusable)} intermediate`);
    ok(enclosing.outside === 1 && G.draws[G.draws.length - 1].program === "compositeProg",
       "*** and the sixth draw is OUTSIDE the enclosing span: composite consumes the result ***",
       "six draws recorded as five looked like an error and was a range nobody had named");
    ok(Object.values(FG.SPANS).every((s) => typeof s.means === "string" && s.means.length > 20),
       "every named span carries what it MEANS, not just its endpoints");
}

// ---------------------------------------------------------------------------------------------------------
sec("3. ROUND_TRIPS IS DERIVED, PROVEN BY MOVING THE SOURCE AND WATCHING IT FOLLOW");
// ---------------------------------------------------------------------------------------------------------
{
    const g = BF.ROUND_TRIPS.glsl;
    ok(g.passes === fusable.count && g.roundTrips === fusable.count,
       "the pass count equals the fusable span", `${g.passes}`);
    ok(g.intermediateTextures === FG.intermediatesOf(fusable), "the intermediate count too", `${g.intermediateTextures}`);
    ok(g.drawsInSpan === enclosing.count && g.conditional === enclosing.conditional,
       "and the span figures equal the enclosing span", `${g.drawsInSpan} draws, ${g.conditional} conditional`);
    ok(g.spans && g.spans.passes === "fusable" && g.spans.drawsInSpan === "enclosing",
       "*** and the record NAMES which span each field came from ***",
       "the field that was under-specified now carries its own scope");
    ok(g.derivedFrom === BF.BLOOM_SOURCE, "it says where it was derived from", g.derivedFrom);

    // *** THE CHECK THAT SEPARATES DERIVED FROM COPIED, AND THE FIRST VERSION OF IT DID NOT. ***
    // v4293's third sabotage put back a hand-typed literal carrying today's correct numbers and this gate
    // went ALL GREEN. The old check mutated a copy of bloomPass.js and watched parsePasses follow -- which
    // tests THE PARSER. ROUND_TRIPS was never re-derived from the changed source, so a constant that merely
    // agreed with it was indistinguishable from one that computed it. The only way to tell them apart is to
    // re-derive from changed input, which needs a function that ACCEPTS input.
    ok(typeof BF.deriveRoundTrips === "function",
       "*** the record is produced by a FUNCTION, so it can be re-run against different source ***",
       "a literal has nothing to call, which is itself the first half of the distinction");

    const injected = SRC.replace(
        "        // Round 52 — Pass 3.5: SSAO at half-res from sceneDepth.",
        "        gl.useProgram(this.extraProg);\n        gl.drawArrays(gl.TRIANGLES, 0, 3);\n\n        // Round 52 — Pass 3.5: SSAO at half-res from sceneDepth.");
    ok(injected !== SRC, "the mutation applied to the copy", "if this failed the checks below would be vacuous");

    const G2 = FG.parsePasses(injected);
    ok(G2.draws.length === G.draws.length + 1,
       "one extra draw in the source yields one extra draw in the graph", `${G.draws.length} -> ${G2.draws.length}`);

    // AND THE RECORD ITSELF, re-derived from that same changed source.
    // GUARDED, because the sabotage that removes the function made this gate CRASH instead of report. Exit 1
    // is the right verdict either way, but a gate that dies mid-run cannot say which check failed -- and the
    // whole point of this section is to name the difference between a derivation and a copy.
    const moved = typeof BF.deriveRoundTrips === "function"
        ? BF.deriveRoundTrips(injected).glsl
        : { drawsInSpan: g.drawsInSpan, conditional: g.conditional, passes: g.passes, _absent: true };
    if (moved._absent) console.log("  ----  deriveRoundTrips is absent, so the three checks below cannot move: " +
                                   "a constant with nothing to call is the copied case by definition");
    ok(moved.drawsInSpan === g.drawsInSpan + 1,
       "*** and ROUND_TRIPS RE-DERIVED FROM THE CHANGED SOURCE MOVES WITH IT ***",
       `${g.drawsInSpan} -> ${moved.drawsInSpan} -- a copied constant cannot do this, which is what the old check missed`);
    ok(moved.conditional === g.conditional,
       "while its conditional count does NOT, because the injected draw is unguarded",
       "the derivation distinguishes the two rather than counting draws and calling it a day");
    ok(moved.passes === g.passes,
       "and the fusable span is untouched, because the draw was injected outside it",
       "one mutation, three fields, and only the right one moves");
}

// ---------------------------------------------------------------------------------------------------------
sec("4. THE LEXER REPORTS WHAT IT CANNOT SEE, RATHER THAN COUNTING ZERO AND MOVING ON");
// ---------------------------------------------------------------------------------------------------------
{
    ok(G.unrecognised.length > 0,
       "it flags call sites that might issue draws through a helper", `${G.unrecognised.length} flagged`);
    ok(G.unrecognised.every((u) => /_compileProgram/.test(u.text)),
       "*** and on this file all of them are program COMPILATION, which correctly is not a draw ***",
       "the caution fired five times and was right five times -- a lexer that reported nothing here would be one that cannot report");
    ok(!/drawArrays/.test(G.unrecognised.map((u) => u.text).join(" ")),
       "no flagged line is itself a draw the count missed");
    // A draw inside a comment must not be counted -- the source is full of prose about drawArrays.
    const commented = FG.parsePasses("function f(){\n  // gl.drawArrays(gl.TRIANGLES, 0, 3);\n}");
    ok(commented.draws.length === 0, "CONTROL: a draw inside a comment is not a draw",
       "bloomPass.js and this tree's headers discuss drawArrays constantly");
}

// ---------------------------------------------------------------------------------------------------------
sec("5. A SPAN WITH A MISSING ENDPOINT REFUSES RATHER THAN GUESSING");
// ---------------------------------------------------------------------------------------------------------
{
    let threw = false;
    try { FG.spanOf(G.draws, "noSuchProg", "compositeProg"); } catch { threw = true; }
    ok(threw, "*** an absent start raises ***",
       "silently returning the whole method is how an under-specified span becomes a wrong number");
    let threw2 = false;
    try { FG.spanOf(G.draws, "compositeProg", "brightProg"); } catch { threw2 = true; }
    ok(threw2, "and so does a span whose end precedes its start", "an empty slice would have read as zero draws");
    ok(FG.spanOf(G.draws, "brightProg", "compositeProg").count === G.draws.length,
       "CONTROL: a valid span still works, so the refusals are not just a broken function",
       `whole chain ${G.draws.length} draws`);
}

// ---- SABOTAGE LOG ---------------------------------------------------------------------------------------
//
//   A  intermediatesOf reverted to counting distinct targets instead of targets-minus-one.
//      -> exit=1, but ONE red, not the two sections predicted. Section 2 caught it because it states the
//      definition arithmetically (targets - 1). Section 3 did NOT, because it compares the record against
//      intermediatesOf and the record is DERIVED using intermediatesOf -- both sides moved together.
//
//   B  the conditional test in parsePasses forced to false.
//      -> exit=1, TWO red, not four. Same cause: sections 1 and 2 assert against the source independently,
//      section 3's conditional figure derives through the broken function and agrees with itself.
//
//   *** THE LESSON A AND B SHARE, AND IT IS THE COST OF THIS ROUND'S OWN CHANGE. *** A hand-typed constant is
//   an INDEPENDENT WITNESS: wrong code and a right number disagree, and something notices. Deriving it removes
//   the staleness risk and removes the witness in the same stroke. That is still the right trade -- v4284's
//   literal went wrong and no witness saved it -- but it means the independent assertions must live somewhere
//   ELSE, and here they live in sections 1 and 2, stated against the source rather than against the derivation.
//
//   C  ROUND_TRIPS returned to a hand-typed literal carrying today's correct numbers.
//      -> *** 0 RED THE FIRST TIME. ALL GREEN, exit 0. *** Every value check passed, because a literal copied
//      from the source agrees with the source. And the check written to catch exactly this -- "proven by
//      moving the source and watching it follow" -- mutated a copy of bloomPass.js and watched PARSEPASSES
//      follow. It never re-derived the record. The heading was false: it tested the parser and claimed to test
//      the constant. Fixed by giving deriveRoundTrips an injectable source so the record itself can be re-run
//      against changed input. Redone it goes 2 red with "5 -> 5", the constant visibly failing to move.
//      Then a second pass: the redone sabotage CRASHED the gate (TypeError on an absent function) rather than
//      reporting, so the call is guarded and it now names what is missing instead of dying on it.
//
// A and B found the shape of what deriving costs. C found a false claim in this gate's own section heading,
// which is the fourth time this session a sabotage has caught the author rather than the code.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER THE CHAIN IS RIGHT. This says what bloomPass.js DOES, not whether doing " +
    "it in that order is correct -- the pixel comparisons in bloomFused-selfcheck answer that and this does " +
    "not duplicate them. Also unchecked: every other pass module. main.js decides WHEN the chain runs and " +
    "with which features enabled, from two call sites inside 31,483 lines, and nothing here reads it; a frame " +
    "graph for the whole engine would have to, and would be a much larger claim than one module's method.");
process.exit(fails ? 1 : 0);

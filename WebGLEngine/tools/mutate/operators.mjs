// WebGLEngine/tools/mutate/operators.mjs -- v4390
//
// *** ONE OPERATOR FOR EVERY LITERAL MANUFACTURES SURVIVORS, AND v4389 MEASURED IT. ***
//
// tools/mutate/scan.mjs perturbs every numeric constant by the same relative 3%. That is a PHYSICS mutation:
// exactly right for a kernel normalising constant, and meaningless for an integer tick count or a JSON indent.
// The first mechanical sweep found seven survivors and FIVE OF THEM WERE THAT -- numbers a three-percent nudge
// could not plausibly break, filed as constants nothing is checking.
//
// *** AND ONE LINE SETTLES THE ARGUMENT, BECAUSE BOTH SUITES MUTATE IT. *** physics/box3dLockstepNet.js's
//
//     const redundancy = opts.redundancy != null ? opts.redundancy : 4;
//
// is mutated by tools/mutate/mutate.mjs's hand-picked table to `const redundancy = 0` and is CAUGHT. The
// mechanical operator sets it to 4.12 and it SURVIVES. Same line, same file, opposite verdicts. The difference
// was never gate coverage -- it is whether the mutation is a defect anyone could ship for a number OF THAT KIND.
//
// So the operator is chosen by the constant's ROLE. v4389 recorded that judgement as a hand annotation called
// `plausible` and said so plainly; this file is that annotation becoming a function.
//
// ---- THE ROLES, AND WHY EACH GETS THE OPERATOR IT DOES ---------------------------------------------------------
//
//   FORMAT   an argument to a formatting call -- JSON.stringify's indent, toFixed's places, padStart's width.
//            NO MUTANT AT ALL. It is not a quantity, it is presentation, and a gate that noticed would be
//            asserting on whitespace. v4389's seventh survivor was JSON.stringify(sub, null, 2).
//
//   SCALE    the literal takes part in arithmetic, or is not an integer. A relative nudge is exactly the right
//            defect here: a mistyped constant, a wrong unit, a dropped digit. This is scan.mjs's original
//            operator, kept unchanged for the case it was right about.
//
//   COUNT    an integer that is not in arithmetic -- a default for a named option, a tick offset, a table size.
//            A 3% nudge is not a defect anyone could ship; ZERO and OFF-BY-ONE are. Both are tried, and the
//            constant counts as checked if EITHER is caught, because the question is whether anything is
//            watching the number at all.
//
// ---- WHAT IS DELIBERATELY NOT CLAIMED --------------------------------------------------------------------------
//
// *** THIS IS A SYNTACTIC GUESS AND IT IS WRONG SOMETIMES. *** `shipHalf: opts.shipHalf || 30` reads as COUNT by
// these rules -- an integer default with no arithmetic -- and it is really a physical half-extent. The role is
// wrong; the operator it selects (set it to 0, a degenerate body) is still a better experiment than 30 -> 30.9.
// That is the honest shape of the thing: a classifier that improves the QUESTION without pretending to
// understand the code. Where it misclassifies, the gate says which constants moved role and a reader can look.
//
// The one place it must not be wrong is FORMAT, because a skipped constant is never tested at all. So FORMAT is
// recognised from a SHORT, NAMED list of calls rather than by any general rule, and the gate holds that list.
"use strict";

/** Calls whose numeric arguments are presentation, not quantity. Named, never inferred. */
export const FORMAT_CALLS = Object.freeze([
    "JSON.stringify", "toFixed", "toPrecision", "toExponential", "padStart", "padEnd", "repeat", "toString",
]);

export const ROLE = Object.freeze({ FORMAT: "format", SCALE: "scale", COUNT: "count" });

/**
 * Which role a literal plays, from the text around it.
 *
 * *** ARITHMETIC WINS OVER DEFAULT, AND THE ORDER IS LOAD-BEARING. *** `const dt = opts.dt || 1 / 30` is both
 * a default AND a division. Read as a default it would be set to 0 -- a zero timestep, which every gate would
 * catch instantly and which would tell us nothing about the 1/30. Read as arithmetic it gets the relative
 * nudge, which is the mutation that actually asks whether the timestep is checked. Test arithmetic first.
 */
export function roleOf({ text, code, context, col = 0 }) {
    // `code` is the untrimmed line the column was measured on; `context` is a trimmed excerpt for printing.
    // Only the first can be indexed by col. Falling back to context would silently mis-read every constant
    // that is not at the start of its line, which is most of them.
    const line = String(code != null ? code : context || "");
    for (const call of FORMAT_CALLS) {
        // The literal must be INSIDE the call's parentheses, not merely on the same line as it.
        const i = line.indexOf(call + "(");
        if (i >= 0 && insideParens(line, i + call.length, col)) return ROLE.FORMAT;
    }
    if (!Number.isInteger(Number(text))) return ROLE.SCALE;
    if (inArithmetic(line, col, String(text))) return ROLE.SCALE;
    return ROLE.COUNT;
}

/** Is `col` inside the parenthesis group that opens at `open`? */
function insideParens(line, open, col) {
    if (col <= open) return false;
    let depth = 0;
    for (let i = open; i < line.length; i++) {
        if (line[i] === "(") depth++;
        else if (line[i] === ")") { depth--; if (depth === 0) return col < i; }
    }
    return true;   // unbalanced because the context was truncated: assume inside, which SKIPS -- see below
}

/**
 * Does the literal sit in an arithmetic expression? Looks at the nearest non-space character either side.
 *
 * `*`, `/`, `%` and `**` are unambiguous. `+` and `-` are NOT: `nextInputTick - redundancy - 2` is a tick
 * offset, not a scale, and treating every subtraction as arithmetic would drag every integer offset into the
 * relative-nudge bucket -- which is the bucket this whole file exists to empty. So multiplicative context only.
 */
function inArithmetic(line, col, text) {
    const before = line.slice(0, col).replace(/\s+$/, "");
    const after = line.slice(col + text.length).replace(/^\s+/, "");
    return /[*/%]$/.test(before) || /^[*/%]/.test(after);
}

/**
 * The mutants for one constant: a list, because a COUNT deserves two questions and a SCALE one.
 *
 * Returns [] for FORMAT, and a caller must treat that as SKIPPED rather than as survived -- an untested
 * constant and an unguarded one are different findings, and v4389's UNMEASURED bucket exists for the same
 * reason.
 */
export function mutantsFor(c, { frac = 0.03 } = {}) {
    const role = roleOf(c);
    const v = Number(c.text);
    if (role === ROLE.FORMAT) return [];
    if (role === ROLE.SCALE) {
        return [{ role, kind: "nudge", now: String(Number((v * (1 + frac)).toPrecision(12))) }];
    }
    const out = [];
    if (v !== 0) out.push({ role, kind: "zero", now: "0" });
    out.push({ role, kind: "offByOne", now: String(v + 1) });
    return out;
}

/** A census of roles over a constant list, so a caller reports the split rather than asserting it. */
export function roleCensus(constants) {
    const out = { format: 0, scale: 0, count: 0 };
    for (const c of constants) out[roleOf(c)]++;
    return out;
}

// tools/roundhouse/coverage.mjs
//
// v3084 -- A REGISTER THE TREE IS MEANT TO GROW MUST NEVER HAVE ITS SIZE ASSERTED AS AN EQUALITY OR A CEILING.
//
// Three rounds in a row have ended by rewriting a check that went red BECAUSE THE WORK SUCCEEDED:
//   v3081  refinementKnobs-selfcheck   Object.keys(REFINEMENT_KNOBS).length === 5   -- registering a knob broke it
//   v3081  knobCandidates-selfcheck    eligible.length === 4                        -- a round's outcome, frozen
//   v3083  corroborateFully-selfcheck  a tally requiring TWO rejections             -- red when a defect was fixed
// and the census that opened v3084 found two MORE still live in the tree, both in corroborateFully-selfcheck:
// an eligibility check with an UPPER BOUND of 8, and "four quantities is not a lab" pinned at rs.length === 4.
//
// Five instances of one shape is not five mistakes, it is a missing primitive. Every one of them was somebody
// writing, by hand, a sentence that means "coverage is still a small minority" -- and reaching for `=== N`
// because that is the shortest thing to type. THE FIX IS TO MAKE THE CORRECT ASSERTION THE EASY ONE, which is
// the only intervention that survives the next person in a hurry.
//
// WHAT THE CLAIM ACTUALLY IS, and why an equality was never it:
//   - coverage is a MINORITY of the population, so an absent verdict means NOT ASKED rather than PASSED. That is
//     the honest thing these checks exist to say, and it stays true as the numerator grows.
//   - the numerator MUST NOT SHRINK below a recorded floor. A device losing a knob is a real regression; a
//     device gaining one is the goal. So the count is a RATCHET in one direction only, never a window.
//
// THE LINE THIS DOES NOT CROSS. refinementKnobs-selfcheck asserts REFINEMENT_KNOBS.chaos.values.length === 4 and
// values[3] === 6, and that is CORRECT and must stay an equality: it is a claim about the DEVICE -- chaosDefaults
// clamps count to [3, 6], so the sweep reaches the clamp and cannot say more. If someone raises the clamp, that
// check SHOULD go red, because the sentence it guards ("the range the device permits is too short to say more")
// becomes false. Pinned to a fact about the apparatus is right; pinned to how much work has been done is the
// debt. Nothing lexical separates those two, which is why this is a primitive to reach for rather than a rule
// that can be enforced everywhere.

/**
 * The claim every "N of M is not a lab" check was trying to make.
 *
 * @param have   how many are covered now (derived, never typed)
 * @param total  the population (derived, never typed)
 * @param what   what is being counted, for the evidence line
 * @param floor  the recorded low-water mark -- lower it never, raise it when you gain ground
 * @param minorityBelow  coverage must stay under this fraction for "minority" to mean anything (default 1/2)
 */
export function coverageClaim({ have, total, what, floor = 0, minorityBelow = 0.5 }) {
    const frac = total > 0 ? have / total : 0;
    const minority = frac < minorityBelow;
    const held = have >= floor;
    return {
        pass: minority && held,
        have, total, frac, floor,
        evidence:
            have + " of " + total + " " + what + " (" + (100 * frac).toFixed(0) + "%), floor " + floor +
            (!held ? " -- SHRANK below the floor, which is a real regression: something lost coverage it had"
                   : !minority ? " -- coverage is no longer a minority, so this claim has outlived its purpose and " +
                                 "the check should be retired rather than loosened"
                   : ". A member with no verdict has NOT passed -- it has not been asked, and a summary that " +
                     "counted only verdicts could not tell those apart"),
    };
}

/**
 * The other half: a count that may GROW and must not SHRINK, with no minority claim attached. Use where the
 * population is unknown or meaningless -- how many quantities have faced the battery, how many rejections a
 * suite has produced. The floor is the whole assertion.
 *
 * Rejections are the case worth naming: they SHOULD fall as the lab improves, so a floor on them is wrong too.
 * Pass floor: 1 and mean it -- "this suite has demonstrated the power to refuse at least once".
 */
export function ratchet({ have, what, floor }) {
    return {
        pass: have >= floor,
        have, floor,
        evidence: have + " " + what + " (floor " + floor + ")" +
            (have >= floor
                ? have > floor ? " -- UP " + (have - floor) + " from the floor; raise it to lock the gain in" : " -- at the floor"
                : " -- BELOW the floor, so something that used to be covered no longer is"),
    };
}

/**
 * v3086 -- THE WALL COVERED ITS REGISTERS BY A TYPED LIST, WHICH IS THE HOLE IT WAS BUILT TO CLOSE.
 *
 * v3084 made it a hard failure to pin a growth register's size, and did it against four names written out by
 * hand in gateQuality-selfcheck. So a FIFTH register would not be covered until somebody remembered to add its
 * name -- a manual step beside the ritual, surviving exactly as long as a habit, which is the same shape as the
 * changelog that froze for forty versions and the case-study count that is still hand-edited. A wall with a
 * typed list of what it guards is a wall with a door in it.
 *
 * DERIVED FROM THE CONVENTION INSTEAD. A growth register in this tree is an exported UPPER_SNAKE_CASE object
 * whose entries each carry a `why` -- the ceremony v2906 established and every register since has kept: an
 * entry cannot be added without writing the sentence. That convention is what makes them findable, and it is
 * already enforced by each register's own gate, so this is reading a rule the tree already keeps rather than
 * inventing a second one.
 *
 * SCOPE, STATED: this is a LEXICAL scan of source text, not a module load. It cannot see a register built at
 * runtime, and it would miss one that abandoned the `why` convention -- which is the point at which that
 * register's own gate would already be failing.
 */
export function growthRegisters(readDir, readFile) {
    const found = [];
    for (const f of readDir().filter((n) => n.endsWith(".mjs") && !n.includes("-selfcheck"))) {
        let src; try { src = readFile(f); } catch { continue; }
        for (const m of src.matchAll(/export\s+const\s+([A-Z][A-Z0-9_]{3,})\s*=\s*\{/g)) {
            // the register's body, to its closing brace at column 0 -- enough to see whether entries carry `why`
            const body = src.slice(m.index, src.indexOf("\n};", m.index) + 3);
            if (/^\s{4,}why:/m.test(body)) found.push({ name: m[1], file: f });
        }
    }
    return found;
}

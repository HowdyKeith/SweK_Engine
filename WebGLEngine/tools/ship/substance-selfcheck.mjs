// WebGLEngine/tools/ship/substance-selfcheck.mjs — v2548
//
// Run: node tools/ship/substance-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// This does not check that substance.mjs works. It checks that IT DOES NOT WORK, and pins the reason, so that
// nobody -- including me, in four months, having forgotten -- wires it into verify.mjs thinking it is a gate.
//
// The ADI README's section 9.2 claims the Substance Score "detects fancy but empty inputs". The assertions below
// are the measurement that says otherwise. If any of them ever START passing in the other direction, the score
// became useful and this file should be rewritten rather than deleted quietly.
import { substanceScore, adi, zone, adjustedNoise, ADI_WEIGHTS } from "./substance.mjs";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const HONEST = "The grid loses below a thousand particles. Measured: two hundred is 0.4x, six thousand is 5.1x.";
const NOISE_ONLY = "help plsss fix asap";
const EMPTY_BUT_DRESSED = "complex algorithm architecture metrics benchmarks v1.0.4 complex algorithm architecture metrics";

// ---- 1. THE FINDING: keyword salad beats a real measurement --------------------------------------------------
{
    const h = substanceScore(HONEST), e = substanceScore(EMPTY_BUT_DRESSED), n = substanceScore(NOISE_ONLY);
    ok("KEYWORD SALAD SCORES HIGHER THAN A REAL MEASUREMENT", e.score > h.score,
       "empty " + e.score.toFixed(2) + " vs honest " + h.score.toFixed(2) + " -- the score measures VOCABULARY, not substance");
    ok("...and a real measurement ties with pure noise", h.score === n.score,
       "honest " + h.score.toFixed(2) + " = 'help plsss fix asap' " + n.score.toFixed(2));
    ok("...and the empty one wins by roughly 10x", e.score >= 10, "empty scores " + e.score.toFixed(2));
    // If those three ever flip, the score started measuring something. That would be news, and it should arrive
    // as a build failure rather than as silence.
}

// ---- 2. it is not a tuning problem: MORE keywords makes it WORSE ----------------------------------------------
// The obvious fix is "the dictionary is too small". It is not a fix. A keyword is a thing you can TYPE, so a
// bigger dictionary is a bigger vocabulary to paste from.
{
    const short = substanceScore("complex algorithm");
    const long = substanceScore("complex algorithm architecture complex algorithm architecture complex algorithm");
    ok("repeating the same empty words RAISES the score (nothing is being understood)", long.score > short.score,
       short.score.toFixed(2) + " -> " + long.score.toFixed(2) + " by pasting the same three words twice more");
}

// ---- 3. the README's arithmetic, pinned ----------------------------------------------------------------------
// 5.2 uses the UNWEIGHTED formula and closes. 5.3 uses the weighted one and does not. Both pinned, so this file
// records a fact about the source rather than an opinion about it.
{
    const ex52 = (0.1 - 0.8) / (0.7 + 0.5);
    ok("README example 5.2 (unweighted) is correct", Math.abs(ex52 - -0.58) < 0.01,
       ex52.toFixed(4) + " vs the README's -0.58");

    const ex53 = adi({ noise: 0.0, effort: 1.0, context: 1.0, details: 1.0, bonus: 0.5 }, ADI_WEIGHTS);
    ok("README example 5.3 (weighted) IS NOT -0.92 as printed", Math.abs(ex53.value - -0.92) > 0.1,
       ex53.value.toFixed(4) + " = " + ex53.num.toFixed(2) + "/" + ex53.den.toFixed(2) + ", README says -0.92");
    ok("...and the right answer is -0.75", Math.abs(ex53.value - -0.75) < 1e-9, ex53.value.toFixed(4));
}

// ---- 4. the degenerate case the README calls a feature -------------------------------------------------------
{
    const ex51 = adi({ noise: 0.75, effort: 0.1, context: 0, details: 0 });
    ok("README example 5.1 divides by zero", ex51.degenerate && !Number.isFinite(ex51.value),
       "(0.75 - 0.1)/(0 + 0) -> " + ex51.value + " -- the README prints this AS A SCORE and calls it 'Instant rejection'");
    ok("...and this implementation says so instead of pretending", ex51.degenerate === true,
       "a zero denominator is not a high score, it is an undefined expression wearing one");
    ok("...though the dump zone does catch it, by accident", zone(ex51.value) === "dump",
       "catching something by accident is not the same as catching it");
}

// ---- 5. the arithmetic that IS right stays right --------------------------------------------------------------
// The formulas are implemented as written, and the criticism above is of the METHOD, not of my transcription.
// If I got the transcription wrong, the criticism is worthless.
{
    ok("adjustedNoise matches README 9.3 by hand", Math.abs(adjustedNoise(0.75, 2, 8) - 0.5625) < 1e-9,
       "0.75 * (1 - 2/8) = " + adjustedNoise(0.75, 2, 8).toFixed(4));
    const s = substanceScore("complex metrics actually");
    // effort 1, details 1, noise 1, pseudo 0, words 3 -> nAdj = 1*(1 - 1/3) = 0.6667 -> (1+1)/(0.6667+0+1) = 1.2
    ok("substanceScore matches README 9.2 by hand", Math.abs(s.score - 1.2) < 1e-3,
       s.score.toFixed(4) + " vs 1.2 by hand (effort 1 + details 1) / (nAdj 0.667 + pseudo 0 + 1)");
    ok("zones are the README's zones", zone(1.5) === "dump" && zone(0.5) === "gray" && zone(-0.5) === "genius");
}

// ---- 6. THE CONTRAST, and the reason this is not wired into verify ---------------------------------------------
// claimsGate asks CAN THIS BE KILLED. That is not answerable by typing: a kill condition has to survive contact
// with reality. ADI asks DOES THIS LOOK LIKE SUBSTANCE, which is answerable by pasting nouns -- as demonstrated
// above, at a ratio of 10 to 0.
{
    const gatedIn = [substanceScore(EMPTY_BUT_DRESSED).score, substanceScore(HONEST).score];
    ok("THIS IS NOT A GATE AND MUST NOT BECOME ONE", gatedIn[0] > gatedIn[1],
       "a gate that ranks keyword salad above a measurement would be decoration, and this engine has a law about that");
}

console.log(fails ? "\nsubstance-selfcheck: " + fails + " FAILED" : "\nsubstance-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);

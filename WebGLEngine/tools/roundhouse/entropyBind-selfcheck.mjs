// tools/roundhouse/entropyBind-selfcheck.mjs -- v3781
//
// *** TIER 2, AND THIS ONE HOLDS SOMETHING RARE IN THIS TREE: A THEOREM AS A KEY. Shannon's source-coding
// theorem gives an optimal prefix code's expected length a TWO-SIDED band, H <= L < H + 1, and the two sides
// are computed by CODE THAT SHARES NOTHING: huffmanLengths() is a greedy merge over weights that NEVER TAKES
// A LOGARITHM, and entropy() sums -p log2 p and never builds a tree. After ct's correlations, the
// interferometer's lambda, kepler's mu and the thermostat's target -- four devices whose obvious key turned
// out to be a mirror -- a pair with NO shared constant is worth naming. ***
//
// *** AND THE COMPANION KEY IS BLIND ON PURPOSE. The Kraft sum is EXACTLY 1 for any complete prefix code and
// STAYS EXACTLY 1 WHEN THE TREE IS BUILT BY THE OPPOSITE RULE. VALIDITY AND OPTIMALITY ARE DIFFERENT CLAIMS:
// Kraft asks "is this a code at all", Shannon asks "is it a good one", and a check that asked only the first
// would pass a tree built backwards. Both are reported so the difference is visible in one reading. ***

import { entropyDevice, ENTROPY_MODES, buildEntropy } from "./entropyBind.mjs";
import { huffmanLengths, kraftSum, expectedLength } from "../../physics/info/entropy.mjs";
import { DEVICE_NAMES } from "./devices.mjs";
import { codeOnly } from "../ship/sourceScan.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const MOD = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../physics/info/entropy.mjs"), "utf8");

const honest = await buildEntropy({ mode: "coding" });
const planted = await buildEntropy({ mode: "mergelargest" });
const bounds = await buildEntropy({ mode: "bounds" });

console.log("1. THE EXACT VALUES, WHICH THE MODULE IS NEVER TOLD");
{
    ok("!! *** A UNIFORM DISTRIBUTION OVER 8 SYMBOLS HAS H = 3 EXACTLY ***",
        bounds.uniformExact === true && bounds.uniformH === 3,
        "log2(8) = 3, and the check is |H - log2(n)| < 1e-12 -- NOT a tolerance on a measurement, an identity");
    ok("!! a fair coin is exactly one bit",
        bounds.binaryAtHalf === 1,
        "binaryEntropy(0.5) = 1. If this ever moves, the base of the logarithm has changed under somebody");
    ok("!! and H <= log2(n) for the non-uniform set -- an INEQUALITY, not a value",
        bounds.belowMax === true && bounds.H < bounds.maxH,
        "H = " + bounds.H.toFixed(6) + " against a maximum of " + bounds.maxH + ". Equality would mean the " +
        "weights were uniform, and they are not");
}

console.log("\n2. THE THEOREM AS A KEY");
{
    ok("!! *** HUFFMAN'S EXPECTED LENGTH SITS INSIDE SHANNON'S BAND ***",
        honest.shannonHolds === true,
        "H = " + honest.H.toFixed(6) + ", L = " + honest.expectedLen.toFixed(6) + ", excess " +
        honest.excessOverH.toFixed(4) + " bits. *** BOTH SIDES ARE CHECKED: a code cannot BEAT H, and an " +
        "optimal one cannot waste a whole bit. Testing only the upper side would pass a code that claimed to " +
        "beat the entropy -- which is impossible, and would mean the entropy was computed wrong ***");
    ok("!! and the two sides share no code",
        !/Math\.log/.test(codeOnly(MOD).split("export function huffmanLengths")[1].split("export function expectedLength")[0]),
        "huffmanLengths is a greedy merge over weights and NEVER TAKES A LOGARITHM; entropy() sums -p log2 p " +
        "and never builds a tree. TWO ROUTES, NO SHARED CONSTANT");
}

console.log("\n3. THE PLANT -- A VALID CODE THAT IS NOT AN OPTIMAL ONE");
{
    ok("!! *** MERGING THE TWO LARGEST WEIGHTS BREAKS SHANNON'S BAND ***",
        planted.shannonHolds === false && planted.excessOverH > 1,
        "L " + honest.expectedLen.toFixed(4) + " -> " + planted.expectedLen.toFixed(4) + ", excess over H " +
        honest.excessOverH.toFixed(4) + " -> " + planted.excessOverH.toFixed(4) + " bits. *** 'MERGE THE TWO " +
        "SMALLEST' IS THE WHOLE ALGORITHM, and merging the largest is the classic misremembering ***");
    ok("!! *** AND THE KRAFT SUM IS EXACTLY 1 IN BOTH ARMS -- THE COMPANION KEY IS BLIND ***",
        planted.kraftHolds === true && honest.kraftHolds === true && planted.kraftSum === honest.kraftSum,
        "1.000000000000 either way. THE PLANTED TREE IS STILL A PERFECTLY VALID COMPLETE PREFIX CODE: every " +
        "leaf has a depth, the tree is binary, nothing is ambiguous. *** A CHECK ASKING ONLY 'IS THIS A CODE' " +
        "WOULD PASS A TREE BUILT BY THE OPPOSITE RULE -- validity and optimality are different claims ***");
    ok("!! the default is CORRECT, so the option changes no existing caller",
        (() => { const a = huffmanLengths([45, 13, 12, 16, 9, 5]);
                 const b = huffmanLengths([45, 13, 12, 16, 9, 5], false);
                 return a.join() === b.join() && Math.abs(kraftSum(a) - 1) < 1e-12; })(),
        "`mergeLargest` defaults to false and only this device's plant mode passes true");
    ok("!! and the device is REGISTERED and DECLARES its plant, with `coding` first",
        DEVICE_NAMES.includes("entropy") && entropyDevice.plantMode === "mergelargest" &&
        entropyDevice.plantFlips === "excessOverH" && ENTROPY_MODES[0] === "coding",
        "registered by a STATIC import -- v3768 registered a device dynamically and it was INVISIBLE to " +
        "deviceInstrumentMap while every gate passed");
}

report("WHY excessOverH IS THE DECLARED FLIP AND NOT shannonHolds",
    "plantedCoverage requires A FINITE NUMBER THAT MOVES, and shannonHolds is a boolean. The BAND is the " +
    "claim and the EXCESS is its measurement -- 0.0201 bits honest against 1.9401 planted, a 96x move on the " +
    "quantity the theorem bounds. The binary is asserted here, where a gate can read it.");

report("WHAT THIS DOES NOT CLAIM",
    "That Huffman is optimal among ALL codes -- it is optimal among prefix codes for a KNOWN distribution, and " +
    "arithmetic coding beats it by getting inside the one-bit gap. Nor does the band prove the tree is the one " +
    "Huffman would build: a DIFFERENT optimal tree with the same lengths passes identically, which is correct, " +
    "because the theorem is about LENGTHS and not about tree shape.");

console.log("\nentropyBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);

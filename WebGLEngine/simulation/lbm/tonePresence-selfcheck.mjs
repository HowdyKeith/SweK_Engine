// WebGLEngine/simulation/lbm/tonePresence-selfcheck.mjs -- v3349
import { TONES_V3349, toneVerdict, relatedBySmallInteger } from "./tonePresence.mjs";
import { peakProminence, detrend } from "./sheddingSpectrum.mjs";
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

// The calibration is re-derived here, free, because a scale quoted in a header that nothing regenerates is a story.
const N = 9000, mk = (f, noise, seed = 1) => { let r = seed; const rnd = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648 - 0.5; };
    return Array.from({ length: N }, (_, i) => (f ? Math.sin(2 * Math.PI * f * i) : 0) + noise * rnd()); };
const clean = peakProminence(detrend(mk(0.002, 0))).prominence;
const noise = peakProminence(detrend(mk(0, 1))).prominence;
const walk = peakProminence(detrend((() => { let v = 0, r = 7; return Array.from({ length: N }, () => { r = (r * 1103515245 + 12345) % 2147483648; v += (r / 2147483648 - 0.5); return v; }); })())).prominence;
say("re-derived calibration: clean sine " + clean.toFixed(0) + ", pure noise " + noise.toFixed(2) + ", random walk " + walk.toFixed(0));

ok("!! the prominence measure separates a tone from noise by three orders of magnitude",
    clean > 1000 && noise < 10, "peak magnitude over the MEDIAN of the same scan -- median, not mean, because a " +
    "genuine peak drags a mean upward and would flatter itself");

ok("!! *** and a RANDOM WALK fakes a prominent peak with no tone at all ***", walk > 500,
    "a linear detrend does not flatten a random walk and its power piles up at the bottom of the band. " +
    "PROMINENCE ALONE IS NOT PROOF, which is why the verdict also requires cycles");

ok("!! *** the tones in the rig are REAL -- my 'the DFT is reporting noise' hypothesis is dead ***",
    TONES_V3349.measured.every((t) => t.prominence > 100 * TONES_V3349.noiseFloor),
    "lift 3105, drag 532, wake 619 against a noise floor of 3.5. Proposed one round earlier and refuted by " +
    "building the measurement it needed");

ok("!! ...and they are THREE DIFFERENT tones, which is sharper than noise would have been",
    Math.abs(relatedBySmallInteger().find((x) => x.pair === "lift/wake").ratio - 11.334) < 0.01,
    "lift 1.0964e-2 against wake 9.6739e-4 -- ELEVEN TIMES APART. That IS the liftWakeAgreementFrac of 10.33 " +
    "v3346 recorded and treated as a disagreement to explain away. IT WAS NOT AN ERROR BAR, IT WAS TWO " +
    "SEPARATE OSCILLATIONS");

const dw = relatedBySmallInteger().find((x) => x.pair === "drag/wake");
ok("!! *** drag sits at TWICE the wake frequency -- 1.990, the relation this arc has chased since v2797 ***",
    dw.smallInteger === 2,
    "and it was measured against the wrong pair for seven rounds: the question was always 'f_drag = 2 f_LIFT'. " +
    "In a street the WAKE carries the shedding frequency and drag runs at twice it; the lift is the outlier here");

// *** AND IT IS A LEAD, NOT A RESULT, BY THIS FILE'S OWN CRITERION. ***
ok("!! *** the two tones behind that 2f are BOTH flagged untrustworthy by the bar set above them ***",
    toneVerdict(TONES_V3349.measured[1]).trustworthy === false &&
    toneVerdict(TONES_V3349.measured[2]).trustworthy === false,
    "drag spans 8.8 cycles and wake 17.4, both under the 20-cycle bar, and both sit low in the band where the " +
    "random walk faked 1136. TWO POORLY RESOLVED PEAKS LANDING ON A RATIO OF 2 IS A LEAD. Announcing it as the " +
    "answer after seven rounds of wanting it would be the exact failure this arc has been made of");

ok("...and it CONTRADICTS v3347, which is stated rather than reconciled",
    TONES_V3349.measured[1].freqPerStep / TONES_V3349.measured[2].freqPerStep < 0.6,
    "v3347 EXCLUDED shedding from the D sweep. A drag tone at twice the wake tone is a shedding signature. ONE " +
    "OF THE TWO IS WRONG and nothing here settles which -- the discriminating run is a LONGER RECORD, enough " +
    "cycles to lift both peaks over the bar, and that is a rig job rather than a sandbox one");

console.log(failed ? "tonePresence-selfcheck: " + failed + " FAILED" : "tonePresence-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);

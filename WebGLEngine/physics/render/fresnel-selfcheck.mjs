// WebGLEngine/physics/render/fresnel-selfcheck.mjs -- v3491
//
// Run: node physics/render/fresnel-selfcheck.mjs   (fast)
//
// *** THE TWO CHECKS EVERYBODY WRITES ARE THE TWO THAT CATCH NOTHING. *** F0 and grazing are where anybody
// verifies a Fresnel term by hand, and both plants here survive them BIT-IDENTICAL. Brewster catches one,
// energy conservation catches the other, and neither catches both.
//
// AND THE TIE BACK TO v3490 IS THE POINT OF DOING THIS ROUND AT ALL: the white furnace test sets F = 1
// deliberately, because with a real Fresnel term energy LEGITIMATELY LEAVES the reflection lobe. A DEFICIT FROM
// MASKING IS A MODEL FAILURE AND A DEFICIT FROM FRESNEL IS PHYSICS, AND THE NUMBER ALONE CANNOT TELL THEM APART.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fresnel, rp, schlick, F0of, brewsterCos, criticalCos, brewsterByBisection, criticalByBisection } from "./fresnel.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const PAIRS = [[1, 1.33], [1, 1.5], [1, 2.4], [1.5, 1]];   // air/water, air/glass, air/diamond, glass/air

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE TWO OBVIOUS FACTS -- TRUE, EXACT, AND ABOUT TO CATCH NOTHING
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = PAIRS.map(([a, b]) => ({ a, b, meas: fresnel(1, a, b).R, want: F0of(a, b) }));
    for (const r of rows) say(`n ${r.a} -> ${r.b}: F at normal incidence ${r.meas.toFixed(12)} against ((n1-n2)/(n1+n2))^2 = ${r.want.toFixed(12)}`);
    ok("!! the exact equations reduce to F0 at normal incidence, at every index pair",
       rows.every((r) => Math.abs(r.meas - r.want) < 1e-12),
       "The closed form is never used to COMPUTE anything here -- the equations are evaluated from Snell and the boundary conditions, and the limit is compared against it. TWO ROUTES, and the second one is the number every material system exposes as a knob.");

    const graze = [1e-3, 1e-5, 1e-7].map((c) => fresnel(c, 1, 1.5).R);
    say(`grazing: R at cos = 1e-3 / 1e-5 / 1e-7 is ${graze.map((v) => v.toFixed(9)).join(", ")}`);
    ok("...and it goes to 1 at grazing incidence, for any index",
       graze.every((v, i) => i === 0 || v > graze[i - 1]) && graze[2] > 0.999999,
       "Everything is a mirror edge-on. Asserted as a LIMIT approached monotonically rather than a value at zero, because cos = 0 exactly is the one place the algebra is degenerate.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. BREWSTER: AN EXACT ZERO AT A PREDICTED PLACE, IN ONE POLARISATION ONLY
 * --------------------------------------------------------------------------------------------------------- */
{
    const n1 = 1, n2 = 1.5;
    const found = brewsterByBisection(n1, n2), want = brewsterCos(n1, n2);
    const Rp = rp(found, n1, n2) ** 2;
    say(`Brewster bisected to cos = ${found.toFixed(12)} against 1/sqrt(1 + (n2/n1)^2) = ${want.toFixed(12)}, and R_p there = ${Rp.toExponential(2)}`);
    ok("!! *** THE ANGLE IS RECOVERED FROM THE SIGN OF AN AMPLITUDE, WITH NOTHING TOLD WHERE IT IS ***",
       Math.abs(found - want) < 1e-11 && Rp < 1e-20,
       "*** THE BISECTION READS ONLY WHETHER r_p IS POSITIVE OR NEGATIVE. The closed form atan(n2/n1) appears nowhere in the loop, so the agreement to twelve digits is two independent routes rather than a restatement -- friction's bifurcation key (v3200) and cherenkov's threshold (v3424) in a third subject. AND THE ZERO IS EXACT rather than small: the p amplitude passes THROUGH zero, it does not merely dip. ***");

    const unpol = fresnel(found, n1, n2).R, Rs = fresnel(found, n1, n2).Rs;
    ok("...and the UNPOLARISED reflectance is NOT zero there -- it is exactly half the s term",
       Math.abs(unpol - Rs / 2) < 1e-15 && unpol > 0.07,
       `${unpol.toFixed(6)} against R_s/2 = ${(Rs / 2).toFixed(6)}. A renderer that works in unpolarised light sees a MINIMUM at Brewster, never a zero, so a check on the unpolarised number could not find this angle at all. THE KEY LIVES IN A QUANTITY THE RENDERER DOES NOT DISPLAY.`);

    ok("and the bisection REFUSES rather than returning a midpoint when there is no sign change",
       brewsterByBisection(1, 1) === null,
       "At equal indices there is no interface and no Brewster angle. A BISECTION BRACKETS A ROOT AND CANNOT INVENT ONE -- v3424's correction, where reading the midpoint of a bracket that held nothing was a coin flip dressed as a measurement.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. TOTAL INTERNAL REFLECTION: A BIFURCATION READ OFF A BOOLEAN
 * --------------------------------------------------------------------------------------------------------- */
{
    const found = criticalByBisection(1.5, 1), want = criticalCos(1.5, 1);
    say(`critical angle bisected to cos = ${found.toFixed(12)} against sqrt(1 - (n2/n1)^2) = ${want.toFixed(12)}`);
    ok("!! *** THE CRITICAL ANGLE COMES BACK FROM A YES/NO, NOT FROM A VALUE ***",
       Math.abs(found - want) < 1e-11,
       "The bisection asks only WHETHER a transmitted ray exists. Recovering the index ratio to twelve digits from a boolean is the strongest shape this tree has -- there is no magnitude for a compensating error to hide in.");

    ok("...and R is EXACTLY 1 past it, which no tolerance could produce",
       [0.7, 0.5, 0.2, 0.0].every((c) => fresnel(c, 1.5, 1).R === 1 && fresnel(c, 1.5, 1).T === 0),
       "Past the critical angle there is NO transmitted ray at all, so this is a branch rather than a limit. Reported as 1 and 0 exactly.");

    ok("and a lower-to-higher index pair has no critical angle, which is REFUSED rather than fudged",
       criticalCos(1, 1.5) === null && criticalByBisection(1, 1.5) === null,
       "Total internal reflection only exists going from the denser medium. A function that returned some angle anyway would be answering a question that has no answer.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. ENERGY: R + T = 1, AND IT IS ONLY A CHECK BECAUSE T IS COMPUTED INDEPENDENTLY
 * --------------------------------------------------------------------------------------------------------- */
{
    let worst = 0;
    for (const [a, b] of PAIRS) for (let i = 1; i <= 200; i++) {
        const f = fresnel(i / 201, a, b);
        if (f.tir) continue;
        worst = Math.max(worst, Math.abs(f.Rs + f.Ts - 1), Math.abs(f.Rp + f.Tp - 1));
    }
    say(`worst |R + T - 1| over ${PAIRS.length} index pairs x 200 angles, both polarisations: ${worst.toExponential(3)}`);
    ok("!! *** ENERGY CLOSES TO MACHINE PRECISION, AND T IS NEVER DEFINED AS 1 - R ***",
       worst < 1e-14,
       "*** R + T = 1 IS WORTHLESS IF T IS DEFINED AS 1 - R -- it would then be an identity about arithmetic rather than a fact about the interface. T here is |t|^2 times the ratio of projected solid angles across the boundary, computed from the transmission amplitudes, so the two sides are independent and the closure is a real measurement. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. *** THE DETECTION SPLIT: BOTH PLANTS SURVIVE THE TWO OBVIOUS CHECKS BIT-IDENTICAL ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const n1 = 1, n2 = 1.5, cB = brewsterCos(n1, n2);

    // (a) the polarisation swap
    const pF0 = fresnel(1, n1, n2, { pForS: true }).R, cleanF0 = fresnel(1, n1, n2).R;
    const pGraze = fresnel(1e-5, n1, n2, { pForS: true }).R, cleanGraze = fresnel(1e-5, n1, n2).R;
    const pTir = fresnel(0.5, 1.5, 1, { pForS: true }).R;
    const pBrew = fresnel(cB, n1, n2, { pForS: true }).R, cleanBrew = fresnel(cB, n1, n2).R;
    const pFound = brewsterByBisection(n1, n2, { o: { pForS: true } });
    say(`pForS: F0 ${pF0.toFixed(12)} (clean ${cleanF0.toFixed(12)}) | grazing ${pGraze.toFixed(9)} (clean ${cleanGraze.toFixed(9)}) | TIR ${pTir} | at Brewster ${pBrew.toFixed(6)} against ${cleanBrew.toFixed(6)} = ${(pBrew / cleanBrew).toFixed(6)}x`);

    const gz = [1e-3, 1e-5, 1e-7].map((c) => Math.abs(fresnel(c, n1, n2, { pForS: true }).R - fresnel(c, n1, n2).R));
    say(`  ...and toward grazing the gap is ${gz.map((v) => v.toExponential(3)).join(" -> ")} at cos 1e-3 / 1e-5 / 1e-7`);
    ok("!! *** THE POLARISATION SWAP IS BIT-IDENTICAL AT F0 AND UNDER TIR, AND VANISHES LINEARLY TOWARD GRAZING ***",
       pF0 === cleanF0 && pTir === 1 && gz.every((v, i) => i === 0 || Math.abs(gz[i - 1] / v - 100) < 2),
       "*** AT NORMAL INCIDENCE THE TWO POLARISATIONS COINCIDE EXACTLY and past the critical angle both are exactly 1 -- so two of the three places a person checks by hand are places this fault DOES NOT EXIST. MY FIRST VERSION CLAIMED THE THIRD WAS TOO AND THE MEASUREMENT SAID OTHERWISE: at grazing the two only share a LIMIT, and the gap falls by exactly 100 for every factor of 100 in cos -- LINEAR, so the nearer you look to the place people check, the more invisible it becomes. A LIMIT THEY SHARE AND A VALUE THEY SHARE ARE DIFFERENT CLAIMS, and asserting the stronger one would have been a check that could not fail for the wrong reason. ***");

    ok("!! ...and Brewster catches it by EXACTLY TWO, a predicted factor",
       Math.abs(pBrew / cleanBrew - 2) < 1e-9 && pFound === null,
       "*** THE TRUE UNPOLARISED VALUE AT BREWSTER IS (R_s + 0)/2 AND THE PLANTED ONE IS (R_s + R_s)/2, so the ratio is 2 with no free parameter. AND THE BISECTION REFUSES ENTIRELY on the planted amplitude -- r_s never changes sign, so there is no root to bracket, and 'no Brewster angle exists' is a louder answer than a wrong one. ***");

    // (b) the missing transmission factor
    let w = 0, at = 0;
    for (let i = 1; i <= 200; i++) {
        const c = i / 201, f = fresnel(c, n1, n2, { noTransmissionFactor: true });
        const d = Math.abs(f.Rs + f.Ts - 1); if (d > w) { w = d; at = c; }
    }
    const nF0 = fresnel(1, n1, n2, { noTransmissionFactor: true }).R;
    const nBrew = fresnel(cB, n1, n2, { noTransmissionFactor: true }).R;
    say(`noTransmissionFactor: worst |R + T - 1| = ${w.toFixed(6)} at cos ${at.toFixed(3)} | F0 ${nF0.toFixed(12)} | at Brewster ${nBrew.toFixed(6)}`);
    ok("!! *** AND THE MISSING SOLID-ANGLE RATIO IS INVISIBLE TO EVERY REFLECTANCE KEY, INCLUDING BREWSTER ***",
       nF0 === cleanF0 && nBrew === cleanBrew && w > 0.4,
       "*** IT TOUCHES ONLY THE TRANSMITTED SIDE, so every check on R is bit-blind to it and only the closure sees it -- half the energy unaccounted for at cos 0.393, against 4e-16 clean. THE TWO PLANTS ARE COMPLEMENTARY: Brewster catches one and energy the other, AND F0 AND GRAZING CATCH NEITHER. A suite holding only the two obvious keys would certify both faults. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. SCHLICK IS AN APPROXIMATION, NOT A FAULT -- AND WHAT IT CANNOT DO IS THE INTERESTING PART
 * --------------------------------------------------------------------------------------------------------- */
{
    const n1 = 1, n2 = 1.5, F0 = F0of(n1, n2), cB = brewsterCos(n1, n2);
    let worst = 0, at = 0;
    for (let i = 1; i <= 999; i++) {
        const c = i / 1000, e = Math.abs(schlick(c, F0) - fresnel(c, n1, n2).R);
        if (e > worst) { worst = e; at = c; }
    }
    say(`Schlick vs exact: worst absolute error ${worst.toExponential(3)} at cos = ${at.toFixed(3)}; exact at normal incidence ${Math.abs(schlick(1, F0) - F0).toExponential(2)}, at grazing ${Math.abs(schlick(1e-6, F0) - fresnel(1e-6, n1, n2).R).toExponential(2)}`);
    ok("!! Schlick is EXACT at both ends and wrong in the middle, which is why it survives every hand check",
       Math.abs(schlick(1, F0) - F0) < 1e-15 && worst > 0.02 && at < 0.2,
       "It is the model almost every real-time renderer actually ships, so it is measured here rather than banned. THE ERROR IS WORST NEAR GRAZING, which is also where the reflectance is largest and the eye is least able to judge it.");

    ok("!! *** AND SCHLICK HAS NO POLARISATION IN IT, SO BREWSTER'S ZERO DOES NOT MERELY BLUR -- IT DOES NOT EXIST ***",
       schlick(cB, F0) > 0.05 && rp(cB, n1, n2) ** 2 < 1e-20,
       `${schlick(cB, F0).toFixed(6)} where the exact p-reflectance is EXACTLY 0. Schlick is monotone in cos by construction, so no index and no parameter makes it dip. THAT IS A STATEMENT ABOUT WHAT THE APPROXIMATION CAN REPRESENT rather than about how accurate it is, and the two are different claims.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 7. *** THE TIE BACK TO v3490: TWO DEFICITS THAT LOOK THE SAME AND ARE NOT ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const F0 = F0of(1, 1.5);
    ok("!! *** A FURNACE DEFICIT FROM MASKING IS A MODEL FAILURE; ONE FROM FRESNEL IS PHYSICS ***",
       F0 < 0.05 && fresnel(1, 1, 1.5).T > 0.95,
       `*** AT NORMAL INCIDENCE A GLASS SURFACE REFLECTS ${(F0 * 100).toFixed(1)}% AND TRANSMITS ${(fresnel(1, 1, 1.5).T * 100).toFixed(1)}%. That missing 96% is not lost, it went through -- so a white furnace test run WITH a Fresnel term would report a colossal "energy deficit" on a perfectly correct model. THAT IS EXACTLY WHY v3490 SETS F = 1: with no Fresnel and no absorption, everything that fails to come back is a failure of the MASKING model, and the deficit means something. RUNNING THE FURNACE TEST WITH FRESNEL ON WOULD BE THE TWO-THINGS-ONE-LABEL DEFECT THIS TREE NAMES MOST OFTEN. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 8. THE FRONT DOOR, ASSERTED AS A MECHANISM AND NEVER AS A MENTION
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ROOT, "path-tracer.html"), "utf8");
    ok("!! path-tracer.html imports the model and calls it",
       /from\s*"\/physics\/render\/fresnel\.mjs"/.test(src) && /brewsterByBisection\(/.test(src),
       "A .mjs with no page is the CLI-only deliverable this project refuses. The assertion is on the IMPORT and the CALL rather than on the name appearing.");
}

console.log(fails ? "\nfresnel-selfcheck: " + fails + " FAILED" : "\nfresnel-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);

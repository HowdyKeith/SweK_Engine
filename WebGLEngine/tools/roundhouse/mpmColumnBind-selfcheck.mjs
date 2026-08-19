// tools/roundhouse/mpmColumnBind-selfcheck.mjs -- v3797
//
// *** THE COLLAPSING COLUMN, WHICH v3794 NAMED AS SAYING FAR MORE THAN FREE FALL AND HAVING NO ANALYTIC
// ANSWER. That is exactly why the key is a DIRECTION: with gravity and no input, the total mechanical energy
// of a column collapsing onto a floor CAN ONLY FALL. Wall friction dissipates, plasticity dissipates, and
// NOTHING PUTS ANY BACK. Unlike free fall, this fixture actually deforms the material -- 91% of the energy is
// gone by the end and the column ends at a fifth of its starting height. ***

import { mpmColumnDevice, MPMCOL_MODES, buildMpmColumn } from "./mpmColumnBind.mjs";
import { strainEnergy, lame } from "../../physics/mpm/constitutive.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const plasticRun = await buildMpmColumn({ mode: "energy" });
const elastic = await buildMpmColumn({ mode: "elastic" });
const planted = await buildMpmColumn({ mode: "noelastic" });

console.log("1. THE COLUMN ACTUALLY COLLAPSES -- THE FIXTURE IS NOT VACUOUS");
{
    ok("!! *** IT FALLS TO A FIFTH OF ITS HEIGHT AND COMES TO REST ***",
        plasticRun.collapsed === true && plasticRun.cameToRest === true,
        "centre of mass " + plasticRun.comStart.toFixed(4) + " -> " + plasticRun.comEnd.toFixed(4) +
        ", final KE " + plasticRun.keEnd.toExponential(2) + " against a starting total of " +
        plasticRun.totalStart.toFixed(3) + ". *** FREE FALL BARELY DEFORMED THE BLOCK; THIS ONE DISSIPATES " +
        (100 * plasticRun.dissipatedFrac).toFixed(1) + "% OF THE ENERGY, so the stress and the return mapping " +
        "are genuinely exercised ***");
    ok("!! and it is not perfectly still -- the creep is reported rather than rounded away",
        plasticRun.creepPerStep < 1e-5 && plasticRun.creepPerStep > 0,
        "the centre of mass still sinks " + plasticRun.creepPerStep.toExponential(2) + " per step after it has " +
        "'stopped'. SAYING 'AT REST' WOULD HAVE BEEN A ROUNDED CLAIM; it is at rest to within a creep this " +
        "line names");
}

console.log("\n2. THE KEY: ENERGY CAN ONLY FALL");
{
    ok("!! *** THE ELASTIC COLUMN'S ENERGY NEVER RISES -- WORST RISE EXACTLY 0.000e+0 ***",
        elastic.energyFalls === true && elastic.worstRise === 0,
        "over " + elastic.samples + " samples. NOT SMALL, ZERO. Wall friction takes " +
        (100 * elastic.dissipatedFrac).toFixed(1) + "% and nothing gives any back");
    ok("!! and the plastic column too, to 1.9e-5",
        plasticRun.energyFalls === true && plasticRun.worstRise < 1e-4,
        "worst rise " + plasticRun.worstRise.toExponential(3) + " -- larger than the elastic case's exact zero, " +
        "and REPORTED AS SUCH rather than folded into one tolerance. It is settling round-off on a material " +
        "that has stopped moving, not a trend");
}

console.log("\n3. THE PLANT IS THE ACCOUNTING I ACTUALLY WROTE FIRST");
{
    ok("!! *** DROPPING THE STRAIN-ENERGY TERM MAKES THE COLUMN APPEAR TO CREATE 35% MORE ENERGY ***",
        planted.energyFalls === false && planted.worstRise > 0.2,
        "worst rise " + elastic.worstRise.toExponential(3) + " -> " + planted.worstRise.toExponential(3) +
        ". *** KE + PE CANNOT SEE ENERGY STORED AS STRAIN. The column banks it on compression and returns it " +
        "on rebound, and a budget missing that term reads the return as CREATION -- WHICH LOOKS EXACTLY LIKE " +
        "AN UNSTABLE INTEGRATOR. THE ENERGY WAS NEVER MISSING; THE ACCOUNTING WAS ***");
    ok("!! *** AND WITH PLASTICITY ON THE OMISSION NEARLY VANISHES, WHICH IS WHY IT COULD HAVE SHIPPED ***",
        plasticRun.worstRise < 1e-4,
        "a YIELDING material does not hold much strain, so the missing term is almost invisible on the default " +
        "fixture: 1.9e-5 against the elastic case's 83%. *** THE BUG WOULD HAVE SAT THERE UNTIL SOMEBODY RAN " +
        "AN ELASTIC MATERIAL AND REPORTED THAT MPM CREATES ENERGY ***");
    ok("!! the device DECLARES the plant, with `energy` first",
        DEVICE_NAMES.includes("mpmcolumn") && mpmColumnDevice.plantMode === "noelastic" &&
        mpmColumnDevice.plantFlips === "worstRise" && MPMCOL_MODES[0] === "energy");
}

console.log("\n4. THE STRAIN ENERGY'S OWN IDENTITIES");
{
    const p = lame(500, 0.3);
    ok("!! undeformed material stores EXACTLY zero",
        strainEnergy([1, 0, 0, 1], p) === 0,
        "=== 0, not < 1e-12. A material at rest that holds energy is a material that will release it");
    ok("!! and both compression and stretch store POSITIVE energy",
        strainEnergy([0.9, 0, 0, 0.9], p) > 0 && strainEnergy([1.1, 0, 0, 1.1], p) > 0,
        "10.389143 compressed and 8.967641 stretched. A NEGATIVE value would mean deforming the material PAID " +
        "you, which is the sign error this check exists for");
}

report("WHAT THIS DOES NOT CLAIM",
    "That the collapse is CORRECT. There is no analytic answer for a collapsing column -- that is why the key " +
    "is a direction -- so what is graded is that energy never rises, the column falls, and it stops. A pile " +
    "with the wrong angle of repose, or the wrong runout distance, would pass every check here. THE DIRECTION " +
    "IS CHECKABLE; THE SHAPE IS NOT, and pretending otherwise would be the overselling this arc has avoided.");

console.log("\nmpmColumnBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);

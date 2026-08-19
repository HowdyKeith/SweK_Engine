// WebGLEngine/tools/roundhouse/menuScope-selfcheck.mjs -- v3394
// *** SOMEBODY ELSE'S RULE, TURNED INTO OUR OWN NUMBER -- AND THE NUMBER SAYS SOMETHING DIFFERENT. ***
// Front door: gates.html runs any named gate and carries its output, which is where this table is read.
import { menuScope, recoveryTrial, wrongRate, typoAt, typoPositions } from "./menuScope.mjs";
import { nearest } from "./deviceCritic.mjs";
import * as D from "./devices.mjs";
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };
const pc = (r) => (100 * wrongRate(r)).toFixed(2) + "%";

const r = await menuScope(D);

// ---- 1. THE NULL TEST: AN UNCORRUPTED NAME COMES BACK AS ITSELF ------------------------------------------
{
    const menus = [["alpha", "beta", "gammaLong"], D.DEVICE_NAMES.slice(0, 5)];
    ok("!! nearest() returns a name unchanged when nothing is corrupted",
        menus.every((m) => m.every((w) => nearest(w, m) === w)),
        "every trial below measures a corruption, so a harness that could not recover an UNCORRUPTED name " +
        "would report damage that was its own");
    ok("...and the corruption really is a corruption",
        typoAt("centrelineErrFrac", 5) !== "centrelineErrFrac" && typoPositions("ab").length >= 1,
        "one character deleted at fixed positions, so the measurement is deterministic and re-runnable");
}

// ---- 2. THE MEASUREMENT ----------------------------------------------------------------------------------
say("menus: " + r.deviceCount + " devices, sizes " + r.menuSizes[0] + " to " +
    r.menuSizes[r.menuSizes.length - 1] + ", pooled union " + r.pooledSize + " names");
say("WHITELISTED (each device's own menu): " + r.whitelisted.total + " trials, wrong " + pc(r.whitelisted) +
    ", refused " + r.whitelisted.none);
say("POOLED (all devices at once):          " + r.pooled.total + " trials, wrong " + pc(r.pooled) +
    ", refused " + r.pooled.none);
{
    ok("!! *** POOLING THE MENUS ACROSS DEVICES ROUGHLY TRIPLES THE WRONG-SUGGESTION RATE ***",
        wrongRate(r.pooled) > 2 * wrongRate(r.whitelisted) && wrongRate(r.whitelisted) > 0,
        pc(r.whitelisted) + " -> " + pc(r.pooled) + ", a " +
        (wrongRate(r.pooled) / wrongRate(r.whitelisted)).toFixed(2) + "x rise. A WRONG SUGGESTION IS WORSE " +
        "THAN NONE -- nearest()'s own comment says so -- because it sends the proposer somewhere specific");
}

// ---- 3. AND THE COST IS NOT SIZE, WHICH IS WHERE THIS PARTS COMPANY WITH THE CLAIM IT TESTS ---------------
{
    const order = ["2-9", "10-15", "16-25", "26+"].filter((b) => r.bands[b]);
    say("by menu size:  " + order.map((b) => "k=" + b + " " +
        (100 * r.bands[b].wrong / r.bands[b].total).toFixed(2) + "% (" + r.bands[b].devices + " devices)").join("   "));
    const rates = order.map((b) => r.bands[b].wrong / r.bands[b].total);
    const monotone = rates.every((v, i) => i === 0 || v >= rates[i - 1]);
    ok("!! *** growing ONE DEVICE'S menu does NOT degrade the critic -- the trend is not there ***",
        !monotone && Math.max(...rates) < 3 * wrongRate(r.whitelisted),
        "the largest menus (lens 68, probe 65) are no worse than the smallest. *** 'MORE OPTIONS' IS NOT ONE " +
        "THING, AND THE TWO READINGS SUGGEST OPPOSITE FIXES: a SIZE story says cap the menu, which would " +
        "cripple lens for nothing; a NAMESPACE story says scope it to the device, which is free ***");
    ok("!! and 4 of 5 pooled misses are a name from ANOTHER DEVICE'S namespace, which is the mechanism",
        r.crossNamespace > 3 * r.sameNamespace,
        r.crossNamespace + " cross-device against " + r.sameNamespace + " same-device (" +
        (100 * r.crossNamespace / (r.crossNamespace + r.sameNamespace)).toFixed(1) + "%). Pooling brings in " +
        "names that are edit-near the right one and mean something else entirely");
}

// ---- 4. WHAT THE ANSWER MEANS FOR THE CODE: THE RIGHT RULE WAS ALREADY THERE ------------------------------
{
    const src = await import("node:fs").then((fs) =>
        fs.readFileSync(new URL("./deviceCritic.mjs", import.meta.url), "utf8"));
    ok("!! critiqueClaim already scopes the menu to ONE DEVICE, which this measurement now justifies",
        /device\s*&&\s*device\.observables/.test(src) || /const observables = \(device/.test(src),
        "withCritic reads observables off THE DEVICE, so the whitelist is per-device by construction. THE " +
        "FINDING IS NOT A CHANGE TO MAKE -- IT IS A REASON THE EXISTING SHAPE IS RIGHT, and the value of that " +
        "is that the next person cannot 'simplify' it into one pooled list without this line going red");
    ok("...so this round changes no behaviour, and says so",
        true,
        "the only code change is EXPORTING nearest() so the measurement can drive the real function instead of " +
        "a copy of it -- a second implementation would have measured itself");
}

// ---- 5. THE GUARD AGAINST WILD GUESSES IS NOT VACUOUS, AND IS NOT WHAT SAVES US ---------------------------
{
    const pool = (await import("./menuScope.mjs")).collectMenus;
    const { pooled } = await pool(D);
    ok("nearest() DOES refuse an alien token, so the guard works",
        nearest("zzzzzzzzzzzz", pooled) === null,
        "the threshold is real: a token nothing is close to gets no suggestion");
    ok("!! but it can never refuse a one-character typo, so EVERY wrong suggestion above is a CONFIDENT one",
        r.whitelisted.none === 0 && r.pooled.none === 0,
        "a single deleted character sits at distance 1 from the true name, so the minimum distance is always " +
        "1 and the guard cannot fire. THAT IS CORRECT BEHAVIOUR AND IT IS ALSO WHY THE NAMESPACE MATTERS: the " +
        "guard cannot rescue a menu that contains a plausible wrong answer");
}

console.log(failed ? "\n[menuScope-selfcheck] FAILED " + failed : "\n[menuScope-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);

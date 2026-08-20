// WebGLEngine/tools/roundhouse/capabilityCard-selfcheck.mjs -- v3395
// *** THE CARD'S VALUE IS THAT EVERY FIELD IS DERIVED AND THE ABSENCES ARE FIRST-CLASS. BOTH ARE ASSERTED HERE,
// BECAUSE A CARD IS EXACTLY THE KIND OF FILE SOMEBODY LATER "TIDIES" INTO A TYPED LIST. ***
import { capabilityCard, cardFor, readVersion, NOT_CLAIMED } from "./capabilityCard.mjs";
import { INSTRUMENTS } from "../../physics/instruments.mjs";
import { codeHas } from "../ship/sourceScan.mjs";
import * as D from "./devices.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

const card = await capabilityCard(ENG, D);
const c = card.counts;
say(card.engine + ": " + c.devices + " devices, " + c.withInstrument + " with an instrument, " +
    c.withStatedKey + " stating a key, " + c.keyUnknown + " unknown, " + c.withPage + " with a page, " +
    c.plantDeclared + " declaring a plant");

// ---- 1. EVERY ROW IS DERIVED, NOT TYPED ------------------------------------------------------------------
{
    ok("!! the card covers EVERY registered device, so a new one cannot be missing from it",
        card.devices.length === D.DEVICE_NAMES.length &&
        D.DEVICE_NAMES.every((n) => card.devices.some((d) => d.device === n)),
        c.devices + " rows for " + D.DEVICE_NAMES.length + " registered. A hand-maintained card would drift " +
        "the first time somebody added a device and forgot -- which this tree has watched happen to a registry " +
        "count, an instrument list and a gate census");
    ok("!! the engine version is READ from main.js, not stamped by hand",
        card.engine === readVersion(ENG) && /^v\d+$/.test(card.engine || ""),
        card.engine + ". A card carrying a typed version is the first thing to go stale, and it would go stale " +
        "invisibly because nothing else reads it");
    const inst = card.devices.filter((d) => d.instrument);
    ok("...and every instrument link matches the instrument index's own `device` field",
        inst.every((d) => INSTRUMENTS.some((i) => i.id === d.instrument && i.device === d.device)),
        inst.length + " links, each traced back to physics/instruments.mjs rather than inferred from the name -- " +
        "v3330's substring match is why (`lbm-fluid` does not contain `lbm` the way a scan expects)");
}

// ---- 2. UNKNOWN IS NOT THE SAME AS ABSENT ----------------------------------------------------------------
{
    const unlinked = card.devices.filter((d) => !d.instrument);
    ok("!! *** a device with no instrument reads statedKey NULL, never false ***",
        unlinked.length > 0 && unlinked.every((d) => d.statedKey === null),
        unlinked.length + " unlinked devices. \"nobody has linked this device\" and \"the instrument says it has " +
        "no key\" are DIFFERENT FACTS, and false would collapse them into the more damning one. v3334's rule in " +
        "a new place: UNKNOWN IS NOT SATISFIED, and it is not refused either");
    ok("...and the count is reported separately rather than folded into the total",
        c.keyUnknown === unlinked.length && c.withStatedKey + c.keyUnknown <= c.devices,
        c.withStatedKey + " stating a key and " + c.keyUnknown + " unknown are two numbers, printed as two");
}

// ---- 3. THE ABSENCES ARE PART OF THE CARD, AND THEY ARE ACTUALLY ABSENT -----------------------------------
{
    ok("!! *** the card carries a notClaimed list, and every entry states WHY ***",
        NOT_CLAIMED.length >= 3 && NOT_CLAIMED.every((n) => n.field && n.why && n.why.length > 40),
        NOT_CLAIMED.map((n) => n.field).join(", ") + ". A CARD THAT LISTS ONLY WHAT IT KNOWS READS AS A CARD " +
        "THAT KNOWS EVERYTHING -- this list is the part most likely to be deleted by somebody tidying, and " +
        "deleting it changes what the card means");
    const claimed = new Set(Object.keys(card.devices[0] || {}));
    const absent = NOT_CLAIMED.filter((n) => !claimed.has(n.field));
    ok("!! and each named absence is GENUINELY ABSENT from every row, not merely documented",
        absent.length === NOT_CLAIMED.length,
        "a field listed as not-claimed while quietly present would be the worst outcome here: a reader would " +
        "trust it MORE for having seen the caveat. Checked against the row's actual keys");
    ok("...the detectionFloor refusal is the load-bearing one and its reason is specific",
        /RADIUS/.test(NOT_CLAIMED.find((n) => n.field === "detectionFloor").why),
        "only clocks has a floor measured and it is a RADIUS rather than an epsilon, so one numeric column " +
        "would force every other device to look like it had a floor of zero");
}

// ---- 4. THIS IS NOT AN MCP IMPLEMENTATION, AND THAT IS A DECISION ----------------------------------------
{
    const src = fs.readFileSync(new URL("./capabilityCard.mjs", import.meta.url), "utf8");
    ok("!! *** the card publishes DATA and implements no wire protocol ***",
        !codeHas(src, /jsonrpc|express|createServer|WebSocket|listen\(/i),
        "putting a second transport with its own auth on the trusted path is the reasoning that kept copyparty " +
        "and A2A off it. If something later wants to speak MCP to this, that is a SHIM OVER THIS, not an " +
        "architecture -- and matched through codeOnly() so the COMMENT saying so cannot satisfy the check");
    ok("...and it changes nothing, which is what makes it a REPORTING tool rather than a gate",
        !codeHas(src, /writeFileSync|mkdirSync|unlinkSync|process\.exit\(1\)/),
        "a report prints and exits zero; a gate that fails exits nonzero. v3327 conflated them and the " +
        "front-door gate correctly refused");
}

// ---- 5. THE PLANT COLUMN IS THE ONE NOBODY ELSE CAN PUBLISH, AND IT IS HONEST ABOUT ITS KIND --------------
{
    const planted = card.devices.filter((d) => d.plantDeclared);
    ok("!! *** the plant column is called plantDeclared, because THE NAME HAS TO CARRY THE CAVEAT ***",
        planted.length >= 17 && !("planted" in card.devices[0]) && planted.every((d) => d.plantKind),
        planted.length + " declaring a plant. Proving a knob MOVES something is plantedCoverage's verified " +
        "census and it takes 91 SECONDS -- MEASURED, which is a sweep rather than a report. A field called " +
        "`planted` would have been read as verified; this one cannot be");
    ok("...and the verified census is named as a COMMAND rather than pretended at, and that command exists",
        /plantedCoverage-selfcheck\.mjs/.test(card.plantedVerifiedBy) &&
        fs.existsSync(path.join(ENG, "tools", "roundhouse", "plantedCoverage-selfcheck.mjs")),
        card.plantedVerifiedBy + ". NAME THE ABSENCE AND LET THE CALLER DECIDE -- aval's rule, turbo-fieldfare's " +
        "rule, and now this card's. A caller who needs the run knows exactly what to run");
    // v3400 -- *** THIS CHECK HAD THE OWED WORK ENCODED AS ITS EXPECTATION, AND DOING THE WORK TURNED IT RED. ***
    // It demanded that SOME row read `undeclared`, which was true while sixteen binds had not been read and
    // became false the moment they were -- "a state that progress was meant to change", the species this tree
    // names in its own failure list. The property it always meant is that the card publishes the kind AS
    // DECLARED and never guesses one, so that is what it asserts now, and the absence of `undeclared` is the
    // evidence the work was finished rather than a regression.
    const kinds = new Set(planted.map((d) => d.plantKind));
    ok("!! the card publishes the DECLARED kind and no row is left guessing",
        !kinds.has("undeclared") && kinds.has("reader") && kinds.has("knob") && kinds.has("method"),
        [...kinds].join(", ") + ". Reading the sixteen found a THIRD kind the binary had no name for -- seismic's " +
        "plant reparametrises a correct integral, so the physics and the reading are both right and the " +
        "EVALUATION is wrong. Assuming `knob` by default would have been wrong about three of seventeen");
    // and the row shape is stable, because a caller reads it
    const shape = Object.keys(cardFor("x", { name: "n", modes: ["a"], observables: ["o"] }, { instrument: null, plant: null }));
    ok("the row shape is produced by ONE function, so the report and the card cannot diverge",
        shape.includes("device") && shape.includes("plantKind") && shape.includes("statedKey") && shape.includes("plantDeclared"),
        shape.join(", ") + " -- the main block prints the same rows the card returns");
}

console.log(failed ? "\n[capabilityCard-selfcheck] FAILED " + failed : "\n[capabilityCard-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);

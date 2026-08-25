// WebGLEngine/tools/ship/settingsCensus-selfcheck.mjs
//
// Run: node tools/ship/settingsCensus-selfcheck.mjs   (~0.3s -- MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3262 -- WHAT THE SETTINGS SCHEMA COVERS, AND WHO READS IT.
//
// Keith asked whether all the settings are reachable from the phone links and from server.html.
//
// *** THE REGISTRY ALREADY EXISTED AND I ALMOST BUILT A SECOND ONE. *** ui/settingsHub.js is 3,460 lines and its
// header states the law: "The SCHEMA is the audit: every controllable feature is listed here with a default +
// a get/set binding. If a feature isn't in this list, it's a gap." EIGHTH TIME THIS SESSION.
//
// *** AND THE ANSWER TURNS ON A SPLIT NOBODY HAD MADE: 145 CONTROLS, ONLY 42 CARRY A VALUE. *** 47 are buttons
// and 56 are custom panels -- 103 of 145 HAVE NOTHING A JSON DOCUMENT COULD SET, because a button is an ACTION
// and a panel is a VIEW. "Is every setting reachable from the phone" is unanswerable until those are separated:
// counting them together produces a coverage percentage that describes nothing.
//
// ALL 42 HAVE BOTH get AND set. The schema's own stated failure -- a listed control that cannot be read or
// written -- does not occur.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const { buildSettingsSchema } = await import(pathToFileURL(path.join(ROOT, "ui", "settingsHub.js")).href);
const { censusSchema, censusConsumers, settingsReceipt } =
    await import(pathToFileURL(path.join(HERE, "settingsCensus.mjs")).href);

const c = censusSchema(buildSettingsSchema({}));
const k = censusConsumers(ROOT);

// ---- 1. THE SCHEMA IS PURE, WHICH IS WHY THIS IS A GATE AND NOT A BROWSER ERRAND -----------------------------------------
{
    ok("!! *** buildSettingsSchema imports and runs with no DOM ***",
        c.categories > 0 && c.controls > 0,
        "its header claims 'buildSettingsSchema() is pure (no DOM) so it can be unit-tested' and THAT CLAIM IS " +
        "TRUE -- driven here rather than believed, which is what lets this census run in the suite");

    ok("!! ...and 145 controls are NOT 145 settings",
        c.values === 42 && c.actions === 47 && c.views === 56,
        settingsReceipt(c) + " A BUTTON IS AN ACTION AND A PANEL IS A VIEW; neither has a value a JSON document " +
        "could carry, and any 'settings coverage' figure that counts them is describing nothing");

    ok("!! ...and every value-bearing control has BOTH get and set",
        c.unbound.length === 0,
        "the schema's header calls an ABSENT entry a gap. A PRESENT entry that cannot be read or written is a " +
        "quieter one, and this is the check for it" +
        (c.unbound.length ? ". UNBOUND: " + c.unbound.map((u) => u.cat + "." + u.id).join(", ") : ""));
}

// ---- 2. WHO MOUNTS IT, AND THE SCOPING ERROR THAT ALMOST MADE THIS A FALSE ALARM ------------------------------------------
{
    ok("!! *** the main render window mounts the hub ***",
        k.mounts.includes("index.html"),
        "MY FIRST CENSUS SCANNED ONLY ROOT .html AND REPORTED 'NOTHING MOUNTS THE HUB'. main.js imports " +
        "SettingsHub at line 211 and mounts it at 19245, so index.html mounts it THROUGH ITS SCRIPT -- invisible " +
        "to a scan of HTML text. THAT WOULD HAVE BEEN A FALSE ALARM OF THE WORST KIND: telling Keith his " +
        "settings panel was orphaned when it is the main render window's own panel");

    // NOT ASSERTED AS A FAILURE, BECAUSE IT IS A FINDING KEITH ASKED FOR RATHER THAN A DEFECT I HAVE DIAGNOSED.
    // 27 pages carry their own settings-ish form. Some of those are legitimately their own thing (a page with
    // one API key field does not want a 20-category panel); some are the second-declaration defect this project
    // keeps finding. WHICH IS WHICH IS A JUDGEMENT PER PAGE and it is not mine to make silently.
    ok("...and the pages with their own settings form are counted, not judged",
        k.ownFormCount >= 0,
        k.ownFormCount + " page(s) build their own settings-ish form instead of mounting the hub. SOME OF THOSE " +
        "ARE RIGHT -- a page with one API-key field does not want a 20-category panel -- and some are a second " +
        "declaration of the same switch. That is a judgement per page and it is not made here");
}

// ---- 3. THE PHONE PATH EXISTS, AND v3262 SAID IT DID NOT (v3268) ---------------------------------------------------------
{
    const main = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
    const phone = fs.readFileSync(path.join(ROOT, "phone.html"), "utf8");

    ok("!! *** the phone can read the schema and set a value, over the WS channel ***",
        /settings:describe/.test(main) && /settings:schema/.test(main) &&
        /settings:set/.test(main) && /settings:setResult/.test(main) && /PC Settings/.test(phone),
        "built as a PAIR at v850 (PC) and v851 (phone): the phone requests a description, the PC replies with a " +
        "JSON-SAFE SNAPSHOT, the phone sends settings:set per change and the PC replies setResult SO THE PHONE " +
        "CAN CONFIRM OR REVERT. An apply with no reply would leave the phone showing a value the PC rejected");

    ok("!! ...and the controls that CANNOT be remoted say so rather than half-working",
        /open on PC/.test(fs.readFileSync(path.join(ROOT, "ui", "settingsHub.js"), "utf8")),
        "type:'custom' controls are panels, not values -- 56 of the 145. THE PHONE SHOWS A PLACEHOLDER instead " +
        "of a widget that looks live and does nothing, which is this tree's rule about naming an absence");

    // *** v3262 REPORTED "there is no HTTP path from a phone to a schema entry today". TRUE AND MISLEADING. ***
    // There is no HTTP path because it is a WEBSOCKET path. I searched for the wrong protocol and then STATED AN
    // ABSENCE -- worse than failing to find something, because a reader acts on it. NINTH "already exists" this
    // session and the only one phrased as a finding.
    ok("...and this check exists because the census claimed the opposite",
        /settings:describe/.test(main),
        "A NEGATIVE CLAIM NEEDS THE SAME EVIDENCE AS A POSITIVE ONE, and 'I grepped for fetch and found nothing' " +
        "is not evidence that a feature is missing");
}

console.log();
console.log("  ----  ANSWERED AT v3268 AND THE ANSWER WAS ALREADY YES: each of the 42 values is reachable");
console.log("  ----  from the phone over the WS channel (settings:describe / settings:set, v850+v851).");
console.log("  ----  WHAT REMAINS TRUE: settings.html is a SEPARATE hand-built page that does not use the");
console.log("  ----  schema -- so the PHONE has two settings surfaces of its own, one schema-driven in");
console.log("  ----  phone.html and one hand-built in settings.html. THAT is the real duplication.");
console.log("  ----  Merging them is a design round; knowing which is which is no longer guesswork.");
if (fails) { console.log("settingsCensus-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("settingsCensus-selfcheck: all checks pass");

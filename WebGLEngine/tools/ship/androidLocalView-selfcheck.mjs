// WebGLEngine/tools/ship/androidLocalView-selfcheck.mjs -- v3027
//
// Run: node tools/ship/androidLocalView-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the Android peer's local run view.
//
// Keith asked whether an Android peer, while doing GPU brain work, can open the brain view and see ITS OWN data.
// IT COULD NOT, and the reason is structural: termux_peer.sh runs androidRunner.mjs and NEVER server.js. The
// phone has Node but NO HTTP SERVER, so every /ai/brain/* view belongs to the hub and shows the HUB's brain.
// The phone produced a JSON file it had no way to look at -- on a device where reading raw JSON means installing
// a text editor first.
//
// SELF-CONTAINED ON PURPOSE. The data is embedded; there is no fetch, no CDN, no server to reach. A view that
// tried to load anything would fail on the one device it exists for.
//
// AND IT REPORTS MEASUREMENTS, NOT A VERDICT. The phone MEASURES, the desktop GRADES -- that separation is why
// the device ledger is trustworthy at all (v2942, v2945). A local page showing PASS as a JUDGEMENT would let a
// device write its own grade, which is the one thing this whole arrangement exists to prevent.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const runner = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "androidRunner.mjs"), "utf8");
const sh = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "termux_peer.sh"), "utf8");
const body = runner.slice(runner.indexOf("function transcriptHtml"));
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE PREMISE, CHECKED RATHER THAN ASSUMED -----------------------------------------------------------
{
    ok("!! the phone runs the RUNNER, not the server", /androidRunner\.mjs/.test(sh) && !/server\.js/.test(sh),
       "this is why no /ai/brain view could ever show the phone's own data -- there is no HTTP server on the device to serve one");
    ok("...and the runner writes a transcript", /writeFileSync\(outFile/.test(runner));
}

// ---- 2. A VIEW IT CAN ACTUALLY OPEN ------------------------------------------------------------------------------
{
    ok("!! an HTML view is written beside the JSON", /outFile\.replace\(\/\\\.json\$\/i, ""\) \+ "\.html"/.test(runner),
       "same directory, same run -- a phone opens a file, it does not curl an endpoint");
    ok("!! it is SELF-CONTAINED: no fetch", !/fetch\(/.test(body),
       "there is no server on this device, so anything fetched would fail on the one machine the page is for");
    ok("...no CDN or external script", !/https?:\/\//.test(body.replace(/w3\.org/g, "")),
       "a phone mid-suite may have no network at all, and a blank page would look like a failed run");
    ok("...and the data is embedded, not loaded", /t\.checks \|\| \[\]/.test(body),
       "the transcript object is rendered directly into the markup");
    ok("writing the view cannot break the run", /try \{ fs\.writeFileSync\(outFile\.replace/.test(runner),
       "the JSON is the artefact that matters; a view that threw would cost a fifteen-minute suite");
}

// ---- 3. IT MEASURES. IT DOES NOT GRADE. ------------------------------------------------------------------------------
{
    ok("!! the page says the verdict is NOT decided here", /verdict is not decided here/.test(body),
       "the phone measures and the hub grades -- a device that could write its own result would make the whole ledger worthless");
    ok("...and names WHERE it is decided", /the hub grades this transcript against the reference/.test(body));
    ok("...and says why that separation exists", /a device cannot write its own result/.test(body),
       "stated as the reason rather than left as an arbitrary rule someone might optimise away");
    ok("counts are labelled as observations", /passed &middot; /.test(body) && /failed/.test(body));
}

// ---- 4. A TIMEOUT IS NOT A FAILURE, and the page says so ---------------------------------------------------------------
{
    ok("!! timeout is distinguished from fail in colour", /r\.status === "timeout" \? "#e6c877"/.test(body),
       "amber, not red -- they are different events");
    ok("!! ...and in words", /a TIMEOUT is not a failure/.test(body),
       "on a phone a timeout is usually the phone, not the physics -- the same rule the fleet metrics carry, where timeouts stay out of the agreement denominator");
    ok("every status gets a colour, including error", /r\.status === "fail"/.test(body) && /"#9fb8ab"/.test(body));
}

// ---- 5. it escapes what it renders -----------------------------------------------------------------------------------
{
    ok("!! check names are escaped", /const esc = /.test(body) && /esc\(r\.name\)/.test(body),
       "a check name is generated text rendered into a page, and this one is written on a device the hub does not control");
    ok("...and the host fields too", /esc\(t\.host && t\.host\.model/.test(body));
}

console.log(fails ? "\nandroidLocalView-selfcheck: " + fails + " FAILED" : "\nandroidLocalView-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);

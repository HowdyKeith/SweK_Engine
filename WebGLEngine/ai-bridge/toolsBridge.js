// FILE: ai-bridge/toolsBridge.js
//
// v3220 -- A FRONT DOOR FOR THE ANALYSIS TOOLS.
//
// v3219 found EIGHT tools that printed nothing and exited 0, gave five of them a main block, and said plainly
// that a main block is only the CLI half of the law: the standing preference is a PAGE, or a route with an HTML
// front end. This is that route.
//
// *** IT SPAWNS THROUGH gatesBridge.runGate RATHER THAN WRITING A SECOND SPAWNER. *** That function already
// carries four things a fresh one would have had to rediscover, badly: the live-child counter the auto-updater
// consults before restarting the server mid-run (v3075), the timedOut flag kept APART from a failure (v3076),
// the budget travelling with the result so "timed out" can be judged (v3212), and a bounded stdout. A second
// implementation of "spawn a named file and report what happened" would drift from all four in silence.
//
// *** ONLY A REGISTERED TOOL MAY RUN. NOT A PATH, NOT A PATTERN, NOT ANYTHING THE PAGE COMPOSED. *** The name
// must be an EXACT MEMBER of tools/ship/reportingTools.mjs -- the same list the gate checks -- so the route
// cannot be talked into executing a file somebody named in a query string. gatesBridge made exactly this
// refusal for selfchecks and the reasoning transfers without change.
"use strict";
const path = require("path");
const gates = require("./gatesBridge.js");

const PREFIX = "/tools";
const ENGINE = path.resolve(__dirname, "..");

// v3244 -- *** THIS CLAIMED A NAMESPACE AND SWALLOWED A REAL FILE FOR SEVEN ROUNDS. ***
//
// owns() returned true for ANYTHING under /tools/, so when server.html (v3227) imported
// ./tools/ship/pageSections.mjs, this bridge intercepted the request, failed to match a route, and answered
// 404 unknown-route. A FAILED IMPORT KILLS THE WHOLE <script type="module">, so every feature in that script
// went inert on the rig: the page drawers never filled, the chip groups never grouped, the profile filter never
// filtered, the front-door menu never populated.
//
// AND THE PAGE LOOKED FINE. Arriving still showed all 96 links, because the mover that empties it lives in the
// script that never ran -- so the symptom of "the drawers do nothing" was indistinguishable from "the drawers
// were never built". ONE CONSOLE LINE WAS THE ONLY EVIDENCE, and Keith found it on the rig.
//
// *** A BRIDGE OWNS ITS ROUTES, NOT A NAMESPACE. *** /tools/list and /tools/run are routes this serves;
// /tools/ship/pageSections.mjs is a FILE on disk that the static handler serves perfectly well. Claiming the
// prefix meant claiming a directory that already existed -- and tools/ is the tree's biggest directory.
//
// The routes are listed rather than pattern-matched: a new route is a deliberate line here, and anything else
// under /tools/ falls through to the static handler where it belongs.
const ROUTES = ["/tools", "/tools/", "/tools/list", "/tools/run"];
function owns(url) {
    if (typeof url !== "string") return false;
    const p = url.split("?")[0];
    return ROUTES.includes(p);
}

// The registry is an ES module and this bridge is CommonJS, so it is imported lazily on first use. THAT IS ALSO
// WHY IT IS NOT COPIED HERE: a require-shaped duplicate of the list would be the second copy the registry file
// exists to prevent, and it would be the one that went stale.
let _reg = null;
async function registry() {
    if (!_reg) _reg = await import("../tools/ship/reportingTools.mjs");
    return _reg;
}

async function handle(req, res, { sendJson }) {
    const url = new URL(req.url, "http://x");
    const route = url.pathname.slice(PREFIX.length) || "/";
    const reg = await registry();

    if (route === "/list" || route === "/") {
        // THE REFUSALS ARE LISTED BESIDE THE OFFERS, WITH THEIR REASONS. A page showing only what it can run
        // makes three deliberate decisions look like three things nobody got to, and the next person writes the
        // main block that three earlier rounds decided against.
        return sendJson({
            ok: true,
            tools: reg.REPORTING.map((t) => ({ rel: t.rel, label: t.label, blurb: t.blurb })),
            // v3233 -- ARTEFACT tools are offered separately because the PAGE has to treat them differently:
            // five megabytes rendered into a <pre> hangs the tab, and a truncated render is worse than none --
            // a corpus you cannot tell is truncated is the failure the tool exists to prevent.
            artefacts: (reg.ARTEFACT_TOOLS || []).map((t) => ({ rel: t.rel, label: t.label, blurb: t.blurb, artefact: t.artefact })),
            noFrontDoor: [...reg.NO_MAIN.entries()].map(([rel, why]) => ({ rel, why })),
        });
    }

    if (route === "/run") {
        const name = url.searchParams.get("name") || "";
        if (!reg.isReportingTool(name)) {
            return sendJson({ ok: false, error: "not-a-tool",
                              message: "Refused: only a registered reporting tool can be run, by exact name.",
                              name }, 400);
        }
        // A REPORT IS NOT A GATE, AND THE BUDGET SAYS SO. These walk the whole tree -- gradedCoverage builds
        // every device -- so they are slower than most checks and none of them is on the suite's measured tail.
        // 180s is generous for the slowest observed (gradedCoverage, ~90s) without letting a wedged tool hold
        // the server all afternoon.
        // *** THE FLAGS COME FROM THE REGISTRY, NEVER FROM THE QUERY STRING. *** A route that accepted args from
        // a caller would be an arbitrary command runner wearing a tool's name -- the same refusal gatesBridge
        // makes about filenames, one argument further out.
        const art = reg.artefactTool(name);
        const r = await gates.runGate(name, 180000, art ? art.args : undefined);
        return sendJson({ ok: true, ...r, artefact: art ? art.artefact : null });
    }

    return sendJson({ ok: false, error: "unknown-route", route }, 404);
}

module.exports = { owns, handle, PREFIX, ENGINE };

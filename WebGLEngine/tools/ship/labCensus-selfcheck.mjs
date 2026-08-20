// WebGLEngine/tools/ship/labCensus-selfcheck.mjs -- v3849
//
// The dashboard's only job is to AGGREGATE, so the thing to check is that it aggregates rather than computes:
// every row names the file that owns its number, and the numbers are that file's. The one row that is not a
// straight import is corroboration eligibility, and checking it is what found that nuisance knobs are declared
// in TWO places -- so that is the check with the sharpest teeth.
//
// Run: node tools/ship/labCensus-selfcheck.mjs

import fs from "node:fs";
import path from "node:path";
import { labCensus, censusLines, dispatcherPulse, readQueue, STALE_MS, ENG } from "./labCensus.mjs";
import { reconcile } from "./deviceInstrumentMap.mjs";
import { REFINEMENT_KNOBS } from "../roundhouse/refinementKnobs.mjs";
import { NUISANCE_KNOBS } from "../roundhouse/nuisanceKnobs.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (n, d) => console.log("  ----  " + n + "   " + d);

const C = labCensus();

console.log("1. IT AGGREGATES, IT DOES NOT COMPUTE");
{
    ok("!! every row names the file that owns its number", C.rows.every((r) => r.owner && r.what),
        C.rows.map((r) => r.id).join(", "));
    let allExist = true, missing = [];
    for (const r of C.rows) for (const f of r.owner.replace(/\{([^}]*)\}/g, (m, g) => g.split(",")[0]).split(/\s+/)) {
        // owners may be written as a brace set; the first member is checked, which is enough to catch a rename
        const p = path.join(ENG, f.replace(/\{.*\}/, ""));
        if (f.endsWith(".mjs") && !fs.existsSync(p)) { allExist = false; missing.push(f); }
    }
    ok("!! ...and that file EXISTS, so a rename cannot leave a row quoting a ghost", allExist, missing.join(", ") || "all owners resolve");
    ok("...and no row claims more than its total", C.rows.every((r) => !Number.isFinite(r.total) || r.total === 0 || r.have <= r.total),
        C.rows.map((r) => r.id + " " + r.have + "/" + r.total).join("  "));
    ok("...and censusLines reports without deciding", censusLines(C).length === C.rows.length);
}

console.log("\n2. *** THE ROW THAT FOUND A SECOND DECLARATION ***");
{
    const row = C.rows.find((r) => r.id === "corroboration");
    const registryOnly = Object.keys(REFINEMENT_KNOBS).filter((d) => d in NUISANCE_KNOBS).length;
    ok("!! *** ELIGIBILITY COUNTS BOTH PLACES A NUISANCE KNOB CAN LIVE ***", row.have > registryOnly,
        "the nuisanceKnobs.mjs registry alone gives " + registryOnly + "; counting corroborateFully.mjs's " +
        "NEW_NUISANCE as well gives " + row.have + ". *** quantum AND optics HAVE NUISANCE KNOBS THAT ARE NOT IN " +
        "THE REGISTRY, so every census reading the registry has been under-reporting the battery's reach -- and " +
        "the figure carried in the notes was a third number again ***");
    ok("...and it names WHICH devices are declared outside the registry", (row.outsideRegistry || []).length === 2,
        (row.outsideRegistry || []).join(", ") + " -- named, because 'the registry is incomplete' is not actionable " +
        "and 'quantum and optics are declared elsewhere' is");
    ok("...and the registry-only figure is kept beside it rather than replaced",
        Number.isFinite(row.registryOnly) && row.registryOnly === registryOnly,
        "both numbers survive: a reader can see the reach AND the gap in the registry");
    say("NOT FIXED HERE", "moving the two knobs into nuisanceKnobs.mjs would make the registry whole and is a " +
        "one-line edit -- and it belongs to corroborateFully's owner, not to a dashboard that noticed. Reported.");
}

console.log("\n3. THE INSTRUMENT ROW IS THE MAP'S OWN NUMBERS");
{
    const row = C.rows.find((r) => r.id === "instruments");
    const m = reconcile();
    ok("!! the row is reconcile()'s counts, not a second walk of the tree",
        row.have === m.linked && row.total === m.devices,
        row.have + " of " + row.total + " -- and `devices` and `linked` are COUNTS in that tool, which the first " +
        "version of this row assumed were arrays and printed 'undefined of undefined'");
    ok("!! ...and the UNEXPLAINED devices are carried by name", row.unexplained.length === m.unexplained.length && row.unexplained.length > 0,
        row.unexplained.join(", ") + " -- a carried red, surfaced rather than averaged into a percentage");
}

console.log("\n4. *** WHETHER THE DISPATCHER IS TICKING -- THE THING NOTHING SURFACED ***");
{
    const now = Date.UTC(2026, 7, 19, 12, 0, 0);
    const job = (at, peer) => ({ id: "j", createdAt: new Date(at).toISOString(), completedAt: null, config: peer ? { assignedPeer: peer, subject: "s" } : { subject: "s" } });
    ok("!! an empty queue reads NEVER, not healthy", dispatcherPulse({ jobs: {} }, { now }).state === "never",
        "no job has ever been enqueued -- the route exists and nothing has called it. *** A LOOP THAT STOPS HAS " +
        "NO SYMPTOM: the queue simply stops growing, and quiet and broken look identical from outside ***");
    ok("!! a queue whose newest job predates the window reads STALE",
        dispatcherPulse({ jobs: { a: job(now - STALE_MS - 60000, "p1") } }, { now }).state === "stale",
        "it ticked once and stopped, or has had nothing to hand out -- and those are different, which is why the " +
        "state is reported beside the AGE rather than instead of it");
    ok("!! and a fresh job reads RECENT", dispatcherPulse({ jobs: { a: job(now - 60000, "p1") } }, { now }).state === "recent");
    const mixed = dispatcherPulse({ jobs: { a: job(now - 1000, "p1"), b: job(now - 2000, null) } }, { now });
    ok("!! it separates jobs the DISPATCHER made from jobs added by hand", mixed.byDispatcher === 1 && mixed.total === 2,
        "v3848 stamps assignedPeer on every job it creates, so a queue full of jobs without one was filled by " +
        "POST /jobs/add and the dispatcher is not the thing that is running");
    ok("...and the tolerance is a number in the source", Number.isFinite(STALE_MS) && STALE_MS > 0,
        "STALE_MS = " + Math.round(STALE_MS / 60000) + " min. HOW OFTEN A FLEET SHOULD HAND OUT WORK IS A " +
        "JUDGEMENT, so it is arguable rather than mine, and the census never calls a state 'healthy'");
    ok("...and the live queue is read from the file the hub writes", typeof readQueue(ENG) === "object");
}

console.log("\n5. THE FRONT DOOR");
{
    const page = path.join(ENG, "lab-census.html");
    ok("!! the census has a page, since four tools and a read is the problem it exists to fix", fs.existsSync(page),
        "lab-census.html");
    const src = fs.existsSync(page) ? fs.readFileSync(page, "utf8") : "";
    // the page cannot IMPORT the aggregator -- labCensus reads the tree with node:fs -- so it fetches the route
    // that serves it. What is asserted is that the page carries no FIGURE of its own.
    ok("...that reaches the aggregator rather than restating any figure",
        /\/lab\/census/.test(src) && !/\b117\b|\b258\b|\b38 of\b/.test(src),
        "the page fetches GET /lab/census and prints what it returns. A NUMBER TYPED INTO THE PAGE would be the " +
        "next stale copy of exactly the kind this round exists because there were already three of");
    const bridge = fs.readFileSync(path.join(ENG, "ai-bridge", "fingerprintBridge.js"), "utf8");
    ok("...and the hub serves it", /url === "\/lab\/census"/.test(bridge) && /labCensus/.test(bridge));
    const server = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    ok("!! and the page is linked, so it is not born invisible", /lab-census\.html/.test(server),
        "server.html carries the anchor -- pageReach's rule, and the reason it is a rule");
}

console.log("\nlabCensus-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);

// WebGLEngine/tools/ship/labCensus.mjs -- v3849
// ---------------------------------------------------------------------------------------------------------------
// THE LAB'S COVERAGE, IN ONE PLACE, WITHOUT RE-DERIVING ANY OF IT.
//
// *** THE GAP THIS CLOSES IS NOT A MISSING MEASUREMENT -- IT IS THAT THE ANSWER TAKES FOUR RUNS AND A READ. ***
// gradedCoverage, plantedCoverage, corroborationCensus and deviceInstrumentMap each answer their own question
// correctly and each prints its own prose. Nobody could say "here is the lab's coverage" without running four
// tools and holding the four numbers in their head, so nobody did, and the numbers in the notes went stale.
//
// *** EVERY FIGURE HERE IS IMPORTED FROM THE TOOL THAT OWNS IT. *** This file computes no coverage of its own. A
// dashboard that re-derived a census would become a second answer to a question the tree already answers -- the
// failure this tree documents about itself more than any other -- and the two copies would disagree the first
// time one owner changed. Where a census is too slow to aggregate (plantedCoverage RUNS every device; the
// corroboration battery runs the full four criteria), THE CHEAP DECLARED FORM IS USED AND SAID TO BE THAT.
//
// *** AND A FIFTH THING NOTHING SURFACED AT ALL: WHETHER THE DISPATCHER IS TICKING. *** v3848 gave officeManager
// a body -- POST /office/dispatch posts assignments into the job queue. A loop that stops has no symptom: the
// queue simply stops growing, and "quiet" and "broken" look identical from outside. The queue's own timestamps
// answer it, so this reports the age of the newest job and NEVER calls it healthy: STALE_MS is a declared
// number, and the verdict says which side of it the number falls on rather than pronouncing on the fleet.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gradedCoverage } from "../roundhouse/gradedCoverage.mjs";
import { declaredCensus } from "../roundhouse/plantedCoverage.mjs";
import { REFINEMENT_KNOBS } from "../roundhouse/refinementKnobs.mjs";
import { NUISANCE_KNOBS } from "../roundhouse/nuisanceKnobs.mjs";
// *** AND THE SECOND PLACE NUISANCE KNOBS LIVE, WHICH IS WHY THIS ROW HAD TO BE MEASURED RATHER THAN QUOTED. ***
// corroborateFully.mjs declares NEW_NUISANCE for `quantum` and `optics`, and NEITHER IS IN THE REGISTRY. A census
// reading nuisanceKnobs.mjs alone reports 5 eligible; reading both reports 7; the figure carried in the notes was
// 6. Three numbers for one question, because the registry stopped being the only declaration and nothing said so.
import { NEW_NUISANCE } from "../roundhouse/corroborateFully.mjs";
import { DEVICE_NAMES } from "../roundhouse/devices.mjs";
import { queueSummary } from "../roundhouse/jobQueue.mjs";
import { reconcile } from "./deviceInstrumentMap.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** How old the newest job may be before the dispatcher is reported as not having ticked recently. A NUMBER IN
 *  THE SOURCE: an hour is a judgement about how often a fleet should be handing out work, and it is arguable. */
export const STALE_MS = 60 * 60 * 1000;

/**
 * WHETHER THE DISPATCHER IS TICKING, from the queue's own timestamps and nothing else.
 *
 * There is no heartbeat file and none is invented here -- a loop that writes "I am alive" can be alive and doing
 * nothing, which is the exact failure officeManager's STARVED escalation exists to catch. What proves a tick
 * HAPPENED is a job that exists. Three states, and the middle one is the one nobody could see before:
 *   never    no job has ever been enqueued -- the route exists and nothing has called it
 *   stale    the newest job predates STALE_MS -- it ticked once and stopped, or has nothing to hand out
 *   recent   a job was enqueued inside the window
 */
export function dispatcherPulse(queue, { now = Date.now() } = {}) {
    const jobs = Object.values((queue && queue.jobs) || {});
    const stamps = jobs.map((j) => Date.parse(j.createdAt)).filter((n) => Number.isFinite(n));
    const newest = stamps.length ? Math.max(...stamps) : null;
    const ageMs = newest === null ? null : now - newest;
    const state = newest === null ? "never" : (ageMs > STALE_MS ? "stale" : "recent");
    return {
        state, ageMs, newestAt: newest === null ? null : new Date(newest).toISOString(),
        summary: queueSummary(queue || { jobs: {} }, { now }),
        // The dispatcher's OWN fingerprint in the queue: v3848 records the intended peer on every job it makes,
        // so a queue full of jobs with no assignedPeer was filled by something else (POST /jobs/add by hand).
        byDispatcher: jobs.filter((j) => j.config && j.config.assignedPeer).length, total: jobs.length,
    };
}

/** Read the queue the hub actually writes. Absent file is a legitimate state ("never"), not an error. */
export function readQueue(engRoot = ENG) {
    try { return JSON.parse(fs.readFileSync(path.join(engRoot, "tools", "roundhouse", "job-queue.json"), "utf8")); }
    catch { return { kind: "swek-job-queue", version: 1, jobs: {}, seq: 0 }; }
}

/**
 * The five rows. Each carries `have`, `total`, and `owner` -- the file that computed it -- so a reader can go
 * argue with the tool rather than with this page.
 */
// v3941 -- `map` joins `now` and `queue` as an injection point, for the same reason they exist: the instruments
// row maps reconcile()'s OBJECTS to device names, and while the live red list is empty that mapping cannot be
// exercised at all. Its gate had bought non-vacuity by REQUIRING the list to be non-empty -- a check that
// depends on the tree still owing something -- and went red the round the debt was paid off. A synthetic map
// drives the real row instead.
export function labCensus(engRoot = ENG, { now = Date.now(), queue = null, map = null } = {}) {
    const rows = [];

    const g = gradedCoverage(engRoot);
    rows.push({ id: "graded", have: g.graded.length, total: g.proven, owner: "tools/roundhouse/gradedCoverage.mjs",
                what: "physics modules with a selfcheck that a device bind actually reaches",
                caveat: "many ungraded modules are solvers wanting self-consistency, not an answer key -- the owner says so" });

    const p = declaredCensus(engRoot, DEVICE_NAMES);
    rows.push({ id: "plants", have: p.declared.length, total: p.parsed, owner: "tools/roundhouse/plantedCoverage.mjs",
                what: "device binds that DECLARE a planted knob",
                caveat: "the DECLARED form. The full census RUNS each device to prove the plant fires; that is minutes, " +
                        "not a dashboard, and the number here is a ceiling on it" });

    // Eligibility is an INTERSECTION OF TWO REGISTRIES, not a measurement: a quantity can face the full battery
    // only if it has both a refinement knob and a nuisance knob. Read from the two registries that own them.
    const refine = [...new Set(Object.keys(REFINEMENT_KNOBS))];
    const registry = new Set(Object.keys(NUISANCE_KNOBS));
    const outside = new Set(Object.keys(NEW_NUISANCE).filter((d) => !registry.has(d)));
    const both = refine.filter((d) => registry.has(d) || outside.has(d));
    const registryOnly = refine.filter((d) => registry.has(d));
    rows.push({ id: "corroboration", have: both.length, total: DEVICE_NAMES.length,
                owner: "tools/roundhouse/{refinementKnobs,nuisanceKnobs,corroborateFully}.mjs",
                what: "devices that can face the four-criterion battery at all", members: both,
                registryOnly: registryOnly.length, outsideRegistry: [...outside],
                caveat: "BOTH declarations counted. The registry alone gives " + registryOnly.length + "; " +
                        [...outside].join(" and ") + " carry their nuisance knob in corroborateFully.mjs instead, " +
                        "so a census reading the registry under-reports the battery's reach" });

    // The instrument map's own reconciliation, 256 ms. `unexplained` is a device that touches real modules and
    // has NEITHER an instrument row NOR a written exemption -- a carried red, and the cheap close (adding rows)
    // is the wrong one: they want pages or stated reasons. Reported as a DEFICIT, so it reads as debt not score.
    const m = map || reconcile();
    // `devices` and `linked` are COUNTS here, not arrays -- read from the tool rather than assumed, after the
    // first version of this row printed "undefined of undefined" for exactly that reason.
    rows.push({ id: "instruments", have: m.linked, total: m.devices, owner: "tools/ship/deviceInstrumentMap.mjs",
                what: "devices whose physics modules are reachable from an instrument",
                unexplained: m.unexplained.map((u) => u.device || String(u)),
                caveat: m.unexplained.length + " UNEXPLAINED -- " + m.unexplained.map((u) => u.device || u).join(", ") +
                        " -- each touches real modules with neither an instrument row nor a stated exemption" });

    const q = queue || readQueue(engRoot);
    const pulse = dispatcherPulse(q, { now });
    rows.push({ id: "dispatcher", have: pulse.byDispatcher, total: pulse.total, owner: "tools/roundhouse/officeDispatch.mjs",
                what: "jobs in the queue that the dispatcher made", pulse,
                caveat: "state is " + pulse.state + (pulse.ageMs === null ? " -- no job has ever been enqueued"
                        : ", newest job " + Math.round(pulse.ageMs / 60000) + " min old against a " + Math.round(STALE_MS / 60000) + " min window") });

    return { rows, generatedAt: new Date(now).toISOString() };
}

/** One line per row. Reporting, beside the census rather than inside it. */
export function censusLines(c) {
    return c.rows.map((r) => {
        const pct = r.total ? ((100 * r.have) / r.total).toFixed(1) + "%" : "n/a";
        return `${r.id.padEnd(14)} ${String(r.have).padStart(4)} of ${String(r.total).padEnd(5)} ${pct.padStart(6)}   ${r.what}`;
    });
}

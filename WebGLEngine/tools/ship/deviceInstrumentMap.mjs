// WebGLEngine/tools/ship/deviceInstrumentMap.mjs — v3299
// ---------------------------------------------------------------------------------------------------------------
// TWO REGISTRIES DESCRIBE OVERLAPPING FACTS, AND NOTHING RECONCILED THEM.
//
//   tools/roundhouse/devices.mjs  -- 47 DEVICES the roundhouse can run, keyed by short lowercase names
//                                    ("landauzener", "twof", "lbm")
//   physics/instruments.mjs       -- 46 INSTRUMENTS with front doors, answer keys and gates, keyed by hyphenated
//                                    ids ("landau-zener", "lbm-fluid")
//
// The v3298 patch bound twelve physics modules as devices. TEN of them gained instrument entries and TWO did not
// -- hydrostatic and twoF arrived with binds and gates and no entry, so they were invisible to the lab front
// door and to every census that reads the instrument list. Nothing noticed, because nothing was looking.
//
// *** THE RULE THIS DOES NOT INVENT. *** The obvious reconciliation is "every device must be an instrument", and
// it is WRONG: the populations differ on purpose. friction, zeta, spacefill, gyroscope and a dozen others are
// physics-backed devices that were never meant to have a front door, and asserting a 1:1 match would manufacture
// seventeen failures out of a deliberate design. A gate that invents its own rule is worse than no gate.
//
// SO THE PROPERTY IS NARROWER AND OBJECTIVE: when a device and an instrument are about THE SAME PHYSICS MODULE,
// the link between them must be EXPLICIT. Sameness is decided by the modules each actually imports -- a
// dependency fact, not a name guess. "landauzener" and "landau-zener" share physics/quantum/landauZener.js;
// "twof" and nothing share simulation/lbm/twoFExperiment.mjs, and that gap is the finding.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { INSTRUMENTS } from "../../physics/instruments.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PHYSICS_ROOTS = ["physics", "simulation", "fluid"];

const rel = (p) => path.relative(ENG, p).replace(/\\/g, "/");

/** Physics modules a file imports, resolved to engine-relative paths. */
export function physicsImports(absFile) {
    let src = "";
    try { src = fs.readFileSync(absFile, "utf8"); } catch { return []; }
    const out = new Set();
    for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
        const spec = m[1];
        if (!spec.startsWith(".")) continue;
        const abs = path.resolve(path.dirname(absFile), spec);
        const r = rel(abs);
        if (PHYSICS_ROOTS.some((root) => r.startsWith(root + "/"))) out.add(r);
    }
    return [...out].sort();
}

/** Device name -> { bind, modules }. Parsed from the registry rather than a hand list, so it cannot drift. */
export function deviceModules() {
    const dsrc = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "devices.mjs"), "utf8");
    const varToFile = {};
    for (const m of dsrc.matchAll(/import\s*\{\s*(\w+)\s*\}\s*from\s*["']\.\/([\w.]+?)\.mjs["']/g)) varToFile[m[1]] = m[2];
    const out = {};
    // v3416 -- `async` IS OPTIONAL, AND REQUIRING IT MADE THIS A SUBSET THAT LOOKED LIKE A CORPUS. The registry
    // spells some rows `name: async () => bind,` and others `name: () => bind,`; this regex demanded the first,
    // so it read 50 of 63 devices and reported "all 7 exempt" over a census that was missing thirteen rows.
    // *** A GATE BUILT TO STOP REGISTRIES DRIFTING WAS ITSELF READING A SUBSET -- and it reported GREEN doing
    // it, which is the worse half: a coverage check over a partial corpus overstates coverage by construction.
    // *** plantedCoverage's copy of this regex was corrected at v3391 and this one was left, so the tree carried
    // TWO SPELLINGS OF ONE PARSE for twenty-five versions. Now identical to that one.
    // *** v3719 -- THIS PARSE READS 79 OF THE REGISTRY'S 80 DEVICES AND HAS REPORTED NOTHING SINCE v3297,
    // because nothing ever compared it against the registry's own DEVICE_NAMES. The note above is the SAME
    // DEFECT one spelling earlier, and the file's own words for it are still right: A COVERAGE CHECK OVER A
    // PARTIAL CORPUS OVERSTATES COVERAGE BY CONSTRUCTION.
    //
    // *** THE MISSING ROW IS `lbm`, AND THE ARROW WAS NOT THE REASON -- I WIDENED THE REGEX ON THAT GUESS FIRST
    // AND THE COUNT DID NOT MOVE. makeLbmDevice is a LOCAL FUNCTION DEFINED INSIDE devices.mjs that loads its
    // physics through a DYNAMIC import, so there is no *Bind.mjs for this parse to read and there never was.
    // The widened form below is kept because the registry does spell rows without an arrow and a future one may
    // be a real import -- but IT IS NOT THE FIX. The fix is that lbm is now a DECLARED exemption with its
    // reason, and deviceInstrumentMap-selfcheck asserts parsed + exempt === DEVICE_NAMES, so the next spelling
    // that slips past this regex goes RED INSTEAD OF QUIETLY SHRINKING THE CORPUS. ***
    for (const m of dsrc.matchAll(/(\w+)\s*:\s*(?:(?:async\s*)?\(\)\s*=>\s*)?(\w+)\s*,/g)) {
        const name = m[1], file = varToFile[m[2]];
        if (!file) continue;
        const abs = path.join(ENG, "tools", "roundhouse", file + ".mjs");
        out[name] = { bind: rel(abs), modules: physicsImports(abs) };
    }
    return out;
}

/** Instrument id -> physics modules its GATE imports (the gate is what actually exercises the module). */
export function instrumentModules() {
    const out = {};
    for (const inst of INSTRUMENTS) {
        if (!inst.gate) { out[inst.id] = { gate: null, modules: [], device: inst.device || null }; continue; }
        const abs = path.join(ENG, inst.gate);
        out[inst.id] = { gate: inst.gate, modules: physicsImports(abs), device: inst.device || null };
    }
    return out;
}

/**
 * DEVICES THAT DELIBERATELY HAVE NO INSTRUMENT ENTRY, each with the reason. This list is the human half of the
 * reconciliation and there is no way to derive it: a device with no front door may be a considered decision or
 * it may be drift, and only a person knows which. The gate asserts the UNCOVERED SET EQUALS THIS SET, so a new
 * device arriving without an instrument fails until someone chooses -- entry, or exemption with a reason.
 *
 * This is the singleSource idiom: three exemptions there, each a different reason, none derivable from the
 * pattern alone. The alternative -- "every device must be an instrument" -- would manufacture seventeen
 * failures out of a deliberate design, and a gate that invents its own rule is worse than no gate.
 */
/**
 * Registry rows this parse CANNOT see, each with the reason -- read by the selfcheck, which asserts that the
 * parsed set plus this one is exactly DEVICE_NAMES. AN EXEMPTION WITH A REASON IS DEBT WITH A NAME ON IT; a
 * row silently absent from a census is not.
 */
export const UNPARSEABLE_ROWS = {
    lbm: "makeLbmDevice is a local function inside devices.mjs, not an imported *Bind.mjs, and it loads "
       + "simulation/lbm/lbm2d.js through a DYNAMIC import -- there is no bind file for this parse to read. "
       + "IF LBM EVER GETS A REAL lbmBind.mjs, THIS ENTRY MUST GO AND THE SELFCHECK WILL SAY SO.",
};

export const NO_INSTRUMENT = {
    // *** v3807 -- nbench IS EXEMPT AND IT IS MINE. It compares TWO DATA STRUCTURES -- a Morton BVH against the
    // hashed spatial grid -- on the same particle cloud, and reports CHECK COUNTS. NO PAGE IMPORTS
    // physics/sph/spatialGrid.js, so a row would need `page: null` and become a thirty-FIFTH pageless row: the
    // exact cheap close this file talked itself out of for heidler. *** AND THE DEEPER REASON IS THAT IT IS NOT
    // AN INSTRUMENT: it measures a COST, not a physical quantity, and it has no constant to put on a front
    // door. Its thirteen MPM siblings took ROWS in the same round because mpm.html is REAL and they grade
    // physics; this one takes an EXEMPTION because neither is true of it. ***
    // *** v3853 -- multigrid3d TAKES AN EXEMPTION ON EXACTLY nbench's REASONING, AND BOTH FACTS ARE DERIVED
    // RATHER THAN ASSERTED. *** (1) NO PAGE IMPORTS fluid/multigrid3d.mjs -- checked across every .html in the
    // tree -- so a row would need `page: null` and become another pageless one. (2) Its observables are
    // `iters`, `itersSmall`, `itersLarge`, `iterRatio`, `cellRatio`: ITERATION COUNTS. Grid-independent
    // convergence is a property of the SOLVER, not a physical constant, and there is nothing to put on a front
    // door. That is nbench's case word for word, and it is why this is an exemption rather than a fabricated
    // reason -- the file's own rule is that an invented reason closes a question that should stay open.
    multigrid3d: "not a physical instrument: it measures ITERATION COUNTS -- grid-independent convergence, itersSmall against itersLarge as a ratio -- which is a property of the solver rather than a physical quantity. No page in the tree imports fluid/multigrid3d.mjs, so a row would be a pageless one, and there is no physical constant to put on a front door. Same disposition as nbench, for the same two reasons.",
    nbench: "not a physical instrument: it compares the COST of two neighbour-search structures (Morton BVH against the hashed grid) and reports CHECK COUNTS, which are machine-independent where milliseconds are not. No page imports physics/sph/spatialGrid.js, so a row would be a pageless one, and there is no physical constant to put on a front door.",
    // *** v3419 -- heidler IS EXEMPT, AND THE MAP IS WHAT TALKED ME OUT OF AN INSTRUMENT ROW. *** I wrote one
    // with `page: null` -- the field for "deliberately no front door of its own" -- and got MISLINKED back:
    // "instrument heidler names device heidler, which shares no physics module with it". THE REASON IS REAL AND
    // IS THE DISPOSITION: heidler has NO MODULE-LEVEL GATE. Its only gate is tools/roundhouse/heidler-selfcheck
    // .mjs, which imports nothing from physics/ at all and reaches the module through heidlerBind. So a row for
    // it could never have its link VERIFIED, and an unverifiable row is worth less than an honest absence.
    // A ROW THAT CANNOT BE CHECKED IS THE THING THIS FILE EXISTS TO PREVENT, and I nearly added one.
    heidler: "no front door and no module-level gate: its only gate lives in the roundhouse and reaches physics/discharge/heidler.mjs through the bind, so an instrument row could not have its link verified. AND THE PHYSICS ARGUES THE SAME WAY -- the 5% shortfall is THE FORMULA'S (trueEta/standardEta equals peak/i0 to nine places) and 'exact' mode normalises it to 1.000000000, so a single-number panel would have to pick a convention and would mislead about which. WHEN SOMEBODY WRITES A MODULE-LEVEL GATE OR A TWO-COLUMN PAGE, THIS LINE GOES RED AND SHOULD BE DELETED, NOT WEAKENED.",

    // v3416 -- THE FOUR THIS FILE'S OWN HEADER ALREADY EXEMPTED IN PROSE. Line 15 says outright that "friction,
    // zeta, spacefill, gyroscope and a dozen others are physics-backed devices that were never meant to have a
    // front door" -- and the map then reported them as UNEXPLAINED the moment the parser was fixed, because the
    // reason lived in a PARAGRAPH and nothing read it. *** PROSE-AS-DATA, in the gate built to stop registries
    // drifting. *** These four are moved from the header into the field, unchanged in meaning; the rest of that
    // sentence's "dozen others" is NOT assumed, because a paragraph naming four and gesturing at more is not an
    // exemption list.
    friction: "the stick/slide bifurcation is graded in the roundhouse and was never meant to have a front door -- this file's own header has said so since it was written",
    // *** v3818 -- zeta IS GONE FROM THIS LIST AND THE GATE IS WHAT NOTICED, exactly as gyroscope was at
    // v3669. *** Its excuse was that "zeta(3) has no closed form and therefore CANNOT BE RECITED; the value of
    // the device is the gate, not a panel". That was true when it was written and statistical-mechanics.html
    // made it false: physics/thermal/bec.mjs and blackbody.mjs both import ../zeta.js, so the page reaches it
    // and recites zeta(3/2) = 2.612375 and zeta(4)*Gamma(4) = pi^4/15 on two of its panels. THE EXEMPTION WAS
    // NOT WRONG, IT WENT OUT OF DATE -- and it went out of date because of a round that never mentioned zeta,
    // which is precisely the rot this staleness check exists to catch. Removed rather than reworded: the
    // device now overlaps an instrument and needs no excuse.
    spacefill: "same: a Hilbert curve is a traversal primitive; its answer key is the derived worst-jump bound, which is a gate result rather than a reading",
    // *** v3669 -- gyroscope IS GONE FROM THIS LIST AND THE GATE IS WHAT NOTICED. *** v3591 registered an
    // instrument row for it (page physics-lab.html, gate physics/gyroscope-selfcheck.mjs) and NOBODY
    // REMOVED THE EXCUSE, so for seventy-eight versions this file said "never meant to have a front door"
    // about a device that had one. staleExempt fired every single run in between. THE CHECK'S OWN NOTE
    // PREDICTED THIS -- "an excuse for a device that now has an instrument would rot silently" -- and the
    // response it names is DELETION, NOT WEAKENING, which is what this is. The reason it gave was also
    // true and is now beside the point: an ORDER is not a number a front door can display, and the
    // instrument row does not claim it is; it points at the page that drives the physics.
    blackhole: "the raytracer scene, graded by the kerr and probe-lab instruments that use its physics; the scene itself has no separate answer key",
    geometry: "marching cubes: a meshing primitive, gated where it lives, with no physical constant to put on a front door",
    kh: "Kelvin-Helmholtz dispersion feeds the lbm-fluid and thermal-flow instruments; promoting it separately would list one growth rate twice",
    csg: "exact signed-distance geometry: the value is that a box corner, a unit gradient and a set identity are graded against CLOSED FORMS, not that any physical constant sits on a front door. A meshing primitive has no dial to read, the same reason geometry and sdfmarch carry no instrument -- the gate IS the deliverable.",
    bonefield: "the capsule distance field is exact geometry, not a measured constant: the segment clamp, the union and the determinism are graded against closed forms and against themselves. Like csg, a distance-field primitive has no dial for a front door -- the gate is the deliverable.",
    twobody: "the two-body solver underlies kepler; kepler IS its front door",
    inspiral: "gravitational-wave inspiral, graded against Peters (1964) in the roundhouse; its front door is probe-lab's family",
    eccentric: "stage 3 of the same inspiral family, sharing probe-lab's front door",
    // v3933 -- blobkelvin's exemption REMOVED, not edited: registering diffusion-knob gave the device a real
    // instrument, because physics/diffusionKnob.mjs imports blobKelvin.js at line 46 and reads it. The excuse
    // said the device was "covered on the front door by the fluids instruments"; it is covered by one that
    // names it now. AN EXCUSE FOR A DEVICE THAT NOW HAS AN INSTRUMENT ROTS SILENTLY -- this gate's own words --
    // and it fired the moment the instrument landed, which is the ratchet working in the direction nobody has
    // to remember.
};

/**
 * v3418 -- *** WHICH PAGES ALREADY DRIVE A DEVICE'S PHYSICS, WHETHER OR NOT ANYTHING DECLARES IT. ***
 *
 * The AWAITING list below asked "does this device want an instrument?" and that turned out to be the wrong
 * question for four of its five entries, because THE FRONT DOOR ALREADY EXISTED AND NOBODY HAD SAID SO. That is
 * v3330's finding in a new place: an absent `device` field is a MISSING DECLARATION, NOT PROOF OF A MISSING
 * DEVICE -- and it is the reason a census that only reads instruments.mjs cannot tell "nobody built a page" from
 * "somebody built a page and never registered it". THOSE TWO NEED OPPOSITE WORK.
 *
 * Derived the same way the bind side already is: from the IMPORT SPECIFIER, resolved to a path, never by name
 * and never by substring (v3330's `lbm-fluid` missing the device `lbm` is the standing warning). A page that
 * merely LINKS to something is not driving it; a page that imports its module is.
 *
 * SCOPE, STATED: this proves the page IMPORTS the module. v3199 is the reason that is not the whole claim -- an
 * import moves a count and grades nothing -- so the report says DRIVES-OR-IMPORTS and a person still has to look
 * at the page. It narrows the question from "is there a front door" to "read this file", which is the whole gain.
 */
export function pagesImportingPhysics(engRoot, maxHops = 4) {
    // *** v3419 -- THE v3418 VERSION RESOLVED ONE HOP AND THAT WAS A SUBSET THAT LOOKED LIKE A CORPUS. *** It
    // asked which pages import a physics module DIRECTLY, reported "NO page imports physics/xpbd/plastic.js",
    // and was wrong: couple.html imports physics/xpbd/couplingRegistry.js, which imports plastic.js and CALLS
    // plasticSubstep. A page reaches its physics through whatever it imports, and stopping at depth one answers
    // a different question than the one asked. THE SHAPE THIS TREE NAMES SECOND-MOST OFTEN, committed one round
    // after building the walk that was supposed to end the guessing.
    //
    // So the walk FOLLOWS every relative import to a fixed depth and reports the HOP COUNT, because "the page
    // drives this itself" and "the page reaches this through four layers" are different facts and a caller
    // should be able to tell them apart. Depth is capped rather than unbounded: a full transitive closure over
    // main.js would make every page look like it drives everything, which is the opposite failure.
    const out = new Map();                       // physics module -> [{page, hops}, ...]
    let names = [];
    try { names = fs.readdirSync(engRoot).filter((f) => f.endsWith(".html")); } catch { return out; }
    for (const page of names.sort()) {
        const seen = new Set();
        let frontier = [path.join(engRoot, page)];
        for (let hop = 0; hop <= maxHops && frontier.length; hop++) {
            const next = [];
            for (const file of frontier) {
                let src = "";
                try { src = fs.readFileSync(file, "utf8"); } catch { continue; }
                for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
                    const spec = m[1];
                    if (!spec.startsWith(".")) continue;
                    const abs = path.resolve(path.dirname(file), spec);
                    if (seen.has(abs)) continue;
                    seen.add(abs);
                    const r = rel(abs);
                    if (PHYSICS_ROOTS.some((root) => r.startsWith(root + "/"))) {
                        if (!out.has(r)) out.set(r, []);
                        if (!out.get(r).some((e) => e.page === page)) out.get(r).push({ page, hops: hop });
                    }
                    next.push(abs);
                }
            }
            frontier = next;
        }
    }
    return out;
}

/** For one device's module list, the pages that import any of them. Empty means nothing on a page touches it. */
export function frontDoorPages(modules, byModule) {
    const best = new Map();                      // page -> fewest hops seen
    for (const m of modules) for (const e of (byModule.get(m) || [])) {
        if (!best.has(e.page) || e.hops < best.get(e.page)) best.set(e.page, e.hops);
    }
    return [...best.entries()].sort().map(([page, hops]) => (hops ? `${page} (${hops} hop${hops > 1 ? "s" : ""})` : page));
}

/**
 * v3416 -- FIVE DEVICES THAT NEED A JUDGEMENT NOBODY HAS MADE, AND THE JUDGEMENT IS KEITH'S.
 *
 * Fixing the parser above turned UNEXPLAINED from 0 into 9. Four had their reason already written in this
 * file's own header and are now in NO_INSTRUMENT. THE OTHER FIVE HAVE NO STATED REASON ANYWHERE, and this file
 * says outright that "a device with no front door may be a considered decision or drift, and there is no way to
 * derive it". *** SO WRITING AN EXEMPTION FOR THEM WOULD BE FABRICATING PROVENANCE -- the same refusal the 26
 * untraceable claims get. An invented reason is worse than an open question, because it closes it. ***
 *
 * THEY ARE REPORTED, NOT FAILED, AND THE WALL STAYS UP BEHIND THEM: a device that is not on this list and not
 * in NO_INSTRUMENT still FAILS. This list can only ever SHRINK, and staleAwaiting fires the moment an entry
 * stops being uncovered, so it cannot outlive its item the way an open list usually does.
 *
 * *** WHEN KEITH ANSWERS ONE, IT MOVES TO NO_INSTRUMENT WITH HIS REASON, OR IT GAINS AN INSTRUMENT. IT IS NOT
 * DELETED FROM HERE AND LEFT UNANSWERED, AND THIS LINE GOES RED WHEN THE LIST EMPTIES -- delete the mechanism
 * then, do not weaken it. ***
 */
export const AWAITING = {
    // *** EMPTY AT v3419, AND THE MECHANISM EMPTIED IT RATHER THAN A DECISION TO STOP CARING. *** All five were
    // answered: pulsar at v3418 (a missing declaration), then vibrations and figureeight (physics-lab.html
    // already carried both, and beam/device/hmc/method-lab/samplers prove one page may carry several rows),
    // plastic (couple.html reaches it through couplingRegistry, which a ONE-HOP walk could not see), and heidler
    // with `page: null` because the field for "deliberately no front door" already existed.
    //
    // THE LIST IS KEPT, NOT DELETED, AND SO IS staleAwaiting: the next device that arrives without an instrument
    // still FAILS, and the moment somebody parks it here the same ratchet starts asking. AN EMPTY LIST WITH A
    // LIVE MECHANISM IS NOT THE SAME AS NO LIST -- and every entry that left did so because staleAwaiting said
    // it was no longer uncovered, which is the antidote working four times in two rounds.
};

/**
 * Reconcile. Two properties, and DELIBERATELY NOT a third.
 *
 *   COVERAGE  -- every device touching physics either overlaps an instrument or is exempt WITH A REASON.
 *   LINK      -- an instrument's `device` field, when present, must name a device that exists AND actually
 *                shares a physics module with it. A link that points at the wrong thing is worse than none.
 *
 * NOT REQUIRED: that every overlap be declared. The relation is many-to-many -- "kerr" shares geodesic.js with
 * the geodesic, kerr and probe-lab instruments -- so demanding a declaration for all 79 overlaps would be
 * unmaintainable and, again, a rule nobody chose.
 */
export function reconcile() {
    const dev = deviceModules(), inst = instrumentModules();
    // *** v3807 -- A ROW THAT NAMES A DEVICE INHERITS THAT DEVICE'S MODULES. An instrument's own module set is
    // derived from ITS GATE, and a gate living in the roundhouse reaches physics/ THROUGH A BIND -- so a row
    // whose gate is a roundhouse selfcheck names no physics module directly and comes out EMPTY. That is the
    // heidler case this file documents, and it made a row USELESS for reconciliation however precisely it
    // named its device: the device stayed UNEXPLAINED, and the "names a device it shares no module with" check
    // fired on the very same row. *** BOTH COMPLAINTS WERE THE SAME MISSING HOP. Following the declaration
    // makes the overlap REAL rather than waiving it, so NEITHER CHECK IS WEAKENED -- and a row naming a device
    // that does not exist still inherits nothing, which its gate asserts. ***
    for (const i of Object.values(inst)) {
        if (!i.device || !dev[i.device]) continue;
        for (const m of dev[i.device].modules) if (!i.modules.includes(m)) i.modules.push(m);
    }
    const overlaps = [];
    for (const [dname, d] of Object.entries(dev)) {
        for (const [iid, i] of Object.entries(inst)) {
            const shared = d.modules.filter((m) => i.modules.includes(m));
            if (shared.length) overlaps.push({ device: dname, instrument: iid, shared });
        }
    }
    const dangling = Object.entries(inst)
        .filter(([, i]) => i.device && !dev[i.device])
        .map(([id, i]) => ({ instrument: id, device: i.device }));
    const misLinked = Object.entries(inst)
        .filter(([id, i]) => i.device && dev[i.device] &&
                             !overlaps.some((o) => o.device === i.device && o.instrument === id))
        .map(([id, i]) => ({ instrument: id, device: i.device }));
    // *** v3496 -- AN INSTRUMENT THAT EXPLICITLY NAMES ANOTHER DEVICE IS NOT EVIDENCE ABOUT THIS ONE. The
    // overlap test is a SHARED PHYSICS MODULE, which is the right inference for the 42 rows that carry no
    // `device` field at all (v3330) -- but a module a gate imports TO CHECK AGAINST is not a module the
    // instrument is ABOUT. v3496's sdf-march row grades an implicit-field marcher and its gate imports
    // marchingCubes.js as an INDEPENDENT CHECK ROUTE; that alone made the `geometry` device look covered and
    // reported its exemption STALE, whose reason ("a meshing primitive with no physical constant to put on a
    // front door") IS STILL ENTIRELY TRUE. AN EXPLICIT DECLARATION BEATS A MODULE COINCIDENCE. ***
    const claims = (o) => { const d = inst[o.instrument].device; return !d || d === o.device; };
    const uncovered = Object.entries(dev)
        .filter(([dname, d]) => d.modules.length && !overlaps.some((o) => o.device === dname && claims(o)))
        .map(([dname, d]) => ({ device: dname, modules: d.modules, exempt: !!NO_INSTRUMENT[dname] }));
    const unexplained = uncovered.filter((u) => !u.exempt && !AWAITING[u.device]);
    const byModule = pagesImportingPhysics(ENG);
    for (const u of uncovered) u.frontDoors = frontDoorPages(u.modules, byModule);
    const awaiting = uncovered.filter((u) => !u.exempt && !!AWAITING[u.device]);
    const staleAwaiting = Object.keys(AWAITING).filter((k) => !uncovered.some((u) => u.device === k));
    const staleExempt = Object.keys(NO_INSTRUMENT).filter((k) => !uncovered.some((u) => u.device === k));
    return { devices: Object.keys(dev).length, instruments: Object.keys(inst).length,
             overlaps, dangling, misLinked, uncovered, unexplained, staleExempt, awaiting, staleAwaiting,
             linked: Object.values(inst).filter((i) => i.device).length };
}

export function mapLines(r) {
    const out = [];
    out.push(`${r.devices} devices, ${r.instruments} instruments, ${r.overlaps.length} share a physics module, ${r.linked} explicit links`);
    for (const u of r.unexplained) out.push(`  UNEXPLAINED: device "${u.device}" touches ${u.modules.join(", ")} and has neither an instrument nor an exemption`);
    for (const u of r.awaiting) {
        const doors = u.frontDoors || [];
        // FRONT DOOR EXISTS and NO FRONT DOOR are printed as different sentences, because they need opposite
        // work: the first is a declaration to write, the second is a page to build or an exemption to state.
        out.push(`  AWAITING A JUDGEMENT: "${u.device}" -- ${doors.length ? "a page already drives it (" + doors.join(", ") + "): the question is what the DECLARATION should say" : "NO page imports its physics: the question is whether it should have one"}`);
        out.push(`      ${AWAITING[u.device]}`);
    }
    for (const k of r.staleAwaiting) out.push(`  STALE AWAITING ENTRY: "${k}" is no longer uncovered -- answer it and remove the entry`);
    for (const d of r.dangling) out.push(`  DANGLING: instrument "${d.instrument}" names device "${d.device}", which does not exist`);
    for (const m of r.misLinked) out.push(`  MISLINKED: instrument "${m.instrument}" names device "${m.device}", which shares no physics module with it`);
    for (const k of r.staleExempt) out.push(`  STALE EXEMPTION: "${k}" is excused from having an instrument, but it is no longer uncovered`);
    if (!r.unexplained.length && !r.dangling.length && !r.misLinked.length && !r.staleExempt.length)
        // The two are counted SEPARATELY and never added up. "Exempt with a stated reason" and "nobody has been
        // asked yet" are different facts, and one number saying 16 would read as sixteen settled decisions.
        out.push(`  reconciled: ${r.uncovered.length} device(s) without an instrument -- ${r.uncovered.length - r.awaiting.length} exempt with a stated reason, ${r.awaiting.length} awaiting a judgement`);
    return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const r = reconcile();
    for (const l of mapLines(r)) console.log(l);
    if (r.uncovered.length) {
        console.log("\n  devices with no instrument entry:");
        for (const u of r.uncovered) console.log(`    ${u.exempt ? "exempt " : (AWAITING[u.device] ? "awaiting " : "UNEXPLAINED ")} ${u.device}  ${u.modules.join(", ")}`);
    }
}

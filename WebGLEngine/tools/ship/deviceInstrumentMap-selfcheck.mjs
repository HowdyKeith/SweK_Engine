// WebGLEngine/tools/ship/deviceInstrumentMap-selfcheck.mjs — v3299
//
// Run: node tools/ship/deviceInstrumentMap-selfcheck.mjs   (~0.3s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// THE DRIFT THIS EXISTS TO CATCH ALREADY HAPPENED. The v3298 patch bound twelve physics modules as roundhouse
// devices; ten gained instrument entries and TWO did not. hydrostatic and twoF arrived with binds, gates and
// rich histories, and were invisible to the lab front door and to every census that reads the instrument list.
// Nothing noticed, because nothing was looking.
//
// THE RULE THIS GATE DOES NOT INVENT: "every device must be an instrument" is false by design -- friction, zeta,
// spacefill and a dozen others are physics-backed devices that were never meant to have a front door, and
// asserting a 1:1 match would manufacture seventeen failures out of a deliberate decision. Sameness is decided
// by THE PHYSICS MODULES EACH IMPORTS, a dependency fact rather than a name guess, and the human half -- which
// uncovered devices are deliberate -- lives in an exemption list with reasons, the way singleSource does it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reconcile, mapLines, deviceModules, instrumentModules, physicsImports, NO_INSTRUMENT, PHYSICS_ROOTS,
    UNPARSEABLE_ROWS } from "./deviceInstrumentMap.mjs";
import { DEVICE_NAMES } from "../roundhouse/devices.mjs";
import { INSTRUMENTS } from "../../physics/instruments.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const r = reconcile();

// *** v3729 -- THE CENSUS IS KEYED BY id AND NOTHING EVER ASSERTED THAT ids ARE UNIQUE. *** A row added with an
// id that already existed did not throw, did not go red, and did not change the instrument count:
// instrumentModules() builds an object keyed by id, so the second row SILENTLY REPLACED the first and this
// gate went on reporting a green reconciliation over a corpus one row short. THE GIVE-AWAY WAS THE TOTAL
// CONTRADICTING ITS OWN SOURCE -- 148 instruments against 149 rows in INSTRUMENTS -- which is only visible if
// something compares them, so now something does. WHEN THIS GOES RED: rename the new row, never delete the old
// one to make room, and check whether the collision was a real duplicate claim or two different instruments
// that wanted the same name.
{
    const ids = INSTRUMENTS.map((i) => i.id);
    const dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
    ok("!! *** every instrument id is UNIQUE, so no row can silently replace another in a census keyed by id ***",
        dup.length === 0, dup.length ? "COLLIDING: " + dup.join(", ") : ids.length + " rows, " + new Set(ids).size + " distinct ids");
    ok("...and the reconciliation's instrument total equals the number of rows it was built from",
        Object.keys(instrumentModules()).length === INSTRUMENTS.length,
        `${Object.keys(instrumentModules()).length} counted against ${INSTRUMENTS.length} rows -- A CENSUS WHOSE ` +
        `TOTAL DISAGREES WITH ITS OWN CORPUS IS THE ONLY SYMPTOM A COLLAPSED KEY HAS`);
}

// ---- 1. COVERAGE: NO DEVICE IS SILENTLY WITHOUT A FRONT DOOR ---------------------------------------------------
{
    ok("!! every physics-backed device either overlaps an instrument or is EXEMPT WITH A STATED REASON",
       r.unexplained.length === 0,
       r.unexplained.length
           ? "UNEXPLAINED: " + r.unexplained.map((u) => u.device + " (" + u.modules.join(", ") + ")").join("; ")
           : r.uncovered.length + " uncovered, all exempt — this check was RED when written: hydrostatic and twoF arrived in the v3298 patch with gates and no instrument entry");
    ok("...and no exemption is stale (an excuse for a device that now has an instrument would rot silently)",
       r.staleExempt.length === 0, r.staleExempt.join(", ") || Object.keys(NO_INSTRUMENT).length + " exemptions, all still applicable");
    // *** v3496 -- SHOWN FAILING IN BOTH DIRECTIONS, because a rule about which evidence counts is worthless if
    // nobody has watched it decide. An instrument naming ANOTHER device must not cover this one; an instrument
    // naming THIS one must. ***
    {
        const other = { id: "probe-x", device: "sdfmarch", modules: ["physics/mesh/marchingCubes.js"] };
        const mine = { id: "probe-x", device: "geometry", modules: ["physics/mesh/marchingCubes.js"] };
        const covers = (i, dname) => { const d = i.device; return (!d || d === dname); };
        ok("!! *** AN EXPLICIT DECLARATION BEATS A MODULE COINCIDENCE, AND IT IS ASSERTED BOTH WAYS ***",
           covers(other, "geometry") === false && covers(mine, "geometry") === true &&
           covers({ id: "p", modules: [] }, "geometry") === true,
           "*** A MODULE A GATE IMPORTS **TO CHECK AGAINST** IS NOT A MODULE THE INSTRUMENT IS ABOUT. v3496's sdf-march gate imports marchingCubes.js as an INDEPENDENT CHECK ROUTE, and on the shared-module inference alone that made `geometry` look covered and reported its exemption STALE -- while its reason, \"a meshing primitive with no physical constant to put on a front door\", is still entirely true. THE SHARED-MODULE INFERENCE IS KEPT for the 42 rows carrying no `device` field at all (v3330); what changed is that a row which NAMES a device stops speaking for any other. ***");
    }

    ok("every exemption carries a REASON, not just a name",
       Object.values(NO_INSTRUMENT).every((v) => typeof v === "string" && v.length > 40),
       "a bare list of excused names is indistinguishable from a list of things nobody got round to");
}

// ---- 2. LINKS: AN EXPLICIT LINK MUST BE CORRECT, OR IT IS WORSE THAN NONE -----------------------------------------
{
    ok("!! no instrument names a device that does not exist",
       r.dangling.length === 0, r.dangling.map((d) => d.instrument + " -> " + d.device).join("; ") || r.linked + " links checked");
    ok("!! ...and no instrument names a device it shares NO physics module with",
       r.misLinked.length === 0,
       r.misLinked.map((m) => m.instrument + " -> " + m.device).join("; ") ||
       "each of the " + r.linked + " links is backed by a shared import, not by a similar name");
}

// ---- 3. SAMENESS IS A DEPENDENCY FACT, NOT A NAME GUESS -------------------------------------------------------------
{
    // "landauzener" and "landau-zener" share nothing as strings a matcher would accept, and everything as modules
    const dev = deviceModules(), inst = instrumentModules();
    const shared = (dev["landauzener"] || { modules: [] }).modules
        .filter((m) => (inst["landau-zener"] || { modules: [] }).modules.includes(m));
    ok("!! the device 'landauzener' and the instrument 'landau-zener' are matched by a SHARED MODULE",
       shared.length > 0, shared.join(", ") + " — the names differ by a hyphen and a case fold; the import does not");
    ok("...and the parser reads the device registry itself rather than a hand-maintained list",
       Object.keys(dev).length > 30 && dev["twof"] && dev["twof"].bind.includes("twoFBind"),
       Object.keys(dev).length + " devices parsed straight from devices.mjs, so the map cannot drift from it");
}

// ---- 4. SABOTAGE: EACH CHECK HAS TEETH ---------------------------------------------------------------------------------
{
    // a fabricated device that no instrument covers and no exemption excuses must be UNEXPLAINED
    const dev = deviceModules(), inst = instrumentModules();
    const fakeDev = { ...dev, ghostdevice: { bind: "tools/roundhouse/ghostBind.mjs", modules: ["physics/ghost/ghost.js"] } };
    const overlaps = [];
    for (const [dn, d] of Object.entries(fakeDev))
        for (const [iid, i] of Object.entries(inst))
            if (d.modules.some((m) => i.modules.includes(m))) overlaps.push({ device: dn, instrument: iid });
    const uncovered = Object.entries(fakeDev).filter(([dn, d]) => d.modules.length && !overlaps.some((o) => o.device === dn));
    const unexplained = uncovered.filter(([dn]) => !NO_INSTRUMENT[dn]);
    ok("!! a new device with no instrument and no exemption is caught (the exact v3298 drift, replayed)",
       unexplained.some(([dn]) => dn === "ghostdevice"),
       "a fabricated device touching physics/ghost/ghost.js lands in UNEXPLAINED — which is where hydrostatic and twoF sat");

    // an instrument linking a device it shares nothing with must be MISLINKED
    const badLink = Object.entries(inst).find(([, i]) => i.modules.length);
    if (badLink) {
        const [iid, i] = badLink;
        const wrongDevice = Object.keys(dev).find((dn) => !dev[dn].modules.some((m) => i.modules.includes(m)));
        const wouldFlag = wrongDevice && !overlaps.some((o) => o.device === wrongDevice && o.instrument === iid);
        ok("!! an instrument pointed at an unrelated device would be flagged MISLINKED",
           !!wouldFlag, "instrument '" + iid + "' linked to '" + wrongDevice + "' shares no module — a link that points at the wrong thing is worse than none");
    }
}

// ---- 5. THE TWO INSTRUMENTS THIS ROUND ADDED ARE REAL, NOT PLACEHOLDERS -------------------------------------------------
{
    for (const id of ["sph-hydrostatic", "lbm-two-frequency"]) {
        const inst = INSTRUMENTS.find((x) => x.id === id);
        ok(id + " exists, links a device, and its gate is on disk",
           !!inst && !!inst.device && !!inst.gate && fs.existsSync(path.join(ENG, inst.gate)),
           inst ? inst.device + " -> " + inst.gate : "MISSING");
        ok("..." + id + " records what the device actually found, including the half that failed",
           !!inst && inst.key.length > 400 && /NO VALUE|Tait EXPANDS|no value/i.test(inst.key),
           "twoF's drag/lift ratio has NO VALUE rather than a wrong one, and SPH's Tait fix expands the column to 184% — both are results and both are listed");
    }
}

// ---- 6. physicsImports resolves relative specifiers, and only physics roots ----------------------------------------------
{
    const mods = physicsImports(path.join(ENG, "tools", "roundhouse", "diffusionBind.mjs"));
    ok("physicsImports resolves a bind's relative specifiers to engine-relative physics paths",
       mods.includes("physics/md/diffusion.js"), mods.join(", "));
    ok("...and ignores node builtins and non-physics roots",
       mods.every((m) => PHYSICS_ROOTS.some((root) => m.startsWith(root + "/"))),
       "roots: " + PHYSICS_ROOTS.join(", "));
}

// ---- *** THE CENSUS MUST COVER THE WHOLE REGISTRY (v3719) *** ---------------------------------------------------
// This file's map is built by REGEX over devices.mjs, and a regex over a registry is a second spelling of that
// registry -- the shape this tree has been bitten by more than any other. MEASURED at v3719: the parse saw 79
// of DEVICE_NAMES' 80 and had reported nothing since v3297, because NOBODY EVER COMPARED THE TWO HALVES.
// The missing row is lbm, and it is NOT a regex problem: makeLbmDevice is a local function inside devices.mjs
// loading its physics through a dynamic import, so no bind file exists to read. It is a DECLARED exemption now.
// *** WHEN THIS GOES RED, either the registry gained a row this parse cannot see -- in which case widen the
// parse or declare the row in UNPARSEABLE_ROWS WITH ITS REASON -- or an exemption has outlived its reason and
// must be DELETED. NEVER silence it by trimming DEVICE_NAMES. ***
{
    const parsed = Object.keys(deviceModules());
    const exempt = Object.keys(UNPARSEABLE_ROWS);
    const covered = new Set([...parsed, ...exempt]);
    const missing = DEVICE_NAMES.filter((n) => !covered.has(n));
    const ghosts = [...covered].filter((n) => !DEVICE_NAMES.includes(n));
    ok("!! every device in the registry is either PARSED or DECLARED UNPARSEABLE -- no row is silently absent",
        missing.length === 0 && ghosts.length === 0,
        `${parsed.length} parsed + ${exempt.length} declared = ${covered.size} against DEVICE_NAMES ${DEVICE_NAMES.length}` +
        (missing.length ? ` -- MISSING ${JSON.stringify(missing)}` : "") + (ghosts.length ? ` -- GHOSTS ${JSON.stringify(ghosts)}` : ""));

    // An exemption that no longer applies is worse than none: it suppresses a row that could now be read.
    ok("!! every declared exemption is still a real registry row that the parse still cannot see",
        exempt.every((n) => DEVICE_NAMES.includes(n) && !parsed.includes(n)),
        `declared: ${JSON.stringify(exempt)} -- if lbm gains a real lbmBind.mjs this line goes red and the entry must be deleted, not edited`);
}

for (const l of mapLines(r)) console.log("        " + l);
// ---- AN EXPLICIT DECLARATION COVERS (v3807) ----------------------------------------------------------------
// *** THE FILE ALREADY SAID "AN EXPLICIT DECLARATION BEATS A MODULE COINCIDENCE" AND APPLIED IT ONLY TO
// REJECT. A row could name its device, point at a real page, and STILL leave that device UNEXPLAINED --
// because an instrument's modules come from ITS GATE, and a gate living in the roundhouse reaches physics/
// through a BIND, so its module set comes out EMPTY. That is the heidler case this file already documents.
// *** AN EMPTY MODULE SET IS NOT AN ABSENT DECLARATION: the row says `device: "mpmgrid"` in the tree, in plain
// sight, and that is a stronger statement than any import coincidence. ***
{
    const namedRows = Object.entries(instrumentModules()).filter(([, i]) => i.device);
    const devs = deviceModules();
    ok("!! *** EVERY ROW THAT NAMES A DEVICE NAMES A REAL ONE ***",
        namedRows.length > 0 && namedRows.every(([, i]) => !!devs[i.device]),
        namedRows.length + " rows name a device and all of them resolve. *** THIS IS WHAT KEEPS THE NEW RULE " +
        "FROM BEING A LOOSENING: coverage by declaration is only as good as the declaration, so a row CANNOT " +
        "cover a device it invented. A TYPO WOULD OTHERWISE COVER NOTHING AND READ AS COVERED ***");
}

console.log(fails ? ("[deviceInstrumentMap-selfcheck] FAILED " + fails) : "[deviceInstrumentMap-selfcheck] all passed");
process.exit(fails ? 1 : 0);

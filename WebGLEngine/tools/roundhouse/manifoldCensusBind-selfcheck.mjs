// tools/roundhouse/manifoldCensusBind-selfcheck.mjs
//
// Run: node tools/roundhouse/manifoldCensusBind-selfcheck.mjs   (~1s MEASURED -- two builds, four extractions)
//
// THIS GRADES THE BIND. physics/mesh/manifoldCensus-selfcheck.mjs owns the census itself.
//
// *** THE PROPERTY THIS FILE EXISTS FOR IS THAT A MESH CAN HAVE NO BOUNDARY, EVERY EDGE SHARED BY EXACTLY TWO
// FACES, AND STILL NOT BE A SURFACE. *** Two tetrahedra glued at a single vertex: 8 faces, 12 edges, zero
// boundary edges, zero non-manifold edges. Literally what marchingCubes.js calls watertight, and no
// neighbourhood of the shared vertex looks like a disc.
//
// The textbook bowtie -- two quads sharing a vertex -- is a WEAKER fixture and this file does not use it: it
// also has eight boundary edges, so a plain closed-surface check rejects it without ever consulting the link.
// A fixture that fails for a second reason cannot show that the first test was needed.
"use strict";
import { manifoldCensusDevice, MANIFOLD_OBSERVABLES, eulerCharacteristic, componentCount, eulerDefect }
    from "./manifoldCensusBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { manifoldCensus } from "../../physics/mesh/manifoldCensus.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const isInt = (v) => Number.isInteger(v);

console.log("manifoldCensusBind-selfcheck -- watertight is not manifold\n");

console.log("1. REGISTERED AND REACHABLE");
{
    ok("manifoldCensus appears in DEVICE_NAMES", DEVICE_NAMES.includes("manifoldCensus"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("manifoldCensus");
    ok("!! the registry hands back THIS device", !!d && d.name === "watertight-is-not-manifold", d ? d.name : "nothing");
    ok("it declares plantKind METHOD", d.plantKind === "method",
        "a TEST IS DROPPED and no config value records it, which is why the census cannot see this one");
    const def = d.defaults({});
    ok("!! defaults() returns the whole config, so the knobs are DERIVED",
        ["n", "radius", "mtN", "lo", "hi"].every((k) => k in def.config), Object.keys(def.config).join(", "));
}

console.log("\n2. EVERY ADVERTISED OBSERVABLE IS PRODUCED, AN INTEGER, AND NOTHING EXTRA");
{
    const v = manifoldCensusDevice.build(manifoldCensusDevice.defaults());
    ok("!! no advertised observable is missing", MANIFOLD_OBSERVABLES.every((k) => k in v),
        MANIFOLD_OBSERVABLES.filter((k) => !(k in v)).join(", ") || MANIFOLD_OBSERVABLES.length + " produced");
    ok("!! ...and EVERY ONE IS AN INTEGER, which is what makes this subject exact",
        MANIFOLD_OBSERVABLES.every((k) => isInt(v[k])),
        MANIFOLD_OBSERVABLES.filter((k) => !isInt(v[k])).join(", ") || "all integers. Counts and characteristics "
        + "only -- there is no tolerance anywhere in this device to argue about.");
    ok("...and nothing unadvertised is produced", Object.keys(v).every((k) => MANIFOLD_OBSERVABLES.includes(k)),
        Object.keys(v).filter((k) => !MANIFOLD_OBSERVABLES.includes(k)).join(", ") || "both directions agree");
}

console.log("\n3. *** THE FIXTURE: NO BOUNDARY, PERFECT EDGE INCIDENCE, AND NOT A SURFACE ***");
{
    const v = manifoldCensusDevice.build({ config: {} });
    ok("!! one tetrahedron is a real closed manifold, so the fixture is the control's own shape",
        v.tetraClosed === 1 && v.tetraNmVertices === 0 && v.tetraEuler === 2,
        "closed, 0 pinches, chi 2");
    ok("!! *** two of them glued at ONE VERTEX: zero boundary edges AND zero non-manifold edges ***",
        v.bowtieBoundary === 0 && v.bowtieNmEdges === 0,
        "boundary " + v.bowtieBoundary + ", non-manifold edges " + v.bowtieNmEdges
        + ". *** AN EDGE-ONLY CENSUS REPORTS THIS MESH PERFECT *** -- and that is not a hypothetical, it is what "
        + "marchingCubes.js means by watertight.");
    ok("!! ...and ONLY the vertex link test tells", v.bowtieNmVertices === 1 && v.bowtieClosed === 0,
        "non-manifold vertices " + v.bowtieNmVertices + ", closedManifold " + v.bowtieClosed
        + ". Walk the faces around the shared vertex, take each face's two neighbours of it as a segment: two "
        + "components, so no neighbourhood of that point is a disc.");
    report("THE OPPOSITE NEWS, KEPT SEPARATE: an open quad reads " + v.openQuadBoundary + " boundary edges and "
        + v.openQuadNmVertices + " pinches -- OPEN IS NOT BROKEN. Three faces on one edge read "
        + v.finNmEdges + " non-manifold edge. Folding these into one 'not exactly two' count would put opposite "
        + "news under one label.");
}

console.log("\n4. THE EULER CHARACTERISTIC, AS A LAW RATHER THAN A FIXTURE CONSTANT");
{
    const v = manifoldCensusDevice.build({ config: {} });
    ok("!! chi = 2C holds for the marching-tets sphere, which is manifold BY CONSTRUCTION",
        v.mtEulerDefect === 0 && v.mtComponents === 1 && v.mtEuler === 2 && v.mtFaces > 100,
        v.mtFaces + " faces, " + v.mtComponents + " component, chi " + v.mtEuler);
    ok("!! ...and for dual contouring, which is the extractor that CAN pinch",
        v.dcEulerDefect === 0 && v.dcComponents === 1 && v.dcNmVertices === 0 && v.dcFaces > 100,
        v.dcFaces + " faces, " + v.dcComponents + " component, chi " + v.dcEuler + ", 0 pinches");
    ok("!! *** AND ON A SHAPE THAT SPLITS INTO FOUR PIECES, WHERE THE COUNT IS THE TEST ***",
        v.csgEulerDefect === 0 && v.csgComponents === 4 && v.csgEuler === 8,
        v.csgComponents + " components and chi " + v.csgEuler + ". A box of half-extent 0.9 in z punches clean "
        + "through a sphere of radius 0.55 and leaves four corner pieces. *** THE FOUR IS COUNTED BY UNION-FIND, "
        + "NOT INFERRED FROM THE EIGHT *** -- which is what stops chi = 2C being fitted to its own answer.");
    ok("!! *** the vertex-glued pair BREAKS THE LAW: one component, chi 3, required 2 ***",
        v.bowtieComponents === 1 && v.bowtieEuler === 3 && v.bowtieEulerDefect === 1,
        "defect " + v.bowtieEulerDefect + ". Gluing two spheres at a point gives 4 - 1 = 3, so chi catches the "
        + "interior bowtie WITHOUT LOOKING AT A SINGLE LINK. Two roads to the same no.");
    ok("...and the census re-run directly agrees, so the bind is not reporting its own arithmetic",
        manifoldCensus([[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3], [0, 4, 5], [0, 4, 6], [0, 5, 6], [4, 5, 6]])
            .nonManifoldVertices === 1,
        "manifoldCensus called here on the same faces returns the same 1");
}

console.log("\n5. THE VACUOUS TRUTH NEITHER ROUTE CATCHES");
{
    const v = manifoldCensusDevice.build({ config: {} });
    ok("!! *** THE EMPTY MESH IS CERTIFIED A CLOSED MANIFOLD, AND THAT IS THE MODULE'S OWN VERDICT ***",
        v.emptyClosed === 1,
        "manifoldCensus([]) returns closedManifold: true. It is a conjunction of three zeros -- no boundary, no "
        + "non-manifold edge, no pinch -- and nothing is all three. REPORTED RATHER THAN FIXED HERE: the fix "
        + "belongs to the module.");
    ok("!! ...and CHI DOES NOT CATCH IT EITHER, which is the more useful half",
        v.emptyEuler === 0 && v.emptyComponents === 0 && eulerDefect([]) === 0,
        "chi 0, components 0, so chi = 2C reads 0 = 0 and the Euler law is satisfied vacuously too. *** ADDING A "
        + "SECOND LAW OF THE SAME SHAPE DOES NOT FIX A VACUOUS TRUTH. *** The first draft of the bind's header "
        + "claimed chi = 0 was the number that said so, and it was wrong: only asserting the input is non-empty "
        + "catches this, which is why every closed-manifold claim in section 4 is paired with a face count.");
}

console.log("\n6. *** THE PLANT: EDGE INCIDENCE ONLY -- THE DEFECT THE MODULE WAS WRITTEN TO REMOVE ***");
{
    const h = manifoldCensusDevice.build({ config: {} });
    const p = manifoldCensusDevice.build({ config: { planted: true } });

    ok("!! *** THE VERTEX-GLUED PAIR IS CERTIFIED A CLOSED MANIFOLD ***",
        h.bowtieClosed === 0 && p.bowtieClosed === 1,
        "closedManifold " + h.bowtieClosed + " -> " + p.bowtieClosed + ", pinches " + h.bowtieNmVertices
        + " -> " + p.bowtieNmVertices + ". A mesh that is not a surface, passed as one -- and this is not an "
        + "invented fault: it is precisely the older definition of watertight, which is why the module exists.");
    report("WHICH ROUTES ARE BLIND, ASSERTED SO THE BLINDNESS CANNOT WIDEN SILENTLY.");
    ok("!! *** AND CHI IS BLIND TO THE PLANT, WHICH IS THE POINT OF CARRYING IT ***",
        h.bowtieEuler === p.bowtieEuler && h.bowtieEulerDefect === p.bowtieEulerDefect &&
        p.bowtieEulerDefect === 1,
        "defect " + p.bowtieEulerDefect + " under BOTH. The plant removes a TEST; it does not change V, E or F. "
        + "*** SO UNDER THE PLANT THE LINK TEST GOES SILENT AND CHI STILL READS 3 AGAINST A REQUIRED 2. *** Two "
        + "routes disagreeing is what localises the fault -- a device carrying only the module's own census "
        + "would go entirely quiet.");
    ok("...and every genuinely manifold fixture is bit-identical, so the plant is not just noise",
        h.mtClosed === p.mtClosed && h.dcClosed === p.dcClosed && h.tetraClosed === p.tetraClosed &&
        h.csgNmVertices === p.csgNmVertices && h.mtFaces === p.mtFaces,
        "the sphere extractions and the single tetrahedron read the same under both, because they have no "
        + "pinch for the dropped test to have found. THE PLANT MOVES EXACTLY THE TWO OBSERVABLES IT SHOULD.");
    ok("...and the open and non-manifold-edge fixtures are untouched, being about edges",
        h.openQuadBoundary === p.openQuadBoundary && h.finNmEdges === p.finNmEdges,
        "boundary " + p.openQuadBoundary + ", non-manifold edges " + p.finNmEdges + " -- the plant drops the "
        + "VERTEX test and leaves the edge census exactly as it was");
}

console.log("\n" + (fails ? "manifoldCensusBind-selfcheck: " + fails + " FAILED" : "manifoldCensusBind-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);

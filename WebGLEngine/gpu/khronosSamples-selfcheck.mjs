// WebGLEngine/gpu/khronosSamples-selfcheck.mjs -- v4175
//
// The catalogue is easy to check and the LICENCE POSTURE is the part worth checking, because getting it
// wrong does not produce a wrong picture -- it produces a repository shipping somebody's EULA-licensed model
// to everyone who clones it, and nothing on screen ever looks different.
//
// Section 4 is the one that earns the module: mayVendor() must FAIL CLOSED. Two separate ways of being wrong
// are pinned there, and they are not the same mistake:
//   - treating UNREAD as permitted, which would wave 134 models through on the grounds that nobody looked;
//   - treating READ as permitted, which would wave BrainStem and Duck through on the grounds that Khronos
//     published them. Those two were read, and they are restricted.
//
// Run: node gpu/khronosSamples-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { models, model, tagged, dracoVariants, urlFor, licenceFor, licenceUrlFor, metadataUrlFor,
         mayStream, mayVendor, licenceCoverage, KHRONOS_RAW_BASE } from "./khronosSamples.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };

// 1) THE CATALOGUE IS INTACT and came from the repository's own index rather than being typed out.
{
    const all = models();
    ok(all.length === 150, `150 models in the catalogue (got ${all.length})`);
    ok(new Set(all).size === all.length, "every name is unique");
    ok(all.every((n) => (model(n).variants || []).length > 0), "every model declares at least one variant");
    ok(model("Fox") !== null && model("Sponza") !== null && model("DamagedHelmet") !== null,
        "the models this tree actually names are present");
    ok(model("NoSuchModel") === null, "an unknown name returns null rather than an empty record that reads as valid");

    // the record is a COPY -- a caller that mutates what it got back must not corrupt the table
    const a = model("Fox"); a.variants.push("Invented");
    ok(model("Fox").variants.length !== a.variants.length, "model() hands back a copy, so a caller cannot mutate the catalogue");

    ok(tagged("showcase").length === 24, `24 showcase models (got ${tagged("showcase").length})`);
    ok(tagged("core").length === 66, `66 core models (got ${tagged("core").length})`);
    ok(tagged("nonsense").length === 0, "an unknown tag matches nothing rather than everything");
}

// 2) URL CONSTRUCTION, and the .gltf trap. A .glb variant is one self-contained file; a .gltf variant is a
//    JSON file whose buffers and textures are SEPARATE FILES beside it, so fetching that one URL gets you a
//    manifest and none of the model. Reported as `kind` rather than left to be discovered at parse time.
{
    const fox = urlFor("Fox", "glTF-Binary");
    ok(fox.ok && fox.url === `${KHRONOS_RAW_BASE}/Fox/glTF-Binary/Fox.glb`, `the Fox URL is built correctly (${fox.url})`);
    ok(fox.kind === "self-contained", "and a Binary variant is reported as self-contained");

    const foxJson = urlFor("Fox", "glTF");
    ok(foxJson.ok && foxJson.url.endsWith("/Fox/glTF/Fox.gltf"), "a non-Binary variant derives a .gltf filename, not .glb");
    ok(foxJson.kind === "needs-siblings", "and is reported as needing its sibling files, which a single fetch will not get");

    const abg = urlFor("ABeautifulGame", "glTF-Binary-KTX-ETC1S-Draco");
    ok(abg.ok && abg.url.endsWith(".glb") && abg.kind === "self-contained",
        "a compound variant name containing 'Binary' still resolves to a self-contained .glb");

    ok(urlFor("Fox", "glTF-Draco").ok === false, "asking for a variant a model does not have is refused");
    ok(/has:/.test(urlFor("Fox", "glTF-Draco").error), "and the refusal lists what it DOES have, so the caller can fix it");
    ok(urlFor("NoSuchModel").ok === false, "an unknown model is refused");
}

// 3) THE DRACO VARIANTS -- the reason this module could be built at all. gpu/glbLoad.js routes on the Draco
//    extension and its gate had to state, in as many words, that no Draco-compressed file existed in this
//    tree to test it against. These are where they come from.
{
    const d = dracoVariants();
    ok(d.length === 18, `18 models offer a Draco variant (got ${d.length})`);
    const names = d.map((x) => x.name);
    ok(names.includes("ABeautifulGame"), "ABeautifulGame is among them -- and its Draco variant is a .glb, which is what glbLoad routes on");
    ok(urlFor("ABeautifulGame", "glTF-Binary-KTX-ETC1S-Draco").kind === "self-contained",
        "and that variant is a single self-contained file, so one fetch is the whole model");
    ok(names.includes("Duck") && names.includes("BrainStem"),
        "the set includes Duck and BrainStem -- which matters because both are RESTRICTED, so 'has a Draco variant' is not 'may be vendored'");
}

// 4) *** THE POSTURE. mayVendor MUST FAIL CLOSED, IN BOTH DIRECTIONS. ***
{
    const cov = licenceCoverage();
    ok(cov.total === 150 && cov.read === 16 && cov.unread === 134,
        `16 of 150 licences actually read, 134 not (got read ${cov.read}, unread ${cov.unread})`);
    ok(cov.byPosture.restricted === 2, "two of the sixteen read are restricted");

    // (a) UNREAD IS NOT PERMITTED. Not having looked is not the same as having found nothing wrong.
    const sponza = mayVendor("Sponza");
    ok(sponza.ok === false, "an UNREAD model may not be vendored");
    ok(sponza.posture === "unknown", "and its posture says unknown rather than borrowing the posture of its neighbours");
    ok(/not read yet/.test(sponza.why), "and the reason is that nobody looked, which is actionable");
    ok(licenceFor("Sponza").read === false && licenceFor("Sponza").licenceUrl.endsWith("/Sponza/LICENSE.md"),
        "with the URL to go and read it");

    // (b) *** READ IS NOT PERMITTED EITHER. This is the case that proves the default is a real judgement and
    //     not just caution about the unknown: both of these were read, and both are refused. ***
    const brain = mayVendor("BrainStem"), duck = mayVendor("Duck");
    ok(brain.ok === false && brain.posture === "restricted",
        "BrainStem may NOT be vendored -- its licence is a Poser EULA, Smith Micro Software's, not an open licence");
    ok(duck.ok === false && duck.posture === "restricted",
        "Duck may NOT be vendored -- SCEA Shared Source License 1.0, Sony's");
    ok(licenceFor("BrainStem").read === true && licenceFor("Duck").read === true,
        "and BOTH were read, so this is a finding and not an absence of information");
    ok(/stream only/.test(brain.why) && /stream only/.test(duck.why), "the refusal says what IS still allowed rather than only what is not");

    // (c) STREAMING IS A DIFFERENT ACT and stays permitted for both -- the user's browser fetching a URL is
    //     not this repository redistributing bytes.
    ok(mayStream("BrainStem") === true && mayStream("Duck") === true,
        "both may still be STREAMED, because a fetch the user's browser makes redistributes nothing");
    ok(mayStream("NoSuchModel") === false, "while something not in the catalogue cannot be streamed either");

    // (d) PERMITTED MODELS CARRY THEIR OBLIGATION. CC-BY is permission WITH a condition, and a module that
    //     returned a bare true would have dropped the condition on the floor.
    const fox = mayVendor("Fox");
    ok(fox.ok === true, "the Fox may be vendored");
    ok(fox.needsAttribution === true, "and it is flagged as needing attribution -- the mesh is CC0 but the rig and conversion are CC-BY");
    ok(/PixelMannen/.test(fox.who) && /tomkranis/.test(fox.who), `and the credit that must travel with it is carried (${fox.who})`);
    ok(licenceFor("Fox").spdx.includes("CC0-1.0") && licenceFor("Fox").spdx.includes("CC-BY-4.0"),
        "both identifiers are recorded, because a model can be several licences at once and the strictest governs");

    const lantern = mayVendor("Lantern");
    ok(lantern.ok === true && lantern.needsAttribution === false && lantern.posture === "public-domain",
        "a CC0-throughout model is vendorable with no attribution obligation");

    // (e) CONTROL: a permissive default would wave through 134 models nobody has looked at, plus the two
    //     that were looked at and refused. Without this, section 4 could pass on a function that says yes.
    const wouldPass = models().filter((n) => licenceFor(n).posture !== "restricted").length;
    ok(wouldPass === 148, `control: treating anything-not-known-bad as vendorable would clear ${wouldPass} of 150 models, 134 of them unexamined`);
    const actuallyPass = models().filter((n) => mayVendor(n).ok).length;
    ok(actuallyPass === 14, `while mayVendor clears only the ${actuallyPass} that were read AND found permissive`);
    ok(actuallyPass < wouldPass, "so the closed default is doing real work rather than agreeing with the open one");
}

// 5) THE READ-IT-YOURSELF URLS resolve for every model, read or not -- the 134 unknowns are actionable, not
//    a dead end.
{
    ok(models().every((n) => licenceUrlFor(n).startsWith(KHRONOS_RAW_BASE) && licenceUrlFor(n).endsWith("/LICENSE.md")),
        "every model has a licence URL, including the 134 nobody has read");
    ok(metadataUrlFor("Fox").endsWith("/Fox/metadata.json"), "and a metadata URL, which is where the artist credits live");
    // names with characters needing encoding must not produce a broken URL
    const odd = models().find((n) => /[^A-Za-z0-9._-]/.test(n));
    ok(odd !== undefined, `the catalogue contains at least one name needing URL encoding (${odd})`);
    ok(!/ /.test(urlFor(odd, model(odd).variants[0]).url || ""), `and its URL is encoded rather than left with raw spaces`);
}

console.log(`khronosSamples-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

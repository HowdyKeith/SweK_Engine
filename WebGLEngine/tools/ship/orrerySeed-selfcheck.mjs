// WebGLEngine/tools/ship/orrerySeed-selfcheck.mjs -- v4189
//
// GATES world/orrerySeed.mjs and the seeded-planet path: the git log as the universe's seed.
//
// *** THE CLAIM THIS FILE EXISTS TO HOLD, IN KEITH'S WORDS: *** "if we ran the simulation twice it would be
// expected to run the same every time if the github was not updated." That is a testable property and not a
// wish, so section 6 runs the whole pipeline twice and compares, and then changes ONE commit hash and checks
// that exactly one body's world moved.
//
// *** AND THE FACT ABOUT THIS REPOSITORY THAT SHAPED THE DESIGN. *** NINE of the fourteen vendored bodies
// share one first commit -- 66db97c45b52, where vendor/ was first added. Seeding on the SHA alone would give
// those nine THE SAME PLANET. Section 2 is that, as a fixture, because it is the mistake anyone reaching for
// "use the commit hash" makes first and the picture that results looks fine.
//
// Run: node tools/ship/orrerySeed-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { fnv1a, seedFor, seedProvenance, seedsFor, SEP } from "../../world/orrerySeed.mjs";
import { buildOrrery } from "../../world/orrery.mjs";
import { firstCommit, scanVendor } from "./orreryScan.mjs";
import { bakePayload, readBaked, drift, BAKE_PATH, serialise } from "./orreryBake.mjs";
import { planetSpec, bakeEquirect } from "../../world/procPlanet.js";
import { noComments, codeOnly, prose } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(ENG, "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const sha256 = (buf) => crypto.createHash("sha256").update(Buffer.from(buf)).digest("hex");

const SHARED = "66db97c45b5286d98d1c018506effca552f05a23";

// 1) THE FOLD.
{
    ok(fnv1a("abc") === fnv1a("abc"), "the same string folds to the same number");
    ok(fnv1a("abc") !== fnv1a("abd"), "and one character apart folds differently");
    ok(fnv1a("") === 0x811c9dc5, "the empty string is the FNV offset basis, unmodified");
    ok(fnv1a(null) === fnv1a(""), "null is treated as empty rather than throwing");
    const vals = ["a", "b", "c", "draco", "three", "krbn", "wasm", "jolt"].map(fnv1a);
    ok(vals.every((v) => v >= 0 && v <= 0xffffffff && Number.isInteger(v)), "every fold is a uint32");
    ok(new Set(vals).size === vals.length, "and eight distinct inputs give eight distinct outputs");
}

// 2) *** THE NINE THAT SHARE A COMMIT. THE HEADLINE FIXTURE. ***
{
    const nine = ["box3d", "fonts", "gifenc", "htmx", "jolt", "krbn", "slug", "three", "wasm"];
    const seeds = nine.map((n) => seedFor(SHARED, n));
    ok(new Set(seeds).size === nine.length,
        `*** the ${nine.length} bodies that share commit 66db97c45b52 get ${new Set(seeds).size} DISTINCT seeds -- the SHA alone would give them one planet ***`);
    ok(seeds.every((s) => Number.isInteger(s) && s >= 0), "and all of them are real uint32 seeds");

    // the control: the mistake this guards against, stated so it cannot be argued away
    const naive = nine.map(() => fnv1a(SHARED));
    ok(new Set(naive).size === 1, "control: folding the SHA WITHOUT the name really does collapse all nine to one seed");

    // and the same name under different commits must move
    ok(seedFor(SHARED, "three") !== seedFor("7985f885e6a11a92c2e43c70cba25b76779262fd", "three"),
        "the same body under a different first commit is a different world");
}

// 3) *** THE WHOLE HASH, NOT ITS ABBREVIATION. ***
{
    const flipped = SHARED.slice(0, 39) + (SHARED[39] === "3" ? "4" : "3");
    ok(seedFor(SHARED, "three") !== seedFor(flipped, "three"),
        "*** changing the LAST character of the hash changes the seed -- so all 40 characters are read ***");
    ok(seedFor(SHARED.slice(0, 8), "three") !== seedFor(SHARED, "three"),
        "and an abbreviated hash seeds a different universe, so the choice to fold all of it is visible rather than incidental");
    // a middle character too, in case only the ends were folded
    const mid = SHARED.slice(0, 20) + (SHARED[20] === "1" ? "2" : "1") + SHARED.slice(21);
    ok(seedFor(mid, "three") !== seedFor(SHARED, "three"), "and a character in the MIDDLE moves it too");
}

// 4) A MISSING HASH IS AN ANSWER, NOT A DEFAULT.
{
    ok(seedFor(null, "three") !== 0, "*** a body git cannot date does not get seed 0 ***");
    ok(seedFor(null, "three") !== seedFor(null, "krbn"), "and two undated bodies still get different planets, from their names");
    ok(seedFor(null, "x") === seedFor("", "x"), "null and empty are the same missing hash");
    ok(seedProvenance(SHARED).sourced === true && seedProvenance(null).sourced === false,
        "seedProvenance reports whether the git half is really there, so a view can say so");
    ok(seedProvenance("66db97c").sourced === false, "an abbreviation is NOT accepted as a sourced hash -- 7 characters is not 40");
    ok(seedProvenance("ZZZZ" + SHARED.slice(4)).sourced === false, "and non-hex is refused");

    ok(SEP.length > 0, "there is a separator");
    ok(seedFor("ab", "c") !== seedFor("a", "bc"), "*** which is what stops ('ab','c') and ('a','bc') seeding identically ***");
}

// 5) THE SCANNER READS THE HASH, FROM ONE CALL.
{
    const fc = firstCommit(REPO, "WebGLEngine/vendor/three");
    ok(/^[0-9a-f]{40}$/.test(fc.sha || ""), `firstCommit returns a full 40-character hash (${String(fc.sha).slice(0, 12)}...)`);
    ok(/^\d{4}-\d{2}-\d{2}$/.test(fc.date || ""), `and its date (${fc.date}) from the SAME invocation, so the two cannot straddle a commit`);
    const missing = firstCommit(REPO, "WebGLEngine/vendor/__no_such_body__");
    ok(missing.sha === null && missing.date === null, "a path git has never seen returns nulls rather than throwing");

    const live = scanVendor(ENG, REPO);
    ok(live.length > 0 && live.every((b) => b.sha === null || /^[0-9a-f]{40}$/.test(b.sha)),
        `every one of the ${live.length} scanned bodies carries a full hash or an honest null`);
    const counts = new Map();
    for (const b of live) counts.set(b.sha, (counts.get(b.sha) || 0) + 1);
    const biggest = Math.max(...counts.values());
    ok(biggest >= 5, `*** and the tree really does share commits: ${biggest} bodies came in on one of them ***`);
    const seeds = seedsFor(live);
    ok(new Set([...seeds.values()]).size === live.length,
        `yet all ${live.length} bodies still seed distinctly (${new Set([...seeds.values()]).size} unique)`);
}

// 6) *** RUN IT TWICE. THE WHOLE CLAIM. ***
{
    const raw = readBaked();
    ok(!!raw, "orrery.json exists");
    const build = () => buildOrrery(raw.bodies, { today: "2026-08-30" });
    const a = build(), b = build();
    ok(JSON.stringify(a) === JSON.stringify(b), "*** two builds of an unchanged repository are IDENTICAL, field for field ***");

    // and the planets themselves, which is where a stray Math.random would show
    const bake = (sys) => sys.bodies.map((x) => sha256(bakeEquirect(planetSpec(x.seed), 64, 32).rgba));
    const pa = bake(a), pb = bake(b);
    ok(pa.join() === pb.join(), `*** and so are all ${pa.length} planet surfaces, byte for byte ***`);
    ok(new Set(pa).size === pa.length, "with no two bodies wearing the same world");

    // *** CHANGE ONE COMMIT, AND EXACTLY ONE THING MOVES. ***
    const bent = JSON.parse(JSON.stringify(raw));
    const victim = bent.bodies.findIndex((x) => x.sha);
    bent.bodies[victim].sha = "0".repeat(39) + "1";
    const c = buildOrrery(bent.bodies, { today: "2026-08-30" });
    const pc = bake(c);
    const moved = pa.filter((h, i) => h !== pc[i]).length;
    ok(moved === 1, `*** changing ONE commit hash changes exactly ONE planet (${moved}) -- a new commit does not reshuffle the universe ***`);
    ok(c.bodies[0].a === a.bodies[0].a, "and the orbits, which come from dates rather than hashes, do not move at all");
}

// 7) THE BAKE CARRIES IT, AND STALENESS SEES IT.
{
    const baked = readBaked();
    ok(baked.bodies.every((b) => b.sha === null || /^[0-9a-f]{40}$/.test(b.sha)),
        "the baked file carries full hashes, because a browser cannot run git");
    ok(serialise(bakePayload(ENG, REPO)) === fs.readFileSync(BAKE_PATH, "utf8"),
        "*** orrery.json is current -- run: node tools/ship/orreryBake.mjs --write ***");
    ok(drift(ENG, REPO).length === 0, "and drift() agrees");

    // a changed hash is a different planet, so staleness must NOTICE it and not just the byte count
    const tmp = path.join(ENG, ".orrery-seed-probe.json");
    const bent = JSON.parse(fs.readFileSync(BAKE_PATH, "utf8"));
    bent.bodies[0].sha = "0".repeat(40);
    fs.writeFileSync(tmp, JSON.stringify(bent));
    const d = drift(ENG, REPO, tmp);
    fs.unlinkSync(tmp);
    ok(d.some((m) => /sha/.test(m)), "*** a baked hash that no longer matches git is reported by name ***");
}

// 8) THE PLANETS ARE DETERMINISTIC, which is the property that made them free to use.
{
    const s = planetSpec(913430330);
    ok(s && typeof s.type === "string", "planetSpec returns a world with a type");
    ok(JSON.stringify(planetSpec(913430330)) === JSON.stringify(s), "the same seed gives the same spec");
    const h1 = sha256(bakeEquirect(s, 64, 32).rgba), h2 = sha256(bakeEquirect(planetSpec(913430330), 64, 32).rgba);
    ok(h1 === h2, `*** the same seed bakes a byte-identical surface (${h1.slice(0, 16)}) ***`);
    ok(sha256(bakeEquirect(planetSpec(913430331), 64, 32).rgba) !== h1, "and the next seed along is a different world");

    // *** THE GAS GIANT BUG, AS A FIXTURE. *** procPlanet gave gas giants seaLevel 1.0, and surfaceColor asks
    // `height < seaLevel` -- true for every pixel -- so the latitudinal banding it had just computed was
    // overwritten with a flat sea colour on every one. Both gas giants in this tree painted the SAME
    // featureless disc, byte for byte at every resolution, despite different noise seeds. Its own 419 checks
    // never looked at what a gas giant painted; the orrery found it by noticing two commits wearing one world.
    const gasA = planetSpec(2345970573), gasB = planetSpec(3387998312);
    ok(gasA.type === "gas" && gasB.type === "gas", "fixture: both of these seeds really are gas giants");
    ok(gasA.seaLevel === 0 && gasB.seaLevel === 0, "*** a gas giant has NO sea, so its sea level is 0 and the band ramp covers the whole range ***");
    ok(sha256(bakeEquirect(gasA, 64, 32).rgba) !== sha256(bakeEquirect(gasB, 64, 32).rgba),
        "*** and two gas giants with different noise seeds now paint DIFFERENT worlds ***");
    ok(bakeEquirect(gasA, 64, 32).seaFraction === 0, "and report no sea at all, which is what a gas giant has");
    // the banding must actually be visible, not merely present in the arithmetic
    const px = bakeEquirect(gasA, 64, 32).rgba;
    const rows = new Set();
    for (let y = 0; y < 32; y++) rows.add(px[(y * 64) * 4] + "," + px[(y * 64) * 4 + 1]);
    ok(rows.size > 4, `*** the bands are VISIBLE -- ${rows.size} distinct latitude colours down one meridian, not one flat disc ***`);
}

// 9) THE SOURCE: no randomness, and the view never lets generated pass for measured.
{
    const seedC = codeOnly(read("world/orrerySeed.mjs"));
    ok(!/Math\.random|Date\.now|performance\.now/.test(seedC), "the seed module has no clock and no randomness");
    ok(/Math\.imul/.test(seedC), "and folds in integer math, so every machine agrees");
    ok(/40/.test(seedC) || /\{40\}/.test(read("world/orrerySeed.mjs")), "it knows what a full hash looks like");

    const drawSrc = read("ui/orreryDraw.js");
    ok(/from "\.\.\/world\/procPlanet\.js"/.test(noComments(drawSrc)), "the draw module uses the real procPlanet rather than a copy");
    ok(!/Math\.random/.test(codeOnly(drawSrc)), "and adds no randomness of its own to the picture");

    // *** THE LABEL IS THE HONESTY, AND IT IS GATED. ***
    const page = read("orrery.html"), pageS = noComments(page);
    ok(/SURFACE_SEEDED/.test(pageS) && /SURFACE_MEASURED/.test(pageS), "the page names both surfaces");
    ok(/generated/.test(read("ui/orreryDraw.js")) && /measured/.test(read("ui/orreryDraw.js")),
        "*** and the two constants say GENERATED and MEASURED in words, not 'mode 0' and 'mode 1' ***");
    ok(/caption\(`\$\{focus\.name\} — \$\{SURFACE_SEEDED\}/.test(page),
        "*** the seeded caption states it is generated EVERY time it draws -- a viewer must never be left guessing which they see ***");
    ok(/focus\.sha/.test(pageS) && /focus\.seed/.test(pageS), "and it names the commit and the seed, so the claim is checkable from the screen");
    ok(/simply|hash|generated/i.test(prose(read("world/orrerySeed.mjs"))), "the seed module explains itself in prose");
    ok(/nine|9 /i.test(prose(read("world/orrerySeed.mjs"))), "including the nine-bodies-one-commit fact that shaped it");
}

console.log(`orrerySeed-selfcheck: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`unchecked here: whether the generated planets are PRETTY. What is checked is Keith's rule --
run it twice and nothing moves, change one commit and exactly one world changes -- and that a
generated surface is never allowed to pass for a measured one.`);
process.exit(fail ? 1 : 0);

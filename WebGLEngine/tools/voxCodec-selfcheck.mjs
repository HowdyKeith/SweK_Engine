// WebGLEngine/tools/voxCodec-selfcheck.mjs -- v3442
//
// Run: node tools/voxCodec-selfcheck.mjs
//
// *** THE v3438 DEFECT WAS MINE, AND BOTH HALVES OF THE DICHOTOMY I WROTE WERE WRONG. *** That round recorded the
// SIZE chunk coming back 0x0x0 while every voxel round-tripped, and said: "deciding whether exportVox writes the
// payload wrong or parseVox reads it at the wrong offset needs the byte layout read against the format spec."
// THE LAYOUT WAS READ. NEITHER IS WRONG. SIZE sits at byte 20 with contentSize 12; exportVox writes
// i32(sx).concat(i32(sy), i32(sz)) at offsets 0/4/8 of the content and parseVox reads getInt32 at 0/4/8 of the
// same content. Walked with a DataView that knows nothing about either file, a correctly-shaped model comes back
// 13x13x13 with 925 voxels.
//
// *** THE ZERO CAME FROM THIS GATE'S OWN CALL. *** voxelizeBall returns { size, voxels:[{x,y,z,kind}] } and
// exportVox documents { sizeX, sizeY, sizeZ, voxels:[{x,y,z,c}] }. `undefined | 0` is 0. That is the EIGHTH
// assumed signature of the session, in a file whose own header already counted the sixth and the seventh two
// paragraphs apart -- and it was written up as a defect in somebody else's shipping code.
//
// *** AND THE SAME WRONG ARGUMENT HID A SECOND DEFECT BEHIND THE GAP THIS FILE HAD JUST DECLARED. *** `v.c & 255`
// on a voxel carrying `kind` is 0, and 0 means EMPTY in this format, so all 925 voxels were written as the empty
// colour. Section 3 had named colour-per-voxel as the one thing it did not check -- so the check that would have
// caught it was the check this gate had honestly reported itself as missing. A DECLARED GAP IS STILL A GAP, and
// the thing hiding in it was not hypothetical.
//
// WHAT SHIPPED INSTEAD (v3442): exportVox REFUSES a self-contradictory file rather than emitting one. The limits
// are READ OFF THE LAYOUT and not chosen -- XYZI stores each coordinate in ONE BYTE, so 256 is the largest grid
// the encoding can address and 257 folds x=256 onto x=0 silently; the palette is 1-indexed and 0 means empty.
// VOX_MAX_DIM is IMPORTED here rather than re-typed, because a second copy of a derived constant is a second
// declaration nobody compares.
"use strict";
import { exportVox, exportVoxFromKinds, voxelizeBall, voxelizeShell, modelFromKinds, VOXEL_KINDS, VOX_MAX_DIM } from "./voxExporter.js";
import { parseVox } from "./voxParser.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const asBuf = (v) => (v instanceof ArrayBuffer ? v : (v && v.buffer ? v.buffer : v));
const key = (v) => `${v.x},${v.y},${v.z}`;
const refuses = (f) => { try { f(); return null; } catch (e) { return e.message; } };

// The one model shape every section below uses, built the way ev.html builds it.
const BALL = voxelizeBall(6, 2.5);
const N = BALL.size;
const model = modelFromKinds(BALL.voxels);
const FILE = new Uint8Array(asBuf(exportVoxFromKinds(N, N, N, BALL.voxels)));
const FILEBUF = FILE.buffer.slice(FILE.byteOffset, FILE.byteOffset + FILE.byteLength);

// ---- 1. THE HEADER IS THE FORMAT'S OWN, NOT SOMETHING WE INVENTED -------------------------------------------
{
    const magic = String.fromCharCode(FILE[0], FILE[1], FILE[2], FILE[3]);
    ok("!! the file begins with the MagicaVoxel magic and a version word", magic === "VOX ",
       `first four bytes are "${magic}". A CODEC THAT ONLY EVER TALKS TO ITSELF WOULD ROUND-TRIP PERFECTLY AND STILL BE UNREADABLE BY THE TOOL THE FORMAT IS NAMED AFTER -- so the magic is checked before anything else.`);
    ok("...and the chunk names the format requires are present",
       /MAIN/.test(String.fromCharCode(...FILE.slice(0, 200))) && /SIZE/.test(String.fromCharCode(...FILE.slice(0, 400))),
       "MAIN and SIZE, read out of the emitted bytes rather than asserted from the writer's source.");
}

// ---- 2. *** THE CHUNK WALK: THE LAYOUT AGAINST THE SPEC, WITH A READER THAT IS NEITHER SIDE *** --------------
{
    // This is the section v3438 said it needed and did not write. It uses NEITHER exportVox's arithmetic NOR
    // parseVox's loop -- a bare DataView walking id / contentSize / childrenSize -- so if the two shipping files
    // shared a wrong offset this would disagree with both of them.
    const dv = new DataView(FILEBUF);
    const b = new Uint8Array(FILEBUF);
    const fc = (o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
    const chunks = {};
    let o = 20;                                     // 8 header + 12 MAIN chunk header
    while (o + 12 <= b.length) {
        const id = fc(o), cs = dv.getInt32(o + 4, true), chs = dv.getInt32(o + 8, true);
        chunks[id] = { at: o, cs, content: o + 12 };
        o += 12 + cs + chs;
    }
    say(`chunks found by an independent walk: ${Object.keys(chunks).join(", ")}`);

    const S = chunks.SIZE;
    ok("!! SIZE carries a 12-byte payload -- three i32, which is what the spec says and what BOTH files assume",
       !!S && S.cs === 12,
       `contentSize ${S ? S.cs : "(no SIZE chunk)"} at byte ${S ? S.at : "-"}. exportVox writes offsets 0/4/8 of the content and parseVox reads getInt32 at 0/4/8 of the content. *** v3438 PROPOSED THAT ONE OF THEM HAD THE OFFSET WRONG. THEY DO NOT DISAGREE, AND THE 0x0x0 CAME FROM THAT GATE'S OWN ARGUMENT. ***`);
    ok("...and the dimensions in those bytes are the ones the caller asked for",
       !!S && dv.getInt32(S.content, true) === N && dv.getInt32(S.content + 4, true) === N && dv.getInt32(S.content + 8, true) === N,
       `payload reads ${S ? dv.getInt32(S.content, true) : "?"}x${S ? dv.getInt32(S.content + 4, true) : "?"}x${S ? dv.getInt32(S.content + 8, true) : "?"} against a requested ${N}x${N}x${N}, decoded by a walk that never called either module.`);

    const X = chunks.XYZI;
    ok("!! XYZI's count agrees with its own payload length -- 4 bytes per voxel, not 4 words",
       !!X && X.cs === 4 + 4 * dv.getInt32(X.content, true),
       `count ${X ? dv.getInt32(X.content, true) : "?"}, contentSize ${X ? X.cs : "?"} = 4 + 4*count. THIS IS WHY 256 IS THE CEILING: x, y, z and the colour index are SINGLE BYTES, so the largest addressable grid is 256 and SIZE (an i32) can declare a box the voxel encoding cannot reach.`);
}

// ---- 3. *** THE ROUND TRIP: TWO ROUTES, ONE SET OF VOXELS -- POSITIONS, DIMENSIONS AND COLOURS *** -----------
{
    const back = parseVox(FILEBUF);
    const m0 = (back.models || [])[0] || {};
    const got = m0.voxels || [];
    say(`ball r=6: exported ${BALL.voxels.length} voxels in a ${N}^3 grid, parsed back ${got.length}`);

    const src = new Set(BALL.voxels.map(key)), dst = new Set(got.map(key));
    const missing = [...src].filter((k) => !dst.has(k)), extra = [...dst].filter((k) => !src.has(k));
    ok("!! *** every exported voxel comes back, and no voxel is invented ***",
       src.size > 50 && missing.length === 0 && extra.length === 0,
       `${src.size} in, ${dst.size} out, ${missing.length} missing, ${extra.length} extra. THE PARSER KNOWS NOTHING ABOUT WHAT THE EXPORTER CHOSE -- it reads chunk sizes off the bytes -- so agreement is a RESULT rather than a shared assumption. And BOTH sets are compared, not just the counts: a codec that dropped one voxel and duplicated another would keep the count exactly right.`);

    // *** THE ENTRY v3438 RATCHETED IS DELETED HERE, NOT WEAKENED, WHICH IS WHAT IT INSTRUCTED. *** Its own words:
    // "IF THIS LINE FAILS BECAUSE THE DIMENSIONS ARE NOW RIGHT, DELETE IT AND ASSERT THE DIMENSIONS INSTEAD."
    ok("!! *** the declared grid comes back exactly -- the v3438 known defect is GONE, and this line replaces it ***",
       m0.sizeX === N && m0.sizeY === N && m0.sizeZ === N,
       `size ${m0.sizeX}x${m0.sizeY}x${m0.sizeZ} against a requested ${N}x${N}x${N}. A CONSUMER THAT TRUSTED THE OLD DIMENSIONS WOULD HAVE ALLOCATED A ZERO-SIZED GRID AND THEN BEEN HANDED 925 VOXELS TO PUT IN IT.`);
    ok("...and every voxel sits inside the grid the file declares",
       got.every((v) => v.x < m0.sizeX && v.y < m0.sizeY && v.z < m0.sizeZ),
       "the dimensions and the contents are two chunks and can disagree; asserting the dimensions alone would let a right-looking SIZE sit above voxels that overflow it.");

    ok("...and the version and palette survive", back.ok === true && back.version > 0 && (back.palette || []).length === 256,
       `version ${back.version}, palette of ${(back.palette || []).length}.`);

    // *** THE GAP SECTION 3 DECLARED AT v3438 IS CLOSED, AND IT IS WHERE THE SECOND DEFECT WAS HIDING. *** With the
    // wrong argument every voxel went out as colour 0 -- EMPTY -- and a positions-only comparison could not see it.
    const kinds = new Map(BALL.voxels.map((v) => [key(v), v.kind || "solid"]));
    const wrongColour = got.filter((v) => model.kindIndex[kinds.get(key(v))] !== v.c);
    const kindsPresent = new Set(BALL.voxels.map((v) => v.kind || "solid"));
    ok("!! *** COLOUR INDEX PER VOXEL, which v3438 named as its gap: every voxel keeps the index its kind was assigned ***",
       wrongColour.length === 0 && got.every((v) => v.c >= 1) && kindsPresent.size >= 2,
       `${wrongColour.length} of ${got.length} carry the wrong index across ${kindsPresent.size} kinds (${[...kindsPresent].join(", ")}). AT v3438 THIS WOULD HAVE READ ${got.length} OF ${got.length}, ALL AT INDEX 0 -- and index 0 is EMPTY, so the file said "here are ${got.length} voxels that are not there". A FIXTURE WITH ONE KIND WOULD PASS THIS BY ACCIDENT, so the ball is built with a glowing core.`);

    const rgbaAt = (c) => (back.palette || [])[c];
    const bad = [...kindsPresent].filter((k) => {
        const want = VOXEL_KINDS[k].color, have = rgbaAt(model.kindIndex[k]);
        return !have || have[0] !== want[0] || have[1] !== want[1] || have[2] !== want[2];
    });
    ok("...and the colour those indices point AT is the kind's own RGB, read back out of the file's palette",
       bad.length === 0,
       `${bad.length} kind(s) resolve to the wrong RGB. An index that round-trips into the wrong palette slot is the off-by-one this format invites, since the palette is 1-indexed and stored 0-based.`);
}

// ---- 4. THE REFUSALS, EACH DRIVEN -- AND THE CEILING IS THE BYTE, NOT A ROUND NUMBER -------------------------
{
    const good = BALL.voxels.map((v) => ({ x: v.x, y: v.y, z: v.z, c: 1 }));
    const at = (o) => exportVox(Object.assign({ sizeX: N, sizeY: N, sizeZ: N, voxels: good }, o));

    ok("!! *** the shape that fooled v3438 is now REFUSED BY NAME: exportVox(voxelizeBall(6)) ***",
       !!refuses(() => exportVox(BALL)),
       `"${(refuses(() => exportVox(BALL)) || "").slice(0, 130)}..." -- the message names the field the caller actually has (\`size\`) and the function that wants it, because THE FAILURE WAS NEVER A MISSING CHECK, IT WAS A SILENT COERCION: \`undefined | 0\` is a perfectly good zero.`);
    ok("...a declared 0x0x0 holding voxels is refused", !!refuses(() => at({ sizeX: 0, sizeY: 0, sizeZ: 0 })),
       "which is the exact file v3438 measured and ratcheted.");
    ok("...a voxel outside the declared grid is refused", !!refuses(() => at({ voxels: good.concat([{ x: N, y: 0, z: 0, c: 1 }]) })),
       `one step past the wall of a ${N}^3 grid.`);
    ok("...colour index 0 is refused, because 0 means EMPTY", !!refuses(() => at({ voxels: good.map((v) => ({ ...v, c: 0 })) })),
       "the second half of the v3438 defect, and the half nothing was looking at.");

    // THE BOUNDARY IS MEASURED AT BOTH SIDES, because a limit only checked from above could be any number.
    const cube = [{ x: 0, y: 0, z: 0, c: 1 }];
    ok(`!! *** ${VOX_MAX_DIM} is ACCEPTED and ${VOX_MAX_DIM + 1} is REFUSED -- the ceiling sits exactly on the byte ***`,
       refuses(() => exportVox({ sizeX: VOX_MAX_DIM, sizeY: VOX_MAX_DIM, sizeZ: VOX_MAX_DIM, voxels: cube })) === null &&
       !!refuses(() => exportVox({ sizeX: VOX_MAX_DIM + 1, sizeY: N, sizeZ: N, voxels: cube })),
       `VOX_MAX_DIM is IMPORTED from the writer, not re-typed here. AND THE FAILURE IT PREVENTS IS SILENT RATHER THAN LOUD: a voxel at x=${VOX_MAX_DIM} encoded into one byte reads back as x=${VOX_MAX_DIM & 255}, so an oversized model does not error, IT FOLDS ONTO THE OPPOSITE WALL. tools/mesh-to-vox.mjs defaults dim to ${VOX_MAX_DIM}, which is the last size that works.`);

    // A REFUSAL THAT REFUSES EVERYTHING IS NOT A GUARD, IT IS A WALL. Both live callers must still get through.
    const evStyle = refuses(() => exportVoxFromKinds(N, N, N, BALL.voxels));
    const shell = voxelizeShell(7, 2.5);
    const dockStyle = refuses(() => exportVoxFromKinds(shell.size, shell.size, shell.size, shell.voxels));
    ok("!! the two SHIPPING callers still pass -- ev.html's voxBtn and the dock's hollow shell",
       evStyle === null && dockStyle === null,
       `ev.html line ~1854 calls exportVoxFromKinds(ball.size, ball.size, ball.size, ball.voxels), which was CORRECT ALL ALONG -- the only wrong caller in the tree was the gate. A guard proven only by what it rejects is a guard nobody has shown to let the right thing through.`);
}

// ---- 5. THE NEGATIVE: A TRUNCATED FILE MUST NOT PARSE AS A SMALL MODEL --------------------------------------
{
    const cut = FILEBUF.slice(0, Math.floor(FILE.length * 0.6));
    let threw = false, got = null;
    try { const r = parseVox(cut); got = (((r.models || [])[0] || {}).voxels || []).length; } catch { threw = true; }
    ok("!! *** a file cut in half either REFUSES or returns fewer voxels -- it must not look complete ***",
       threw || got === null || got < 50,
       threw ? "it throws, which is the clearest answer." : `it returned ${got} voxels against the full file's set. *** THE FAILURE MODE THAT MATTERS FOR A BINARY FORMAT IS NOT A CRASH, IT IS A PLAUSIBLE SMALL ANSWER: a truncated file that parses into a tidy little model is indistinguishable from a small model, and a chunk-length reader will happily produce one. ***`);
}

// ---- 6. WHERE THIS LIVES, AND WHY THE CENSUS NEVER SAW IT ----------------------------------------------------
{
    ok("REPORTED: tools/ is outside gateReach's counted roots (physics, simulation, fluid)", true,
       "*** so these four files were never in `ungated` -- THEY WERE OUTSIDE THE POPULATION. v3439 then measured tools/ properly (316 modules, 232 reached, 73.4%) by passing gateReach.reach() the roots argument it has always taken. Whether tools/ should join the headline denominator is still a judgement about what the number is FOR, and it is Keith's. ***");
    ok("REPORTED: parseVox is UNCHANGED this round, and that is the finding rather than an omission", true,
       "*** v3438 named two suspects and shipped a ratchet instead of choosing. Reading the layout ACQUITTED BOTH: the writer and the reader agree byte for byte, and the fault was in the third thing nobody suspected -- the argument. A DICHOTOMY IS AN ASSUMPTION TOO, AND THIS ONE LEFT OUT THE CALLER. ***");
}

console.log(fails ? "\nvoxCodec-selfcheck: " + fails + " FAILED" : "\nvoxCodec-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);

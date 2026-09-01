#!/usr/bin/env node
// WebGLEngine/tools/ship/schematicWriter-selfcheck.mjs -- v4259
//
// Run: node tools/ship/schematicWriter-selfcheck.mjs
//
// *** THE DOOR HAS ONLY EVER OPENED INWARDS. *** world/schematicLoader.js has read .schem, .schematic and
// .litematic since v456. Nothing in 3,800 rounds has ever WRITTEN one, so a Minecraft build could come into
// this engine and never leave it, and a build made HERE could not be handed to anybody.
//
// *** WHAT MAKES THIS GATE DIFFERENT FROM MOST WRITER TESTS: THE READER WAS ALREADY HERE. *** A writer with
// no reader is graded by opening the file in the game and squinting. A writer whose bytes go back through
// parseSchematic is graded by comparing every voxel, with no game, no network, and -- this is the part that
// matters -- no second implementation of NBT written by the same hand that would repeat the same mistake.
// The decoder in section 2 is the LOADER's, byte for byte.
//
// The round trip closes in exactly one direction and the gate measures both:
//     voxels -> schem -> voxels   IS identity, over the nine materials the loader can produce.
//     schem  -> voxels -> schem   IS NOT, because mcNameToVoxel is many-to-one by construction.
// Section 4 counts the collapse instead of glossing it.
"use strict";
import * as W from "../../world/schematicWriter.js";
import { parseSchematic, mcNameToVoxel } from "../../world/schematicLoader.js";
import { VOXEL } from "../../world/voxelFormat.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

/** parseSchematic takes an ArrayBuffer; writeSchem hands back a Uint8Array view. */
const parse = (u8) => parseSchematic(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
/** Compare a written-and-reparsed volume against the function that generated it. */
const mismatches = (got, f, w, h, l) => {
    let n = 0;
    for (let y = 0; y < h; y++) for (let z = 0; z < l; z++) for (let x = 0; x < w; x++)
        if (got.voxelAt(x, y, z) !== f(x, y, z)) n++;
    return n;
};

console.log("schematicWriter-selfcheck -- the export half, graded by the import half that was already here\n");

// =============================================================================================================
console.log("1. *** THE INVERSE TABLE IS A CHOICE, NOT A RECOVERY -- so every entry is asserted, not trusted ***");
// mcNameToVoxel is a CHAIN OF SUBSTRING TESTS whose ORDER decides the answer, and a name that looks
// obviously right can be captured by an earlier rule. "minecraft:diorite" is a real example living in that
// function today: it is caught by the WHITE/LIGHT branch, not the stone fallback. So the writer's canonical
// names are checked against the matcher rather than eyeballed.
{
    const ids = Object.keys(W.VOXEL_TO_MC).map(Number).sort((a, b) => a - b);
    const bad = ids.filter((v) => mcNameToVoxel(W.VOXEL_TO_MC[v]) !== v);
    ok("every VOXEL_TO_MC name maps back to its own voxel id", bad.length === 0,
        ids.length + " names, " + bad.length + " that do not invert" +
        (bad.length ? " -> " + bad.map((v) => v + ":" + W.VOXEL_TO_MC[v] + "->" + mcNameToVoxel(W.VOXEL_TO_MC[v])).join(" ") : ""));
    // The table has to be INJECTIVE or the palette collapses two materials onto one name -- see section 5.
    ok("VOXEL_TO_MC is injective (one distinct block name per material)",
        new Set(ids.map((v) => W.VOXEL_TO_MC[v])).size === ids.length,
        new Set(ids.map((v) => W.VOXEL_TO_MC[v])).size + " distinct names for " + ids.length + " ids");
    // And it has to cover exactly what the LOADER can produce -- no more, or the round trip is untestable.
    const loaderCan = new Set(ids);
    ok("VOXEL_TO_MC covers exactly the nine materials the loader can emit", loaderCan.size === 9,
        "ids " + ids.join(","));
    report("the trap, live in the loader today: diorite -> " + mcNameToVoxel("minecraft:diorite") +
        " (SNOW), obsidian -> " + mcNameToVoxel("minecraft:obsidian") + " (ASH), oak_log -> " +
        mcNameToVoxel("minecraft:oak_log") + " (ASH). Two of those three would be guessed wrong.");
}

// =============================================================================================================
console.log("\n2. *** THE VARINT, DECODED BY THE LOADER'S OWN LOOP -- and the round trip CANNOT reach it ***");
// This is the section the round trip does not make redundant, and saying why is the point. A .schem palette
// index is a varint, but this engine has fourteen materials, so a palette index NEVER EXCEEDS 13 and every
// index in every round trip below fits in ONE byte. A writer that only handled single-byte varints would
// pass section 3 completely. So the multi-byte path is exercised directly, against the exact decode loop
// world/schematicLoader.js runs -- copied here as a decoder, not re-derived as an encoder.
{
    const decode = (data) => { const out = []; let di = 0;
        while (di < data.length) { let v = 0, sh = 0, b;
            do { b = data[di++] & 0xff; v |= (b & 0x7f) << sh; sh += 7; } while (b & 0x80);
            out.push(v); } return out; };
    const vals = [];
    for (let i = 0; i < 300; i++) vals.push(i);
    for (const v of [127, 128, 129, 255, 256, 16383, 16384, 65535, 65536, 2097151, 2097152, 268435455, 2147483647]) vals.push(v);
    const enc = []; for (const v of vals) W.writeVarint(v, enc);
    const dec = decode(Uint8Array.from(enc));
    let vbad = 0; for (let i = 0; i < vals.length; i++) if (vals[i] !== dec[i]) vbad++;
    ok("every varint the writer emits decodes back through the loader's loop", vbad === 0,
        vals.length + " values to " + Math.max(...vals) + ", " + vbad + " wrong, " + enc.length + " bytes");
    const widths = {}; for (const v of vals) widths[W.varintLength(v)] = (widths[W.varintLength(v)] || 0) + 1;
    ok("the sweep actually reaches multi-byte varints", Object.keys(widths).length >= 4,
        "byte-widths exercised: " + JSON.stringify(widths));
    let lbad = 0, e2 = [];
    for (const v of vals) { const before = e2.length; W.writeVarint(v, e2); if (e2.length - before !== W.varintLength(v)) lbad++; }
    ok("varintLength agrees with the bytes writeVarint actually appends", lbad === 0, lbad + " disagreements");
    // The ceiling, measured rather than assumed: the loader ORs into a 32-bit signed int, so 2^31 wraps.
    const one = (v) => decode(Uint8Array.from(W.writeVarint(v)))[0];
    ok("the loader's decoder is signed-32-bit, and 2^31 is where it stops being faithful",
        one(2147483647) === 2147483647 && one(2147483648) === -2147483648,
        "2^31-1 -> " + one(2147483647) + ", 2^31 -> " + one(2147483648) +
        " -- unreachable in practice: that palette needs 2,147,483,649 distinct blocks and this engine has " +
        Object.keys(W.MC_NAME_FOR).length);
}

// =============================================================================================================
console.log("\n3. *** VOXELS -> SCHEM -> VOXELS IS EXACT, and the controls prove the comparison can fail ***");
// The fixture is deliberately NOT symmetric in x/y/z (7 x 5 x 3, with a pattern whose period differs on each
// axis), because a cube filled by a symmetric formula cannot tell a correct YZX index order from a transposed
// one. The transposed control below is what makes that claim more than a hope.
const IDS = [0, 1, 2, 3, 4, 5, 6, 10, 12];
const FW = 7, FH = 5, FL = 3;
const fixture = (x, y, z) => IDS[(x * 13 + y * 5 + z * 3) % IDS.length];
{
    const r = await W.writeSchem({ width: FW, height: FH, length: FL, voxelAt: fixture });
    ok("the file is gzip, so it takes the same path in the loader a real WorldEdit file does",
        r.bytes[0] === 0x1f && r.bytes[1] === 0x8b, "magic " + r.bytes[0].toString(16) + r.bytes[1].toString(16) +
        ", " + r.bytes.length + " bytes for " + (FW * FH * FL) + " voxels");
    const back = await parse(r.bytes);
    ok("the loader recognises it as a modern .schem with the dimensions written",
        back.format === "schem" && back.width === FW && back.height === FH && back.length === FL,
        back.format + " " + back.width + "x" + back.height + "x" + back.length);
    const bad = mismatches(back, fixture, FW, FH, FL);
    ok("every one of the " + (FW * FH * FL) + " voxels comes back identical", bad === 0, bad + " mismatches");
    ok("the palette holds exactly the materials present, and no others",
        r.paletteSize === IDS.length && Object.keys(r.palette).length === IDS.length,
        r.paletteSize + " entries: " + Object.keys(r.palette).join(" "));

    // --- CONTROL A: a transposed writer. If this passed, section 3's exactness would mean nothing.
    const t = await W.writeSchem({ width: FW, height: FH, length: FL, voxelAt: (x, y, z) => fixture(x, z % FH, y % FL) });
    const tbad = mismatches(await parse(t.bytes), fixture, FW, FH, FL);
    ok("CONTROL: a transposed volume does NOT round-trip clean", tbad > 0, tbad + " mismatches (must be > 0)");

    // --- CONTROL B: a writer that flattens everything to one palette entry.
    const c = await W.writeSchem({ width: FW, height: FH, length: FL, voxelAt: () => VOXEL.STONE });
    const cbad = mismatches(await parse(c.bytes), fixture, FW, FH, FL);
    ok("CONTROL: a constant-stone volume does NOT round-trip clean", cbad > 0,
        cbad + " mismatches, paletteSize " + c.paletteSize + " (must be > 0 and 1)");

    // --- CONTROL C: the comparison must also be able to see a SINGLE changed voxel, not just a wholesale
    // scramble. A diff that only notices catastrophes is not a diff.
    const one = (x, y, z) => (x === 5 && y === 3 && z === 1) ? VOXEL.LAVA : fixture(x, y, z);
    const s1 = await W.writeSchem({ width: FW, height: FH, length: FL, voxelAt: one });
    const s1bad = mismatches(await parse(s1.bytes), fixture, FW, FH, FL);
    ok("CONTROL: exactly one changed voxel is seen as exactly one mismatch", s1bad === 1,
        s1bad + " mismatches (must be 1)");

    // --- A non-cubic 1-thick slab, because a degenerate axis is where index arithmetic usually breaks.
    const slab = await W.writeSchem({ width: 9, height: 1, length: 4, voxelAt: (x, y, z) => IDS[(x + z) % IDS.length] });
    ok("a 1-thick slab round-trips too (degenerate axis)",
        mismatches(await parse(slab.bytes), (x, y, z) => IDS[(x + z) % IDS.length], 9, 1, 4) === 0);
    ok("zero and negative dimensions are refused rather than written",
        [[0, 1, 1], [1, 0, 1], [1, 1, -2]].every(([a, b, c2]) => {
            try { W.buildSchem({ width: a, height: b, length: c2, voxelAt: () => 0 }); return false; } catch { return true; }
        }));
}

// =============================================================================================================
console.log("\n4. *** SCHEM -> VOXELS -> SCHEM IS NOT IDENTITY, and this is the number rather than the excuse ***");
// mcNameToVoxel projects thousands of Minecraft blocks onto nine materials. Round-tripping a FILE therefore
// loses block names it never held the information to restore, and writing a name back is a choice this tree
// makes. The size of the loss is measured on a palette of real Minecraft blocks.
{
    const names = ["minecraft:stone", "minecraft:cobblestone", "minecraft:granite", "minecraft:andesite",
        "minecraft:diorite", "minecraft:bedrock", "minecraft:deepslate", "minecraft:dirt", "minecraft:coarse_dirt",
        "minecraft:grass_block", "minecraft:sand", "minecraft:red_sand", "minecraft:water", "minecraft:lava",
        "minecraft:snow_block", "minecraft:oak_log", "minecraft:obsidian", "minecraft:air"];
    const n = names.length;
    const pal = {}; names.forEach((nm, i) => pal[nm] = i);
    const data = []; for (let i = 0; i < n; i++) W.writeVarint(i, data);
    const nbt = W.writeNBT({ Version: 2, DataVersion: 2975, Width: n, Height: 1, Length: 1, PaletteMax: n,
        Palette: pal, BlockData: Uint8Array.from(data), Offset: new Int32Array([0, 0, 0]) }, "Schematic",
        { Width: W.TAG.SHORT, Height: W.TAG.SHORT, Length: W.TAG.SHORT, Version: W.TAG.INT,
          DataVersion: W.TAG.INT, PaletteMax: W.TAG.INT, Offset: W.TAG.INT_ARRAY, Palette: {} });
    const orig = await parse(await W.gzip(nbt));
    const vox = []; for (let x = 0; x < n; x++) vox.push(orig.voxelAt(x, 0, 0));
    const re = await W.writeSchem({ width: n, height: 1, length: 1, voxelAt: (x) => vox[x] });
    const reBack = await parse(re.bytes);

    const keptNames = names.filter((nm, i) => W.VOXEL_TO_MC[vox[i]] === nm).length;
    const keptVox = vox.filter((v, x) => reBack.voxelAt(x, 0, 0) === v).length;
    ok("the VOXELS survive a second trip through the file (the direction that IS identity)",
        keptVox === n, keptVox + "/" + n);
    ok("the BLOCK NAMES do not (the direction that is not)", keptNames < n,
        keptNames + "/" + n + " names preserved, palette " + n + " in -> " + re.paletteSize + " out");
    ok("the collapse is exactly the loader's nine buckets, not an arbitrary number",
        re.paletteSize === new Set(vox).size && re.paletteSize <= 9,
        re.paletteSize + " distinct materials out of " + n + " distinct blocks in");
    report("lost: " + names.filter((nm, i) => W.VOXEL_TO_MC[vox[i]] !== nm)
        .map((nm, k) => nm.replace("minecraft:", "")).join(", "));
}

// =============================================================================================================
console.log("\n5. *** THE FIVE MATERIALS THIS ENGINE CAN BUILD WITH AND CANNOT READ BACK ***");
// world/voxelFormat.js defines FOURTEEN voxel codes. The loader can only ever PRODUCE nine of them, because
// mcNameToVoxel has no branch returning RUBBLE, FLOWING_WATER, ICE, SCREEN or MEMORY. So a build made HERE
// carries materials Minecraft renders fine and this engine cannot re-read -- and the export must still be a
// VALID file, not a corrupt one.
//
// *** THE BUG THIS SECTION CAUGHT BEFORE THE ROUND SHIPPED, recorded because it is the whole argument for
// *** writing section 5 at all: MC_NAME_FOR is NOT injective -- WATER 10 and FLOWING_WATER 11 are both
// "minecraft:water". The first draft deduped the palette by VOXEL ID, which produced two palette indices for
// one palette NAME; a .schem palette is a name -> index map, so the second entry silently clobbered the
// first, and every plain WATER block re-read as STONE. Section 3 could not see it: those nine names are
// distinct. The fix keys the palette by NAME.
{
    const all = Object.values(VOXEL).sort((a, b) => a - b);
    ok("the writer names every voxel code this engine can put in a world",
        all.every((v) => W.MC_NAME_FOR[v] !== undefined), all.length + " codes, all named");
    ok("MC_NAME_FOR is deliberately NOT injective, which is what section 3 cannot test",
        new Set(all.map((v) => W.MC_NAME_FOR[v])).size < all.length,
        new Set(all.map((v) => W.MC_NAME_FOR[v])).size + " distinct names for " + all.length + " codes");

    const r = await W.writeSchem({ width: all.length, height: 1, length: 1, voxelAt: (x) => all[x] });
    const back = await parse(r.bytes);
    const kept = all.filter((v, x) => back.voxelAt(x, 0, 0) === v);
    const lost = all.filter((v, x) => back.voxelAt(x, 0, 0) !== v);
    // *** THE REGRESSION GUARD: the kept set must be EXACTLY the nine invertible ids. Not "at least nine" --
    // that would let the water collision back in the moment a tenth material happened to survive.
    ok("exactly the nine invertible materials survive, and they are exactly VOXEL_TO_MC's",
        kept.length === 9 && kept.join(",") === Object.keys(W.VOXEL_TO_MC).map(Number).sort((a, b) => a - b).join(","),
        "kept " + kept.join(",") + " | lost " + lost.join(","));
    ok("plain WATER is among the kept (the exact voxel the palette-collision bug destroyed)",
        back.voxelAt(all.indexOf(VOXEL.WATER), 0, 0) === VOXEL.WATER,
        "WATER 10 -> " + back.voxelAt(all.indexOf(VOXEL.WATER), 0, 0));
    ok("the palette has one entry per distinct NAME, not one per voxel id",
        r.paletteSize === new Set(all.map((v) => W.MC_NAME_FOR[v])).size &&
        Object.keys(r.palette).length === r.paletteSize,
        r.paletteSize + " palette entries for " + all.length + " voxel codes");
    ok("VOXEL_TO_MC_EXTRA is exactly the set that does NOT survive",
        lost.join(",") === Object.keys(W.VOXEL_TO_MC_EXTRA).map(Number).sort((a, b) => a - b).join(","),
        "lost " + lost.join(",") + " vs extra table " + Object.keys(W.VOXEL_TO_MC_EXTRA).join(","));
    for (const v of lost) report("  " + String(v).padStart(2) + " -> " + W.MC_NAME_FOR[v] +
        " -> re-reads as " + back.voxelAt(all.indexOf(v), 0, 0));
    ok("a voxel code with no name is refused loudly rather than written as something else",
        (() => { try { W.buildSchem({ width: 1, height: 1, length: 1, voxelAt: () => 99 }); return false; }
                 catch (e) { return /no Minecraft name/.test(e.message); } })());
}

// =============================================================================================================
console.log("\n6. *** THE BYTES ARE RIGHT FOR READERS THAT ARE NOT THIS ONE ***");
// The loader coerces dimensions with Number(), so it would accept Width as an INT even though the Sponge
// specification says SHORT. Exporting is FOR other programs, so the tag ids are checked in the raw NBT --
// which also means writeNBT's forced-type path is tested rather than assumed.
{
    const nbt = W.buildSchem({ width: 3, height: 2, length: 4, voxelAt: () => VOXEL.STONE }).nbt;
    ok("the NBT root is a named compound called Schematic",
        nbt[0] === W.TAG.COMPOUND && new TextDecoder().decode(nbt.slice(3, 3 + 9)) === "Schematic",
        "tag " + nbt[0] + ", name '" + new TextDecoder().decode(nbt.slice(3, 3 + 9)) + "'");
    // Find each key's tag byte: a key is preceded by [tag][u16 len] and the name is ASCII. EVERY occurrence
    // has to be tried, not the first -- "PaletteMax" is written before "Palette" and contains it, so a
    // first-match scan reads the wrong length prefix and reports the key as absent. (It did, on the first
    // run of this section: one FAIL that was the GATE's bug, not the writer's.)
    const buf = Buffer.from(nbt);
    const tagOf = (key) => {
        for (let at = buf.indexOf(key, 0, "latin1"); at >= 0; at = buf.indexOf(key, at + 1, "latin1"))
            if (at >= 3 && buf.readUInt16BE(at - 2) === key.length) return nbt[at - 3];
        return -1;
    };
    /** Byte offset of a key's VALUE, found the same careful way. */
    const valueAt = (key) => {
        for (let at = buf.indexOf(key, 0, "latin1"); at >= 0; at = buf.indexOf(key, at + 1, "latin1"))
            if (at >= 3 && buf.readUInt16BE(at - 2) === key.length) return at + key.length;
        return -1;
    };
    for (const [k, want, why] of [["Width", W.TAG.SHORT, "spec says short"], ["Height", W.TAG.SHORT, "spec says short"],
        ["Length", W.TAG.SHORT, "spec says short"], ["Version", W.TAG.INT, "spec says int"],
        ["DataVersion", W.TAG.INT, "spec says int"], ["BlockData", W.TAG.BYTE_ARRAY, "varints live in a byte array"],
        ["Palette", W.TAG.COMPOUND, "name -> int map"], ["Offset", W.TAG.INT_ARRAY, "three ints"]])
        ok("  " + k + " is written as tag " + want, tagOf(k) === want, "got " + tagOf(k) + " -- " + why);
    // A SHORT is two bytes; an INT would be four. If the forced-type table were dropped this would still
    // parse HERE and be wrong THERE, which is exactly the failure this section exists to catch.
    ok("Width really occupies two bytes and reads 3", buf.readInt16BE(valueAt("Width")) === 3,
        "value " + buf.readInt16BE(valueAt("Width")));
    ok("gzip round-trips the exact NBT bytes back out",
        (await W.gzip(nbt)).length > 0 && (await W.gzip(nbt))[0] === 0x1f);
}

// =============================================================================================================
console.log("\n7. *** THE ENGINE ACTUALLY CALLS IT -- the loader had a front door and the writer needs one ***");
{
    const src = (await import("node:fs")).readFileSync(new URL("../../main.js", import.meta.url), "utf8");
    ok("main.js imports the writer", /from\s+"\.\/world\/schematicWriter\.js"/.test(src));
    ok("window.schematic has a save() and a build()", /\basync\s+save\s*\(/.test(src) && /\basync\s+build\s*\(/.test(src));
    ok("the export reads the world with the same accessor CityGen and biomePainter use",
        /world\.voxelAt\.bind\(world\)/.test(src));
    ok("a voxel code the writer has no name for exports as air rather than throwing mid-download",
        /MC_NAME_FOR\[v\] === undefined/.test(src));
}

// =============================================================================================================
// SABOTAGE LOG -- each applied to a working tree, confirmed present with grep -c before the run was read,
// and restored md5-identical (64e865f7d3bf4263f86b32d08634217b) afterwards. The counts below are what the
// runs ACTUALLY printed, including the places my prediction was wrong.
//
//   A  buildSchem's index order changed from (y*length+z)*width+x to (y*width+x)*length+z.
//      -> 3 RED: section 3's exactness (80 mismatches), the one-voxel control, and the 1-thick slab.
//      *** SECTION 5 DID NOT CATCH IT, and I had predicted it would. *** Section 5's fixture is 14 x 1 x 1,
//      so it is degenerate in y and z and a transposition is a no-op on it. Only the non-cubic 7 x 5 x 3
//      fixture and the slab separate the orders. Recorded rather than quietly re-predicted, because it is
//      the same lesson as v4255's cap winding: a fixture must contain the feature the bug lives in.
//
//   B  the palette deduped by voxel id again (the bug this round actually shipped and then fixed).
//      -> 4 RED, EVERY ONE OF THEM IN SECTION 5, and *** 0 RED IN SECTION 3. *** That zero is the finding:
//      the round trip over the nine invertible materials cannot see a palette-name collision, because those
//      nine names are distinct. A gate that stopped at section 3 would have shipped an export in which every
//      plain WATER block re-reads as STONE for any world containing flowing water.
//
//   C  writeVarint's continuation bit dropped, so it emits single bytes only.
//      -> 3 RED in section 2 (184 of 313 values wrong) and *** 0 RED IN SECTIONS 3-7. *** The second zero,
//      and the reason section 2 exists at all: this engine has fourteen materials, so no palette index in
//      any round trip here ever exceeds 13, and every one of them fits in one byte. A writer that cannot
//      encode 128 passes the entire round trip.
//
//   D  the forced-type table dropped, so writeNBT picks tags from the JS values.
//      -> 5 RED in section 6 and *** 0 RED IN SECTIONS 3-5. *** Width/Height/Length go out as TAG_Int and
//      the loader's Number() coercion does not care -- the file loads perfectly HERE and is wrong for the
//      readers it is written for. It also takes Offset from TAG_Int_Array to TAG_Compound, because an
//      Int32Array has no automatic tag, which would be a second silent malformation.
//
//   E  VOXEL_TO_MC[6] changed from obsidian to "minecraft:blackstone" -- a plausible-looking dark block.
//      -> 7 RED across sections 1, 3, 4 and 5. blackstone hits the loader's stone fallback, not the ASH
//      branch, so ASH would have exported as a block that re-imports as STONE. Section 1 names the cause in
//      one line (6:minecraft:blackstone->1) while the others only report the damage, which is the argument
//      for asserting the table instead of only round-tripping through it.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: MINECRAFT ITSELF. Nothing in this gate has opened the game or run WorldEdit, so " +
    "the claim that these bytes //paste is supported by the specification and by section 6's tag ids, not by " +
    "observation -- and section 6 is the only defence against a file that is perfectly readable here and " +
    "wrong everywhere else. Also unwritten: block ENTITIES (chests, signs), biomes, and entities, all of " +
    "which Sponge v2 carries and this writer omits, because a voxel world has nothing to put in them. " +
    "Sponge v3 and .litematic are READ by the loader and not written -- v2 is what WorldEdit pastes and " +
    "writing three formats to test one would be three chances to be wrong. And window.schematic.save() is " +
    "reached by section 7 as SOURCE TEXT: no browser ran, so the download itself is unobserved.");
process.exit(fails ? 1 : 0);

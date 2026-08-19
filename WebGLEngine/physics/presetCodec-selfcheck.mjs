// physics/presetCodec-selfcheck.mjs
//
// Run: node physics/presetCodec-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// One encoding backs the URL save/load, the curated presets, and the user's own saved presets, so if it is lossy or
// too trusting the shelf silently corrupts what a user pinned. The gate proves the round-trip: whatever scene state
// goes in comes back out -- scene, every slider value, camera, skin -- and that a string naming no scene is rejected
// as null rather than half-decoded into a broken preset. The sabotage drops the scene from the encoding, and the
// round-trip check fails because a preset with no scene is not a preset.
import { encodeScene, decodeScene } from "./presetCodec.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const eqNum = (a, b) => (a === undefined && b === undefined) || Math.abs(a - b) < 1e-9;

const SAMPLES = [
    { scene: "diffusion", params: { tempK: 320 }, yaw: 35, pitch: 20, skin: true, spin: false },
    { scene: "aquarium", params: { tempK: 310 }, yaw: 42, pitch: 26, skin: true, spin: true },
    { scene: "centrifuge", params: { omega: 0.8 }, yaw: 20, pitch: 55, skin: false, spin: true },
    { scene: "stretch", params: { weft: 0.0028 }, yaw: 40, pitch: 30, skin: false, spin: true },
];

// ---- 1. ROUND-TRIP: whatever you encode you get back -----------------------------------------------------
{
    let allGood = true, detail = "";
    for (const s of SAMPLES) {
        const back = decodeScene(encodeScene(s));
        const same = back && back.scene === s.scene && eqNum(back.yaw, s.yaw) && eqNum(back.pitch, s.pitch) && back.skin === s.skin && back.spin === s.spin
            && Object.keys(s.params).every((k) => eqNum(back.params[k], s.params[k]));
        if (!same) { allGood = false; detail = "mismatch on " + s.scene; break; }
    }
    ok("!! every scene state round-trips through the encoding unchanged", allGood,
       allGood ? "scene, slider values, camera, and skin survive encode-then-decode for all " + SAMPLES.length + " samples -- a saved preset restores to exactly what was pinned." : detail);
}

// ---- 2. params parse as numbers, not strings -------------------------------------------------------------
{
    const back = decodeScene(encodeScene({ scene: "centrifuge", params: { omega: 0.8 }, skin: false }));
    ok("!! slider values decode as numbers", typeof back.params.omega === "number" && back.params.omega === 0.8,
       "omega comes back as the number 0.8, not the string \"0.8\" -- the slider can use it directly.");
}

// ---- 3. REJECTION: a string naming no scene is null, not a broken preset ----------------------------------
{
    ok("!! malformed input is rejected as null", decodeScene("") === null && decodeScene("yaw=10&pitch=5") === null && decodeScene(null) === null,
       "an empty string, a string with no scene, and a non-string all decode to null -- the shelf never pins a preset that names nothing.");
}

// ---- 4. DETERMINISTIC ------------------------------------------------------------------------------------
{
    const a = encodeScene(SAMPLES[0]), b = encodeScene(SAMPLES[0]);
    ok("!! the encoding is deterministic", a === b && a.startsWith("scene=diffusion"),
       "the same state encodes to the same string every time, so a link and a saved preset made from one scene are identical.");
}

console.log(fails ? "\npresetCodec-selfcheck: " + fails + " FAILED" : "\npresetCodec-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);

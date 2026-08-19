// WebGLEngine/bz/bzMaterial.js — what a map looks like, and the four named things beside it.
//
// Round eight. The last of the .bzw format, and the smallest round, because almost none of it is geometry:
//
//   material       a named appearance. `matref` on an object or a face points at one, and one material may
//                  point at another -- `matref` INSIDE a material inherits it and then overrides. That is
//                  how `data/` writes a hundred variations on one texture.
//   textureMatrix  a named 2D texture transform: shift, scale, spin, and their per-second rates.
//   dynamicColor   a named animated colour: four channels, each with its own function of time.
//   physics        a named physics driver: a linear or angular velocity a surface imparts to a tank.
//   transform      a named transform stack, so `xform <name>` on a mesh or a group can reuse it.
//   weapon         a world weapon: a turret that fires by itself.
//
// WHAT IS SIMULATED AND WHAT IS NOT, said plainly:
//
//   * `material` IS read, and its `diffuse` colour is what the renderer draws. `matref` resolves, including
//     a material that inherits another. Textures are not loaded -- this engine has none for BZFlag -- so
//     `texture` and its dozen relatives are recorded and not used.
//   * `textureMatrix`, `dynamicColor`, `physics` and `weapon` are PARSED AND RECORDED, by name, so a caller
//     can see what a map wanted. Nothing animates and nothing shoots. Counting them as handled would be
//     the coverage report lying in the direction that flatters us, so the report says `recorded` and the
//     README says the same word.
//   * `transform` IS handled, because a named transform is exactly the transform stack round one already
//     applies -- it only needed somewhere to look the name up.
//
// The distinction between "handled" and "recorded" is the whole point of having a coverage instrument.

"use strict";

import { nums } from "./bzwParse.js";
import { identity, mul, shiftM, scaleM, shearM, spinM } from "./bzwWorld.js";

const DEG = Math.PI / 180;

// BzMaterial's defaults (src/game/BzMaterial.cxx): white, opaque, unshaded.
function defaultMaterial(name) {
    return {
        name: name || "",
        diffuse: [1, 1, 1, 1],
        ambient: [0.2, 0.2, 0.2, 1],
        specular: [0, 0, 0, 1],
        emission: [0, 0, 0, 1],
        shininess: 0,
        textures: [],
        noTextures: false, noRadar: false, noShadow: false, noLighting: false,
        noCulling: false, noSorting: false, occluder: false, groupAlpha: false,
        alphaThreshold: 0,
        dyncol: null, texmat: null,
    };
}

function color4(params, fallback) {
    const v = nums(params, 4);
    if (v) return v;
    const g = nums(params, 1);              // `color 0.5` is a grey
    if (g) return [g[0], g[0], g[0], 1];
    return fallback.slice();
}

// One `material` block. `matref` inside it inherits and then everything after overrides, which is the order
// the lines appear in, so a straight walk does the right thing.
function readMaterial(block, byName) {
    const m = defaultMaterial(block.lines.length ? nameOf(block) : null);
    for (const l of block.lines) {
        const k = l.key, p = l.params;
        if (k === "name") m.name = p[0] || m.name;
        else if (k === "matref") { const base = byName[p[0]]; if (base) Object.assign(m, { ...base, name: m.name }); }
        else if (k === "resetmat") Object.assign(m, defaultMaterial(m.name));
        else if (k === "diffuse" || k === "color") m.diffuse = color4(p, m.diffuse);
        else if (k === "ambient") m.ambient = color4(p, m.ambient);
        else if (k === "specular") m.specular = color4(p, m.specular);
        else if (k === "emission") m.emission = color4(p, m.emission);
        else if (k === "shininess") m.shininess = parseFloat(p[0]) || 0;
        else if (k === "alphathresh") m.alphaThreshold = parseFloat(p[0]) || 0;
        else if (k === "texture") { m.textures = p[0] ? [p[0]] : []; }
        else if (k === "addtexture") { if (p[0]) m.textures.push(p[0]); }
        else if (k === "notextures") m.noTextures = true;
        else if (k === "noradar") m.noRadar = true;
        else if (k === "noshadow") m.noShadow = true;
        else if (k === "nolighting") m.noLighting = true;
        else if (k === "noculling") m.noCulling = true;
        else if (k === "nosorting") m.noSorting = true;
        else if (k === "occluder") m.occluder = true;
        else if (k === "groupalpha") m.groupAlpha = true;
        else if (k === "dyncol") m.dyncol = p[0] || null;
        else if (k === "texmat") m.texmat = p[0] || null;
        // shader / addshader / noshaders / spheremap / notexalpha / notexcolor: recorded by the coverage
        // report as parameters of a handled type, and used by nothing. There is no shader pipeline here.
    }
    return m;
}
function nameOf(block) { const l = block.lines.find((x) => x.key === "name"); return l ? l.params[0] : (block.arg || ""); }

function buildMaterials(parsed) {
    const byName = {};
    const walk = (blocks) => {
        for (const b of blocks) {
            if (b.kind !== "material") continue;
            const m = readMaterial(b, byName);
            if (m.name) byName[m.name] = m;
        }
    };
    walk(parsed.blocks);
    for (const n in parsed.defines) walk(parsed.defines[n].blocks);
    return byName;
}

// --- named transforms -----------------------------------------------------------------------------------
// `transform <name>` is the same stack `readTransform` already applies. It only needed somewhere to look the
// name up, which is why this is the one member of the family that is genuinely HANDLED.
function buildTransforms(parsed) {
    const out = {};
    const walk = (blocks) => {
        for (const b of blocks) {
            if (b.kind !== "transform") continue;
            const name = b.arg || nameOf(b);
            let m = identity();
            for (const l of b.lines) {
                let t = null;
                if (l.key === "shift") { const v = nums(l.params, 3); if (v) t = shiftM(v[0], v[1], v[2]); }
                else if (l.key === "scale") { const v = nums(l.params, 3); if (v) t = scaleM(v[0], v[1], v[2]); }
                else if (l.key === "shear") { const v = nums(l.params, 3); if (v) t = shearM(v[0], v[1], v[2]); }
                else if (l.key === "spin") { const v = nums(l.params, 4); if (v) t = spinM(v[0], v[1], v[2], v[3]); }
                else if (l.key === "xform") { const x = out[l.params[0]]; if (x) t = x; }
                if (t) m = mul(t, m);
            }
            if (name) out[name] = m;
        }
    };
    walk(parsed.blocks);
    for (const n in parsed.defines) walk(parsed.defines[n].blocks);
    return out;
}

// --- recorded, not simulated ------------------------------------------------------------------------------
// Everything below is read into a shape a caller can inspect and print. Nothing here moves, animates, or
// fires. The coverage report calls them `recorded`, and so does the README, because a report that called
// them `handled` would be lying in the direction that flatters us.
function recordNamed(parsed, kind, reader) {
    const out = {};
    const walk = (blocks) => {
        for (const b of blocks) {
            if (b.kind !== kind) continue;
            const name = b.arg || nameOf(b);
            const r = reader(b);
            if (name) out[name] = { name, ...r };
            else (out._unnamed = out._unnamed || []).push(r);
        }
    };
    walk(parsed.blocks);
    for (const n in parsed.defines) walk(parsed.defines[n].blocks);
    return out;
}

const readTextureMatrix = (b) => ({
    shift: nums((b.lines.find((l) => l.key === "shift") || {}).params, 2),
    scale: nums((b.lines.find((l) => l.key === "scale") || {}).params, 4),
    spin: parseFloat(((b.lines.find((l) => l.key === "spin") || {}).params || [])[0]) || 0,
    center: nums((b.lines.find((l) => l.key === "center") || {}).params, 2),
    // `fixedshift` and the `*freq`/`*rate` animated forms are recorded raw. We do not animate.
    raw: b.lines.map((l) => [l.key, ...l.params].join(" ")),
});

const readDynamicColor = (b) => ({ raw: b.lines.map((l) => [l.key, ...l.params].join(" ")) });

const readPhysics = (b) => ({
    linear: nums((b.lines.find((l) => l.key === "linear") || {}).params, 3),
    angular: nums((b.lines.find((l) => l.key === "angular") || {}).params, 3),
    slide: parseFloat(((b.lines.find((l) => l.key === "slide") || {}).params || [])[0]) || 0,
    death: (b.lines.find((l) => l.key === "death") || {}).params ? (b.lines.find((l) => l.key === "death").params.join(" ")) : null,
});

const readWeapon = (b) => {
    const g = (k) => (b.lines.find((l) => l.key === k) || {}).params;
    return {
        pos: nums(g("position") || g("pos"), 3) || [0, 0, 0],
        rotation: (parseFloat((g("rotation") || g("rot") || [])[0]) || 0) * DEG,
        type: (g("type") || [])[0] || null,
        initdelay: parseFloat((g("initdelay") || [])[0]) || 0,
        delay: (g("delay") || []).map(Number).filter(Number.isFinite),
        tilt: parseFloat((g("tilt") || [])[0]) || 0,
    };
};

function buildFamily(parsed) {
    return {
        materials: buildMaterials(parsed),
        transforms: buildTransforms(parsed),
        textureMatrices: recordNamed(parsed, "texturematrix", readTextureMatrix),
        dynamicColors: recordNamed(parsed, "dynamiccolor", readDynamicColor),
        physics: recordNamed(parsed, "physics", readPhysics),
        weapons: recordNamed(parsed, "weapon", readWeapon),
    };
}

// --- what the renderer asks for --------------------------------------------------------------------------
// The last `matref` on a block or a face wins, exactly as the last of any repeated key does.
function matrefOf(lines) {
    let name = null;
    for (const l of lines || []) if (l.key === "matref" && l.params[0]) name = l.params[0];
    return name;
}

// A material's colour, or nothing. `nothing` matters: an obstacle with no material keeps the colour its TYPE
// gives it, and a box that says `matref` to a material that does not exist is a box the map author got wrong,
// not a black box.
function colorOfMaterial(materials, name) {
    const m = name && materials ? materials[name] : null;
    return m ? m.diffuse.slice(0, 3) : null;
}

export { buildFamily, buildMaterials, buildTransforms, readMaterial, defaultMaterial, matrefOf, colorOfMaterial, recordNamed };
if (typeof module !== "undefined" && module.exports)
    module.exports = { buildFamily, buildMaterials, buildTransforms, readMaterial, defaultMaterial, matrefOf, colorOfMaterial, recordNamed };

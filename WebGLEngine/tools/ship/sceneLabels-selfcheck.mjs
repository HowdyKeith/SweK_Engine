#!/usr/bin/env node
// WebGLEngine/tools/ship/sceneLabels-selfcheck.mjs -- v4477
//
// GATES render/sceneLabels.mjs headless: which records of a GPU-driven scene get a label and where -- the 3D
// orrery's fifth step, the text itself being render/slugDevice.mjs's (gated at v4460) and the orrery page's wiring.
//
// THE KEY IS THE CULL'S OWN COUNT. The scene draws its near rung for every record whose angular metric reaches the
// threshold; labelsFor labels the same records by the same metric. On a scene the frustum wholly contains, the label
// count MUST equal render/gpuDriven.mjs cullLodCpu's count for LOD 0 at the same threshold and camera -- one rule,
// two readers, held equal on the cull's own twin. Then the geometry: a record at the origin projects to the exact
// centre pixel; one on +x lands right of it; one behind the camera is not labelled; the picked one is labelled
// however small; the cap keeps the largest and the picked.
//
// SABOTAGE (v4477), each applied to render/sceneLabels.mjs or the page, run, restored byte for byte:
//   A  the threshold test inverted (metric <= threshold)         -> exit=1, 7 red: 24 labels against 12 near, not the same records, the
//                                                                   metric split, the pick, the kind, and the centre record gone (sx undefined)
//   B  projectToScreen's `visible` ignored                        -> exit=1, 4 red: "behind" and "offscreen" labelled, five of five, and the edge limit
//   C  orrery-gpu.html's label frame removed                      -> exit=1, 1 red: the begin() frame at rowsFor's placement
//
// Run: node tools/ship/sceneLabels-selfcheck.mjs      (~0.2 s, no browser)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "../../render/sceneLabels.mjs";
import * as G from "../../render/gpuDriven.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (c, name, detail) => {
    console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`);
    if (!c) fails++;
};
const sec = (t) => console.log("\n" + t);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const W = 200, H = 200, FOV = Math.PI / 3, EYE = [0, 0, 6];
const proj = G.perspective(FOV, W / H, 0.1, 100), view = G.lookAt(EYE, [0, 0, 0]);
const cam = { proj, view, eye: EYE, width: W, height: H };

// ---------------------------------------------------------------------------------------------------------
sec("1. THE COUNT IS THE CULL'S: labelled records = the near rung's records, on cullLodCpu's own twin");
// ---------------------------------------------------------------------------------------------------------
{
    // a grid the frustum wholly contains (side 6 at spacing 0.5 spans 2.5 units at z = -2, eight units from the eye; tan(30) x 8 = 4.6)
    const records = G.gridScene({ side: 6, z: -2, spacing: 0.5, radii: [0.02, 0.06, 0.12] });
    const count = records.length / 4, names = Array.from({ length: count }, (_, i) => "r" + i);
    const TH = 0.008;   // between the smallest and the largest metric, so the split is real
    const u = G.packCullUniforms({ planes: G.frustumPlanes(G.multiply(proj, view)), eye: EYE, thresholds: [TH], count, lodCount: 2, cap: count });
    const twin = G.cullLodCpu(records, u);
    const labels = S.labelsFor(records, names, { ...cam, threshold: TH, max: null });
    ok(twin.visible === count, "CONTROL: the cull sees every record of the grid (nothing is off the frustum, so the point test and the sphere test agree)", `${twin.visible} of ${count}`);
    ok(twin.counts[0] > 0 && twin.counts[1] > 0, "CONTROL: the threshold splits the grid into both rungs", `near ${twin.counts[0]}, far ${twin.counts[1]}`);
    ok(labels.length === twin.counts[0], "*** the label count equals cullLodCpu's near-rung count at the same threshold and camera ***", `${labels.length} labels, ${twin.counts[0]} near`);
    const nearIds = new Set(twin.ids[0]);
    ok(labels.every((l) => nearIds.has(l.id)) && labels.length === nearIds.size, "  and they are the SAME records, not merely as many");
    ok(labels.every((l, i) => i === 0 || labels[i - 1].metric >= l.metric), "  sorted largest metric first");
    const metrics = labels.map((l) => S.metricOf(records, l.id, EYE));
    ok(metrics.every((m) => m >= TH) && Array.from({ length: count }, (_, i) => i).filter((i) => !nearIds.has(i)).every((i) => S.metricOf(records, i, EYE) < TH), "  every labelled metric is at or over the threshold and every unlabelled one under it");
    // the picked record is labelled however small; the cap keeps the largest and the picked
    const small = twin.ids[1][0];
    const withPick = S.labelsFor(records, names, { ...cam, threshold: TH, picked: small, max: null });
    ok(withPick.length === labels.length + 1 && withPick[0].id === small && withPick[0].picked === true, "a picked record below the threshold is labelled anyway, and first", `picked r${small}`);
    const capped = S.labelsFor(records, names, { ...cam, threshold: TH, picked: small, max: 5 });
    ok(capped.length === 5 && capped[0].id === small && capped.slice(1).every((l) => l.metric >= labels[4].metric), "the cap keeps the picked one and then the largest metrics");
    // kinds: only bodies by nearness; a picked satellite still gets its label
    const kinds = new Uint8Array(count); kinds[twin.ids[0][0]] = 1;
    const kinded = S.labelsFor(records, names, { ...cam, threshold: TH, kinds, max: null });
    ok(kinded.length === labels.length - 1 && !kinded.some((l) => l.id === twin.ids[0][0]), "a record of another kind is not labelled by nearness");
    ok(S.labelsFor(records, names, { ...cam, threshold: TH, kinds, picked: twin.ids[0][0], max: null }).some((l) => l.id === twin.ids[0][0] && l.picked), "  but is when picked");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. THE GEOMETRY: where a label lands, and what is not labelled at all");
// ---------------------------------------------------------------------------------------------------------
{
    const rec = Float32Array.from([0, 0, 0, 0.5,   1, 0, 0, 0.5,   0, 1, 0, 0.5,   0, 0, 7, 0.5,   30, 0, 0, 0.5]);
    const names = ["centre", "right", "up", "behind", "offscreen"];
    const L = S.labelsFor(rec, names, { ...cam, threshold: 0, max: null });
    const at = (n) => L.find((l) => l.name === n);
    ok(at("centre") && near(at("centre").sx, W / 2), "a record at the origin is centred in x", `sx ${at("centre") && at("centre").sx.toFixed(3)}`);
    // its label is ABOVE the body: the projected radius (0.5 at 6 units, f = 1/tan(30)) plus a third of the text
    const rpx = (0.5 / 6) * proj[5] * H / 2;
    ok(at("centre") && near(at("centre").sy, H / 2 - rpx - S.LABEL_PX * 0.35, 1e-6), "  and sits above it by the body's projected radius and a third of the text", `sy ${at("centre") && at("centre").sy.toFixed(2)}, radius ${rpx.toFixed(2)} px`);
    // its height differs from the centre's only by its own projected radius (it is a little farther, so a little smaller)
    const rpxR = S.metricOf(rec, 1, EYE) * proj[5] * H / 2;
    ok(at("right") && at("right").sx > W / 2 + 10 && near(at("right").sy, H / 2 - rpxR - S.LABEL_PX * 0.35, 1e-6), "a record on +x lands to the right, at the same height less its own (slightly smaller) projected radius", `sy ${at("right") && at("right").sy.toFixed(2)} vs centre ${at("centre").sy.toFixed(2)}`);
    ok(at("up") && at("up").sy < at("centre").sy - 10 && near(at("up").sx, W / 2), "a record on +y lands higher (screen y is down)");
    ok(!at("behind"), "*** a record behind the camera is not labelled ***");
    ok(!at("offscreen"), "*** nor one outside the NDC box ***");
    ok(L.length === 3, "so three of five are labelled", L.map((l) => l.name).join(", "));
    // the edge: a sphere whose centre is just outside the box is drawn by the cull and not labelled here -- stated, not hidden
    const edgeX = 6 * Math.tan(FOV / 2) * 1.02;   // 2% past the right edge at the origin's depth
    const edge = Float32Array.from([edgeX, 0, 0, 0.5]);
    const uE = G.packCullUniforms({ planes: G.frustumPlanes(G.multiply(proj, view)), eye: EYE, thresholds: [0], count: 1, lodCount: 2, cap: 1 });
    ok(G.cullLodCpu(edge, uE).visible === 1 && S.labelsFor(edge, ["edge"], { ...cam, threshold: 0 }).length === 0,
       "LIMIT, measured: a body whose CENTRE is 2% past the edge is drawn (a sphere against the frustum) and not labelled (a point against the box)");
    const rows = S.rowsFor({ sx: 100, sy: 50 }, 40, W, H);
    ok(rows.length === 16 && near(rows[3], (2 / W) * 80 - 1) && near(rows[7], 1 - (2 / H) * (50 - S.LABEL_PX * 0.9)), "rowsFor centres the text on sx and puts its baseline where the ship labels put theirs");
    ok(S.LABEL_CHARS.includes("-") && S.LABEL_CHARS.includes("_") && S.LABEL_CHARS.includes("/") && /^[A-Za-z0-9 %#.\-_\/(),]+$/.test(S.LABEL_CHARS), "the atlas character set covers the orrery's names: letters, digits, hyphen, underscore, slash, brackets");
}

// ---------------------------------------------------------------------------------------------------------
sec("3. THE PAGE: orrery-gpu.html draws these labels through render/slugDevice.mjs in a begin() frame");
// ---------------------------------------------------------------------------------------------------------
{
    const page = fs.readFileSync(path.join(ENG, "orrery-gpu.html"), "utf8");
    ok(/from "\.\/render\/sceneLabels\.mjs"/.test(page) && /from "\.\/render\/slugDevice\.mjs"/.test(page), "the page imports the label rule and the device text");
    ok(/new SlugFontDevice\(device, font, LABEL_CHARS\)/.test(page), "one font atlas on the page's device, over the label character set");
    ok(/labelsFor\(source\.cpu\(\), source\.names, \{[^}]*threshold: lodTh\.thresholds\[1\][^}]*picked[,:]/.test(page), "the labels come from the source's twin records at the scene's own near threshold, with the picked record");
    ok(/rows: rowsFor\(L, laid\.width, cv\.width, cv\.height/.test(page) && /pass\.begin\(\);[\s\S]{0,200}\.draw\(pass, r\.rows, \[cv\.width, cv\.height\]\)/.test(page), "and are drawn in a begin() frame -- over the scene, clearing nothing -- at rowsFor's placement");
    ok(/id="labels"/.test(page), "a checkbox turns them off");
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nall checks pass");
console.log("unchecked here: the glyphs (tools/ship/slugDevice-selfcheck.mjs holds the device text to the raw batch byte for byte), and a browser drawing this page's labels, which is the rig's to see. Also unchecked: collisions between labels, which the module does not claim.");
process.exit(fails ? 1 : 0);

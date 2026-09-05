// WebGLEngine/render/gpuOrbits.mjs -- v4299 (Level 12); the third element at v4474; fleets and flybys at v4476
//
// LEVEL 12: THE ORRERY'S BODIES PLACED BY THE GPU. A compute pass takes each body's orbital elements -- axis,
// period, phase, radius, the numbers world/orrery.mjs and world/orreryView.mjs already derive from the vendor
// tree -- and writes the instance record (position, radius) for the current time straight into the buffer
// the cull pass reads. Orbit -> cull -> indirect draw, three dispatches and no CPU per body per frame.
//
// *** THE ANGLE IS orreryView.positionAt()'s, TO THE LETTER. *** phase + 2*PI*t/period, no speed field, no
// per-body multiplier. The CPU twin here IS positionAt, so the GPU's picture cannot drift from the 2D one
// without the gate saying so; what can differ is sin/cos at f32, and that is measured rather than tolerated.
//
// The orbit plane WAS XY with z = 0 -- the 2D orrery's plane. v4474 -- THE THIRD ELEMENT: each body's orbit is
// tilted out of that plane by its inclination (world/orrery.mjs: its opacity, the fraction of its bytes nobody can
// read), about a node at its own phase, so at t = 0 the picture is the page's and as time runs the opaque bodies
// rise out of it. The twin is positionAt3 (the classical rotated circle); the kernel takes cos/sin of the
// inclination and the node PRECOMPUTED on the CPU in f64, so the only trig it does itself is the one it always
// did -- the angle past the node -- and the gate's 2e-4 bound stays about that one. Bodies are records; SweK
// itself is one too, at the centre with a = 0, so the sun is drawn by the same pipeline as its planets.
//
// v4476 -- THREE KINDS OF RECORD, ONE KERNEL. The 2D page has drawn two more populations since v4329 and v4332:
// each body's FLEET (world/orreryFleet.mjs: the engine files that import it, as satellites; its paperwork, as
// debris -- circles about the body, satelliteAt) and the FLYBYS (world/orreryReached.mjs: what SweK read and did
// not take, on parabolic paths past the system, flybyAt by Barker's equation). Both were CPU-only and 2D-only.
// Each record now carries a KIND in a third vec4: 0 a body (as above), 1 a satellite (its own circle in the
// ecliptic about its PARENT's position, which the kernel recomputes from the parent's elements rather than
// reading a buffer it may not have written yet), 2 a flyby (Barker in f32, with the cube roots taken in the
// stable form D = u - 1/u, u = cbrt(3W/2 + sqrt(9W^2/4 + 1)), because (3W/2 + s)(3W/2 - s) = -1 exactly and the
// naive second root is a small difference of large numbers). The twins are the 2D page's own functions.
"use strict";
import { positionAt3, phaseFor } from "../world/orreryView.mjs";
import { satelliteAt } from "../world/orreryFleet.mjs";
import { flybyAt } from "../world/orreryReached.mjs";
import { RECORD_FLOATS } from "./gpuDriven.mjs";

/**
 * One record's elements in the buffer: three vec4.
 *   body:      (a, period, phase, radius)  (cos i, sin i, cos node, sin node)  (0, 0, 0, 0)
 *   satellite: (a, period, phase, radius)  (0, 0, 0, 0)                        (1, parent index, 0, 0)
 *   flyby:     (q, 0, 0, radius)           (0, 0, cos aim, sin aim)            (2, 0, epoch, 0)
 */
export const ELEMENT_FLOATS = 12;
export const KIND = Object.freeze({ body: 0, satellite: 1, flyby: 2 });

export function orbitWgsl() {
    return `
struct OrbitInfo { time: f32, count: f32, pad0: f32, pad1: f32 };
@group(0) @binding(0) var<uniform> info: OrbitInfo;
@group(0) @binding(1) var<storage, read> elements: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> records: array<vec4<f32>>;

const TWO_PI: f32 = 6.283185307179586;

// A body's position from its elements: positionAt3 in f32.
// The turn count is reduced BEFORE the multiply: sin/cos at f32 lose accuracy with the argument's size, and
// 2*PI*t/period grows without bound. fract() keeps the argument under 2*PI; positionAt3's f64 does not need
// to, and the two agree to the same angle exactly in the mathematics.
// u is the angle PAST THE NODE, which is the body's phase (r.zw); the tilt about the node line is r.xy.
fn bodyPos(e: vec4<f32>, r: vec4<f32>, time: f32) -> vec3<f32> {
  var u = 0.0;
  if (e.y > 0.0) { u = TWO_PI * fract(time / e.y); }
  let cu = cos(u); let su = sin(u);
  return vec3<f32>(e.x * (r.z * cu - r.w * su * r.x), e.x * (r.w * cu + r.z * su * r.x), e.x * su * r.y);
}
// A satellite's own circle, in the ecliptic, about its parent: satelliteAt. The phase is carried whole (e.z) and
// the angle reduced the same way; the parent is recomputed from ITS elements, never read from the records buffer.
fn satPos(e: vec4<f32>, time: f32) -> vec3<f32> {
  var ang = e.z;
  if (e.y > 0.0) { ang = ang + TWO_PI * fract(time / e.y); }
  return vec3<f32>(e.x * cos(ang), e.x * sin(ang), 0.0);
}
// Barker's equation for a parabola of perihelion q, at dt since perihelion, mu = 1: D = tan(nu/2) from the cubic
// D^3 + 3D - 3W = 0 in the stable form D = u - 1/u, u = cbrt(3W/2 + s) (see the header). The cube root's argument is
// POSITIVE for every W (s > |3W/2|), so pow() needs no sign guard -- a guard here would be dead code, and a sabotage
// of dead code is blind (v4476 found exactly that and removed it). Rotated by the aim (r.zw).
fn flybyPos(e: vec4<f32>, r: vec4<f32>, k: vec4<f32>, time: f32) -> vec3<f32> {
  let q = max(1e-9, e.x);
  let W = (time - k.z) * sqrt(1.0 / (2.0 * q * q * q));
  let s = sqrt(9.0 * W * W / 4.0 + 1.0);
  let u = pow(1.5 * W + s, 1.0 / 3.0);
  let D = u - 1.0 / u;
  let nu = 2.0 * atan(D);
  let rad = q * (1.0 + D * D);
  let x = rad * cos(nu); let y = rad * sin(nu);
  return vec3<f32>(x * r.z - y * r.w, x * r.w + y * r.z, 0.0);
}

@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  if (i >= u32(info.count)) { return; }
  let e = elements[3u * i];
  let r = elements[3u * i + 1u];
  let k = elements[3u * i + 2u];   // (kind, parent, epoch, 0)
  var p = vec3<f32>(0.0, 0.0, 0.0);
  if (k.x < 0.5) { p = bodyPos(e, r, info.time); }
  else if (k.x < 1.5) { let pi = u32(k.y); p = bodyPos(elements[3u * pi], elements[3u * pi + 1u], info.time) + satPos(e, info.time); }
  else { p = flybyPos(e, r, k, info.time); }
  records[i] = vec4<f32>(p, e.w);
}
`;
}

/**
 * Elements from a buildOrrery() system: the centre first (a = 0, still), then every body -- and, when given, each
 * body's fleet (satellites then debris, in fleetsFor's order) and the flybys. Returns the packed elements, the count,
 * the names, and a `layout` (one entry per record: { kind, name, body?, sat?, flyby?, parent }) the CPU twin walks.
 *
 * @param opts.fleets   a Map from fleetsFor(system, ejecta, fleetOpts): { satellites, debris } per body name
 * @param opts.flybys   reachedBodies(...) -- what the 2D page draws as passing traffic
 * @param opts.satRadius / debrisRadius   drawn sizes; the 2D page draws these as fixed pixel marks, so a world radius is chosen here and said
 */
export function elementsOf(system, { centreRadius = 0.6, fleets = null, flybys = null, satRadius = 0.05, debrisRadius = 0.03 } = {}) {
    const bodies = system.bodies || [];
    const layout = [{ kind: KIND.body, name: system.centre || "SweK", body: null, parent: -1 }];
    bodies.forEach((b) => layout.push({ kind: KIND.body, name: b.name, body: b, parent: -1 }));
    if (fleets) bodies.forEach((b, i) => { const f = fleets.get ? fleets.get(b.name) : fleets[b.name]; if (!f) return;
        for (const sat of f.satellites || []) layout.push({ kind: KIND.satellite, name: `${sat.path} (imports ${b.name})`, sat, parent: i + 1, radius: satRadius });
        for (const d of f.debris || []) layout.push({ kind: KIND.satellite, name: `${d.path} (paperwork of ${b.name})`, sat: d, parent: i + 1, radius: debrisRadius }); });
    if (flybys) for (const fb of flybys) layout.push({ kind: KIND.flyby, name: `${fb.name} (reached, ${fb.may})`, flyby: fb, parent: -1 });
    const el = new Float32Array(layout.length * ELEMENT_FLOATS);
    layout.forEach((L, i) => {
        const o = i * ELEMENT_FLOATS;
        if (L.kind === KIND.body) {
            if (!L.body) { el.set([0, 0, 0, centreRadius, 1, 0, 1, 0, 0, 0, 0, 0], o); return; }
            const b = L.body, ph = phaseFor(b.name), inc = Number(b.inclination) || 0;
            el.set([b.a, b.period, ph, b.radius, Math.cos(inc), Math.sin(inc), Math.cos(ph), Math.sin(ph), 0, 0, 0, 0], o);
        } else if (L.kind === KIND.satellite) {
            const s = L.sat;
            el.set([s.a, s.period, s.phase, L.radius, 0, 0, 0, 0, KIND.satellite, L.parent, 0, 0], o);
        } else {
            const f = L.flyby, aim = Number(f.aim) || 0;
            el.set([f.q, 0, 0, f.radius || 0.15, 0, 0, Math.cos(aim), Math.sin(aim), KIND.flyby, 0, Number(f.epoch) || 0, 0], o);
        }
    });
    return { elements: el, count: layout.length, names: layout.map((L) => L.name), layout,
             kinds: Uint8Array.from(layout.map((L) => L.kind)),
             counts: { bodies: bodies.length, satellites: layout.filter((L) => L.kind === KIND.satellite && L.name.includes("(imports ")).length,
                       debris: layout.filter((L) => L.kind === KIND.satellite && L.name.includes("(paperwork of ")).length,
                       flybys: layout.filter((L) => L.kind === KIND.flyby).length } };
}

/** The twin: the records at time t, through positionAt3, satelliteAt about the parent's positionAt3, and flybyAt. */
export function orbitRecordsCpu(system, tDays, layout = null) {
    const L = layout || elementsOf(system).layout;
    const out = new Float32Array(L.length * RECORD_FLOATS);
    const bodyAt = (entry) => (entry.body ? positionAt3(entry.body, tDays) : { x: 0, y: 0, z: 0 });
    L.forEach((entry, i) => {
        let p, radius;
        if (entry.kind === KIND.body) { p = bodyAt(entry); radius = entry.body ? entry.body.radius : 0.6; }
        else if (entry.kind === KIND.satellite) { const c = bodyAt(L[entry.parent]), s = satelliteAt(entry.sat, tDays); p = { x: c.x + s.x, y: c.y + s.y, z: c.z }; radius = entry.radius; }
        else { const f = flybyAt(entry.flyby, tDays); p = { x: f.x, y: f.y, z: 0 }; radius = entry.flyby.radius || 0.15; }
        out.set([p.x, p.y, p.z, radius], i * RECORD_FLOATS);
    });
    return out;
}

/**
 * A records SOURCE for makeGpuDrivenScene(): on WebGPU a buffer the orbit pass writes, everywhere the twin.
 * `advance(tDays)` runs the pass (or nothing, on the twin route -- the cpu() closure reads `t`).
 */
export function makeOrbitSource(device, system, opts = {}) {
    const { elements, count, names, layout, kinds, counts } = elementsOf(system, opts);
    let t = 0;
    const cpu = () => orbitRecordsCpu(system, t, layout);
    if (device.backend !== "webgpu") return { count, cpu, names, layout, kinds, counts, advance(td) { t = td; return { path: "cpu" }; }, readRecords: async () => cpu(), destroy() {} };
    const pipe = device.compute({ wgsl: orbitWgsl(), entryPoint: "main" });
    const info = device.buffer({ size: 16, usage: "uniform" });
    const elBuf = device.buffer({ data: elements, usage: "storage" });
    const buffer = device.buffer({ size: count * RECORD_FLOATS * 4, usage: "storage" });
    pipe.bind("info", info).bind("elements", elBuf).bind("records", buffer);
    return {
        count, cpu, names, layout, kinds, counts, buffer,
        /** Write the time and dispatch the orbit pass. Runs as its own submission so the cull's frame sees it. */
        advance(td) { t = td; info.write(new Float32Array([td, count, 0, 0])); device.frame(({ pass }) => pass.dispatch(pipe, Math.ceil(count / 64))); return { path: "compute" }; },
        readRecords: async () => new Float32Array(await device.read(buffer)),
        destroy() { for (const b of [info, elBuf, buffer]) { try { b.destroy(); } catch (e) {} } },
    };
}

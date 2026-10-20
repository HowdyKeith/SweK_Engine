#!/usr/bin/env node
// WebGLEngine/tools/roundhouse/conditioningOne.mjs -- v4487
//
// Run: node tools/roundhouse/conditioningOne.mjs <device> <mode>
//
// The libm perturbation for ONE device/mode, in its own process, reporting the numbers an amplification figure
// needs in order to MEAN anything: the base value, the absolute move, and how many significant digits of the
// base survive that move.
//
// *** WHY THE ABSOLUTE MOVE IS THE MISSING COLUMN. *** amplification is a RELATIVE move divided by an ulp, so it
// divides by the base value. v4486 found the lab's three largest amplifications are residuals -- quantities
// whose correct value is ZERO -- where that denominator is the error being measured rather than a scale.
// quantum.bands.edgeRhsWorst reads 2.57e15 on a base of 1.554e-15 that moved by 8.882e-16: a number at the
// round-off floor, moved by round-off. Divide one by the other and you get an astronomical ratio that says
// nothing about conditioning.
//
// It is two builds per mode rather than the battery's eight, because none of the other criteria are wanted here.
import { getDevice } from "./devices.mjs";
import { withPerturbedLibm, diffObservables } from "./libmSensitivity.mjs";

const [device, mode] = process.argv.slice(2);
if (!device || !mode) { console.error("usage: conditioningOne.mjs <device> <mode>"); process.exit(2); }

try {
    const dev = await getDevice(device);
    const base = await dev.build({ mode });
    const pert = await withPerturbedLibm(() => dev.build({ mode }));
    const rows = diffObservables(base, pert)
        .filter((x) => x.base !== undefined && Number.isFinite(x.base))
        .map((x) => ({ field: x.field, moved: !!x.moved, base: x.base, pert: x.pert,
                       relMove: x.relMove, amplification: x.amplification }));
    process.stdout.write(JSON.stringify({ device, mode, error: null, rows }));
} catch (e) {
    process.stdout.write(JSON.stringify({ device, mode, error: String(e && e.message || e), rows: [] }));
}

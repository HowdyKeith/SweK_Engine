// WebGLEngine/tools/ship/seatGunnerGpuReport.mjs -- v4877
//
// Run: node tools/ship/seatGunnerGpuReport.mjs
//
// Prints brain/seatGunnerGpu.mjs's own report: what the GPU batch of a fight's gun-seat networks is and is not doing (it is SLOWER than the CPU on a two-ship fight; what it buys is the machinery for a fleet or a thousand parallel
// copies). This is the module's caller that is not its gate: reportingTools.mjs lists the module for tools.html, and this is the command that imports it, so the orphan censuses see a consumer and not a library only a gate loads.
//
// *** NO EXPORTS ON PURPOSE. This is a command-line entry point and not a module (see lagBlameWatch.mjs for the same rule). ***
import { reportLines } from "../../brain/seatGunnerGpu.mjs";

for (const l of reportLines()) console.log(l);

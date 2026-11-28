// WebGLEngine/tools/ship/studyCmd.mjs -- UNNUMBERED (2026-11-22, at the ship of the round that wrote these tools). EXPORTS NOTHING ON PURPOSE.
//
// ONE COMMAND LINE FOR THE ROUND'S STUDIES AND TOOLS. Each of them is a program (`node tools/ship/takeLadder.mjs --read`) that also exports what its gate grades, and a module only gates
// import is an orphan to tools/ship/graveyard-selfcheck.mjs however often it is run by hand -- the census follows import specifiers, not shell history. This is their caller that is not a
// gate (the way tools/ship/takeEvadeSeatCmd.mjs is its library's): each name below is a LITERAL import the census can follow, and running one is exactly running the file itself.
//
//   node tools/ship/studyCmd.mjs                       the names
//   node tools/ship/studyCmd.mjs <name> [args...]      the same as `node <its file> [args...]`: argv[1] is set to the file, so its own "am I the program" test is true and its own main runs
//   node tools/ship/studyCmd.mjs pairs-taken           every seed the registered studies have taken (tools/ship/pairsTaken.mjs), one range a line
//
// A NEW STUDY OR TOOL OF THIS KIND IS ADDED HERE IN THE SAME COMMIT, or the orphan census goes red the day it is written -- which is the census doing its job.
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = {
    takeAmmoStudy: () => import("./takeAmmoStudy.mjs"),
    takeBestShipLoadout: () => import("./takeBestShipLoadout.mjs"),
    takeBestShipLoadout2: () => import("./takeBestShipLoadout2.mjs"),
    takeBestShipLoadout3: () => import("./takeBestShipLoadout3.mjs"),
    takeButtonHardToday: () => import("./takeButtonHardToday.mjs"),
    takeButtonHarder: () => import("./takeButtonHarder.mjs"),
    takeButtonLast: () => import("./takeButtonLast.mjs"),
    takeButtonNoCannon: () => import("./takeButtonNoCannon.mjs"),
    takeButtonOneHard: () => import("./takeButtonOneHard.mjs"),
    takeButtonUntried: () => import("./takeButtonUntried.mjs"),
    takeBySightLoadout: () => import("./takeBySightLoadout.mjs"),
    takeBySizeLoadout: () => import("./takeBySizeLoadout.mjs"),
    takeCarToday: () => import("./takeCarToday.mjs"),
    takeCarTodayEscorts: () => import("./takeCarTodayEscorts.mjs"),
    takeCarTodayNoCannon: () => import("./takeCarTodayNoCannon.mjs"),
    takeCarTodayRations: () => import("./takeCarTodayRations.mjs"),
    takeFleetHandSizes: () => import("./takeFleetHandSizes.mjs"),
    takeFlyWiredFights: () => import("./takeFlyWiredFights.mjs"),
    takeFlyWiredGunnerControl: () => import("./takeFlyWiredGunnerControl.mjs"),
    takeFlyWiredGunnerFix: () => import("./takeFlyWiredGunnerFix.mjs"),
    takeFlyWiredGunnerHold: () => import("./takeFlyWiredGunnerHold.mjs"),
    takeFlyWiredGunnerHoldSees: () => import("./takeFlyWiredGunnerHoldSees.mjs"),
    takeFlyWiredGunnerMixed: () => import("./takeFlyWiredGunnerMixed.mjs"),
    takeFlyWiredGunnerNear: () => import("./takeFlyWiredGunnerNear.mjs"),
    takeFlyWiredGunnerSees: () => import("./takeFlyWiredGunnerSees.mjs"),
    takeFlyWiredGunnerShips: () => import("./takeFlyWiredGunnerShips.mjs"),
    takeFlyWiredGunnerTrigger: () => import("./takeFlyWiredGunnerTrigger.mjs"),
    takeFlyWiredGunnerTune: () => import("./takeFlyWiredGunnerTune.mjs"),
    takeFlyWiredGunnerVsPilot: () => import("./takeFlyWiredGunnerVsPilot.mjs"),
    takeFlyWiredHelmAxes: () => import("./takeFlyWiredHelmAxes.mjs"),
    takeFlyWiredHelmControl: () => import("./takeFlyWiredHelmControl.mjs"),
    takeFlyWiredHelmFix: () => import("./takeFlyWiredHelmFix.mjs"),
    takeFlyWiredHelmNoCannon: () => import("./takeFlyWiredHelmNoCannon.mjs"),
    takeFlyWiredHelmOneAxis: () => import("./takeFlyWiredHelmOneAxis.mjs"),
    takeFlyWiredHelmTune: () => import("./takeFlyWiredHelmTune.mjs"),
    takeFlyWiredNext: () => import("./takeFlyWiredNext.mjs"),
    takeFlyWiredOneWindow: () => import("./takeFlyWiredOneWindow.mjs"),
    takeHelmAudit: () => import("./takeHelmAudit.mjs"),
    takeHelmLadder: () => import("./takeHelmLadder.mjs"),
    takeLadder: () => import("./takeLadder.mjs"),
    takeLoomBenchGF: () => import("./takeLoomBenchGF.mjs"),
    takePlacesControl: () => import("./takePlacesControl.mjs"),
    takePresetsHard: () => import("./takePresetsHard.mjs"),
    takeSineHelmBest: () => import("./takeSineHelmBest.mjs"),
    takeSineHelmNoCannon: () => import("./takeSineHelmNoCannon.mjs"),
    takeSineTwins: () => import("./takeSineTwins.mjs"),
    takeSpaceEvadeSeat: () => import("./takeSpaceEvadeSeat.mjs"),
    takeSplitHelm: () => import("./takeSplitHelm.mjs"),
    takeSplitHelmFleet: () => import("./takeSplitHelmFleet.mjs"),
    takeSplitHelmSizes: () => import("./takeSplitHelmSizes.mjs"),
    takeSteerCannon: () => import("./takeSteerCannon.mjs"),
    trainHelmSteer: () => import("./trainHelmSteer.mjs"),
    trainTrackSeat: () => import("./trainTrackSeat.mjs"),
    trainTurretSeatFleet: () => import("./trainTurretSeatFleet.mjs"),
    trainTurretSeatFleet2: () => import("./trainTurretSeatFleet2.mjs"),
    trainTurretSeatToday: () => import("./trainTurretSeatToday.mjs"),
    bakeDendritePlaces: () => import("../bakeDendritePlaces.mjs"),
    denoiseKernelRound: () => import("../denoiseKernelRound.mjs"),
    denoiseLayers: () => import("../denoiseLayers.mjs"),
    lightingCost: () => import("../lightingCost.mjs"),
    subShipDuel: () => import("../../brain/subShipDuel.mjs"),   // 2026-11-28: the sub-against-ship arena, the hand tactician against each class and helm   // 2026-11-27: what the new lighting costs on the rig's card
    splatPack: () => import("../splatPack.mjs"),
};
const FILE = (name) => { const t = String(TOOLS[name]).match(/import\("([^"]+)"\)/)[1]; return path.resolve(HERE, t); };

const [name, ...rest] = process.argv.slice(2);
if (name === "pairs-taken") {
    const { taken } = await import("./pairsTaken.mjs");
    const got = await taken();
    const ranges = (xs) => { const u = [...new Set(xs.map(Number))].sort((p, q) => p - q), out = []; for (const x of u) { const r = out[out.length - 1]; if (r && x === r[1] + 1) r[1] = x; else out.push([x, x]); } return out.map(([p, q]) => (p === q ? `${p}` : `${p}-${q}`)).join(", "); };
    for (const [file, seeds] of (Array.isArray(got) ? got : Object.entries(got))) console.log(`${String(file).padEnd(34)} ${ranges([].concat(seeds))}`);
} else if (!name || !TOOLS[name]) {
    if (name) console.error(`studyCmd: no tool "${name}"`);
    console.log("node tools/ship/studyCmd.mjs <name> [args...]   or   pairs-taken\n  " + Object.keys(TOOLS).join("\n  "));
    process.exitCode = name ? 2 : 0;
} else {
    process.argv = [process.argv[0], FILE(name), ...rest];   // the tool's own test `import.meta.url === pathToFileURL(process.argv[1]).href` now holds: it runs as if called directly
    await TOOLS[name]();
}

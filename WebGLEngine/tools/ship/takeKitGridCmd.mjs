// WebGLEngine/tools/ship/takeKitGridCmd.mjs -- UNNUMBERED. The command line of the kit grid (tools/ship/takeKitGrid.mjs); see there for the arguments.
//   node tools/ship/takeKitGridCmd.mjs run --out brain/kitGrid.json        (the registered set: Sea OGRE scenarios 101 to 112 under the eight subsets, engine only)
//   node tools/ship/takeKitGridCmd.mjs run --first 1 --count 4              (the DEV scenarios: a smoke, labelled so)
// NO orientation default is set: the Sea OGRE read of the kit and the after-action and counterfactual commands ran on the engine's default (RK4) step.
import { command } from "./takeKitGrid.mjs";
process.exitCode = await command(process.argv.slice(2));

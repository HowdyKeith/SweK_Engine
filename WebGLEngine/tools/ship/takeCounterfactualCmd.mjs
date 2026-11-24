// WebGLEngine/tools/ship/takeCounterfactualCmd.mjs -- UNNUMBERED. The command line of the counterfactual re-flights (tools/ship/takeCounterfactual.mjs); see there for the arguments.
//   node tools/ship/takeCounterfactualCmd.mjs fly --seed 105 --kit decoy,screen
//   node tools/ship/takeCounterfactualCmd.mjs subsets --seed 105
//   node tools/ship/takeCounterfactualCmd.mjs propose --base <host:port> --key <key> --model <id> --set registered --out brain/<model>-counterfactual.jsonl
//   node tools/ship/takeCounterfactualCmd.mjs report --in brain/<model>-counterfactual.jsonl
// NO orientation default is set: the Sea OGRE numbers of the series (and of the after-action analyzer) are the engine's own default.
import { command } from "./takeCounterfactual.mjs";
process.exitCode = await command(process.argv.slice(2));

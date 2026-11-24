// WebGLEngine/tools/ship/takeAfterActionCmd.mjs -- UNNUMBERED. The command line of the after-action analyzer (tools/ship/takeAfterAction.mjs); see there for the arguments.
//   node tools/ship/takeAfterActionCmd.mjs facts --set dev
//   node tools/ship/takeAfterActionCmd.mjs ask --base 192.168.1.20:8080 --key <the key PrivateLM shows> --model <id> --set dev --out brain/afterActionDev-<model>.jsonl
//   node tools/ship/takeAfterActionCmd.mjs report --in brain/afterActionDev-<model>.jsonl
// No orientation step is set here: the fights this analyzer narrates are the committed Sea OGRE numbers (brain/subCountermeasuresHeld75.jsonl), which the engine's default step (RK4) reproduces to the last digit.
const { command } = await import("./takeAfterAction.mjs");
process.exitCode = await command(process.argv.slice(2));

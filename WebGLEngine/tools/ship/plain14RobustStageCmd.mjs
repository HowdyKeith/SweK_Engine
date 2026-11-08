// WebGLEngine/tools/ship/plain14RobustStageCmd.mjs -- UNNUMBERED. The command line of round 7 stage 2 as one stage (tools/ship/plain14RobustStage.mjs; the registration is brain/PLAIN14_ROBUST_STAGE_WIP.md):
//   node tools\ship\plain14RobustStageCmd.mjs run --all                         (twenty draws, about 30 minutes each on 4 cores; a draw whose record exists is skipped, so it is resumable)
//   node tools\ship\plain14RobustStageCmd.mjs run --arm fly --seed 6310         (one draw)
//   node tools\ship\plain14RobustStageCmd.mjs report                            (READ ONCE, when all twenty records are in)
// THE FIRST-ORDER ORIENTATION STEP IS SET HERE, BEFORE ANYTHING IMPORTS THE PHYSICS: the stage-1 champions were trained under it, so the whole stage is (the children inherit it too).
process.env.SWEK_6DOF_ORIENTATION = "euler";
const { command } = await import("./plain14RobustStage.mjs");
process.exitCode = await command(process.argv.slice(2));

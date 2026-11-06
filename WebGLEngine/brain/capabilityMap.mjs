// WebGLEngine/brain/capabilityMap.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHICH BRAIN CAN DO WHAT, AT EACH SIMULATION LEVEL, AND WHAT THE TREE SAYS ABOUT HOW WELL -- as data, with every claim tied to a place it can be checked. Written 2026-11-02 because nobody had seen one map of it (Keith asked), and a prose
// summary of 40 pilots from memory is exactly the kind of text this tree has caught itself getting wrong. So:
//   * every cell has a STATUS from a closed vocabulary (STATUSES) and a line of words;
//   * a cell that makes a claim (anything but NOT_BUILT and NOT_APPLICABLE) cites SOURCES: a file, or a changelog entry by version, and for a claim about a result a QUOTE that must appear in that source, so the number on the map is
//     the number in the record, and a record that changes breaks the map's gate instead of leaving a stale map;
//   * a cell nobody has read for this map says EXISTS_UNREAD and names the file that exists. It does not guess a result.
// The Markdown (docs/BRAIN-CAPABILITY-MAP.md) is rendered from this data by tools/ship/takeCapabilityMap.mjs and the gate holds the two equal. Pure: no clock, no Math.random; reading the sources is the gate's business.
//
// THE BRAINS: `hand` is the hand-written controller or rule the others are measured against; `fly` is the fruit fly's Giant Fiber Circuit (34 neurons, 313 synapses) wired as a pilot; `gpu` is the GPU Brain's plain MLP; `fish` is the zebrafish
// circuits; `lm` is a local language model in an advisor seat. (An "amoeba brain" does not exist in this tree; the nearest thing is the GPU Brain pointed at the Blobulator lava, under OTHER.)
"use strict";

export const BRAINS = Object.freeze([
    Object.freeze({ id: "hand", name: "Hand rule / PD autopilot" }),
    Object.freeze({ id: "fly", name: "Fly circuit" }),
    Object.freeze({ id: "gpu", name: "GPU Brain (MLP)" }),
    Object.freeze({ id: "fish", name: "Fish circuits" }),
    Object.freeze({ id: "lm", name: "Language model" }),
]);

/** TRAINED: a trained pilot is shipped or written with a measured result. HAND_WIRED: the network is wired to reproduce the hand pilot (no gain claimed). NO_CHAMPION: searches ran and nothing qualified. TUNED: a hand rule whose numbers were fitted.
 *  SCRIPTED: a rule only. NO_EFFECT: tried, and it did not help. NOT_CONCLUDED: run, and the registered test could not decide. EXISTS_UNREAD: the files exist; this map did not read a result. NOT_BUILT / NOT_APPLICABLE: nothing there. */
export const STATUSES = Object.freeze(["TRAINED", "HAND_WIRED", "NO_CHAMPION", "TUNED", "SCRIPTED", "NO_EFFECT", "NOT_CONCLUDED", "EXISTS_UNREAD", "NOT_BUILT", "NOT_APPLICABLE"]);
export const NEEDS_SOURCE = Object.freeze(STATUSES.filter((s) => s !== "NOT_BUILT" && s !== "NOT_APPLICABLE"));
export const NEEDS_QUOTE = Object.freeze(["TRAINED", "HAND_WIRED", "NO_CHAMPION", "TUNED", "NO_EFFECT", "NOT_CONCLUDED"]);

const f = (file, quote) => (quote === undefined ? { file } : { file, quote });
const L = (log, quote) => ({ log, quote });
const nb = (text = "nothing built") => ({ status: "NOT_BUILT", text });
const na = (text) => ({ status: "NOT_APPLICABLE", text });

export const LEVELS = Object.freeze([
    { id: "sub", name: "Submarine", tasks: [
        { id: "sub-pilot", name: "Hold depth, heading and speed (a 6-DOF boat, no weapons)", shoots: false, cells: {
            hand: { status: "TRAINED", text: "the PD cascade is the baseline every pilot is scored against (held-out -0.4880)", src: [f("brain/SUBMARINE_WIP.md", "-0.4880")] },
            fly: { status: "TRAINED", text: "963-weight pilot, seed 6002: held-out -0.3278 against the autopilot's -0.4880; later robust, tail, wide-hull and noisy-sense variants exist", src: [f("brain/SUBMARINE_WIP.md", "0.3278"), f("brain/pilotSubWeightsRobustNoisyWip.json")] },
            gpu: nb("no sub pilot on the GPU Brain's MLP was found in brain/"),
            fish: { status: "TRAINED", text: "a fish circuit as a residual on the autopilot gains about 0.19 on pitch hold (4b-P) -- but shuffled wirings keep ~88% of it, permuted tuning 77-84%, memory adds nothing: the gain is the trained readout, not the fish", src: [f("brain/FISH_VESTIBULAR_HELPER_WIP.md", "roughly 88 percent"), f("brain/FISH_VESTIBULAR_HELPER_WIP.md", "77 percent")] },
            lm: na("a language model does not steer a hull"),
        } },
        { id: "sub-duel", name: "Find and sink a drone with sonar and torpedoes", shoots: true, cells: {
            hand: { status: "TUNED", text: "the tactician is search/track/ping/attack/evade from sonar only, with 11 fitted numbers: 141 wins, 1 loss, 18 draws in 160 fresh duels against 117/11/32 for the hand numbers", src: [f("brain/SUBMARINE_WIP.md", "141W 1L 18D")] },
            fly: nb("no brain holds the tactician's seat; its 11 numbers were searched, not replaced"),
            gpu: nb(),
            fish: nb(),
            lm: nb(),
        } },
        { id: "sub-needs", name: "Survey run with a battery, a hull that feels pressure, a noisy gauge (needs and limits)", shoots: false, cells: {
            hand: { status: "TUNED", text: "the rule advisor GUARDED-FILTER (surface under a charge threshold that falls with depth) beats every model and every fixed cap: mean 0.763/0.713/0.806 against the brain alone 0.586/0.558/0.638; choosing the next station by trying the orders of the four nearest on a twin of the boat's own simulation (brain/plannerSeat.mjs) adds +0.0214 (se 0.0040) on 288 fresh dives, 35 better and 3 worse, a small gain (far +0.031, both +0.012) that keeps about half of itself when the twin is 10 percent wrong in all four ways at once and is lost at 20 percent", src: [f("brain/NEEDS_AND_LIMITS.md", "RULE-GF 0.763 | 0.713 | 0.806"), L("v4911", "+0.0214 (se 0.0040)"), L("v4911", "10 percent in all four keep about half of it")] },
            fly: { status: "NOT_CONCLUDED", text: "the circuit pilot's registered task re-check could not pass under the noisy gauge (a defect of my registration, restated post hoc as Round 3 amendment 3)", src: [f("brain/NEEDS_AND_LIMITS.md", "AMENDMENT 3")] },
            gpu: nb("a trained advisor or pilot on the MLP is the experiment not yet run"),
            fish: nb(),
            lm: { status: "NO_EFFECT", text: "gemma2:9b and llama3.1:8b at temperature 0, 4,273 and 4,217 situations on the reserved seeds: mixed against the brain alone, a tie with the best fixed cap, a loss to the rule on every audit", src: [f("brain/NEEDS_AND_LIMITS.md", "NO CONSISTENT EFFECT (MIXED)")] },
        } },
        { id: "sub-estimator", name: "Heading through a compass dropout (rung 4a: circuits as estimators)", shoots: false, cells: {
            hand: { status: "SCRIPTED", text: "a plain dead-reckoning navigator flies the dropout: on the tank's settled dark error it only TIES the autopilot (the score mostly measures how fast the sub turns), but on the dark cost it pays nothing for losing the compass (0.0000 against the autopilot's +0.0293 on 100 far ids); one leaky unit fed the heading rate pays +0.0008", src: [f("render/subDropoutData.mjs"), f("brain/BACKLOG_PICKUPS_2026-11-05.md", "0.0000")] },
            fly: { status: "NO_EFFECT", text: "the fly's real heading-loop wiring as an estimator behind the autopilot, against random wirings of its size: v3 (every wiring at its own measured edge of stability) FAIL in all three arms, the real wiring winning on 0 of 3 audits against the strongest family with skill 0.01 to 0.15 against 0.90 to 0.92 for ONE leaky unit; v4 (a ring map with the flag) FAILED both arms; v5 (a flag-free signed rate) found NO SIGNAL in the signed arm -- the graph as wired cannot tell the sign of a turn", src: [L("v4903", "FAIL in all three arms by the rule written down in advance"), L("v4903", "against the strongest family the real wiring wins on 0 of 3 audits"), L("v4905", "version 4 (a ring map with the flag, 7-factor grid) FAILED both arms"), L("v4905", "found NO SIGNAL in the signed arm")] },
            gpu: nb(),
            fish: { status: "NO_EFFECT", text: "no fish circuit is tried as an estimator; the random wirings of the fly's size are the controls, and they rise while the real wiring does not (v3: the real wiring wins on 0 of 3 audits against the strongest family; v4 FAILED both arms)", src: [L("v4903", "against the strongest family the real wiring wins on 0 of 3 audits"), L("v4905", "version 4 (a ring map with the flag, 7-factor grid) FAILED both arms")] },
            lm: nb(),
        } },
    ] },
    { id: "sky", name: "Sky", tasks: [
        { id: "sky-flight", name: "Real fixed-wing flight: hold altitude, heading and airspeed through gusts and recoveries", shoots: false, cells: {
            hand: { status: "TRAINED", text: "the PD autopilot (audit -0.4223)", src: [L("v4869", "-0.4223")] },
            fly: { status: "TRAINED", text: "243 of 1,099 weights moved: audit -0.3199 against -0.4223; the gain is in recoveries and gusts, almost none on calm starts; equally safe, not safer", src: [L("v4869", "-0.3199")] },
            gpu: { status: "HAND_WIRED", text: "an 18-32-32-4 MLP wired to reproduce the autopilot to 5e-8; the GPU does not make a flight faster (the flight model is CPU arithmetic)", src: [L("v4870", "THE GPU DOES NOT MAKE A FLIGHT FASTER")] },
            fish: nb(),
            lm: nb(),
        } },
        { id: "sky-aircraft", name: "Aircraft heading hold (es-aircraft)", shoots: false, cells: {
            hand: { status: "EXISTS_UNREAD", text: "the PD heading-hold controller", src: [f("brain/autopilotAircraft.mjs")] },
            fly: { status: "TRAINED", text: "\"the aircraft has a trained pilot\" (v4843); its numbers were not read for this map", src: [L("v4843", "the aircraft has a trained pilot")] },
            gpu: nb(),
            fish: nb(),
            lm: nb(),
        } },
        { id: "sky-rotor", name: "Helicopter and quadrotor: hover, land, engine-out landings", shoots: false, cells: {
            hand: { status: "SCRIPTED", text: "hand autopilots for the helicopter and the quadrotor, the controls of the rotorcraft board: on 48 fresh scenarios the helicopter's reads -1.8177 (9 of 12 engine-outs lost), on 96 the quadrotor's -2.4285 (every motor-out lost)", src: [f("brain/ROTORCRAFT_BOARD_WIP.md", "-1.8177"), f("brain/ROTORCRAFT_BOARD_WIP.md", "-2.4285"), f("brain/autopilotRotor.mjs"), f("brain/autopilotDrone.mjs")] },
            fly: { status: "TRAINED", text: "the helicopter's fruit-fly pilot: audit -1.2188 against the hand pilot's -2.0770, 24 scenarios better and 10 worse, engine-out landings stand 8 s after contact in 18 of 20 flights against 5 (v4877); on 48 fresh scenarios it TIES the hand autopilot pooled (+0.1795 against a bar of +0.1966), is better on terrain, and loses 6 of 12 engine-outs against 9. The quadrotor's fruit-fly pilot TIES the hand pilot at flying and beats it only at crashing softer after a motor-out (+0.2861 pooled). Counted by scenarios won on 160 fresh scenarios (the rotor league), the helicopter's pilot beats the hand autopilot, 91 scenarios won against 51, though its mean edge on the standing kinds is only +0.0064 and on engine-outs the count is level", src: [L("v4877", "-1.2188"), f("brain/ROTORCRAFT_BOARD_WIP.md", "+0.1795"), f("brain/ROTORCRAFT_BOARD_WIP.md", "+0.2861"), f("brain/ROTOR_LEAGUE_WIP.md", "91 scenarios won, 51 lost")] },
            gpu: { status: "TRAINED", text: "the quadrotor's MLP (1,860 weights), two trainings: on 96 fresh scenarios the first TIES the hand pilot at flying (+0.0096) and the second is slightly below it (-0.0097); both land softer after a motor-out (+0.2275 and +0.3310 pooled) and the second stood 3 of 24 motor-outs where every other pilot stood none. No helicopter MLP exists. In the rotor league the hand pilot beats the second training on the standing kinds by count (42 scenarios won against 23) and is itself below all three trained brains after a motor-out", src: [f("brain/pilotDroneMlp.mjs"), f("brain/pilotDroneMlpWeightsV2.json"), f("brain/ROTORCRAFT_BOARD_WIP.md", "+0.2275"), f("brain/ROTOR_LEAGUE_WIP.md", "42 won, 23 lost")] },
            fish: nb(),
            lm: nb(),
        } },
        { id: "sky-dogfight", name: "Jet dogfight (guns), league against the autopilot, itself and the other brain", shoots: true, cells: {
            hand: { status: "EXISTS_UNREAD", text: "the jet's hand pilot (AUTOPILOT_JET_FIGHT)", src: [f("brain/autopilotFlight.mjs")] },
            fly: { status: "NO_CHAMPION", text: "a shipped fighter exists, but retraining in a league found no champion in 8 searches, then 4, then more; the fruit fly's gain on duels cost it the turning fights", src: [f("brain/DOGFIGHT_LEAGUE_WIP.md", "NO CHAMPION")] },
            gpu: { status: "NO_CHAMPION", text: "a shipped fighter exists; the league run's gain was small (58-93-49) and no search qualified", src: [f("brain/DOGFIGHT_LEAGUE_WIP.md", "58-93-49")] },
            fish: nb(),
            lm: nb(),
        } },
        { id: "sky-bomber", name: "Bomber and capital ship against fighters (gunners in the seats)", shoots: true, cells: {
            hand: { status: "EXISTS_UNREAD", text: "scenario files with gunner seats", src: [f("brain/bomberFight.mjs"), f("brain/battleshipFight.mjs")] },
            fly: nb(),
            gpu: { status: "EXISTS_UNREAD", text: "two gunnery brains (v4206): a naval policy that scores every unknown cell and a turret gunner; result not read for this map", src: [f("brain/navalPolicy.mjs"), f("brain/gunnerPolicy.mjs")] },
            fish: nb(),
            lm: nb(),
        } },
        { id: "sky-es", name: "Endless-Sky style fleet battles (flight-gpu.html, es-box3d.html): who to shoot, when to break off", shoots: true, cells: {
            hand: { status: "TUNED", text: "eight presets; the plainest ('scatter', the nearest target) wins 64% of the field; a FITTED eight-number vector beats the best preset 54-22 on the audit and takes 73.1% against the other seven", src: [L("v4849", "54-22"), L("v4849", "73.1%")] },
            fly: { status: "NOT_APPLICABLE", text: "these pages' tactics are eight numbers scored by a dot product, not the 34-neuron network (the pages say so)", src: [L("v4843", "NOT the 34-neuron fly-wired network")] },
            gpu: { status: "EXISTS_UNREAD", text: "the GPU Brain serves tactics weights once it has learned enough (GET /ai/brain/tactics); not read for this map", src: [L("v4843", "the weights the GPU Brain serves once it has learned enough")] },
            fish: nb(),
            lm: nb(),
        } },
    ] },
    { id: "space", name: "Space", tasks: [
        { id: "space-6dof", name: "Newtonian 6-DOF ship duel (es-box3d-6dof.html): turn, thrust, fire, and not ram", shoots: true, cells: {
            hand: { status: "EXISTS_UNREAD", text: "the PD attitude controller is the opponent and the baseline", src: [f("brain/autopilot6dof.mjs")] },
            fly: { status: "TRAINED", text: "a league-trained pilot (85 of 930 weights moved) -- but its 42-3 was one start's corridor; from a close joust start it lost all 80 games to the PD autopilot; a close-quarters pilot then beat the shipped one 106-12 and nothing learned to ram less; retrained at damage 6 at v4896; in the page's own fight (three a side, collisions on) the close-quarters pilot wins 730 of its 800 and is the only one better than the PD autopilot, which beats the League pilot 155-44", src: [L("v4846", "85 of the 930 weights"), L("v4848", "loses all 80 games to the PD autopilot"), L("v4848", "106-12"), L("v4896", "retrained at damage 6"), f("brain/SIXDOF_PAGE_FIGHT_WIP.md", "W730/L58/D12"), f("brain/SIXDOF_PAGE_FIGHT_WIP.md", "W155/L44/D1")] },
            gpu: { status: "TRAINED", text: "the fly's Default recipe on the MLP, 29 of 1,637 weights kept: it beats its hand twin by the fly's rule (audit W10/L0/D10, where the twin draws all 20), but head to head with the fly's Default it won none of 80 (W0/L70/D10: fly better); a choice on the page's Load Pilots panel; in the page's own fight it ties the PD autopilot and loses to the fly's Default 76-123; a league round against the Default halved the duel gap (0-74 to 9-46 on fresh games) but did not qualify; a close-quarters round learned the joust against the Default (79-1 on fresh games, from 29-27) but not the standoff (0-66: it died in every standoff game), so it did not qualify either; nothing was written by either; twenty searches a brain by the first recipe could not tell the two networks apart (p = 0.265), and the fly's Default beat all 40 fresh searches of both: the 70-0 was the Default's draw", src: [f("brain/SIXDOF_PAGE_FIGHT_WIP.md", "W123/L76/D1"), f("brain/SIXDOF_GPU_BRAIN_WIP.md", "p = 0.265"), f("brain/SIXDOF_GPU_BRAIN_WIP.md", "W1205/L24/D371"), f("brain/SIXDOF_GPU_BRAIN_WIP.md", "W9/L46/D25"), f("brain/SIXDOF_GPU_BRAIN_WIP.md", "W79/L1/D0"), f("brain/SIXDOF_GPU_BRAIN_WIP.md", "W0/L66/D14"), f("brain/SIXDOF_GPU_BRAIN_WIP.md", "died in all 80 standoff games"), f("brain/SIXDOF_GPU_BRAIN_WIP.md", "29 of the 1,637"), f("brain/SIXDOF_GPU_BRAIN_WIP.md", "W10/L0/D10"), f("brain/SIXDOF_GPU_BRAIN_WIP.md", "W0/L70/D10"), f("brain/pilot6dofMlpWeightsDefault.json"), f("es-box3d-6dof.html", "pilot6dofMlpWeightsDefault.json")] },
            fish: nb(),
            lm: nb(),
        } },
        { id: "space-nav", name: "Navigation around black holes and anomalies (field navigation, probes as emitters)", shoots: false, cells: {
            hand: { status: "TUNED", text: "a multi-source Dijkstra flow field, made gauge-invariant (a constant added to the potential changes no cost)", src: [f("brain/fieldSpace.mjs", "GAUGE INVARIANCE")] },
            fly: nb(),
            gpu: nb(),
            fish: nb(),
            lm: nb(),
        } },
        { id: "space-needs", name: "Fuel, heat and hull as limits, with advisor seats (the submarine's needs-and-limits idea)", shoots: false, cells: {
            hand: nb("the idea ports (a seat is a function from state to decision) but nothing is built for space"),
            fly: nb(),
            gpu: nb(),
            fish: nb(),
            lm: nb(),
        } },
    ] },
    { id: "other", name: "Other", tasks: [
        { id: "other-drive", name: "Race-car driving and the turret gunner (GPU Brain on a track)", shoots: true, cells: {
            hand: nb(),
            fly: nb(),
            gpu: { status: "TRAINED", text: "\"the GPU Brain learns to drive\" (v4218): a 9-8-2 driver and an 11-feature gunner; numbers not read for this map", src: [L("v4218", "GPU Brain learns to drive"), f("brain/gunnerPolicy.mjs")] },
            fish: nb(),
            lm: nb(),
        } },
        { id: "other-blob", name: "Steer the Blobulator lava (the nearest thing to an 'amoeba brain')", shoots: false, cells: {
            hand: { status: "SCRIPTED", text: "the old timed fountain it replaces", src: [f("brain/blobBrain.js", "replaces the dumb timed fountain")] },
            fly: nb(),
            gpu: { status: "TRAINED", text: "a small MLP learns online by evolution strategies in four reward modes (fountain, sheepdog, spread/clump, sculpt)", src: [f("brain/blobBrain.js", "evolution-strategies")] },
            fish: nb(),
            lm: nb(),
        } },
    ] },
]);

export const ALL_TASKS = Object.freeze(LEVELS.flatMap((l) => l.tasks.map((t) => ({ ...t, level: l.id }))));

/** Every cell of every task, as { level, task, brain, cell }. */
export const allCells = () => ALL_TASKS.flatMap((t) => BRAINS.map((b) => ({ level: t.level, task: t.id, brain: b.id, cell: t.cells[b.id] })));

/** Counts by status over every cell (the summary line of the document). */
export const tally = () => { const n = Object.fromEntries(STATUSES.map((s) => [s, 0])); for (const c of allCells()) if (c.cell) n[c.cell.status]++; return n; };

const SHORT = Object.freeze({ TRAINED: "TRAINED", HAND_WIRED: "HAND-WIRED", NO_CHAMPION: "NO CHAMPION", TUNED: "TUNED", SCRIPTED: "SCRIPTED", NO_EFFECT: "NO EFFECT", NOT_CONCLUDED: "NOT CONCLUDED", EXISTS_UNREAD: "EXISTS, UNREAD", NOT_BUILT: "-", NOT_APPLICABLE: "n/a" });
const srcText = (s) => (s.log ? `changelog ${s.log}` : s.file) + (s.quote ? ` ("${s.quote}")` : "");

/** The Markdown document: the legend, one table per level (task rows, brain columns, status words), then the cells with their words and sources. ASCII only. */
export function renderMarkdown() {
    const out = [];
    out.push("# Brain capability map", "", "*Generated by `tools/ship/takeCapabilityMap.mjs` from `brain/capabilityMap.mjs`; its gate (`brain/capabilityMap-selfcheck.mjs`) opens every cited file and changelog entry and checks that each quoted number is still there. Do not edit by hand.*", "",
        "Which brain can do what at each simulation level, and what the record says about how well. A cell that no one read for this map says **EXISTS, UNREAD** and names the file; it does not guess a result.", "");
    out.push("## Legend", "");
    out.push("| status | meaning |", "|---|---|");
    const MEAN = { TRAINED: "a trained pilot is shipped or written, with a measured result", HAND_WIRED: "the network is wired to reproduce the hand pilot; no gain is claimed", NO_CHAMPION: "searches ran and nothing qualified; no weights were written", TUNED: "a hand rule whose numbers were fitted", SCRIPTED: "a rule only", NO_EFFECT: "tried, and it did not help", NOT_CONCLUDED: "run, and the registered test could not decide", EXISTS_UNREAD: "the files exist; this map did not read a result", NOT_BUILT: "nothing there", NOT_APPLICABLE: "does not apply" };
    for (const s of STATUSES) out.push(`| ${SHORT[s]} | ${MEAN[s]} |`);
    out.push("", "Brains: " + BRAINS.map((b) => `**${b.name}**`).join(", ") + ". An 'amoeba brain' does not exist in the tree.", "");
    const t = tally(), total = allCells().length;
    out.push(`${ALL_TASKS.length} tasks x ${BRAINS.length} brains = ${total} cells: ` + STATUSES.filter((s) => t[s]).map((s) => `${t[s]} ${SHORT[s]}`).join(", ") + ".", "");
    for (const lv of LEVELS) {
        out.push(`## ${lv.name}`, "", "| task | shoots | " + BRAINS.map((b) => b.name).join(" | ") + " |", "|---|---|" + BRAINS.map(() => "---|").join(""));
        for (const task of lv.tasks) out.push(`| ${task.name} | ${task.shoots ? "yes" : "no"} | ` + BRAINS.map((b) => SHORT[task.cells[b.id].status]).join(" | ") + " |");
        out.push("");
        for (const task of lv.tasks) {
            out.push(`### ${task.name}`, "");
            for (const b of BRAINS) { const c = task.cells[b.id]; if (c.status === "NOT_BUILT" && c.text === "nothing built") continue; out.push(`- **${b.name}: ${SHORT[c.status]}.** ${c.text}.` + (c.src && c.src.length ? " Sources: " + c.src.map(srcText).join("; ") + "." : "")); }
            out.push("");
        }
    }
    out.push("## What the map says in one paragraph", "", "Every shipped learned pilot is the fruit fly's circuit or the GPU Brain's MLP wired onto a hand controller and trained as a residual; where a gain is measured it is largest in recoveries, gusts and hard starts, small on the easy ones, and (for the fish circuits and the language models) not shown to come from the biology or the language. The hand rules and fitted numbers are the strongest components wherever they were compared head to head (the sub's survey advisor, the Endless-Sky tactics, the sub tactician). Weapons are used by: the sub tactician (torpedoes), the jet fighters and the 6-DOF space pilot (guns), the fleet tactics (eight fitted numbers) and the gunnery MLPs. No brain holds a seat in the sub duel, the space needs idea is unbuilt, and the jet leagues have no champion.", "");
    return out.join("\n");
}

/**
 * The problems in a map, as a list of strings (empty = sound). `levels` is the data; `read` is { file(path) -> text | null, log(version) -> the changelog entry's text | null } (the gate hands in the real ones; a fixture hands in strings).
 * Checks: every task has exactly the five brains' cells; each status is in STATUSES; a cell that is not NOT_BUILT or NOT_APPLICABLE has words and at least one source; a result-bearing status has at least one source with a QUOTE;
 * every source file / changelog entry exists and every quote appears in it; ids are unique; `shoots` is a boolean.
 */
export function validate(levels = LEVELS, read) {
    const bad = [], seen = new Set(), ids = BRAINS.map((b) => b.id);
    for (const lv of levels) for (const t of lv.tasks) {
        if (seen.has(t.id)) bad.push(`task ${t.id} is listed twice`); seen.add(t.id);
        if (typeof t.shoots !== "boolean") bad.push(`task ${t.id}: shoots must be true or false`);
        const have = Object.keys(t.cells || {});
        for (const id of ids) if (!t.cells || !t.cells[id]) bad.push(`task ${t.id}: no cell for ${id}`);
        for (const id of have) if (!ids.includes(id)) bad.push(`task ${t.id}: a cell for an unknown brain ${id}`);
        for (const id of ids) {
            const c = t.cells && t.cells[id]; if (!c) continue; const where = `${t.id}/${id}`;
            if (!STATUSES.includes(c.status)) { bad.push(`${where}: status ${JSON.stringify(c.status)} is not in the vocabulary`); continue; }
            if (typeof c.text !== "string" || !c.text.trim()) bad.push(`${where}: no words`);
            const src = Array.isArray(c.src) ? c.src : [];
            if (NEEDS_SOURCE.includes(c.status) && !src.length) bad.push(`${where}: ${c.status} with no source`);
            if (NEEDS_QUOTE.includes(c.status) && !src.some((x) => typeof x.quote === "string" && x.quote)) bad.push(`${where}: ${c.status} with no quoted source (a result must be a quote that can be found)`);
            if (c.status === "NOT_BUILT" && src.length) bad.push(`${where}: NOT_BUILT must not cite a source`);   // NOT_APPLICABLE may cite the record that says why, and it is checked like any other
            for (const x of src) {
                const text = x.log ? read.log(x.log) : x.file ? read.file(x.file) : null, label = x.log ? `changelog ${x.log}` : x.file;
                if (!x.log && !x.file) { bad.push(`${where}: a source with neither file nor log`); continue; }
                if (text === null || text === undefined) { bad.push(`${where}: ${label} does not exist`); continue; }
                if (x.quote !== undefined && !String(text).includes(x.quote)) bad.push(`${where}: ${JSON.stringify(x.quote)} is not in ${label}`);
            }
        }
    }
    return bad;
}

export function reportLines() {
    const t = tally();
    return [`[capabilityMap] ${ALL_TASKS.length} tasks x ${BRAINS.length} brains = ${allCells().length} cells: ` + STATUSES.filter((s) => t[s]).map((s) => `${t[s]} ${s}`).join(", ")];
}

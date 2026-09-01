// FILE: engine/frameDirtyCensus.mjs -- v4183
//
// The census engine/frameDirty.js has been waiting for since v4174.
//
// That round shipped the dirty flag DISABLED, with four probes and an honest note that four is not a census
// of a thirty-thousand-line main.js. This is the census: it EXTRACTS every per-frame ticker from the loop
// mechanically, holds a hand-written verdict for each, and reports what is still unexamined. The extraction
// is what makes it a ratchet -- add a new ticker to the loop and it appears here as UNEXAMINED, and the gate
// goes red until somebody decides what it is.
//
// *** THE QUESTION IS "CAN THIS MOVE PIXELS WITHOUT THE CAMERA MOVING", NOT "IS THIS EXPENSIVE". *** Those
// are different questions and main.js's own comments answer the second one. Seventeen of the sixty tickers
// carry a nearby comment saying "cheap" or "no-op when idle"; NONE of that is evidence for this census.
// dayNightCycle advances the sun by a fraction of a degree each frame -- microseconds of work, and it changes
// the picture, so it is an ANIMATOR. A tick can be free and still animate; a tick can be costly and change
// nothing visible. Reading the cost comments as verdicts would have produced a confident wrong census, which
// is worse than an honest partial one.
//
// *** SO MOST ENTRIES ARE HONESTLY MARKED UNEXAMINED, AND THAT IS THE POINT RATHER THAN A SHORTCOMING. ***
// Deciding whether, say, wadVisualPolish can move a pixel on its own needs its source read or its behaviour
// watched. What this file changes is that the question is now ASKED for all sixty, by name, with the answers
// that exist written down and the ones that do not visibly absent -- instead of four probes and a hope.
"use strict";

/** What a ticker can do to the picture. */
export const ANIMATES = "animates";        // can change what is on screen with no input at all
export const REACTIVE = "reactive";        // changes only in response to input or another system's change
export const INERT = "inert";              // cannot change the picture by itself (bookkeeping, telemetry, audio)
export const UNEXAMINED = "unexamined";    // nobody has decided yet -- the honest default

/**
 * The verdicts. A ticker missing from here is UNEXAMINED by omission, which the gate reports.
 * Every non-unexamined entry carries a REASON, because a verdict without one is unreviewable.
 */
export const VERDICTS = Object.freeze({
    // --- ANIMATES: these change the picture on their own clock, so the flag must know about them ---
    dayNightCycle:   { verdict: ANIMATES, why: "advances the hour every frame; the sun angle and sky tint follow it" },
    weather:         { verdict: ANIMATES, why: "drives precipitation and wind state over time" },
    weatherSystem:   { verdict: ANIMATES, why: "owns sunDir and horizonColor, which main.js copies to the renderer each frame" },
    cloudLayer:      { verdict: ANIMATES, why: "clouds drift on their own" },
    sunFlare:        { verdict: ANIMATES, why: "flare geometry follows the sun, which moves with the hour" },
    waterRenderer:   { verdict: ANIMATES, why: "the surface shader is driven by uTime; it is never still when drawn" },
    gpuParticles:    { verdict: ANIMATES, why: "transform-feedback integration advances every live particle" },
    particles:       { verdict: ANIMATES, why: "CPU particle integration" },
    lavaEmbers:      { verdict: ANIMATES, why: "emits and advects embers on a timer" },
    memoryShimmer:   { verdict: ANIMATES, why: "a shimmer is a time-driven effect by definition" },
    underwaterFx:    { verdict: ANIMATES, why: "caustic shimmer and depth tint animate while submerged" },
    voxelDebris:     { verdict: ANIMATES, why: "debris falls under gravity once spawned" },
    projectileManager:{ verdict: ANIMATES, why: "projectiles travel between frames" },
    missileSystem:   { verdict: ANIMATES, why: "a missile in flight moves with no input" },
    throwCinematic:  { verdict: ANIMATES, why: "drives a chase camera along a scripted path" },
    ejectSequence:   { verdict: ANIMATES, why: "a scripted sequence advances on its own clock" },
    ragdollIntegration:{ verdict: ANIMATES, why: "ragdolls settle under physics after the impulse that started them" },
    civilianRagdolls:{ verdict: ANIMATES, why: "same, for the civilian pool" },
    aiManager:       { verdict: ANIMATES, why: "agents move themselves; nothing external has to touch them" },
    botManager:      { verdict: ANIMATES, why: "bots path and move on their own" },
    centipedeManager:{ verdict: ANIMATES, why: "a centipede crawls without being asked" },
    birthSpawner:    { verdict: ANIMATES, why: "spawns on a timer, and a spawn is a visible change" },
    kaijuMode:       { verdict: ANIMATES, why: "countdown and stomp damage advance on a timer" },
    kaijuSandbox:    { verdict: ANIMATES, why: "a city being destroyed keeps changing after the input that started it" },
    damageNumbers:   { verdict: ANIMATES, why: "floating numbers rise and fade after the hit that made them" },
    hitReactionSystem:{ verdict: ANIMATES, why: "a reaction plays out over several frames" },
    csRoundManager:  { verdict: ANIMATES, why: "round and defuse timers run down without input" },
    fpsAutopilot:    { verdict: ANIMATES, why: "it exists to move the camera when the player does not" },
    torchLighter:    { verdict: ANIMATES, why: "torch flicker is time-driven" },
    remotePlayers:   { verdict: ANIMATES, why: "another player's avatar moves with no local input at all -- the case a local-only census would miss" },

    // --- ANIMATES, and each of these now has a probe (v4184) ---
    // --- THE HUD AND PANEL CLUSTER, SETTLED AS ONE DECISION AT v4184 ---
    //
    // *** THESE WRITE DOM, NOT PIXELS ON THE GL CANVAS, AND THAT IS WHAT THE DIRTY FLAG GUARDS. *** Twelve of
    // the twenty-five unexamined entries were HUD and panel tickers, and reading two of them settled all
    // twelve: hud.update() sets textContent on DOM elements, cameraPanel.update() refreshes DOM thumbnails.
    // The flag skips the GL DRAW; a DOM overlay is a separate surface that a skipped draw does not touch.
    //
    // THEY ARE INERT WITH RESPECT TO THIS FLAG, AND THAT IS ONLY TRUE BECAUSE THEY RUN OUTSIDE THE GUARD.
    // hud.update was INSIDE it until v4184 -- my own mistake at v4174 -- which froze a live diagnostic
    // whenever the 3D scene happened to be still. The verdict and the guard placement are one fact, not two.
    hud:              { verdict: INERT, why: "writes textContent into DOM readouts; draws nothing on the GL canvas, and now runs outside the draw guard" },
    cameraPanel:      { verdict: INERT, why: "refreshes DOM thumbnails on its own 250ms and 700ms timers, outside the guard" },
    civilizationPanel:{ verdict: INERT, why: "a DOM panel, ticked before the guard" },
    kaijuPanel:       { verdict: INERT, why: "a DOM panel, ticked before the guard" },
    kaijuStaminaHud:  { verdict: INERT, why: "a DOM readout, ticked after the guard in postRenderTicks" },
    perfDashboard:    { verdict: INERT, why: "a DOM dashboard, ticked after the guard" },
    playerEnergyHUD:  { verdict: INERT, why: "a DOM readout, ticked after the guard" },
    csHud:            { verdict: INERT, why: "a DOM readout" },
    ogreHUD:          { verdict: INERT, why: "a DOM readout" },
    ogreBuyPanel:     { verdict: INERT, why: "a DOM panel" },
    mechCockpit:      { verdict: INERT, why: "a DOM cockpit overlay" },

    // --- THE LAST FOURTEEN, EXAMINED AT v4231 -- EACH FROM ITS OWN SOURCE, NOT FROM ITS NAME ---
    //
    // *** ELEVEN OF THE FOURTEEN TURNED OUT TO BE ANIMATORS, WHICH MADE THE UNGUARDED NUMBER WORSE BEFORE IT
    // MADE IT BETTER, AND THAT IS WHAT AN HONEST CENSUS DOES. *** A census that only ever improves its own
    // figures is not measuring anything. Each verdict below names the LINE of behaviour it rests on, so a
    // reader can check the judgement instead of trusting it.
    atmosphereSystem:{ verdict: ANIMATES, why: "clouds drift by wind every frame -- _instData[base+0] += wx -- and the layer eases its colours toward the weather target; it is never still" },
    tintFX:          { verdict: ANIMATES, why: "a 'pulse' tint advances b.t += dt and recomputes mix from a sine, so an entity's colour oscillates with no input at all" },
    visionModes:     { verdict: ANIMATES, why: "battery drains and regenerates every frame, and at zero it forces the mode back to normal and calls _apply(), changing the overlay unprompted" },
    wadVisualPolish: { verdict: ANIMATES, why: "pickups bob on sin(t) and yaw, the exit portal turns, teleporters spin -- pure time-driven motion, and the entry whose name most invites a guess" },
    spaceSuit:       { verdict: ANIMATES, why: "calls particles.spawn() on its own clock and applies continuous asphyxiation damage once O2 reaches zero" },
    swimMode:        { verdict: ANIMATES, why: "_applySwimPhysics(dt) moves the camera while submerged and _emitBubbles(dt) trails bubbles; both run with no input" },
    bossPhaseManager:{ verdict: ANIMATES, why: "phase transitions call botManager.spawn() for minions, and a spawn is a visible change -- the same reasoning as birthSpawner" },
    csBotManager:    { verdict: ANIMATES, why: "runs bot AI over positions each tick; the bots move themselves, as botManager's already-settled verdict says" },
    weaponSystem:    { verdict: ANIMATES, why: "queued BURST shots fire on a timer -- while (_burstQueue[0].fireT <= now) -- so the first round is input and the second and third are the clock" },
    fpsShooter:      { verdict: ANIMATES, why: "gravity zones and fall damage move the player, hazards deal damage over time, and a reload completes on a timestamp" },
    ogreScenario:    { verdict: ANIMATES, why: "_updateDebris(dt) tumbles blown-off parts, defender planes fly and strafe, and subs surface to fire -- all on their own clocks" },

    // --- ...and three that are INERT with respect to THIS flag, for the HUD cluster's reason ---
    //
    // The flag guards the GL DRAW. A surface that is not the GL canvas is not what a skipped draw skips --
    // BUT ONLY IF THE TICKER RUNS OUTSIDE THE GUARD, which is the half v4174 got wrong with hud.update(). All
    // three placements were checked against main.js rather than assumed: playerEnergy at 29203 and
    // ogreLauncher at 29456 run BEFORE the guard at 30071; wadMap at 30913 runs after it, in postRenderTicks.
    playerEnergy:    { verdict: INERT, why: "recharges a number whose only reader is mechCockpit, itself a DOM overlay and already INERT; its shake handler fires on a denied spend, which is input. Ticks before the guard" },
    ogreLauncher:    { verdict: INERT, why: "sets style.display and textContent on launcher chrome and nothing else; a DOM panel like ogreHUD beside it. Ticks before the guard" },
    wadMap:          { verdict: INERT, why: "draws the minimap into ITS OWN 2D canvas -- c.getContext('2d'), appended to document.body -- which is a different surface from the GL canvas the flag guards. Ticks after the guard" },

    // --- INERT: cannot change the picture by itself ---
    systemPerf:      { verdict: INERT, why: "measures frame time and heap; it reads, it does not draw" },
    audio:           { verdict: INERT, why: "sound has no pixels" },
    chunkStreamer:   { verdict: REACTIVE, why: "loads chunks around the camera, so it only acts when the camera has moved -- already covered by the camera probe" },
    camera:          { verdict: REACTIVE, why: "the camera probe compares the pose against the LAST DRAWN one, so its movement is already the flag's business" },
    editor:          { verdict: REACTIVE, why: "acts on input, and input marks the flag dirty" },
});

/**
 * Pull every per-frame ticker out of the loop, mechanically. This is the half that cannot go stale: it reads
 * the file rather than a list somebody maintained.
 *
 * @param source main.js's text
 * @returns sorted array of identifier names
 */
export function tickersIn(source) {
    const lines = String(source).split("\n");
    const start = lines.findIndex((l) => /^function loop\(/.test(l));
    if (start < 0) return [];
    // the loop's end: the first line at column 0 that closes it
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) { if (lines[i] === "}") { end = i; break; } }
    const found = new Set();
    const re = /^\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\.(?:tick|update|step|animate)\(/;
    for (let i = start; i < end; i++) {
        const m = lines[i].match(re);
        if (m) found.add(m[1]);
    }
    return [...found].sort();
}

/**
 * The census: every ticker, its verdict, and what is still unexamined.
 * @param source main.js's text
 * @param registered names the running frameDirty has sources for (from FrameDirty.sources())
 */
export function census(source, registered = []) {
    const tickers = tickersIn(source);
    const reg = new Set(registered);
    const rows = tickers.map((name) => {
        const v = VERDICTS[name] || { verdict: UNEXAMINED, why: "nobody has decided what this can do to the picture" };
        return { name, verdict: v.verdict, why: v.why, registered: reg.has(name) };
    });
    const by = (k) => rows.filter((r) => r.verdict === k);
    return {
        total: rows.length,
        rows,
        animates: by(ANIMATES).length,
        reactive: by(REACTIVE).length,
        inert: by(INERT).length,
        unexamined: by(UNEXAMINED).length,
        // *** THE NUMBER THAT DECIDES WHETHER THE FLAG MAY BE ENABLED BY DEFAULT. *** An ANIMATES ticker with
        // no registered source is a system that can change the picture while the flag believes the scene is
        // still -- which is a frozen screen, the failure the whole module is arranged against.
        unguarded: by(ANIMATES).filter((r) => !r.registered).map((r) => r.name),
    };
}

/** A human-readable report, for a caller running this from a console. */
export function report(source, registered = []) {
    const c = census(source, registered);
    const lines = [`frameDirty census: ${c.total} per-frame tickers`,
                   `  animates ${c.animates} · reactive ${c.reactive} · inert ${c.inert} · UNEXAMINED ${c.unexamined}`,
                   `  unguarded animators (no registered source): ${c.unguarded.length}`];
    if (c.unguarded.length) lines.push("    " + c.unguarded.join(", "));
    const un = c.rows.filter((r) => r.verdict === UNEXAMINED).map((r) => r.name);
    if (un.length) lines.push("  unexamined: " + un.join(", "));
    return lines.join("\n");
}

/**
 * *** THE RATCHET. *** UNEXAMINED may only ever go DOWN. A new ticker added to the loop lands here
 * unexamined, pushes the count above the baseline, and the gate goes red until somebody writes a verdict --
 * which is the whole mechanism by which this census stays a census instead of becoming a stale list.
 */
export const UNEXAMINED_BASELINE = 0;    // v4231: 14 -> 0. Every ticker in the loop now carries a verdict.

/**
 * Every ticker declared as covered by some probe, read out of main.js's own `covers:` lists.
 *
 * *** THIS EXISTS SO THE RATCHET CAN SEE COVERAGE, WHICH IT COULD NOT WHEN IT ONLY COUNTED PROBES. *** The
 * first version of the gate checked that at least five probes declared a covers list. Removing one probe's
 * declaration entirely left five others and the gate stayed green -- a system silently became unguarded and
 * nothing said so, which is the precise failure a census is supposed to prevent. Reading the lists lets
 * UNGUARDED_BASELINE ratchet the way UNEXAMINED_BASELINE does.
 *
 * Source-derived rather than taken from a live FrameDirty, because the gate has no browser and the running
 * flag has no source.
 */
export function coveredIn(source) {
    const out = new Set();
    for (const m of String(source).matchAll(/\{\s*covers:\s*\[([^\]]*)\]/g)) {
        for (const q of m[1].matchAll(/"([^"]+)"/g)) out.add(q[1]);
    }
    return [...out].sort();
}

/**
 * *** THE SECOND RATCHET. *** An ANIMATES ticker with no probe covering it can change the picture while the
 * flag believes the scene is still -- a frozen screen. This number may only go DOWN, and it is what stands
 * between the flag and being enabled by default.
 */
export const UNGUARDED_BASELINE = 1;   // v4184: 8 -> 1

/**
 * *** THE ONE ANIMATOR STILL UNGUARDED, AND WHY IT IS STILL UNGUARDED. ***
 *
 * fpsAutopilot exists to move the camera when the player does not, so it is unambiguously an animator -- and
 * simulation/FPSAutopilot.js exposes NO state that says whether it is currently driving. Every other probe
 * this round reads something the module already had: EjectSequence.isActive(), KaijuMode.isActive(),
 * csRoundManager.isActive() (already called twice in the loop), HitReactionSystem's Map of in-flight entries.
 *
 * Inventing an isActive() on FPSAutopilot to close the number would be writing the flag a probe rather than
 * finding one, and a probe that reports what a new field was set to says nothing about what the module does.
 * So it stays on the list, by name, and the baseline stays at one rather than zero. A baseline of zero
 * reached by adding a field to the thing being measured is not the same as a baseline of zero.
 */
export const STILL_UNGUARDED_REASON = Object.freeze({
    fpsAutopilot: "no existing state says whether it is currently driving the camera; adding one to close the number would be writing the probe rather than finding it",
});

// demos_code/credits.js — sample addon demonstrating the blessed
// engine-context API. Uses ONLY tier-1 verbs from ctx (no raw
// subsystem access). Fires a KPop toast sequence + sky particle
// fireworks + a final speech line, then quietly idles.
//
// Pattern reference for new addon authors:
//   * ctx.kpop.{success,info}    — toast notifications
//   * ctx.spawnParticle(...)     — sky bursts
//   * ctx.playSfx(name, x, y, z) — spatial audio
//   * ctx.palChat.generate(ctx)  — Ollama dialogue (optional)
//   * ctx.randRange / ctx.rand   — convenience randoms
//   * ctx.getSurfaceY / lookAt   — read terrain + nudge camera

// The credits roll — one toast per line, spaced over a few seconds.
// Hard-coded names; in a real app you'd pull these from a manifest.
const CREDITS = [
    { title: "VoxelEngine",      message: "credits demo — built on the blessed addon API" },
    { title: "Engine",           message: "Geek" },
    { title: "Procedural OGREs", message: "based on Steve Jackson's design" },
    { title: "Voice tech",       message: "BurntToast + System.Speech + Ollama" },
    { title: "Music",            message: "no music — write your own demo" },
    { title: "Thanks",           message: "for trying the demos_code/ addon system" },
];

// Random vivid color (HSV → RGB approximation, just bright enough)
function pickColor(ctx) {
    const hue = ctx.rand();
    const sat = 0.7 + ctx.rand() * 0.3;
    const lit = 0.55 + ctx.rand() * 0.25;
    // Quick HSL→RGB
    const c = (1 - Math.abs(2 * lit - 1)) * sat;
    const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
    const m = lit - c / 2;
    let r = 0, g = 0, b = 0;
    const h6 = hue * 6;
    if      (h6 < 1) { r = c; g = x; b = 0; }
    else if (h6 < 2) { r = x; g = c; b = 0; }
    else if (h6 < 3) { r = 0; g = c; b = x; }
    else if (h6 < 4) { r = 0; g = x; b = c; }
    else if (h6 < 5) { r = x; g = 0; b = c; }
    else             { r = c; g = 0; b = x; }
    return { r: r + m, g: g + m, b: b + m };
}

// One firework burst at a random sky position
function spawnFirework(ctx) {
    const x = ctx.randRange(-40, 40);
    const z = ctx.randRange(-40, 40);
    const y = (ctx.getSurfaceY(x, z) ?? 0) + ctx.randRange(18, 28);
    const col = pickColor(ctx);
    const particleCount = 32;
    for (let i = 0; i < particleCount; i++) {
        const angle = (i / particleCount) * Math.PI * 2 + ctx.rand() * 0.2;
        const pitch = ctx.randRange(-Math.PI / 4, Math.PI / 4);
        const speed = ctx.randRange(3, 7);
        ctx.spawnParticle({
            x, y, z,
            vx: Math.cos(angle) * Math.cos(pitch) * speed,
            vy: Math.sin(pitch) * speed + ctx.randRange(1, 3),
            vz: Math.sin(angle) * Math.cos(pitch) * speed,
            ttl: 1.4, size: 0.5,
            r: col.r, g: col.g, b: col.b, a: 1.0,
            gravity: 5,
        });
    }
    ctx.playSfx("hit", x, y, z);
}

export default {
    id:    "credits",
    label: "CREDITS",
    hint:  "demo of the tier-1 (blessed) engine-context API",
    controls: [
        "(no controls — just watches)",
    ],

    start(ctx) {
        // Opening toast
        ctx.kpop.success("Roll credits", "demos_code/credits.js — tier-1 demo");

        // Internal state for the per-frame tick
        this._t = 0;
        this._nextCreditAt = 1.5;
        this._creditIdx = 0;
        this._nextFireworkAt = 0.5;

        // Nudge the camera to look up at where the fireworks will be
        ctx.lookAt(0, (ctx.getSurfaceY(0, 0) ?? 0) + 22, 0);
    },

    tick(ctx, dt) {
        this._t += dt;

        // Sky fireworks burst every ~0.6s
        if (this._t >= this._nextFireworkAt) {
            spawnFirework(ctx);
            this._nextFireworkAt = this._t + ctx.randRange(0.35, 0.75);
        }

        // Next credit line every ~3s
        if (this._creditIdx < CREDITS.length && this._t >= this._nextCreditAt) {
            const { title, message } = CREDITS[this._creditIdx++];
            ctx.kpop.info(title, message);
            this._nextCreditAt = this._t + 3.0;
        }

        // After all credits are out, give PalChat one prompt about it
        // (if Ollama is reachable). Fires once.
        if (!this._didPalChat
            && this._creditIdx >= CREDITS.length
            && this._t >= this._nextCreditAt
            && ctx.palChat?.isEnabled?.()) {
            this._didPalChat = true;
            ctx.palChat.generate("The credits just finished rolling. React briefly.");
        }
    },

    stop(ctx) {
        // Nothing to clean up — all particles auto-expire by TTL.
        // If we'd spawned mesh entities via ctx.spawnMesh, we'd
        // call ctx.despawnEntity(id) for each here.
        ctx.kpop.info("Credits", "demo stopped");
    },
};

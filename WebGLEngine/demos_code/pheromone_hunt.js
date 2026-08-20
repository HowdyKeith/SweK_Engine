// demos_code/pheromone_hunt.js — pheromone trail tracking AI.
//
// Second AI translation from the demo collection. Takes the
// agent-on-pheromone-field math from slime_mold.js and ant_colony.js
// and turns it into INVESTIGATIVE enemy AI: the player deposits an
// invisible "scent" pheromone wherever they walk, the scent decays
// over time, and hunter aliens sample the local gradient to follow it.
//
// Gameplay character: enemies do not see the player directly. They
// FIND the player by following recent traces. Backtracking confuses
// them (the trail self-intersects). Standing still erases your local
// trace. Running creates a strong trail.
//
// This is the "novel AI mechanic" wish from the previous round — not
// see-and-chase, but sniff-and-investigate.
//
// VBA source: ComputeSlimeMoldSystem.cls + ComputeAntColonySystem.cls
// adapted to use the world XZ plane as the pheromone field.

const GRID_SIZE       = 96;        // 96×96 cells of pheromone over world
const WORLD_SPAN      = 240;       // grid covers this many world units centered on origin
const CELL_SIZE       = WORLD_SPAN / GRID_SIZE;   // 2.5u per cell

const NUM_HUNTERS     = 5;
const HUNTER_SPEED    = 5.5;
const HUNTER_TURN     = 0.55;
const HUNTER_SENSE_DIST = 4;        // cells ahead to sample (×CELL_SIZE world units)
const HUNTER_SENSE_ANG  = 0.7;      // radians left/right of heading

const PLAYER_DEPOSIT_AMT = 0.6;     // pheromone added per frame at player cell
const DEPOSIT_PROXIMITY  = 1.2;     // cells of spread around player
const DECAY_PER_SECOND   = 0.40;    // 40% scent loss per second
const DIFFUSION_PER_SEC  = 0.12;    // mild horizontal spread

const VIZ_PX            = 240;     // overlay size

let hunters = [];                  // [{id, x, z, heading}]
let scent = null;                  // Float32Array(GRID_SIZE × GRID_SIZE)
let scentNext = null;              // ping-pong buffer for diffusion
let lastPlayer = { x: 0, z: 0 };
let elapsed = 0;
let overlay = null;
let vizCanvas = null;
let vizCtx = null;
let label = null;

function worldToGrid(x, z) {
    const gx = ((x + WORLD_SPAN/2) / CELL_SIZE) | 0;
    const gz = ((z + WORLD_SPAN/2) / CELL_SIZE) | 0;
    return [gx, gz];
}
function gridToWorld(gx, gz) {
    return [
        (gx + 0.5) * CELL_SIZE - WORLD_SPAN/2,
        (gz + 0.5) * CELL_SIZE - WORLD_SPAN/2,
    ];
}
function inBounds(gx, gz) {
    return gx >= 0 && gx < GRID_SIZE && gz >= 0 && gz < GRID_SIZE;
}
function readScent(gx, gz) {
    if (!inBounds(gx, gz)) return 0;
    return scent[gz * GRID_SIZE + gx];
}

function deposit(x, z, amt) {
    const [gx, gz] = worldToGrid(x, z);
    const r = Math.ceil(DEPOSIT_PROXIMITY);
    for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
            const d = Math.hypot(dx, dz);
            if (d > DEPOSIT_PROXIMITY) continue;
            const ggx = gx + dx, ggz = gz + dz;
            if (!inBounds(ggx, ggz)) continue;
            const fall = 1 - d / DEPOSIT_PROXIMITY;
            const i = ggz * GRID_SIZE + ggx;
            scent[i] = Math.min(1.0, scent[i] + amt * fall);
        }
    }
}

function decayAndDiffuse(dt) {
    const decay = Math.exp(-DECAY_PER_SECOND * dt);
    const diff = DIFFUSION_PER_SEC * dt;
    // Decay + 5-tap diffusion in one pass. Read from scent, write to
    // scentNext, then swap.
    for (let z = 0; z < GRID_SIZE; z++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const i = z * GRID_SIZE + x;
            const c = scent[i];
            let neighborMean = 0;
            let nc = 0;
            // 4 cardinal neighbors
            if (x > 0)              { neighborMean += scent[i - 1]; nc++; }
            if (x < GRID_SIZE - 1)  { neighborMean += scent[i + 1]; nc++; }
            if (z > 0)              { neighborMean += scent[i - GRID_SIZE]; nc++; }
            if (z < GRID_SIZE - 1)  { neighborMean += scent[i + GRID_SIZE]; nc++; }
            if (nc > 0) neighborMean /= nc;
            const mixed = c * (1 - diff) + neighborMean * diff;
            scentNext[i] = mixed * decay;
        }
    }
    const tmp = scent; scent = scentNext; scentNext = tmp;
}

function senseAhead(hx, hz, heading, distCells) {
    // Sample at distance ahead, get the cell value (bilinear-ish)
    const dx = Math.sin(heading) * distCells * CELL_SIZE;
    const dz = Math.cos(heading) * distCells * CELL_SIZE;
    const [gx, gz] = worldToGrid(hx + dx, hz + dz);
    return readScent(gx, gz);
}

function renderViz() {
    if (!vizCtx) return;
    // Background: black
    vizCtx.fillStyle = "#020308";
    vizCtx.fillRect(0, 0, VIZ_PX, VIZ_PX);
    // Render scent grid (downsample to VIZ_PX×VIZ_PX)
    const imgData = vizCtx.createImageData(VIZ_PX, VIZ_PX);
    const px = imgData.data;
    const scale = GRID_SIZE / VIZ_PX;
    for (let y = 0; y < VIZ_PX; y++) {
        for (let x = 0; x < VIZ_PX; x++) {
            const gx = (x * scale) | 0;
            const gz = (y * scale) | 0;
            const v = readScent(gx, gz);
            const i = (y * VIZ_PX + x) * 4;
            // Magenta/yellow ramp for visibility
            px[i + 0] = Math.min(255, v * 320);
            px[i + 1] = Math.min(255, v * 200);
            px[i + 2] = Math.min(255, v * 80);
            px[i + 3] = 255;
        }
    }
    vizCtx.putImageData(imgData, 0, 0);

    // Overlay: hunter positions (cyan dots)
    vizCtx.fillStyle = "#0ff";
    for (const h of hunters) {
        const [gx, gz] = worldToGrid(h.x, h.z);
        const px2 = (gx / GRID_SIZE) * VIZ_PX;
        const py2 = (gz / GRID_SIZE) * VIZ_PX;
        vizCtx.beginPath();
        vizCtx.arc(px2, py2, 3, 0, Math.PI * 2);
        vizCtx.fill();
    }
    // Player position (yellow dot, larger)
    vizCtx.fillStyle = "#ff0";
    const [pgx, pgz] = worldToGrid(lastPlayer.x, lastPlayer.z);
    const ppx = (pgx / GRID_SIZE) * VIZ_PX;
    const ppy = (pgz / GRID_SIZE) * VIZ_PX;
    vizCtx.beginPath();
    vizCtx.arc(ppx, ppy, 5, 0, Math.PI * 2);
    vizCtx.fill();
}

export default {
    id:    "pheromone_hunt",
    label: "PHEROMONE HUNT (TRACKING AI)",
    hint:  "Hunter aliens follow your scent trail — no line-of-sight, only smell",
    controls: [
        `Auto — ${NUM_HUNTERS} hunters track via ${GRID_SIZE}² scent grid`,
        "Move to lay trail, stop to fade. Hunters investigate the gradient.",
        "Overlay shows scent intensity + hunter (cyan) / player (yellow) positions",
    ],

    start(ctx) {
        scent     = new Float32Array(GRID_SIZE * GRID_SIZE);
        scentNext = new Float32Array(GRID_SIZE * GRID_SIZE);

        // Spawn hunters at edges of the grid
        const camx = ctx.camera?.position?.x ?? 0;
        const camz = ctx.camera?.position?.z ?? 0;
        hunters = [];
        for (let i = 0; i < NUM_HUNTERS; i++) {
            const angle = (i / NUM_HUNTERS) * Math.PI * 2 + 0.3;
            const dist  = 55 + ctx.rand() * 25;
            const x = camx + Math.cos(angle) * dist;
            const z = camz + Math.sin(angle) * dist;
            const y = (ctx.getSurfaceY?.(x, z) ?? 30) + 2.0;
            const id = ctx.spawnMesh("kaiju_hell", x, y, z, 1.6);
            if (id == null) continue;
            hunters.push({
                id, x, y, z,
                heading: Math.atan2(camx - x, camz - z),  // initial face-player
            });
        }
        lastPlayer = { x: camx, z: camz };
        elapsed = 0;

        // Overlay visualization (2D canvas)
        overlay = document.createElement("div");
        overlay.style.cssText = [
            "position:fixed",
            "right:20px",
            "top:140px",
            "padding:8px",
            "background:rgba(8,4,16,0.85)",
            "border:1px solid #804",
            "border-radius:4px",
            "box-shadow:0 0 14px rgba(255,80,180,0.25)",
            "z-index:1000",
            "pointer-events:none",
        ].join(";");
        const t = document.createElement("div");
        t.style.cssText = "color:#f9d;font:11px monospace;margin-bottom:4px;letter-spacing:1px";
        t.textContent = "🧠 SCENT TRACKING";
        overlay.appendChild(t);
        vizCanvas = document.createElement("canvas");
        vizCanvas.width = VIZ_PX;
        vizCanvas.height = VIZ_PX;
        vizCanvas.style.cssText = "display:block;border:1px solid #422;background:#000";
        overlay.appendChild(vizCanvas);
        label = document.createElement("div");
        label.style.cssText = "color:#fb8;font:10px monospace;margin-top:4px;line-height:1.4";
        label.textContent = "yellow = player · cyan = hunters · pink = scent";
        overlay.appendChild(label);
        document.body.appendChild(overlay);
        vizCtx = vizCanvas.getContext("2d");

        ctx.kpop?.info?.("Pheromone Hunt", `${hunters.length} hunters tracking scent`);
        console.log("[pheromone_hunt] started");
    },

    tick(ctx, dt) {
        if (!scent) return;
        if (dt > 0.1) dt = 0.1;
        elapsed += dt;

        // Player deposit at camera position
        const px = ctx.camera?.position?.x ?? 0;
        const pz = ctx.camera?.position?.z ?? 0;
        // Distance moved since last frame — depositing only when moving
        // makes "stay still to break the trail" a real tactic
        const dx = px - lastPlayer.x, dz = pz - lastPlayer.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.05) {
            // Scale deposit by motion — running leaves more scent
            const amt = Math.min(1, dist * 4) * PLAYER_DEPOSIT_AMT;
            deposit(px, pz, amt);
        }
        // Also deposit a steady baseline so completely still players
        // can still be sniffed if a hunter walks over them
        deposit(px, pz, PLAYER_DEPOSIT_AMT * 0.1);
        lastPlayer.x = px; lastPlayer.z = pz;

        decayAndDiffuse(dt);

        // Hunters sample + steer
        for (const h of hunters) {
            // Three-way sense
            const sC = senseAhead(h.x, h.z, h.heading,                     HUNTER_SENSE_DIST);
            const sL = senseAhead(h.x, h.z, h.heading + HUNTER_SENSE_ANG,  HUNTER_SENSE_DIST);
            const sR = senseAhead(h.x, h.z, h.heading - HUNTER_SENSE_ANG,  HUNTER_SENSE_DIST);

            // Decide turn
            if (sC > sL && sC > sR) {
                // straight
            } else if (sC < 0.01 && sL < 0.01 && sR < 0.01) {
                // No scent in any direction — wander randomly
                h.heading += (ctx.rand() - 0.5) * HUNTER_TURN * 1.5;
            } else if (sR > sL) {
                h.heading -= HUNTER_TURN;
            } else if (sL > sR) {
                h.heading += HUNTER_TURN;
            }

            // Move forward
            h.x += Math.sin(h.heading) * HUNTER_SPEED * dt;
            h.z += Math.cos(h.heading) * HUNTER_SPEED * dt;
            h.y = (ctx.getSurfaceY?.(h.x, h.z) ?? 30) + 2.0;

            ctx.router?.exec?.({
                type: "entity:move",
                id:   h.id,
                x: h.x, y: h.y, z: h.z,
                yaw: h.heading,
            });
        }

        // Update visualization (every other frame to keep cheap)
        if ((elapsed * 30 | 0) % 2 === 0) {
            renderViz();
        }
    },

    stop(ctx) {
        for (const h of hunters) ctx.despawnEntity?.(h.id);
        hunters = [];
        scent = null; scentNext = null;
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null; vizCanvas = null; vizCtx = null; label = null;
        console.log("[pheromone_hunt] stopped");
    },
};

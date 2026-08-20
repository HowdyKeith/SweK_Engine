// ui/brainSvg.js
//
// An SVG representation of the GPU Brain in action, for the docked gauge set. The brain solves a flow field -- it tells
// enemies where to move across a grid, steering them toward a goal and away from threat -- so that is what this draws: a
// grid of flow arrows over a bed of threat heat, with the goal marked, plus a few live readouts. When the brain is
// active it animates (the threat blob drifts, the arrows re-aim); when it is idle it dims to a resting field. It mounts
// where the gauges sit, so index.html can swap the gauges out for the live mind while the avatar stays put.
//
// The field maths is deterministic and pure arithmetic; the animation phase uses trig, so this is a visual, gated but not
// in the cross-architecture fingerprint. mountBrainSvg is browser-only (it polls and animates); makeBrainSvg and
// flowField are pure and testable.

const GOAL = [6.5, 1.5];   // the goal cell the brain steers toward

// A solved flow field on an n-by-n grid: at each cell, the flow direction the brain assigns (toward the goal, bent away
// from the threat blob) and the threat heat there. phase drifts the threat blob so the field looks alive.
export function flowField(n, phase = 0) {
    const cells = [];
    const tx = n / 2 + (n / 3) * Math.cos(phase), ty = n / 2 + (n / 3) * Math.sin(phase * 0.8);   // drifting threat centre
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const gx = GOAL[0] - x, gy = GOAL[1] - y, gd = Math.hypot(gx, gy) || 1;   // toward goal
        const dxT = x - tx, dyT = y - ty, td = Math.hypot(dxT, dyT) || 1;         // away from threat
        const threat = 1 / (1 + td * td * 0.5);                                   // heat, in (0,1]
        let fx = gx / gd + (dxT / td) * threat * 1.6, fy = gy / gd + (dyT / td) * threat * 1.6;   // steer to goal, avoid threat
        const m = Math.hypot(fx, fy) || 1; fx /= m; fy /= m;
        cells.push({ x, y, fx, fy, threat });
    }
    return { n, cells, goal: GOAL, threatCentre: [tx, ty] };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// The SVG string for one frame. state = { active, solveMs, samples, gpu }.
export function makeBrainSvg(state = {}, phase = 0, n = 8) {
    const field = flowField(n, state.active ? phase : 0);
    const S = 22, W = n * S, pad = 8, H = W + 34;
    const dim = state.active ? 1 : 0.4;
    let cells = "", arrows = "";
    for (const c of field.cells) {
        const cx = pad + c.x * S + S / 2, cy = pad + c.y * S + S / 2;
        const heat = Math.round(c.threat * 210 * dim);
        cells += '<rect x="' + (pad + c.x * S) + '" y="' + (pad + c.y * S) + '" width="' + (S - 1) + '" height="' + (S - 1) + '" fill="rgb(' + heat + ',' + Math.round(heat * 0.32) + ',20)" opacity="' + (0.18 + c.threat * 0.55) + '"/>';
        const ax = cx + c.fx * 7, ay = cy + c.fy * 7;
        arrows += '<line x1="' + cx.toFixed(1) + '" y1="' + cy.toFixed(1) + '" x2="' + ax.toFixed(1) + '" y2="' + ay.toFixed(1) + '" stroke="#33ccff" stroke-width="1.4" opacity="' + dim + '"/>';
        arrows += '<circle cx="' + ax.toFixed(1) + '" cy="' + ay.toFixed(1) + '" r="1.5" fill="#9fe6c0" opacity="' + dim + '"/>';
    }
    const gx = pad + field.goal[0] * S, gy = pad + field.goal[1] * S;
    const goal = '<circle cx="' + gx.toFixed(1) + '" cy="' + gy.toFixed(1) + '" r="5" fill="none" stroke="#9fe6c0" stroke-width="2"/><circle cx="' + gx.toFixed(1) + '" cy="' + gy.toFixed(1) + '" r="1.8" fill="#9fe6c0"/>';
    const label = state.active ? "GPU BRAIN \u2014 solving" : "GPU BRAIN \u2014 idle";
    const stat = state.active
        ? (state.solveMs != null ? state.solveMs.toFixed(1) + "ms" : "\u2014") + "   " + (state.samples != null ? state.samples + " samples" : "")
        : "no field yet";
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (W + pad * 2) + '" height="' + H + '" viewBox="0 0 ' + (W + pad * 2) + ' ' + H + '" font-family="ui-monospace,monospace">' +
        '<rect width="100%" height="100%" fill="#06140c"/>' +
        cells + arrows + goal +
        '<text x="' + pad + '" y="' + (H - 12) + '" fill="#ffcc66" font-size="9" opacity="' + (0.5 + dim * 0.5) + '">' + esc(label) + '</text>' +
        '<text x="' + (W + pad) + '" y="' + (H - 12) + '" text-anchor="end" fill="#6a8a78" font-size="8">' + esc(stat) + '</text>' +
        '</svg>';
}

// Browser-only: mount into host, poll /ai/brain/health, animate while active. onActive(bool) fires on state change.
export function mountBrainSvg(host, { pollMs = 2000, endpoint = "/ai/brain/health", onActive = null } = {}) {
    let state = { active: false }, phase = 0, raf = 0, alive = true, wasActive = null;
    const paint = () => { if (!alive) return; host.innerHTML = makeBrainSvg(state, phase); if (state.active) { phase += 0.03; raf = requestAnimationFrame(paint); } };
    const poll = async () => {
        try {
            const r = await fetch(endpoint, { cache: "no-store" }); const j = await r.json();
            const live = j && (j.live || j.brains || j.count || j.state === "solving" || j.state === "active");
            state = { active: !!live, solveMs: j && (j.solveMs ?? j.solveMsEwma ?? j.lastSolveMs), samples: j && (j.samples ?? j.experience), gpu: j && j.gpu };
        } catch { state = { active: false }; }
        if (onActive && state.active !== wasActive) { wasActive = state.active; try { onActive(state.active); } catch {} }
        cancelAnimationFrame(raf); paint();
    };
    poll(); const iv = setInterval(poll, pollMs);
    return { stop() { alive = false; clearInterval(iv); cancelAnimationFrame(raf); }, el: host };
}

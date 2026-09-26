// render/framePacer.mjs -- v4743 -- WHEN EACH FRAME IS SHOWN, WHICH IS WHAT DECIDES WHETHER A GENERATED FRAME IS WORTH HAVING.
//
// A generated frame is made BETWEEN two real frames, so it cannot be shown until the second of them is rendered, and it is
// only worth showing if it lands on the display between them in TIME as well as in content. fx/fsr/fsr3Tsl.mjs makes the
// frames; this decides, at every refresh of the display, which image is on it. The measure of a schedule is the motion the
// viewer sees: each shown image has a SCENE TIME -- real frame k shows the world as sampled when k began, a frame generated
// at t between k - 1 and k shows (1 - t) start[k-1] + t start[k] -- and smooth motion is scene time advancing in a straight
// line against display time. JUDDER is the RMS distance of the shown scene times from the best such line, in ms of scene
// time; LATENCY is how long after the real frame it needed was ready an image reaches the display.
//
// THE MODEL: the display refreshes every `refresh` ms, at n * refresh. Real frames are rendered back to back: frame k starts
// when k - 1 is ready and samples the scene then, and is ready `durations[k]` later. Generating is taken as free -- its cost
// is FSR3's to make small and can be added to a duration. Four policies:
//   "none"      no generation: each refresh shows the newest ready real frame
//   "asap"      each real frame k brings the frame at t = 0.5 between k - 1 and k; both are shown as soon as they can be,
//               one a refresh, the half-way frame first -- older ones dropped once a newer pair is ready
//   "midpoint"  FSR3's: the same frames, but the real one HELD until half the real frames' interval after the half-way one,
//               so the two share the interval -- the interval estimated as it goes
//   "timed"     a frame at whatever t puts every shown image on one straight line: the scene time a refresh should show is
//               its display time less a latency held at the render time the real frames need (both estimated as it
//               goes), and the image is generated there -- FSR3 always generates the half-way frame, and this is what that
//               costs when the display's rate is not twice the real frames'. The lag is an interval and a render -- a frame
//               just after real k - 1 cannot be made before k is ready -- and `margin` (a quarter refresh) for late frames
// scheduleCPU drives them over a list of durations; pacingMetrics grades what it shows. makeFramePacer is the same policies
// one refresh at a time, for a page that renders inside requestAnimationFrame.
"use strict";

export const PACE_POLICIES = Object.freeze(["none", "asap", "midpoint", "timed"]);
// a frame ready within this many ms of a refresh makes it: ready times are sums of durations, and 30 frames a second on a 60 Hz
// display is 2 x 16.666... ms, which a float sum lands a hair either side of
const EPS = 1e-6;

/**
 * The pacer, one refresh at a time. real(k, start, ready) reports real frame k, which sampled the scene at `start` and was
 * ready at `ready` (ms); at(time) says what the refresh at `time` shows: { kind: "real" | "gen" | "hold", k, t, scene } --
 * "gen" is the frame at `t` between real k - 1 and k, "hold" the last image again (none before the first real frame).
 */
export function makeFramePacer({ refresh, policy = "midpoint", smoothing = 0.25, margin = null } = {}) {
    if (!(refresh > 0)) throw new Error(`render/framePacer: refresh must be a positive number of ms -- got ${refresh}`);
    if (!PACE_POLICIES.includes(policy)) throw new Error(`render/framePacer: policy must be one of ${PACE_POLICIES.join(", ")} -- got ${JSON.stringify(policy)}`);
    if (!(smoothing > 0 && smoothing <= 1)) throw new Error(`render/framePacer: smoothing must be in (0, 1] -- got ${smoothing}`);
    if (margin === null) margin = refresh / 4;
    if (!(margin >= 0)) throw new Error(`render/framePacer: margin must be a non-negative number of ms -- got ${margin}`);
    const frames = [];                 // { k, start, ready }
    let queue = [];                    // asap / midpoint: images waiting, in order: { kind, k, t, scene, due }
    let last = null, interval = null, render = null, shownAt = -Infinity;
    const ema = (old, v) => (old == null ? v : old + smoothing * (v - old));
    const sceneOf = (k, t) => (t === 1 ? frames[k].start : (1 - t) * frames[k - 1].start + t * frames[k].start);
    const show = (img, time) => { last = { ...img }; delete last.due; shownAt = time; return { ...last }; };
    return {
        policy, refresh,
        get interval() { return interval; }, get renderTime() { return render; },
        real(k, start, ready) {
            if (k !== frames.length) throw new Error(`render/framePacer: real frames must be reported in order -- expected ${frames.length}, got ${k}`);
            if (!(ready >= start)) throw new Error(`render/framePacer: a frame is ready after it starts -- got start ${start}, ready ${ready}`);
            if (k > 0 && !(start >= frames[k - 1].start)) throw new Error("render/framePacer: real frames start in order");
            frames.push({ k, start, ready });
            if (k > 0) interval = ema(interval, start - frames[k - 1].start);
            render = ema(render, ready - start);
            if (policy === "asap" || policy === "midpoint") {
                // a newer pair supersedes whatever of the older is still waiting
                queue = [];
                if (k === 0) queue.push({ kind: "real", k, t: 1, scene: start, due: ready });
                else {
                    queue.push({ kind: "gen", k, t: 0.5, scene: sceneOf(k, 0.5), due: ready });
                    queue.push({ kind: "real", k, t: 1, scene: start, due: ready, hold: policy === "midpoint" });
                }
            }
        },
        at(time) {
            if (policy === "none") {
                let j = frames.length - 1; while (j >= 0 && frames[j].ready > time + EPS) j--;
                if (j < 0) return { kind: "hold", k: -1, t: 0, scene: null };
                if (last && last.k === j) return { ...last, kind: "hold" };
                return show({ kind: "real", k: j, t: 1, scene: frames[j].start }, time);
            }
            if (policy === "asap" || policy === "midpoint") {
                const head = queue[0];
                // midpoint: the real frame waits until half the real interval has passed since the half-way frame went up --
                // rounded to the refresh, and at least one refresh
                const heldUntil = head && head.hold && last && last.kind === "gen" && last.k === head.k && interval != null
                    ? shownAt + Math.max(refresh, Math.round(interval / 2 / refresh) * refresh) - 1e-9 : -Infinity;
                if (head && head.due <= time + EPS && time >= heldUntil) { queue.shift(); return show(head, time); }
                return last ? { ...last, kind: "hold" } : { kind: "hold", k: -1, t: 0, scene: null };
            }
            // timed: the scene time this refresh should show, on a line lagging the display by the latency the real frames need
            if (frames.length < 2 || interval == null) {
                let j = frames.length - 1; while (j >= 0 && frames[j].ready > time + EPS) j--;
                if (j < 0) return { kind: "hold", k: -1, t: 0, scene: null };
                if (last && last.k === j && last.t === 1) return { ...last, kind: "hold" };
                return show({ kind: "real", k: j, t: 1, scene: frames[j].start }, time);
            }
            // a frame just after start[k-1] needs frame k, which starts an interval later and is ready a render after that:
            // the display lags the scene by an interval and a render, and `margin` for the frames that come in late
            const lag = interval + render + margin;
            let scene = time - lag;
            let j = frames.length - 1; while (j >= 0 && frames[j].ready > time + EPS) j--;      // newest ready
            if (j < 0) return { kind: "hold", k: -1, t: 0, scene: null };
            if (scene >= frames[j].start) scene = frames[j].start;                      // cannot show past the newest ready frame
            if (last && last.scene != null && scene < last.scene) scene = last.scene;   // nor go back
            let k = 1; while (k <= j && frames[k].start < scene) k++;
            if (k > j || scene <= frames[0].start) {
                const r = scene <= frames[0].start ? 0 : j;
                if (last && last.k === r && last.t === 1) return { ...last, kind: "hold" };
                return show({ kind: "real", k: r, t: 1, scene: frames[r].start }, time);
            }
            const t = (scene - frames[k - 1].start) / (frames[k].start - frames[k - 1].start);
            // within a millionth of a real frame's own time IS that real frame: the lag is an estimate and a float, and the
            // first draft generated a frame at t = 1e-16 -- the real frame again, through a splat and a warp
            const T_SNAP = 1e-6;
            if (t <= T_SNAP) return last && last.k === k - 1 && last.t === 1 ? { ...last, kind: "hold" } : show({ kind: "real", k: k - 1, t: 1, scene: frames[k - 1].start }, time);
            if (t >= 1 - T_SNAP) return last && last.k === k && last.t === 1 ? { ...last, kind: "hold" } : show({ kind: "real", k, t: 1, scene: frames[k].start }, time);
            if (last && last.scene === scene) return { ...last, kind: "hold" };
            return show({ kind: "gen", k, t, scene }, time);
        },
    };
}

/**
 * Drive a pacer over real frames rendered back to back with these durations (ms), the first starting at 0, for as many
 * refreshes as the last one needs to be shown and `tail` more. Returns { shown, frames } -- shown[n] is at(n * refresh).
 */
export function scheduleCPU({ durations, refresh, policy = "midpoint", tail = 4, smoothing = 0.25, margin = null }) {
    if (!Array.isArray(durations) || durations.length < 2 || !durations.every((d) => d > 0)) throw new Error("render/framePacer: durations must be at least two positive render times");
    const p = makeFramePacer({ refresh, policy, smoothing, margin });
    const frames = []; let t0 = 0;
    for (let k = 0; k < durations.length; k++) { frames.push({ k, start: t0, ready: t0 + durations[k] }); t0 += durations[k]; }
    const shown = [];
    const n = Math.ceil(frames[frames.length - 1].ready / refresh) + tail;
    let next = 0;
    for (let v = 0; v <= n; v++) {
        const time = v * refresh;
        while (next < frames.length && frames[next].ready <= time + EPS) { const f = frames[next++]; p.real(f.k, f.start, f.ready); }
        shown.push({ time, ...p.at(time) });
    }
    return { shown, frames };
}

/**
 * Grade a schedule over the refreshes from `from` to `to` (ms of display time): judder, the RMS distance of the shown
 * scene times from their least-squares line, in ms; the images per second that were NEW; how many refreshes repeated an
 * image; and latency -- display time less the ready time of the real frame an image needed -- mean and worst.
 */
export function pacingMetrics({ shown, frames }, { from = 0, to = Infinity } = {}) {
    const w = shown.filter((s) => s.time >= from && s.time <= to && s.scene != null);
    if (w.length < 3) throw new Error("render/framePacer: pacingMetrics needs at least three shown refreshes in the window");
    const n = w.length, mx = w.reduce((a, s) => a + s.time, 0) / n, my = w.reduce((a, s) => a + s.scene, 0) / n;
    let sxy = 0, sxx = 0; for (const s of w) { sxy += (s.time - mx) * (s.scene - my); sxx += (s.time - mx) ** 2; }
    const slope = sxy / sxx, icpt = my - slope * mx;
    const judder = Math.sqrt(w.reduce((a, s) => a + (s.scene - (icpt + slope * s.time)) ** 2, 0) / n);
    const fresh = w.filter((s) => s.kind !== "hold").length, repeats = n - fresh;
    const lat = w.filter((s) => s.kind !== "hold").map((s) => s.time - frames[s.k].ready);
    const span = (w[n - 1].time - w[0].time) / 1000;
    return { judder, slope, newPerSecond: span > 0 ? fresh / span : 0, repeats, refreshes: n,
             meanLatency: lat.reduce((a, v) => a + v, 0) / Math.max(1, lat.length), maxLatency: lat.length ? Math.max(...lat) : 0 };
}

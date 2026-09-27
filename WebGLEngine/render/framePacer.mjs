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
// when k - 1 is ready and samples the scene then, and is ready `durations[k]` later. A generated frame is available
// `genCost` ms after its pair's newer frame (v4747; 0, free, unless given). Four policies:
//   "none"      no generation: each refresh shows the newest ready real frame
//   "asap"      each real frame k brings the frame at t = 0.5 between k - 1 and k; both are shown as soon as they can be,
//               one a refresh, the half-way frame first -- older ones dropped once a newer pair is ready
//   "midpoint"  FSR3's: the same frames, but the real one HELD until half the real frames' interval after the half-way one,
//               so the two share the interval -- the interval estimated as it goes
//   "timed"     a frame at whatever t puts every shown image on one straight line: the scene time a refresh should show is
//               its display time less a latency held at the render time the real frames need (both estimated as it
//               goes), and the image is generated there -- FSR3 always generates the half-way frame, and this is what that
//               costs when the display's rate is not twice the real frames'. The lag is an interval and a render -- a frame
//               just after real k - 1 cannot be made before k is ready -- and `margin` for late frames
// *** AND ONLY BETWEEN THE TWO NEWEST REAL FRAMES, UNLESS TOLD OTHERWISE (v4747). *** fx/fsr/fsr3Tsl.mjs makes a frame when it
// is shown and holds the newest pair: `pairs` "newest", the default, never asks for anything else. v4743's timed policy did,
// with a quarter refresh of margin -- the line an interval, a render and the margin behind puts the moment after each new
// frame in the pair before it: 58 times in two seconds at 30 frames a second rendered back to back. The device gate had every
// frame ready the moment it started, where it cannot happen; fx/fsr/fsr3Late-selfcheck.mjs, with real render times, read 12
// refusals. So with "newest" the margin defaults to 0 -- any margin pushes the line into a pair nobody holds -- and a scene
// time older than the newest pair shows its older frame. "any" is the model of a generator that keeps older pairs.
// *** v4751: "two" -- the two newest pairs, which fx/fsr/fsr3Tsl.mjs's makeFsr3({ hold: 2 }) keeps -- is "any" in every case
// measured, and keeps the quarter refresh of margin. With the generation costing 4 ms it holds even rates at 0 judder
// where "newest" reads 1.6 to 2.0, and a late frame at 7.7 against 10.0. "eager" is the other answer, measured and not
// taken: every refresh whose scene falls in a new pair planned when the pair arrives and made then -- a generator that
// holds nothing old -- but the plan is made with the lag as it was, and a late or uneven frame finds it stale: 13.7 on the
// late frame at 4 ms against 10.0 for "newest" (render/framePacer-selfcheck.mjs, section 9).
// scheduleCPU drives them over a list of durations; pacingMetrics grades what it shows. makeFramePacer is the same policies
// one refresh at a time, for a page that renders inside requestAnimationFrame. scheduleVrrCPU (v4747) is a display that
// refreshes when it is told to.
// *** v4747: THE QUEUE SHOWS THE NEWEST IMAGE THAT MAY GO UP. *** v4743's cleared itself when a new pair arrived, and with any
// generation cost at all the half-way frame missed the refresh its real frame was ready on and the held real frame was
// cleared before it went up: every real frame dropped, 30 new images a second at the design case. A pair's real frame now
// goes up after its own half-way frame, or alone if that frame was dropped, and older images are dropped only by newer ones.
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
export function makeFramePacer({ refresh, policy = "midpoint", smoothing = 0.25, margin = null, genCost = 0, pairs = "newest" } = {}) {
    if (!(refresh > 0)) throw new Error(`render/framePacer: refresh must be a positive number of ms -- got ${refresh}`);
    if (!PACE_POLICIES.includes(policy)) throw new Error(`render/framePacer: policy must be one of ${PACE_POLICIES.join(", ")} -- got ${JSON.stringify(policy)}`);
    if (!(smoothing > 0 && smoothing <= 1)) throw new Error(`render/framePacer: smoothing must be in (0, 1] -- got ${smoothing}`);
    if (!["newest", "two", "any", "eager"].includes(pairs)) throw new Error(`render/framePacer: pairs must be "newest", "two", "any" or "eager" -- got ${JSON.stringify(pairs)}`);
    if (margin === null) margin = pairs === "newest" ? 0 : refresh / 4;       // "two", "any" and "eager" keep the quarter refresh
    if (!(margin >= 0)) throw new Error(`render/framePacer: margin must be a non-negative number of ms -- got ${margin}`);
    if (!(genCost >= 0)) throw new Error(`render/framePacer: genCost must be a non-negative number of ms -- got ${genCost}`);
    const frames = [];                 // { k, start, ready }
    let queue = [];                    // asap / midpoint: images waiting, in order: { kind, k, t, scene, due }
    let last = null, interval = null, render = null, shownAt = -Infinity;
    const planned = new Map();          // eager: refresh index -> { kind, k, t, scene, due }
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
            if (policy === "timed" && pairs === "eager" && k >= 1 && interval != null) {
                // v4751, "eager": every refresh whose scene time falls in this pair, planned now -- with the lag as it is now --
                // and made now, one after another, genCost each
                const lag = interval + render + genCost + margin, a = frames[k - 1].start, b = start;
                let n = Math.max(Math.ceil((ready - 1e-9) / refresh), Math.ceil((a + lag) / refresh - 1e-9)), i = 0;
                for (; n * refresh - lag <= b + 1e-9; n++) {
                    const sc = n * refresh - lag; if (sc <= a + 1e-9) continue;
                    const t = (sc - a) / (b - a), T_SNAP = 1e-6;
                    const img = t >= 1 - T_SNAP ? { kind: "real", k, t: 1, scene: b, due: ready } : { kind: "gen", k, t, scene: sc, due: ready + genCost * ++i };
                    planned.set(n, img);
                }
            }
            if (policy === "asap" || policy === "midpoint") {
                // a generated frame is made when it is shown (fsr-three.html's paced view, fx/fsr/fsr3Tsl.mjs's generate), and
                // the generator holds the newest pair only: an older pair's that has not gone up never will. Its real frame
                // is kept -- makeFsr3 holds the last two -- and, its half-way frame gone, may go up alone: a generation too slow
                // for the time it has falls back to the real frames, not to a frozen screen
                queue = queue.filter((img) => img.kind !== "gen").map((img) => ({ ...img, alone: true }));
                if (k === 0) queue.push({ kind: "real", k, t: 1, scene: start, due: ready });
                else {
                    queue.push({ kind: "gen", k, t: 0.5, scene: sceneOf(k, 0.5), due: ready + genCost });
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
                // the NEWEST image that may go up now, and every older one dropped. midpoint: a real frame waits until half the
                // real interval has passed since its half-way frame went up -- rounded to the refresh, and at least one
                const ok = (img) => { if (img.due > time + EPS) return false;
                    if (img.kind !== "real" || img.k === 0) return true;
                    // a pair's real frame goes up after its half-way frame, and only then
                    if (img.alone) return true;
                    if (!last || last.kind !== "gen" || last.k !== img.k) return false;
                    if (!img.hold || interval == null) return true;
                    return time >= shownAt + Math.max(refresh, Math.round(interval / 2 / refresh) * refresh) - 1e-9; };
                let j = -1; for (let i = 0; i < queue.length; i++) if (ok(queue[i])) j = i;
                if (j >= 0) { const img = queue[j]; queue = queue.slice(j + 1); return show(img, time); }
                return last ? { ...last, kind: "hold" } : { kind: "hold", k: -1, t: 0, scene: null };
            }
            // eager: the refresh's planned image, if it is made by now and does not go back
            if (pairs === "eager" && frames.length >= 2 && interval != null) {
                const n = Math.round(time / refresh), img = planned.get(n);
                if (img && img.due <= time + EPS && !(last && last.scene != null && img.scene < last.scene)) { planned.delete(n); return show(img, time); }
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
            const lag = interval + render + genCost + margin;
            let scene = time - lag;
            let j = frames.length - 1; while (j >= 0 && frames[j].ready > time + EPS) j--;      // newest ready
            if (j < 0) return { kind: "hold", k: -1, t: 0, scene: null };
            if (scene >= frames[j].start) scene = frames[j].start;                      // cannot show past the newest ready frame
            if (pairs === "newest" && j >= 1 && scene < frames[j - 1].start) scene = frames[j - 1].start;   // nor before the pair it holds
            if (pairs === "two" && j >= 2 && scene < frames[j - 2].start) scene = frames[j - 2].start;
            if (last && last.scene != null && scene < last.scene) scene = last.scene;   // nor go back
            let k = 1; while (k <= j && frames[k].start < scene) k++;
            if (k > j || scene <= frames[0].start) {
                const r = scene <= frames[0].start ? 0 : j;
                if (last && last.k === r && last.t === 1) return { ...last, kind: "hold" };
                return show({ kind: "real", k: r, t: 1, scene: frames[r].start }, time);
            }
            const t = (scene - frames[k - 1].start) / (frames[k].start - frames[k - 1].start);
            // a generated frame needs its pair's newer frame AND the generation's own time
            if (frames[k].ready + genCost > time + EPS) return last ? { ...last, kind: "hold" } : { kind: "hold", k: -1, t: 0, scene: null };
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
export function scheduleCPU({ durations, refresh, policy = "midpoint", tail = 4, smoothing = 0.25, margin = null, genCost = 0, pairs = "newest" }) {
    if (!Array.isArray(durations) || durations.length < 2 || !durations.every((d) => d > 0)) throw new Error("render/framePacer: durations must be at least two positive render times");
    const p = makeFramePacer({ refresh, policy, smoothing, margin, genCost, pairs });
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
 * v4747 -- A DISPLAY THAT REFRESHES WHEN IT IS TOLD TO: variable refresh (VRR), presenting an image whenever the pacer asks,
 * no sooner than `min` ms after the last and -- with nothing new -- repeating the last image `max` ms after it (the naive
 * low-frame-rate compensation: a driver that predicted the next frame and split the wait would do better). The same real
 * frames as scheduleCPU, rendered back to back, and a generated frame available `genCost` ms after its pair's newer frame.
 * Each image is presented at a time the policy chooses, not at a refresh:
 *   "none"      each real frame when it is ready
 *   "asap"      the half-way frame when it is made, the real frame right after
 *   "midpoint"  FSR3's: the real frame held to half the real interval after the half-way frame -- which on a fixed refresh
 *               bought nothing (render/framePacer-selfcheck.mjs, section 4) and here is what spaces the two
 *   "timed"     each image at its own scene time plus one latency -- half an interval, a render, the generation and
 *               `margin` -- so they fall on one line unless a frame comes in later than that
 * An image not yet presented when the next pair's half-way frame could be is dropped, so a render rate above what the
 * display takes does not queue without end. Returns { shown, frames }: shown is each present, { time, kind, k, t, scene },
 * repeats as "hold" -- grade it with pacingMetrics(..., { images: "new" }), since a repeat here is the display's, not a
 * refresh the viewer waited for.
 */
export function scheduleVrrCPU({ durations, min, max, policy = "midpoint", genCost = 0, smoothing = 0.25, margin = 0 }) {
    if (!Array.isArray(durations) || durations.length < 2 || !durations.every((d) => d > 0)) throw new Error("render/framePacer: durations must be at least two positive render times");
    if (!(min > 0) || !(max >= min)) throw new Error(`render/framePacer: a variable refresh needs 0 < min <= max ms between refreshes -- got ${min}, ${max}`);
    if (!PACE_POLICIES.includes(policy)) throw new Error(`render/framePacer: policy must be one of ${PACE_POLICIES.join(", ")} -- got ${JSON.stringify(policy)}`);
    if (!(genCost >= 0)) throw new Error(`render/framePacer: genCost must be a non-negative number of ms -- got ${genCost}`);
    if (!(margin >= 0)) throw new Error(`render/framePacer: margin must be a non-negative number of ms -- got ${margin}`);
    const frames = []; let t0 = 0;
    for (let k = 0; k < durations.length; k++) { frames.push({ k, start: t0, ready: t0 + durations[k] }); t0 += durations[k]; }
    const shown = []; let last = -Infinity, lastImg = null, interval = null, render = null;
    const ema = (old, v) => (old == null ? v : old + smoothing * (v - old));
    // present at `time` or as soon after as the display can -- unless the next pair's half-way frame is available by then
    const present = (time, img, k) => {
        const at = Math.max(time, last + min);
        if (k + 1 < frames.length && policy !== "none" && frames[k + 1].ready + genCost <= at - EPS) return null;
        if (policy === "none" && k + 1 < frames.length && frames[k + 1].ready <= at - EPS) return null;
        while (lastImg && at - last > max + EPS) { last += max; shown.push({ time: last, ...lastImg, kind: "hold" }); }
        shown.push({ time: at, ...img }); last = at; lastImg = { ...img }; return at;
    };
    for (let k = 0; k < frames.length; k++) {
        const f = frames[k];
        if (k > 0) interval = ema(interval, f.start - frames[k - 1].start);
        render = ema(render, f.ready - f.start);
        if (policy === "none" || k === 0) { present(f.ready, { kind: "real", k, t: 1, scene: f.start }, k); continue; }
        const half = { kind: "gen", k, t: 0.5, scene: (frames[k - 1].start + f.start) / 2 }, real = { kind: "real", k, t: 1, scene: f.start };
        const made = f.ready + genCost;
        if (policy === "timed") {
            const lag = interval / 2 + render + genCost + margin;
            const g = present(Math.max(half.scene + lag, made), half, k);
            present(Math.max(real.scene + lag, g ?? made), real, k);
            continue;
        }
        const g = present(made, half, k);
        present(policy === "asap" || g === null ? Math.max(f.ready, g ?? made) : g + interval / 2, real, k);
    }
    return { shown, frames };
}

/**
 * Grade a schedule over the refreshes from `from` to `to` (ms of display time): judder, the RMS distance of the shown
 * scene times from their least-squares line, in ms; the images per second that were NEW; how many refreshes repeated an
 * image; and latency -- display time less the ready time of the real frame an image needed -- mean and worst.
 * `images` "all" grades every refresh, a repeat included: on a fixed refresh the viewer waits the refresh out. "new"
 * grades the new images only, which is what a variable refresh shows (v4747).
 */
export function pacingMetrics({ shown, frames }, { from = 0, to = Infinity, images = "all" } = {}) {
    if (images !== "all" && images !== "new") throw new Error(`render/framePacer: images must be "all" or "new" -- got ${JSON.stringify(images)}`);
    const w = shown.filter((s) => s.time >= from && s.time <= to && s.scene != null && (images === "all" || s.kind !== "hold"));
    if (w.length < 3) throw new Error("render/framePacer: pacingMetrics needs at least three shown refreshes in the window");
    const n = w.length, mx = w.reduce((a, s) => a + s.time, 0) / n, my = w.reduce((a, s) => a + s.scene, 0) / n;
    let sxy = 0, sxx = 0; for (const s of w) { sxy += (s.time - mx) * (s.scene - my); sxx += (s.time - mx) ** 2; }
    const slope = sxy / sxx, icpt = my - slope * mx;
    const judder = Math.sqrt(w.reduce((a, s) => a + (s.scene - (icpt + slope * s.time)) ** 2, 0) / n);
    const fresh = w.filter((s) => s.kind !== "hold").length, repeats = shown.filter((s) => s.time >= from && s.time <= to && s.kind === "hold").length;
    const lat = w.filter((s) => s.kind !== "hold").map((s) => s.time - frames[s.k].ready);
    const span = (w[n - 1].time - w[0].time) / 1000;
    return { judder, slope, newPerSecond: span > 0 ? fresh / span : 0, repeats, refreshes: n,
             meanLatency: lat.reduce((a, v) => a + v, 0) / Math.max(1, lat.length), maxLatency: lat.length ? Math.max(...lat) : 0 };
}

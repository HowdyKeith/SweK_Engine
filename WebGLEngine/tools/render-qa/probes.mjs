// tools/render-qa/probes.mjs
//
// v3110 -- NAMED PROBES, BECAUSE RENDER-QA CANNOT SEE STUTTER.
//
// Every check in checks.mjs is a PIXEL check: notAllBlack, notUniform, colorPresent. That is the right shape for
// "did this page render at all", and it is structurally blind to the defect class this tree keeps hitting -- work
// that blocks the thread which has to stay responsive. A page that blocks main for 80ms a frame produces a
// screenshot IDENTICAL to one that does not. The camera page could pass every existing check while being
// unusable.
//
// THE OCCASION. face-mirror.html drives MediaPipeFaceTracker, whose detectForVideo() is documented as running
// SYNCHRONOUSLY, and it is called from inside a requestAnimationFrame tick (MediaPipeFaceTracker.js:220) with no
// worker anywhere in the file. That is the third appearance of the same lesson in this tree -- after the poller
// and after /sync/status walking the asset tree on the server thread -- and all three were spotted by reading
// rather than measuring.
//
// SO THIS SHIPS THE INSTRUMENT, NOT THE VERDICT. A probe is DATA and never flips a page's ok, which is exactly
// right here: nobody has a defensible threshold for "too much jank" yet, and inventing one from taste is how a
// tolerance gets chosen instead of measured. Run it, read the numbers, and only then decide whether an assert
// is warranted and where it sits.

/**
 * Main-thread responsiveness over a fixed window, measured two independent ways so a disagreement is visible:
 *
 *   longTasks  -- PerformanceObserver('longtask'), the browser's own >50ms main-thread report. Authoritative
 *                 where supported, absent in some engines, so its absence is reported rather than read as zero.
 *   frameGaps  -- requestAnimationFrame deltas. Available everywhere, and it catches what longtask does not:
 *                 a run of 30ms blocks never trips the 50ms threshold but destroys the feel just the same.
 *
 * Returns raw numbers with no pass/fail. The caller decides what they mean.
 */
export const mainThreadResponsiveness = `(async () => {
  const MS = 4000;
  const gaps = []; const longs = [];
  let obs = null, longtaskSupported = false;
  try {
    obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push(Math.round(e.duration)); });
    obs.observe({ entryTypes: ["longtask"] });
    longtaskSupported = true;
  } catch (e) { longtaskSupported = false; }
  let prev = performance.now();
  const t0 = prev;
  await new Promise((done) => {
    const step = () => {
      const now = performance.now();
      gaps.push(now - prev); prev = now;
      if (now - t0 < MS) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
  try { if (obs) obs.disconnect(); } catch (e) {}
  const sorted = gaps.slice().sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] * 10) / 10 : null);
  return {
    windowMs: MS,
    frames: gaps.length,
    fps: gaps.length ? Math.round((gaps.length / ((prev - t0) / 1000)) * 10) / 10 : null,
    frameMs: { p50: pct(0.5), p95: pct(0.95), max: sorted.length ? Math.round(sorted[sorted.length - 1] * 10) / 10 : null },
    // a frame over 50ms is a visible hitch; over 100ms the page feels broken
    framesOver50ms: gaps.filter((g) => g > 50).length,
    framesOver100ms: gaps.filter((g) => g > 100).length,
    longtaskSupported,
    longTasks: longtaskSupported ? { count: longs.length, totalMs: longs.reduce((a, b) => a + b, 0), maxMs: longs.length ? Math.max.apply(null, longs) : 0 } : null,
  };
})()`;

export const PROBES = { mainThreadResponsiveness };

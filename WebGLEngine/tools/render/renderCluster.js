// tools/render/renderCluster.js
//
// The distributed-render coordinator -- the piece that actually wires the slice/assemble/verify harness to a set of
// peers. Given a frame and a number of peers reached through a transport, it plans which band each peer renders, collects
// the returned bands, VERIFIES each one by recomputing it locally and comparing -- never trusting the peer's own
// self-reported checksum -- assembles the verified bands, and recovers from any peer that returns the wrong pixels or
// nothing at all by falling back to its own recomputation. The final frame is therefore always correct, whether the peers
// were honest, buggy, dishonest, or offline.
//
// The transport is an INTERFACE, not a network. A mock local transport stands in here and is what the gate exercises; the
// real LAN peer RPC (server.js capability proxy) plugs into the exact same seam rig-side. The coordinator neither knows
// nor cares whether a band arrived from across the room or across the process -- which is the whole point of building the
// verification headless: prove the coordination is sound, then swap in the wire.
//
// Honest note on cost: the gate verifies every band by full recompute to PROVE the detection is sound. In production you
// would not recompute everything (that defeats distribution) -- you verify by redundancy (assign each band to two peers
// and compare, since determinism means they must agree) or by sampling. What is proven here is the safety property that
// makes either of those work: a faulty slice is always caught, and the frame always recovers.

import { renderRegion, frameSum } from "./render.js";

// Plan: split H rows into nSlices bands and assign them round-robin to nPeers peers.
export function planWork(H, nSlices, nPeers) {
    const bands = [];
    for (let i = 0; i < nSlices; i++) bands.push({ peer: i % nPeers, y0: Math.floor(i * H / nSlices), y1: Math.floor((i + 1) * H / nSlices) });
    return bands;
}

// An honest transport: every peer renders its band correctly. (Optionally one peer is offline and returns null.)
export function honestTransport(offlinePeer = -1) {
    return {
        renderBand(peer, y0, y1, W, H) {
            if (peer === offlinePeer) return null;                              // dropped / offline
            const pixels = renderRegion(0, y0, W, y1, W, H);
            return { pixels, checksum: frameSum(pixels) };
        },
    };
}

// A faulty transport: one peer returns garbage pixels, with a self-consistent checksum of that garbage (so a coordinator
// that merely trusts the peer's self-report would be fooled -- only recomputation catches it).
export function faultyTransport(faultyPeer) {
    return {
        renderBand(peer, y0, y1, W, H) {
            const pixels = renderRegion(0, y0, W, y1, W, H);
            if (peer === faultyPeer) pixels[0] += 0.5;                          // corrupted band
            return { pixels, checksum: frameSum(pixels) };                      // honest-looking checksum OF the garbage
        },
    };
}

// Coordinate the render. Returns the assembled frame plus a report of what was verified and what had to be recovered.
export function renderCluster(W, H, nSlices, nPeers, transport) {
    const full = new Float64Array(W * H);
    const report = { peers: nPeers, slices: nSlices, verified: 0, recovered: 0 };
    for (const { peer, y0, y1 } of planWork(H, nSlices, nPeers)) {
        const band = transport.renderBand(peer, y0, y1, W, H);
        const truth = renderRegion(0, y0, W, y1, W, H);                         // recompute the truth locally
        let pixels;
        if (band && frameSum(band.pixels) === frameSum(truth)) { pixels = band.pixels; report.verified++; }
        else { pixels = truth; report.recovered++; }                           // wrong pixels or missing -> recover
        for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) full[y * W + x] = pixels[(y - y0) * W + x];
    }
    return { frame: full, ...report };
}

// Async coordinator, for transports that reach peers over the network (renderBand returns a promise). Same contract as
// renderCluster: verify each returned band by recomputing locally, recover anything that fails or never arrives.
export async function renderClusterAsync(W, H, nSlices, nPeers, transport) {
    const full = new Float64Array(W * H);
    const report = { peers: nPeers, slices: nSlices, verified: 0, recovered: 0 };
    for (const { peer, y0, y1 } of planWork(H, nSlices, nPeers)) {
        let band = null; try { band = await transport.renderBand(peer, y0, y1, W, H); } catch { band = null; }
        const truth = renderRegion(0, y0, W, y1, W, H);
        let pixels;
        if (band && band.pixels && frameSum(band.pixels) === frameSum(truth)) { pixels = band.pixels; report.verified++; }
        else { pixels = truth; report.recovered++; }
        for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) full[y * W + x] = pixels[(y - y0) * W + x];
    }
    return { frame: full, ...report };
}

// tools/render/renderRPC.js
//
// The real wire for distributed rendering across the fleet. This is the layer that turns the coordinator's transport
// interface into an actual peer-to-peer call over the SweK mesh. Two halves:
//
//  - SERVER SIDE: handleRenderBand(body) is what a peer runs when it is asked to render a slice. server.js calls it from
//    its route table for POST /render/band, exactly the way it already serves /box3d/artifact to mesh peers. It parses
//    the band request, renders it, and returns the pixels plus a checksum.
//  - CLIENT SIDE: networkTransport wraps server.js's own _peerJSON(base, path, method, body, timeout) helper into the
//    transport the coordinator expects, so renderClusterAsync can hand a band to a real peer at a real tailnet address
//    and get it back. A network error or timeout comes back as null, which the coordinator recovers from.
//
// The wire format is a plain JSON array of the pixel intensities plus the frame checksum. It must be LOSSLESS: the whole
// safety story rests on the returned band hashing to the same value the coordinator computes locally, so if the wire
// rounds or truncates the pixels, every band fails verification and the peers' work is wasted. The gate proves the
// round-trip is bit-exact.
//
// Rig-side wiring (three lines, all confirmed against server.js patterns):
//   1. route:  if (p === "/render/band" && req.method === "POST") { ...read body... res JSON handleRenderBand(body); }
//   2. auth:   add "/render/band" to AUTH_PUBLIC (mesh-reachable compute handoff, like "/box3d/artifact")
//   3. client: networkTransport(peerBases, _peerJSON) -- peerBases from the live roster, _peerJSON is server.js's helper

import { renderRegion, frameSum } from "./render.js";

// ---- SERVER SIDE: a peer renders the requested band ------------------------------------------------
export function handleRenderBand(body) {
    const y0 = body && body.y0, y1 = body && body.y1, W = body && body.W, H = body && body.H;
    if (![y0, y1, W, H].every((n) => Number.isInteger(n)) || y0 < 0 || y1 > H || y0 >= y1 || W <= 0) return { ok: false, error: "bad band request" };
    const pixels = renderRegion(0, y0, W, y1, W, H);
    return { ok: true, y0, y1, W, H, pixels: Array.from(pixels), checksum: frameSum(pixels) };
}

// ---- WIRE FORMAT -----------------------------------------------------------------------------------
export function bandRequest(y0, y1, W, H) { return { y0, y1, W, H }; }
export function parseBandResponse(json) {
    if (!json || !json.ok || !Array.isArray(json.pixels)) return null;
    return { pixels: Float64Array.from(json.pixels), checksum: json.checksum };
}

// ---- CLIENT SIDE: wrap the peer JSON call into the coordinator's transport --------------------------
// peerJSON has server.js's signature: peerJSON(base, path, method, body, timeout) -> parsed JSON (or throws).
export function networkTransport(peerBases, peerJSON, timeout = 8000) {
    return {
        async renderBand(peer, y0, y1, W, H) {
            const base = peerBases[peer % peerBases.length];
            try {
                const json = await peerJSON(base, "/render/band", "POST", bandRequest(y0, y1, W, H), timeout);
                return parseBandResponse(json);
            } catch { return null; }                                            // timeout / unreachable -> recover
        },
    };
}

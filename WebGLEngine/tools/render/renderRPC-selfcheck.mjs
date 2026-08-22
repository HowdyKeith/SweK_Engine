// tools/render/renderRPC-selfcheck.mjs
//
// Run: node tools/render/renderRPC-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The real peer render RPC, checked end to end with a mock peer-JSON call standing in for the wire. The server-side
// handler renders a band and the wire round-trips it bit-for-bit; the network transport plugs into the async coordinator
// and a full frame rendered across four mock peers is identical to a solo render; a peer that times out and a peer that
// returns corrupted pixels over the wire are both caught and recovered, frame still identical; and a malformed request is
// rejected at the handler. The sabotage makes the handler serialize the pixels with reduced precision -- a lossy wire --
// and the round-trip stops being bit-exact, which would make every returned band fail verification and waste every peer's
// work. The wire must be lossless, and the gate holds it to that.
import { renderWhole, renderRegion, frameSum } from "./render.js";
import { renderClusterAsync } from "./renderCluster.js";
import { handleRenderBand, bandRequest, parseBandResponse, networkTransport } from "./renderRPC.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const W = 80, H = 60;
const solo = renderWhole(W, H);
const identical = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
const bases = ["a", "b", "c", "d"];
const routeToHandler = async (base, path, method, body) => handleRenderBand(body);   // mock peer JSON -> the real handler

// ---- 1. THE HANDLER + WIRE ROUND-TRIP IS BIT-EXACT -------------------------------------------------
{
    const band = parseBandResponse(handleRenderBand(bandRequest(20, 40, W, H)));
    const truth = renderRegion(0, 20, W, 40, W, H);
    ok("!! a peer's rendered band survives the wire bit-for-bit", band && identical(band.pixels, truth) && band.checksum === frameSum(truth),
       "the handler renders the band, serialises it to JSON and back, and the pixels are identical to a local render -- the wire is lossless, which is what lets the coordinator verify the band by its checksum.");
}

// ---- 2. THE NETWORK TRANSPORT + ASYNC COORDINATOR == SOLO -------------------------------------------
{
    const r = await renderClusterAsync(W, H, 8, 4, networkTransport(bases, routeToHandler));
    ok("!! a frame rendered across peers over the RPC is identical to a solo render", identical(r.frame, solo) && r.verified === 8 && r.recovered === 0,
       "four peers each answer a POST /render/band, the coordinator verifies and stacks the eight bands, and the frame matches solo to the bit -- the real request/response path, end to end.");
}

// ---- 3. A PEER THAT TIMES OUT IS RECOVERED ---------------------------------------------------------
{
    const flaky = async (base, path, m, body) => { if (base === "b") throw new Error("timeout"); return handleRenderBand(body); };
    const r = await renderClusterAsync(W, H, 8, 4, networkTransport(bases, flaky));
    ok("!! a peer that times out or is unreachable is recovered, not fatal", identical(r.frame, solo) && r.recovered > 0,
       "peer b throws on every call; the transport turns that into a null and the coordinator rebuilds its " + r.recovered + " bands -- an unreachable peer just means a little more local work.");
}

// ---- 4. A PEER THAT SENDS GARBAGE OVER THE WIRE IS CAUGHT -------------------------------------------
{
    const liar = async (base, path, m, body) => { const rsp = handleRenderBand(body); if (base === "c") rsp.pixels[0] += 0.5; return rsp; };
    const r = await renderClusterAsync(W, H, 8, 4, networkTransport(bases, liar));
    ok("!! a peer that returns corrupted pixels over the wire is caught by recomputation", identical(r.frame, solo) && r.recovered > 0,
       "peer c corrupts its band in transit, the coordinator's local recompute rejects it, and the frame is still identical to solo -- the wire is not trusted, it is verified.");
}

// ---- 5. A MALFORMED REQUEST IS REJECTED AT THE HANDLER ---------------------------------------------
{
    const bad = handleRenderBand({ y0: 50, y1: 20, W: 80, H: 60 }).ok === false;
    const good = handleRenderBand(bandRequest(0, 10, W, H)).ok === true;
    ok("!! the handler rejects a malformed band request and accepts a valid one", bad && good,
       "a band whose end precedes its start (or is out of frame) is refused, while a well-formed request renders -- the peer validates before it computes.");
}

// ---- 6. DETERMINISTIC ------------------------------------------------------------------------------
{
    const a = await renderClusterAsync(W, H, 8, 4, networkTransport(bases, routeToHandler));
    const b = await renderClusterAsync(W, H, 8, 4, networkTransport(bases, routeToHandler));
    ok("!! deterministic", identical(a.frame, b.frame),
       "the same distributed render over the same peers gives the same frame every run.");
}

console.log(fails ? "\nrenderRPC-selfcheck: " + fails + " FAILED" : "\nrenderRPC-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);

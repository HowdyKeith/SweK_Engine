// gpu.js -- WebGPU adapter/device bring-up with a hard hardware assert.
// Part of the SweK GPU Brain v1 (Deno headless WebGPU).
//
// The single most important thing this file does is REFUSE to run on a
// software adapter. wgpu (Deno's WebGPU) can silently hand back a CPU
// rasterizer (llvmpipe / SwiftShader / "Microsoft Basic Render Driver"),
// and a "GPU brain" quietly running on the CPU is worse than no brain --
// it lies about what's being demonstrated. Fail loudly instead.

// v4470 -- `allowSoftware` (or SWEK_ALLOW_SOFTWARE_GPU=1) lets a GATE run the brain's kernels where every other GPU
// gate in the tree runs -- this build box's SwiftShader -- with the refusal still the default for the brain process
// itself, whose whole point the refusal protects. The flag changes what a gate may do, not what the brain does.
export async function initGPU({ allowSoftware = false } = {}) {
    const envAllow = (() => { try { return (globalThis.Deno?.env?.get?.("SWEK_ALLOW_SOFTWARE_GPU") ?? globalThis.process?.env?.SWEK_ALLOW_SOFTWARE_GPU) === "1"; } catch { return false; } })();
    allowSoftware = allowSoftware || envAllow;
    if (!globalThis.navigator?.gpu) {
        throw new Error(
            "navigator.gpu missing. Run with: deno run --unstable-webgpu " +
            "(and on Windows set WGPU_BACKEND=vulkan; see START_BRAIN.bat)");
    }
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No WebGPU adapter found (driver? WGPU_BACKEND?)");

    // adapter.info is the current spec; requestAdapterInfo() is the older
    // surface some Deno versions still expose. Take whichever answers.
    let info = {};
    try { info = adapter.info ?? (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : {}); } catch {}
    const desc = [info.vendor, info.architecture, info.device, info.description]
        .filter(Boolean).join(" ") || "(adapter info unavailable)";

    // Hard assert: no software fallbacks. isFallbackAdapter is the spec
    // flag; the name sniff catches drivers that do not set it.
    const soft = /swiftshader|llvmpipe|software|microsoft basic/i.test(desc);
    if ((adapter.isFallbackAdapter || soft) && allowSoftware) {
        console.warn("[gpu] SOFTWARE adapter accepted under allowSoftware -- a gate's device, not the brain's:", desc);
    } else if (adapter.isFallbackAdapter || soft) {
        throw new Error(
            "Refusing to run on a SOFTWARE adapter: " + desc + "\n" +
            "A CPU rasterizer pretending to be the GPU brain defeats the point.\n" +
            "Fix: update GPU drivers / set WGPU_BACKEND=vulkan / check the GPU is visible.");
    }

    const device = await adapter.requestDevice();
    device.addEventListener?.("uncapturederror", (e) => {
        console.error("[gpu] uncaptured device error:", e.error?.message ?? e);
    });
    console.log("[gpu] adapter:", desc);
    return { adapter, device, desc, software: !!(adapter.isFallbackAdapter || soft) };
}

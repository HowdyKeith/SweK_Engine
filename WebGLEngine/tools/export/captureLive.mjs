// tools/export/captureLive.mjs -- RIG-ONLY live capture. Playwright loads an autonomous page (the brain flies, seeds
// vary) and screenshots its canvas at fps for N seconds into a PNG sequence for framesToMp4. Because the scene runs
// itself, each run differs -- which is the point of rendering a page several times and swiping for the best. Not
// runnable in the Linux sandbox (no browser); the roster/batch/QA orchestration it feeds is verified.
import fs from "node:fs";
import path from "node:path";
export async function captureLiveFrames({ pageUrl, seconds, fps = 30, width = 1280, height = 720, outDir }) {
    let chromium; try { ({ chromium } = await import("playwright")); } catch (e) { throw new Error("playwright not installed on this box (rig): " + e.message); }
    fs.mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
    try {
        const page = await browser.newPage({ viewport: { width, height } });
        await page.goto(pageUrl, { waitUntil: "load" }); await page.waitForTimeout(600);
        const frames = Math.ceil(seconds * fps), dt = 1000 / fps;
        for (let i = 0; i < frames; i++) { const buf = await page.locator("canvas").first().screenshot({ type: "png" }); fs.writeFileSync(path.join(outDir, "frame-" + String(i).padStart(5, "0") + ".png"), buf); await page.waitForTimeout(dt); }
        return { frames };
    } finally { await browser.close(); }
}

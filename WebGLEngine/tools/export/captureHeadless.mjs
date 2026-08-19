// tools/export/captureHeadless.mjs -- RIG-ONLY headless capture. Playwright launches Chromium with software/ANGLE
// WebGL, loads youtube-export.html in headless mode, seeks the deterministic narration timeline frame-by-frame, and
// screenshots the canvas to a PNG sequence for framesToMp4. Not runnable in the Linux sandbox (no browser/GPU); the
// encode + mux it feeds is verified. Requires `playwright` on the rig (npx playwright install chromium).
import fs from "node:fs";
import path from "node:path";

export async function captureHeadless({ pageUrl, script, fps = 30, width = 1280, height = 720, outDir }) {
    let chromium; try { ({ chromium } = await import("playwright")); } catch (e) { throw new Error("playwright not installed on this box (npx playwright install chromium): " + e.message); }
    fs.mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-webgl"] });
    try {
        const page = await browser.newPage({ viewport: { width, height } });
        await page.goto(pageUrl + "?headless=1&script=" + encodeURIComponent(script), { waitUntil: "load" });
        await page.waitForFunction("window.__swekExport && window.__swekExport.ready", null, { timeout: 15000 });
        const plan = await page.evaluate(() => window.__swekExport.plan());
        const frames = Math.ceil((plan.totalMs / 1000) * fps);
        for (let i = 0; i < frames; i++) {
            await page.evaluate((tMs) => window.__swekExport.seek(tMs), (i / fps) * 1000);
            const buf = await page.locator("#c").screenshot({ type: "png" });
            fs.writeFileSync(path.join(outDir, "frame-" + String(i).padStart(5, "0") + ".png"), buf);
        }
        return { frames, plan };
    } finally { await browser.close(); }
}

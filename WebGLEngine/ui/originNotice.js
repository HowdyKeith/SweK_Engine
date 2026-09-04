// WebGLEngine/ui/originNotice.js -- v4452
//
// *** ONE TAG, NO CONTROL FLOW, FOR THE PAGES THAT ASK FOR A DEVICE AND SAY NOTHING WHEN THE ORIGIN REFUSES. ***
//
// Keith: "I don't know why the swek engine locally runs with an ip, and then all the gpu pages have to be re
// opened with localhost. all the machines run webgpu pages fully." The machines are fine. navigator.gpu is
// only exposed in a SECURE CONTEXT, and a browser treats localhost / 127.0.0.1 as secure over plain http
// while http://192.168.50.57:8787 is not -- so on the LAN address the property is simply absent, and every
// page that checks for it says some version of "no WebGPU", which reads as a verdict on the browser.
//
// ui/webgpuProbe.mjs has known the difference since v3981 and MEASURED at v4452: of the 31 pages in this tree
// that acquire a device, 16 asked it and the rest did not.
//
// *** THIS IS A SIDE EFFECT AND NOTHING ELSE, WHICH IS THE WHOLE REASON IT IS A SEPARATE FILE. *** The nine
// pages left over guard the device in nine different shapes -- seven `if (!navigator.gpu)`, one
// WebGPURenderer, one neither -- and rewriting nine control flows to add a message is nine chances to break a
// page that currently works. A tag appended before </body> cannot change what the page does: it either adds
// a banner or it does not. The page's own error text is left exactly as it was, because a page that says
// "no adapter" UNDER a banner explaining the origin is now telling the truth twice rather than once.
//
// It is idempotent by construction -- showOriginBanner returns early if #swek-origin-banner exists -- so a
// page that ALSO probes for itself gets one banner, not two.
import { describeWebGPU, showOriginBanner } from "./webgpuProbe.mjs";

try {
    const p = describeWebGPU({ navigator, isSecureContext: window.isSecureContext, location });
    // ONLY the insecure-origin case. A box that genuinely has no WebGPU gets nothing from here: that is the
    // page's own story to tell, and a banner saying "try localhost" to somebody already ON localhost is the
    // v3981 mistake -- "isSecureContext alone would send somebody chasing a certificate they do not need".
    if (p && p.reason === "insecure-origin") showOriginBanner(p);
} catch (e) { /* a diagnostic that breaks the page it diagnoses is worse than no diagnostic */ }

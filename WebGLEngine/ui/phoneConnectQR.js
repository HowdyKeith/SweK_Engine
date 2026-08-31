// ui/phoneConnectQR.js — v525 — "scan to connect" QR for the phone control panel.
// Renders a QR of <origin>/phone.html so a phone on the same Wi-Fi joins
// without typing the IP. Uses the vendored qrcode-generator (MIT). The QR only
// resolves to a reachable address if the engine itself is served by the relay
// (which it must be, since the WS bridge connects to location.host).

let _qrcode = null;
async function loadQR() {
    if (_qrcode) return _qrcode;
    const mod = await import("./vendor/qrcode.mjs");
    _qrcode = mod.default || mod;
    return _qrcode;
}
function controlURL() {
    try { return location.origin + "/phone.html"; } catch { return "/phone.html"; }
}

// v637 — when the engine page is opened via http://localhost:<port>/ the bare
// location.origin would encode "localhost" into the QR — and a phone scanning
// that resolves localhost to its OWN loopback (= broken: "page won't load").
// Fetch /net/info to pick the recommended LAN IP and substitute it. Returns
// the original origin URL if not localhost (e.g. user opened the engine via
// LAN IP already) or if the bridge can't tell us a LAN IP. Same /net/info the
// HA panel uses to detect "phones can't reach localhost".
export async function controlURLForPhone() {
    const base = controlURL();
    try {
        const host = (location.hostname || "").toLowerCase();
        const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
        if (!isLocal) return base;   // already on a LAN/mdns origin — fine as-is
        const r = await fetch("/net/info", { cache: "no-store" });
        if (!r.ok) return base;
        const info = await r.json();
        // Prefer the bridge's `recommended` (first NON-virtual NIC) — skips
        // VPN/VMware/Hyper-V adapters which a phone can't route to.
        const lanUrl = info.recommended ||
            (Array.isArray(info.urls) ? info.urls.find(u => !!u) : null) ||
            (Array.isArray(info.lanIps) && info.lanIps[0]
                ? `${location.protocol}//${info.lanIps[0]}:${info.port || location.port}/`
                : null);
        if (!lanUrl) return base;
        return lanUrl.replace(/\/+$/, "") + "/phone.html";
    } catch { return base; }
}


// v4210 -- *** THE MODAL WAS SEALED INSIDE initPhoneConnectQR'S CLOSURE, SO ONLY THE ENGINE COULD RAISE IT. ***
// Keith, on server.html's "Phone Mode" button: "what should phone button do on server.html really? i remember,
// show a qr code so the phone can open it." That button did window.open("/phone.html") -- which opens the phone
// UI ON THE PC, the one device that does not need it. The QR is the whole point and it already existed here,
// reachable only from the engine's left rail. Lifted to module scope and exported so server.html raises THE
// SAME modal rather than growing a second copy of it, and controlURLForPhone() is exported with it because the
// localhost -> LAN substitution (v637) is the part that makes the code scannable at all.
let _card = null;
export function closePhoneQR() { if (_card) { _card.remove(); _card = null; } }
export function isPhoneQROpen() { return !!_card; }
export async function showPhoneQR() {
    if (typeof document === "undefined") return null;
    closePhoneQR();
    // v637 -- resolve a LAN-reachable URL FIRST. If the host page is opened via http://localhost:8787/ the raw
    // origin would put "localhost" into the QR, and a phone scanning that resolves it to its OWN loopback.
    const url = await controlURLForPhone();
    const card = _card = document.createElement("div");
        Object.assign(card.style, { position: "fixed", inset: "0", zIndex: "10031", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(4,6,10,0.72)" });
        const inner = document.createElement("div");
        Object.assign(inner.style, { background: "#0e131b", border: "1px solid #2c3a4f", borderRadius: "16px", padding: "22px", textAlign: "center", maxWidth: "320px", boxShadow: "0 12px 50px rgba(0,0,0,.6)", font: "14px system-ui,sans-serif", color: "#cfe0f5" });
        inner.innerHTML =
            '<div style="font-size:15px;font-weight:600;margin-bottom:4px">Scan to control from your phone</div>' +
            '<div style="font-size:11px;color:#7e93ad;margin-bottom:13px">Same Wi-Fi · point your phone camera at the code</div>' +
            '<div id="phone-qr-slot" style="background:#fff;padding:10px;border-radius:10px;display:inline-block;min-width:190px;min-height:190px"></div>' +
            '<div style="margin-top:13px;font-size:12px;word-break:break-all;color:#9fb6e8">' + url + '</div>' +
            '<div style="margin-top:10px;font-size:11px;color:#7e93ad">tap anywhere to close</div>';
        card.appendChild(inner);
        card.addEventListener("click", (e) => { if (e.target === card) { closePhoneQR(); } });
        document.body.appendChild(card);

        try {
            const qrcode = await loadQR();
            const qr = qrcode(0, "M");
            qr.addData(url);
            qr.make();
            const slot = inner.querySelector("#phone-qr-slot");
            slot.innerHTML = qr.createImgTag(5, 8);
            const img = slot.querySelector("img");
            if (img) { img.style.width = "190px"; img.style.height = "190px"; img.style.imageRendering = "pixelated"; img.removeAttribute("width"); img.removeAttribute("height"); }
        } catch (e) {
            const slot = inner.querySelector("#phone-qr-slot");
            if (slot) slot.innerHTML = '<div style="color:#333;font-size:12px;padding:24px 8px">QR couldn\'t render — open the URL above on your phone instead.</div>';
            console.warn("[phoneQR]", e?.message);
        }
    return card;
}
export function togglePhoneQR() { if (_card) { closePhoneQR(); return Promise.resolve(null); } return showPhoneQR(); }

export async function initPhoneConnectQR() {
    if (typeof document === "undefined") return;

    // v703 — replaced the bottom-right floating button with a
    // miniIconStack entry (left rail). Auto-positions; expands on hover
    // to "📱 LINK PHONE"; click toggles the QR modal exactly as before.
    let btn = null;
    const toggle = () => togglePhoneQR();
    try {
        const { mountMiniIcon } = await import("./miniIconStack.js");
        btn = mountMiniIcon({
            id: "phone-qr-btn",
            icon: "📱",
            label: "Link Phone",
            color: "blue",
            title: "Scan a QR to control the engine from your phone",
            onClick: toggle,
            getActive: () => isPhoneQROpen(),   // v4210 -- `card` moved to module scope; reading it here would now throw
        });
    } catch (e) {
        console.warn("[phoneQR] miniIconStack failed; falling back to floating button:", e?.message);
        // Fallback: original bottom-right button if the stack import fails
        const fb = document.createElement("button");
        fb.id = "phone-qr-btn";
        fb.textContent = "📱 Link phone";
        Object.assign(fb.style, {
            position: "fixed", right: "10px", bottom: "10px", zIndex: "10030",
            background: "#173656", color: "#cfe6ff", border: "1px solid #2f628f", borderRadius: "9px",
            padding: "7px 11px", font: "12px system-ui,sans-serif", cursor: "pointer",
        });
        fb.addEventListener("click", toggle);
        document.body.appendChild(fb);
    }
    console.log("[phoneQR] '📱 LINK PHONE' button ready in the left rail — scan-to-connect QR for phone.html");
}

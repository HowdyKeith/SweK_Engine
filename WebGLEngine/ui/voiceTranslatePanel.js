// FILE: ui/voiceTranslatePanel.js
// VERSION: v1 — round 362
//
// Draggable floating panel: pick source + target languages, speak (or
// type) source text, see translation, optionally speak the translation
// aloud. Persists language choices + endpoint in localStorage.

import { makeDraggable } from "./draggable.js";
import {
    SUPPORTED_LANGS, BCP47,
    detectUiLang, translateText,
    hasSpeechRecognition, hasSpeechSynthesis,
    createSpeechRecognizer, speak,
} from "../engine/voiceTranslator.js";

const STORAGE_KEY = "voxelengine.voiceTranslate_v1";

function _readState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    return null;
}

function _writeState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

export function mountVoiceTranslatePanel() {
    if (typeof document === "undefined") return null;
    const persisted = _readState() || {};
    const state = {
        from:     persisted.from     || detectUiLang(),
        to:       persisted.to       || (detectUiLang() === "en" ? "es" : "en"),
        endpoint: persisted.endpoint || "https://libretranslate.com/translate",
        apiKey:   persisted.apiKey   || "",
        autoSpeak: persisted.autoSpeak ?? true,
        lastInput: "",
        lastResult: "",
    };

    const panel = document.createElement("div");
    Object.assign(panel.style, {
        position: "fixed",
        top: "320px",
        right: "20px",
        background: "rgba(8,14,20,0.96)",
        border: "1px solid #6ad",
        borderRadius: "8px",
        padding: "8px 12px 10px 12px",
        color: "#cfd",
        fontFamily: "monospace",
        fontSize: "11px",
        minWidth: "320px",
        maxWidth: "380px",
        zIndex: "8830",
        boxShadow: "0 0 18px rgba(80,180,255,0.18)",
    });

    const recOK = hasSpeechRecognition();
    const synOK = hasSpeechSynthesis();

    const langOpts = SUPPORTED_LANGS.map(([c, n]) => `<option value="${c}">${c} — ${n}</option>`).join("");

    panel.innerHTML = `
        <div style="color:#6cf; font-weight:bold; letter-spacing:1.5px; padding-bottom:6px; border-bottom:1px solid #233; margin-bottom:8px;">🌐 VOICE TRANSLATE</div>
        <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
            <select id="vt-from" style="flex:1; background:#06060c; color:#cfd; border:1px solid #345; padding:3px 6px; font-family:monospace; font-size:10px;">${langOpts}</select>
            <span style="color:#6cf;">→</span>
            <select id="vt-to" style="flex:1; background:#06060c; color:#cfd; border:1px solid #345; padding:3px 6px; font-family:monospace; font-size:10px;">${langOpts}</select>
            <button id="vt-swap" title="swap source ↔ target" style="background:#48c; border:none; color:#fff; padding:3px 8px; border-radius:3px; cursor:pointer; font-family:monospace;">⇄</button>
        </div>
        <textarea id="vt-input" rows="2" placeholder="${recOK ? 'mic or type…' : 'type text to translate…'}" style="width:100%; background:#06060c; color:#cfd; border:1px solid #345; padding:6px; font-family:monospace; font-size:11px; resize:vertical; box-sizing:border-box;"></textarea>
        <div style="display:flex; gap:6px; margin-top:6px; margin-bottom:6px;">
            <button id="vt-mic" ${recOK ? "" : "disabled"} style="background:${recOK ? "#a44" : "#444"}; border:none; color:#fff; padding:5px 10px; border-radius:3px; cursor:${recOK ? "pointer" : "not-allowed"}; font-family:monospace;" title="${recOK ? "click to start recording" : "speech recognition unavailable in this browser"}">🎙 ${recOK ? "rec" : "n/a"}</button>
            <button id="vt-go"  style="background:#4a4; border:none; color:#fff; padding:5px 12px; border-radius:3px; cursor:pointer; font-family:monospace; flex:1;">translate ⏎</button>
            <button id="vt-clear" style="background:#666; border:none; color:#fff; padding:5px 8px; border-radius:3px; cursor:pointer; font-family:monospace;">clear</button>
        </div>
        <div style="color:#9ab; font-size:9px; margin-bottom:3px;">result</div>
        <div id="vt-out" style="background:#040608; color:#cfd; border:1px solid #233; padding:6px 8px; min-height:30px; max-height:80px; overflow-y:auto; font-size:11px; word-wrap:break-word;">—</div>
        <div style="display:flex; gap:6px; margin-top:6px; align-items:center;">
            <button id="vt-speak" ${synOK ? "" : "disabled"} style="background:${synOK ? "#4ca" : "#444"}; border:none; color:#fff; padding:4px 10px; border-radius:3px; cursor:${synOK ? "pointer" : "not-allowed"}; font-family:monospace; font-size:10px;" title="${synOK ? "speak the translation aloud" : "speech synthesis unavailable"}">🔊 speak</button>
            <label style="cursor:pointer; color:#9ab; font-size:10px;"><input type="checkbox" id="vt-auto" ${state.autoSpeak ? "checked" : ""}/> auto-speak</label>
            <button id="vt-cfg" style="margin-left:auto; background:transparent; border:1px solid #345; color:#9ab; padding:2px 6px; border-radius:3px; cursor:pointer; font-family:monospace; font-size:10px;">⚙ endpoint</button>
        </div>
        <div id="vt-status" style="color:#9ab; font-size:9px; margin-top:4px;">${recOK && synOK ? "ready" : recOK ? "speech-out unavailable" : synOK ? "speech-in unavailable" : "no Web Speech API — type-only mode"}</div>
        <div id="vt-cfg-row" style="display:none; margin-top:6px; padding:6px; background:#06060c; border:1px solid #233; border-radius:3px;">
            <div style="color:#9ab; font-size:9px; margin-bottom:3px;">LibreTranslate endpoint</div>
            <input id="vt-endpoint" type="text" style="width:100%; background:#040608; color:#cfd; border:1px solid #345; padding:3px 6px; font-family:monospace; font-size:10px; box-sizing:border-box;" value=""/>
            <div style="color:#9ab; font-size:9px; margin-top:6px; margin-bottom:3px;">API key (optional)</div>
            <input id="vt-apikey" type="password" placeholder="optional, for self-hosted with key" style="width:100%; background:#040608; color:#cfd; border:1px solid #345; padding:3px 6px; font-family:monospace; font-size:10px; box-sizing:border-box;" value=""/>
            <div style="color:#9ab; font-size:9px; margin-top:4px;">Default: public host. Self-host via <code style="color:#6cf;">docker run libretranslate/libretranslate</code> at <code style="color:#6cf;">http://localhost:5000/translate</code>.</div>
        </div>
    `;
    document.body.appendChild(panel);

    const drag = makeDraggable(panel, { label: "VOICE TRANSLATE", storageKey: "voiceTranslatePanel" });
    drag.attach();

    const $ = sel => panel.querySelector(sel);
    $("#vt-from").value = state.from;
    $("#vt-to").value   = state.to;
    $("#vt-endpoint").value = state.endpoint;
    $("#vt-apikey").value   = state.apiKey;

    const setStatus = (text, color = "#9ab") => {
        const el = $("#vt-status");
        el.textContent = text;
        el.style.color = color;
    };

    const _persist = () => {
        state.from     = $("#vt-from").value;
        state.to       = $("#vt-to").value;
        state.endpoint = $("#vt-endpoint").value.trim() || "https://libretranslate.com/translate";
        state.apiKey   = $("#vt-apikey").value.trim();
        state.autoSpeak = $("#vt-auto").checked;
        _writeState(state);
    };

    $("#vt-from").addEventListener("change", _persist);
    $("#vt-to").addEventListener("change", _persist);
    $("#vt-endpoint").addEventListener("change", _persist);
    $("#vt-apikey").addEventListener("change", _persist);
    $("#vt-auto").addEventListener("change", _persist);

    $("#vt-swap").addEventListener("click", () => {
        const a = $("#vt-from").value, b = $("#vt-to").value;
        $("#vt-from").value = b;
        $("#vt-to").value   = a;
        _persist();
    });

    $("#vt-cfg").addEventListener("click", () => {
        const row = $("#vt-cfg-row");
        row.style.display = row.style.display === "none" ? "block" : "none";
    });

    $("#vt-clear").addEventListener("click", () => {
        $("#vt-input").value = "";
        $("#vt-out").textContent = "—";
        setStatus("cleared");
    });

    // Translate flow — used by both the button and the Enter key in the textarea
    const doTranslate = async () => {
        const text = $("#vt-input").value.trim();
        if (!text) { setStatus("nothing to translate", "#fa6"); return; }
        _persist();
        setStatus("translating…", "#fa6");
        $("#vt-out").textContent = "…";
        try {
            const { translation, detectedLang } = await translateText({
                text, from: state.from, to: state.to,
                endpoint: state.endpoint, apiKey: state.apiKey || undefined,
            });
            $("#vt-out").textContent = translation;
            state.lastInput  = text;
            state.lastResult = translation;
            setStatus(`done${detectedLang ? ` · detected ${detectedLang}` : ""}`, "#4c4");
            if ($("#vt-auto").checked && hasSpeechSynthesis()) {
                try { speak({ text: translation, lang: BCP47[state.to] || state.to }); } catch {}
            }
        } catch (e) {
            $("#vt-out").innerHTML = `<span style="color:#f88;">× ${e.message}</span>`;
            setStatus("error", "#f88");
        }
    };
    $("#vt-go").addEventListener("click", doTranslate);
    $("#vt-input").addEventListener("keydown", (e) => {
        if ((e.key === "Enter" && !e.shiftKey)) {
            e.preventDefault();
            doTranslate();
        }
    });

    $("#vt-speak").addEventListener("click", () => {
        const out = $("#vt-out").textContent;
        if (out && out !== "—" && hasSpeechSynthesis()) {
            try { speak({ text: out, lang: BCP47[state.to] || state.to }); } catch {}
        }
    });

    // Mic — start recognition, drop transcript into the input, optionally
    // auto-translate
    let _rec = null;
    $("#vt-mic").addEventListener("click", () => {
        if (!hasSpeechRecognition()) return;
        if (_rec) {
            try { _rec.stop(); } catch {}
            _rec = null;
            $("#vt-mic").style.background = "#a44";
            $("#vt-mic").textContent = "🎙 rec";
            setStatus("stopped");
            return;
        }
        $("#vt-mic").style.background = "#f44";
        $("#vt-mic").textContent = "⏹ stop";
        setStatus("listening…", "#fa6");
        try {
            _rec = createSpeechRecognizer({
                lang: BCP47[state.from] || state.from,
                onResult: (transcript) => {
                    $("#vt-input").value = transcript;
                    _rec = null;
                    $("#vt-mic").style.background = "#a44";
                    $("#vt-mic").textContent = "🎙 rec";
                    setStatus("transcript ready");
                    // Auto-fire translation
                    doTranslate();
                },
                onError: (errCode) => {
                    _rec = null;
                    $("#vt-mic").style.background = "#a44";
                    $("#vt-mic").textContent = "🎙 rec";
                    setStatus(`mic error: ${errCode}`, "#f88");
                },
            });
            _rec.start();
        } catch (e) {
            _rec = null;
            $("#vt-mic").style.background = "#a44";
            $("#vt-mic").textContent = "🎙 rec";
            setStatus(`mic init failed: ${e.message}`, "#f88");
        }
    });

    return {
        element: panel,
        state,
        dispose() {
            drag.detach();
            try { panel.remove(); } catch {}
        },
    };
}

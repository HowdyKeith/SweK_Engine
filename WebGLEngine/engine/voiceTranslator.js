// FILE: engine/voiceTranslator.js
// VERSION: v1 — round 362
//
// Hybrid voice translation: speech recognition + synthesis via the
// browser's Web Speech API (Chrome has both); translation via a
// LibreTranslate HTTP endpoint (default the public host, configurable
// for self-hosted). Translation requests use the `fetch` injected at
// construction time so tests can swap a stub in.
//
// Web Speech API support: Chrome/Edge desktop + Android Chrome (full),
// Safari iOS (synthesis only, no recognition), Firefox (none). The UI
// surfaces support state so users on unsupported browsers fall back to
// manual text input.

const LANGS = [
    ["en",    "English"],
    ["es",    "Spanish"],
    ["fr",    "French"],
    ["de",    "German"],
    ["it",    "Italian"],
    ["pt",    "Portuguese"],
    ["nl",    "Dutch"],
    ["pl",    "Polish"],
    ["ru",    "Russian"],
    ["uk",    "Ukrainian"],
    ["ja",    "Japanese"],
    ["zh",    "Chinese (Mandarin)"],
    ["ko",    "Korean"],
    ["ar",    "Arabic"],
    ["hi",    "Hindi"],
    ["tr",    "Turkish"],
    ["vi",    "Vietnamese"],
];

export const SUPPORTED_LANGS = LANGS;

/** BCP-47 region code defaults for SpeechRecognition + SpeechSynthesis. */
export const BCP47 = {
    en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", it: "it-IT",
    pt: "pt-PT", nl: "nl-NL", pl: "pl-PL", ru: "ru-RU", uk: "uk-UA",
    ja: "ja-JP", zh: "zh-CN", ko: "ko-KR", ar: "ar-SA", hi: "hi-IN",
    tr: "tr-TR", vi: "vi-VN",
};

/** Detect navigator language and clamp it to our list; falls back to "en". */
export function detectUiLang() {
    if (typeof navigator === "undefined" || !navigator.language) return "en";
    const code = navigator.language.toLowerCase().split("-")[0];
    return LANGS.some(([l]) => l === code) ? code : "en";
}

/**
 * Translate text via LibreTranslate. Endpoint defaults to the public
 * libretranslate.com host (no API key needed for short text); pass a
 * custom URL to point at a self-hosted instance.
 *
 * @param {Object} opts
 * @param {string} opts.text      text to translate
 * @param {string} opts.from      source lang code ("en") or "auto"
 * @param {string} opts.to        target lang code ("es")
 * @param {string} [opts.endpoint="https://libretranslate.com/translate"]
 * @param {string} [opts.apiKey]   optional API key for hosts that require one
 * @param {Function} [opts.fetchFn=globalThis.fetch]  override for tests
 * @returns {Promise<{translation: string, detectedLang?: string}>}
 */
export async function translateText({ text, from, to, endpoint, apiKey, fetchFn } = {}) {
    if (typeof text !== "string") throw new Error("voiceTranslator: text must be a string");
    if (!text.trim()) return { translation: "" };
    if (!to)   throw new Error("voiceTranslator: target lang `to` required");
    const url = endpoint || "https://libretranslate.com/translate";
    const _fetch = fetchFn || (typeof fetch !== "undefined" ? fetch : null);
    if (!_fetch) throw new Error("voiceTranslator: no fetch available");
    const body = {
        q: text,
        source: from || "auto",
        target: to,
        format: "text",
    };
    if (apiKey) body.api_key = apiKey;
    const r = await _fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!r.ok) {
        let msg = "";
        try { msg = await r.text(); } catch {}
        throw new Error(`LibreTranslate ${r.status}: ${msg || "request failed"}`);
    }
    const j = await r.json();
    if (typeof j.translatedText !== "string") {
        throw new Error(`LibreTranslate: malformed response (${JSON.stringify(j).slice(0, 80)})`);
    }
    return {
        translation: j.translatedText,
        detectedLang: j.detectedLanguage?.language,
    };
}

/** Whether Web Speech API recognition is usable in the current env. */
export function hasSpeechRecognition() {
    if (typeof window === "undefined") return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/** Whether Web Speech API synthesis is usable in the current env. */
export function hasSpeechSynthesis() {
    if (typeof window === "undefined") return false;
    return !!(window.speechSynthesis && typeof window.SpeechSynthesisUtterance !== "undefined");
}

/**
 * Wrapper around the SpeechRecognition API that normalizes vendor
 * prefixes and event handling.
 *
 * @returns {{ start, stop, abort }} all functions
 */
export function createSpeechRecognizer({ lang, onResult, onError, continuous = false } = {}) {
    if (!hasSpeechRecognition()) {
        throw new Error("voiceTranslator: SpeechRecognition not supported in this browser");
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = lang || BCP47.en;
    rec.continuous = !!continuous;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.addEventListener("result", (e) => {
        const transcript = e.results?.[0]?.[0]?.transcript || "";
        if (typeof onResult === "function") onResult(transcript);
    });
    rec.addEventListener("error", (e) => {
        if (typeof onError === "function") onError(e.error || "speech-error");
    });
    return {
        start: () => rec.start(),
        stop:  () => rec.stop(),
        abort: () => rec.abort(),
        _rec:  rec,
    };
}

/** Speak text via the browser's SpeechSynthesis API. */
export function speak({ text, lang } = {}) {
    if (!hasSpeechSynthesis()) {
        throw new Error("voiceTranslator: SpeechSynthesis not supported in this browser");
    }
    if (!text || !text.trim()) return;
    const u = new window.SpeechSynthesisUtterance(text);
    if (lang) u.lang = lang;
    window.speechSynthesis.speak(u);
    return u;
}

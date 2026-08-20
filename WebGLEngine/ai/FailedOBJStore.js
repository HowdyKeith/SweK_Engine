// ============================================================================
// ai/FailedOBJStore.js
//
// Round 176 — captures C3D outputs that the OBJ parser couldn't turn
// into a renderable mesh. The user wants these to feed back into
// improving the parser: "export all obj mesh files that we got that
// did not work into a folder and then feed them back in to correct
// our parser until we get a better success rate."
//
// What this stores: the raw streamed text from C3D (mostly Python that
// looks like geometry construction), along with the prompt that
// produced it and the model name. That's enough to:
//   1. Inspect what C3D actually produced (catch parser blind spots)
//   2. Replay parsing offline against an evolving parser
//   3. Diff parser improvements ("now N/50 captured failures parse")
//
// Storage strategy:
//   - In-memory list plus localStorage persistence
//   - Hard cap of 50 entries (older entries dropped FIFO) — keeps
//     storage from blowing 5MB budget
//   - Average failed-OBJ text is ~1-3KB, so 50 = ~150KB worst case
//
// Export format: JSONL (one JSON object per line). Each line:
//   { timestamp, model, prompt, rawText, source }
//   - source = "bench" | "roster" | "engine" — tells you whether the
//     failure happened in the bench demo, the roster generator, or
//     the engine's background gpuAssetLoader.
//
// JSONL was chosen over a zip because:
//   - It opens cleanly in any text editor
//   - It streams (line-by-line readable)
//   - It can be eyeball-scanned for patterns
//   - No zip lib needed
// ============================================================================

const LS_KEY     = "voxelengine.failedOBJs";
const MAX_ITEMS  = 50;

class FailedOBJStore {
    constructor() {
        this._items = [];
        this._restore();
    }

    // Capture one failed OBJ. Caller supplies whatever fields it has;
    // we add the timestamp and normalize missing fields.
    capture(item) {
        if (!item) return;
        const entry = {
            timestamp: new Date().toISOString(),
            source:    item.source ?? "unknown",
            model:     item.model  ?? "unknown",
            prompt:    item.prompt ?? "",
            rawText:   typeof item.rawText === "string" ? item.rawText : "",
            // Reason is the parser's diagnostic — "missing v or f directives"
            // is the common one. Useful for grouping failures later.
            reason:    item.reason ?? "parse failed",
        };
        // Skip if there's literally no raw text — those aren't useful
        // for parser work.
        if (entry.rawText.length < 20) return;
        this._items.push(entry);
        while (this._items.length > MAX_ITEMS) this._items.shift();
        this._persist();
    }

    list()      { return this._items.slice(); }
    size()      { return this._items.length; }
    clear()     { this._items = []; try { localStorage.removeItem(LS_KEY); } catch {} }

    // Build a Blob with the captured failures as JSONL — one entry
    // per line. Used by the download button. Callers fetch via
    // URL.createObjectURL().
    asJSONLBlob() {
        if (this._items.length === 0) return null;
        const lines = this._items.map(it => JSON.stringify(it));
        return new Blob([lines.join("\n") + "\n"], { type: "application/x-jsonlines" });
    }

    // Trigger a browser download of all captured failures. Returns
    // true if anything was downloaded, false if nothing to export.
    downloadJSONL(filename = "failed_objs.jsonl") {
        const blob = this.asJSONLBlob();
        if (!blob) return false;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Revoke after a tick — Chrome needs the URL to live through the click
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return true;
    }

    _persist() {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(this._items));
        } catch (e) {
            // Quota? Trim half and retry once.
            this._items = this._items.slice(Math.floor(this._items.length / 2));
            try { localStorage.setItem(LS_KEY, JSON.stringify(this._items)); }
            catch (e2) { console.warn("[FailedOBJStore] persist failed:", e2.message); }
        }
    }
    _restore() {
        try {
            const s = localStorage.getItem(LS_KEY);
            if (!s) return;
            const arr = JSON.parse(s);
            if (Array.isArray(arr)) this._items = arr;
        } catch (e) {
            console.warn("[FailedOBJStore] restore failed:", e.message);
        }
    }
}

export const failedOBJStore = new FailedOBJStore();
export { FailedOBJStore };

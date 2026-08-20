// FILE: ai/DocumentaryDirector.js
// VERSION: v1 - REAL TIME SIMULATION DOCUMENTARY DIRECTOR

export class DocumentaryDirector {

    constructor() {

        this.timeline = [];

        this.currentScript = "";

        this.maxHistory = 300;
    }

    // ------------------------------------------------------------
    // INGEST ALL SCREEN STORIES
    // ------------------------------------------------------------

    ingest(screenOutputs) {

        if (!screenOutputs) return;

        for (const s of screenOutputs) {

            if (!s.story) continue;

            this.timeline.push({
                screenId: s.id,
                text: s.story.text,
                intensity: s.story.intensity,
                t: s.story.timestamp
            });
        }

        if (this.timeline.length > this.maxHistory) {
            this.timeline.shift();
        }
    }

    // ------------------------------------------------------------
    // EDITING PASS (THE "DIRECTOR BRAIN")
    // ------------------------------------------------------------

    compose() {

        if (this.timeline.length === 0) return "";

        // pick most important recent events
        const recent = this.timeline.slice(-20);

        recent.sort((a, b) => b.intensity - a.intensity);

        const top = recent.slice(0, 5);

        let script = "";

        for (const event of top) {

            script += this._format(event) + " ";
        }

        this.currentScript = script.trim();

        return this.currentScript;
    }

    // ------------------------------------------------------------
    // NARRATIVE FORMATTING
    // ------------------------------------------------------------

    _format(event) {

        if (event.intensity > 0.8) {
            return `A major structural shift emerges in sector ${event.screenId}.`;
        }

        if (event.intensity > 0.5) {
            return `Localized evolution stabilizes within region ${event.screenId}.`;
        }

        return `Minor fluctuations pass through system layer ${event.screenId}.`;
    }

    // ------------------------------------------------------------
    // OUTPUT FINAL DOCUMENTARY LINE
    // ------------------------------------------------------------

    getScript() {
        return this.currentScript;
    }
}
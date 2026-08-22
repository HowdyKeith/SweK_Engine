// FILE: simulation/CivilizationEventBus.js
// VERSION: v1 - TYPED CIVILIZATION EVENT PUBLISHER
//
// Civilization activity emits typed events of shape:
//   { type, intensity, x, y, z, civId, t }
// where:
//   type      = "birth" | "expand" | "collapse" | "death"
//   intensity = 0..1
//
// NarrativeEngine and DocumentaryDirector subscribe to interpret events
// into narrative text. The same shape is what the AI scaffold's
// SalienceEngine consumes — so adding salience scoring later is just
// another subscriber.
//
// Bounded history (recentEvents) so HUD/debug can show the last few
// without us holding everything forever.

const HISTORY_CAP = 50;

export class CivilizationEventBus {
    constructor() {
        this.subscribers = [];
        this.recentEvents = [];
        this.totalEmitted = 0;
    }

    subscribe(fn) {
        this.subscribers.push(fn);
    }

    publish(event) {
        if (!event || !event.type) return;
        if (event.t == null) event.t = performance.now();

        this.recentEvents.push(event);
        if (this.recentEvents.length > HISTORY_CAP) this.recentEvents.shift();
        this.totalEmitted++;

        for (const fn of this.subscribers) {
            try { fn(event); }
            catch (e) { console.warn("[CivEventBus] subscriber error:", e); }
        }
    }

    last() {
        return this.recentEvents[this.recentEvents.length - 1] || null;
    }
}

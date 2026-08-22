// FILE: ai/AIAgentMemory.js
// VERSION: v1 - PERSISTENT AGENT MEMORY

export class AIAgentMemory {

    constructor() {

        this.data = {

            shortTerm: [],
            longTerm: {},

            lastSeenTick: 0,
            position: null,

            goals: []
        };
    }

    // ------------------------------------------------------------
    // STORE OBSERVATIONS
    // ------------------------------------------------------------

    observe(snapshot) {

        this.data.lastSeenTick = snapshot.time;

        this.data.position = snapshot.camera;

        this.data.shortTerm.push({
            t: snapshot.time,
            chunks: snapshot.visibleChunks
        });

        if (this.data.shortTerm.length > 50) {
            this.data.shortTerm.shift();
        }
    }

    // ------------------------------------------------------------
    // GOAL SYSTEM
    // ------------------------------------------------------------

    addGoal(goal) {

        this.data.goals.push(goal);
    }

    getGoals() {

        return this.data.goals;
    }

    // ------------------------------------------------------------
    // SIMPLE MEMORY QUERY
    // ------------------------------------------------------------

    get(key) {

        return this.data[key];
    }

    set(key, value) {

        this.data[key] = value;
    }
}
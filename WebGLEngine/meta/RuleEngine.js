// FILE: meta/RuleEngine.js
// VERSION: v1 - SELF-MODIFYING SIMULATION RULE ENGINE

export class RuleEngine {

    constructor() {

        this.rules = new Map();

        this.history = [];
    }

    // ------------------------------------------------------------
    // REGISTER RULE
    // ------------------------------------------------------------

    addRule(id, fn, metadata = {}) {

        this.rules.set(id, {
            fn,
            metadata,
            strength: 1.0,
            usage: 0
        });
    }

    // ------------------------------------------------------------
    // EXECUTE RULES
    // ------------------------------------------------------------

    run(context) {

        const outputs = [];

        for (const [id, rule] of this.rules) {

            const result = rule.fn(context);

            rule.usage++;

            if (result) {
                outputs.push(result);
            }
        }

        return outputs;
    }

    // ------------------------------------------------------------
    // MUTATE RULE SYSTEM (KEY FEATURE)
    // ------------------------------------------------------------

    evolve() {

        for (const [id, rule] of this.rules) {

            // decay unused rules
            if (rule.usage < 5) {
                rule.strength *= 0.98;
            }

            // amplify useful rules
            else {
                rule.strength *= 1.01;
            }

            // prune dead rules
            if (rule.strength < 0.1) {
                this.rules.delete(id);
            }
        }
    }

    // ------------------------------------------------------------
    // CLONE + MUTATE RULE
    // ------------------------------------------------------------

    mutate(id, mutationFn) {

        const base = this.rules.get(id);

        if (!base) return;

        const newId = id + "_m" + Math.floor(Math.random() * 10000);

        this.addRule(newId, (ctx) => {

            const modified = mutationFn(base.fn, ctx);

            return modified(ctx);
        });
    }
}
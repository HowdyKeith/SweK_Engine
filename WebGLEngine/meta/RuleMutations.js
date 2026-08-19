// FILE: meta/RuleMutations.js
// VERSION: v1 - RULE MUTATION STRATEGIES

export const RuleMutations = {

    // --------------------------------------------------------
    // STABILITY MUTATION (smoothed behavior)
    // --------------------------------------------------------

    smooth(fn) {

        return (ctx) => {

            const result = fn(ctx);

            if (!result) return null;

            if (result.strength) {
                result.strength *= 0.9;
            }

            return result;
        };
    },

    // --------------------------------------------------------
    // CHAOS MUTATION (inject randomness)
    // --------------------------------------------------------

    chaotic(fn) {

        return (ctx) => {

            const result = fn(ctx);

            if (!result) return null;

            if (Math.random() < 0.1) {
                result.noise = Math.random();
            }

            return result;
        };
    },

    // --------------------------------------------------------
    // EXPANSION MUTATION (bias growth)
    // --------------------------------------------------------

    expand(fn) {

        return (ctx) => {

            const result = fn(ctx);

            if (!result) return null;

            result.radius = (result.radius || 1) * 1.1;

            return result;
        };
    }
};
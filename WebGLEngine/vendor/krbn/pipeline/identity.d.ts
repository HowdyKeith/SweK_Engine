import type { Feature } from "./types.js";
/** Fill in missing `Feature.id`s deterministically (in place; returns the same
 *  array for chaining). Counters reset per call — call it once per source per
 *  frame, immediately after `extractFeatures`. */
export declare function assignDefaultFeatureIds(features: Feature[]): Feature[];
//# sourceMappingURL=identity.d.ts.map
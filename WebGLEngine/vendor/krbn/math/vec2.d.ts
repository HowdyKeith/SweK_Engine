import type { Vec2 } from "./types.js";
export declare const vec2: (x: number, y: number) => Vec2;
export declare function add2(a: Vec2, b: Vec2): Vec2;
export declare function sub2(a: Vec2, b: Vec2): Vec2;
export declare function scale2(a: Vec2, s: number): Vec2;
export declare function dot2(a: Vec2, b: Vec2): number;
/** 2D scalar cross (z of the 3D cross) — sign gives orientation. */
export declare function cross2(a: Vec2, b: Vec2): number;
export declare function length2(a: Vec2): number;
export declare function distance2(a: Vec2, b: Vec2): number;
export declare function normalize2(a: Vec2): Vec2;
export declare function approxEqual2(a: Vec2, b: Vec2, eps: number): boolean;
//# sourceMappingURL=vec2.d.ts.map
"use strict";
/**
 * THE FROZEN PRICING OF THE DISC LADDER (v4377), so a threshold can be derived without a GPU.
 *
 * Measured by tools/ship/shippedLadder-selfcheck.mjs's own method: one instance of render/gpuDriven.mjs discMesh at
 * radius 0.5, rendered through gfx/device.js on BOTH BACKENDS at ten distances and four frame widths, every rung under
 * ONE COLOUR so only the geometry can differ. `changed` is the pixels that rung moves against rung 0 (a 32-gon);
 * `covered` is what rung 0 itself covers; `metric` is the angular size the cull reads, radius over distance.
 *
 * WHAT IT IS AND IS NOT. It is a measurement of THIS ladder, on THIS rasteriser (SwiftShader in the sandbox), at
 * these three widths. It is not a claim about a rig's GPU, and render/lodBudget.mjs derives from it rather than
 * asserting from it, so a re-freeze changes the thresholds and nothing else. Rewritten by tools/ship/freezeLod.mjs.
 */
export const LOD_RECORD = Object.freeze({
 "at": "v4378",
 "segments": [
  32,
  10,
  5
 ],
 "distances": [
  3,
  4,
  6,
  9,
  14,
  22,
  36,
  60,
  95,
  150
 ],
 "widths": [
  128,
  256,
  512,
  1024
 ],
 "backends": [
  "webgpu",
  "webgl2"
 ],
 "radius": 0.5,
 "byBackend": {
  "webgpu": {
   "128": [
    {
     "rung": 1,
     "samples": [
      {
       "metric": 0.16666666666666666,
       "changed": 346,
       "covered": 1060
      },
      {
       "metric": 0.125,
       "changed": 343,
       "covered": 608
      },
      {
       "metric": 0.08333333333333333,
       "changed": 103,
       "covered": 268
      },
      {
       "metric": 0.05555555555555555,
       "changed": 51,
       "covered": 120
      },
      {
       "metric": 0.03571428571428571,
       "changed": 11,
       "covered": 52
      },
      {
       "metric": 0.022727272727272728,
       "changed": 5,
       "covered": 19
      },
      {
       "metric": 0.013888888888888888,
       "changed": 1,
       "covered": 4
      },
      {
       "metric": 0.008333333333333333,
       "changed": 2,
       "covered": 4
      },
      {
       "metric": 0.005263157894736842,
       "changed": 0,
       "covered": 0
      },
      {
       "metric": 0.0033333333333333335,
       "changed": 0,
       "covered": 0
      }
     ]
    },
    {
     "rung": 2,
     "samples": [
      {
       "metric": 0.16666666666666666,
       "changed": 534,
       "covered": 1060
      },
      {
       "metric": 0.125,
       "changed": 296,
       "covered": 608
      },
      {
       "metric": 0.08333333333333333,
       "changed": 139,
       "covered": 268
      },
      {
       "metric": 0.05555555555555555,
       "changed": 74,
       "covered": 120
      },
      {
       "metric": 0.03571428571428571,
       "changed": 20,
       "covered": 52
      },
      {
       "metric": 0.022727272727272728,
       "changed": 9,
       "covered": 19
      },
      {
       "metric": 0.013888888888888888,
       "changed": 0,
       "covered": 4
      },
      {
       "metric": 0.008333333333333333,
       "changed": 3,
       "covered": 4
      },
      {
       "metric": 0.005263157894736842,
       "changed": 0,
       "covered": 0
      },
      {
       "metric": 0.0033333333333333335,
       "changed": 0,
       "covered": 0
      }
     ]
    }
   ],
   "256": [
    {
     "rung": 1,
     "samples": [
      {
       "metric": 0.16666666666666666,
       "changed": 1423,
       "covered": 4264
      },
      {
       "metric": 0.125,
       "changed": 1283,
       "covered": 2408
      },
      {
       "metric": 0.08333333333333333,
       "changed": 346,
       "covered": 1060
      },
      {
       "metric": 0.05555555555555555,
       "changed": 147,
       "covered": 468
      },
      {
       "metric": 0.03571428571428571,
       "changed": 65,
       "covered": 192
      },
      {
       "metric": 0.022727272727272728,
       "changed": 27,
       "covered": 80
      },
      {
       "metric": 0.013888888888888888,
       "changed": 8,
       "covered": 32
      },
      {
       "metric": 0.008333333333333333,
       "changed": 6,
       "covered": 12
      },
      {
       "metric": 0.005263157894736842,
       "changed": 2,
       "covered": 4
      },
      {
       "metric": 0.0033333333333333335,
       "changed": 3,
       "covered": 2
      }
     ]
    },
    {
     "rung": 2,
     "samples": [
      {
       "metric": 0.16666666666666666,
       "changed": 1911,
       "covered": 4264
      },
      {
       "metric": 0.125,
       "changed": 1473,
       "covered": 2408
      },
      {
       "metric": 0.08333333333333333,
       "changed": 534,
       "covered": 1060
      },
      {
       "metric": 0.05555555555555555,
       "changed": 207,
       "covered": 468
      },
      {
       "metric": 0.03571428571428571,
       "changed": 88,
       "covered": 192
      },
      {
       "metric": 0.022727272727272728,
       "changed": 44,
       "covered": 80
      },
      {
       "metric": 0.013888888888888888,
       "changed": 19,
       "covered": 32
      },
      {
       "metric": 0.008333333333333333,
       "changed": 8,
       "covered": 12
      },
      {
       "metric": 0.005263157894736842,
       "changed": 3,
       "covered": 4
      },
      {
       "metric": 0.0033333333333333335,
       "changed": 2,
       "covered": 2
      }
     ]
    }
   ],
   "512": [
    {
     "rung": 1,
     "samples": [
      {
       "metric": 0.16666666666666666,
       "changed": 4536,
       "covered": 17048
      },
      {
       "metric": 0.125,
       "changed": 3485,
       "covered": 9580
      },
      {
       "metric": 0.08333333333333333,
       "changed": 1423,
       "covered": 4264
      },
      {
       "metric": 0.05555555555555555,
       "changed": 698,
       "covered": 1892
      },
      {
       "metric": 0.03571428571428571,
       "changed": 331,
       "covered": 788
      },
      {
       "metric": 0.022727272727272728,
       "changed": 148,
       "covered": 316
      },
      {
       "metric": 0.013888888888888888,
       "changed": 51,
       "covered": 120
      },
      {
       "metric": 0.008333333333333333,
       "changed": 16,
       "covered": 44
      },
      {
       "metric": 0.005263157894736842,
       "changed": 6,
       "covered": 16
      },
      {
       "metric": 0.0033333333333333335,
       "changed": 3,
       "covered": 4
      }
     ]
    },
    {
     "rung": 2,
     "samples": [
      {
       "metric": 0.16666666666666666,
       "changed": 6499,
       "covered": 17048
      },
      {
       "metric": 0.125,
       "changed": 3587,
       "covered": 9580
      },
      {
       "metric": 0.08333333333333333,
       "changed": 1911,
       "covered": 4264
      },
      {
       "metric": 0.05555555555555555,
       "changed": 794,
       "covered": 1892
      },
      {
       "metric": 0.03571428571428571,
       "changed": 378,
       "covered": 788
      },
      {
       "metric": 0.022727272727272728,
       "changed": 203,
       "covered": 316
      },
      {
       "metric": 0.013888888888888888,
       "changed": 74,
       "covered": 120
      },
      {
       "metric": 0.008333333333333333,
       "changed": 24,
       "covered": 44
      },
      {
       "metric": 0.005263157894736842,
       "changed": 11,
       "covered": 16
      },
      {
       "metric": 0.0033333333333333335,
       "changed": 3,
       "covered": 4
      }
     ]
    }
   ],
   "1024": [
    {
     "rung": 1,
     "samples": [
      {
       "metric": 0.16666666666666666,
       "changed": 26297,
       "covered": 68178
      },
      {
       "metric": 0.125,
       "changed": 18692,
       "covered": 38368
      },
      {
       "metric": 0.08333333333333333,
       "changed": 4536,
       "covered": 17048
      },
      {
       "metric": 0.05555555555555555,
       "changed": 2517,
       "covered": 7580
      },
      {
       "metric": 0.03571428571428571,
       "changed": 894,
       "covered": 3128
      },
      {
       "metric": 0.022727272727272728,
       "changed": 559,
       "covered": 1272
      },
      {
       "metric": 0.013888888888888888,
       "changed": 147,
       "covered": 468
      },
      {
       "metric": 0.008333333333333333,
       "changed": 52,
       "covered": 164
      },
      {
       "metric": 0.005263157894736842,
       "changed": 44,
       "covered": 68
      },
      {
       "metric": 0.0033333333333333335,
       "changed": 18,
       "covered": 32
      }
     ]
    },
    {
     "rung": 2,
     "samples": [
      {
       "metric": 0.16666666666666666,
       "changed": 34474,
       "covered": 68178
      },
      {
       "metric": 0.125,
       "changed": 22503,
       "covered": 38368
      },
      {
       "metric": 0.08333333333333333,
       "changed": 6499,
       "covered": 17048
      },
      {
       "metric": 0.05555555555555555,
       "changed": 3517,
       "covered": 7580
      },
      {
       "metric": 0.03571428571428571,
       "changed": 1359,
       "covered": 3128
      },
      {
       "metric": 0.022727272727272728,
       "changed": 589,
       "covered": 1272
      },
      {
       "metric": 0.013888888888888888,
       "changed": 207,
       "covered": 468
      },
      {
       "metric": 0.008333333333333333,
       "changed": 81,
       "covered": 164
      },
      {
       "metric": 0.005263157894736842,
       "changed": 49,
       "covered": 68
      },
      {
       "metric": 0.0033333333333333335,
       "changed": 24,
       "covered": 32
      }
     ]
    }
   ]
  },
  "webgl2": {
   "128": [
    {
     "rung": 1,
     "samples": [
      {
       "metric": 0.16666666666666666,
       "changed": 333,
       "covered": 1060
      },
      {
       "metric": 0.125,
       "changed": 382,
       "covered": 608
      },
      {
       "metric": 0.08333333333333333,
       "changed": 102,
       "covered": 268
      },
      {
       "metric": 0.05555555555555555,
       "changed": 54,
       "covered": 120
      },
      {
       "metric": 0.03571428571428571,
       "changed": 11,
       "covered": 52
      },
      {
       "metric": 0.022727272727272728,
       "changed": 5,
       "covered": 19
      },
      {
       "metric": 0.013888888888888888,
       "changed": 1,
       "covered": 4
      },
      {
       "metric": 0.008333333333333333,
       "changed": 2,
       "covered": 4
      },
      {
       "metric": 0.005263157894736842,
       "changed": 0,
       "covered": 0
      },
      {
       "metric": 0.0033333333333333335,
       "changed": 0,
       "covered": 0
      }
     ]
    },
    {
     "rung": 2,
     "samples": [
      {
       "metric": 0.16666666666666666,
       "changed": 617,
       "covered": 1060
      },
      {
       "metric": 0.125,
       "changed": 305,
       "covered": 608
      },
      {
       "metric": 0.08333333333333333,
       "changed": 137,
       "covered": 268
      },
      {
       "metric": 0.05555555555555555,
       "changed": 77,
       "covered": 120
      },
      {
       "metric": 0.03571428571428571,
       "changed": 19,
       "covered": 52
      },
      {
       "metric": 0.022727272727272728,
       "changed": 9,
       "covered": 19
      },
      {
       "metric": 0.013888888888888888,
       "changed": 0,
       "covered": 4
      },
      {
       "metric": 0.008333333333333333,
       "changed": 3,
       "covered": 4
      },
      {
       "metric": 0.005263157894736842,
       "changed": 0,
       "covered": 0
      },
      {
       "metric": 0.0033333333333333335,
       "changed": 0,
       "covered": 0
      }
     ]
    }
   ],
   "256": [
    {
     "rung": 1,
     "samples": [
      {
       "metric": 0.16666666666666666,
       "changed": 1676,
       "covered": 4264
      },
      {
       "metric": 0.125,
       "changed": 1349,
       "covered": 2408
      },
      {
       "metric": 0.08333333333333333,
       "changed": 333,
       "covered": 1060
      },
      {
       "metric": 0.05555555555555555,
       "changed": 167,
       "covered": 468
      },
      {
       "metric": 0.03571428571428571,
       "changed": 68,
       "covered": 192
      },
      {
       "metric": 0.022727272727272728,
       "changed": 29,
       "covered": 80
      },
      {
       "metric": 0.013888888888888888,
       "changed": 8,
       "covered": 32
      },
      {
       "metric": 0.008333333333333333,
       "changed": 6,
       "covered": 12
      },
      {
       "metric": 0.005263157894736842,
       "changed": 2,
       "covered": 4
      },
      {
       "metric": 0.0033333333333333335,
       "changed": 3,
       "covered": 2
      }
     ]
    },
    {
     "rung": 2,
     "samples": [
      {
       "metric": 0.16666666666666666,
       "changed": 1911,
       "covered": 4264
      },
      {
       "metric": 0.125,
       "changed": 1478,
       "covered": 2408
      },
      {
       "metric": 0.08333333333333333,
       "changed": 617,
       "covered": 1060
      },
      {
       "metric": 0.05555555555555555,
       "changed": 216,
       "covered": 468
      },
      {
       "metric": 0.03571428571428571,
       "changed": 88,
       "covered": 192
      },
      {
       "metric": 0.022727272727272728,
       "changed": 41,
       "covered": 80
      },
      {
       "metric": 0.013888888888888888,
       "changed": 22,
       "covered": 32
      },
      {
       "metric": 0.008333333333333333,
       "changed": 7,
       "covered": 12
      },
      {
       "metric": 0.005263157894736842,
       "changed": 3,
       "covered": 4
      },
      {
       "metric": 0.0033333333333333335,
       "changed": 2,
       "covered": 2
      }
     ]
    }
   ],
   "512": [
    {
     "rung": 1,
     "samples": [
      {
       "metric": 0.16666666666666666,
       "changed": 4505,
       "covered": 17048
      },
      {
       "metric": 0.125,
       "changed": 4181,
       "covered": 9580
      },
      {
       "metric": 0.08333333333333333,
       "changed": 1676,
       "covered": 4264
      },
      {
       "metric": 0.05555555555555555,
       "changed": 767,
       "covered": 1892
      },
      {
       "metric": 0.03571428571428571,
       "changed": 378,
       "covered": 788
      },
      {
       "metric": 0.022727272727272728,
       "changed": 148,
       "covered": 316
      },
      {
       "metric": 0.013888888888888888,
       "changed": 54,
       "covered": 120
      },
      {
       "metric": 0.008333333333333333,
       "changed": 17,
       "covered": 44
      },
      {
       "metric": 0.005263157894736842,
       "changed": 6,
       "covered": 16
      },
      {
       "metric": 0.0033333333333333335,
       "changed": 3,
       "covered": 4
      }
     ]
    },
    {
     "rung": 2,
     "samples": [
      {
       "metric": 0.16666666666666666,
       "changed": 6479,
       "covered": 17048
      },
      {
       "metric": 0.125,
       "changed": 3587,
       "covered": 9580
      },
      {
       "metric": 0.08333333333333333,
       "changed": 1911,
       "covered": 4264
      },
      {
       "metric": 0.05555555555555555,
       "changed": 784,
       "covered": 1892
      },
      {
       "metric": 0.03571428571428571,
       "changed": 390,
       "covered": 788
      },
      {
       "metric": 0.022727272727272728,
       "changed": 200,
       "covered": 316
      },
      {
       "metric": 0.013888888888888888,
       "changed": 77,
       "covered": 120
      },
      {
       "metric": 0.008333333333333333,
       "changed": 23,
       "covered": 44
      },
      {
       "metric": 0.005263157894736842,
       "changed": 9,
       "covered": 16
      },
      {
       "metric": 0.0033333333333333335,
       "changed": 3,
       "covered": 4
      }
     ]
    }
   ],
   "1024": [
    {
     "rung": 1,
     "samples": [
      {
       "metric": 0.16666666666666666,
       "changed": 28215,
       "covered": 68178
      },
      {
       "metric": 0.125,
       "changed": 20128,
       "covered": 38368
      },
      {
       "metric": 0.08333333333333333,
       "changed": 4505,
       "covered": 17048
      },
      {
       "metric": 0.05555555555555555,
       "changed": 2200,
       "covered": 7580
      },
      {
       "metric": 0.03571428571428571,
       "changed": 907,
       "covered": 3128
      },
      {
       "metric": 0.022727272727272728,
       "changed": 587,
       "covered": 1272
      },
      {
       "metric": 0.013888888888888888,
       "changed": 167,
       "covered": 468
      },
      {
       "metric": 0.008333333333333333,
       "changed": 62,
       "covered": 164
      },
      {
       "metric": 0.005263157894736842,
       "changed": 44,
       "covered": 68
      },
      {
       "metric": 0.0033333333333333335,
       "changed": 19,
       "covered": 32
      }
     ]
    },
    {
     "rung": 2,
     "samples": [
      {
       "metric": 0.16666666666666666,
       "changed": 37964,
       "covered": 68178
      },
      {
       "metric": 0.125,
       "changed": 24698,
       "covered": 38368
      },
      {
       "metric": 0.08333333333333333,
       "changed": 6479,
       "covered": 17048
      },
      {
       "metric": 0.05555555555555555,
       "changed": 3474,
       "covered": 7580
      },
      {
       "metric": 0.03571428571428571,
       "changed": 1398,
       "covered": 3128
      },
      {
       "metric": 0.022727272727272728,
       "changed": 617,
       "covered": 1272
      },
      {
       "metric": 0.013888888888888888,
       "changed": 216,
       "covered": 468
      },
      {
       "metric": 0.008333333333333333,
       "changed": 82,
       "covered": 164
      },
      {
       "metric": 0.005263157894736842,
       "changed": 48,
       "covered": 68
      },
      {
       "metric": 0.0033333333333333335,
       "changed": 21,
       "covered": 32
      }
     ]
    }
   ]
  }
 }
});

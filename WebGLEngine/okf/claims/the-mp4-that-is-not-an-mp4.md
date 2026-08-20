---
type: claim
title: The mp4 that is not an mp4
description: "Keith: can the blobulator record itself at all? captureStream + MediaRecorder, gated, AND AN HONEST ANSWER ABOUT WHAT COMES OUT THE OTHER END. Goal: the blob composes a video messa"
tags: [settled, "swek-engine", v2588]
timestamp: v2588
---

# The mp4 that is not an mp4

- **Status:** settled  
- **Since:** v2588

## Prediction

Keith: can the blobulator record itself at all? captureStream + MediaRecorder, gated, AND AN HONEST ANSWER ABOUT WHAT COMES OUT THE OTHER END. Goal: the blob composes a video message, SweK serves it on the LAN, Home Assistant's media_player.play_media points a Roku or Shield at the URL. P2P by construction -- no cloud, no cast protocol.

## Why

I WAS ABOUT TO LABEL THIS RIG-ONLY BECAUSE 'THE SANDBOX HAS NO BROWSER'. IT HAS TWO: Playwright's headless shell at /opt/pw-browsers/chromium_headless_shell-1194/ and a full Puppeteer Chrome at ~/.cache/puppeteer/. FIFTH EXPIRED BLOCKER THIS SESSION (v2560 emsdk, v2570 box3d.wasm, v2576 real terrain, v2582 'brain.js is Deno-only'). A REASON THAT EXPIRED IS A HABIT -- and this one would have cost the ENTIRE FINDING, because every number below came out of a browser I had already decided was not there.

## Measured

YES IT CAN RECORD, AND WHAT COMES OUT IS A YES THAT LIES. Real headless Chromium: canvas.captureStream TRUE, MediaRecorder TRUE. isTypeSupported -- video/webm YES, vp8 YES, vp9 YES, webm+h264 no, VIDEO/MP4 **YES**, video/mp4;codecs=avc1.42E01E **no**. Recording 30 frames of a moving canvas for real: vp8 5308 bytes magic 1a 45 df a3 (EBML, a genuine WebM); vp9 16820 bytes (genuine WebM); video/mp4 18183 bytes magic 'ftypisom' -- A GENUINE MP4 CONTAINER, correct ISO brand ('ftypisom'...'isomiso6'), correct boxes. THEN SNIFF INSIDE IT: avc1 ABSENT. vp09 FOUND AT BYTE 28. THE MP4 CONTAINS VP9, NOT H.264. A Roku will fetch a file called .mp4, open a container it understands, find a codec it does not, and show black -- WHILE isTypeSupported('video/mp4') SAID YES THE ENTIRE TIME. The extension lies, the container is correct, and the picture is black. A FLAG THAT LIES IS WORSE THAN NO FLAG.

## Kill condition

A browser that offers video/mp4;codecs=avc1 -- Safari records H.264/MP4 natively, and probeRecording returns tvSafe there, which is gated so the module is not merely pessimism (A CHECK THAT ONLY EVER SAYS NO CANNOT FAIL, WHICH MAKES IT DECORATION). THE ROAD THAT WORKS: record WebM/VP9 (honest about what it holds), TRANSCODE TO H.264 ON GALAXINA (ffmpeg -i in.webm -c:v libx264 out.mp4), THEN serve it. THE BROWSER CANNOT DO THIS PART. Then media_player.play_media at SweK's LAN URL. NOTE THE ASYMMETRY THAT WILL BITE: Shield speaks Google Cast natively, ROKU DOES NOT. And RTSP is PULL, not push -- VLC pulls happily, pushing means RTSP ANNOUNCE, and Roku does not speak it at all.

# Citations

- Code: render/blobRecorder.js + render/blobRecorder-selfcheck.mjs (11 checks, gated, 5/5 runs, sabotage-tested: claim mp4 plays on a TV regardless of codec -> 1 check fails). THE GATE DRIVES A REAL CHROMIUM and sniffs the boxes of a file IT JUST RECORDED -- not a claim about browsers, A BROWSER SAID SO. If no browser is present it SKIPS WITH A REASON rather than passing quietly, because A CHECK THAT PASSES WHEN IT DID NOT RUN IS DECORATION. Also recorded, because it cost twenty minutes: a canvas that does not change EMITS NO FRAMES -- captureStream is driven by paints, not by the clock, so a recorder returning 0 bytes on a still blob is not broken, it is being told nothing happened.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.

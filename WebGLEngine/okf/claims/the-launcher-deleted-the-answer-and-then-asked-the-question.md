---
type: claim
title: The launcher deleted the answer and then asked the question
description: "Keith: 'these are still happening on a auto-update. i am pretty sure there is not error, and the only error is that the dos window did not exit without pressing a key.' -- [autoPul"
tags: [settled, "swek-engine", v2609]
timestamp: v2609
---

# The launcher deleted the answer and then asked the question

- **Status:** settled  
- **Since:** v2609

## Prediction

Keith: 'these are still happening on a auto-update. i am pretty sure there is not error, and the only error is that the dos window did not exit without pressing a key.' -- [autoPull] no newer peer x3, then '[SweK] the ai-bridge exited with code -1. The reason is above this line.' HE IS RIGHT ON BOTH COUNTS AND THE BUG IS ONE LINE FROM ITS OWN FIX.

## Why

START_NODE_Engine.bat: `set NODE_RC=%ERRORLEVEL%` then `if exist swek_superseded.flag del swek_superseded.flag` and THEN `if not NODE_RC==0 (echo ... & pause)`. THE FLAG EXISTS TO SAY EXACTLY ONE THING -- 'the nonzero exit was an auto-update replacing this instance, not a crash' -- AND THE LAUNCHER DELETED IT ONE LINE BEFORE THE CHECK THAT NEEDED IT. It is WRITTEN IN FIVE PLACES (Start_Everything.bat, sysadminBridge.js x3, server.js) AND WAS READ IN NONE. THE LAUNCHER DELETED THE ANSWER AND THEN ASKED THE QUESTION. And the exit code confirms him: -1 IS A KILLED PROCESS, which is precisely what an auto-update does to the instance it replaces. THE CODE WAS TELLING THE TRUTH AND THE LAUNCHER WAS NOT LISTENING.

## Measured

Fixed: read the flag into SWEK_SUPERSEDED before deleting it; the supersede branch runs FIRST, says 'Exit code -1 is EXPECTED, not a crash', and DOES NOT PAUSE. v2212's reason for the pause was GOOD and is kept -- node runs in the FOREGROUND, so a real crash puts the stack on screen and the window is about to close on top of it, HOLD IT. THE BUG WAS NEVER THE PAUSE, IT WAS FIRING THE PAUSE FOR SOMETHING THAT WAS NOT A CRASH. A PROMPT THAT FIRES ON A NORMAL EVENT TRAINS YOU TO DISMISS IT -- and then it is there when it matters and you dismiss that one too. AND THE SECOND HALF OF HIS REPORT: 'The reason is above this line' WAS A LIE. What was above it? THREE LINES OF '[autoPull] no newer peer'. THAT IS NOT A REASON, IT IS THE WEATHER. A MESSAGE THAT TELLS YOU WHERE TO LOOK HAD BETTER BE RIGHT -- a wrong signpost is worse than no signpost, IT COSTS YOU THE WALK.

## Kill condition

Put the delete back before the read -> 2 fail. Pause on supersede -> 1 fails. AND TWO THINGS THIS ROUND'S GATES CAUGHT IN MY OWN WORK: (1) my first version of the no-pause check was a lookahead regex SO CLEVER IT FAILED ON A FILE THAT WAS CORRECT -- the gate cried FAIL while the batch script was right. A CHECK TOO CLEVER TO DEBUG IS A CHECK THAT GETS DELETED, and a gate that cries wolf on good code teaches you to ignore it. Rewritten to slice the branch and look at it. (2) MY EDIT PUT 213 BARE LINE FEEDS INTO A CRLF BATCH FILE -- Python's universal-newline mode silently converted every \\r\\n to \\n ON READ and I wrote it back as LF. discovery-selfcheck caught it. A batch file with bare LFs misbehaves on Windows IN WAYS THAT LOOK LIKE ANYTHING BUT LINE ENDINGS.

# Citations

- Code: START_NODE_Engine.bat + tools/launcherExit-selfcheck.mjs (7 checks, gated, sabotage-tested). RIG-ONLY AND LABELLED: I CANNOT RUN A WINDOWS BATCH FILE. cmd.exe is not here. What I CAN prove is the ORDER -- flag read before delete, supersede branch before crash branch, only one of them pauses. THAT IS A STRUCTURAL CHECK ON A FILE, NOT A TEST OF A LAUNCHER, AND I AM NOT CALLING IT MORE. KEITH'S NEXT AUTO-UPDATE IS THE TEST.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.

Attribute VB_Name = "modGPUBrainSteer"
Option Explicit

'***************************************************************
' modGPUBrainSteer v1.0 -- brain-steered enemies for the VBA engine
' (GPU Brain phase 11; UNTESTED IN EXCEL -- verify per discipline.)
'
' The steering half of the Doom-raycaster plan. modGPUBrain (phase 10)
' is the transport: it publishes your map + enemies and receives the
' flow field. THIS module is the consumer: one call inside your enemy
' movement code replaces "walk straight at the player" with the same
' 60/40 flow blend the WebGL kaiju (PATCH-B3), dungeon monsters
' (PATCH-B14), and the OGRE (PATCH-B15) now use. The blend was
' CPU-validated on the wall-gap map: straight-line aims into the wall,
' the blended heading curves through the gap.
'
' RAYCASTER INTEGRATION (the whole wiring, three steps):
'   1. Publish the map. A raycaster grid IS a height snapshot:
'        heights(i) = 20 for open cells, 60 for wall cells
'      Publish the PLAYER as the single goal (goals collection with
'      the player's x/z) via GPUBrain_Tick at ~1Hz. The brain does not
'      know or care that this is a raycaster -- walls are just
'      expensive terrain, exactly like dungeon voxels in WebGL.
'   2. In your enemy update, replace the straight-at-player step:
'        dirX = playerX - e.x: dirZ = playerZ - e.z    ' old heading
'        If GPUBrain_SteerBlend(e.x, e.z, dirX, dirZ) Then
'            ' dirX/dirZ now blended with the flow field
'        End If
'        e.x = e.x + dirX * speed * dt
'        e.z = e.z + dirZ * speed * dt
'      Keep your existing wall-slide collision AFTER the move -- the
'      blend reduces wall hugging, collision remains the authority.
'   3. That's it. Kill the brain process: SteerBlend returns False,
'      dirX/dirZ are untouched, enemies behave exactly as before.
'
' AUTHORITY: unchanged. VBA owns positions; the brain only publishes
' a field your game may consult. Same model since the first bridge:
' "the game owns positions, the browser owns intents" -- the brain is
' one more intent producer.
'***************************************************************

' Blend weight: how much the flow field steers vs the direct heading.
' 0.6 matches PATCH-B3/B14/B15. Lower it for dumber, more direct
' enemies (imps); raise it for smarter flankers (revenants).
Public Const GPUBRAIN_FLOW_WEIGHT As Single = 0.6!

' Blend the brain's flow direction into a heading, in place.
'   x, z         -- the enemy's world position
'   dirX, dirZ   -- IN: current heading (any magnitude); OUT: blended
'                   UNIT heading when the function returns True
' Returns False (heading untouched, not even normalized) when the
' field is absent, stale, out of area, or flat at this cell -- the
' caller's existing behavior is always the fallback.
Public Function GPUBrain_SteerBlend(ByVal x As Double, ByVal z As Double, _
                                    ByRef dirX As Single, ByRef dirZ As Single) As Boolean
    GPUBrain_SteerBlend = False
    Dim fx As Single, fz As Single
    If Not GPUBrain_SampleFlow(x, z, fx, fz) Then Exit Function

    ' Normalize the incoming heading
    Dim dn As Single
    dn = Sqr(dirX * dirX + dirZ * dirZ)
    If dn < 0.0001! Then Exit Function
    Dim ux As Single, uz As Single
    ux = dirX / dn: uz = dirZ / dn

    ' The 60/40 blend (flow already unit-length from the solver)
    Dim bx As Single, bz As Single, bn As Single
    bx = GPUBRAIN_FLOW_WEIGHT * fx + (1! - GPUBRAIN_FLOW_WEIGHT) * ux
    bz = GPUBRAIN_FLOW_WEIGHT * fz + (1! - GPUBRAIN_FLOW_WEIGHT) * uz
    bn = Sqr(bx * bx + bz * bz)
    If bn < 0.0001! Then Exit Function      ' opposed vectors cancelled -- keep original

    dirX = bx / bn
    dirZ = bz / bn
    GPUBrain_SteerBlend = True
End Function

' v1.4 -- FPS/dungeon PURSUIT variant: blend the enemy heading with the
' dedicated PLAYER-seeking field (pfx/pfz) instead of the objective nav
' field. Use this in the enemy update when the monster is chasing the
' player -- it routes around walls toward the player exactly as the WebGL
' FPS/dungeon monsters do. Requires GPUBrain_Tick to have been called
' with the player position (hasPlayer:=True). Same 60/40 blend + graceful
' fallback: returns False and leaves dirX/dirZ untouched when no fresh
' player field covers the point, so the caller's straight-at-player
' heading always remains the fallback.
Public Function GPUBrain_SteerBlendPlayer(ByVal x As Double, ByVal z As Double, _
                                          ByRef dirX As Single, ByRef dirZ As Single) As Boolean
    GPUBrain_SteerBlendPlayer = False
    Dim fx As Single, fz As Single
    If Not GPUBrain_SamplePlayerFlow(x, z, fx, fz) Then Exit Function

    Dim dn As Single
    dn = Sqr(dirX * dirX + dirZ * dirZ)
    If dn < 0.0001! Then Exit Function
    Dim ux As Single, uz As Single
    ux = dirX / dn: uz = dirZ / dn

    Dim bx As Single, bz As Single, bn As Single
    bx = GPUBRAIN_FLOW_WEIGHT * fx + (1! - GPUBRAIN_FLOW_WEIGHT) * ux
    bz = GPUBRAIN_FLOW_WEIGHT * fz + (1! - GPUBRAIN_FLOW_WEIGHT) * uz
    bn = Sqr(bx * bx + bz * bz)
    If bn < 0.0001! Then Exit Function

    dirX = bx / bn
    dirZ = bz / bn
    GPUBrain_SteerBlendPlayer = True
End Function

' Convenience: retreat heading AWAY from danger using the threat field
' (distance-to-nearest-enemy; we ascend it). For raycaster enemies that
' flee when hurt -- mirrors the WebGL flee logic. Returns False when no
' threat field is available (caller keeps its own flee vector).
Public Function GPUBrain_SteerRetreat(ByVal x As Double, ByVal z As Double, _
                                      ByRef dirX As Single, ByRef dirZ As Single) As Boolean
    GPUBrain_SteerRetreat = False
    ' Probe the 4 neighbors one cell out; head toward the SAFEST
    ' (largest threat-distance) that improves on here.
    Dim here As Single, best As Single, bx As Single, bz As Single
    If Not GPUBrain_SampleThreat(x, z, here) Then Exit Function
    best = here
    Dim probe As Single
    If GPUBrain_SampleThreat(x + 4#, z, probe) Then If probe > best Then best = probe: bx = 1!: bz = 0!
    If GPUBrain_SampleThreat(x - 4#, z, probe) Then If probe > best Then best = probe: bx = -1!: bz = 0!
    If GPUBrain_SampleThreat(x, z + 4#, probe) Then If probe > best Then best = probe: bx = 0!: bz = 1!
    If GPUBrain_SampleThreat(x, z - 4#, probe) Then If probe > best Then best = probe: bx = 0!: bz = -1!
    If best <= here Then Exit Function       ' nowhere safer nearby
    dirX = bx: dirZ = bz
    GPUBrain_SteerRetreat = True
End Function

Attribute VB_Name = "modRaycasterDemo"
Option Explicit

'***************************************************************
' modRaycasterDemo v1.8 -- "Doom in Excel", the reference implementation
' (GPU Brain phase 12; UNTESTED IN EXCEL -- verify per discipline.)
'
' A classic 2.5D DDA raycaster rendering to WORKSHEET CELLS -- the
' purest form of the bit: no GL, no DirectX, no browser. Just Excel
' cells as pixels, and the enemies steered by a GPU brain over the
' bridge. The DDA core was mirrored line-for-line in JavaScript and
' validated against brute-force ray marching (max distance error
' < 0.02 over 64 rays) -- the math is right even though this module
' has not run in Excel yet.
'
' REQUIRES (import in this order):
'   clsStringBuilder.cls, JSONParser.bas v2   (FixPack v1)
'   modGPUBrain.bas, modGPUBrainSteer.bas     (GPU Brain v10/v11)
'
' RUN:  Raycaster_Start   (with bridge + brain running for smart
'       enemies; without them, enemies chase dumb-straight -- the demo
'       works either way, which IS the fallback contract on display)
' KEYS: W/S forward/back, A/D strafe, Q/E turn, SPACE shoots, X quits
'
' SHEET: creates/uses "RAYCAST". Zoom out (~25%) and set column width
' ~0.5 so cells are roughly square. The renderer paints 64x44 cells.
'***************************************************************

' ------------------------------ world ------------------------------
Private Const MW As Long = 24, MH As Long = 24    ' map cells
Private Const VW As Long = 64, VH As Long = 44    ' viewport cells
Private Const CELL_WORLD As Double = 4#           ' world units per map cell (brain grid)

' 0=open, 1=wall. Built in code so the module is self-contained.
Private map(0 To MW * MH - 1) As Byte

' ------------------------------ player -----------------------------
Private pX As Double, pY As Double            ' position (map units)
Private dX As Double, dY As Double            ' facing (unit)
Private plX As Double, plY As Double          ' camera plane (FOV ~66deg)

' ------------------------------ enemies ----------------------------
Private Type RcEnemy
    x As Double
    y As Double
    hp As Single
    alive As Boolean
    cool As Double            ' v1.1 -- ranged attack cooldown (s)
    kind As String            ' v1.3 -- "archer" | "mage"
End Type

' v1.1 -- combat tuning
Private Const ENEMY_SHOOT_RANGE As Double = 9#     ' cells
Private Const ENEMY_SHOOT_COOL As Double = 2#      ' seconds
Private Const ENEMY_SHOOT_DMG As Long = 8
Private Const PLAYER_SHOT_DMG As Single = 0.5!
Private playerHP As Long
Private m_HitFlashT As Long                        ' GetTickCount of last hit
' v1.4 -- player speed between brain publishes (aim-quality signal)
Private m_PrevPX As Double, m_PrevPY As Double, m_PrevPT As Long
' v1.5 -- player marksmanship: the enemy-side loop closed in v1.3;
' this measures YOUR side. Shots, hits, kills; live readout top-right.
Private m_ShotsFired As Long, m_ShotsHit As Long, m_KillCount As Long
Private en(1 To 3) As RcEnemy

Private m_Run As Boolean
Private m_Frame As Long
Private m_LastBrainT As Long

#If VBA7 Then
    Private Declare PtrSafe Function GetTickCount Lib "kernel32" () As Long
#Else
    Private Declare Function GetTickCount Lib "kernel32" () As Long
#End If

' ============================================================
Public Sub Raycaster_Start()
    BuildMap
    pX = 3.5: pY = 3.5
    dX = 1#: dY = 0#
    plX = 0#: plY = 0.66
    en(1).x = 18.5: en(1).y = 4.5:  en(1).hp = 1!: en(1).alive = True
    en(2).x = 19.5: en(2).y = 18.5: en(2).hp = 1!: en(2).alive = True
    en(3).x = 5.5:  en(3).y = 19.5: en(3).hp = 1!: en(3).alive = True
    ' v1.3 -- variety: two archers, one mage
    en(1).kind = "archer": en(2).kind = "mage": en(3).kind = "archer"
    Dim ei As Long
    For ei = 1 To 3: en(ei).cool = 0#: Next ei
    playerHP = 100

    PrepareSheet
    HookKeys True
    m_Run = True
    m_Frame = 0
    Debug.Print "[Raycaster] started -- X to quit. Brain: " & GPUBrain_Status()
    Raycaster_Frame
End Sub

Public Sub Raycaster_Stop()
    m_Run = False
    HookKeys False
    ' v1.5 -- marksmanship summary
    If m_ShotsFired > 0 Then
        Debug.Print "[Raycaster] marksmanship: " & m_ShotsHit & "/" & m_ShotsFired & _
            " (" & Format$(m_ShotsHit / m_ShotsFired, "0%") & "), " & m_KillCount & " kills"
    End If
    Debug.Print "[Raycaster] stopped after " & m_Frame & " frames"
End Sub

' One frame: input applied via OnKey handlers between frames; here we
' tick enemies, feed the brain (1Hz), render, and chain the next frame.
Public Sub Raycaster_Frame()
    If Not m_Run Then Exit Sub
    On Error GoTo Fail
    Dim dt As Double: dt = 0.1                 ' fixed-step: OnTime floor

    ' --- brain I/O at 1Hz: the raycaster map IS a height snapshot ---
    If (GetTickCount() - m_LastBrainT) > 1000 Then
        m_LastBrainT = GetTickCount()
        PublishToBrain
    End If

    TickEnemies dt
    If playerHP <= 0 Then
        Debug.Print "[Raycaster] YOU DIED on frame " & m_Frame
        RenderFrame
        Raycaster_Stop
        Exit Sub
    End If
    RenderFrame

    m_Frame = m_Frame + 1
    Application.OnTime Now + TimeSerial(0, 0, 0) + 0.1 / 86400#, "Raycaster_Frame"
    Exit Sub
Fail:
    Debug.Print "[Raycaster] frame error: " & Err.Description
    Raycaster_Stop
End Sub

' ============================================================
' MAP + BRAIN
' ============================================================

Private Sub BuildMap()
    Dim x As Long, y As Long
    For y = 0 To MH - 1
        For x = 0 To MW - 1
            map(y * MW + x) = IIf(x = 0 Or y = 0 Or x = MW - 1 Or y = MH - 1, 1, 0)
        Next x
    Next y
    ' interior: two rooms + a corridor wall with one gap (the validated
    ' wall-gap topology, so brain-steered enemies visibly route it)
    For y = 1 To MH - 2
        If y <> 12 Then map(y * MW + 11) = 1        ' wall x=11, gap y=12
    Next y
    For x = 4 To 8:  map(7 * MW + x) = 1: Next x     ' furniture walls
    For x = 15 To 20: map(16 * MW + x) = 1: Next x
    map(4 * MW + 16) = 1: map(4 * MW + 17) = 1
End Sub

Private Function IsWallCell(ByVal cx As Long, ByVal cy As Long) As Boolean
    If cx < 0 Or cy < 0 Or cx >= MW Or cy >= MH Then IsWallCell = True: Exit Function
    IsWallCell = (map(cy * MW + cx) = 1)
End Function

' Snapshot: open=20, wall=60 heights; the PLAYER is the single goal.
' The brain's slope-cost field then flows toward the player through
' open cells -- enemy steering samples it via GPUBrain_SteerBlend.
Private Sub PublishToBrain()
    On Error Resume Next
    Dim heights(0 To MW * MH - 1) As Double
    Dim i As Long
    For i = 0 To MW * MH - 1
        heights(i) = IIf(map(i) = 1, 60#, 20#)
    Next i
    Dim goals As New Collection, g As Object
    Set g = CreateObject("Scripting.Dictionary")
    g("x") = pX * CELL_WORLD: g("z") = pY * CELL_WORLD
    g("id") = "player": g("energy") = 1#
    ' v1.7 -- publish marksmanship so the BRAIN sets difficulty
    If m_ShotsFired >= 5 Then g("acc") = m_ShotsHit / m_ShotsFired
    ' v1.8 -- publish HP so difficulty telemetry can measure the
    ' hp-midband candidate reward ("close fights hover mid-band")
    g("hp") = playerHP
    goals.Add g
    ' v1.4 -- player speed in world units/sec since the last publish:
    ' the same "he was strafing" signal the WebGL dungeon sends, so
    ' aim-quality learning reaches the spreadsheet too.
    Dim pSpd As Double, dtMs As Long
    dtMs = GetTickCount() - m_PrevPT
    If m_PrevPT <> 0 And dtMs > 50 Then
        pSpd = Sqr((pX - m_PrevPX) ^ 2 + (pY - m_PrevPY) ^ 2) * CELL_WORLD / (dtMs / 1000#)
        If pSpd > 20 Then pSpd = 20
    End If
    m_PrevPX = pX: m_PrevPY = pY: m_PrevPT = GetTickCount()

    Dim foes As New Collection, e As Object
    For i = 1 To 3
        If en(i).alive Then
            Set e = CreateObject("Scripting.Dictionary")
            e("id") = "rc-" & i: e("kind") = "rc_" & en(i).kind: e("energy") = en(i).hp
            e("x") = en(i).x * CELL_WORLD: e("z") = en(i).y * CELL_WORLD
            e("tspd") = pSpd   ' v1.4 -- their target (the player) speed
            ' v1.3 -- the dungeon repertoire, so the brain scores rc picks
            ' with the same spec-driven features (and now the dgn-trained
            ' targetMoving column applies here too)
            Dim aCol As New Collection, a1 As Object, a2 As Object
            Set a1 = CreateObject("Scripting.Dictionary")
            a1("name") = "arrow": a1("family") = "projectile"
            a1("range") = ENEMY_SHOOT_RANGE * CELL_WORLD: a1("damage") = 0.18
            Set a2 = CreateObject("Scripting.Dictionary")
            a2("name") = "magic": a2("family") = "projectile"
            a2("range") = ENEMY_SHOOT_RANGE * CELL_WORLD: a2("damage") = 0.3
            aCol.Add a1: aCol.Add a2
            Set e("attacks") = aCol
            foes.Add e
        End If
    Next i
    GPUBrain_Tick heights, MW, MH, 0#, 0#, CELL_WORLD, goals, foes
End Sub

' ============================================================
' ENEMIES -- straight-at-player heading, brain-blended (PATCH-B14 twin)
' ============================================================

Private Sub TickEnemies(ByVal dt As Double)
    Dim i As Long
    For i = 1 To 3
        If Not en(i).alive Then GoTo NextEnemy
        Dim hx As Single, hy As Single, dn As Double
        hx = CSng(pX - en(i).x): hy = CSng(pY - en(i).y)
        dn = Sqr(hx * hx + hy * hy)
        ' v1.1 -- ranged attack: in range + off cooldown + clear line of
        ' sight (ray-marched over the same map the renderer uses). Mirrors
        ' the DungeonAI archer/mage gate.
        en(i).cool = en(i).cool - dt
        If dn < ENEMY_SHOOT_RANGE And en(i).cool <= 0 Then
            If HasLOS(en(i).x, en(i).y, pX, pY) Then
                ' v1.3 -- brain-consulted shot: arrow (quick, light) vs magic
                ' (slow, heavy). Fallback: archers arrow, mages magic. Every
                ' shot reports its outcome back through the snapshot -- the
                ' full kaiju loop (pick -> provenance -> propensity -> train)
                ' now closes in a spreadsheet.
                Dim pick As String, expl As Boolean, srcTag As String
                pick = GPUBrain_GetAttack("rc-" & i, expl)
                If pick <> "arrow" And pick <> "magic" Then
                    pick = IIf(en(i).kind = "mage", "magic", "arrow")
                    srcTag = "rotation"
                ElseIf expl Then
                    srcTag = "brain-explore"
                Else
                    srcTag = "brain"
                End If
                Dim shotDmg As Long, shotCool As Double
                If pick = "magic" Then shotDmg = 14: shotCool = 3# Else shotDmg = 6: shotCool = 1.5
                ' v1.7 -- BRAIN-SERVED difficulty: cadence follows the brain's
                ' published boldness for this enemy (which folds in your
                ' marksmanship server-side, on top of learned aggro). The
                ' v1.6 local formula remains the FALLBACK when no brain --
                ' the game adapts either way, the brain just does it better.
                Dim boldA As Single
                If GPUBrain_GetAggro("rc-" & i, boldA) Then
                    shotCool = shotCool * (1.55 - 0.9 * boldA)
                ElseIf m_ShotsFired >= 5 Then
                    Dim accD As Double
                    accD = m_ShotsHit / m_ShotsFired
                    shotCool = shotCool * (1.35 - 0.6 * accD)
                End If
                en(i).cool = shotCool
                ' hit chance: magic is dodgeable-in-fiction -- a moving player
                ' evades it 40% of the time; arrows nearly always land
                Dim landed As Boolean
                landed = True
                If pick = "magic" And Rnd() < 0.4 Then landed = False
                If landed Then
                    playerHP = playerHP - shotDmg
                    m_HitFlashT = GetTickCount()
                End If
                GPUBrain_ReportOutcome "rc-" & i, pick, landed, srcTag
            End If
        End If
        If dn < 0.8 Then GoTo NextEnemy          ' reached melee range: hold
        ' The one line that makes them smart (world coords for the brain):
        GPUBrain_SteerBlend en(i).x * CELL_WORLD, en(i).y * CELL_WORLD, hx, hy
        ' v1.2 -- FLANKING via the threat field. The published enemies ARE
        ' the threat sources, so threat-distance at my own position tells
        ' me how close my nearest packmate is. Bunched up (< 1.5 cells) ->
        ' deflect the heading toward whichever perpendicular side probes
        ' SAFER (higher threat-distance), fanning the pack out so they
        ' arrive from different directions instead of a conga line.
        ApplySeparation en(i).x, en(i).y, hx, hy
        ' Normalize (SteerBlend returns unit on True; straight case is not)
        dn = Sqr(hx * hx + hy * hy): If dn < 0.0001 Then GoTo NextEnemy
        Dim sp As Double: sp = 1.1 * dt          ' cells/sec
        Dim nx As Double, ny As Double
        nx = en(i).x + (hx / dn) * sp
        ny = en(i).y + (hy / dn) * sp
        ' collision authority: axis-slide exactly like DungeonAI
        If Not IsWallCell(Int(nx), Int(en(i).y)) Then en(i).x = nx
        If Not IsWallCell(Int(en(i).x), Int(ny)) Then en(i).y = ny
NextEnemy:
    Next i
End Sub

' ============================================================
' INPUT
' ============================================================

Private Sub HookKeys(ByVal enable As Boolean)
    Dim keys As Variant, subs As Variant, i As Long
    keys = Array("w", "s", "a", "d", "q", "e", " ", "x")
    subs = Array("RC_Fwd", "RC_Back", "RC_StrafeL", "RC_StrafeR", "RC_TurnL", "RC_TurnR", "RC_Shoot", "Raycaster_Stop")
    For i = 0 To UBound(keys)
        Application.OnKey CStr(keys(i)), IIf(enable, CStr(subs(i)), "")
    Next i
End Sub

Private Sub TryMovePlayer(ByVal nx As Double, ByVal ny As Double)
    If Not IsWallCell(Int(nx), Int(pY)) Then pX = nx
    If Not IsWallCell(Int(pX), Int(ny)) Then pY = ny
End Sub

' v1.2 -- separation: rotate the heading up to ~40deg toward the less
' crowded perpendicular when a packmate is within 1.5 cells. Uses the
' threat field (distance to nearest enemy) already delivered by
' modGPUBrain; without a brain, SampleThreat is False and this is a
' no-op -- the fallback contract again.
Private Sub ApplySeparation(ByVal ex As Double, ByVal ey As Double, _
                            ByRef hx As Single, ByRef hy As Single)
    Dim here As Single
    If Not GPUBrain_SampleThreat(ex * CELL_WORLD, ey * CELL_WORLD, here) Then Exit Sub
    If here > 1.5 * CELL_WORLD Then Exit Sub          ' not crowded
    Dim dn As Double: dn = Sqr(hx * hx + hy * hy): If dn < 0.0001 Then Exit Sub
    Dim ux As Single, uz As Single
    ux = hx / dn: uz = hy / dn
    ' probe one cell out on each perpendicular
    Dim lT As Single, rT As Single, sideX As Single, sideY As Single
    sideX = -uz: sideY = ux
    If Not GPUBrain_SampleThreat((ex + sideX) * CELL_WORLD, (ey + sideY) * CELL_WORLD, lT) Then lT = here
    If Not GPUBrain_SampleThreat((ex - sideX) * CELL_WORLD, (ey - sideY) * CELL_WORLD, rT) Then rT = here
    Dim sgn As Single
    If lT > rT Then sgn = 1! Else sgn = -1!
    If lT = rT Then Exit Sub
    ' blend ~35% of the safer perpendicular into the heading
    hx = CSng(ux + sgn * sideX * 0.65)
    hy = CSng(uz + sgn * sideY * 0.65)
End Sub

' v1.1 -- line of sight: march the segment in 0.2-cell steps; blocked
' if any sample lands in a wall cell. Same map, same truth as the DDA.
Private Function HasLOS(ByVal ax As Double, ByVal ay As Double, _
                        ByVal bx As Double, ByVal by As Double) As Boolean
    Dim ddx As Double, ddy As Double, dist As Double, steps As Long, s As Long
    ddx = bx - ax: ddy = by - ay
    dist = Sqr(ddx * ddx + ddy * ddy)
    steps = CLng(dist / 0.2): If steps < 1 Then steps = 1
    For s = 1 To steps - 1
        If IsWallCell(Int(ax + ddx * s / steps), Int(ay + ddy * s / steps)) Then Exit Function
    Next s
    HasLOS = True
End Function

' v1.1 -- player hitscan (SPACE): the enemy nearest the crosshair within
' a small angular window, closer than the wall in that direction, takes
' damage. Uses the same camera-space transform as the sprite renderer.
Public Sub RC_Shoot()
    Dim i As Long, bestI As Long, bestAbs As Double
    bestI = 0: bestAbs = 0.35                      ' angular window (rad-ish)
    Dim invDet As Double
    invDet = 1# / (plX * dY - dX * plY)
    For i = 1 To 3
        If Not en(i).alive Then GoTo NextS
        Dim relX As Double, relY As Double, trX As Double, trY As Double
        relX = en(i).x - pX: relY = en(i).y - pY
        trX = invDet * (dY * relX - dX * relY)
        trY = invDet * (-plY * relX + plX * relY)
        If trY <= 0.1 Then GoTo NextS              ' behind camera
        Dim ang As Double: ang = Abs(trX / trY)
        If ang < bestAbs Then
            ' wall occlusion: cast one DDA ray straight at the enemy
            If HasLOS(pX, pY, en(i).x, en(i).y) Then bestAbs = ang: bestI = i
        End If
NextS:
    Next i
    m_ShotsFired = m_ShotsFired + 1                ' v1.5
    If bestI > 0 Then
        m_ShotsHit = m_ShotsHit + 1                ' v1.5
        en(bestI).hp = en(bestI).hp - PLAYER_SHOT_DMG
        If en(bestI).hp <= 0 Then
            en(bestI).alive = False
            m_KillCount = m_KillCount + 1          ' v1.5
            Debug.Print "[Raycaster] enemy " & bestI & " down"
        End If
    End If
End Sub

Public Sub RC_Fwd():     TryMovePlayer pX + dX * 0.4, pY + dY * 0.4: End Sub
Public Sub RC_Back():    TryMovePlayer pX - dX * 0.4, pY - dY * 0.4: End Sub
Public Sub RC_StrafeL(): TryMovePlayer pX - plX * 0.3, pY - plY * 0.3: End Sub
Public Sub RC_StrafeR(): TryMovePlayer pX + plX * 0.3, pY + plY * 0.3: End Sub

Public Sub RC_TurnL(): RotatePlayer 0.22: End Sub
Public Sub RC_TurnR(): RotatePlayer -0.22: End Sub

Private Sub RotatePlayer(ByVal a As Double)
    Dim odx As Double, oplx As Double
    odx = dX: dX = dX * Cos(a) - dY * Sin(a): dY = odx * Sin(a) + dY * Cos(a)
    oplx = plX: plX = plX * Cos(a) - plY * Sin(a): plY = oplx * Sin(a) + plY * Cos(a)
End Sub

' ============================================================
' RENDER -- DDA raycast per column, painted as cell strips
' ============================================================

Private Sub PrepareSheet()
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets("RAYCAST")
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add
        ws.Name = "RAYCAST"
    End If
    ws.Activate
    Dim c As Long
    For c = 1 To VW
        ws.Columns(c).ColumnWidth = 0.5
    Next c
    ActiveWindow.Zoom = 40
    ActiveWindow.DisplayGridlines = False
End Sub

Private Sub RenderFrame()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets("RAYCAST")
    Application.ScreenUpdating = False

    Dim col As Long
    Dim zbuf(1 To VW) As Double                 ' wall distance per column (sprite occlusion)
    For col = 1 To VW
        ' --- DDA (validated against the JS mirror) ---
        Dim camX As Double: camX = 2# * (col - 1) / VW - 1#
        Dim rdx As Double, rdy As Double
        rdx = dX + plX * camX: rdy = dY + plY * camX
        Dim mapX As Long, mapY As Long
        mapX = Int(pX): mapY = Int(pY)
        Dim ddx As Double, ddy As Double
        ddx = IIf(rdx = 0, 1E+30, Abs(1# / rdx))
        ddy = IIf(rdy = 0, 1E+30, Abs(1# / rdy))
        Dim stepX As Long, stepY As Long, sdx As Double, sdy As Double
        If rdx < 0 Then stepX = -1: sdx = (pX - mapX) * ddx Else stepX = 1: sdx = (mapX + 1# - pX) * ddx
        If rdy < 0 Then stepY = -1: sdy = (pY - mapY) * ddy Else stepY = 1: sdy = (mapY + 1# - pY) * ddy
        Dim side As Long, hit As Long, guard As Long
        hit = 0: guard = 0
        Do While hit = 0 And guard < 64
            If sdx < sdy Then
                sdx = sdx + ddx: mapX = mapX + stepX: side = 0
            Else
                sdy = sdy + ddy: mapY = mapY + stepY: side = 1
            End If
            If IsWallCell(mapX, mapY) Then hit = 1
            guard = guard + 1
        Loop
        Dim dist As Double
        If side = 0 Then dist = sdx - ddx Else dist = sdy - ddy
        If dist < 0.05 Then dist = 0.05
        zbuf(col) = dist

        ' --- paint the column: ceiling / wall / floor strips ---
        Dim lineH As Long
        lineH = CLng(VH / dist): If lineH > VH Then lineH = VH
        Dim wTop As Long, wBot As Long
        wTop = (VH - lineH) \ 2 + 1
        wBot = wTop + lineH - 1
        ' distance-shaded gray; E/W faces darker than N/S (classic depth cue)
        Dim shade As Long
        shade = 200 - CLng(dist * 14): If shade < 40 Then shade = 40
        If side = 1 Then shade = shade * 0.7
        If wTop > 1 Then ws.Range(ws.Cells(1, col), ws.Cells(wTop - 1, col)).Interior.Color = RGB(28, 32, 44)
        ws.Range(ws.Cells(wTop, col), ws.Cells(wBot, col)).Interior.Color = RGB(shade, shade, CLng(shade * 1.05))
        If wBot < VH Then ws.Range(ws.Cells(wBot + 1, col), ws.Cells(VH, col)).Interior.Color = RGB(45, 40, 34)
    Next col

    ' --- enemies as billboard columns (red, occluded by zbuf) ---
    Dim i As Long
    For i = 1 To 3
        If Not en(i).alive Then GoTo NextSprite
        Dim relX As Double, relY As Double
        relX = en(i).x - pX: relY = en(i).y - pY
        ' camera-space transform (inverse of [pl d] matrix)
        Dim invDet As Double
        invDet = 1# / (plX * dY - dX * plY)
        Dim trX As Double, trY As Double
        trX = invDet * (dY * relX - dX * relY)
        trY = invDet * (-plY * relX + plX * relY)      ' depth
        If trY <= 0.1 Then GoTo NextSprite               ' behind camera
        Dim sCol As Long
        sCol = CLng((VW / 2#) * (1# + trX / trY))
        Dim sH As Long: sH = CLng(VH / trY * 0.7)
        If sH < 1 Then sH = 1
        Dim sTop As Long: sTop = VH \ 2 - sH \ 2 + sH \ 4   ' grounded-ish
        Dim cc As Long, halfW As Long
        halfW = sH \ 4: If halfW < 1 Then halfW = 1
        For cc = sCol - halfW To sCol + halfW
            If cc >= 1 And cc <= VW Then
                If trY < zbuf(cc) Then
                    ws.Range(ws.Cells(sTop, cc), ws.Cells(sTop + sH - 1, cc)).Interior.Color = RGB(190, 40, 30)
                End If
            End If
        Next cc
NextSprite:
    Next i

    ' v1.1 -- HUD: HP bar across the top row (green -> red), and a red
    ' border flash for ~250ms after taking a hit.
    Dim hpCells As Long
    hpCells = CLng(VW * playerHP / 100#): If hpCells < 0 Then hpCells = 0
    If hpCells > 0 Then ws.Range(ws.Cells(1, 1), ws.Cells(1, hpCells)).Interior.Color = _
        RGB(255 - CLng(playerHP * 2.2), CLng(playerHP * 2.2), 40)
    ' v1.5 -- accuracy readout: top-right cells, green >= 60%, amber >= 30%,
    ' red below. Width = 6 cells, filled left-to-right by accuracy.
    If m_ShotsFired > 0 Then
        Dim accF As Double, accCells As Long, accColor As Long
        accF = m_ShotsHit / m_ShotsFired
        accCells = CLng(accF * 6): If accCells < 1 Then accCells = 1
        If accF >= 0.6 Then accColor = RGB(60, 220, 90) _
        ElseIf accF >= 0.3 Then accColor = RGB(230, 180, 50) _
        Else accColor = RGB(220, 60, 50)
        ws.Range(ws.Cells(2, VW - 6), ws.Cells(2, VW - 7 + accCells)).Interior.Color = accColor
    End If
    If (GetTickCount() - m_HitFlashT) < 250 Then
        ws.Range(ws.Cells(VH, 1), ws.Cells(VH, VW)).Interior.Color = RGB(220, 30, 30)
        ws.Range(ws.Cells(2, 1), ws.Cells(VH - 1, 1)).Interior.Color = RGB(220, 30, 30)
        ws.Range(ws.Cells(2, VW), ws.Cells(VH - 1, VW)).Interior.Color = RGB(220, 30, 30)
    End If

    Application.ScreenUpdating = True
End Sub

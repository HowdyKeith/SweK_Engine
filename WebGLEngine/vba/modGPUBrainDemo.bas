Attribute VB_Name = "modGPUBrainDemo"
Option Explicit

'***************************************************************
' modGPUBrainDemo -- smoke test for modGPUBrain WITHOUT the GL engine.
' (GPU Brain phase 10; untested in Excel -- verify per discipline.)
'
' Requires: bridge running on :8787, brain process running.
' Run GPUBrainDemo_Start from the Immediate window; it publishes a
' synthetic 32x32 valley (a wall with one gap, exactly the CPU
' validation map) with one goal and two fake enemies, ticks at 1Hz via
' OnTime, and prints the sampled flow at a probe point each tick.
' Within ~2 ticks you should see a non-zero flow vector pointing
' through the gap. GPUBrainDemo_Stop ends it.
'***************************************************************

Private m_Running As Boolean

Public Sub GPUBrainDemo_Start()
    m_Running = True
    Debug.Print "[GPUBrainDemo] started -- expect flow within ~2 ticks"
    GPUBrainDemo_Tick
End Sub

Public Sub GPUBrainDemo_Stop()
    m_Running = False
    Debug.Print "[GPUBrainDemo] stopped"
End Sub

Public Sub GPUBrainDemo_Tick()
    If Not m_Running Then Exit Sub
    On Error Resume Next

    Const W As Long = 32, H As Long = 32
    Dim heights(0 To W * H - 1) As Double
    Dim x As Long, y As Long
    For y = 0 To H - 1
        For x = 0 To W - 1
            heights(y * W + x) = 20#
        Next x
    Next y
    ' wall at x=14, gap at y=16 (the flow must route through it)
    For y = 0 To H - 1
        If y <> 16 Then heights(y * W + 14) = 60#
    Next y

    Dim goals As New Collection, g As Object
    Set g = CreateObject("Scripting.Dictionary")
    g("x") = 28# * 4#: g("z") = 16# * 4#: g("id") = "demo-civ": g("energy") = 1#
    goals.Add g

    Dim enemies As New Collection, e As Object
    Set e = CreateObject("Scripting.Dictionary")
    e("id") = "vba-enemy-1": e("kind") = "tech": e("energy") = 0.9
    e("x") = 4# * 4#: e("z") = 8# * 4#
    enemies.Add e
    Set e = CreateObject("Scripting.Dictionary")
    e("id") = "vba-enemy-2": e("kind") = "hell": e("energy") = 0.7
    e("x") = 6# * 4#: e("z") = 24# * 4#
    enemies.Add e

    GPUBrain_Tick heights, W, H, 0#, 0#, 4#, goals, enemies

    Dim fx As Single, fz As Single
    If GPUBrain_SampleFlow(4# * 4#, 8# * 4#, fx, fz) Then
        Debug.Print "[GPUBrainDemo] flow at probe: (" & Format$(fx, "0.00") & ", " & Format$(fz, "0.00") & ")  " & GPUBrain_Status()
    Else
        Debug.Print "[GPUBrainDemo] no flow yet  " & GPUBrain_Status()
    End If

    If m_Running Then Application.OnTime Now + TimeSerial(0, 0, 1), "GPUBrainDemo_Tick"
End Sub

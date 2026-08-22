# =============================================
# KPopMqtt.psm1 - optional MQTT transport for KPopListener
# ---------------------------------------------------------------
# Dependency-free: shells out to the Mosquitto CLI tools that ship
# with the broker (mosquitto_pub.exe / mosquitto_sub.exe). No NuGet,
# no MQTTnet DLL, no Install-Module — those don't actually exist as
# the earlier transcript assumed.
#
#   Publish  : ONE persistent `mosquitto_pub -l` process. We write a
#              line to its stdin per event; -l publishes each line as a
#              message to a fixed topic. No per-event process spawn, no
#              argument-quoting problems.
#   Subscribe: ONE `mosquitto_sub -v` process. Its stdout ("topic
#              payload") is read asynchronously into a thread-safe
#              $global:MqttInbox queue. The LISTENER drains that queue
#              on its own thread and raises toasts (so all WinForms /
#              BurntToast work stays on the main thread).
#
# Off unless KPopListener is launched with -EnableMqtt.
# =============================================

$script:MqttPubProc = $null
$script:MqttSubProc = $null
$script:MqttSubEvent = $null

function Find-MosquittoExe {
    param([Parameter(Mandatory)][string]$Name)   # mosquitto_pub | mosquitto_sub
    $cmd = Get-Command "$Name.exe" -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($p in @(
        "C:\Program Files\mosquitto\$Name.exe",
        "C:\Program Files (x86)\mosquitto\$Name.exe"
    )) { if (Test-Path $p) { return $p } }
    return $null
}

function _MqttBaseArgs {
    $a = "-h `"$($global:Mqtt.Broker)`" -p $($global:Mqtt.Port)"
    if ($global:Mqtt.Username) { $a += " -u `"$($global:Mqtt.Username)`"" }
    if ($global:Mqtt.Password) { $a += " -P `"$($global:Mqtt.Password)`"" }
    if ($global:Mqtt.UseTls) {
        if ($global:Mqtt.CaFile)   { $a += " --cafile `"$($global:Mqtt.CaFile)`"" }
        if ($global:Mqtt.CertFile) { $a += " --cert `"$($global:Mqtt.CertFile)`"" }
        if ($global:Mqtt.KeyFile)  { $a += " --key `"$($global:Mqtt.KeyFile)`"" }
        if ($global:Mqtt.Insecure) { $a += " --insecure" }
    }
    return $a
}

function Initialize-KPopMqtt {
    param(
        [string]$Broker   = "localhost",
        [int]$Port        = 1883,
        [string]$PubTopic = "kpop/events",
        [string]$SubTopic = "kpop/in",
        [string]$Username = "",
        [string]$Password = "",
        [switch]$Publish,
        [switch]$Subscribe,
        [switch]$UseTls,
        [string]$CaFile   = "",
        [string]$CertFile = "",
        [string]$KeyFile  = "",
        [switch]$Insecure
    )
    # Default to the TLS port if TLS is on and no explicit non-default port given.
    if ($UseTls -and $Port -eq 1883) { $Port = 8883 }
    $global:Mqtt = @{
        Broker = $Broker; Port = $Port
        PubTopic = $PubTopic; SubTopic = $SubTopic
        Username = $Username; Password = $Password
        Publish = [bool]$Publish; Subscribe = [bool]$Subscribe
        UseTls = [bool]$UseTls; CaFile = $CaFile; CertFile = $CertFile; KeyFile = $KeyFile; Insecure = [bool]$Insecure
        PubExe = (Find-MosquittoExe "mosquitto_pub")
        SubExe = (Find-MosquittoExe "mosquitto_sub")
        LastError = $null
    }
    $global:MqttInbox = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()

    if ($global:Mqtt.Publish -and -not $global:Mqtt.PubExe) {
        Write-Host "[KPopMqtt] mosquitto_pub.exe not found (is Mosquitto installed / on PATH?) — publish disabled" -ForegroundColor DarkYellow
        $global:Mqtt.Publish = $false
    }
    if ($global:Mqtt.Subscribe -and -not $global:Mqtt.SubExe) {
        Write-Host "[KPopMqtt] mosquitto_sub.exe not found — subscribe disabled" -ForegroundColor DarkYellow
        $global:Mqtt.Subscribe = $false
    }
    return $global:Mqtt
}

function Start-KPopMqttPublisher {
    if (-not $global:Mqtt -or -not $global:Mqtt.Publish -or -not $global:Mqtt.PubExe) { return }
    if ($script:MqttPubProc -and -not $script:MqttPubProc.HasExited) { return }
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName  = $global:Mqtt.PubExe
        $psi.Arguments = (_MqttBaseArgs) + " -t `"$($global:Mqtt.PubTopic)`" -l"
        $psi.UseShellExecute        = $false
        $psi.RedirectStandardInput  = $true
        $psi.CreateNoWindow         = $true
        $script:MqttPubProc = [System.Diagnostics.Process]::Start($psi)
        Write-Host "[KPopMqtt] publisher up -> $($global:Mqtt.Broker):$($global:Mqtt.Port) topic '$($global:Mqtt.PubTopic)'" -ForegroundColor Green
    } catch {
        $global:Mqtt.LastError = "$_"
        Write-Host "[KPopMqtt] publisher failed: $_" -ForegroundColor Red
    }
}

function Publish-KPopMqtt {
    param([Parameter(Mandatory)][string]$Payload)
    if (-not $script:MqttPubProc -or $script:MqttPubProc.HasExited) { return }
    try {
        # one message per line; collapse newlines so each event stays a single message
        $script:MqttPubProc.StandardInput.WriteLine(($Payload -replace "[`r`n]+", " "))
        $script:MqttPubProc.StandardInput.Flush()
    } catch { $global:Mqtt.LastError = "$_" }
}

function Start-KPopMqttSubscriber {
    if (-not $global:Mqtt -or -not $global:Mqtt.Subscribe -or -not $global:Mqtt.SubExe) { return }
    if ($script:MqttSubProc -and -not $script:MqttSubProc.HasExited) { return }
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName  = $global:Mqtt.SubExe
        $psi.Arguments = (_MqttBaseArgs) + " -t `"$($global:Mqtt.SubTopic)`" -v"
        $psi.UseShellExecute        = $false
        $psi.RedirectStandardOutput = $true
        $psi.CreateNoWindow         = $true
        $proc = New-Object System.Diagnostics.Process
        $proc.StartInfo = $psi
        $proc.EnableRaisingEvents = $true
        # stdout arrives on a background thread → enqueue to a concurrent
        # queue; the listener's main loop drains it. (No UI work here.)
        $script:MqttSubEvent = Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -Action {
            if ($EventArgs.Data) { $global:MqttInbox.Enqueue([string]$EventArgs.Data) }
        }
        [void]$proc.Start()
        $proc.BeginOutputReadLine()
        $script:MqttSubProc = $proc
        Write-Host "[KPopMqtt] subscriber up -> $($global:Mqtt.Broker):$($global:Mqtt.Port) topic '$($global:Mqtt.SubTopic)'" -ForegroundColor Green
    } catch {
        $global:Mqtt.LastError = "$_"
        Write-Host "[KPopMqtt] subscriber failed: $_" -ForegroundColor Red
    }
}

function Start-KPopMqtt {
    Start-KPopMqttPublisher
    Start-KPopMqttSubscriber
}

function Stop-KPopMqtt {
    if ($script:MqttSubEvent) { try { Unregister-Event -SubscriptionId $script:MqttSubEvent.Id -ErrorAction SilentlyContinue } catch {}; $script:MqttSubEvent = $null }
    foreach ($p in @($script:MqttPubProc, $script:MqttSubProc)) {
        try { if ($p -and -not $p.HasExited) { $p.Kill() } } catch {}
        try { if ($p) { $p.Dispose() } } catch {}
    }
    $script:MqttPubProc = $null
    $script:MqttSubProc = $null
}

Export-ModuleMember -Function `
    Initialize-KPopMqtt, Start-KPopMqtt, Start-KPopMqttPublisher, `
    Start-KPopMqttSubscriber, Publish-KPopMqtt, Stop-KPopMqtt, Find-MosquittoExe

# File: KPopupTTS.ps1
# Path: v7/KPopupTTS.ps1
# Description: Stand-alone TTS voice explorer & selector
# Exports selected voice to %APPDATA%\KPopupTTS\SelectedVoice.json
# Works with KPopupClipSaver (hot-swap enabled)
#Requires -Version 5.1

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# -------------------------------------------------
# Paths
# -------------------------------------------------
$AppDataFolder = Join-Path $env:APPDATA 'KPopupTTS'
$ExportFile    = Join-Path $AppDataFolder 'SelectedVoice.json'
if (-not (Test-Path $AppDataFolder)) { New-Item -ItemType Directory -Path $AppDataFolder -Force | Out-Null }

# -------------------------------------------------
# Load System.Speech
# -------------------------------------------------
try { Add-Type -AssemblyName System.Speech } catch { Write-Error "System.Speech not available." ; exit 1 }
$tts = [System.Speech.Synthesis.SpeechSynthesizer]::new()
$tts.Rate   = 0
$tts.Volume = 100

# -------------------------------------------------
# Gather voices
# -------------------------------------------------
$allVoices = $tts.GetInstalledVoices() |
             Sort-Object {$_.VoiceInfo.Culture} {$_.VoiceInfo.Name} |
             ForEach-Object { $_.VoiceInfo }

# Preferred defaults
$Zira  = $allVoices | Where-Object Name -like '*Zira*'
$David = $allVoices | Where-Object Name -like '*David*'

# -------------------------------------------------
# Helper: Export selection
# -------------------------------------------------
function Export-VoiceSelection {
    param([string]$VoiceName, [string]$GenderHint)
    $obj = [pscustomobject]@{
        SelectedVoice = $VoiceName
        GenderHint    = $GenderHint
        Timestamp     = (Get-Date).ToString('o')
    }
    $obj | ConvertTo-Json -Depth 3 | Set-Content -Path $ExportFile -Encoding UTF8
    Write-Host "Exported voice: $VoiceName ($GenderHint)" -ForegroundColor Green
}

# -------------------------------------------------
# XAML GUI
# -------------------------------------------------
Add-Type -AssemblyName PresentationFramework, System.Windows.Forms

$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="KPopup TTS Voice Manager" Height="560" Width="720"
        Background="#1E1E1E" WindowStartupLocation="CenterScreen">
  <Grid Margin="15">
    <Grid.RowDefinitions>
      <RowDefinition Height="Auto"/>
      <RowDefinition Height="*"/>
      <RowDefinition Height="Auto"/>
    </Grid.RowDefinitions>

    <!-- Header -->
    <StackPanel Grid.Row="0" Orientation="Horizontal" Margin="0,0,0,12">
      <TextBlock Text="KPopup TTS" FontSize="26" FontWeight="Bold" Foreground="#4CAF50"/>
      <TextBlock Text="Voice Manager" FontSize="18" Foreground="#AAAAAA" VerticalAlignment="Bottom" Margin="8,0,0,0"/>
    </StackPanel>

    <!-- Voice List -->
    <ListBox Grid.Row="1" Name="VoiceList" Background="#2D2D2D" Foreground="White" BorderBrush="#444">
      <ListBox.ItemTemplate>
        <DataTemplate>
          <StackPanel Orientation="Horizontal" Margin="4">
            <TextBlock Text="{Binding Name}" Width="260" FontWeight="SemiBold"/>
            <TextBlock Text="{Binding Gender}" Width="80" Foreground="#4CAF50"/>
            <TextBlock Text="{Binding Culture}" Width="120" Foreground="#AAAAAA"/>
            <Button Content="Play" Tag="{Binding Name}" Width="50" Margin="8,0"/>
          </StackPanel>
        </DataTemplate>
      </ListBox.ItemTemplate>
    </ListBox>

    <!-- Controls -->
    <StackPanel Grid.Row="2" Orientation="Horizontal" HorizontalAlignment="Center" Margin="0,12,0,0">
      <Button Name="BtnMale"   Content="Set Male (David)"   Width="140" Margin="4"/>
      <Button Name="BtnFemale" Content="Set Female (Zira)" Width="140" Margin="4"/>
      <Button Name="BtnAny"    Content="Set Any (First)"   Width="140" Margin="4"/>
      <Button Name="BtnRefresh" Content="Refresh List"    Width="100" Margin="4"/>
    </StackPanel>
  </Grid>
</Window>
'@

$reader = [System.Xml.XmlReader]::Create([System.IO.StringReader]$xaml)
$window = [Windows.Markup.XamlReader]::Load($reader)

# Bind list
$list = $window.FindName('VoiceList')
$list.ItemsSource = $allVoices

# Play button inside each row
$list.AddHandler([System.Windows.Controls.Button]::ClickEvent, {
    param($sender, $e)
    $btn   = $e.OriginalSource
    $voice = $btn.Tag
    $tts.SelectVoice($voice)
    $tts.SpeakAsync("This is a test of the $($voice.Split(' ')[1]) voice.") | Out-Null
})

# Set Male
$window.FindName('BtnMale').Add_Click({
    if ($David) {
        $tts.SelectVoice($David.Name)
        Export-VoiceSelection -VoiceName $David.Name -GenderHint 'Male'
    } else { [System.Windows.MessageBox]::Show("David voice not found.") }
})

# Set Female
$window.FindName('BtnFemale').Add_Click({
    if ($Zira) {
        $tts.SelectVoice($Zira.Name)
        Export-VoiceSelection -VoiceName $Zira.Name -GenderHint 'Female'
    } else { [System.Windows.MessageBox]::Show("Zira voice not found.") }
})

# Set Any (first available)
$window.FindName('BtnAny').Add_Click({
    $first = $allVoices | Select-Object -First 1
    $tts.SelectVoice($first.Name)
    Export-VoiceSelection -VoiceName $first.Name -GenderHint 'Any'
})

# Refresh
$window.FindName('BtnRefresh').Add_Click({
    $global:allVoices = $tts.GetInstalledVoices() | ForEach-Object {$_.VoiceInfo}
    $list.ItemsSource = $allVoices
})

# -------------------------------------------------
# Show GUI
# -------------------------------------------------
$window.ShowDialog() | Out-Null


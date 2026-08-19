# Test-WpfSvg.ps1 – WPF + SVG + MVVM Demo (Saves itself via KPopupClipSaver)
# Place in: C:\Users\howdy\OneDrive\KPopup\v7\Test-WpfSvg.ps1
# Requires: KPopupClipSaver.ps1 running in same folder

Add-Type -AssemblyName PresentationFramework, System.Windows.Forms

# === 1. AUTO-SAVE THIS SCRIPT USING KPOPUPCLIPSAVER ===
$ScriptPath = $MyInvocation.MyCommand.Path
$ScriptContent = @"
# Test-WpfSvg.ps1 – WPF + SVG + MVVM Demo
Add-Type -AssemblyName PresentationFramework, System.Windows.Forms

# === SVG ICONS (Embedded as XAML Path) ===
`$svgIcons = @{
    File = '<Path Data="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" Fill="#B0B0B0"/>'
    Image = '<Path Data="M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z" Fill="#4CAF50"/>'
}

# === MVVM VIEWMODEL ===
class FileItemViewModel : System.ComponentModel.INotifyPropertyChanged {
    [string]`$_Name
    [string]`$_Type
    [string]`$_Icon

    [string] get_Name() { return `$this._Name }
    [void] set_Name([string]`$value) { `$this._Name = `$value; `$this.OnPropertyChanged('Name') }

    [string] get_Type() { return `$this._Type }
    [void] set_Type([string]`$value) { `$this._Type = `$value; `$this.OnPropertyChanged('Type') }

    [string] get_Icon() { return `$this._Icon }
    [void] set_Icon([string]`$value) { `$this._Icon = `$value; `$this.OnPropertyChanged('Icon') }

    [event] System.ComponentModel.PropertyChangedEventHandler PropertyChanged
    [void] OnPropertyChanged([string]`$prop) { `$this.PropertyChanged?.Invoke(`$this, (New-Object System.ComponentModel.PropertyChangedEventArgs `$prop)) }

    FileItemViewModel([string]`$name, [string]`$type) {
        `$this.Name = `$name
        `$this.Type = `$type
        `$this.Icon = `$svgIcons[`$type]
    }
}

# === XAML WITH SVG PATHS ===
`$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="WPF + SVG + MVVM Demo" Height="400" Width="600">
  <Grid Background="#121212">
    <ListBox ItemsSource="{Binding Items}" Margin="20">
      <ListBox.ItemTemplate>
        <DataTemplate>
          <StackPanel Orientation="Horizontal" Margin="5">
            <ContentPresenter Content="{Binding Icon}" Width="24" Height="24" Margin="0,0,10,0"/>
            <TextBlock Text="{Binding Name}" Foreground="White" VerticalAlignment="Center" FontSize="14"/>
            <TextBlock Text="{Binding Type}" Foreground="#B0B0B0" Margin="10,0,0,0" VerticalAlignment="Center"/>
          </StackPanel>
        </DataTemplate>
      </ListBox.ItemTemplate>
    </ListBox>
  </Grid>
</Window>
'@

# === LAUNCH ===
`$reader = [System.Xml.XmlReader]::Create([IO.StringReader]`$xaml)
`$window = [Windows.Markup.XamlReader]::Load(`$reader)

`$vm = [PSCustomObject]@{
    Items = [System.Collections.ObjectModel.ObservableCollection[object]]::new()
}
`$vm.Items.Add([FileItemViewModel]::new("script.ps1", "File"))
`$vm.Items.Add([FileItemViewModel]::new("photo.png", "Image"))

`$window.DataContext = `$vm
`$window.ShowDialog() | Out-Null
"@

# Format for KPopupClipSaver: # File: Test-WpfSvg.ps1
$ClipContent = @"
# File: Test-WpfSvg.ps1
# Path: v7/Test-WpfSvg.ps1
# Saved via KPopupClipSaver on $(Get-Date -f 'yyyy-MM-dd HH:mm:ss')

$ScriptContent
"@

# Copy to clipboard
[Windows.Forms.Clipboard]::SetText($ClipContent)
Write-Host "Test-WpfSvg.ps1 copied to clipboard! Paste into KPopupClipSaver to save." -ForegroundColor Cyan

# === 2. SVG ICONS (Embedded as XAML Path) ===
$svgIcons = @{
    File = '<Path Data="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" Fill="#B0B0B0"/>'
    Image = '<Path Data="M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z" Fill="#4CAF50"/>'
}

# === 3. MVVM VIEWMODEL ===
class FileItemViewModel : System.ComponentModel.INotifyPropertyChanged {
    [string]$_Name
    [string]$_Type
    [string]$_Icon

    [string] get_Name() { return $this._Name }
    [void] set_Name([string]$value) { $this._Name = $value; $this.OnPropertyChanged('Name') }

    [string] get_Type() { return $this._Type }
    [void] set_Type([string]$value) { $this._Type = $value; $this.OnPropertyChanged('Type') }

    [string] get_Icon() { return $this._Icon }
    [void] set_Icon([string]$value) { $this._Icon = $value; $this.OnPropertyChanged('Icon') }

    [event] System.ComponentModel.PropertyChangedEventHandler PropertyChanged
    [void] OnPropertyChanged([string]$prop) { $this.PropertyChanged?.Invoke($this, (New-Object System.ComponentModel.PropertyChangedEventArgs $prop)) }

    FileItemViewModel([string]$name, [string]$type) {
        $this.Name = $name
        $this.Type = $type
        $this.Icon = $svgIcons[$type]
    }
}

# === 4. XAML WITH SVG PATHS ===
$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="WPF + SVG + MVVM Demo" Height="400" Width="600">
  <Grid Background="#121212">
    <ListBox ItemsSource="{Binding Items}" Margin="20">
      <ListBox.ItemTemplate>
        <DataTemplate>
          <StackPanel Orientation="Horizontal" Margin="5">
            <ContentPresenter Content="{Binding Icon}" Width="24" Height="24" Margin="0,0,10,0"/>
            <TextBlock Text="{Binding Name}" Foreground="White" VerticalAlignment="Center" FontSize="14"/>
            <TextBlock Text="{Binding Type}" Foreground="#B0B0B0" Margin="10,0,0,0" VerticalAlignment="Center"/>
          </StackPanel>
        </DataTemplate>
      </ListBox.ItemTemplate>
    </ListBox>
  </Grid>
</Window>
'@

# === 5. LAUNCH ===
$reader = [System.Xml.XmlReader]::Create([IO.StringReader]$xaml)
$window = [Windows.Markup.XamlReader]::Load($reader)

$vm = [PSCustomObject]@{
    Items = [System.Collections.ObjectModel.ObservableCollection[object]]::new()
}
$vm.Items.Add([FileItemViewModel]::new("script.ps1", "File"))
$vm.Items.Add([FileItemViewModel]::new("photo.png", "Image"))

$window.DataContext = $vm
$window.ShowDialog() | Out-Null


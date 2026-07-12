param(
  [int]$IntervalSeconds = 10,
  [int]$Samples = 60,
  [string]$Output = "memory/node-memory.csv"
)

$ErrorActionPreference = "Stop"

$outputPath = Join-Path (Get-Location) $Output
$outputDir = Split-Path -Parent $outputPath
if ($outputDir -and -not (Test-Path -LiteralPath $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

"timestamp,pid,private_mb,working_set_mb,cpu_seconds,command_line" | Set-Content -LiteralPath $outputPath

for ($i = 1; $i -le $Samples; $i++) {
  $timestamp = (Get-Date).ToString("o")
  $processes = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
    Select-Object ProcessId, CommandLine

  foreach ($proc in $processes) {
    $runtime = Get-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue
    if (-not $runtime) { continue }

    $privateMb = [math]::Round($runtime.PrivateMemorySize64 / 1MB, 1)
    $workingMb = [math]::Round($runtime.WorkingSet64 / 1MB, 1)
    $cpuValue = $runtime.CPU
    if ($null -eq $cpuValue) { $cpuValue = 0 }
    $cpu = [math]::Round($cpuValue, 2)

    $commandValue = $proc.CommandLine
    if ($null -eq $commandValue) { $commandValue = "" }
    $command = $commandValue.Replace('"', '""')

    '"' + $timestamp + '",' +
      $runtime.Id + ',' +
      $privateMb + ',' +
      $workingMb + ',' +
      $cpu + ',"' +
      $command + '"' |
      Add-Content -LiteralPath $outputPath
  }

  Write-Host "[$i/$Samples] sampled node.exe processes -> $outputPath"
  if ($i -lt $Samples) {
    Start-Sleep -Seconds $IntervalSeconds
  }
}

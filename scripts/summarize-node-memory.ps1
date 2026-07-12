param(
  [string]$InputPath = "memory/node-memory.csv"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $InputPath)) {
  throw "Memory log not found: $InputPath"
}

$rows = Import-Csv -LiteralPath $InputPath
if (-not $rows) {
  Write-Host "No samples found."
  exit 0
}

$rows |
  Group-Object pid |
  ForEach-Object {
    $samples = $_.Group | Sort-Object timestamp
    $first = $samples[0]
    $last = $samples[-1]
    $maxPrivate = ($samples | Measure-Object private_mb -Maximum).Maximum
    $minPrivate = ($samples | Measure-Object private_mb -Minimum).Minimum
    $delta = [math]::Round(([double]$last.private_mb - [double]$first.private_mb), 1)

    [pscustomobject]@{
      pid = $_.Name
      samples = $samples.Count
      first_private_mb = [double]$first.private_mb
      last_private_mb = [double]$last.private_mb
      min_private_mb = [double]$minPrivate
      max_private_mb = [double]$maxPrivate
      delta_private_mb = $delta
      command_line = $last.command_line
    }
  } |
  Sort-Object max_private_mb -Descending |
  Format-Table -AutoSize -Wrap

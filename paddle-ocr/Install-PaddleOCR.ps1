[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$venvRoot = Join-Path $projectRoot '.paddleocr-venv'
$python = $null
foreach ($candidate in @(@{ Command = 'py'; Arguments = @('-3.11') }, @{ Command = 'py'; Arguments = @('-3') }, @{ Command = 'python'; Arguments = @() })) {
  if (Get-Command $candidate.Command -ErrorAction SilentlyContinue) {
    try {
      & $candidate.Command @($candidate.Arguments) --version 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) { $python = $candidate; break }
    } catch { }
  }
}
if (-not $python) {
  Write-Host 'Python 3 was not found. Install Python 3.10 or 3.11 from:' -ForegroundColor Yellow
  Write-Host 'https://www.python.org/downloads/windows/'
  Write-Host 'During setup, select Add python.exe to PATH, then run this installer again.'
  exit 1
}
Write-Host "Using Python: $(& $python.Command @($python.Arguments) --version)"
if (-not (Test-Path $venvRoot)) {
  Write-Host 'Creating the isolated PaddleOCR environment...'
  & $python.Command @($python.Arguments) -m venv $venvRoot
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$venvPython = Join-Path $venvRoot 'Scripts\python.exe'
Write-Host 'Installing PaddlePaddle, PaddleOCR, and image dependencies. First install may take several minutes...'
& $venvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $venvPython -m pip install 'paddlepaddle>=3.0.0' 'paddleocr>=3.0.0,<4.0.0' Pillow
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$env:PADDLE_PDX_MODEL_SOURCE = 'BOS'
Write-Host 'Downloading and warming up the Traditional Chinese precision model...'
& $venvPython (Join-Path $PSScriptRoot 'paddle_ocr_service.py') --warmup
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host 'PaddleOCR precision mode is installed. Start the main launcher to use it.' -ForegroundColor Green

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (!(Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale Node.js 22 ou superior para iniciar.' }
if ([int]((& node --version).TrimStart('v').Split('.')[0]) -lt 22) { throw 'Atualize o Node.js para 22 ou superior.' }
if (!(Test-Path -LiteralPath 'node_modules\vite')) { & npm.cmd ci; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
& node 'node_modules\vite\bin\vite.js' --host localhost --port 5173 --strictPort

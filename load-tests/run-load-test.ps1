# load-tests/run-load-test.ps1
# Script completo para executar load tests no INNOVA
# Uso: .\load-tests\run-load-test.ps1 [smoke|load|stress|spike]
# Exemplo: .\load-tests\run-load-test.ps1 load

param(
    [string]$Test = "smoke"
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot

Write-Host "`n=== INNOVA Load Test Runner ===" -ForegroundColor Cyan
Write-Host "Teste: $Test" -ForegroundColor Yellow
Write-Host "Working dir: $RootDir`n"

Set-Location $RootDir

# 1. Build
Write-Host "[1/5] A compilar o projecto..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Build falhou"; exit 1 }
Write-Host "✅ Build concluído`n"

# 2. Iniciar servidor em background
Write-Host "[2/5] A iniciar servidor (NODE_ENV=test)..." -ForegroundColor Cyan
$env:UV_THREADPOOL_SIZE = "16"
$env:NODE_ENV = "test"
$env:DB_POOL_MAX = "50"
$serverJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    $env:UV_THREADPOOL_SIZE = "16"
    $env:NODE_ENV = "test"
    $env:DB_POOL_MAX = "50"
    node dist/main.js 2>&1
} -ArgumentList $RootDir

# 3. Aguardar servidor
Write-Host "[3/5] A aguardar servidor na porta 4000..." -ForegroundColor Cyan
$attempts = 0
$maxAttempts = 60
do {
    Start-Sleep -Seconds 2
    $attempts++
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:4000/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -lt 500) { break }
    } catch {
        # servidor ainda não pronto
    }
    if ($attempts -ge $maxAttempts) {
        Write-Error "❌ Servidor não iniciou em $($maxAttempts * 2)s"
        Stop-Job $serverJob; Remove-Job $serverJob
        exit 1
    }
    Write-Host "  ... aguardando ($attempts/$maxAttempts)"
} while ($true)
Write-Host "✅ Servidor pronto!`n"

# 4. Seed
Write-Host "[4/5] A executar seed de dados de teste..." -ForegroundColor Cyan
npm run seed:loadtest
if ($LASTEXITCODE -ne 0) {
    Write-Warning "⚠️  Seed falhou ou dados já existem — a continuar"
}
Write-Host "✅ Seed concluído`n"

# 5. Executar teste
Write-Host "[5/5] A executar: npm run test:$Test" -ForegroundColor Cyan
npm run "test:$Test"
$testExit = $LASTEXITCODE

# Parar servidor
Write-Host "`nA parar servidor..." -ForegroundColor Yellow
Stop-Job $serverJob -ErrorAction SilentlyContinue
Remove-Job $serverJob -ErrorAction SilentlyContinue

if ($testExit -eq 0) {
    Write-Host "`n✅ Teste '$Test' concluído com sucesso!" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  Teste '$Test' concluído com alertas (exit $testExit)" -ForegroundColor Yellow
}

exit $testExit

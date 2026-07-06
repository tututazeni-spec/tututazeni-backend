# scripts/precheck.ps1
# Corre localmente tudo o que o CI corre, na mesma ordem, para apanhar erros
# antes do push. Para no primeiro erro (nao continua "as cegas").

$ErrorActionPreference = "Stop"

function Run-Step($nome, $comando) {
    Write-Host "==> $nome" -ForegroundColor Cyan
    Invoke-Expression $comando
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FALHOU: $nome" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "OK: $nome`n" -ForegroundColor Green
}

Run-Step "Prisma generate" "npx prisma generate"
Run-Step "Lint"            "npm run lint"
Run-Step "Build backend"   "npm run build"
Run-Step "Testes"          "npm run test"

Write-Host "Tudo verde. Podes fazer commit/push com confianca." -ForegroundColor Green

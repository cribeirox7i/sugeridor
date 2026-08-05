<#
.SYNOPSIS
  Roda o coletor (scraper/run.py) direto desta máquina, em vez de esperar o
  GitHub Actions — útil pra lojas que bloqueiam o IP de datacenter do runner
  (ex: Invicta, ver docs/06-riscos-e-legal.md) mas aceitam o IP de uma rede
  doméstica/escritório comum.

.PARAMETER StoreIds
  Id(s) de loja separados por vírgula (SCRAPER_STORE_IDS). Vazio = coleta
  todas as lojas marcadas no admin, igual ao botão "Rodar coleta".

.PARAMETER Save
  Grava SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em scraper/.env.local
  (arquivo ignorado pelo git — nunca é commitado) pra não precisar digitar
  de novo nas próximas execuções.

.EXAMPLE
  .\scraper\run-local.ps1 -StoreIds "uuid-da-invicta" -Save
#>
param(
    [string]$StoreIds = "",
    [switch]$Save
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $PSScriptRoot ".env.local"

# Carrega SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY salvos numa execução anterior
# (se existir), pra não perguntar de novo.
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([A-Z_]+)=(.*)$') {
            Set-Item -Path "env:$($matches[1])" -Value $matches[2]
        }
    }
}

if (-not $env:SUPABASE_URL) {
    $env:SUPABASE_URL = Read-Host "SUPABASE_URL (ex: https://xxxx.supabase.co)"
}
if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
    $secure = Read-Host "SUPABASE_SERVICE_ROLE_KEY (mesma chave da Vercel)" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $env:SUPABASE_SERVICE_ROLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if ($StoreIds) {
    $env:SCRAPER_STORE_IDS = $StoreIds
} elseif (-not $env:SCRAPER_STORE_IDS) {
    $env:SCRAPER_STORE_IDS = Read-Host "SCRAPER_STORE_IDS (id da loja; Enter em branco = todas as lojas marcadas)"
}

if ($Save) {
    Set-Content -Path $envFile -Encoding utf8 -Value @(
        "SUPABASE_URL=$($env:SUPABASE_URL)"
        "SUPABASE_SERVICE_ROLE_KEY=$($env:SUPABASE_SERVICE_ROLE_KEY)"
    )
    Write-Host "Credenciais salvas em $envFile (fora do git, só nesta máquina)." -ForegroundColor DarkGray
}

Write-Host "Instalando dependências..." -ForegroundColor DarkGray
pip install -q -r (Join-Path $repoRoot "scraper\requirements.txt")

Push-Location $repoRoot
try {
    python -m scraper.run
} finally {
    Pop-Location
}

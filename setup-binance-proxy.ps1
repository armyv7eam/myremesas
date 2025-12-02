# Script de Configuración de Binance Proxy Worker

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Configuracion de Binance Proxy Worker" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location binance-proxy

Write-Host "[1/4] Desplegando Worker a Cloudflare..." -ForegroundColor Yellow
npx wrangler deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: No se pudo desplegar el worker" -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Green
Write-Host "Worker desplegado exitosamente!" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANTE: Copia la URL que aparece arriba" -ForegroundColor Yellow
Write-Host "Ejemplo: https://binance-proxy.tu-usuario.workers.dev" -ForegroundColor Yellow
Write-Host ""
Write-Host "La necesitaras para configurar Vercel" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Read-Host "Presiona Enter para continuar con la configuracion de secrets"

Write-Host "[2/4] Configurando BINANCE_API_KEY..." -ForegroundColor Yellow
npx wrangler secret put BINANCE_API_KEY
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: No se pudo configurar BINANCE_API_KEY" -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}
Write-Host ""

Write-Host "[3/4] Configurando BINANCE_API_SECRET..." -ForegroundColor Yellow
npx wrangler secret put BINANCE_API_SECRET
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: No se pudo configurar BINANCE_API_SECRET" -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Green
Write-Host "Configuracion completada!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "PROXIMOS PASOS:" -ForegroundColor Cyan
Write-Host "1. Ve a tu proyecto en Vercel Dashboard" -ForegroundColor White
Write-Host "2. Settings -> Environment Variables" -ForegroundColor White
Write-Host "3. Agrega: BINANCE_PROXY_URL = [URL del worker]" -ForegroundColor White
Write-Host "4. Redespliega tu proyecto en Vercel" -ForegroundColor White
Write-Host ""
Read-Host "Presiona Enter para salir"

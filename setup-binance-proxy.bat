@echo off
echo ========================================
echo Configuracion de Binance Proxy Worker
echo ========================================
echo.

cd binance-proxy

echo [1/4] Desplegando Worker a Cloudflare...
call npx wrangler deploy
if %errorlevel% neq 0 (
    echo ERROR: No se pudo desplegar el worker
    pause
    exit /b 1
)
echo.

echo ========================================
echo Worker desplegado exitosamente!
echo.
echo IMPORTANTE: Copia la URL que aparece arriba
echo Ejemplo: https://binance-proxy.tu-usuario.workers.dev
echo.
echo La necesitaras para configurar Vercel
echo ========================================
echo.

echo [2/4] Ahora vamos a configurar los secrets...
echo.
echo Ingresa tu BINANCE_API_KEY cuando se solicite:
call npx wrangler secret put BINANCE_API_KEY
if %errorlevel% neq 0 (
    echo ERROR: No se pudo configurar BINANCE_API_KEY
    pause
    exit /b 1
)
echo.

echo Ingresa tu BINANCE_API_SECRET cuando se solicite:
call npx wrangler secret put BINANCE_API_SECRET
if %errorlevel% neq 0 (
    echo ERROR: No se pudo configurar BINANCE_API_SECRET
    pause
    exit /b 1
)
echo.

echo ========================================
echo Configuracion completada!
echo ========================================
echo.
echo PROXIMOS PASOS:
echo 1. Ve a tu proyecto en Vercel Dashboard
echo 2. Settings -^> Environment Variables
echo 3. Agrega: BINANCE_PROXY_URL = [URL del worker]
echo 4. Redespliega tu proyecto en Vercel
echo.
pause

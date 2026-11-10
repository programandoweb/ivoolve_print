@echo off
setlocal EnableExtensions
title ivoolve_print - Produccion
cd /d "%~dp0" || (echo [ERROR] No fue posible abrir la carpeta del proyecto. & pause & exit /b 1)

where node >nul 2>&1 || (echo [ERROR] Node.js no esta disponible en PATH. & pause & exit /b 1)
where npm >nul 2>&1 || (echo [ERROR] npm no esta disponible en PATH. & pause & exit /b 1)

if not exist "node_modules" (
  echo [ERROR] Faltan dependencias. Ejecuta npm install en la raiz del proyecto.
  pause
  exit /b 1
)

echo [1/3] Compilando API NestJS...
call npm run build --workspace=api
if errorlevel 1 (
  echo [ERROR] Fallo la compilacion de la API. No se iniciara produccion.
  pause
  exit /b 1
)
if not exist "apps\api\dist\main.js" (
  echo [ERROR] No se encontro apps\api\dist\main.js.
  pause
  exit /b 1
)

echo [2/3] Comprobando puerto 3031...
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3031 -State Listen -ErrorAction SilentlyContinue) { exit 1 }"
if errorlevel 1 (
  echo [ERROR] El puerto 3031 esta ocupado. Cierra la API anterior antes de continuar.
  pause
  exit /b 1
)

echo [3/3] Iniciando API compilada y Electron...
set "NODE_ENV=production"
start "ivoolve_print API - Produccion" /min cmd /c "cd /d ""%~dp0"" && set NODE_ENV=production&& node apps\api\dist\main.js"
powershell -NoProfile -Command "$ok=$false; for($i=0;$i -lt 30;$i++){if(Get-NetTCPConnection -LocalPort 3031 -State Listen -ErrorAction SilentlyContinue){$ok=$true;break}; Start-Sleep -Milliseconds 500}; if(-not $ok){exit 1}"
if errorlevel 1 (
  echo [ERROR] La API no comenzo a escuchar en el puerto 3031.
  echo Revisa la ventana de la API para identificar el problema.
  pause
  exit /b 1
)

rem Electron usa el frontend remoto de produccion configurado en runtime-config.js.
rem No se inicia Next.js dev ni electronmon.
call npm exec --workspace=desktop -- electron .
if errorlevel 1 (
  echo [ERROR] Electron termino con error.
  pause
  exit /b 1
)
echo Electron se cerro. La API continua ejecutandose en su propia ventana.
endlocal

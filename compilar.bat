@echo off
setlocal EnableExtensions
title ivoolve_print - Compilar API
cd /d "%~dp0" || (echo [ERROR] No se pudo abrir el directorio. & pause & exit /b 1)
where node >nul 2>&1 || (echo [ERROR] Node.js no esta disponible en PATH. & pause & exit /b 1)
where npm >nul 2>&1 || (echo [ERROR] npm no esta disponible en PATH. & pause & exit /b 1)
if not exist "node_modules" (
  echo [ERROR] Faltan dependencias. Ejecuta npm install en la raiz del proyecto.
  pause
  exit /b 1
)
echo [1/2] Compilando API NestJS...
call npm run build --workspace=api
if errorlevel 1 (
  echo [ERROR] Fallo la compilacion de la API.
  pause
  exit /b 1
)
echo [2/2] Comprobando archivos compilados...
if not exist "apps\api\dist\main.js" (
  echo [ERROR] No se genero apps\api\dist\main.js.
  pause
  exit /b 1
)
echo [OK] API compilada. Ahora puedes ejecutar produccion.bat.
pause
endlocal

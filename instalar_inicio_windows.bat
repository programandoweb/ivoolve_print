@echo off
setlocal EnableExtensions
title ivoolve_print - Configurar inicio automatico
cd /d "%~dp0" || (echo [ERROR] No se pudo abrir la carpeta del proyecto. & pause & exit /b 1)

if not exist "%~dp0produccion.bat" (
  echo [ERROR] No existe produccion.bat en la carpeta del proyecto.
  pause
  exit /b 1
)
if not exist "%~dp0apps\api\dist\main.js" (
  echo [ERROR] Primero ejecuta compilar.bat para preparar la API.
  pause
  exit /b 1
)

rem El acceso directo se crea para el usuario actual; no requiere permisos de administrador.
rem Electron necesita una sesion interactiva, por eso se inicia al iniciar sesion.
set "IVOOLVE_PRINT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $startup=[Environment]::GetFolderPath('Startup'); $link=Join-Path $startup 'ivoolve_print - Produccion.lnk'; $shell=New-Object -ComObject WScript.Shell; $shortcut=$shell.CreateShortcut($link); $shortcut.TargetPath=Join-Path $env:IVOOLVE_PRINT_DIR 'produccion.bat'; $shortcut.WorkingDirectory=$env:IVOOLVE_PRINT_DIR; $shortcut.WindowStyle=7; $shortcut.Description='Iniciar ivoolve_print en produccion al iniciar sesion en Windows'; $shortcut.Save(); Write-Host ('[OK] Inicio automatico configurado: '+$link)"
if errorlevel 1 (
  echo [ERROR] No fue posible crear el acceso directo de inicio automatico.
  pause
  exit /b 1
)
echo.
echo [OK] ivoolve_print se abrira cuando este usuario inicie sesion en Windows.
echo No es necesario ejecutarlo manualmente despues de iniciar sesion.
pause
endlocal

@echo off
setlocal

rem ---------------------------------------------------
rem  Crea un acceso directo en el escritorio
rem  para el archivo entorno.bat ubicado en
rem  el mismo directorio que este script
rem ---------------------------------------------------

set "BASE_DIR=%~dp0"
set "TARGET=%BASE_DIR%entorno.bat"
set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT=%DESKTOP%\Entorno.lnk"
set "VBS=%TEMP%\crear_acceso_directo.vbs"

if not exist "%TARGET%" (
    echo No se encontró "%TARGET%"
    pause
    exit /b 1
)

> "%VBS%" echo Set oWS = CreateObject("WScript.Shell")
>>"%VBS%" echo sLinkFile = "%SHORTCUT%"
>>"%VBS%" echo Set oLink = oWS.CreateShortcut(sLinkFile)
>>"%VBS%" echo oLink.TargetPath = "%TARGET%"
>>"%VBS%" echo oLink.WorkingDirectory = "%BASE_DIR%"
>>"%VBS%" echo oLink.IconLocation = "%SystemRoot%\System32\cmd.exe,0"
>>"%VBS%" echo oLink.Save

cscript //nologo "%VBS%"
del "%VBS%"

echo Acceso directo creado en el escritorio.
pause
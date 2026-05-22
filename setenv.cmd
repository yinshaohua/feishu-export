@echo off
set "PROJECT_ROOT=%CD%"
for %%I in ("%CD%") do set "PROJECT_NAME=%%~nxI"
set "EXTERNAL_ROOT=C:/local_data/%PROJECT_NAME%"
set "EXTERNAL_NODE_MODULES=%EXTERNAL_ROOT%/node_modules"
set "EXTERNAL_NODE_BIN=%EXTERNAL_NODE_MODULES%/.bin"

if not exist "%EXTERNAL_ROOT%" mkdir "%EXTERNAL_ROOT%"
for %%F in (package.json package-lock.json .npmrc) do (
  if exist "%PROJECT_ROOT%\%%F" copy /Y "%PROJECT_ROOT%\%%F" "%EXTERNAL_ROOT%\%%F" >nul
)

set "NODE_PATH=%EXTERNAL_NODE_MODULES%"
for /f "usebackq delims=" %%P in (`powershell.exe -NoProfile -Command "$bin = '%EXTERNAL_NODE_BIN%'; (($env:PATH -split ';') | Where-Object { $_ -and ($_.TrimEnd('\/') -ine $bin.TrimEnd('\/')) }) -join ';'"`) do set "PATH_TAIL=%%P"
if defined PATH_TAIL (
  set "PATH=%EXTERNAL_NODE_BIN%;%PATH_TAIL%"
) else (
  set "PATH=%EXTERNAL_NODE_BIN%"
)
set "PATH_TAIL="
for /f "tokens=1 delims=;" %%A in ("%PATH%") do set "PATH_FIRST=%%A"

echo External node_modules enabled:
echo EXTERNAL_ROOT=%EXTERNAL_ROOT%
echo EXTERNAL_NODE_MODULES=%EXTERNAL_NODE_MODULES%
echo NODE_PATH=%NODE_PATH%
echo PATH[0]=%PATH_FIRST%
echo Synced npm manifest files to %EXTERNAL_ROOT%

@echo off
for %%I in ("%CD%") do set "PROJECT_NAME=%%~nxI"
set "EXTERNAL_NODE_MODULES=C:/local_data/%PROJECT_NAME%/node_modules"
set "EXTERNAL_NODE_BIN=%EXTERNAL_NODE_MODULES%/.bin"

set "NODE_PATH=%EXTERNAL_NODE_MODULES%"
set "PATH=%EXTERNAL_NODE_BIN%;%PATH%"

for /f "tokens=1 delims=;" %%A in ("%PATH%") do set "PATH_FIRST=%%A"

echo External node_modules enabled:
echo EXTERNAL_NODE_MODULES=%EXTERNAL_NODE_MODULES%
echo NODE_PATH=%NODE_PATH%
echo PATH[0]=%PATH_FIRST%

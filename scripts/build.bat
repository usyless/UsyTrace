@echo off
setlocal enabledelayedexpansion

set EMSCRIPTEN_CONFIG_FILE=build_config.txt

set EMSDK_QUIET=1

:: working directory as directory of script itself
cd /d "%~dp0"

:: Set environment variables from emscripten config
if exist "%EMSCRIPTEN_CONFIG_FILE%" (
    echo Setting up environment from %EMSCRIPTEN_CONFIG_FILE%

    for /f "delims=" %%a in (%EMSCRIPTEN_CONFIG_FILE%) do (
        echo Running %%a
        call "%%a"
    )
)

:: Check if emcc is available
call emcc --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: emcc unavailable, create a %EMSCRIPTEN_CONFIG_FILE% file and add the path of your emsdk_env.bat file.
    exit /b 1
)

:: Go up to root of project
cd ..

echo.
echo Building
echo.

:: Check arguments
set "DEBUG_MODE=false"
set "COMPILE_ALL=true"
set "DO_WASM=false"
set "DO_JS=false"
set "DO_CSS=false"
set "DO_DIST=false"

for %%i in (%*) do (
    if "%%i"=="--debug" (
        set "DEBUG_MODE=true"
    ) else if "%%i"=="--js" (
        set "COMPILE_ALL=false"
        set "DO_JS=true"
    ) else if "%%i"=="--css" (
        set "COMPILE_ALL=false"
        set "DO_CSS=true"
    ) else if "%%i"=="--wasm" (
        set "COMPILE_ALL=false"
        set "DO_WASM=true"
    ) else if "%%i"=="--dist" (
        set "COMPILE_ALL=false"
        set "DO_DIST=true"
    )
)

if "!COMPILE_ALL!"=="true" (
    if "!DEBUG_MODE!"=="true" (
        call npm run build:debug
    ) else (
        call npm run build
    )
) else (
    if "!DO_WASM!"=="true" (
        call :buildWasm
    )
    if "!DO_JS!"=="true" (
        call :buildJs
    )
    if "!DO_CSS!"=="true" (
        call :buildCss
    )
    if "!DO_DIST!"=="true" (
        call :buildDist
    )
)

exit /b

:: functions

:buildCss
call npm run build:css
exit /b

:buildJs
call npm run build:js
exit /b

:buildDist
call npm run build:dist
exit /b

:buildWasm
if "!DEBUG_MODE!"=="true" (
    call npm run build:wasm:debug
) else (
    call npm run build:wasm
)
exit /b
@echo off
setlocal enabledelayedexpansion

set EMSCRIPTEN_CONFIG_FILE=build_config.txt

set "MINIFIED_JS_FILES=state.js main.js popups.js tutorial.js about.js updater.js themes.js"

set "MINIFIED_CSS_FILES=main.css popup.css tutorial.css shared.css"

set EMSDK_QUIET=1

set "OUTPUT_DIR=../dist"

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

:: Enter src directory
pushd src

echo.
echo Building
echo.

:: Check arguments
set "DEBUG_MODE=false"
set "COMPILE_ALL=true"
set "DO_WASM=false"
set "DO_JS=false"
set "DO_CSS=false"

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
    )
)

if "%COMPILE_ALL%"=="true" (
    call :buildWasm
    call :buildJs
    call :buildCss
) else (
    if "%DO_WASM%"=="true" (
        call :buildWasm
    )
    if "%DO_JS%"=="true" (
        call :buildJs
    )
    if "%DO_CSS%"=="true" (
        call :buildCss
    )
)

:: Exit src directory
popd

echo Build Finished

exit /b

:: functions

:buildCss
echo Minifying css
echo.
call node ../minify-css.js --in-css !MINIFIED_CSS_FILES! --out-css "%OUTPUT_DIR%/main.min.css"
exit /b

:buildJs
echo Compiling js
echo.
call npx -y google-closure-compiler ^
        --language_in=ECMASCRIPT_2020 --language_out=ECMASCRIPT_2020 ^
        --compilation_level ADVANCED ^
        --js !MINIFIED_JS_FILES! ^
        --js_output_file "%OUTPUT_DIR%/main.min.js"
exit /b

:buildWasm
cd ..
mkdir build 2>nul
cd build
if "!DEBUG_MODE!"=="true" (
    echo Compiling debug wasm
    echo.
    call emcmake cmake -DCMAKE_BUILD_TYPE=Debug ..
    call cmake --build . --config Debug
) else (
    echo Compiling release wasm
    echo.
    call emcmake cmake -DCMAKE_BUILD_TYPE=Release ..
    call cmake --build . --config Release
)
cd ../src
exit /b
@echo off
setlocal enabledelayedexpansion

set EMSCRIPTEN_CONFIG_FILE=build_config.txt

:: sMEMORY_GROWTH_LINEAR_STEP = 48 * 1024 * 1024
:: sINITIAL_HEAP = 96 * 1024 * 1024
set "EMCC_SHARED_PARAMETERS=imageTracer.cpp -O3 -sWASM=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_HEAP=100663296 -sFILESYSTEM=0 -sENVIRONMENT=worker -sMEMORY64=0 -sMEMORY_GROWTH_LINEAR_STEP=50331648 -fno-rtti -flto --closure 1 --post-js worker.js"

set "MINIFIED_JS_FILES=state.js main.js popups.js tutorial.js about.js updater.js"

set "MINIFIED_CSS_FILES=main.css popup.css tutorial.css shared.css"

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
    if "%%i"=="--wasm-debug" (
        set "DEBUG_MODE=true"
        set "COMPILE_ALL=false"
        set "DO_WASM=true"
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
call node ../minify-css.js --in-css !MINIFIED_CSS_FILES!
exit /b

:buildJs
echo Compiling js
echo.
call "%EMSDK%\upstream\emscripten\node_modules\google-closure-compiler-windows\compiler.exe" ^
        --language_in=ECMASCRIPT_2020 --language_out=ECMASCRIPT_2020 ^
        --compilation_level ADVANCED ^
        --js !MINIFIED_JS_FILES! ^
        --js_output_file main.min.js
exit /b

:buildWasm
if "%DEBUG_MODE%"=="true" (
    echo Compiling debug wasm
    echo.
    call emcc !EMCC_SHARED_PARAMETERS! -sASSERTIONS=1 -sNO_DISABLE_EXCEPTION_CATCHING
) else (
    echo Compiling release wasm
    echo.
    call emcc !EMCC_SHARED_PARAMETERS! -sASSERTIONS=0 -g0 -fno-exceptions
)
exit /b
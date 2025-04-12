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

:: Check arguments
set "DEBUG_MODE=false"
set "NO_COMPILE=false"
for %%i in (%*) do (
    if "%%i"=="--debug" (
        set "DEBUG_MODE=true"
    ) else (
    if "%%i"=="--no-compile" (
        set "NO_COMPILE=true"
    )
    )
)

:: Change into src directory
pushd src

echo.
echo Building
echo.

:: sMEMORY_GROWTH_LINEAR_STEP = 48 * 1024 * 1024
:: sINITIAL_HEAP = 96 * 1024 * 1024
set "SHARED_PARAMETERS=-O3 -sWASM=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_HEAP=100663296 -sFILESYSTEM=0 -sENVIRONMENT=worker -sMEMORY64=0 -sMEMORY_GROWTH_LINEAR_STEP=50331648 -fno-rtti -flto --closure 1 --post-js worker.js"

if "%NO_COMPILE%"=="false" (
    if "%DEBUG_MODE%"=="true" (
        echo Compiling debug wasm
        echo.
        call emcc imageTracer.cpp %SHARED_PARAMETERS% -sASSERTIONS=1 -sNO_DISABLE_EXCEPTION_CATCHING
    ) else (
        echo Compiling release wasm
        echo.
        call emcc imageTracer.cpp %SHARED_PARAMETERS% -sASSERTIONS=0 -g0 -fno-exceptions
    )
) else (
    echo Skipping wasm compilation
    echo.
)

call "%EMSDK%\upstream\emscripten\node_modules\google-closure-compiler-windows\compiler.exe" ^
        --language_in=ECMASCRIPT_2020 --language_out=ECMASCRIPT_2020 ^
        --compilation_level ADVANCED ^
        --js state.js main.js popups.js tutorial.js about.js updater.js ^
        --js_output_file main.min.js
call node ../minify-css.js --in-css main.css popup.css tutorial.css shared.css

:: exit from src directory
popd

echo Build Finished
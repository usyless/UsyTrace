@echo off
setlocal enabledelayedexpansion

set EMSDK_QUIET=1

:: Set environment variables from build_config
if exist "build_config.txt" (
    echo Setting up environment from build_config

    :: Iterate through each line in build_config.txt
    for /f "delims=" %%a in (build_config.txt) do (
        echo Running %%a
        call %%a
    )
)

:: Check if emcc is available
call emcc --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: emcc unavailable, create a build_config.txt file and add the path of your emsdk_env.bat file.
    pause
    exit /b 1
)

:: Check if the --debug argument is present
set "DEBUG_MODE=false"
for %%i in (%*) do (
    if "%%i"=="--debug" (
        set "DEBUG_MODE=true"
    )
)

:: Change into src directory
pushd src

echo.
echo Building
echo.

if "%DEBUG_MODE%"=="true" (
    echo Making debug version
    echo.
    call emcc imageTracer.cpp -O3 -sWASM=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_HEAP=104857600 -sASSERTIONS=1 -sFILESYSTEM=0 -sENVIRONMENT=worker -fno-rtti -flto -sNO_DISABLE_EXCEPTION_CATCHING
) else (
    call emcc imageTracer.cpp -O3 -sWASM=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_HEAP=104857600 -sASSERTIONS=0 -sFILESYSTEM=0 -sENVIRONMENT=worker -fno-rtti -flto -g0 -fno-exceptions --closure 1 --post-js worker.js
    call "%EMSDK%\upstream\emscripten\node_modules\google-closure-compiler-windows\compiler.exe" ^
            --language_in=ECMASCRIPT_2020 --language_out=ECMASCRIPT_2020 ^
            --compilation_level ADVANCED ^
            --js state.js main.js popups.js tutorial.js about.js updater.js ^
            --js_output_file main.min.js
)

:: exit from src directory
popd

echo Build Finished
pause

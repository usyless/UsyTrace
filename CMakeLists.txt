# cmake_minimum_required(VERSION 4.2)
cmake_minimum_required(VERSION 3.20)

project(UsyTrace LANGUAGES CXX)


set(CMAKE_SKIP_INSTALL_ALL_DEPENDENCY ON)
set(CMAKE_SKIP_INSTALL_RULES ON)

# set(CMAKE_SYSTEM_NAME Emscripten)
# set(CMAKE_SYSTEM_VERSION 4.0.22)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# set(CMAKE_C_COMPILER emcc)
# set(CMAKE_CXX_COMPILER em++)
# set(CMAKE_AR emar)
# set(CMAKE_RANLIB emranlib)


add_executable(UsyTrace 
    ${PROJECT_SOURCE_DIR}/src/imageTracer.cpp
)

set_target_properties(UsyTrace PROPERTIES CXX_SCAN_FOR_MODULES OFF)

target_compile_options(UsyTrace PRIVATE
    -sMEMORY64=0
    -sSTRICT

    $<$<CONFIG:Debug>:
        -sNO_DISABLE_EXCEPTION_CATCHING
    >

    $<$<CONFIG:Release>:
        -g0
        -fno-exceptions
        -O3
        -flto
        -fno-rtti
    >
)

target_link_options(UsyTrace PRIVATE
    --pre-js ${PROJECT_SOURCE_DIR}/src/worker.js
    -sSTRICT_JS
    -sMEMORY_GROWTH_LINEAR_STEP=50331648
    -sWASM=1
    -sALLOW_MEMORY_GROWTH=1
    -sINITIAL_HEAP=100663296
    -sFILESYSTEM=0
    -sENVIRONMENT=worker
    -sINCOMING_MODULE_JS_API=onRuntimeInitialized
    -sEXPORTED_RUNTIME_METHODS=[]
    -sMEMORY64=0
    -sSTRICT

    $<$<CONFIG:Debug>:
        -sASSERTIONS=1
        -sNO_DISABLE_EXCEPTION_CATCHING
    >

    $<$<CONFIG:Release>:
        -sASSERTIONS=0
        --closure=1
        -flto
        --no-entry
        -s
    >
)

add_custom_command(TARGET UsyTrace POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory ${PROJECT_SOURCE_DIR}/dist
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        ${CMAKE_CURRENT_BINARY_DIR}/UsyTrace.js
        ${PROJECT_SOURCE_DIR}/dist/UsyTrace.js
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        ${CMAKE_CURRENT_BINARY_DIR}/UsyTrace.wasm
        ${PROJECT_SOURCE_DIR}/dist/UsyTrace.wasm
)

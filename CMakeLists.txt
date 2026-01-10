# cmake_minimum_required(VERSION 4.2)
cmake_minimum_required(VERSION 3.20)

project(usytrace LANGUAGES CXX)


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


add_executable(usytrace 
    ${PROJECT_SOURCE_DIR}/src/imageTracer.cpp
)

include(FetchContent)

FetchContent_Declare(
    usylibpp
    GIT_REPOSITORY https://github.com/usyless/usylibpp.git
    GIT_TAG main
    GIT_SHALLOW TRUE
)

FetchContent_MakeAvailable(usylibpp)

target_link_libraries(usytrace PRIVATE usylibpp::usylibpp)

set_target_properties(usytrace PROPERTIES CXX_SCAN_FOR_MODULES OFF)

if(NOT CMAKE_EXPORT_COMPILE_COMMANDS) 
    target_compile_options(usytrace PRIVATE
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

    target_link_options(usytrace PRIVATE
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
endif()

add_custom_command(TARGET usytrace POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory ${PROJECT_SOURCE_DIR}/dist
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        ${CMAKE_CURRENT_BINARY_DIR}/usytrace.js
        ${PROJECT_SOURCE_DIR}/dist/usytrace.js
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        ${CMAKE_CURRENT_BINARY_DIR}/usytrace.wasm
        ${PROJECT_SOURCE_DIR}/dist/usytrace.wasm
)

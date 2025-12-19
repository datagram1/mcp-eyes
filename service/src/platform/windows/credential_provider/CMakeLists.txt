# ScreenControl Credential Provider
# Copyright (c) 2024 ScreenControl. All rights reserved.
#
# NOTE: This must be built with MSVC on Windows. COM DLLs cannot be
# cross-compiled with MinGW/Zig from other platforms.
#
# Build instructions:
#   1. Open Developer Command Prompt for VS 2019/2022
#   2. cd to this directory
#   3. mkdir build && cd build
#   4. cmake .. -G "Visual Studio 17 2022" -A x64
#   5. cmake --build . --config Release
#
# Or use the provided Visual Studio solution file.

cmake_minimum_required(VERSION 3.16)
project(ScreenControlCredentialProvider VERSION 1.0.0 LANGUAGES CXX)

# Require MSVC
if(NOT MSVC)
    message(FATAL_ERROR "This project must be built with MSVC (Visual Studio)")
endif()

# C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Security flags
add_compile_options(
    /W4             # Warning level 4
    /WX             # Treat warnings as errors
    /GS             # Buffer security check
    /guard:cf       # Control flow guard
    /DYNAMICBASE    # ASLR
    /NXCOMPAT       # DEP
    /sdl            # Additional security checks
)

# Static runtime linkage (no VC runtime dependency)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

# Source files
set(SOURCES
    dll_main.cpp
    ScreenControlCredentialProvider.cpp
    ScreenControlCredential.cpp
)

set(HEADERS
    guid.h
    ScreenControlCredentialProvider.h
    ScreenControlCredential.h
    resource.h
)

set(RESOURCES
    resources.rc
)

# Create the DLL
add_library(ScreenControlCP SHARED
    ${SOURCES}
    ${HEADERS}
    ${RESOURCES}
    exports.def
)

# Include directories
target_include_directories(ScreenControlCP PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/..
)

# Link libraries
target_link_libraries(ScreenControlCP PRIVATE
    Secur32.lib
    Credui.lib
    Advapi32.lib
    Ole32.lib
    OleAut32.lib
    Ws2_32.lib
    Shlwapi.lib
)

# Output settings
set_target_properties(ScreenControlCP PROPERTIES
    OUTPUT_NAME "ScreenControlCP"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
    LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)

# Post-build: Copy to dist directory
add_custom_command(TARGET ScreenControlCP POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy
        "$<TARGET_FILE:ScreenControlCP>"
        "${CMAKE_SOURCE_DIR}/../../../../../dist/windows-${CMAKE_GENERATOR_PLATFORM}/ScreenControlCP.dll"
    COMMENT "Copying ScreenControlCP.dll to dist directory"
)

# Installation
install(TARGETS ScreenControlCP
    RUNTIME DESTINATION bin
    LIBRARY DESTINATION bin
)

# Generate Visual Studio solution for convenience
set_property(GLOBAL PROPERTY USE_FOLDERS ON)

cmake_minimum_required(VERSION 3.20)
project(MCPEyesWindows VERSION 2.0.0 LANGUAGES CXX RC)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Windows-specific settings
if(WIN32)
    set(CMAKE_SYSTEM_NAME Windows)
    add_definitions(-DUNICODE -D_UNICODE)
    set(CMAKE_RC_COMPILER_INIT windres)
    enable_language(RC)
elseif(CMAKE_CROSSCOMPILING)
    # Cross-compiling from Linux
    set(CMAKE_SYSTEM_NAME Windows)
    set(CMAKE_SYSTEM_PROCESSOR x86_64)
    set(CMAKE_C_COMPILER x86_64-w64-mingw32-gcc)
    set(CMAKE_CXX_COMPILER x86_64-w64-mingw32-g++)
    set(CMAKE_RC_COMPILER x86_64-w64-mingw32-windres)
    set(CMAKE_FIND_ROOT_PATH /usr/x86_64-w64-mingw32)
    set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
    set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
    set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
    add_definitions(-DUNICODE -D_UNICODE)
endif()

# Set Windows subsystem (no console window)
if(CMAKE_CROSSCOMPILING OR WIN32)
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -Wl,--subsystem,windows")
endif()

# Include directories
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/MCPEyes
    ${CMAKE_CURRENT_SOURCE_DIR}/../native/include
    ${CMAKE_CURRENT_SOURCE_DIR}/../native/src
)

# Dependencies (cpp-httplib and nlohmann/json from native/)
include(FetchContent)

FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG v0.14.3
)
FetchContent_MakeAvailable(httplib)

FetchContent_Declare(
    json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.3
)
FetchContent_MakeAvailable(json)

# Source files
set(SOURCES
    MCPEyes/main.cpp
    MCPEyes/AppDelegate.cpp
    MCPEyes/SettingsWindow.cpp
    MCPEyes/MCPServer.cpp
    MCPEyes/WindowsPlatform.cpp
)

# Resource file
set(RESOURCES
    MCPEyes/MCPEyes.rc
)

# Create executable
add_executable(MCPEyes ${SOURCES} ${RESOURCES})

# Link libraries
target_link_libraries(MCPEyes
    PRIVATE
        httplib::httplib
        nlohmann_json::nlohmann_json
)

# Windows-specific libraries (only on Windows or when cross-compiling)
if(WIN32 OR CMAKE_CROSSCOMPILING)
    target_link_libraries(MCPEyes
        PRIVATE
            -luser32
            -lgdi32
            -lshell32
            -lcomctl32
            -ladvapi32
            -lpsapi
            -luiautomationcore
            -lgdiplus
            -lshlwapi
            -lws2_32
            -lole32
            -loleaut32
            -lwindowscodecs
    )
endif()

# Compiler-specific flags
if(MSVC)
    target_compile_options(MCPEyes PRIVATE
        /W4
        /permissive-
        /Zc:__cplusplus
        /EHsc
    )
    target_compile_definitions(MCPEyes PRIVATE
        _CRT_SECURE_NO_WARNINGS
        NOMINMAX
        WIN32_LEAN_AND_MEAN
    )
else()
    # GCC/MinGW flags
    target_compile_options(MCPEyes PRIVATE
        -Wall
        -Wextra
        -Wno-unused-parameter
        -static-libgcc
        -static-libstdc++
    )
    target_link_options(MCPEyes PRIVATE
        -static-libgcc
        -static-libstdc++
    )
endif()

# Set output directory
set_target_properties(MCPEyes PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin
)

# Copy manifest file
configure_file(
    ${CMAKE_CURRENT_SOURCE_DIR}/MCPEyes/MCPEyes.manifest
    ${CMAKE_BINARY_DIR}/bin/MCPEyes.manifest
    COPYONLY
)

# Install
install(TARGETS MCPEyes
    RUNTIME DESTINATION bin
)

install(FILES ${CMAKE_CURRENT_SOURCE_DIR}/MCPEyes/MCPEyes.manifest
    DESTINATION bin
)

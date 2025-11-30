cmake_minimum_required(VERSION 3.20)
project(mcp_eyes VERSION 2.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Options
option(MCP_EYES_BUILD_SHARED "Build shared library" ON)
option(MCP_EYES_BUILD_TESTS "Build tests" OFF)

# Platform detection
if(APPLE)
    set(MCP_EYES_PLATFORM "macos")
    enable_language(OBJCXX)
    # Set deployment target to macOS 12.0 to allow deprecated APIs
    set(CMAKE_OSX_DEPLOYMENT_TARGET "12.0" CACHE STRING "Minimum macOS version")
elseif(WIN32)
    set(MCP_EYES_PLATFORM "windows")
elseif(UNIX)
    set(MCP_EYES_PLATFORM "linux")
endif()

message(STATUS "Building MCP-Eyes for platform: ${MCP_EYES_PLATFORM}")

# cpp-httplib (header-only)
include(FetchContent)
FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG v0.14.3
)
FetchContent_MakeAvailable(httplib)

# nlohmann/json (header-only)
FetchContent_Declare(
    json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG v3.11.3
)
FetchContent_MakeAvailable(json)

# Core library sources
set(CORE_SOURCES
    src/config.cpp
    src/http_server.cpp
    src/web_ui.cpp
    src/discovery.cpp
    src/remote_client.cpp
)

# Platform-specific sources
if(MCP_EYES_PLATFORM STREQUAL "macos")
    list(APPEND CORE_SOURCES
        src/platform_macos.mm
    )
elseif(MCP_EYES_PLATFORM STREQUAL "windows")
    list(APPEND CORE_SOURCES
        src/platform_windows.cpp
    )
elseif(MCP_EYES_PLATFORM STREQUAL "linux")
    list(APPEND CORE_SOURCES
        src/platform_linux.cpp
    )
endif()

# Library target
if(MCP_EYES_BUILD_SHARED)
    add_library(mcp_eyes SHARED ${CORE_SOURCES})
else()
    add_library(mcp_eyes STATIC ${CORE_SOURCES})
endif()

target_include_directories(mcp_eyes
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_link_libraries(mcp_eyes
    PRIVATE
        httplib::httplib
        nlohmann_json::nlohmann_json
)

# Platform-specific linking
if(MCP_EYES_PLATFORM STREQUAL "macos")
    find_library(COCOA_FRAMEWORK Cocoa REQUIRED)
    find_library(APPKIT_FRAMEWORK AppKit REQUIRED)
    find_library(COREGRAPHICS_FRAMEWORK CoreGraphics REQUIRED)
    find_library(VISION_FRAMEWORK Vision REQUIRED)
    find_library(APPLICATIONSERVICES_FRAMEWORK ApplicationServices REQUIRED)

    target_link_libraries(mcp_eyes
        PRIVATE
            ${COCOA_FRAMEWORK}
            ${APPKIT_FRAMEWORK}
            ${COREGRAPHICS_FRAMEWORK}
            ${VISION_FRAMEWORK}
            ${APPLICATIONSERVICES_FRAMEWORK}
    )

    # Enable ARC for Objective-C++
    set_source_files_properties(
        src/platform_macos.mm
        PROPERTIES
        COMPILE_FLAGS "-fobjc-arc"
    )
endif()

# Standalone executable (for testing without Xcode)
add_executable(mcp_eyes_server src/main.cpp)
target_link_libraries(mcp_eyes_server PRIVATE mcp_eyes)

# Install
install(TARGETS mcp_eyes
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
    RUNTIME DESTINATION bin
)

install(DIRECTORY include/
    DESTINATION include
)

cmake_minimum_required(VERSION 3.16)
project(ScreenControlService VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Cross-compilation settings for MinGW
if(CMAKE_CROSSCOMPILING AND CMAKE_SYSTEM_NAME STREQUAL "Windows")
    add_definitions(-DUNICODE -D_UNICODE -DWIN32_LEAN_AND_MEAN -DNOMINMAX)
endif()

# Source files
set(SOURCES
    main.cpp
    service.cpp
    server/http_server.cpp
    tools/gui_tools.cpp
    tools/ui_automation.cpp
    tools/filesystem_tools.cpp
    tools/shell_tools.cpp
    tools/system_tools.cpp
    control_server/websocket_client.cpp
    core/config.cpp
    core/logger.cpp
)

# Header-only libraries location
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/libs)

# Create executable (console app for service)
add_executable(ScreenControlService ${SOURCES})

# Preprocessor definitions
target_compile_definitions(ScreenControlService PRIVATE
    _CRT_SECURE_NO_WARNINGS
    NOMINMAX
    WIN32_LEAN_AND_MEAN
    _WIN32_WINNT=0x0600  # Vista+ for GetTickCount64, QueryFullProcessImageName
)

# Windows libraries for MinGW
if(MINGW OR CMAKE_CROSSCOMPILING)
    target_link_libraries(ScreenControlService
        ws2_32        # Winsock
        advapi32      # Registry, service functions
        user32        # User32 (input simulation, windows)
        gdi32         # GDI (screenshots)
        gdiplus       # GDI+ (image encoding)
        ole32         # COM
        oleaut32      # COM automation
        psapi         # Process info
        shlwapi       # Shell lightweight API
        secur32       # Security (Schannel)
        crypt32       # Crypto
        shell32       # Shell functions
    )

    # Static linking for standalone executable
    target_link_options(ScreenControlService PRIVATE
        -static-libgcc
        -static-libstdc++
        -static
    )

    # Console subsystem (service runs as console app initially)
    target_link_options(ScreenControlService PRIVATE
        -Wl,--subsystem,console
    )
endif()

# Compiler warnings
if(MSVC)
    target_compile_options(ScreenControlService PRIVATE /W3 /EHsc)
else()
    target_compile_options(ScreenControlService PRIVATE
        -Wall
        -Wextra
        -Wno-unused-parameter
        -Wno-missing-field-initializers
    )
endif()

# Output directory
set_target_properties(ScreenControlService PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin
    OUTPUT_NAME "ScreenControlService"
)

# Install
install(TARGETS ScreenControlService RUNTIME DESTINATION bin)

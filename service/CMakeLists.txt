cmake_minimum_required(VERSION 3.16)
project(ScreenControlService VERSION 1.2.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Platform detection
if(APPLE)
    set(PLATFORM_MACOS ON)
    message(STATUS "Building for macOS")
elseif(WIN32)
    set(PLATFORM_WINDOWS ON)
    message(STATUS "Building for Windows")
else()
    set(PLATFORM_LINUX ON)
    message(STATUS "Building for Linux")
endif()

# Common source files (cross-platform)
set(COMMON_SOURCES
    src/core/config.cpp
    src/core/logger.cpp
    src/core/security.cpp
    src/server/http_server.cpp
    src/control_server/command_dispatcher.cpp
    src/tools/filesystem_tools.cpp
    src/tools/shell_tools.cpp
    src/tools/system_tools.cpp
)

# Platform-specific sources (OpenSSL on macOS/Linux, native APIs on Windows)
if(WIN32)
    list(APPEND COMMON_SOURCES src/core/crypto_windows.cpp)
    list(APPEND COMMON_SOURCES src/control_server/websocket_client_windows.cpp)
else()
    list(APPEND COMMON_SOURCES src/core/crypto.cpp)
    list(APPEND COMMON_SOURCES src/control_server/websocket_client.cpp)
endif()

# Platform-specific source files
if(PLATFORM_MACOS)
    set(PLATFORM_SOURCES
        src/platform/macos/main_macos.cpp
        src/platform/macos/platform_macos.cpp
    )
elseif(PLATFORM_WINDOWS)
    set(PLATFORM_SOURCES
        src/platform/windows/main_windows.cpp
        src/platform/windows/platform_windows.cpp
    )
    add_definitions(-DUNICODE -D_UNICODE -DWIN32_LEAN_AND_MEAN -DNOMINMAX)
else()
    set(PLATFORM_SOURCES
        src/platform/linux/main_linux.cpp
        src/platform/linux/platform_linux.cpp
    )
endif()

# Header-only libraries
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/src/libs
)

# Create executable
add_executable(ScreenControlService ${COMMON_SOURCES} ${PLATFORM_SOURCES})

# Platform-specific configuration
if(PLATFORM_MACOS)
    # macOS frameworks
    find_library(COCOA_FRAMEWORK Cocoa)
    find_library(IOKIT_FRAMEWORK IOKit)
    find_library(SECURITY_FRAMEWORK Security)
    find_library(COREGRAPHICS_FRAMEWORK CoreGraphics)
    find_library(APPLICATIONSERVICES_FRAMEWORK ApplicationServices)
    find_library(COREFOUNDATION_FRAMEWORK CoreFoundation)

    # OpenSSL (for WebSocket TLS)
    find_package(OpenSSL REQUIRED)

    target_link_libraries(ScreenControlService
        ${COCOA_FRAMEWORK}
        ${IOKIT_FRAMEWORK}
        ${SECURITY_FRAMEWORK}
        ${COREGRAPHICS_FRAMEWORK}
        ${APPLICATIONSERVICES_FRAMEWORK}
        ${COREFOUNDATION_FRAMEWORK}
        OpenSSL::SSL
        OpenSSL::Crypto
        pthread
    )

    target_compile_definitions(ScreenControlService PRIVATE
        PLATFORM_MACOS=1
    )

    # macOS deployment target
    set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0")

elseif(PLATFORM_WINDOWS)
    target_compile_definitions(ScreenControlService PRIVATE
        PLATFORM_WINDOWS=1
        _CRT_SECURE_NO_WARNINGS
        NOMINMAX
        WIN32_LEAN_AND_MEAN
        _WIN32_WINNT=0x0600
    )

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
        bcrypt        # Cryptographic primitives (AES-GCM)
        wtsapi32      # Windows Terminal Services
        userenv       # User environment (profiles)
        credui        # Credential UI
    )

    # Static linking for standalone executable
    if(MINGW OR CMAKE_CROSSCOMPILING)
        target_link_options(ScreenControlService PRIVATE
            -static-libgcc
            -static-libstdc++
            -static
        )
        target_link_options(ScreenControlService PRIVATE
            -Wl,--subsystem,console
        )
    endif()

else()
    # Linux
    target_compile_definitions(ScreenControlService PRIVATE
        PLATFORM_LINUX=1
    )

    # Find required packages
    find_package(PkgConfig REQUIRED)
    find_package(OpenSSL REQUIRED)
    pkg_check_modules(X11 x11 xrandr xtst)
    pkg_check_modules(LIBSECRET libsecret-1)

    target_link_libraries(ScreenControlService
        pthread
        OpenSSL::SSL
        OpenSSL::Crypto
        ${X11_LIBRARIES}
    )

    if(LIBSECRET_FOUND)
        target_include_directories(ScreenControlService PRIVATE ${LIBSECRET_INCLUDE_DIRS})
        target_link_libraries(ScreenControlService ${LIBSECRET_LIBRARIES})
        target_compile_definitions(ScreenControlService PRIVATE HAVE_LIBSECRET=1)
    endif()
endif()

# Compiler warnings (all platforms)
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

# Platform-specific install files
if(PLATFORM_MACOS)
    install(FILES install/macos/com.screencontrol.service.plist
        DESTINATION /Library/LaunchDaemons
        PERMISSIONS OWNER_READ OWNER_WRITE GROUP_READ WORLD_READ
    )
elseif(PLATFORM_LINUX)
    install(FILES install/linux/screencontrol.service
        DESTINATION /etc/systemd/system
        PERMISSIONS OWNER_READ OWNER_WRITE GROUP_READ WORLD_READ
    )
endif()

message(STATUS "ScreenControl Service v${PROJECT_VERSION}")
message(STATUS "Platform: ${CMAKE_SYSTEM_NAME}")
message(STATUS "Install prefix: ${CMAKE_INSTALL_PREFIX}")

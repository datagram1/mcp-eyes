cmake_minimum_required(VERSION 3.16)
project(screencontrol VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Build options
option(BUILD_GUI "Build with GTK GUI support" ON)
option(BUILD_HEADLESS "Build headless service mode" OFF)

# Find required packages
find_package(Threads REQUIRED)
find_package(PkgConfig REQUIRED)

# X11 for screenshot and input simulation
pkg_check_modules(X11 REQUIRED x11 xext xtst xrandr)

# Optional GTK for GUI mode
if(BUILD_GUI)
    pkg_check_modules(GTK3 gtk+-3.0)
    if(GTK3_FOUND)
        add_definitions(-DHAS_GTK)
    endif()
endif()

# Source files
set(SOURCES
    main.cpp
    server/http_server.cpp
    core/config.cpp
    core/logger.cpp
    tools/gui_tools.cpp
    tools/filesystem_tools.cpp
    tools/shell_tools.cpp
    tools/ui_automation.cpp
)

# Create executable
add_executable(${PROJECT_NAME} ${SOURCES})

# Include directories
target_include_directories(${PROJECT_NAME} PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/libs
    ${X11_INCLUDE_DIRS}
)

# Link libraries
target_link_libraries(${PROJECT_NAME} PRIVATE
    Threads::Threads
    ${X11_LIBRARIES}
)

# GTK support
if(BUILD_GUI AND GTK3_FOUND)
    target_include_directories(${PROJECT_NAME} PRIVATE ${GTK3_INCLUDE_DIRS})
    target_link_libraries(${PROJECT_NAME} PRIVATE ${GTK3_LIBRARIES})
endif()

# Headless mode flag
if(BUILD_HEADLESS)
    target_compile_definitions(${PROJECT_NAME} PRIVATE HEADLESS_MODE)
endif()

# Installation
install(TARGETS ${PROJECT_NAME}
    RUNTIME DESTINATION bin
)

# Systemd service file
configure_file(
    ${CMAKE_CURRENT_SOURCE_DIR}/screencontrol.service.in
    ${CMAKE_CURRENT_BINARY_DIR}/screencontrol.service
    @ONLY
)

install(FILES ${CMAKE_CURRENT_BINARY_DIR}/screencontrol.service
    DESTINATION /etc/systemd/system
    OPTIONAL
)

# Print configuration
message(STATUS "Build configuration:")
message(STATUS "  GUI support: ${BUILD_GUI}")
message(STATUS "  GTK found: ${GTK3_FOUND}")
message(STATUS "  Headless mode: ${BUILD_HEADLESS}")

# CMake toolchain for Windows ARM64 cross-compilation using Zig
set(CMAKE_SYSTEM_NAME Windows)
set(CMAKE_SYSTEM_PROCESSOR ARM64)

# Use Zig as the compiler
set(CMAKE_C_COMPILER zig)
set(CMAKE_C_COMPILER_ARG1 "cc;-target;aarch64-windows-gnu")
set(CMAKE_CXX_COMPILER zig)
set(CMAKE_CXX_COMPILER_ARG1 "c++;-target;aarch64-windows-gnu")

# Zig handles linking
set(CMAKE_C_COMPILER_WORKS TRUE)
set(CMAKE_CXX_COMPILER_WORKS TRUE)

# Static linking (no runtime dependencies)
set(CMAKE_EXE_LINKER_FLAGS "-static")

# Windows-specific
set(WIN32 TRUE)
set(CMAKE_EXECUTABLE_SUFFIX ".exe")

# Skip try_compile checks that might fail
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)

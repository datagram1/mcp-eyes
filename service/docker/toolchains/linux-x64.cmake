# CMake toolchain for Linux x64 cross-compilation using Zig
set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR x86_64)

set(CMAKE_C_COMPILER zig)
set(CMAKE_C_COMPILER_ARG1 "cc;-target;x86_64-linux-gnu")
set(CMAKE_CXX_COMPILER zig)
set(CMAKE_CXX_COMPILER_ARG1 "c++;-target;x86_64-linux-gnu")

set(CMAKE_C_COMPILER_WORKS TRUE)
set(CMAKE_CXX_COMPILER_WORKS TRUE)

set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)

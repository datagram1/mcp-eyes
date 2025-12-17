# Cross-Compilation Notes

ScreenControl supports cross-compilation from macOS using **MinGW-w64** (for Windows x64), **Zig**, and **.NET SDK**, allowing all Windows and Linux builds to be produced from a single macOS Apple Silicon machine.

## Overview

| Component | Language | Tool | Targets |
|-----------|----------|------|---------|
| ScreenControlService | C++ | MinGW-w64 | Windows x64 |
| ScreenControlService | C++ | Zig | Windows ARM64/x64, Linux ARM64/x64 |
| ScreenControlTray | C# | .NET SDK | Windows ARM64/x64 |
| macOS Agent | Swift | Xcode | macOS ARM64/x64 (native only) |

## Prerequisites

### macOS (Apple Silicon)

```bash
# Install MinGW-w64 (recommended for Windows x64 cross-compilation)
brew install mingw-w64

# Install Zig (alternative C++ cross-compiler)
brew install zig

# Install .NET SDK (official installer - required for Windows Forms cross-compilation)
# NOTE: Homebrew's dotnet doesn't include Windows Desktop SDK needed for WinForms
curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0

# Add to PATH (add to ~/.zshrc for persistence)
export PATH="$HOME/.dotnet:$PATH"

# Verify
x86_64-w64-mingw32-g++ --version  # MinGW-w64 should show 15.x
zig version                        # Should show 0.13.x or later
~/.dotnet/dotnet --version         # Should show 8.x
```

**Important:** The homebrew version of .NET (`brew install dotnet`) does NOT include the Windows Desktop SDK required to cross-compile Windows Forms apps. You must use the official Microsoft installer.

### Linux ARM64

```bash
# Zig
wget https://ziglang.org/download/0.13.0/zig-linux-aarch64-0.13.0.tar.xz
tar xf zig-linux-aarch64-0.13.0.tar.xz
export PATH=$PWD/zig-linux-aarch64-0.13.0:$PATH

# .NET SDK
wget https://dot.net/v1/dotnet-install.sh
chmod +x dotnet-install.sh
./dotnet-install.sh --channel 8.0
export PATH=$HOME/.dotnet:$PATH
```

## Quick Start

```bash
# Build everything
./build-all.sh

# Build Windows only (ARM64 + x64)
./build-all.sh windows

# Build specific target
./build-all.sh windows-arm64

# Build C++ service only
./build-all.sh service

# Build C# tray app only
./build-all.sh tray
```

## Output Structure

```
dist/
├── windows-arm64/
│   ├── ScreenControlService.exe   # C++ service
│   └── ScreenControlTray.exe      # C# tray app
├── windows-x64/
│   ├── ScreenControlService.exe
│   └── ScreenControlTray.exe
├── linux-arm64/
│   └── ScreenControlService
└── linux-x64/
    └── ScreenControlService
```

## How It Works

### C++ Service (MinGW-w64) - Recommended for Windows x64

MinGW-w64 is the recommended toolchain for building the Windows service from macOS. It integrates well with CMake and produces standalone executables.

#### CMake Toolchain File

Create `cmake/mingw-w64.cmake`:

```cmake
set(CMAKE_SYSTEM_NAME Windows)
set(CMAKE_SYSTEM_PROCESSOR x86_64)

set(CMAKE_C_COMPILER x86_64-w64-mingw32-gcc)
set(CMAKE_CXX_COMPILER x86_64-w64-mingw32-g++)
set(CMAKE_RC_COMPILER x86_64-w64-mingw32-windres)

set(CMAKE_FIND_ROOT_PATH /opt/homebrew/Cellar/mingw-w64)
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)

# Static linking for standalone executable
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -static-libgcc -static-libstdc++ -static")
```

#### Build Commands

```bash
cd service
mkdir -p build-windows && cd build-windows

# Configure
cmake -DCMAKE_TOOLCHAIN_FILE=../cmake/mingw-w64.cmake \
      -DCMAKE_BUILD_TYPE=Release ..

# Build
make -j4

# Output: bin/ScreenControlService.exe (~17MB)
```

#### Windows-Specific Code Considerations

When cross-compiling for Windows, be aware of these issues:

1. **`stdout`/`stderr` are macros on Windows** - Don't use these as variable names
   ```cpp
   // BAD: conflicts with Windows macros
   struct Result { std::string stdout; std::string stderr; };

   // GOOD: use different names
   struct Result { std::string stdoutData; std::string stderrData; };
   ```

2. **OpenSSL is not available** - Use Windows bcrypt API instead for cryptography
   - AES-256-GCM: `BCryptOpenAlgorithmProvider`, `BCryptEncrypt`, `BCryptDecrypt`
   - Random bytes: `BCryptGenRandom`
   - Base64: `CryptBinaryToStringA`, `CryptStringToBinaryA`

3. **WebSocket TLS requires Schannel** - OpenSSL SSL functions won't work
   - Create a stub `websocket_client_windows.cpp` that disables TLS WebSocket
   - HTTP API still works without WebSocket

4. **Platform-specific source files** in CMakeLists.txt:
   ```cmake
   if(WIN32)
       list(APPEND COMMON_SOURCES src/core/crypto_windows.cpp)
       list(APPEND COMMON_SOURCES src/control_server/websocket_client_windows.cpp)
   else()
       list(APPEND COMMON_SOURCES src/core/crypto.cpp)
       list(APPEND COMMON_SOURCES src/control_server/websocket_client.cpp)
   endif()
   ```

5. **Additional link libraries for Windows**:
   ```cmake
   target_link_libraries(ScreenControlService
       ws2_32 advapi32 user32 gdi32 gdiplus ole32 oleaut32
       psapi shlwapi secur32 crypt32 shell32 bcrypt
       wtsapi32 userenv credui
   )
   ```

### C++ Service (Zig)

Zig is a modern systems language that includes a C/C++ compiler with built-in cross-compilation support. It bundles target-specific libc and can produce native binaries for any platform without requiring the target SDK.

```bash
# Direct zig cross-compilation example
zig c++ -target aarch64-windows-gnu -std=c++17 main.cpp -o app.exe
```

**Targets supported:**
- `aarch64-windows-gnu` → Windows ARM64
- `x86_64-windows-gnu` → Windows x64
- `aarch64-linux-gnu` → Linux ARM64
- `x86_64-linux-gnu` → Linux x64

**Linking:** Zig uses MinGW-style linking for Windows (`-windows-gnu`), which produces standalone executables without MSVC runtime dependencies.

### C# Tray App (.NET SDK)

.NET SDK supports cross-compilation via Runtime Identifiers (RID). The SDK downloads the required runtime components and produces self-contained single-file executables.

```bash
# Direct dotnet cross-compilation example
dotnet publish -c Release -r win-arm64 --self-contained true -p:PublishSingleFile=true
```

**RIDs supported:**
- `win-arm64` → Windows ARM64
- `win-x64` → Windows x64

**Note:** Windows Forms requires Windows to run, but can be compiled from any platform.

## Architecture Details

### Why MinGW-w64 or Zig for C++?

**MinGW-w64** (recommended for x64):
1. **Excellent CMake integration**: Works with existing CMakeLists.txt
2. **Comprehensive Windows API support**: All standard libraries available
3. **Static linking**: Produces standalone executables with no runtime dependencies
4. **Easy installation**: `brew install mingw-w64` on macOS

**Zig** (alternative, supports ARM64):
1. **No SDK required**: Zig bundles everything needed for cross-compilation
2. **Single binary**: No toolchain installation, just download and run
3. **ARM64 support**: Can target Windows ARM64 from macOS
4. **Consistent output**: Same binary regardless of host platform

**Comparison:**

| Feature | MinGW-w64 | Zig |
|---------|-----------|-----|
| Windows x64 | ✅ | ✅ |
| Windows ARM64 | ❌ | ✅ |
| CMake integration | ✅ Native | ⚠️ Manual |
| Binary size | ~17MB | ~8MB |
| Windows API coverage | Complete | Partial |
| OpenSSL available | ❌ | ❌ |

Alternatives **not recommended**:
- **MSVC**: Requires Windows or complex Wine setup
- **Clang + xwin**: Works but requires downloading Windows SDK separately

### Why .NET for Tray App?

1. **Native cross-compilation**: `dotnet publish -r <RID>` just works
2. **Self-contained**: Bundles runtime, no .NET installation needed on target
3. **Single file**: `-p:PublishSingleFile=true` produces one executable
4. **Windows Forms**: Best option for system tray apps on Windows

## Manual Build Commands

### C++ Service

```bash
cd service

# Windows ARM64
zig c++ -target aarch64-windows-gnu -std=c++17 -O2 \
    -I include -I src/libs \
    -DPLATFORM_WINDOWS=1 -D_WIN32_WINNT=0x0600 \
    -DUNICODE -D_UNICODE -DWIN32_LEAN_AND_MEAN -DNOMINMAX \
    src/core/*.cpp src/server/*.cpp src/tools/*.cpp \
    src/control_server/*.cpp src/platform/windows/*.cpp \
    -lws2_32 -ladvapi32 -luser32 -lgdi32 -lgdiplus \
    -lole32 -loleaut32 -lpsapi -lshlwapi -lshell32 \
    -o ScreenControlService.exe

# Linux ARM64
zig c++ -target aarch64-linux-gnu -std=c++17 -O2 \
    -I include -I src/libs \
    -DPLATFORM_LINUX=1 \
    src/core/*.cpp src/server/*.cpp src/tools/*.cpp \
    src/control_server/*.cpp src/platform/linux/*.cpp \
    -lpthread \
    -o ScreenControlService
```

### C# Tray App

```bash
cd windows/ScreenControlTray

# Windows ARM64
dotnet publish -c Release -r win-arm64 \
    --self-contained true \
    -p:PublishSingleFile=true \
    -p:IncludeNativeLibrariesForSelfExtract=true \
    -o ../../dist/windows-arm64

# Windows x64
dotnet publish -c Release -r win-x64 \
    --self-contained true \
    -p:PublishSingleFile=true \
    -p:IncludeNativeLibrariesForSelfExtract=true \
    -o ../../dist/windows-x64
```

## Troubleshooting

### Zig "cannot find -lXXX"

Zig's MinGW-style linking requires Windows API libraries to be specified. These are built into Zig for common APIs. If you get missing library errors:

1. Check if the API is available in MinGW (some newer Windows APIs aren't)
2. Consider using dynamic loading (`LoadLibrary`/`GetProcAddress`) instead

### .NET "error NETSDK1083"

This error means the target RID isn't supported. Ensure:
- You're using .NET 8 or later
- The RID is correct (`win-arm64` not `windows-arm64`)

### Large executable sizes

- **C++**: Zig produces reasonably sized binaries. Use `-O2` or `-Os` for optimization.
- **C#**: Self-contained .NET apps are ~60-80MB due to bundled runtime. This is expected.

## CI/CD Integration

For GitHub Actions, you can use the same build commands:

```yaml
jobs:
  build:
    runs-on: macos-latest  # Apple Silicon runner
    steps:
      - uses: actions/checkout@v4

      - name: Install Zig
        run: brew install zig

      - name: Setup .NET
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'

      - name: Build all
        run: ./build-all.sh

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
```

## Future Improvements

1. **Code signing**: Add Windows code signing for release builds
2. **macOS universal binary**: Combine ARM64 and x64 into single binary
3. **Linux AppImage**: Package Linux builds as AppImage for easier distribution
4. **Installer generation**: Create NSIS/WiX installers for Windows

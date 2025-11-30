# Building Windows MCP-Eyes with Docker

This guide explains how to build the Windows version of MCP-Eyes using Docker on a remote x86 Linux server.

## Prerequisites

1. **Remote Server**: Linux x86_64 machine with Docker installed
2. **SSH Access**: Access to the remote server (e.g., `richardbrown@192.168.10.31`)
3. **Local Machine**: Any machine with SSH and rsync (for copying files)

## Quick Start

### Option 1: Automated Remote Build (Recommended)

From your local machine, run:

```bash
cd windows
./docker-build.sh richardbrown@192.168.10.31
```

This script will:
1. Copy the project files to the remote server
2. Build the Docker image
3. Compile the Windows executable using mingw-w64
4. Copy the built executable back to your local machine

### Option 2: Manual Remote Build

1. **SSH into the remote server:**
```bash
ssh richardbrown@192.168.10.31
```

2. **Clone or copy the project:**
```bash
git clone <repository-url>
cd mcp_eyes/windows
```

3. **Build using Docker:**
```bash
# Build the Docker image
docker build -t mcp-eyes-windows-builder .

# Run the build
docker run --rm -v $(pwd):/build -w /build mcp-eyes-windows-builder ./build.sh
```

4. **Find the executable:**
```bash
ls -lh build/bin/MCPEyes.exe
```

## How It Works

The build process uses:

- **Docker Container**: Ubuntu 22.04 with mingw-w64 cross-compiler
- **Cross-Compilation**: Builds Windows executables from Linux using `x86_64-w64-mingw32-g++`
- **CMake**: Configured for Windows cross-compilation
- **Static Linking**: Links statically to avoid DLL dependencies

## Build Configuration

The build uses:
- **Compiler**: `x86_64-w64-mingw32-g++` (GCC-based MinGW)
- **Architecture**: x86_64 (64-bit Windows)
- **Subsystem**: Windows (no console window)
- **Libraries**: Statically linked where possible

## Troubleshooting

### Missing Dependencies

If the build fails due to missing libraries, you may need to install additional mingw-w64 packages:

```bash
# On the remote server (inside or outside Docker)
sudo apt-get update
sudo apt-get install -y \
    mingw-w64 \
    mingw-w64-tools \
    mingw-w64-x86-64-dev
```

### UI Automation Library

The `uiautomationcore` library may not be available in mingw-w64. You may need to:

1. Download Windows SDK libraries manually
2. Or disable UI Automation features temporarily
3. Or use alternative methods for element discovery

### Resource Compilation

If `windres` fails, ensure the resource file paths are correct and the icon file exists (even if it's a placeholder).

## Output

The built executable will be at:
- `build/bin/MCPEyes.exe` (inside Docker)
- `windows/build/bin/MCPEyes.exe` (on your local machine after sync)

## Notes

- The first build will take longer as it downloads dependencies
- Subsequent builds are faster due to Docker layer caching
- The executable is statically linked to minimize dependencies
- Some Windows-specific features may require additional setup

## Alternative: Native Windows Build

If you have access to a Windows machine, you can build natively:

```cmd
mkdir build
cd build
cmake .. -G "Visual Studio 17 2022" -A x64
cmake --build . --config Release
```

This will produce a more optimized executable with full Windows API support.


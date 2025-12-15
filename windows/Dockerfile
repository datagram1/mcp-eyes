# Dockerfile for building Windows ScreenControl using mingw-w64 cross-compiler
FROM ubuntu:22.04

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    mingw-w64 \
    mingw-w64-tools \
    pkg-config \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set MinGW to use POSIX threading (required for std::thread/std::mutex)
RUN update-alternatives --set x86_64-w64-mingw32-gcc /usr/bin/x86_64-w64-mingw32-gcc-posix && \
    update-alternatives --set x86_64-w64-mingw32-g++ /usr/bin/x86_64-w64-mingw32-g++-posix

# Set up mingw-w64 environment with POSIX threading
ENV CC=x86_64-w64-mingw32-gcc-posix
ENV CXX=x86_64-w64-mingw32-g++-posix
ENV AR=x86_64-w64-mingw32-ar
ENV RANLIB=x86_64-w64-mingw32-ranlib
ENV STRIP=x86_64-w64-mingw32-strip
ENV RC=x86_64-w64-mingw32-windres

# Set working directory
WORKDIR /build

# Copy source files
COPY . /build/

# Build script will be mounted or copied
CMD ["/bin/bash", "/build/build.sh"]


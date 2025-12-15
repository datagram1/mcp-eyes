# ScreenControl Linux Agent - Development Dockerfile
FROM ubuntu:24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    pkg-config \
    libx11-dev \
    libxext-dev \
    libxtst-dev \
    libxrandr-dev \
    libssl-dev \
    xclip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy source code
COPY screencontrol/ /app/

# Build the agent
RUN mkdir -p build && cd build && \
    cmake .. -DBUILD_GUI=OFF -DBUILD_HEADLESS=ON && \
    make -j$(nproc)

# Create config directory and default configuration
RUN mkdir -p /etc/screencontrol
COPY debug-config.json /etc/screencontrol/debug-config.json

# Generate unique machine-id for this container
RUN uuidgen > /etc/machine-id || cat /proc/sys/kernel/random/uuid > /etc/machine-id

# Default port
EXPOSE 3456

# Run the agent
CMD ["/app/build/screencontrol", "-p", "3456", "-v"]

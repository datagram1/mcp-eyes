# ScreenControl Rescue - Alpine ISO Build Environment
FROM alpine:3.19

# Install build dependencies
RUN apk add --no-cache \
    alpine-sdk \
    build-base \
    apk-tools \
    alpine-conf \
    busybox \
    fakeroot \
    syslinux \
    xorriso \
    grub \
    grub-efi \
    mtools \
    dosfstools \
    squashfs-tools \
    e2fsprogs \
    curl \
    git \
    mkinitfs

# Create build user
RUN adduser -D builder && \
    addgroup builder abuild && \
    mkdir -p /home/builder/.abuild && \
    echo "PACKAGER_PRIVKEY=/home/builder/.abuild/builder.rsa" > /home/builder/.abuild/abuild.conf

# Generate signing key
USER builder
RUN abuild-keygen -a -i -n

USER root
WORKDIR /build

# Copy build scripts
COPY build/ /build/
COPY config/ /config/
COPY overlay/ /overlay/
COPY scripts/ /scripts/

# Make scripts executable
RUN chmod +x /build/*.sh /scripts/*.sh 2>/dev/null || true

ENTRYPOINT ["/build/build-iso.sh"]

#!/bin/sh
# ScreenControl Rescue - ISO Build Script
set -e

VERSION="${VERSION:-1.0.0}"
ARCH="${ARCH:-x86_64}"
OUTPUT_DIR="${OUTPUT_DIR:-/output}"
TENANT_ID="${TENANT_ID:-}"
TENANT_TOKEN="${TENANT_TOKEN:-}"

echo "=========================================="
echo "ScreenControl Rescue ISO Builder"
echo "Version: $VERSION"
echo "Arch: $ARCH"
echo "=========================================="

# Create working directories
WORK_DIR="/tmp/rescue-build"
ROOTFS_DIR="$WORK_DIR/rootfs"
ISO_DIR="$WORK_DIR/iso"

mkdir -p "$ROOTFS_DIR" "$ISO_DIR/boot/grub" "$OUTPUT_DIR"

# ---------------------------------------------
# Step 1: Install base Alpine system
# ---------------------------------------------
echo "[1/7] Installing Alpine base system..."

apk add --root "$ROOTFS_DIR" --initdb --arch "$ARCH" \
    --repository "https://dl-cdn.alpinelinux.org/alpine/v3.19/main" \
    --repository "https://dl-cdn.alpinelinux.org/alpine/v3.19/community" \
    alpine-base \
    busybox \
    openrc \
    linux-lts \
    linux-firmware \
    eudev \
    dhcpcd \
    wpa_supplicant \
    openssh-client \
    curl \
    wget \
    ca-certificates \
    tzdata

# ---------------------------------------------
# Step 2: Install filesystem tools
# ---------------------------------------------
echo "[2/7] Installing filesystem tools..."

apk add --root "$ROOTFS_DIR" --arch "$ARCH" \
    --repository "https://dl-cdn.alpinelinux.org/alpine/v3.19/main" \
    --repository "https://dl-cdn.alpinelinux.org/alpine/v3.19/community" \
    e2fsprogs \
    e2fsprogs-extra \
    dosfstools \
    ntfs-3g \
    ntfs-3g-progs \
    exfatprogs \
    xfsprogs \
    btrfs-progs \
    hfsprogs \
    parted \
    gptfdisk \
    lvm2 \
    mdadm \
    dmraid \
    cryptsetup \
    smartmontools \
    hdparm \
    sdparm \
    nvme-cli \
    ddrescue \
    testdisk

# ---------------------------------------------
# Step 3: Install system/diagnostic tools
# ---------------------------------------------
echo "[3/7] Installing diagnostic tools..."

apk add --root "$ROOTFS_DIR" --arch "$ARCH" \
    --repository "https://dl-cdn.alpinelinux.org/alpine/v3.19/main" \
    --repository "https://dl-cdn.alpinelinux.org/alpine/v3.19/community" \
    pciutils \
    usbutils \
    lshw \
    dmidecode \
    memtester \
    stress-ng \
    htop \
    iotop \
    ncdu \
    mc \
    nano \
    vim \
    less \
    file \
    tree \
    rsync \
    screen \
    tmux \
    jq \
    efibootmgr \
    grub \
    grub-bios \
    syslinux \
    chntpw

# ---------------------------------------------
# Step 4: Configure the system
# ---------------------------------------------
echo "[4/7] Configuring system..."

# Set hostname
echo "rescue" > "$ROOTFS_DIR/etc/hostname"

# Configure networking
cat > "$ROOTFS_DIR/etc/network/interfaces" << 'EOF'
auto lo
iface lo inet loopback

auto eth0
iface eth0 inet dhcp
EOF

# Configure DNS fallback
cat > "$ROOTFS_DIR/etc/resolv.conf" << 'EOF'
nameserver 8.8.8.8
nameserver 1.1.1.1
EOF

# Configure OpenRC
mkdir -p "$ROOTFS_DIR/etc/runlevels/default"
mkdir -p "$ROOTFS_DIR/etc/runlevels/boot"

# Enable essential services
for svc in devfs dmesg mdev hwdrivers; do
    ln -sf "/etc/init.d/$svc" "$ROOTFS_DIR/etc/runlevels/sysinit/" 2>/dev/null || true
done

for svc in modules sysctl hostname bootmisc syslog networking; do
    ln -sf "/etc/init.d/$svc" "$ROOTFS_DIR/etc/runlevels/boot/" 2>/dev/null || true
done

for svc in local dhcpcd; do
    ln -sf "/etc/init.d/$svc" "$ROOTFS_DIR/etc/runlevels/default/" 2>/dev/null || true
done

# Configure console
cat > "$ROOTFS_DIR/etc/inittab" << 'EOF'
::sysinit:/sbin/openrc sysinit
::sysinit:/sbin/openrc boot
::wait:/sbin/openrc default
tty1::respawn:/sbin/getty 38400 tty1
tty2::respawn:/sbin/getty 38400 tty2
tty3::respawn:/sbin/getty 38400 tty3
::ctrlaltdel:/sbin/reboot
::shutdown:/sbin/openrc shutdown
EOF

# Set root password (empty for rescue)
sed -i 's|root:.*|root::0:0:root:/root:/bin/ash|' "$ROOTFS_DIR/etc/passwd"

# Create motd
cat > "$ROOTFS_DIR/etc/motd" << 'EOF'

  ____                           ____            _             _
 / ___|  ___ _ __ ___  ___ _ __ / ___|___  _ __ | |_ _ __ ___ | |
 \___ \ / __| '__/ _ \/ _ \ '_ \| |   / _ \| '_ \| __| '__/ _ \| |
  ___) | (__| | |  __/  __/ | | | |__| (_) | | | | |_| | | (_) | |
 |____/ \___|_|  \___|\___|_| |_|\____\___/|_| |_|\__|_|  \___/|_|

                     R E S C U E   M O D E

 Connect to server:  screencontrol-connect
 Enter token:        screencontrol-pair <TOKEN>
 System info:        rescue-info

EOF

# ---------------------------------------------
# Step 5: Install ScreenControl agent
# ---------------------------------------------
echo "[5/7] Installing ScreenControl agent..."

mkdir -p "$ROOTFS_DIR/opt/screencontrol"
mkdir -p "$ROOTFS_DIR/etc/screencontrol"

# Copy agent binary (if available)
if [ -f "/overlay/opt/screencontrol/ScreenControlService" ]; then
    cp /overlay/opt/screencontrol/ScreenControlService "$ROOTFS_DIR/opt/screencontrol/"
    chmod +x "$ROOTFS_DIR/opt/screencontrol/ScreenControlService"
fi

# Create default config (will be overridden by tenant config or pairing)
cat > "$ROOTFS_DIR/etc/screencontrol/config.json" << EOF
{
  "httpPort": 3459,
  "httpHost": "127.0.0.1",
  "agentName": "Rescue",
  "autoStart": true,
  "enableLogging": true,
  "rescueMode": true
}
EOF

# Create connection config template
if [ -n "$TENANT_ID" ]; then
    # Pre-configured tenant
    cat > "$ROOTFS_DIR/etc/screencontrol/connection.json" << EOF
{
  "serverUrl": "wss://screencontrol.knws.co.uk/ws",
  "customerId": "$TENANT_ID",
  "agentName": "Rescue",
  "connectOnStartup": true,
  "rescueMode": true
}
EOF
else
    # No tenant - will need pairing
    cat > "$ROOTFS_DIR/etc/screencontrol/connection.json.template" << 'EOF'
{
  "serverUrl": "wss://screencontrol.knws.co.uk/ws",
  "customerId": "__TENANT_ID__",
  "agentName": "Rescue-__HOSTNAME__",
  "connectOnStartup": true,
  "rescueMode": true
}
EOF
fi

# Create OpenRC service
cat > "$ROOTFS_DIR/etc/init.d/screencontrol" << 'EOF'
#!/sbin/openrc-run

name="ScreenControl Rescue Agent"
command="/opt/screencontrol/ScreenControlService"
command_background="yes"
pidfile="/run/screencontrol.pid"
start_stop_daemon_args="--make-pidfile"

depend() {
    need net
    after firewall
}

start_pre() {
    # Check if connection is configured
    if [ ! -f /etc/screencontrol/connection.json ]; then
        ewarn "No connection configured. Run 'screencontrol-pair <TOKEN>' to connect."
        return 1
    fi
}
EOF
chmod +x "$ROOTFS_DIR/etc/init.d/screencontrol"

# Enable screencontrol service
ln -sf /etc/init.d/screencontrol "$ROOTFS_DIR/etc/runlevels/default/"

# ---------------------------------------------
# Step 6: Create helper scripts
# ---------------------------------------------
echo "[6/7] Creating helper scripts..."

# Pairing script - allows user to enter tenant token at boot
cat > "$ROOTFS_DIR/usr/bin/screencontrol-pair" << 'EOF'
#!/bin/sh
# Pair this rescue system with a ScreenControl tenant

if [ -z "$1" ]; then
    echo "Usage: screencontrol-pair <TENANT_TOKEN>"
    echo ""
    echo "Get your tenant token from: https://screencontrol.knws.co.uk/dashboard/rescue"
    echo ""
    echo "The token looks like: xxxx-xxxx-xxxx-xxxx"
    exit 1
fi

TOKEN="$1"
HOSTNAME=$(cat /etc/hostname)-$(cat /sys/class/net/*/address 2>/dev/null | head -1 | tr -d ':' | tail -c 7)

echo "Validating token with server..."

# Validate token and get tenant ID
RESPONSE=$(curl -s -X POST "https://screencontrol.knws.co.uk/api/rescue/pair" \
    -H "Content-Type: application/json" \
    -d "{\"token\": \"$TOKEN\", \"hostname\": \"$HOSTNAME\"}")

if echo "$RESPONSE" | grep -q '"success":true'; then
    TENANT_ID=$(echo "$RESPONSE" | jq -r '.customerId')
    AGENT_NAME=$(echo "$RESPONSE" | jq -r '.agentName // "Rescue-'"$HOSTNAME"'"')

    # Create connection config
    cat > /etc/screencontrol/connection.json << CONF
{
  "serverUrl": "wss://screencontrol.knws.co.uk/ws",
  "customerId": "$TENANT_ID",
  "agentName": "$AGENT_NAME",
  "connectOnStartup": true,
  "rescueMode": true
}
CONF

    echo "Paired successfully!"
    echo "Tenant: $TENANT_ID"
    echo "Agent name: $AGENT_NAME"
    echo ""
    echo "Starting ScreenControl agent..."
    rc-service screencontrol restart
else
    ERROR=$(echo "$RESPONSE" | jq -r '.error // "Unknown error"')
    echo "Pairing failed: $ERROR"
    exit 1
fi
EOF
chmod +x "$ROOTFS_DIR/usr/bin/screencontrol-pair"

# Quick connect script
cat > "$ROOTFS_DIR/usr/bin/screencontrol-connect" << 'EOF'
#!/bin/sh
# Show connection status and help

echo "ScreenControl Rescue - Connection Status"
echo "========================================="

if [ -f /etc/screencontrol/connection.json ]; then
    TENANT=$(jq -r '.customerId' /etc/screencontrol/connection.json 2>/dev/null)
    AGENT=$(jq -r '.agentName' /etc/screencontrol/connection.json 2>/dev/null)
    echo "Tenant ID: $TENANT"
    echo "Agent Name: $AGENT"
    echo ""

    if rc-service screencontrol status >/dev/null 2>&1; then
        echo "Status: CONNECTED"
        echo ""
        echo "This rescue system is connected to ScreenControl."
        echo "An operator can now access this system remotely."
    else
        echo "Status: NOT RUNNING"
        echo ""
        echo "Starting agent..."
        rc-service screencontrol start
    fi
else
    echo "Status: NOT CONFIGURED"
    echo ""
    echo "To connect this rescue system to ScreenControl:"
    echo ""
    echo "  1. Go to: https://screencontrol.knws.co.uk/dashboard/rescue"
    echo "  2. Generate a pairing token"
    echo "  3. Run: screencontrol-pair <TOKEN>"
    echo ""
fi
EOF
chmod +x "$ROOTFS_DIR/usr/bin/screencontrol-connect"

# System info script
cat > "$ROOTFS_DIR/usr/bin/rescue-info" << 'EOF'
#!/bin/sh
# Display system information for rescue operations

echo "=========================================="
echo "ScreenControl Rescue - System Information"
echo "=========================================="
echo ""

echo "=== Hardware ==="
echo "CPU: $(grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2 | xargs)"
echo "Memory: $(free -h | awk '/^Mem:/ {print $2}') total, $(free -h | awk '/^Mem:/ {print $7}') available"
echo "Architecture: $(uname -m)"
echo ""

echo "=== Storage Devices ==="
lsblk -d -o NAME,SIZE,TYPE,TRAN,MODEL 2>/dev/null || fdisk -l 2>/dev/null | grep "^Disk /"
echo ""

echo "=== Partitions ==="
lsblk -o NAME,SIZE,FSTYPE,LABEL,MOUNTPOINT 2>/dev/null
echo ""

echo "=== Network ==="
ip -br addr 2>/dev/null || ifconfig 2>/dev/null
echo ""

echo "=== Detected Operating Systems ==="
for dev in /dev/sd* /dev/nvme*p* /dev/vd*; do
    [ -b "$dev" ] || continue
    FS=$(blkid -o value -s TYPE "$dev" 2>/dev/null)
    case "$FS" in
        ntfs)
            echo "$dev: Windows (NTFS)"
            ;;
        ext4|ext3|ext2|xfs|btrfs)
            echo "$dev: Linux ($FS)"
            ;;
        hfsplus|apfs)
            echo "$dev: macOS ($FS)"
            ;;
        vfat)
            LABEL=$(blkid -o value -s LABEL "$dev" 2>/dev/null)
            if [ "$LABEL" = "EFI" ] || [ "$LABEL" = "SYSTEM" ]; then
                echo "$dev: EFI System Partition"
            fi
            ;;
    esac
done 2>/dev/null
echo ""

echo "=== ScreenControl Status ==="
screencontrol-connect 2>/dev/null | head -10
EOF
chmod +x "$ROOTFS_DIR/usr/bin/rescue-info"

# Auto-run on login
cat >> "$ROOTFS_DIR/etc/profile" << 'EOF'

# Show rescue info on login
if [ "$(tty)" = "/dev/tty1" ]; then
    clear
    cat /etc/motd
    rescue-info
fi
EOF

# ---------------------------------------------
# Step 7: Build ISO
# ---------------------------------------------
echo "[7/7] Building ISO image..."

# Copy kernel and initramfs
KERNEL_VERSION=$(ls "$ROOTFS_DIR/lib/modules/" | head -1)
cp "$ROOTFS_DIR/boot/vmlinuz-lts" "$ISO_DIR/boot/vmlinuz"
cp "$ROOTFS_DIR/boot/initramfs-lts" "$ISO_DIR/boot/initramfs"

# Create squashfs of rootfs
mksquashfs "$ROOTFS_DIR" "$ISO_DIR/rootfs.squashfs" -comp xz -Xbcj x86

# Create GRUB config
cat > "$ISO_DIR/boot/grub/grub.cfg" << 'EOF'
set timeout=5
set default=0

menuentry "ScreenControl Rescue" {
    linux /boot/vmlinuz quiet modloop=/rootfs.squashfs modules=loop,squashfs,sd-mod,usb-storage
    initrd /boot/initramfs
}

menuentry "ScreenControl Rescue (Safe Mode)" {
    linux /boot/vmlinuz modloop=/rootfs.squashfs modules=loop,squashfs nomodeset
    initrd /boot/initramfs
}

menuentry "ScreenControl Rescue (Debug)" {
    linux /boot/vmlinuz modloop=/rootfs.squashfs modules=loop,squashfs,sd-mod,usb-storage debug
    initrd /boot/initramfs
}
EOF

# Build hybrid ISO (BIOS + UEFI)
grub-mkrescue -o "$OUTPUT_DIR/screencontrol-rescue-$VERSION-$ARCH.iso" "$ISO_DIR"

echo ""
echo "=========================================="
echo "Build complete!"
echo "ISO: $OUTPUT_DIR/screencontrol-rescue-$VERSION-$ARCH.iso"
echo "Size: $(du -h "$OUTPUT_DIR/screencontrol-rescue-$VERSION-$ARCH.iso" | cut -f1)"
echo "=========================================="

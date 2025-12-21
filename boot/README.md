# ScreenControl Rescue Boot System

A bootable Alpine Linux USB that provides LLM operators with comprehensive low-level access to diagnose and repair broken operating systems.

## Quick Start

```bash
# Build the ISO
./build.sh

# With pre-configured tenant
TENANT_ID=your-tenant-id ./build.sh

# Output will be in dist/
ls dist/
```

## Directory Structure

```
boot/
├── Dockerfile              # Build environment
├── build.sh                # Local build script
├── build/
│   └── build-iso.sh        # Main ISO build script (runs in Docker)
├── config/
│   └── packages.txt        # Package list reference
├── overlay/
│   ├── opt/screencontrol/  # Agent binary (place static build here)
│   └── etc/screencontrol/  # Config templates
├── scripts/
│   └── build-agent-static.sh  # Build static agent binary
└── dist/                   # Built ISO output
```

## Building the Agent

The ISO requires a statically-linked ScreenControlService binary:

```bash
# Build on Alpine (or in Docker)
./scripts/build-agent-static.sh
```

Or manually:

```bash
docker run --rm -v $(pwd)/..:/build alpine:3.19 /build/boot/scripts/build-agent-static.sh
```

## Tenant Configuration

Two options for connecting rescue systems to your tenant:

### Option 1: Pre-configured ISO

Build with your tenant ID baked in:

```bash
TENANT_ID=cmxxxxxx ./build.sh
```

The ISO will auto-connect to your tenant on boot.

### Option 2: Runtime Pairing

Build without tenant ID. Users pair at boot time:

```bash
# On the booted rescue system:
screencontrol-pair xxxx-xxxx-xxxx-xxxx
```

Get pairing tokens from: https://screencontrol.knws.co.uk/dashboard/rescue

## Rescue System Usage

When booted, the rescue system provides:

- `screencontrol-connect` - Show connection status
- `screencontrol-pair <TOKEN>` - Pair with tenant
- `rescue-info` - Display system information

## Included Tools

### Filesystem Support
- **Linux**: ext2/3/4, XFS, Btrfs
- **Windows**: NTFS, FAT12/16/32, exFAT
- **macOS**: HFS+ (read/write), APFS (read-only)

### Disk Tools
- parted, gdisk, fdisk
- smartctl, hdparm
- ddrescue, testdisk

### Bootloader Tools
- GRUB install/repair
- Windows BCD repair (chntpw)
- EFI boot manager

### Recovery Tools
- testdisk (partition recovery)
- photorec (file recovery)
- ddrescue (disk imaging)

## Writing to USB

### Linux/macOS
```bash
sudo dd if=dist/screencontrol-rescue-1.0.0-x86_64.iso of=/dev/sdX bs=4M status=progress
```

### Windows
Use Rufus or balenaEtcher.

## Testing in QEMU

```bash
qemu-system-x86_64 -cdrom dist/screencontrol-rescue-1.0.0-x86_64.iso -m 2G
```

## Boot Options

The GRUB menu provides:

1. **ScreenControl Rescue** - Normal boot
2. **Safe Mode** - Minimal drivers (nomodeset)
3. **Debug** - Verbose boot logging

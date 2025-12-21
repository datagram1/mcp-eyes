# ScreenControl Rescue - Boot USB Toolkit

## Vision

A bootable Alpine Linux USB that provides LLM operators with comprehensive low-level access to diagnose and repair broken operating systems. The rescue environment acts as the "hands" - a toolkit that exposes system access via MCP tools - while the LLM provides the "brain" to reason about problems and execute fixes.

**Philosophy**: We don't fix the system - we give the AI the tools to fix the system.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    LLM Operator (Brain)                     │
│         Claude / GPT / Local LLM via MCP Protocol           │
├─────────────────────────────────────────────────────────────┤
│                 ScreenControl Web Server                     │
│              WebSocket relay + tool routing                  │
├─────────────────────────────────────────────────────────────┤
│              ScreenControl Rescue Agent                      │
│         Static binary, auto-connects on boot                 │
├─────────────────────────────────────────────────────────────┤
│                  Alpine Linux (Minimal)                      │
│    ~150MB base + tools, boots in <10 seconds                │
├─────────────────────────────────────────────────────────────┤
│              Filesystem & Hardware Access                    │
│  ext2/3/4 | FAT12/16/32 | NTFS | HFS+ | APFS | exFAT       │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Base Image Build System

### 1.1 Alpine Linux Base
- [ ] Set up Alpine Linux build environment (docker-based)
- [ ] Configure kernel with all required drivers:
  - [ ] USB storage (USB 2.0, 3.0, 3.1, USB-C)
  - [ ] NVMe controllers
  - [ ] SATA/AHCI controllers
  - [ ] Common RAID controllers
  - [ ] Network drivers (Intel, Realtek, Broadcom, etc.)
  - [ ] WiFi drivers (iwlwifi, ath9k, etc.)
- [ ] Enable UEFI + Legacy BIOS boot support
- [ ] Configure initramfs with early module loading
- [ ] Target size: <200MB ISO

### 1.2 Boot Configuration
- [ ] GRUB/syslinux configuration for hybrid boot
- [ ] UEFI Secure Boot support (signed bootloader)
- [ ] Boot menu with options:
  - [ ] Normal rescue mode
  - [ ] Safe mode (minimal drivers)
  - [ ] RAM-only mode (copy to RAM, eject USB)
  - [ ] Debug mode (verbose logging)
- [ ] Auto-detect and configure display resolution

### 1.3 Network Auto-Configuration
- [ ] DHCP client with fallback to link-local
- [ ] WiFi configuration tool (wpa_supplicant)
- [ ] Captive portal detection and handling
- [ ] mDNS/Avahi for local discovery
- [ ] VPN client support (WireGuard, OpenVPN)

---

## Phase 2: Filesystem Support

### 2.1 Linux Filesystems
- [ ] ext2/ext3/ext4 (full read/write + fsck)
- [ ] XFS (read/write + xfs_repair)
- [ ] Btrfs (read/write + btrfs check)
- [ ] ZFS (read/write + zpool import/scrub)
- [ ] F2FS (read/write)
- [ ] JFS, ReiserFS (legacy support)

### 2.2 Windows Filesystems
- [ ] NTFS via ntfs-3g (full read/write)
- [ ] ntfsfix for basic repairs
- [ ] FAT12/FAT16/FAT32 (read/write + fsck.vfat)
- [ ] exFAT (read/write)
- [ ] ReFS (read-only, if possible)

### 2.3 macOS Filesystems
- [ ] HFS+ via hfsplus/hfsprogs (read/write)
- [ ] APFS via apfs-fuse (read-only initially)
  - [ ] Target: macOS 10.12 Sierra through 10.14 Tahoe
  - [ ] FileVault encrypted volume support
- [ ] Apple partition map support
- [ ] Core Storage / Fusion Drive handling

### 2.4 Other Filesystems
- [ ] ISO9660 / UDF (optical media)
- [ ] SquashFS (live images)
- [ ] CIFS/SMB for network shares
- [ ] NFS client
- [ ] SSHFS for remote access

---

## Phase 3: MCP Tool Implementation

### 3.1 Disk Discovery Tools
```
disk_list              - List all block devices with details
disk_info <device>     - Detailed info (SMART, geometry, partitions)
disk_partitions <dev>  - List partition table (GPT/MBR)
disk_smart <device>    - SMART health data
disk_benchmark <dev>   - Quick read/write speed test
```

### 3.2 Partition Management
```
partition_list <dev>          - List partitions with types
partition_create <dev> <spec> - Create partition
partition_delete <dev> <num>  - Delete partition
partition_resize <dev> <num>  - Resize partition
partition_table_repair <dev>  - Attempt GPT/MBR repair
partition_backup <dev>        - Backup partition table
partition_restore <dev>       - Restore partition table
```

### 3.3 Filesystem Operations
```
fs_detect <partition>     - Detect filesystem type
fs_mount <part> <path>    - Mount filesystem
fs_unmount <path>         - Unmount filesystem
fs_check <partition>      - Check filesystem (fsck equivalent)
fs_repair <partition>     - Attempt filesystem repair
fs_info <partition>       - Filesystem details (size, used, label)
fs_label <part> <name>    - Set filesystem label
fs_resize <partition>     - Resize filesystem
```

### 3.4 File Operations (on mounted FS)
```
file_list <path>              - List directory contents
file_read <path>              - Read file contents
file_write <path> <content>   - Write file
file_copy <src> <dst>         - Copy file/directory
file_move <src> <dst>         - Move file/directory
file_delete <path>            - Delete file/directory
file_find <path> <pattern>    - Find files by name/pattern
file_grep <path> <pattern>    - Search file contents
file_permissions <path>       - Show/modify permissions
file_recover <partition>      - Attempt file recovery (photorec)
```

### 3.5 Bootloader Tools
```
bootloader_detect <dev>       - Detect bootloader type
bootloader_info <dev>         - Bootloader configuration
grub_install <dev>            - Install/reinstall GRUB
grub_repair <dev>             - Repair GRUB configuration
grub_config_list <mount>      - List GRUB menu entries
grub_config_edit <mount>      - Edit GRUB configuration
bcd_list <mount>              - List Windows BCD entries
bcd_repair <mount>            - Repair Windows BCD
bcd_rebuild <mount>           - Rebuild BCD from scratch
efi_list                      - List EFI boot entries
efi_add <path> <name>         - Add EFI boot entry
efi_remove <id>               - Remove EFI boot entry
efi_order <ids>               - Set boot order
```

### 3.6 Windows-Specific Tools
```
windows_detect <mount>        - Detect Windows version
windows_registry_list <mount> <hive> <key>  - List registry keys
windows_registry_read <mount> <hive> <key>  - Read registry value
windows_registry_write <mount> <hive> <key> <value> - Write registry
windows_password_reset <mount> <user>       - Reset local password
windows_admin_enable <mount>                - Enable built-in admin
windows_services_list <mount>               - List services
windows_services_disable <mount> <svc>      - Disable service
windows_drivers_list <mount>                - List installed drivers
windows_sfc_offline <mount>                 - Offline SFC scan
windows_dism_offline <mount> <cmd>          - Offline DISM operations
```

### 3.7 Linux-Specific Tools
```
linux_detect <mount>          - Detect distro and version
linux_fstab_list <mount>      - List fstab entries
linux_fstab_edit <mount>      - Edit fstab
linux_passwd_reset <mount> <user>  - Reset user password
linux_chroot <mount> <cmd>    - Execute in chroot
linux_initramfs_rebuild <mnt> - Rebuild initramfs
linux_grub_update <mount>     - Update GRUB configuration
linux_systemd_list <mount>    - List systemd services
linux_systemd_disable <mnt>   - Disable service
linux_journal <mount>         - View systemd journal
```

### 3.8 macOS-Specific Tools
```
macos_detect <mount>          - Detect macOS version
macos_system_info <mount>     - System information
macos_user_list <mount>       - List user accounts
macos_password_reset <mount> <user>  - Reset user password
macos_nvram_list              - List NVRAM variables
macos_nvram_set <key> <val>   - Set NVRAM variable
macos_recovery_info           - Recovery partition info
macos_preboot_repair <mount>  - Repair preboot volume
```

### 3.9 Data Recovery Tools
```
recover_scan <device>         - Scan for recoverable files
recover_partition <device>    - Attempt partition recovery
recover_files <dev> <output>  - Recover files to location
recover_image <dev> <file>    - Create disk image (ddrescue)
recover_clone <src> <dst>     - Clone disk with bad sector handling
```

### 3.10 Hardware Diagnostics
```
hw_info                       - Full hardware summary
hw_cpu                        - CPU information
hw_memory                     - Memory info + basic test
hw_memory_test                - Extended memory test
hw_pci                        - PCI devices
hw_usb                        - USB devices
hw_network                    - Network interfaces
hw_sensors                    - Temperature/fan sensors
hw_battery                    - Battery status (laptops)
hw_dmidecode                  - BIOS/UEFI information
```

### 3.11 Network Tools
```
net_interfaces                - List network interfaces
net_ip <iface> <ip/dhcp>      - Configure IP
net_wifi_scan                 - Scan WiFi networks
net_wifi_connect <ssid> <pw>  - Connect to WiFi
net_ping <host>               - Ping test
net_dns <domain>              - DNS lookup
net_curl <url>                - HTTP request
net_ssh <host> <cmd>          - SSH command
net_scp <src> <dst>           - SCP file transfer
net_share_mount <path>        - Mount network share
```

### 3.12 System Utilities
```
sys_shell <cmd>               - Execute shell command
sys_log                       - View rescue system logs
sys_dmesg                     - Kernel messages
sys_process_list              - Running processes
sys_reboot                    - Reboot system
sys_poweroff                  - Power off system
sys_boot_target <device>      - Set boot target and reboot
sys_time                      - Current time/date
sys_time_set <datetime>       - Set time
```

---

## Phase 4: Agent Integration

### 4.1 Static Agent Build
- [ ] Build ScreenControlService statically linked for Alpine
- [ ] Minimal dependencies (musl libc)
- [ ] Target binary size: <5MB
- [ ] Architectures: x86_64, arm64

### 4.2 Auto-Start Configuration
- [ ] OpenRC service for agent startup
- [ ] Wait for network before connecting
- [ ] Retry logic for connection failures
- [ ] Fallback to local HTTP API if no internet

### 4.3 Agent Configuration
- [ ] Pre-embedded customer ID in rescue image
- [ ] Agent name: "Rescue-{MAC_ADDRESS}"
- [ ] Special rescue mode flag in agent registration
- [ ] Report booted OS (what we're trying to fix)

### 4.4 Tool Registration
- [ ] Register all rescue tools via MCP tools/list
- [ ] Categorize tools by type (disk, fs, boot, etc.)
- [ ] Include tool documentation in schema
- [ ] Mark dangerous operations (require confirmation)

---

## Phase 5: Build & Distribution

### 5.1 Build Pipeline
- [ ] Docker-based build environment
- [ ] GitHub Actions workflow
- [ ] Automated testing in QEMU/VirtualBox
- [ ] Version numbering and changelog

### 5.2 Output Formats
- [ ] ISO image (for CD/DVD or Ventoy)
- [ ] IMG file (for direct USB write)
- [ ] PXE boot files (kernel + initramfs + rootfs)
- [ ] OVA/VMDK for VM testing

### 5.3 USB Creation Tool
- [ ] Cross-platform USB writer (Electron app?)
- [ ] Or simple instructions for:
  - [ ] Linux: dd or cp
  - [ ] macOS: dd or balenaEtcher
  - [ ] Windows: Rufus or balenaEtcher
- [ ] Verify written image

### 5.4 Customer Stamping
- [ ] Tool to embed customer ID in ISO
- [ ] Pre-configured WiFi credentials (optional)
- [ ] Custom agent name prefix
- [ ] Branding options (boot splash)

---

## Phase 6: Documentation

### 6.1 User Guide
- [ ] Creating bootable USB
- [ ] Booting from USB (BIOS/UEFI)
- [ ] Connecting to ScreenControl
- [ ] Common repair scenarios

### 6.2 LLM Operator Guide
- [ ] Available tools reference
- [ ] Common repair workflows
- [ ] Safety considerations
- [ ] Escalation procedures

### 6.3 Repair Playbooks
- [ ] Windows won't boot (BCD repair)
- [ ] Linux won't boot (GRUB repair)
- [ ] Filesystem corruption (fsck)
- [ ] Forgotten password (reset)
- [ ] Virus/malware removal
- [ ] Data recovery
- [ ] Disk cloning
- [ ] OS reinstallation prep

---

## Phase 7: Testing Matrix

### 7.1 Boot Testing
- [ ] Legacy BIOS boot (various ages)
- [ ] UEFI boot (with/without Secure Boot)
- [ ] Various USB controllers
- [ ] NVMe boot targets

### 7.2 Filesystem Testing
| OS | Filesystem | Read | Write | Repair | Notes |
|----|------------|------|-------|--------|-------|
| Linux | ext4 | | | | Primary target |
| Linux | XFS | | | | |
| Linux | Btrfs | | | | |
| Windows | NTFS | | | | ntfs-3g |
| Windows | FAT32 | | | | |
| macOS | HFS+ | | | | Up to High Sierra |
| macOS | APFS | | | | Mojave (Tahoe) target |

### 7.3 Hardware Compatibility
- [ ] Intel systems (various generations)
- [ ] AMD systems
- [ ] Apple Intel Macs
- [ ] ARM64 systems (if applicable)
- [ ] Various USB keyboard/mouse
- [ ] Display outputs (HDMI, DP, VGA)

---

## Milestones

### M1: Proof of Concept
- Alpine boots from USB
- ScreenControl agent connects
- Basic disk_list and fs_mount work
- Can read files from NTFS/ext4/HFS+

### M2: Core Functionality
- All Phase 3 tools implemented
- Windows/Linux bootloader repair working
- Password reset working
- Stable on Intel UEFI systems

### M3: Production Ready
- All filesystems supported
- Build pipeline automated
- Documentation complete
- Customer stamping working

### M4: Extended Platform
- ARM64 support
- Apple Silicon investigation
- PXE boot support
- OEM partnerships

---

## Open Questions

1. **Apple Silicon**: Can we boot custom Linux on M1/M2 Macs? (Asahi Linux progress)
2. **Secure Boot**: Do we need Microsoft signing for broad compatibility?
3. **APFS Write**: Is write support for APFS feasible/safe?
4. **Licensing**: What licenses apply to included tools? (GPL implications for static linking)
5. **Persistence**: Should rescue USB support persistent storage for logs/recovered files?

---

## Resources

- Alpine Linux: https://alpinelinux.org/
- apfs-fuse: https://github.com/sgan81/apfs-fuse
- ntfs-3g: https://github.com/tuxera/ntfs-3g
- TestDisk/PhotoRec: https://www.cgsecurity.org/
- ddrescue: https://www.gnu.org/software/ddrescue/
- chntpw: https://pogostick.net/~pnh/ntpasswd/

---

## File Structure

```
rescue/
├── build/
│   ├── Dockerfile              # Build environment
│   ├── build.sh                # Main build script
│   ├── config/
│   │   ├── kernel.config       # Kernel configuration
│   │   ├── packages.txt        # Alpine packages to include
│   │   └── services/           # OpenRC service files
│   └── overlay/                # Files to overlay on rootfs
│       ├── etc/
│       │   ├── screencontrol/
│       │   │   └── connection.json
│       │   └── init.d/
│       │       └── screencontrol
│       └── usr/
│           └── bin/
│               └── ScreenControlService
├── tools/
│   ├── disk_tools.sh           # Disk operation wrappers
│   ├── fs_tools.sh             # Filesystem tools
│   ├── boot_tools.sh           # Bootloader tools
│   ├── windows_tools.sh        # Windows-specific
│   ├── linux_tools.sh          # Linux-specific
│   └── macos_tools.sh          # macOS-specific
├── docs/
│   ├── USER_GUIDE.md
│   ├── OPERATOR_GUIDE.md
│   └── playbooks/
└── dist/
    ├── screencontrol-rescue-x86_64.iso
    ├── screencontrol-rescue-x86_64.img
    └── pxe/
        ├── vmlinuz
        ├── initramfs
        └── rootfs.squashfs
```

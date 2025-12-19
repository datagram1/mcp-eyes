# macOS VNC-based Screen Unlock

## Overview

This document describes a VNC-based approach to unlock macOS screens remotely. The standard `osascript`/`System Events` approach fails at the login screen because macOS enables "Secure Input" mode, which blocks keyboard event injection from non-VNC sources.

**Key Insight**: VNC (RFB protocol) has special privileges to interact with the macOS login screen. By connecting to localhost via VNC and sending RFB KeyEvent messages, we can type passwords even when the screen is locked.

## Prerequisites

### 1. Enable Remote Management/Screen Sharing

```bash
# Enable Remote Management with full privileges
sudo /System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart \
    -activate -configure -access -on \
    -users <username> -privs -all \
    -restart -agent -menu

# Enable VNC legacy mode with password
sudo /System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart \
    -configure -clientopts -setvnclegacy -vnclegacy yes \
    -setvncpw -vncpw <vnc_password>

# Restart ARD agent
sudo /System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart \
    -restart -agent
```

### 2. Verify Screen Sharing is running

```bash
netstat -an | grep 5900
# Should show: tcp4 0 0 *.5900 *.* LISTEN
```

### 3. Install Python dependencies

```bash
pip3 install pycryptodomex
```

## VNC Authentication Protocol (Type 2)

macOS Screen Sharing supports multiple auth types:
- **Type 30 (ARD/Diffie-Hellman)**: Apple's proprietary auth with username/password
- **Type 2 (VNC Authentication)**: Standard DES challenge-response with 8-char password

For simplicity, we use Type 2 which only requires a VNC password.

### RFB KeyEvent Message Format

```
Offset  Type    Description
0       U8      Message type (4 = KeyEvent)
1       U8      Down-flag (1 = pressed, 0 = released)
2-3     U16     Padding (0)
4-7     U32     Key (X11 keysym value)
```

Common keysyms:
- Return/Enter: `0xff0d`
- Escape: `0xff1b`
- Alphanumeric: ASCII value (e.g., 'a' = `0x61`)

## Python Implementation

### vnc_unlock.py

```python
#!/usr/bin/env python3
"""
VNC-based macOS screen unlock script.
Uses RFB protocol to send keystrokes via Screen Sharing.
Works at the login screen where CGEventPost/System Events fail.
"""
import socket
import struct
import sys
import time
from Cryptodome.Cipher import DES

# X11 Keysyms
XK_Return = 0xff0d
XK_Escape = 0xff1b

def vnc_des_key(password):
    """Convert VNC password to DES key with bit-reversed bytes."""
    key = (password + '\0' * 8)[:8].encode('latin-1')
    return bytes([int('{:08b}'.format(b)[::-1], 2) for b in key])

def send_key(sock, keysym, down=True):
    """Send a KeyEvent message."""
    sock.send(struct.pack('>BBHI', 4, 1 if down else 0, 0, keysym))

def send_char(sock, char):
    """Send a character as key press + release."""
    keysym = ord(char)
    send_key(sock, keysym, True)
    send_key(sock, keysym, False)
    time.sleep(0.02)

def vnc_unlock(host, port, vnc_password, unlock_password):
    """Connect via VNC and type the unlock password."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        sock.connect((host, port))

        # RFB handshake
        version = sock.recv(12)
        sock.send(b'RFB 003.008\n')

        # Read security types
        num_types = struct.unpack('B', sock.recv(1))[0]
        if num_types == 0:
            error_len = struct.unpack('>I', sock.recv(4))[0]
            error = sock.recv(error_len)
            print(f'Error: {error}', file=sys.stderr)
            return False

        types = [struct.unpack('B', sock.recv(1))[0] for _ in range(num_types)]

        # Select VNC Authentication (type 2)
        if 2 not in types:
            print('VNC Authentication (type 2) not available', file=sys.stderr)
            return False

        sock.send(struct.pack('B', 2))

        # DES challenge-response
        challenge = sock.recv(16)
        cipher = DES.new(vnc_des_key(vnc_password), DES.MODE_ECB)
        sock.send(cipher.encrypt(challenge))

        result = struct.unpack('>I', sock.recv(4))[0]
        if result != 0:
            print('VNC authentication failed', file=sys.stderr)
            return False

        # ClientInit (share desktop)
        sock.send(struct.pack('B', 1))

        # Read ServerInit
        server_init = sock.recv(24)
        name_len = struct.unpack('>I', server_init[20:24])[0]
        sock.recv(name_len)

        # Press Escape to dismiss any dialogs
        send_key(sock, XK_Escape, True)
        send_key(sock, XK_Escape, False)
        time.sleep(0.1)

        # Type the unlock password
        for char in unlock_password:
            send_char(sock, char)

        # Press Enter to submit
        time.sleep(0.1)
        send_key(sock, XK_Return, True)
        send_key(sock, XK_Return, False)

        time.sleep(0.5)
        sock.close()
        return True

    except Exception as e:
        print(f'VNC error: {e}', file=sys.stderr)
        return False

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(f'Usage: {sys.argv[0]} <vnc_password> <unlock_password>', file=sys.stderr)
        sys.exit(1)

    success = vnc_unlock('127.0.0.1', 5900, sys.argv[1], sys.argv[2])
    sys.exit(0 if success else 1)
```

## Integration into ScreenControlService

The VNC unlock has been integrated into the macOS service as a fallback mechanism.

### Implementation Details

**Files Modified:**
- `service/src/platform/macos/platform_macos.cpp` - Added VNC unlock fallback
- `service/include/platform.h` - Added VNC password API declarations
- `service/scripts/vnc_unlock.py` - Python script for RFB key sending

**New Functions:**
```cpp
namespace platform::unlock {
    // Store VNC password in Keychain (max 8 chars - VNC limitation)
    bool storeVncPassword(const std::string& vncPassword);

    // Clear stored VNC password
    bool clearVncPassword();

    // Check if VNC password is stored
    bool hasVncPassword();
}
```

**Unlock Flow:**
1. `unlockWithStoredCredentials()` first tries osascript (works for screensaver)
2. If still locked, falls back to VNC-based unlock (works at login window)
3. VNC unlock checks:
   - Script exists at `/usr/local/share/screencontrol/vnc_unlock.py`
   - VNC password is stored in Keychain
   - Screen Sharing is running (port 5900 listening)
4. Executes: `python3 vnc_unlock.py <vnc_pw> <unlock_pw>`

### Installation

The VNC unlock script should be installed during service deployment:

```bash
# Create script directory
sudo mkdir -p /usr/local/share/screencontrol

# Copy script
sudo cp service/scripts/vnc_unlock.py /usr/local/share/screencontrol/
sudo chmod 755 /usr/local/share/screencontrol/vnc_unlock.py

# Install Python dependency
pip3 install pycryptodomex
```

### Option 2: Native C++ VNC Client

A native implementation would require:
- Socket handling (already available)
- DES encryption with bit-reversed key (requires OpenSSL or similar)
- RFB protocol state machine

This is more complex but avoids the Python dependency.

## Security Considerations

1. **VNC Password Storage**: Store VNC password securely in Keychain, similar to unlock credentials
2. **Localhost Only**: VNC connection is to localhost, not exposed to network
3. **Credential Handling**: Same split-key architecture as existing unlock credentials
4. **Screen Sharing Permissions**: User must explicitly enable Screen Sharing

## Testing

```bash
# Lock the screen
pmset displaysleepnow

# Wait a few seconds, then unlock via VNC
python3 vnc_unlock.py <vnc_password> <user_password>
```

## References

- [RFB Protocol (VNCDoTool)](https://vncdotool.readthedocs.io/en/0.8.0/rfbproto.html)
- [Apple Developer Forums - RFB Security Types](https://developer.apple.com/forums/thread/654421)
- [Nmap VNC Library](https://svn.nmap.org/nmap/nselib/vnc.lua)
- [LibVNCServer](https://github.com/LibVNC/libvncserver)

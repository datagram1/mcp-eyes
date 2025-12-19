# Windows Credential Provider Implementation

## Overview

Implement a Windows Credential Provider to enable automatic screen unlock via the proper Windows authentication pipeline. This replaces the current experimental VNC-based approach with native Windows integration.

### Goal
After one-time user initialization (entering credentials), the system can automatically unlock the Windows lock screen when triggered remotely via the control server.

---

## Phase 1: Project Setup & Infrastructure

### 1.1 Create Credential Provider Project Structure
- [ ] Create directory: `service/src/platform/windows/credential_provider/`
- [ ] Create `ScreenControlCredentialProvider.h` - Main provider class header
- [ ] Create `ScreenControlCredentialProvider.cpp` - Provider implementation
- [ ] Create `ScreenControlCredential.h` - Credential tile class header
- [ ] Create `ScreenControlCredential.cpp` - Credential tile implementation
- [ ] Create `dll_main.cpp` - DLL entry point and COM registration
- [ ] Create `guid.h` - GUID definitions for COM objects
- [ ] Create `resource.h` and `resources.rc` - Icons and strings for credential tile

### 1.2 Build System Integration
- [ ] Create `CMakeLists.txt` for credential provider DLL
- [ ] Configure as shared library (.dll) output
- [ ] Add required Windows SDK headers: `credentialprovider.h`, `ntsecapi.h`
- [ ] Link required libraries: `Secur32.lib`, `Credui.lib`, `Advapi32.lib`
- [ ] Add to main build script (`build-all.sh`) for Windows targets
- [ ] Create `.def` file for DLL exports (`DllGetClassObject`, `DllCanUnloadNow`, etc.)

### 1.3 Development Environment
- [ ] Document MSVC build requirements (cannot cross-compile COM DLLs with MinGW)
- [ ] Create Visual Studio solution/project files for native Windows development
- [ ] Set up Windows VM or dev machine for testing
- [ ] Document debugger attachment to Winlogon process

---

## Phase 2: Credential Provider Core Implementation

### 2.1 COM Infrastructure
- [ ] Implement `IClassFactory` for credential provider instantiation
- [ ] Implement `DllGetClassObject` - COM object creation
- [ ] Implement `DllCanUnloadNow` - DLL unload check
- [ ] Implement `DllRegisterServer` / `DllUnregisterServer` - Self-registration
- [ ] Generate GUIDs for:
  - Credential Provider CLSID
  - Credential tile class

### 2.2 ICredentialProvider Implementation
- [ ] Implement `SetUsageScenario` - Handle `CPUS_UNLOCK_WORKSTATION` scenario
- [ ] Implement `SetSerialization` - Handle incoming credential data
- [ ] Implement `Advise` / `UnAdvise` - Event callback registration
- [ ] Implement `GetFieldDescriptorCount` - Define UI fields
- [ ] Implement `GetFieldDescriptorAt` - Return field descriptors
- [ ] Implement `GetCredentialCount` - Return number of credential tiles
- [ ] Implement `GetCredentialAt` - Return credential instance

### 2.3 ICredentialProviderCredential Implementation
- [ ] Implement `Advise` / `UnAdvise` - Credential-level event callbacks
- [ ] Implement `SetSelected` / `SetDeselected` - Tile selection handling
- [ ] Implement `GetFieldState` - Field visibility states
- [ ] Implement `GetStringValue` - Return display strings
- [ ] Implement `GetBitmapValue` - Return tile icon
- [ ] Implement `GetSubmitButtonValue` - Submit button field
- [ ] Implement `SetStringValue` - Handle user input (if any)
- [ ] Implement `GetSerialization` - **Critical**: Return credentials for Windows logon
- [ ] Implement `ReportResult` - Handle logon result

### 2.4 Credential Tile UI
- [ ] Design tile to show "ScreenControl Auto-Unlock" branding
- [ ] Create 128x128 PNG icon for credential tile
- [ ] Implement status text field (e.g., "Waiting for unlock command...")
- [ ] Optional: Add manual trigger button for testing

---

## Phase 3: Service Integration

### 3.1 HTTP API Extensions
- [ ] Add endpoint: `POST /credential-provider/status` - CP reports ready state
- [ ] Add endpoint: `GET /credential-provider/unlock` - CP polls for unlock command
- [ ] Add endpoint: `GET /credential-provider/credentials` - CP fetches stored credentials
- [ ] Add endpoint: `POST /credential-provider/result` - CP reports unlock success/failure
- [ ] Implement request authentication (shared secret or named pipe token)

### 3.2 Named Pipe Alternative (More Secure)
- [ ] Consider named pipe instead of HTTP for CP ↔ Service communication
- [ ] Create pipe: `\\.\pipe\ScreenControlCredentialProvider`
- [ ] Implement pipe server in service
- [ ] Implement pipe client in credential provider
- [ ] Use Windows security descriptors to restrict pipe access

### 3.3 Service-Side Unlock Command Handler
- [ ] Modify `command_dispatcher.cpp` to handle `machine_unlock` on Windows
- [ ] Set internal flag when unlock command received
- [ ] Credential provider polls or receives notification
- [ ] Clear flag after successful unlock or timeout

### 3.4 Credential Storage Integration
- [ ] Expose existing DPAPI credential storage to credential provider
- [ ] Add API to retrieve decrypted username/password
- [ ] Ensure credentials are fetched only when unlock is authorized
- [ ] Implement secure memory handling (SecureZeroMemory after use)

---

## Phase 4: Automatic Unlock Flow

### 4.1 Initialization Flow (One-Time Setup)
```
User runs initialization:
1. User provides Windows username/password via tray app or CLI
2. Service encrypts credentials with DPAPI + split key
3. Credentials stored in Windows Credential Manager
4. Credential Provider registered and enabled
5. System ready for automatic unlock
```

- [ ] Create initialization UI in tray app (Windows Forms dialog)
- [ ] Add CLI command: `ScreenControlService.exe --store-credentials`
- [ ] Validate credentials before storing (test authentication)
- [ ] Store credentials using existing `storeUnlockCredentials()` function
- [ ] Verify credential provider is registered

### 4.2 Automatic Unlock Flow
```
Remote unlock triggered:
1. Control server sends "machine_unlock" command via WebSocket
2. Service receives command, sets "unlock pending" flag
3. Credential Provider (running in Winlogon) detects pending unlock
4. CP calls GetSerialization() which fetches credentials from service
5. CP returns CREDENTIAL_PROVIDER_GET_SERIALIZATION_RESPONSE with credentials
6. Windows validates credentials via LSA
7. If valid: workstation unlocks, CP reports success
8. If invalid: CP reports failure, service logs error
```

- [ ] Implement unlock pending flag in service (thread-safe)
- [ ] Implement polling mechanism in credential provider
- [ ] Alternative: Use Windows event object for notification
- [ ] Implement `GetSerialization()` to build `KERB_INTERACTIVE_UNLOCK_LOGON` structure
- [ ] Pack credentials into `CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION`
- [ ] Handle domain vs local account scenarios
- [ ] Implement timeout if unlock not completed

### 4.3 Credential Serialization Details
- [ ] Build `KERB_INTERACTIVE_UNLOCK_LOGON` structure:
  - `LogonDomainName` - Domain or computer name
  - `UserName` - Username
  - `Password` - Password (Unicode)
- [ ] Use `CredPackAuthenticationBuffer` for proper serialization
- [ ] Set `pcpgsr` to `CPGSR_RETURN_CREDENTIAL_FINISHED`
- [ ] Set authentication package to `MICROSOFT_KERBEROS_NAME` or `NEGOSSP_NAME`

### 4.4 Lock Screen Detection Enhancement
- [ ] Credential provider can directly know when lock screen is active
- [ ] Update service's `isLocked()` to use credential provider status
- [ ] Handle fast user switching scenarios
- [ ] Handle RDP session lock scenarios

---

## Phase 5: Registration & Installation

### 5.1 Registry Configuration
- [ ] Create registration script for credential provider:
  ```
  HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Providers\{GUID}
    (Default) = "ScreenControl Credential Provider"

  HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Authentication\Credential Provider Filters\{GUID}
    (Optional - to filter other providers)
  ```
- [ ] Set `Disabled` DWORD to control enable/disable
- [ ] Configure for `CPUS_UNLOCK_WORKSTATION` usage scenario only

### 5.2 DLL Deployment
- [ ] Copy DLL to `C:\Program Files\ScreenControl\ScreenControlCP.dll`
- [ ] Register COM object via `regsvr32` or installer
- [ ] Set appropriate file permissions (read-only for non-admins)
- [ ] Sign DLL with code signing certificate

### 5.3 MSI Installer Creation
- [ ] Create WiX installer project: `service/install/windows/`
- [ ] Include service executable
- [ ] Include credential provider DLL
- [ ] Include tray application
- [ ] Add registry entries for credential provider
- [ ] Add service registration
- [ ] Create Start Menu shortcuts
- [ ] Add uninstaller that properly removes credential provider

### 5.4 Installer Actions
- [ ] Custom action: Register credential provider DLL
- [ ] Custom action: Create ScreenControl service
- [ ] Custom action: Start service after install
- [ ] Rollback actions for failed installs
- [ ] Upgrade handling (stop service, replace files, restart)

---

## Phase 6: Security Hardening

### 6.1 Credential Protection
- [ ] Credentials never logged (even in debug builds)
- [ ] Use `SecureZeroMemory` for all credential buffers
- [ ] Credentials only decrypted in credential provider process
- [ ] Short credential lifetime in memory
- [ ] Implement credential refresh if stored too long

### 6.2 Communication Security
- [ ] Named pipe with explicit DACL (SYSTEM and service account only)
- [ ] Validate caller identity before returning credentials
- [ ] Rate limiting on credential requests
- [ ] Audit logging for all unlock attempts

### 6.3 DLL Security
- [ ] Code sign credential provider DLL
- [ ] Enable ASLR, DEP, CFG compiler flags
- [ ] No external dependencies (static link runtime)
- [ ] Minimal attack surface (no unnecessary exports)

### 6.4 Attack Mitigation
- [ ] Prevent credential provider from being loaded by non-Winlogon processes
- [ ] Validate Windows session state before unlock
- [ ] Implement anti-replay for unlock commands
- [ ] Consider TPM integration for key storage (future)

---

## Phase 7: Testing

### 7.1 Unit Testing
- [ ] Test credential serialization format
- [ ] Test DPAPI encryption/decryption
- [ ] Test service API endpoints
- [ ] Mock credential provider scenarios

### 7.2 Integration Testing
- [ ] Test on Windows 10 (multiple builds: 1909, 21H2, 22H2)
- [ ] Test on Windows 11 (22H2, 23H2)
- [ ] Test domain-joined machines
- [ ] Test Azure AD joined machines
- [ ] Test local account machines
- [ ] Test with Windows Hello enabled
- [ ] Test with other credential providers installed

### 7.3 Scenario Testing
- [ ] Normal lock/unlock cycle
- [ ] Multiple rapid unlock commands
- [ ] Unlock with expired password
- [ ] Unlock with changed password
- [ ] Unlock during Windows Update
- [ ] Unlock after system restart
- [ ] Unlock with screen saver active
- [ ] RDP session lock/unlock

### 7.4 Failure Testing
- [ ] Service not running during unlock attempt
- [ ] Invalid stored credentials
- [ ] Network disconnection during unlock
- [ ] Credential provider crash recovery
- [ ] Service crash during unlock

---

## Phase 8: Documentation & Deployment

### 8.1 User Documentation
- [ ] Update `docs/windows_agent_install.md` with credential provider info
- [ ] Create setup guide for credential initialization
- [ ] Document troubleshooting steps
- [ ] Document how to disable/remove credential provider

### 8.2 Developer Documentation
- [ ] Document build process for credential provider
- [ ] Document debugging procedures (attaching to Winlogon)
- [ ] Document COM registration process
- [ ] Create architecture diagram

### 8.3 Enterprise Documentation
- [ ] Document Group Policy compatibility
- [ ] Document interaction with other credential providers
- [ ] Security whitepaper for enterprise review
- [ ] Document audit log entries

---

## File Structure (Final)

```
service/
├── src/
│   └── platform/
│       └── windows/
│           ├── credential_provider/
│           │   ├── CMakeLists.txt
│           │   ├── ScreenControlCredentialProvider.h
│           │   ├── ScreenControlCredentialProvider.cpp
│           │   ├── ScreenControlCredential.h
│           │   ├── ScreenControlCredential.cpp
│           │   ├── dll_main.cpp
│           │   ├── guid.h
│           │   ├── exports.def
│           │   ├── resource.h
│           │   └── resources.rc
│           ├── platform_windows.cpp (existing)
│           └── main_windows.cpp (existing)
└── install/
    └── windows/
        ├── ScreenControl.wxs (WiX installer)
        ├── Product.wxs
        └── scripts/
            ├── register_cp.ps1
            └── unregister_cp.ps1
```

---

## Dependencies & Prerequisites

### Build Requirements
- Visual Studio 2019+ with C++ Desktop workload
- Windows SDK 10.0.19041.0 or later
- WiX Toolset 3.11+ for installer

### Runtime Requirements
- Windows 10 version 1903+ or Windows 11
- .NET 6.0+ runtime (for tray app)
- Administrator privileges for installation

### Code Signing
- EV code signing certificate (recommended for SmartScreen)
- Timestamp server for long-term validity

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Credential provider crash locks out user | Low | Critical | Fail-safe: always show password field; test extensively |
| Stored credentials compromised | Low | Critical | DPAPI + split key; credentials only in memory briefly |
| Incompatibility with future Windows | Medium | High | Follow MS credential provider guidelines; test on Insider builds |
| Enterprise security policy blocks CP | Medium | Medium | Document requirements; provide disable mechanism |
| COM registration fails | Low | Medium | Proper installer; rollback on failure |

---

## Success Criteria

1. User can initialize credentials once via tray app or CLI
2. Remote `machine_unlock` command successfully unlocks Windows
3. Unlock works without any VNC server dependency
4. Works on Windows 10 and Windows 11 (local and domain accounts)
5. Proper Windows audit logging of unlock events
6. No security vulnerabilities in credential handling
7. Clean install/uninstall via MSI package
8. Graceful degradation if credential provider unavailable

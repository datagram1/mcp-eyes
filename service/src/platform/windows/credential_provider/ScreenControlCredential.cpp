// ScreenControl Credential Implementation
// Copyright (c) 2024 ScreenControl. All rights reserved.

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <windows.h>
#include "ScreenControlCredential.h"
#include "ScreenControlCredentialProvider.h"
#include "guid.h"
#include <new>
#define SECURITY_WIN32
#include <security.h>
#include <ntsecapi.h>
#include <wincred.h>
#include <strsafe.h>
#include <shlwapi.h>
#include <sddl.h>      // For ConvertSidToStringSidW
#include <wtsapi32.h>  // For WTSQueryUserToken, WTSGetActiveConsoleSessionId

#pragma comment(lib, "Secur32.lib")
#pragma comment(lib, "Credui.lib")
#pragma comment(lib, "Shlwapi.lib")
#pragma comment(lib, "Wtsapi32.lib")

// External DLL reference counting
extern void DllAddRef();
extern void DllRelease();
extern HINSTANCE g_hInstance;

// File-based logging helper (for secure desktop debugging)
static void FileLog(const wchar_t* message)
{
    HANDLE hFile = CreateFileW(
        L"C:\\ScreenControlCP_debug.log",
        FILE_APPEND_DATA,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        nullptr,
        OPEN_ALWAYS,
        FILE_ATTRIBUTE_NORMAL,
        nullptr);

    if (hFile != INVALID_HANDLE_VALUE)
    {
        SYSTEMTIME st;
        GetLocalTime(&st);
        wchar_t timestamp[64];
        StringCchPrintfW(timestamp, ARRAYSIZE(timestamp),
            L"[%04d-%02d-%02d %02d:%02d:%02d.%03d] ",
            st.wYear, st.wMonth, st.wDay,
            st.wHour, st.wMinute, st.wSecond, st.wMilliseconds);

        char narrowBuf[2048];
        wchar_t fullMsg[2048];
        StringCchPrintfW(fullMsg, ARRAYSIZE(fullMsg), L"%s%s\r\n", timestamp, message);
        int len = WideCharToMultiByte(CP_UTF8, 0, fullMsg, -1, narrowBuf, sizeof(narrowBuf), nullptr, nullptr);
        if (len > 0)
        {
            DWORD written;
            WriteFile(hFile, narrowBuf, len - 1, &written, nullptr);
        }
        CloseHandle(hFile);
    }
}

// Debug logging helper
static void DebugLog(const wchar_t* format, ...)
{
    wchar_t buffer[1024];
    va_list args;
    va_start(args, format);
    StringCchVPrintfW(buffer, ARRAYSIZE(buffer), format, args);
    va_end(args);
    OutputDebugStringW(L"[ScreenControlCP] ");
    OutputDebugStringW(buffer);
    OutputDebugStringW(L"\n");

    // Also write to file for secure desktop debugging
    wchar_t fullMsg[1100];
    StringCchPrintfW(fullMsg, ARRAYSIZE(fullMsg), L"[Credential] %s", buffer);
    FileLog(fullMsg);
}

//-----------------------------------------------------------------------------
// ScreenControlCredential Implementation
//-----------------------------------------------------------------------------

ScreenControlCredential::ScreenControlCredential()
    : m_refCount(1)
    , m_provider(nullptr)
    , m_credentialEvents(nullptr)
    , m_statusText(L"Waiting for unlock command...")
    , m_tileIcon(nullptr)
    , m_autoLogonReady(false)
{
    DllAddRef();
}

ScreenControlCredential::~ScreenControlCredential()
{
    SecureClearCredentials();

    if (m_tileIcon != nullptr)
    {
        DeleteObject(m_tileIcon);
        m_tileIcon = nullptr;
    }

    if (m_credentialEvents != nullptr)
    {
        m_credentialEvents->Release();
        m_credentialEvents = nullptr;
    }

    DllRelease();
}

HRESULT ScreenControlCredential::Initialize(ScreenControlCredentialProvider* provider)
{
    DebugLog(L"Initialize called");

    if (provider == nullptr)
    {
        DebugLog(L"Initialize failed: provider is null");
        return E_INVALIDARG;
    }

    m_provider = provider;

    // Load tile icon from resources (or create a default one)
    // For now, we'll use a simple approach - no custom icon
    // m_tileIcon = LoadBitmapW(g_hInstance, MAKEINTRESOURCEW(IDB_TILE_IMAGE));

    DebugLog(L"Initialize succeeded");
    return S_OK;
}

// IUnknown::QueryInterface
HRESULT ScreenControlCredential::QueryInterface(REFIID riid, void** ppv)
{
    if (ppv == nullptr)
    {
        return E_INVALIDARG;
    }

    *ppv = nullptr;

    if (riid == IID_IUnknown)
    {
        DebugLog(L"QueryInterface: IID_IUnknown");
        *ppv = static_cast<IUnknown*>(this);
    }
    else if (riid == IID_ICredentialProviderCredential)
    {
        DebugLog(L"QueryInterface: IID_ICredentialProviderCredential");
        *ppv = static_cast<ICredentialProviderCredential*>(this);
    }
    else if (riid == IID_ICredentialProviderCredential2)
    {
        // V2 interface is required for auto-logon on Windows 10/11
        // GetUserSid() returns the SID of the user this credential is for
        DebugLog(L"QueryInterface: IID_ICredentialProviderCredential2 - returning interface");
        *ppv = static_cast<ICredentialProviderCredential2*>(this);
    }
    else
    {
        DebugLog(L"QueryInterface: Unknown interface requested");
        return E_NOINTERFACE;
    }

    AddRef();
    return S_OK;
}

ULONG ScreenControlCredential::AddRef()
{
    return InterlockedIncrement(&m_refCount);
}

ULONG ScreenControlCredential::Release()
{
    LONG count = InterlockedDecrement(&m_refCount);
    if (count == 0)
    {
        delete this;
    }
    return count;
}

// ICredentialProviderCredential::Advise
HRESULT ScreenControlCredential::Advise(ICredentialProviderCredentialEvents* pcpce)
{
    if (m_credentialEvents != nullptr)
    {
        m_credentialEvents->Release();
    }

    m_credentialEvents = pcpce;
    if (m_credentialEvents != nullptr)
    {
        m_credentialEvents->AddRef();
    }

    return S_OK;
}

// ICredentialProviderCredential::UnAdvise
HRESULT ScreenControlCredential::UnAdvise()
{
    if (m_credentialEvents != nullptr)
    {
        m_credentialEvents->Release();
        m_credentialEvents = nullptr;
    }

    return S_OK;
}

// ICredentialProviderCredential::SetSelected
HRESULT ScreenControlCredential::SetSelected(BOOL* pbAutoLogon)
{
    DebugLog(L"SetSelected called");

    if (pbAutoLogon == nullptr)
    {
        return E_INVALIDARG;
    }

    // Auto-logon if unlock command is pending
    if (m_provider != nullptr && m_provider->IsUnlockPending())
    {
        DebugLog(L"SetSelected: Unlock is pending - setting auto-logon TRUE");
        *pbAutoLogon = TRUE;
        m_autoLogonReady = true;
    }
    else
    {
        DebugLog(L"SetSelected: No unlock pending - setting auto-logon FALSE");
        *pbAutoLogon = FALSE;
    }

    return S_OK;
}

// ICredentialProviderCredential::SetDeselected
HRESULT ScreenControlCredential::SetDeselected()
{
    // Clear any sensitive data when deselected
    SecureClearCredentials();
    m_autoLogonReady = false;
    return S_OK;
}

// ICredentialProviderCredential::GetFieldState
HRESULT ScreenControlCredential::GetFieldState(
    DWORD dwFieldID,
    CREDENTIAL_PROVIDER_FIELD_STATE* pcpfs,
    CREDENTIAL_PROVIDER_FIELD_INTERACTIVE_STATE* pcpfis)
{
    if (pcpfs == nullptr || pcpfis == nullptr)
    {
        return E_INVALIDARG;
    }

    switch (dwFieldID)
    {
    case SFI_TILE_IMAGE:
        *pcpfs = CPFS_DISPLAY_IN_BOTH;
        *pcpfis = CPFIS_NONE;
        break;

    case SFI_LABEL:
        *pcpfs = CPFS_DISPLAY_IN_BOTH;
        *pcpfis = CPFIS_NONE;
        break;

    case SFI_STATUS:
        *pcpfs = CPFS_DISPLAY_IN_SELECTED_TILE;
        *pcpfis = CPFIS_NONE;
        break;

    case SFI_SUBMIT_BUTTON:
        *pcpfs = CPFS_HIDDEN; // Hidden - we auto-submit
        *pcpfis = CPFIS_NONE;
        break;

    default:
        return E_INVALIDARG;
    }

    return S_OK;
}

// ICredentialProviderCredential::GetStringValue
HRESULT ScreenControlCredential::GetStringValue(DWORD dwFieldID, PWSTR* ppwsz)
{
    if (ppwsz == nullptr)
    {
        return E_INVALIDARG;
    }

    *ppwsz = nullptr;

    HRESULT hr = E_INVALIDARG;
    const wchar_t* value = nullptr;

    switch (dwFieldID)
    {
    case SFI_LABEL:
        value = CREDENTIAL_PROVIDER_NAME;
        break;

    case SFI_STATUS:
        value = m_statusText.c_str();
        break;

    default:
        return E_INVALIDARG;
    }

    if (value != nullptr)
    {
        size_t len = wcslen(value) + 1;
        *ppwsz = static_cast<PWSTR>(CoTaskMemAlloc(len * sizeof(WCHAR)));
        if (*ppwsz != nullptr)
        {
            wcscpy_s(*ppwsz, len, value);
            hr = S_OK;
        }
        else
        {
            hr = E_OUTOFMEMORY;
        }
    }

    return hr;
}

// ICredentialProviderCredential::GetBitmapValue
HRESULT ScreenControlCredential::GetBitmapValue(DWORD dwFieldID, HBITMAP* phbmp)
{
    if (phbmp == nullptr)
    {
        return E_INVALIDARG;
    }

    *phbmp = nullptr;

    if (dwFieldID != SFI_TILE_IMAGE)
    {
        return E_INVALIDARG;
    }

    // Return the tile icon if we have one
    if (m_tileIcon != nullptr)
    {
        *phbmp = m_tileIcon;
        return S_OK;
    }

    // If no custom icon, Windows will use a default
    return E_NOTIMPL;
}

// ICredentialProviderCredential::GetCheckboxValue
HRESULT ScreenControlCredential::GetCheckboxValue(
    DWORD dwFieldID,
    BOOL* pbChecked,
    PWSTR* ppwszLabel)
{
    UNREFERENCED_PARAMETER(dwFieldID);
    UNREFERENCED_PARAMETER(pbChecked);
    UNREFERENCED_PARAMETER(ppwszLabel);
    // We don't have any checkbox fields
    return E_NOTIMPL;
}

// ICredentialProviderCredential::GetSubmitButtonValue
HRESULT ScreenControlCredential::GetSubmitButtonValue(
    DWORD dwFieldID,
    DWORD* pdwAdjacentTo)
{
    if (pdwAdjacentTo == nullptr)
    {
        return E_INVALIDARG;
    }

    if (dwFieldID != SFI_SUBMIT_BUTTON)
    {
        return E_INVALIDARG;
    }

    // Submit button is adjacent to the status field
    *pdwAdjacentTo = SFI_STATUS;
    return S_OK;
}

// ICredentialProviderCredential::GetComboBoxValueCount
HRESULT ScreenControlCredential::GetComboBoxValueCount(
    DWORD dwFieldID,
    DWORD* pcItems,
    DWORD* pdwSelectedItem)
{
    UNREFERENCED_PARAMETER(dwFieldID);
    UNREFERENCED_PARAMETER(pcItems);
    UNREFERENCED_PARAMETER(pdwSelectedItem);
    // We don't have any combo box fields
    return E_NOTIMPL;
}

// ICredentialProviderCredential::GetComboBoxValueAt
HRESULT ScreenControlCredential::GetComboBoxValueAt(
    DWORD dwFieldID,
    DWORD dwItem,
    PWSTR* ppwszItem)
{
    UNREFERENCED_PARAMETER(dwFieldID);
    UNREFERENCED_PARAMETER(dwItem);
    UNREFERENCED_PARAMETER(ppwszItem);
    // We don't have any combo box fields
    return E_NOTIMPL;
}

// ICredentialProviderCredential::SetStringValue
HRESULT ScreenControlCredential::SetStringValue(DWORD dwFieldID, PCWSTR pwz)
{
    UNREFERENCED_PARAMETER(dwFieldID);
    UNREFERENCED_PARAMETER(pwz);
    // We don't have any editable string fields
    return E_NOTIMPL;
}

// ICredentialProviderCredential::SetCheckboxValue
HRESULT ScreenControlCredential::SetCheckboxValue(DWORD dwFieldID, BOOL bChecked)
{
    UNREFERENCED_PARAMETER(dwFieldID);
    UNREFERENCED_PARAMETER(bChecked);
    // We don't have any checkbox fields
    return E_NOTIMPL;
}

// ICredentialProviderCredential::SetComboBoxSelectedValue
HRESULT ScreenControlCredential::SetComboBoxSelectedValue(DWORD dwFieldID, DWORD dwSelectedItem)
{
    UNREFERENCED_PARAMETER(dwFieldID);
    UNREFERENCED_PARAMETER(dwSelectedItem);
    // We don't have any combo box fields
    return E_NOTIMPL;
}

// ICredentialProviderCredential::CommandLinkClicked
HRESULT ScreenControlCredential::CommandLinkClicked(DWORD dwFieldID)
{
    UNREFERENCED_PARAMETER(dwFieldID);
    // We don't have any command link fields
    return E_NOTIMPL;
}

// ICredentialProviderCredential::GetSerialization
// This is the core method - called when Windows wants to authenticate
HRESULT ScreenControlCredential::GetSerialization(
    CREDENTIAL_PROVIDER_GET_SERIALIZATION_RESPONSE* pcpgsr,
    CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* pcpcs,
    PWSTR* ppwszOptionalStatusText,
    CREDENTIAL_PROVIDER_STATUS_ICON* pcpsiOptionalStatusIcon)
{
    DebugLog(L"GetSerialization called - NEW DLL v2");

    if (pcpgsr == nullptr || pcpcs == nullptr)
    {
        DebugLog(L"GetSerialization: Invalid args");
        return E_INVALIDARG;
    }

    *pcpgsr = CPGSR_NO_CREDENTIAL_NOT_FINISHED;
    ZeroMemory(pcpcs, sizeof(*pcpcs));

    if (ppwszOptionalStatusText != nullptr)
    {
        *ppwszOptionalStatusText = nullptr;
    }
    if (pcpsiOptionalStatusIcon != nullptr)
    {
        *pcpsiOptionalStatusIcon = CPSI_NONE;
    }

    // Fetch credentials from the service
    std::wstring username, password, domain;

    if (m_provider != nullptr &&
        m_provider->FetchCredentialsFromService(username, password, domain))
    {
        // Store credentials temporarily
        m_username = username;
        m_password = password;
        m_domain = domain;

        // Build the credential serialization
        HRESULT hr = BuildCredentialSerialization(pcpcs, domain, username, password);

        if (SUCCEEDED(hr))
        {
            *pcpgsr = CPGSR_RETURN_CREDENTIAL_FINISHED;

            // Clear the unlock pending flag
            if (m_provider != nullptr)
            {
                m_provider->ClearUnlockPending();
            }
        }
        else
        {
            // Report error
            if (ppwszOptionalStatusText != nullptr)
            {
                SHStrDupW(L"Failed to build credentials", ppwszOptionalStatusText);
            }
            if (pcpsiOptionalStatusIcon != nullptr)
            {
                *pcpsiOptionalStatusIcon = CPSI_ERROR;
            }
        }

        // Clear credentials from memory
        SecureClearCredentials();

        return hr;
    }
    else
    {
        // Could not fetch credentials
        if (ppwszOptionalStatusText != nullptr)
        {
            SHStrDupW(L"Could not retrieve credentials from service", ppwszOptionalStatusText);
        }
        if (pcpsiOptionalStatusIcon != nullptr)
        {
            *pcpsiOptionalStatusIcon = CPSI_ERROR;
        }

        return E_FAIL;
    }
}

// ICredentialProviderCredential::ReportResult
// Called after Windows attempts authentication with our credentials
HRESULT ScreenControlCredential::ReportResult(
    NTSTATUS ntsStatus,
    NTSTATUS ntsSubstatus,
    PWSTR* ppwszOptionalStatusText,
    CREDENTIAL_PROVIDER_STATUS_ICON* pcpsiOptionalStatusIcon)
{
    UNREFERENCED_PARAMETER(ntsSubstatus);

    bool success = (ntsStatus == 0); // STATUS_SUCCESS

    // Report result back to the service
    if (m_provider != nullptr)
    {
        if (success)
        {
            m_provider->ReportUnlockResult(true, L"");
        }
        else
        {
            wchar_t errorMsg[256];
            StringCchPrintfW(errorMsg, ARRAYSIZE(errorMsg),
                L"Authentication failed with status 0x%08X", ntsStatus);
            m_provider->ReportUnlockResult(false, errorMsg);
        }
    }

    // Provide status text to the user
    if (ppwszOptionalStatusText != nullptr)
    {
        if (success)
        {
            *ppwszOptionalStatusText = nullptr; // No message on success
        }
        else
        {
            SHStrDupW(L"Unlock failed. Please try again or use password.", ppwszOptionalStatusText);
        }
    }

    if (pcpsiOptionalStatusIcon != nullptr)
    {
        *pcpsiOptionalStatusIcon = success ? CPSI_SUCCESS : CPSI_ERROR;
    }

    return S_OK;
}

//-----------------------------------------------------------------------------
// Internal Methods
//-----------------------------------------------------------------------------

void ScreenControlCredential::SetStatusText(const std::wstring& status)
{
    m_statusText = status;

    // Notify Windows of the field change
    if (m_credentialEvents != nullptr)
    {
        m_credentialEvents->SetFieldString(this, SFI_STATUS, m_statusText.c_str());
    }
}

void ScreenControlCredential::TriggerAutoLogon()
{
    m_autoLogonReady = true;

    // Notify Windows that auto-logon is ready
    if (m_credentialEvents != nullptr)
    {
        m_credentialEvents->SetFieldSubmitButton(this, SFI_SUBMIT_BUTTON, SFI_STATUS);
    }
}

// Build KERB_INTERACTIVE_UNLOCK_LOGON structure for Windows authentication
HRESULT ScreenControlCredential::BuildCredentialSerialization(
    CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* pcpcs,
    const std::wstring& domain,
    const std::wstring& username,
    const std::wstring& password)
{
    HRESULT hr = E_FAIL;

    // Use CredPackAuthenticationBuffer to create the credential blob
    // This handles the complex KERB_INTERACTIVE_UNLOCK_LOGON structure for us

    // Build full username in DOMAIN\username format for Windows authentication
    std::wstring fullUsername;
    if (!domain.empty())
    {
        fullUsername = domain + L"\\" + username;
    }
    else
    {
        // Use "." for local machine if no domain specified
        fullUsername = L".\\" + username;
    }

    DebugLog(L"BuildCredentialSerialization: fullUsername=%s", fullUsername.c_str());

    DWORD cbPackedCreds = 0;
    LPBYTE pbPackedCreds = nullptr;

    // First call to get required size
    if (!CredPackAuthenticationBufferW(
        CRED_PACK_PROTECTED_CREDENTIALS,
        const_cast<LPWSTR>(fullUsername.c_str()),
        const_cast<LPWSTR>(password.c_str()),
        nullptr,
        &cbPackedCreds) && GetLastError() == ERROR_INSUFFICIENT_BUFFER)
    {
        // Allocate buffer
        pbPackedCreds = static_cast<LPBYTE>(CoTaskMemAlloc(cbPackedCreds));

        if (pbPackedCreds != nullptr)
        {
            // Second call to get the packed credentials
            if (CredPackAuthenticationBufferW(
                CRED_PACK_PROTECTED_CREDENTIALS,
                const_cast<LPWSTR>(fullUsername.c_str()),
                const_cast<LPWSTR>(password.c_str()),
                pbPackedCreds,
                &cbPackedCreds))
            {
                // Get the authentication package ID
                ULONG ulAuthPackage = 0;
                HANDLE hLsa = nullptr;
                NTSTATUS status = LsaConnectUntrusted(&hLsa);

                if (status == 0)
                {
                    LSA_STRING lsaszPackageName;
                    lsaszPackageName.Buffer = const_cast<PCHAR>(NEGOSSP_NAME_A);
                    lsaszPackageName.Length = static_cast<USHORT>(strlen(lsaszPackageName.Buffer));
                    lsaszPackageName.MaximumLength = lsaszPackageName.Length + 1;

                    status = LsaLookupAuthenticationPackage(hLsa, &lsaszPackageName, &ulAuthPackage);

                    LsaDeregisterLogonProcess(hLsa);

                    if (status == 0)
                    {
                        // Fill in the credential serialization
                        pcpcs->ulAuthenticationPackage = ulAuthPackage;
                        pcpcs->cbSerialization = cbPackedCreds;
                        pcpcs->rgbSerialization = pbPackedCreds;
                        pcpcs->clsidCredentialProvider = CLSID_ScreenControlCredentialProvider;

                        hr = S_OK;
                    }
                }
            }

            if (FAILED(hr))
            {
                // Clean up on failure
                SecureZeroMemory(pbPackedCreds, cbPackedCreds);
                CoTaskMemFree(pbPackedCreds);
            }
        }
        else
        {
            hr = E_OUTOFMEMORY;
        }
    }

    return hr;
}

// ICredentialProviderCredential2::GetUserSid
// Returns the SID of the user this credential is for
// We return the user's SID so this credential appears as an option for that user
HRESULT ScreenControlCredential::GetUserSid(PWSTR* ppszSid)
{
    DebugLog(L"GetUserSid called");

    if (ppszSid == nullptr)
    {
        return E_INVALIDARG;
    }

    // If we have a stored user SID, return it
    if (!m_userSid.empty())
    {
        DebugLog(L"GetUserSid: Returning stored SID: %s", m_userSid.c_str());

        // Allocate memory for the SID string using CoTaskMemAlloc
        size_t len = (m_userSid.length() + 1) * sizeof(WCHAR);
        *ppszSid = static_cast<PWSTR>(CoTaskMemAlloc(len));
        if (*ppszSid == nullptr)
        {
            return E_OUTOFMEMORY;
        }
        wcscpy_s(*ppszSid, m_userSid.length() + 1, m_userSid.c_str());
        return S_OK;
    }

    // No SID set - return S_FALSE to indicate this credential can appear for any user
    DebugLog(L"GetUserSid: No SID set, returning S_FALSE");
    *ppszSid = nullptr;
    return S_FALSE;
}

void ScreenControlCredential::SecureClearCredentials()
{
    // Securely wipe credential strings
    if (!m_username.empty())
    {
        SecureZeroMemory(&m_username[0], m_username.size() * sizeof(wchar_t));
        m_username.clear();
    }

    if (!m_password.empty())
    {
        SecureZeroMemory(&m_password[0], m_password.size() * sizeof(wchar_t));
        m_password.clear();
    }

    if (!m_domain.empty())
    {
        SecureZeroMemory(&m_domain[0], m_domain.size() * sizeof(wchar_t));
        m_domain.clear();
    }
}

// ScreenControl Credential Provider Implementation
// Copyright (c) 2024 ScreenControl. All rights reserved.

// Must define these BEFORE any Windows headers
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif

// Include winsock2.h BEFORE windows.h to avoid conflicts
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>

#include "ScreenControlCredentialProvider.h"
#include "ScreenControlCredential.h"
#include "guid.h"
#include <new>
#include <string>
#include <cctype>

#pragma comment(lib, "ws2_32.lib")

#include <strsafe.h>

// External DLL reference counting
extern void DllAddRef();
extern void DllRelease();

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
        // Get timestamp
        SYSTEMTIME st;
        GetLocalTime(&st);
        wchar_t timestamp[64];
        StringCchPrintfW(timestamp, ARRAYSIZE(timestamp),
            L"[%04d-%02d-%02d %02d:%02d:%02d.%03d] ",
            st.wYear, st.wMonth, st.wDay,
            st.wHour, st.wMinute, st.wSecond, st.wMilliseconds);

        // Write timestamp and message
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

    // Output to debugger
    OutputDebugStringW(L"[ScreenControlCP-Provider] ");
    OutputDebugStringW(buffer);
    OutputDebugStringW(L"\n");

    // Also write to file for secure desktop debugging
    wchar_t fullMsg[1100];
    StringCchPrintfW(fullMsg, ARRAYSIZE(fullMsg), L"[Provider] %s", buffer);
    FileLog(fullMsg);
}

// Service communication constants
static const wchar_t* SERVICE_PIPE_NAME = L"\\\\.\\pipe\\ScreenControlCredentialProvider";
static const char* SERVICE_HTTP_HOST = "127.0.0.1";
static const int SERVICE_HTTP_PORT = 3459;
static const int POLL_INTERVAL_MS = 500;

// CPFG_CREDENTIAL_PROVIDER_LOGO GUID (if not defined in SDK)
// {2d837775-f6cd-464e-a745-482fd0b47493}
static const GUID CPFG_CREDENTIAL_PROVIDER_LOGO_LOCAL =
{ 0x2d837775, 0xf6cd, 0x464e, { 0xa7, 0x45, 0x48, 0x2f, 0xd0, 0xb4, 0x74, 0x93 } };

// Field descriptors for the credential tile UI
static const CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR s_fieldDescriptors[] =
{
    { SFI_TILE_IMAGE,    CPFT_TILE_IMAGE,    const_cast<LPWSTR>(L"Image"),        CPFG_CREDENTIAL_PROVIDER_LOGO_LOCAL },
    { SFI_LABEL,         CPFT_LARGE_TEXT,    const_cast<LPWSTR>(L"Label"),        GUID_NULL },
    { SFI_STATUS,        CPFT_SMALL_TEXT,    const_cast<LPWSTR>(L"Status"),       GUID_NULL },
    { SFI_SUBMIT_BUTTON, CPFT_SUBMIT_BUTTON, const_cast<LPWSTR>(L"Submit"),       GUID_NULL },
};

//-----------------------------------------------------------------------------
// ScreenControlCredentialProvider Implementation
//-----------------------------------------------------------------------------

ScreenControlCredentialProvider::ScreenControlCredentialProvider()
    : m_refCount(1)
    , m_cpus(CPUS_INVALID)
    , m_credential(nullptr)
    , m_providerEvents(nullptr)
    , m_adviseContext(0)
    , m_unlockPending(false)
    , m_userArray(nullptr)
    , m_pollThread(nullptr)
    , m_stopEvent(nullptr)
{
    DebugLog(L"ScreenControlCredentialProvider constructor");
    DllAddRef();
}

ScreenControlCredentialProvider::~ScreenControlCredentialProvider()
{
    DebugLog(L"ScreenControlCredentialProvider destructor");
    StopPolling();

    if (m_credential != nullptr)
    {
        m_credential->Release();
        m_credential = nullptr;
    }

    if (m_providerEvents != nullptr)
    {
        m_providerEvents->Release();
        m_providerEvents = nullptr;
    }

    if (m_userArray != nullptr)
    {
        m_userArray->Release();
        m_userArray = nullptr;
    }

    DllRelease();
}

// IUnknown::QueryInterface
HRESULT ScreenControlCredentialProvider::QueryInterface(REFIID riid, void** ppv)
{
    if (ppv == nullptr)
    {
        return E_INVALIDARG;
    }

    *ppv = nullptr;

    if (riid == IID_IUnknown)
    {
        DebugLog(L"QueryInterface: IID_IUnknown");
        *ppv = static_cast<IUnknown*>(static_cast<ICredentialProvider*>(this));
    }
    else if (riid == IID_ICredentialProvider)
    {
        DebugLog(L"QueryInterface: IID_ICredentialProvider");
        *ppv = static_cast<ICredentialProvider*>(this);
    }
    else if (riid == IID_ICredentialProviderSetUserArray)
    {
        DebugLog(L"QueryInterface: IID_ICredentialProviderSetUserArray");
        *ppv = static_cast<ICredentialProviderSetUserArray*>(this);
    }
    else
    {
        DebugLog(L"QueryInterface: Unknown IID, returning E_NOINTERFACE");
        return E_NOINTERFACE;
    }

    AddRef();
    return S_OK;
}

ULONG ScreenControlCredentialProvider::AddRef()
{
    return InterlockedIncrement(&m_refCount);
}

ULONG ScreenControlCredentialProvider::Release()
{
    LONG count = InterlockedDecrement(&m_refCount);
    if (count == 0)
    {
        delete this;
    }
    return count;
}

// ICredentialProvider::SetUsageScenario
// Called when the credential provider is instantiated for a specific scenario
HRESULT ScreenControlCredentialProvider::SetUsageScenario(
    CREDENTIAL_PROVIDER_USAGE_SCENARIO cpus,
    DWORD dwFlags)
{
    UNREFERENCED_PARAMETER(dwFlags);

    DebugLog(L"SetUsageScenario called with cpus=%d, dwFlags=0x%08X", cpus, dwFlags);

    HRESULT hr = E_INVALIDARG;

    // We support both LOGON and UNLOCK scenarios
    switch (cpus)
    {
    case CPUS_LOGON:
    case CPUS_UNLOCK_WORKSTATION:
        DebugLog(L"SetUsageScenario: %s - supported",
            cpus == CPUS_LOGON ? L"CPUS_LOGON" : L"CPUS_UNLOCK_WORKSTATION");
        m_cpus = cpus;

        // Create the credential tile
        if (m_credential == nullptr)
        {
            DebugLog(L"SetUsageScenario: Creating new credential");
            m_credential = new (std::nothrow) ScreenControlCredential();
            if (m_credential != nullptr)
            {
                hr = m_credential->Initialize(this);
                DebugLog(L"SetUsageScenario: Credential Initialize returned 0x%08X", hr);
                if (SUCCEEDED(hr))
                {
                    // Pass the user SID that was stored from SetUserArray (which was called earlier)
                    if (!m_targetUserSid.empty())
                    {
                        DebugLog(L"SetUsageScenario: Setting target user SID: %s", m_targetUserSid.c_str());
                        m_credential->SetTargetUserSid(m_targetUserSid);
                    }
                    else
                    {
                        DebugLog(L"SetUsageScenario: WARNING - No target user SID available!");
                    }

                    // Start polling for unlock commands
                    DebugLog(L"SetUsageScenario: Starting polling thread");
                    StartPolling();
                }
            }
            else
            {
                DebugLog(L"SetUsageScenario: Failed to allocate credential");
                hr = E_OUTOFMEMORY;
            }
        }
        else
        {
            DebugLog(L"SetUsageScenario: Credential already exists");
            // Still need to start polling when reusing the credential
            DebugLog(L"SetUsageScenario: Starting polling thread for existing credential");
            StartPolling();
            hr = S_OK;
        }
        break;

    case CPUS_CREDUI:
    case CPUS_CHANGE_PASSWORD:
        // We don't support these scenarios - let other providers handle them
        hr = E_NOTIMPL;
        break;

    default:
        hr = E_INVALIDARG;
        break;
    }

    return hr;
}

// ICredentialProvider::SetSerialization
// Called when credentials are passed to the provider (e.g., from another provider)
HRESULT ScreenControlCredentialProvider::SetSerialization(
    const CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* pcpcs)
{
    UNREFERENCED_PARAMETER(pcpcs);
    // We don't accept serialized credentials from other sources
    return E_NOTIMPL;
}

// ICredentialProvider::Advise
// Called to register for credential provider events
HRESULT ScreenControlCredentialProvider::Advise(
    ICredentialProviderEvents* pcpe,
    UINT_PTR upAdviseContext)
{
    if (m_providerEvents != nullptr)
    {
        m_providerEvents->Release();
    }

    m_providerEvents = pcpe;
    if (m_providerEvents != nullptr)
    {
        m_providerEvents->AddRef();
    }

    m_adviseContext = upAdviseContext;

    return S_OK;
}

// ICredentialProvider::UnAdvise
// Called to unregister from credential provider events
HRESULT ScreenControlCredentialProvider::UnAdvise()
{
    if (m_providerEvents != nullptr)
    {
        m_providerEvents->Release();
        m_providerEvents = nullptr;
    }

    m_adviseContext = 0;

    return S_OK;
}

// ICredentialProvider::GetFieldDescriptorCount
HRESULT ScreenControlCredentialProvider::GetFieldDescriptorCount(DWORD* pdwCount)
{
    if (pdwCount == nullptr)
    {
        return E_INVALIDARG;
    }

    *pdwCount = SFI_NUM_FIELDS;
    return S_OK;
}

// ICredentialProvider::GetFieldDescriptorAt
HRESULT ScreenControlCredentialProvider::GetFieldDescriptorAt(
    DWORD dwIndex,
    CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR** ppcpfd)
{
    if (ppcpfd == nullptr)
    {
        return E_INVALIDARG;
    }

    *ppcpfd = nullptr;

    if (dwIndex >= SFI_NUM_FIELDS)
    {
        return E_INVALIDARG;
    }

    // Allocate and copy the field descriptor
    CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR* pfd = static_cast<CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR*>(
        CoTaskMemAlloc(sizeof(CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR)));

    if (pfd == nullptr)
    {
        return E_OUTOFMEMORY;
    }

    const CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR& src = s_fieldDescriptors[dwIndex];

    pfd->dwFieldID = src.dwFieldID;
    pfd->cpft = src.cpft;
    pfd->guidFieldType = src.guidFieldType;

    // Copy the label string
    if (src.pszLabel != nullptr)
    {
        size_t len = wcslen(src.pszLabel) + 1;
        pfd->pszLabel = static_cast<PWSTR>(CoTaskMemAlloc(len * sizeof(WCHAR)));
        if (pfd->pszLabel != nullptr)
        {
            wcscpy_s(pfd->pszLabel, len, src.pszLabel);
        }
    }
    else
    {
        pfd->pszLabel = nullptr;
    }

    *ppcpfd = pfd;
    return S_OK;
}

// ICredentialProvider::GetCredentialCount
HRESULT ScreenControlCredentialProvider::GetCredentialCount(
    DWORD* pdwCount,
    DWORD* pdwDefault,
    BOOL* pbAutoLogonWithDefault)
{
    DebugLog(L"GetCredentialCount called, m_unlockPending=%d", m_unlockPending ? 1 : 0);

    if (pdwCount == nullptr || pdwDefault == nullptr || pbAutoLogonWithDefault == nullptr)
    {
        return E_INVALIDARG;
    }

    // We have one credential tile
    *pdwCount = 1;
    *pdwDefault = 0;

    // Auto-logon when unlock command is pending
    *pbAutoLogonWithDefault = m_unlockPending ? TRUE : FALSE;

    DebugLog(L"GetCredentialCount: count=1, default=0, autoLogon=%d", *pbAutoLogonWithDefault);

    return S_OK;
}

// ICredentialProvider::GetCredentialAt
HRESULT ScreenControlCredentialProvider::GetCredentialAt(
    DWORD dwIndex,
    ICredentialProviderCredential** ppcpc)
{
    DebugLog(L"GetCredentialAt called with dwIndex=%d", dwIndex);

    if (ppcpc == nullptr)
    {
        return E_INVALIDARG;
    }

    *ppcpc = nullptr;

    if (dwIndex != 0 || m_credential == nullptr)
    {
        DebugLog(L"GetCredentialAt: Invalid index or no credential");
        return E_INVALIDARG;
    }

    m_credential->AddRef();
    *ppcpc = m_credential;

    DebugLog(L"GetCredentialAt: Returning credential successfully");
    return S_OK;
}

// ICredentialProviderSetUserArray::SetUserArray
// Called by LogonUI to provide the list of users that will be displayed
// NOTE: This can be called either BEFORE or AFTER SetUsageScenario depending on the scenario!
HRESULT ScreenControlCredentialProvider::SetUserArray(ICredentialProviderUserArray* users)
{
    DebugLog(L"SetUserArray called");

    // Release any previously stored user array
    if (m_userArray != nullptr)
    {
        m_userArray->Release();
    }

    // Store the new user array
    m_userArray = users;
    if (m_userArray != nullptr)
    {
        m_userArray->AddRef();

        // Log the number of users and get the first user's SID
        DWORD dwUserCount = 0;
        if (SUCCEEDED(m_userArray->GetCount(&dwUserCount)))
        {
            DebugLog(L"SetUserArray: Got %d users", dwUserCount);

            // If we have users, extract and store the first user's SID
            if (dwUserCount > 0)
            {
                ICredentialProviderUser* pUser = nullptr;
                if (SUCCEEDED(m_userArray->GetAt(0, &pUser)) && pUser != nullptr)
                {
                    PWSTR pszSid = nullptr;
                    if (SUCCEEDED(pUser->GetSid(&pszSid)) && pszSid != nullptr)
                    {
                        DebugLog(L"SetUserArray: First user SID: %s", pszSid);
                        m_targetUserSid = pszSid;  // Store in provider

                        // If credential already exists (SetUsageScenario was called first),
                        // update it with the SID now
                        if (m_credential != nullptr)
                        {
                            DebugLog(L"SetUserArray: Credential exists, setting SID on it now");
                            m_credential->SetTargetUserSid(pszSid);
                        }

                        CoTaskMemFree(pszSid);
                    }
                    pUser->Release();
                }
            }
        }
    }

    return S_OK;
}

// Called when an unlock command is received from the service
void ScreenControlCredentialProvider::OnUnlockCommandReceived()
{
    m_unlockPending = true;

    // Notify Windows that credentials have changed
    if (m_providerEvents != nullptr)
    {
        m_providerEvents->CredentialsChanged(m_adviseContext);
    }
}

//-----------------------------------------------------------------------------
// Service Communication
//-----------------------------------------------------------------------------

bool ScreenControlCredentialProvider::ConnectToService()
{
    // Try to connect to the service via HTTP API
    // This is a simple check - actual communication happens in other methods
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0)
    {
        return false;
    }

    SOCKET sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (sock == INVALID_SOCKET)
    {
        WSACleanup();
        return false;
    }

    sockaddr_in serverAddr = {};
    serverAddr.sin_family = AF_INET;
    serverAddr.sin_port = htons(SERVICE_HTTP_PORT);
    inet_pton(AF_INET, SERVICE_HTTP_HOST, &serverAddr.sin_addr);

    // Set short timeout for connection attempt
    DWORD timeout = 1000;
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, (char*)&timeout, sizeof(timeout));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, (char*)&timeout, sizeof(timeout));

    bool connected = (connect(sock, (sockaddr*)&serverAddr, sizeof(serverAddr)) == 0);

    closesocket(sock);
    WSACleanup();

    return connected;
}

// Helper function to parse unlock_pending from JSON body (whitespace-tolerant)
static bool JsonUnlockPendingIsTrue(const std::string& body)
{
    // Find `"unlock_pending"`
    auto k = body.find("\"unlock_pending\"");
    if (k == std::string::npos) return false;

    // Find ':' after it
    k = body.find(':', k);
    if (k == std::string::npos) return false;
    k++;

    // Skip whitespace
    while (k < body.size() && (body[k] == ' ' || body[k] == '\t' || body[k] == '\r' || body[k] == '\n'))
        k++;

    // Match "true" (case-insensitive)
    if (k + 4 <= body.size())
    {
        char t0 = (char)tolower((unsigned char)body[k+0]);
        char t1 = (char)tolower((unsigned char)body[k+1]);
        char t2 = (char)tolower((unsigned char)body[k+2]);
        char t3 = (char)tolower((unsigned char)body[k+3]);
        return (t0=='t' && t1=='r' && t2=='u' && t3=='e');
    }
    return false;
}

bool ScreenControlCredentialProvider::CheckForUnlockCommand()
{
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0)
    {
        DebugLog(L"CheckForUnlockCommand: WSAStartup failed");
        return false;
    }

    SOCKET sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (sock == INVALID_SOCKET)
    {
        DebugLog(L"CheckForUnlockCommand: socket() failed, error=%d", WSAGetLastError());
        WSACleanup();
        return false;
    }

    sockaddr_in serverAddr = {};
    serverAddr.sin_family = AF_INET;
    serverAddr.sin_port = htons(SERVICE_HTTP_PORT);
    inet_pton(AF_INET, SERVICE_HTTP_HOST, &serverAddr.sin_addr);

    // Increase timeout to 5 seconds for read-until-close approach
    DWORD timeout = 5000;
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, (char*)&timeout, sizeof(timeout));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, (char*)&timeout, sizeof(timeout));

    bool unlockPending = false;

    if (connect(sock, (sockaddr*)&serverAddr, sizeof(serverAddr)) == 0)
    {
        // Send HTTP GET request to check for unlock command
        const char* request =
            "GET /credential-provider/unlock HTTP/1.1\r\n"
            "Host: 127.0.0.1\r\n"
            "Connection: close\r\n"
            "\r\n";

        int sent = send(sock, request, (int)strlen(request), 0);
        if (sent > 0)
        {
            // Read in a loop until server closes connection (since we sent Connection: close)
            std::string resp;
            resp.reserve(2048);

            char buf[2048];
            for (;;)
            {
                int n = recv(sock, buf, (int)sizeof(buf), 0);
                if (n > 0)
                {
                    resp.append(buf, buf + n);
                    continue;
                }
                if (n == 0) break; // Server closed connection - normal termination
                // n < 0: error or timeout
                int e = WSAGetLastError();
                if (e != WSAETIMEDOUT)
                {
                    DebugLog(L"CheckForUnlockCommand: recv error=%d", e);
                }
                break;
            }

            // Split headers/body at \r\n\r\n
            std::string body = resp;
            auto hdrEnd = resp.find("\r\n\r\n");
            if (hdrEnd != std::string::npos)
                body = resp.substr(hdrEnd + 4);

            // Debug: log what we actually got
            DebugLog(L"CheckForUnlockCommand: respBytes=%d bodyBytes=%d",
                     (int)resp.size(), (int)body.size());

            if (!body.empty())
            {
                // Log body preview (first 300 chars, sanitized)
                std::string preview = body.substr(0, 300);
                for (char& c : preview)
                    if ((unsigned char)c < 0x20 && c != '\r' && c != '\n' && c != '\t') c = '.';

                wchar_t logMsg[512];
                StringCchPrintfW(logMsg, ARRAYSIZE(logMsg), L"CheckForUnlockCommand: body=[%S]", preview.c_str());
                DebugLog(logMsg);
            }

            // Parse JSON with whitespace tolerance
            unlockPending = JsonUnlockPendingIsTrue(body);

            if (unlockPending)
            {
                DebugLog(L"CheckForUnlockCommand: UNLOCK PENDING DETECTED!");
            }
        }
        else
        {
            DebugLog(L"CheckForUnlockCommand: send failed, err=%d", WSAGetLastError());
        }
    }
    else
    {
        DebugLog(L"CheckForUnlockCommand: connect failed, err=%d", WSAGetLastError());
    }

    closesocket(sock);
    WSACleanup();

    return unlockPending;
}

bool ScreenControlCredentialProvider::FetchCredentialsFromService(
    std::wstring& username,
    std::wstring& password,
    std::wstring& domain)
{
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0)
    {
        return false;
    }

    SOCKET sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (sock == INVALID_SOCKET)
    {
        WSACleanup();
        return false;
    }

    sockaddr_in serverAddr = {};
    serverAddr.sin_family = AF_INET;
    serverAddr.sin_port = htons(SERVICE_HTTP_PORT);
    inet_pton(AF_INET, SERVICE_HTTP_HOST, &serverAddr.sin_addr);

    DWORD timeout = 5000;
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, (char*)&timeout, sizeof(timeout));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, (char*)&timeout, sizeof(timeout));

    bool success = false;

    if (connect(sock, (sockaddr*)&serverAddr, sizeof(serverAddr)) == 0)
    {
        // Send HTTP GET request to fetch credentials
        const char* request =
            "GET /credential-provider/credentials HTTP/1.1\r\n"
            "Host: 127.0.0.1\r\n"
            "Connection: close\r\n"
            "\r\n";

        if (send(sock, request, (int)strlen(request), 0) > 0)
        {
            char response[4096] = {};
            int totalReceived = 0;

            // Receive full response
            while (totalReceived < sizeof(response) - 1)
            {
                int received = recv(sock, response + totalReceived,
                    (int)(sizeof(response) - 1 - totalReceived), 0);
                if (received <= 0) break;
                totalReceived += received;
            }

            if (totalReceived > 0)
            {
                // Parse JSON response for credentials
                // Expected: {"username": "...", "password": "...", "domain": "..."}
                // Note: This is a simple parser - production code should use proper JSON library

                char* jsonStart = strstr(response, "\r\n\r\n");
                if (jsonStart != nullptr)
                {
                    jsonStart += 4; // Skip \r\n\r\n

                    // Extract username
                    char* usernameStart = strstr(jsonStart, "\"username\":\"");
                    if (usernameStart != nullptr)
                    {
                        usernameStart += 12;
                        char* usernameEnd = strchr(usernameStart, '"');
                        if (usernameEnd != nullptr)
                        {
                            std::string uname(usernameStart, usernameEnd - usernameStart);
                            username = std::wstring(uname.begin(), uname.end());
                        }
                    }

                    // Extract password
                    char* passwordStart = strstr(jsonStart, "\"password\":\"");
                    if (passwordStart != nullptr)
                    {
                        passwordStart += 12;
                        char* passwordEnd = strchr(passwordStart, '"');
                        if (passwordEnd != nullptr)
                        {
                            std::string pwd(passwordStart, passwordEnd - passwordStart);
                            password = std::wstring(pwd.begin(), pwd.end());
                        }
                    }

                    // Extract domain (optional)
                    char* domainStart = strstr(jsonStart, "\"domain\":\"");
                    if (domainStart != nullptr)
                    {
                        domainStart += 10;
                        char* domainEnd = strchr(domainStart, '"');
                        if (domainEnd != nullptr)
                        {
                            std::string dom(domainStart, domainEnd - domainStart);
                            domain = std::wstring(dom.begin(), dom.end());
                        }
                    }
                    else
                    {
                        // Default to local machine if no domain specified
                        wchar_t computerName[MAX_COMPUTERNAME_LENGTH + 1];
                        DWORD size = ARRAYSIZE(computerName);
                        if (GetComputerNameW(computerName, &size))
                        {
                            domain = computerName;
                        }
                        else
                        {
                            domain = L".";
                        }
                    }

                    success = !username.empty() && !password.empty();
                }
            }
        }
    }

    closesocket(sock);
    WSACleanup();

    return success;
}

void ScreenControlCredentialProvider::ReportUnlockResult(bool success, const std::wstring& errorMessage)
{
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0)
    {
        return;
    }

    SOCKET sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (sock == INVALID_SOCKET)
    {
        WSACleanup();
        return;
    }

    sockaddr_in serverAddr = {};
    serverAddr.sin_family = AF_INET;
    serverAddr.sin_port = htons(SERVICE_HTTP_PORT);
    inet_pton(AF_INET, SERVICE_HTTP_HOST, &serverAddr.sin_addr);

    if (connect(sock, (sockaddr*)&serverAddr, sizeof(serverAddr)) == 0)
    {
        // Build JSON body
        char body[512];
        if (success)
        {
            snprintf(body, sizeof(body), "{\"success\":true}");
        }
        else
        {
            // Convert error message to narrow string using WideCharToMultiByte
            char errorNarrow[256] = {};
            WideCharToMultiByte(CP_UTF8, 0, errorMessage.c_str(), -1, errorNarrow, sizeof(errorNarrow) - 1, nullptr, nullptr);
            snprintf(body, sizeof(body), "{\"success\":false,\"error\":\"%s\"}", errorNarrow);
        }

        // Build HTTP POST request
        char request[1024];
        snprintf(request, sizeof(request),
            "POST /credential-provider/result HTTP/1.1\r\n"
            "Host: 127.0.0.1\r\n"
            "Content-Type: application/json\r\n"
            "Content-Length: %zu\r\n"
            "Connection: close\r\n"
            "\r\n"
            "%s",
            strlen(body), body);

        send(sock, request, (int)strlen(request), 0);
    }

    closesocket(sock);
    WSACleanup();
}

//-----------------------------------------------------------------------------
// Background Polling Thread
//-----------------------------------------------------------------------------

DWORD WINAPI ScreenControlCredentialProvider::PollThreadProc(LPVOID lpParameter)
{
    DebugLog(L"PollThreadProc started");

    ScreenControlCredentialProvider* provider =
        static_cast<ScreenControlCredentialProvider*>(lpParameter);

    int pollCount = 0;
    while (WaitForSingleObject(provider->m_stopEvent, POLL_INTERVAL_MS) == WAIT_TIMEOUT)
    {
        pollCount++;
        if (pollCount % 10 == 0) // Log every 5 seconds
        {
            DebugLog(L"PollThreadProc: polling... (count=%d)", pollCount);
        }

        if (provider->CheckForUnlockCommand())
        {
            DebugLog(L"PollThreadProc: Unlock command detected!");
            provider->OnUnlockCommandReceived();
            break; // Stop polling once unlock is triggered
        }
    }

    DebugLog(L"PollThreadProc exiting");
    return 0;
}

void ScreenControlCredentialProvider::StartPolling()
{
    DebugLog(L"StartPolling called");

    if (m_pollThread != nullptr)
    {
        // Check if the thread is still alive
        DWORD exitCode = 0;
        if (GetExitCodeThread(m_pollThread, &exitCode) && exitCode != STILL_ACTIVE)
        {
            // Thread has exited, clean up
            DebugLog(L"StartPolling: Previous poll thread has exited (code=%lu), cleaning up", exitCode);
            CloseHandle(m_pollThread);
            m_pollThread = nullptr;
            if (m_stopEvent != nullptr)
            {
                CloseHandle(m_stopEvent);
                m_stopEvent = nullptr;
            }
        }
        else
        {
            DebugLog(L"StartPolling: Already polling");
            return; // Already polling
        }
    }

    m_stopEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (m_stopEvent == nullptr)
    {
        DebugLog(L"StartPolling: Failed to create stop event");
        return;
    }

    m_pollThread = CreateThread(nullptr, 0, PollThreadProc, this, 0, nullptr);
    if (m_pollThread != nullptr)
    {
        DebugLog(L"StartPolling: Poll thread created successfully");
    }
    else
    {
        DebugLog(L"StartPolling: Failed to create poll thread");
    }
}

void ScreenControlCredentialProvider::StopPolling()
{
    if (m_stopEvent != nullptr)
    {
        SetEvent(m_stopEvent);
    }

    if (m_pollThread != nullptr)
    {
        WaitForSingleObject(m_pollThread, 5000);
        CloseHandle(m_pollThread);
        m_pollThread = nullptr;
    }

    if (m_stopEvent != nullptr)
    {
        CloseHandle(m_stopEvent);
        m_stopEvent = nullptr;
    }
}

//-----------------------------------------------------------------------------
// ScreenControlCredentialProviderFactory Implementation
//-----------------------------------------------------------------------------

ScreenControlCredentialProviderFactory::ScreenControlCredentialProviderFactory()
    : m_refCount(1)
{
    DllAddRef();
}

ScreenControlCredentialProviderFactory::~ScreenControlCredentialProviderFactory()
{
    DllRelease();
}

HRESULT ScreenControlCredentialProviderFactory::QueryInterface(REFIID riid, void** ppv)
{
    if (ppv == nullptr)
    {
        return E_INVALIDARG;
    }

    *ppv = nullptr;

    if (riid == IID_IUnknown)
    {
        *ppv = static_cast<IUnknown*>(this);
    }
    else if (riid == IID_IClassFactory)
    {
        *ppv = static_cast<IClassFactory*>(this);
    }
    else
    {
        return E_NOINTERFACE;
    }

    AddRef();
    return S_OK;
}

ULONG ScreenControlCredentialProviderFactory::AddRef()
{
    return InterlockedIncrement(&m_refCount);
}

ULONG ScreenControlCredentialProviderFactory::Release()
{
    LONG count = InterlockedDecrement(&m_refCount);
    if (count == 0)
    {
        delete this;
    }
    return count;
}

HRESULT ScreenControlCredentialProviderFactory::CreateInstance(
    IUnknown* pUnkOuter,
    REFIID riid,
    void** ppv)
{
    if (ppv == nullptr)
    {
        return E_INVALIDARG;
    }

    *ppv = nullptr;

    // We don't support aggregation
    if (pUnkOuter != nullptr)
    {
        return CLASS_E_NOAGGREGATION;
    }

    ScreenControlCredentialProvider* provider =
        new (std::nothrow) ScreenControlCredentialProvider();

    if (provider == nullptr)
    {
        return E_OUTOFMEMORY;
    }

    HRESULT hr = provider->QueryInterface(riid, ppv);
    provider->Release();

    return hr;
}

HRESULT ScreenControlCredentialProviderFactory::LockServer(BOOL bLock)
{
    if (bLock)
    {
        DllAddRef();
    }
    else
    {
        DllRelease();
    }

    return S_OK;
}

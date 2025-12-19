// ScreenControl Credential Provider
// Copyright (c) 2024 ScreenControl. All rights reserved.

#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <windows.h>
#include <credentialprovider.h>
#include <string>

// Forward declaration
class ScreenControlCredential;

// ScreenControlCredentialProvider
// Main credential provider class that Windows instantiates on the lock screen
// Implements ICredentialProviderSetUserArray for Windows 8+ user enumeration support
class ScreenControlCredentialProvider : public ICredentialProvider,
                                        public ICredentialProviderSetUserArray
{
public:
    ScreenControlCredentialProvider();
    virtual ~ScreenControlCredentialProvider();

    // IUnknown
    IFACEMETHODIMP QueryInterface(__in REFIID riid, __deref_out void** ppv) override;
    IFACEMETHODIMP_(ULONG) AddRef() override;
    IFACEMETHODIMP_(ULONG) Release() override;

    // ICredentialProvider
    IFACEMETHODIMP SetUsageScenario(
        __in CREDENTIAL_PROVIDER_USAGE_SCENARIO cpus,
        __in DWORD dwFlags) override;

    IFACEMETHODIMP SetSerialization(
        __in const CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* pcpcs) override;

    IFACEMETHODIMP Advise(
        __in ICredentialProviderEvents* pcpe,
        __in UINT_PTR upAdviseContext) override;

    IFACEMETHODIMP UnAdvise() override;

    IFACEMETHODIMP GetFieldDescriptorCount(__out DWORD* pdwCount) override;

    IFACEMETHODIMP GetFieldDescriptorAt(
        __in DWORD dwIndex,
        __deref_out CREDENTIAL_PROVIDER_FIELD_DESCRIPTOR** ppcpfd) override;

    IFACEMETHODIMP GetCredentialCount(
        __out DWORD* pdwCount,
        __out DWORD* pdwDefault,
        __out BOOL* pbAutoLogonWithDefault) override;

    IFACEMETHODIMP GetCredentialAt(
        __in DWORD dwIndex,
        __deref_out ICredentialProviderCredential** ppcpc) override;

    // ICredentialProviderSetUserArray (required for Windows 8+)
    IFACEMETHODIMP SetUserArray(__in ICredentialProviderUserArray* users) override;

    // Internal methods
    void OnUnlockCommandReceived();
    bool IsUnlockPending() const { return m_unlockPending; }
    void ClearUnlockPending() { m_unlockPending = false; }

    // Service communication (public for ScreenControlCredential access)
    bool FetchCredentialsFromService(std::wstring& username, std::wstring& password, std::wstring& domain);
    void ReportUnlockResult(bool success, const std::wstring& errorMessage);

private:
    LONG m_refCount;
    CREDENTIAL_PROVIDER_USAGE_SCENARIO m_cpus;
    ScreenControlCredential* m_credential;
    ICredentialProviderEvents* m_providerEvents;
    UINT_PTR m_adviseContext;
    bool m_unlockPending;
    ICredentialProviderUserArray* m_userArray;  // User array from Windows
    std::wstring m_targetUserSid;               // Stored SID from user array (SetUserArray called before credential exists)

    // Service communication (private helpers)
    bool ConnectToService();
    bool CheckForUnlockCommand();

    // Background thread for polling
    HANDLE m_pollThread;
    HANDLE m_stopEvent;
    static DWORD WINAPI PollThreadProc(LPVOID lpParameter);
    void StartPolling();
    void StopPolling();
};

// Class factory for COM instantiation
class ScreenControlCredentialProviderFactory : public IClassFactory
{
public:
    ScreenControlCredentialProviderFactory();
    virtual ~ScreenControlCredentialProviderFactory();

    // IUnknown
    IFACEMETHODIMP QueryInterface(__in REFIID riid, __deref_out void** ppv) override;
    IFACEMETHODIMP_(ULONG) AddRef() override;
    IFACEMETHODIMP_(ULONG) Release() override;

    // IClassFactory
    IFACEMETHODIMP CreateInstance(
        __in IUnknown* pUnkOuter,
        __in REFIID riid,
        __deref_out void** ppv) override;

    IFACEMETHODIMP LockServer(__in BOOL bLock) override;

private:
    LONG m_refCount;
};

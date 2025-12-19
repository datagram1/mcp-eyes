// ScreenControl Credential
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
class ScreenControlCredentialProvider;

// Field IDs for the credential tile UI
enum SCREEN_CONTROL_FIELD_ID
{
    SFI_TILE_IMAGE = 0,      // Tile icon
    SFI_LABEL = 1,           // "ScreenControl Auto-Unlock"
    SFI_STATUS = 2,          // Status text (e.g., "Waiting for unlock...")
    SFI_SUBMIT_BUTTON = 3,   // Hidden submit button for auto-unlock
    SFI_NUM_FIELDS = 4       // Total field count
};

// ScreenControlCredential
// Represents a single credential tile on the Windows lock screen
// Implements ICredentialProviderCredential2 for Windows 10/11 compatibility
class ScreenControlCredential : public ICredentialProviderCredential2
{
public:
    ScreenControlCredential();
    virtual ~ScreenControlCredential();

    // Initialize with parent provider
    HRESULT Initialize(ScreenControlCredentialProvider* provider);

    // IUnknown
    IFACEMETHODIMP QueryInterface(__in REFIID riid, __deref_out void** ppv) override;
    IFACEMETHODIMP_(ULONG) AddRef() override;
    IFACEMETHODIMP_(ULONG) Release() override;

    // ICredentialProviderCredential
    IFACEMETHODIMP Advise(__in ICredentialProviderCredentialEvents* pcpce) override;
    IFACEMETHODIMP UnAdvise() override;

    IFACEMETHODIMP SetSelected(__out BOOL* pbAutoLogon) override;
    IFACEMETHODIMP SetDeselected() override;

    IFACEMETHODIMP GetFieldState(
        __in DWORD dwFieldID,
        __out CREDENTIAL_PROVIDER_FIELD_STATE* pcpfs,
        __out CREDENTIAL_PROVIDER_FIELD_INTERACTIVE_STATE* pcpfis) override;

    IFACEMETHODIMP GetStringValue(
        __in DWORD dwFieldID,
        __deref_out PWSTR* ppwsz) override;

    IFACEMETHODIMP GetBitmapValue(
        __in DWORD dwFieldID,
        __out HBITMAP* phbmp) override;

    IFACEMETHODIMP GetCheckboxValue(
        __in DWORD dwFieldID,
        __out BOOL* pbChecked,
        __deref_out PWSTR* ppwszLabel) override;

    IFACEMETHODIMP GetSubmitButtonValue(
        __in DWORD dwFieldID,
        __out DWORD* pdwAdjacentTo) override;

    IFACEMETHODIMP GetComboBoxValueCount(
        __in DWORD dwFieldID,
        __out DWORD* pcItems,
        __out DWORD* pdwSelectedItem) override;

    IFACEMETHODIMP GetComboBoxValueAt(
        __in DWORD dwFieldID,
        __in DWORD dwItem,
        __deref_out PWSTR* ppwszItem) override;

    IFACEMETHODIMP SetStringValue(
        __in DWORD dwFieldID,
        __in PCWSTR pwz) override;

    IFACEMETHODIMP SetCheckboxValue(
        __in DWORD dwFieldID,
        __in BOOL bChecked) override;

    IFACEMETHODIMP SetComboBoxSelectedValue(
        __in DWORD dwFieldID,
        __in DWORD dwSelectedItem) override;

    IFACEMETHODIMP CommandLinkClicked(__in DWORD dwFieldID) override;

    IFACEMETHODIMP GetSerialization(
        __out CREDENTIAL_PROVIDER_GET_SERIALIZATION_RESPONSE* pcpgsr,
        __out CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* pcpcs,
        __deref_out_opt PWSTR* ppwszOptionalStatusText,
        __out CREDENTIAL_PROVIDER_STATUS_ICON* pcpsiOptionalStatusIcon) override;

    IFACEMETHODIMP ReportResult(
        __in NTSTATUS ntsStatus,
        __in NTSTATUS ntsSubstatus,
        __deref_out_opt PWSTR* ppwszOptionalStatusText,
        __out CREDENTIAL_PROVIDER_STATUS_ICON* pcpsiOptionalStatusIcon) override;

    // ICredentialProviderCredential2
    // Returns the SID of the user this credential is for
    // This is REQUIRED for Windows 10/11 to show the credential tile
    IFACEMETHODIMP GetUserSid(__deref_out PWSTR* ppszSid) override;

    // Internal methods
    void SetStatusText(const std::wstring& status);
    void TriggerAutoLogon();
    bool IsAutoLogonReady() const { return m_autoLogonReady; }
    void SetTargetUserSid(const std::wstring& sid) { m_userSid = sid; }

private:
    LONG m_refCount;
    ScreenControlCredentialProvider* m_provider;
    ICredentialProviderCredentialEvents* m_credentialEvents;

    // Field values
    std::wstring m_statusText;
    HBITMAP m_tileIcon;
    bool m_autoLogonReady;

    // Credentials (fetched from service when needed)
    std::wstring m_username;
    std::wstring m_password;
    std::wstring m_domain;
    std::wstring m_userSid;  // SID of the user this credential is for

    // Helper methods
    HRESULT BuildCredentialSerialization(
        CREDENTIAL_PROVIDER_CREDENTIAL_SERIALIZATION* pcpcs,
        const std::wstring& domain,
        const std::wstring& username,
        const std::wstring& password);

    void SecureClearCredentials();
};

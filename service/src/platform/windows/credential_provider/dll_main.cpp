// ScreenControl Credential Provider - DLL Entry Point
// Copyright (c) 2024 ScreenControl. All rights reserved.

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <windows.h>

// Include initguid.h BEFORE guid.h to properly define GUIDs
#include <initguid.h>

#include <strsafe.h>
#include <new>
#include "guid.h"
#include "ScreenControlCredentialProvider.h"

// Global DLL instance handle
HINSTANCE g_hInstance = nullptr;

// DLL reference count for COM
static LONG g_dllRefCount = 0;

void DllAddRef()
{
    InterlockedIncrement(&g_dllRefCount);
}

void DllRelease()
{
    InterlockedDecrement(&g_dllRefCount);
}

// DLL Entry Point
BOOL WINAPI DllMain(
    HINSTANCE hInstance,
    DWORD dwReason,
    LPVOID lpReserved)
{
    UNREFERENCED_PARAMETER(lpReserved);

    switch (dwReason)
    {
    case DLL_PROCESS_ATTACH:
        g_hInstance = hInstance;
        DisableThreadLibraryCalls(hInstance);
        break;

    case DLL_PROCESS_DETACH:
        break;

    case DLL_THREAD_ATTACH:
    case DLL_THREAD_DETACH:
        break;
    }

    return TRUE;
}

// COM: Get class object
// Called by COM to get the class factory for our credential provider
STDAPI DllGetClassObject(
    __in REFCLSID rclsid,
    __in REFIID riid,
    __deref_out void** ppv)
{
    if (ppv == nullptr)
    {
        return E_INVALIDARG;
    }

    *ppv = nullptr;

    HRESULT hr = CLASS_E_CLASSNOTAVAILABLE;

    // Check if the requested CLSID is our credential provider
    if (IsEqualCLSID(rclsid, CLSID_ScreenControlCredentialProvider))
    {
        ScreenControlCredentialProviderFactory* factory =
            new (std::nothrow) ScreenControlCredentialProviderFactory();

        if (factory != nullptr)
        {
            hr = factory->QueryInterface(riid, ppv);
            factory->Release();
        }
        else
        {
            hr = E_OUTOFMEMORY;
        }
    }

    return hr;
}

// COM: Check if DLL can be unloaded
STDAPI DllCanUnloadNow()
{
    return (g_dllRefCount > 0) ? S_FALSE : S_OK;
}

// Helper to create registry key and set value
static HRESULT SetRegistryValue(
    HKEY hKeyRoot,
    PCWSTR pwszSubKey,
    PCWSTR pwszValueName,
    PCWSTR pwszValue)
{
    HKEY hKey;
    LONG result = RegCreateKeyExW(
        hKeyRoot,
        pwszSubKey,
        0,
        nullptr,
        REG_OPTION_NON_VOLATILE,
        KEY_WRITE,
        nullptr,
        &hKey,
        nullptr);

    if (result != ERROR_SUCCESS)
    {
        return HRESULT_FROM_WIN32(result);
    }

    if (pwszValue != nullptr)
    {
        result = RegSetValueExW(
            hKey,
            pwszValueName,
            0,
            REG_SZ,
            reinterpret_cast<const BYTE*>(pwszValue),
            static_cast<DWORD>((wcslen(pwszValue) + 1) * sizeof(WCHAR)));
    }

    RegCloseKey(hKey);

    return HRESULT_FROM_WIN32(result);
}

// Helper to delete registry key
static HRESULT DeleteRegistryKey(HKEY hKeyRoot, PCWSTR pwszSubKey)
{
    LONG result = RegDeleteKeyW(hKeyRoot, pwszSubKey);

    // Treat key not found as success for unregistration
    if (result == ERROR_FILE_NOT_FOUND)
    {
        return S_OK;
    }

    return HRESULT_FROM_WIN32(result);
}

// Self-registration: Register the credential provider
STDAPI DllRegisterServer()
{
    HRESULT hr = S_OK;
    WCHAR dllPath[MAX_PATH];

    // Get the path to this DLL
    if (GetModuleFileNameW(g_hInstance, dllPath, ARRAYSIZE(dllPath)) == 0)
    {
        return HRESULT_FROM_WIN32(GetLastError());
    }

    // Register CLSID in HKCR\CLSID
    WCHAR clsidKey[128];
    StringCchPrintfW(clsidKey, ARRAYSIZE(clsidKey),
        L"CLSID\\%s", CLSID_SCREENCONTROL_CP_STRING);

    hr = SetRegistryValue(HKEY_CLASSES_ROOT, clsidKey, nullptr, CREDENTIAL_PROVIDER_NAME);
    if (FAILED(hr)) return hr;

    // Register InprocServer32
    WCHAR inprocKey[256];
    StringCchPrintfW(inprocKey, ARRAYSIZE(inprocKey),
        L"CLSID\\%s\\InprocServer32", CLSID_SCREENCONTROL_CP_STRING);

    hr = SetRegistryValue(HKEY_CLASSES_ROOT, inprocKey, nullptr, dllPath);
    if (FAILED(hr)) return hr;

    hr = SetRegistryValue(HKEY_CLASSES_ROOT, inprocKey, L"ThreadingModel", L"Apartment");
    if (FAILED(hr)) return hr;

    // Register as a Credential Provider
    WCHAR cpKey[256];
    StringCchPrintfW(cpKey, ARRAYSIZE(cpKey),
        L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\Credential Providers\\%s",
        CLSID_SCREENCONTROL_CP_STRING);

    hr = SetRegistryValue(HKEY_LOCAL_MACHINE, cpKey, nullptr, CREDENTIAL_PROVIDER_NAME);
    if (FAILED(hr)) return hr;

    return S_OK;
}

// Self-registration: Unregister the credential provider
STDAPI DllUnregisterServer()
{
    HRESULT hr = S_OK;
    HRESULT hrTemp;

    // Unregister from Credential Providers
    WCHAR cpKey[256];
    StringCchPrintfW(cpKey, ARRAYSIZE(cpKey),
        L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\Credential Providers\\%s",
        CLSID_SCREENCONTROL_CP_STRING);

    hrTemp = DeleteRegistryKey(HKEY_LOCAL_MACHINE, cpKey);
    if (FAILED(hrTemp)) hr = hrTemp;

    // Unregister InprocServer32
    WCHAR inprocKey[256];
    StringCchPrintfW(inprocKey, ARRAYSIZE(inprocKey),
        L"CLSID\\%s\\InprocServer32", CLSID_SCREENCONTROL_CP_STRING);

    hrTemp = DeleteRegistryKey(HKEY_CLASSES_ROOT, inprocKey);
    if (FAILED(hrTemp)) hr = hrTemp;

    // Unregister CLSID
    WCHAR clsidKey[128];
    StringCchPrintfW(clsidKey, ARRAYSIZE(clsidKey),
        L"CLSID\\%s", CLSID_SCREENCONTROL_CP_STRING);

    hrTemp = DeleteRegistryKey(HKEY_CLASSES_ROOT, clsidKey);
    if (FAILED(hrTemp)) hr = hrTemp;

    return hr;
}

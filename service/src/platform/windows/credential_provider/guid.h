// ScreenControl Credential Provider - GUID Definitions
// Copyright (c) 2024 ScreenControl. All rights reserved.

#pragma once

#include <windows.h>
#include <guiddef.h>

// {A7B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D}
// CLSID for ScreenControl Credential Provider
DEFINE_GUID(CLSID_ScreenControlCredentialProvider,
    0xa7b2c3d4, 0xe5f6, 0x4a5b, 0x8c, 0x9d, 0x0e, 0x1f, 0x2a, 0x3b, 0x4c, 0x5d);

// String version for registry
#define CLSID_SCREENCONTROL_CP_STRING L"{A7B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D}"

// Credential Provider name
#define CREDENTIAL_PROVIDER_NAME L"ScreenControl Auto-Unlock"

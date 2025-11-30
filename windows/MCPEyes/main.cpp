#include "AppDelegate.h"
#include "resource.h"
#include <windows.h>
#include <commctrl.h>

#pragma comment(lib, "user32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "comctl32.lib")

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {
    // Initialize common controls
    INITCOMMONCONTROLSEX icex;
    icex.dwSize = sizeof(INITCOMMONCONTROLSEX);
    icex.dwICC = ICC_STANDARD_CLASSES | ICC_PROGRESS_CLASS;
    InitCommonControlsEx(&icex);

    // Create and run application
    AppDelegate app(hInstance);
    if (!app.initialize()) {
        return 1;
    }

    app.run();
    app.shutdown();

    return 0;
}


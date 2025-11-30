/**
 * macOS Platform Implementation
 * Uses Cocoa, CoreGraphics, Vision frameworks
 */

#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Vision/Vision.h>
#import <CoreGraphics/CoreGraphics.h>
#include "platform.h"
#include <sys/utsname.h>
#include <unistd.h>
#include <dlfcn.h>

namespace mcp_eyes {

class MacOSPlatform : public Platform {
public:
    MacOSPlatform() : focused_app_(std::nullopt) {}

    // ═══════════════════════════════════════════════════════════════════════
    // Platform Info
    // ═══════════════════════════════════════════════════════════════════════

    std::string os_name() const override {
        return "macos";
    }

    std::string os_version() const override {
        NSProcessInfo* info = [NSProcessInfo processInfo];
        NSOperatingSystemVersion version = [info operatingSystemVersion];
        return [[NSString stringWithFormat:@"%ld.%ld.%ld",
                 (long)version.majorVersion,
                 (long)version.minorVersion,
                 (long)version.patchVersion] UTF8String];
    }

    std::string arch() const override {
        struct utsname info;
        uname(&info);
        return std::string(info.machine);
    }

    std::string hostname() const override {
        char hostname[256];
        gethostname(hostname, sizeof(hostname));
        return std::string(hostname);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Permissions
    // ═══════════════════════════════════════════════════════════════════════

    Permissions check_permissions() const override {
        Permissions perms;

        // Accessibility
        perms.accessibility = AXIsProcessTrusted();

        // Screen Recording (macOS 10.15+)
        if (@available(macOS 10.15, *)) {
            perms.screen_recording = CGPreflightScreenCaptureAccess();
        } else {
            perms.screen_recording = true;
        }

        // Automation (we can't easily check this)
        perms.automation = true;

        return perms;
    }

    bool request_accessibility_permission() override {
        NSDictionary* options = @{(__bridge id)kAXTrustedCheckOptionPrompt: @YES};
        return AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
    }

    bool request_screen_recording_permission() override {
        if (@available(macOS 10.15, *)) {
            return CGRequestScreenCaptureAccess();
        }
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Application Management
    // ═══════════════════════════════════════════════════════════════════════

    std::vector<AppInfo> list_applications() const override {
        std::vector<AppInfo> apps;

        NSWorkspace* workspace = [NSWorkspace sharedWorkspace];
        NSArray<NSRunningApplication*>* runningApps = [workspace runningApplications];

        for (NSRunningApplication* app in runningApps) {
            if (app.activationPolicy != NSApplicationActivationPolicyRegular) {
                continue;  // Skip background apps
            }

            AppInfo info;
            info.name = app.localizedName ? [app.localizedName UTF8String] : "";
            info.bundle_id = app.bundleIdentifier ? [app.bundleIdentifier UTF8String] : "";
            info.pid = app.processIdentifier;
            info.bounds = {0, 0, 0, 0};
            info.windows.clear();

            // Get window bounds using Accessibility API
            AXUIElementRef appRef = AXUIElementCreateApplication(app.processIdentifier);
            if (appRef) {
                CFArrayRef windows = nullptr;
                AXUIElementCopyAttributeValue(appRef, kAXWindowsAttribute, (CFTypeRef*)&windows);

                if (windows && CFArrayGetCount(windows) > 0) {
                    CFIndex windowCount = CFArrayGetCount(windows);
                    for (CFIndex i = 0; i < windowCount; ++i) {
                        AXUIElementRef window = (AXUIElementRef)CFArrayGetValueAtIndex(windows, i);
                        if (!window) continue;

                        WindowInfo windowInfo;
                        windowInfo.title = "";
                        windowInfo.bounds = {0, 0, 0, 0};
                        windowInfo.is_main = false;
                        windowInfo.is_minimized = false;

                        // Title
                        CFStringRef titleValue = nullptr;
                        if (AXUIElementCopyAttributeValue(window, kAXTitleAttribute, (CFTypeRef*)&titleValue) == kAXErrorSuccess && titleValue) {
                            NSString* titleStr = (__bridge NSString*)titleValue;
                            windowInfo.title = titleStr ? [titleStr UTF8String] : "";
                            CFRelease(titleValue);
                        }

                        // Position & size
                        AXValueRef posValue = nullptr;
                        AXValueRef sizeValue = nullptr;
                        CGPoint pos = {0, 0};
                        CGSize size = {0, 0};

                        if (AXUIElementCopyAttributeValue(window, kAXPositionAttribute, (CFTypeRef*)&posValue) == kAXErrorSuccess && posValue) {
                            AXValueGetValue(posValue, (AXValueType)kAXValueCGPointType, &pos);
                            CFRelease(posValue);
                        }

                        if (AXUIElementCopyAttributeValue(window, kAXSizeAttribute, (CFTypeRef*)&sizeValue) == kAXErrorSuccess && sizeValue) {
                            AXValueGetValue(sizeValue, (AXValueType)kAXValueCGSizeType, &size);
                            CFRelease(sizeValue);
                        }

                        windowInfo.bounds.x = (int)pos.x;
                        windowInfo.bounds.y = (int)pos.y;
                        windowInfo.bounds.width = (int)size.width;
                        windowInfo.bounds.height = (int)size.height;

                        // Main/minimized flags
                        CFTypeRef mainValue = nullptr;
                        if (AXUIElementCopyAttributeValue(window, kAXMainAttribute, (CFTypeRef*)&mainValue) == kAXErrorSuccess && mainValue) {
                            windowInfo.is_main = CFBooleanGetValue((CFBooleanRef)mainValue);
                            CFRelease(mainValue);
                        }

                        CFTypeRef minimizedValue = nullptr;
                        if (AXUIElementCopyAttributeValue(window, kAXMinimizedAttribute, (CFTypeRef*)&minimizedValue) == kAXErrorSuccess && minimizedValue) {
                            windowInfo.is_minimized = CFBooleanGetValue((CFBooleanRef)minimizedValue);
                            CFRelease(minimizedValue);
                        }

                        info.windows.push_back(windowInfo);

                        if (i == 0 || (info.bounds.width == 0 && info.bounds.height == 0)) {
                            info.bounds = windowInfo.bounds;
                        }
                    }
                    CFRelease(windows);
                }
                CFRelease(appRef);
            }

            apps.push_back(info);
        }

        return apps;
    }

    bool focus_application(const std::string& identifier) override {
        NSWorkspace* workspace = [NSWorkspace sharedWorkspace];
        NSArray<NSRunningApplication*>* runningApps = [workspace runningApplications];

        NSString* target = [NSString stringWithUTF8String:identifier.c_str()];

        for (NSRunningApplication* app in runningApps) {
            if ([app.bundleIdentifier isEqualToString:target] ||
                [app.localizedName isEqualToString:target]) {

                if (@available(macOS 14.0, *)) {
                    [app activateWithOptions:0];
                } else {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
                    [app activateWithOptions:NSApplicationActivateIgnoringOtherApps];
#pragma clang diagnostic pop
                }

                // Update focused app
                focused_app_ = AppInfo{
                    .name = app.localizedName ? [app.localizedName UTF8String] : "",
                    .bundle_id = app.bundleIdentifier ? [app.bundleIdentifier UTF8String] : "",
                    .pid = app.processIdentifier,
                    .bounds = {0, 0, 0, 0}
                };

                // Get bounds
                auto apps = list_applications();
                for (const auto& a : apps) {
                    if (a.pid == app.processIdentifier) {
                        focused_app_->bounds = a.bounds;
                        break;
                    }
                }

                return true;
            }
        }

        return false;
    }

    AppInfo* get_focused_app() override {
        if (focused_app_.has_value()) {
            return &focused_app_.value();
        }
        return nullptr;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Screen Capture
    // ═══════════════════════════════════════════════════════════════════════

    Screenshot take_screenshot(const AppInfo* app, int padding) override {
        Screenshot result;

        CGRect captureRect;
        if (app && app->bounds.width > 0) {
            captureRect = CGRectMake(
                app->bounds.x - padding,
                app->bounds.y - padding,
                app->bounds.width + padding * 2,
                app->bounds.height + padding * 2
            );
        } else {
            // Full screen
            captureRect = CGRectInfinite;
        }

        // Dynamic loading of CGWindowListCreateImage since it's unavailable in macOS 15 SDK
        // This allows us to use it at runtime on older macOS versions
        typedef CGImageRef (*CGWindowListCreateImageFn)(CGRect, CGWindowListOption, CGWindowID, CGWindowImageOption);
        static CGWindowListCreateImageFn createImageFn = nullptr;
        static bool fnLoaded = false;

        if (!fnLoaded) {
            void* handle = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", RTLD_LAZY);
            if (handle) {
                createImageFn = (CGWindowListCreateImageFn)dlsym(handle, "CGWindowListCreateImage");
            }
            fnLoaded = true;
        }

        CGImageRef image = nullptr;
        if (createImageFn) {
            image = createImageFn(
                captureRect,
                kCGWindowListOptionOnScreenOnly,
                kCGNullWindowID,
                kCGWindowImageDefault
            );
        }

        if (!image) {
            return result;
        }

        result.width = (int)CGImageGetWidth(image);
        result.height = (int)CGImageGetHeight(image);

        // Convert to PNG
        NSBitmapImageRep* bitmap = [[NSBitmapImageRep alloc] initWithCGImage:image];
        NSData* pngData = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];

        result.png_data.resize([pngData length]);
        memcpy(result.png_data.data(), [pngData bytes], [pngData length]);

        CGImageRelease(image);

        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Input Simulation
    // ═══════════════════════════════════════════════════════════════════════

    bool click(int x, int y, bool right_button) override {
        CGPoint point = CGPointMake(x, y);

        CGEventType downType = right_button ? kCGEventRightMouseDown : kCGEventLeftMouseDown;
        CGEventType upType = right_button ? kCGEventRightMouseUp : kCGEventLeftMouseUp;
        CGMouseButton button = right_button ? kCGMouseButtonRight : kCGMouseButtonLeft;

        CGEventRef mouseDown = CGEventCreateMouseEvent(nullptr, downType, point, button);
        CGEventRef mouseUp = CGEventCreateMouseEvent(nullptr, upType, point, button);

        CGEventPost(kCGHIDEventTap, mouseDown);
        usleep(50000);  // 50ms delay
        CGEventPost(kCGHIDEventTap, mouseUp);

        CFRelease(mouseDown);
        CFRelease(mouseUp);

        return true;
    }

    bool move_mouse(int x, int y) override {
        CGPoint point = CGPointMake(x, y);
        CGEventRef move = CGEventCreateMouseEvent(nullptr, kCGEventMouseMoved, point, kCGMouseButtonLeft);
        CGEventPost(kCGHIDEventTap, move);
        CFRelease(move);
        return true;
    }

    bool type_text(const std::string& text) override {
        NSString* nsText = [NSString stringWithUTF8String:text.c_str()];

        for (NSUInteger i = 0; i < [nsText length]; i++) {
            unichar character = [nsText characterAtIndex:i];

            CGEventRef keyDown = CGEventCreateKeyboardEvent(nullptr, 0, true);
            CGEventRef keyUp = CGEventCreateKeyboardEvent(nullptr, 0, false);

            CGEventKeyboardSetUnicodeString(keyDown, 1, &character);
            CGEventKeyboardSetUnicodeString(keyUp, 1, &character);

            CGEventPost(kCGHIDEventTap, keyDown);
            CGEventPost(kCGHIDEventTap, keyUp);

            CFRelease(keyDown);
            CFRelease(keyUp);

            usleep(10000);  // Small delay between characters
        }

        return true;
    }

    bool press_key(const std::string& key) override {
        CGKeyCode keyCode = 0;

        // Map key names to keycodes
        if (key == "Enter" || key == "Return") keyCode = 36;
        else if (key == "Tab") keyCode = 48;
        else if (key == "Escape") keyCode = 53;
        else if (key == "Backspace" || key == "Delete") keyCode = 51;
        else if (key == "ArrowUp" || key == "Up") keyCode = 126;
        else if (key == "ArrowDown" || key == "Down") keyCode = 125;
        else if (key == "ArrowLeft" || key == "Left") keyCode = 123;
        else if (key == "ArrowRight" || key == "Right") keyCode = 124;
        else if (key == "Space") keyCode = 49;
        else if (key == "Command" || key == "Cmd") keyCode = 55;
        else if (key == "Shift") keyCode = 56;
        else if (key == "Option" || key == "Alt") keyCode = 58;
        else if (key == "Control" || key == "Ctrl") keyCode = 59;
        else return false;

        CGEventRef keyDown = CGEventCreateKeyboardEvent(nullptr, keyCode, true);
        CGEventRef keyUp = CGEventCreateKeyboardEvent(nullptr, keyCode, false);

        CGEventPost(kCGHIDEventTap, keyDown);
        usleep(50000);
        CGEventPost(kCGHIDEventTap, keyUp);

        CFRelease(keyDown);
        CFRelease(keyUp);

        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Accessibility / UI Elements
    // ═══════════════════════════════════════════════════════════════════════

    std::vector<UIElement> get_clickable_elements(const std::string& app_name, bool clickableOnly) override {
        std::vector<UIElement> elements;

        // Find the app
        NSWorkspace* workspace = [NSWorkspace sharedWorkspace];
        NSArray<NSRunningApplication*>* runningApps = [workspace runningApplications];

        pid_t targetPid = 0;
        for (NSRunningApplication* app in runningApps) {
            if (app.localizedName && [[app localizedName] UTF8String] == app_name) {
                targetPid = app.processIdentifier;
                break;
            }
        }

        if (targetPid == 0) return elements;

        AXUIElementRef appRef = AXUIElementCreateApplication(targetPid);
        if (!appRef) return elements;

        // Get focused window
        AXUIElementRef focusedWindow = nullptr;
        AXUIElementCopyAttributeValue(appRef, kAXFocusedWindowAttribute, (CFTypeRef*)&focusedWindow);

        const AppInfo* boundsInfo = nullptr;
        if (focused_app_.has_value() && focused_app_->name == app_name) {
            boundsInfo = &focused_app_.value();
        }

        if (focusedWindow) {
            collect_elements(focusedWindow, elements, 0, clickableOnly, boundsInfo);
            CFRelease(focusedWindow);
        }

        CFRelease(appRef);
        return elements;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OCR using Vision framework
    // ═══════════════════════════════════════════════════════════════════════

    std::vector<OCRResult> perform_ocr(const Screenshot& screenshot) override {
        std::vector<OCRResult> results;

        if (screenshot.png_data.empty()) return results;

        @autoreleasepool {
            NSData* imageData = [NSData dataWithBytes:screenshot.png_data.data()
                                               length:screenshot.png_data.size()];
            NSImage* nsImage = [[NSImage alloc] initWithData:imageData];
            if (!nsImage) return results;

            CGImageRef cgImage = [nsImage CGImageForProposedRect:nil context:nil hints:nil];
            if (!cgImage) return results;

            // Create Vision request
            VNRecognizeTextRequest* request = [[VNRecognizeTextRequest alloc] initWithCompletionHandler:nil];
            request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
            request.usesLanguageCorrection = YES;

            // Perform request
            VNImageRequestHandler* handler = [[VNImageRequestHandler alloc]
                                               initWithCGImage:cgImage
                                               options:@{}];

            NSError* error = nil;
            [handler performRequests:@[request] error:&error];

            if (error) {
                NSLog(@"OCR Error: %@", error);
                return results;
            }

            // Process results
            for (VNRecognizedTextObservation* observation in request.results) {
                VNRecognizedText* topCandidate = [[observation topCandidates:1] firstObject];
                if (!topCandidate) continue;

                OCRResult result;
                result.text = [topCandidate.string UTF8String];
                result.confidence = observation.confidence;

                // Convert bounding box (normalized 0-1, origin bottom-left)
                CGRect bbox = observation.boundingBox;
                result.bounds.x = (int)(bbox.origin.x * screenshot.width);
                result.bounds.y = (int)((1.0 - bbox.origin.y - bbox.size.height) * screenshot.height);
                result.bounds.width = (int)(bbox.size.width * screenshot.width);
                result.bounds.height = (int)(bbox.size.height * screenshot.height);

                results.push_back(result);
            }
        }

        return results;
    }

private:
    std::optional<AppInfo> focused_app_;

    void collect_elements(AXUIElementRef element,
                          std::vector<UIElement>& elements,
                          int depth,
                          bool clickableOnly,
                          const AppInfo* appInfo) {
        if (depth > 10) return;  // Prevent deep recursion

        CFStringRef role = nullptr;
        AXUIElementCopyAttributeValue(element, kAXRoleAttribute, (CFTypeRef*)&role);

        if (role) {
            NSString* roleStr = (__bridge NSString*)role;

            // Determine role classification
            bool is_clickable = [roleStr isEqualToString:NSAccessibilityButtonRole] ||
                               [roleStr isEqualToString:NSAccessibilityLinkRole] ||
                               [roleStr isEqualToString:NSAccessibilityTextFieldRole] ||
                               [roleStr isEqualToString:NSAccessibilityCheckBoxRole] ||
                               [roleStr isEqualToString:NSAccessibilityRadioButtonRole] ||
                               [roleStr isEqualToString:NSAccessibilityMenuItemRole] ||
                               [roleStr isEqualToString:NSAccessibilityImageRole];

            bool is_interesting_non_clickable =
                [roleStr isEqualToString:NSAccessibilityStaticTextRole] ||
                [roleStr isEqualToString:NSAccessibilityTextRole] ||
                [roleStr isEqualToString:NSAccessibilityGroupRole] ||
                [roleStr isEqualToString:NSAccessibilityRowRole] ||
                [roleStr isEqualToString:NSAccessibilityCellRole] ||
                [roleStr isEqualToString:NSAccessibilityOutlineRole] ||
                [roleStr isEqualToString:NSAccessibilityCollectionItemRole] ||
                [roleStr isEqualToString:NSAccessibilityTableRole] ||
                [roleStr isEqualToString:NSAccessibilityListRole] ||
                [roleStr isEqualToString:NSAccessibilityToolbarRole];

            bool includeElement = is_clickable || (!clickableOnly && is_interesting_non_clickable);

            if (includeElement) {
                UIElement el;
                el.role = [roleStr UTF8String];
                el.is_clickable = is_clickable;
                el.is_enabled = true;

                // Get title/value/description
                CFStringRef attrString = nullptr;
                if (AXUIElementCopyAttributeValue(element, kAXTitleAttribute, (CFTypeRef*)&attrString) == kAXErrorSuccess && attrString) {
                    el.text = [(__bridge NSString*)attrString UTF8String];
                    CFRelease(attrString);
                }
                if (el.text.empty()) {
                    if (AXUIElementCopyAttributeValue(element, kAXValueAttribute, (CFTypeRef*)&attrString) == kAXErrorSuccess && attrString) {
                        el.text = [(__bridge NSString*)attrString UTF8String];
                        CFRelease(attrString);
                    }
                }
                if (el.text.empty()) {
                    if (AXUIElementCopyAttributeValue(element, kAXDescriptionAttribute, (CFTypeRef*)&attrString) == kAXErrorSuccess && attrString) {
                        el.text = [(__bridge NSString*)attrString UTF8String];
                        CFRelease(attrString);
                    }
                }

                // Get position and size
                AXValueRef posValue = nullptr, sizeValue = nullptr;
                CGPoint pos = {0, 0};
                CGSize size = {0, 0};

                if (AXUIElementCopyAttributeValue(element, kAXPositionAttribute, (CFTypeRef*)&posValue) == kAXErrorSuccess && posValue) {
                    AXValueGetValue(posValue, (AXValueType)kAXValueCGPointType, &pos);
                    CFRelease(posValue);
                }
                if (AXUIElementCopyAttributeValue(element, kAXSizeAttribute, (CFTypeRef*)&sizeValue) == kAXErrorSuccess && sizeValue) {
                    AXValueGetValue(sizeValue, (AXValueType)kAXValueCGSizeType, &size);
                    CFRelease(sizeValue);
                }

                el.bounds.x = (int)pos.x;
                el.bounds.y = (int)pos.y;
                el.bounds.width = (int)size.width;
                el.bounds.height = (int)size.height;

                // Check enabled
                CFBooleanRef enabled = nullptr;
                if (AXUIElementCopyAttributeValue(element, kAXEnabledAttribute, (CFTypeRef*)&enabled) == kAXErrorSuccess && enabled) {
                    el.is_enabled = CFBooleanGetValue(enabled);
                    CFRelease(enabled);
                }

                // Map role to type
                if ([roleStr isEqualToString:NSAccessibilityButtonRole]) el.type = "button";
                else if ([roleStr isEqualToString:NSAccessibilityLinkRole]) el.type = "link";
                else if ([roleStr isEqualToString:NSAccessibilityTextFieldRole]) el.type = "input";
                else if ([roleStr isEqualToString:NSAccessibilityCheckBoxRole]) el.type = "checkbox";
                else if ([roleStr isEqualToString:NSAccessibilityRadioButtonRole]) el.type = "radio";
                else if ([roleStr isEqualToString:NSAccessibilityStaticTextRole] ||
                         [roleStr isEqualToString:NSAccessibilityTextRole]) el.type = "text";
                else if ([roleStr isEqualToString:NSAccessibilityGroupRole]) el.type = "group";
                else if ([roleStr isEqualToString:NSAccessibilityRowRole]) el.type = "row";
                else if ([roleStr isEqualToString:NSAccessibilityCellRole]) el.type = "cell";
                else if ([roleStr isEqualToString:NSAccessibilityImageRole]) el.type = "image";
                else el.type = "unknown";

                if (appInfo && appInfo->bounds.width > 0 && appInfo->bounds.height > 0) {
                    el.normalized_position.x =
                        (float)(el.bounds.x - appInfo->bounds.x) / (float)appInfo->bounds.width;
                    el.normalized_position.y =
                        (float)(el.bounds.y - appInfo->bounds.y) / (float)appInfo->bounds.height;
                } else {
                    el.normalized_position.x = -1.0f;
                    el.normalized_position.y = -1.0f;
                }

                elements.push_back(el);
            }

            CFRelease(role);
        }

        // Recurse into children
        CFArrayRef children = nullptr;
        if (AXUIElementCopyAttributeValue(element, kAXChildrenAttribute, (CFTypeRef*)&children) == kAXErrorSuccess && children) {
            CFIndex count = CFArrayGetCount(children);
            for (CFIndex i = 0; i < count && i < 100; i++) {
                AXUIElementRef child = (AXUIElementRef)CFArrayGetValueAtIndex(children, i);
                collect_elements(child, elements, depth + 1, clickableOnly, appInfo);
            }
            CFRelease(children);
        }
    }
};

// Factory
std::unique_ptr<Platform> Platform::create() {
    return std::make_unique<MacOSPlatform>();
}

} // namespace mcp_eyes

import SwiftUI

@main
struct MouseCalibrationApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .frame(minWidth: 800, minHeight: 600)
        }
        .windowStyle(.hiddenTitleBar)
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    var globalMouseMonitor: Any?
    var localMouseMonitor: Any?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Make window full screen after launch
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            if let window = NSApplication.shared.windows.first {
                window.toggleFullScreen(nil)
            }
        }

        // Add global event monitor to capture synthetic clicks
        setupGlobalEventMonitors()
    }

    func setupGlobalEventMonitors() {
        // Global monitor captures events outside our app (including synthetic events)
        globalMouseMonitor = NSEvent.addGlobalMonitorForEvents(
            matching: [.leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp,
                      .otherMouseDown, .otherMouseUp, .scrollWheel]
        ) { [weak self] event in
            self?.handleGlobalMouseEvent(event)
        }

        // Local monitor captures events in our app
        localMouseMonitor = NSEvent.addLocalMonitorForEvents(
            matching: [.leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp,
                      .otherMouseDown, .otherMouseUp, .scrollWheel]
        ) { [weak self] event in
            self?.handleGlobalMouseEvent(event)
            return event
        }

        print("Global and local event monitors installed")

        // Also set up CGEventTap to capture synthetic events at system level
        setupCGEventTap()
    }

    var eventTap: CFMachPort?
    var runLoopSource: CFRunLoopSource?

    func setupCGEventTap() {
        // Event mask for mouse events
        let eventMask = (1 << CGEventType.leftMouseDown.rawValue) |
                       (1 << CGEventType.leftMouseUp.rawValue) |
                       (1 << CGEventType.rightMouseDown.rawValue) |
                       (1 << CGEventType.rightMouseUp.rawValue) |
                       (1 << CGEventType.otherMouseDown.rawValue) |
                       (1 << CGEventType.otherMouseUp.rawValue) |
                       (1 << CGEventType.scrollWheel.rawValue)

        // Create event tap callback
        let callback: CGEventTapCallBack = { (proxy, type, event, refcon) -> Unmanaged<CGEvent>? in
            guard let refcon = refcon else { return Unmanaged.passRetained(event) }

            let delegate = Unmanaged<AppDelegate>.fromOpaque(refcon).takeUnretainedValue()
            delegate.handleCGEvent(type: type, event: event)

            return Unmanaged.passRetained(event)
        }

        // Create the event tap
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: CGEventMask(eventMask),
            callback: callback,
            userInfo: Unmanaged.passUnretained(self).toOpaque()
        ) else {
            print("ERROR: Failed to create CGEventTap - need Accessibility permissions!")
            return
        }

        eventTap = tap

        // Create a run loop source and add to current run loop
        runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)

        // Enable the event tap
        CGEvent.tapEnable(tap: tap, enable: true)

        print("CGEventTap installed successfully!")
    }

    func handleCGEvent(type: CGEventType, event: CGEvent) {
        let location = event.location
        let mainScreen = NSScreen.main ?? NSScreen.screens[0]
        let screenHeight = mainScreen.frame.height

        let buttonName: String
        let buttonNum: Int
        let isDown: Bool

        switch type {
        case .leftMouseDown:
            buttonNum = 0; buttonName = "LEFT"; isDown = true
        case .leftMouseUp:
            buttonNum = 0; buttonName = "LEFT"; isDown = false
        case .rightMouseDown:
            buttonNum = 1; buttonName = "RIGHT"; isDown = true
        case .rightMouseUp:
            buttonNum = 1; buttonName = "RIGHT"; isDown = false
        case .otherMouseDown:
            buttonNum = 2; buttonName = "MIDDLE"; isDown = true
        case .otherMouseUp:
            buttonNum = 2; buttonName = "MIDDLE"; isDown = false
        case .scrollWheel:
            let deltaY = event.getDoubleValueField(.scrollWheelEventDeltaAxis1)
            let deltaX = event.getDoubleValueField(.scrollWheelEventDeltaAxis2)
            let scrollEvent = GlobalMouseEvent(
                eventType: "SCROLL_TAP",
                screenX: location.x,
                screenY: screenHeight - location.y,  // Convert to bottom-left origin
                topLeftY: location.y,
                button: -1,
                clickCount: 0,
                scrollDeltaX: deltaX,
                scrollDeltaY: deltaY
            )
            GlobalEventLogger.shared.log(scrollEvent)
            return
        default:
            return
        }

        let eventType = "\(buttonName)_\(isDown ? "DOWN" : "UP")_TAP"

        let mouseEvent = GlobalMouseEvent(
            eventType: eventType,
            screenX: location.x,
            screenY: screenHeight - location.y,  // Convert to bottom-left origin
            topLeftY: location.y,
            button: buttonNum,
            clickCount: 1,
            scrollDeltaX: 0,
            scrollDeltaY: 0
        )
        GlobalEventLogger.shared.log(mouseEvent)
    }

    func handleGlobalMouseEvent(_ event: NSEvent) {
        let screenPoint = NSEvent.mouseLocation
        let mainScreen = NSScreen.main ?? NSScreen.screens[0]
        let screenHeight = mainScreen.frame.height

        // Convert to top-left origin coordinates for consistency
        let topLeftY = screenHeight - screenPoint.y

        let buttonName: String
        let buttonNum: Int
        let isDown: Bool

        switch event.type {
        case .leftMouseDown:
            buttonNum = 0
            buttonName = event.clickCount > 1 ? "DOUBLE_LEFT" : "LEFT"
            isDown = true
        case .leftMouseUp:
            buttonNum = 0
            buttonName = event.clickCount > 1 ? "DOUBLE_LEFT" : "LEFT"
            isDown = false
        case .rightMouseDown:
            buttonNum = 1
            buttonName = "RIGHT"
            isDown = true
        case .rightMouseUp:
            buttonNum = 1
            buttonName = "RIGHT"
            isDown = false
        case .otherMouseDown:
            buttonNum = Int(event.buttonNumber)
            buttonName = "MIDDLE"
            isDown = true
        case .otherMouseUp:
            buttonNum = Int(event.buttonNumber)
            buttonName = "MIDDLE"
            isDown = false
        case .scrollWheel:
            // Log scroll event
            let scrollEvent = GlobalMouseEvent(
                eventType: "SCROLL",
                screenX: screenPoint.x,
                screenY: screenPoint.y,
                topLeftY: topLeftY,
                button: -1,
                clickCount: 0,
                scrollDeltaX: event.scrollingDeltaX,
                scrollDeltaY: event.scrollingDeltaY
            )
            GlobalEventLogger.shared.log(scrollEvent)
            return
        default:
            return
        }

        let eventType = "\(buttonName)_\(isDown ? "DOWN" : "UP")"

        let mouseEvent = GlobalMouseEvent(
            eventType: eventType,
            screenX: screenPoint.x,
            screenY: screenPoint.y,
            topLeftY: topLeftY,
            button: buttonNum,
            clickCount: event.clickCount,
            scrollDeltaX: 0,
            scrollDeltaY: 0
        )
        GlobalEventLogger.shared.log(mouseEvent)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let monitor = globalMouseMonitor {
            NSEvent.removeMonitor(monitor)
        }
        if let monitor = localMouseMonitor {
            NSEvent.removeMonitor(monitor)
        }
    }
}

// Global event structure for synthetic event capture
struct GlobalMouseEvent: Codable {
    let id: UUID
    let timestamp: Date
    let eventType: String
    let screenX: CGFloat
    let screenY: CGFloat
    let topLeftY: CGFloat  // Y coordinate with origin at top-left
    let button: Int
    let clickCount: Int
    let scrollDeltaX: CGFloat
    let scrollDeltaY: CGFloat

    init(eventType: String, screenX: CGFloat, screenY: CGFloat, topLeftY: CGFloat,
         button: Int, clickCount: Int, scrollDeltaX: CGFloat, scrollDeltaY: CGFloat) {
        self.id = UUID()
        self.timestamp = Date()
        self.eventType = eventType
        self.screenX = screenX
        self.screenY = screenY
        self.topLeftY = topLeftY
        self.button = button
        self.clickCount = clickCount
        self.scrollDeltaX = scrollDeltaX
        self.scrollDeltaY = scrollDeltaY
    }
}

// Global event logger singleton
class GlobalEventLogger {
    static let shared = GlobalEventLogger()

    private let logFileURL: URL
    private let jsonEncoder = JSONEncoder()

    init() {
        let logDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        logFileURL = logDir.appendingPathComponent("mouse_calibration_log.jsonl")
        jsonEncoder.dateEncodingStrategy = .iso8601

        // Clear log file on start
        try? "".write(to: logFileURL, atomically: true, encoding: .utf8)
        print("Global event logging to: \(logFileURL.path)")
    }

    func log(_ event: GlobalMouseEvent) {
        // Print to console for real-time monitoring
        print("[GLOBAL \(event.eventType)] Screen:(\(Int(event.screenX)),\(Int(event.screenY))) TopLeft-Y:\(Int(event.topLeftY))")

        // Write to file
        if let jsonData = try? jsonEncoder.encode(event),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            let line = jsonString + "\n"
            if let data = line.data(using: .utf8) {
                if let fileHandle = try? FileHandle(forWritingTo: logFileURL) {
                    fileHandle.seekToEndOfFile()
                    fileHandle.write(data)
                    fileHandle.closeFile()
                } else {
                    try? data.write(to: logFileURL, options: .atomic)
                }
            }
        }
    }
}

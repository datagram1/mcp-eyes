import SwiftUI
import AppKit

// MARK: - Data Models

struct MouseEvent: Identifiable, Codable {
    let id: UUID
    let timestamp: Date
    let eventType: String
    let screenX: CGFloat
    let screenY: CGFloat
    let windowX: CGFloat
    let windowY: CGFloat
    let button: Int
    let clickCount: Int
    let scrollDeltaX: CGFloat
    let scrollDeltaY: CGFloat
    let targetX: CGFloat?
    let targetY: CGFloat?
    let deviationX: CGFloat?
    let deviationY: CGFloat?
    let deviationDistance: CGFloat?

    init(eventType: String, screenX: CGFloat, screenY: CGFloat, windowX: CGFloat, windowY: CGFloat,
         button: Int = 0, clickCount: Int = 0, scrollDeltaX: CGFloat = 0, scrollDeltaY: CGFloat = 0,
         targetX: CGFloat? = nil, targetY: CGFloat? = nil) {
        self.id = UUID()
        self.timestamp = Date()
        self.eventType = eventType
        self.screenX = screenX
        self.screenY = screenY
        self.windowX = windowX
        self.windowY = windowY
        self.button = button
        self.clickCount = clickCount
        self.scrollDeltaX = scrollDeltaX
        self.scrollDeltaY = scrollDeltaY
        self.targetX = targetX
        self.targetY = targetY

        if let tx = targetX, let ty = targetY {
            self.deviationX = windowX - tx
            self.deviationY = windowY - ty
            self.deviationDistance = sqrt(pow(windowX - tx, 2) + pow(windowY - ty, 2))
        } else {
            self.deviationX = nil
            self.deviationY = nil
            self.deviationDistance = nil
        }
    }
}

struct CalibrationTarget: Identifiable {
    let id = UUID()
    let x: CGFloat
    let y: CGFloat
    let label: String
    var hit: Bool = false
    var hitX: CGFloat?
    var hitY: CGFloat?
    var deviation: CGFloat?
}

// MARK: - Event Logger

class EventLogger: ObservableObject {
    static let shared = EventLogger()

    @Published var events: [MouseEvent] = []
    @Published var isLogging = true

    private let logFileURL: URL
    private let jsonEncoder = JSONEncoder()

    init() {
        let logDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        logFileURL = logDir.appendingPathComponent("mouse_calibration_log.jsonl")
        jsonEncoder.dateEncodingStrategy = .iso8601

        // Clear log file on start
        try? "".write(to: logFileURL, atomically: true, encoding: .utf8)
        print("Logging to: \(logFileURL.path)")
    }

    func log(_ event: MouseEvent) {
        guard isLogging else { return }

        DispatchQueue.main.async {
            self.events.append(event)
            if self.events.count > 100 {
                self.events.removeFirst()
            }
        }

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
                    try? data.write(to: logFileURL)
                }
            }
        }

        // Also print to console for real-time monitoring
        print("[\(event.eventType)] Screen:(\(Int(event.screenX)),\(Int(event.screenY))) Window:(\(Int(event.windowX)),\(Int(event.windowY)))" +
              (event.deviationDistance != nil ? " Deviation:\(String(format: "%.1f", event.deviationDistance!))px" : ""))
    }

    func clearLog() {
        events.removeAll()
        try? "".write(to: logFileURL, atomically: true, encoding: .utf8)
    }
}

// MARK: - Mouse Tracking View

struct MouseTrackingView: NSViewRepresentable {
    @Binding var mousePosition: CGPoint
    @Binding var screenPosition: CGPoint
    @Binding var lastClickPosition: CGPoint?
    @Binding var lastClickType: String
    @Binding var scrollDelta: CGPoint
    var activeTarget: CalibrationTarget?
    var onTargetHit: ((CGPoint) -> Void)?

    func makeNSView(context: Context) -> TrackingNSView {
        let view = TrackingNSView()
        view.coordinator = context.coordinator
        return view
    }

    func updateNSView(_ nsView: TrackingNSView, context: Context) {
        context.coordinator.activeTarget = activeTarget
        context.coordinator.onTargetHit = onTargetHit
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator {
        var parent: MouseTrackingView
        var activeTarget: CalibrationTarget?
        var onTargetHit: ((CGPoint) -> Void)?

        init(_ parent: MouseTrackingView) {
            self.parent = parent
        }

        func handleMouseMove(_ event: NSEvent, view: NSView) {
            let windowPoint = view.convert(event.locationInWindow, from: nil)
            let screenPoint = NSEvent.mouseLocation

            DispatchQueue.main.async {
                self.parent.mousePosition = windowPoint
                self.parent.screenPosition = screenPoint
            }
        }

        func handleMouseClick(_ event: NSEvent, view: NSView) {
            let windowPoint = view.convert(event.locationInWindow, from: nil)
            let screenPoint = NSEvent.mouseLocation

            let buttonName: String
            let buttonNum: Int
            switch event.type {
            case .leftMouseDown, .leftMouseUp:
                buttonNum = 0
                buttonName = event.clickCount > 1 ? "DOUBLE_LEFT" : "LEFT"
            case .rightMouseDown, .rightMouseUp:
                buttonNum = 1
                buttonName = "RIGHT"
            case .otherMouseDown, .otherMouseUp:
                buttonNum = Int(event.buttonNumber)
                buttonName = "MIDDLE"
            default:
                buttonNum = -1
                buttonName = "UNKNOWN"
            }

            let isDown = event.type == .leftMouseDown || event.type == .rightMouseDown || event.type == .otherMouseDown
            let eventType = "\(buttonName)_\(isDown ? "DOWN" : "UP")"

            DispatchQueue.main.async {
                self.parent.lastClickPosition = windowPoint
                self.parent.lastClickType = "\(buttonName) (\(event.clickCount)x)"
            }

            let logEvent = MouseEvent(
                eventType: eventType,
                screenX: screenPoint.x,
                screenY: screenPoint.y,
                windowX: windowPoint.x,
                windowY: windowPoint.y,
                button: buttonNum,
                clickCount: event.clickCount,
                targetX: activeTarget?.x,
                targetY: activeTarget?.y
            )
            EventLogger.shared.log(logEvent)

            // Check if target was hit
            if isDown, let target = activeTarget {
                onTargetHit?(windowPoint)
            }
        }

        func handleScroll(_ event: NSEvent, view: NSView) {
            let windowPoint = view.convert(event.locationInWindow, from: nil)
            let screenPoint = NSEvent.mouseLocation

            DispatchQueue.main.async {
                self.parent.scrollDelta = CGPoint(x: event.scrollingDeltaX, y: event.scrollingDeltaY)
            }

            let logEvent = MouseEvent(
                eventType: "SCROLL",
                screenX: screenPoint.x,
                screenY: screenPoint.y,
                windowX: windowPoint.x,
                windowY: windowPoint.y,
                scrollDeltaX: event.scrollingDeltaX,
                scrollDeltaY: event.scrollingDeltaY
            )
            EventLogger.shared.log(logEvent)
        }
    }
}

class TrackingNSView: NSView {
    var coordinator: MouseTrackingView.Coordinator?
    var trackingArea: NSTrackingArea?

    override var acceptsFirstResponder: Bool { true }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let existing = trackingArea {
            removeTrackingArea(existing)
        }
        trackingArea = NSTrackingArea(
            rect: bounds,
            options: [.mouseMoved, .activeAlways, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(trackingArea!)
    }

    override func mouseMoved(with event: NSEvent) {
        coordinator?.handleMouseMove(event, view: self)
    }

    override func mouseDown(with event: NSEvent) {
        coordinator?.handleMouseClick(event, view: self)
    }

    override func mouseUp(with event: NSEvent) {
        coordinator?.handleMouseClick(event, view: self)
    }

    override func rightMouseDown(with event: NSEvent) {
        coordinator?.handleMouseClick(event, view: self)
    }

    override func rightMouseUp(with event: NSEvent) {
        coordinator?.handleMouseClick(event, view: self)
    }

    override func otherMouseDown(with event: NSEvent) {
        coordinator?.handleMouseClick(event, view: self)
    }

    override func otherMouseUp(with event: NSEvent) {
        coordinator?.handleMouseClick(event, view: self)
    }

    override func scrollWheel(with event: NSEvent) {
        coordinator?.handleScroll(event, view: self)
    }
}

// MARK: - Main Content View

struct ContentView: View {
    @StateObject private var logger = EventLogger.shared
    @State private var mousePosition: CGPoint = .zero
    @State private var screenPosition: CGPoint = .zero
    @State private var lastClickPosition: CGPoint?
    @State private var lastClickType: String = "None"
    @State private var scrollDelta: CGPoint = .zero
    @State private var screenSize: CGSize = .zero
    @State private var windowFrame: CGRect = .zero

    @State private var mode: CalibrationMode = .freeForm
    @State private var calibrationTargets: [CalibrationTarget] = []
    @State private var currentTargetIndex: Int = 0
    @State private var calibrationResults: [CalibrationTarget] = []
    @State private var showGrid: Bool = true

    enum CalibrationMode: String, CaseIterable {
        case freeForm = "Free Form"
        case calibration = "Calibration"
        case gridTest = "Grid Test"
    }

    var activeTarget: CalibrationTarget? {
        guard mode == .calibration, currentTargetIndex < calibrationTargets.count else { return nil }
        return calibrationTargets[currentTargetIndex]
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background
                Color.black.ignoresSafeArea()

                // Grid overlay
                if showGrid {
                    GridOverlay(size: geometry.size)
                }

                // Mouse tracking layer
                MouseTrackingView(
                    mousePosition: $mousePosition,
                    screenPosition: $screenPosition,
                    lastClickPosition: $lastClickPosition,
                    lastClickType: $lastClickType,
                    scrollDelta: $scrollDelta,
                    activeTarget: activeTarget,
                    onTargetHit: handleTargetHit
                )
                .ignoresSafeArea()

                // Calibration targets
                if mode == .calibration {
                    ForEach(calibrationTargets) { target in
                        CalibrationTargetView(
                            target: target,
                            isActive: target.id == activeTarget?.id
                        )
                        .position(x: target.x, y: geometry.size.height - target.y)
                    }
                }

                // Grid test targets
                if mode == .gridTest {
                    GridTestTargets(size: geometry.size, onTargetClick: handleGridTargetClick)
                }

                // Click indicator
                if let clickPos = lastClickPosition {
                    Circle()
                        .stroke(Color.red, lineWidth: 2)
                        .frame(width: 20, height: 20)
                        .position(x: clickPos.x, y: geometry.size.height - clickPos.y)
                }

                // Crosshair at mouse position
                CrosshairView()
                    .position(x: mousePosition.x, y: geometry.size.height - mousePosition.y)

                // Info panel
                VStack {
                    HStack {
                        InfoPanel(
                            mousePosition: mousePosition,
                            screenPosition: screenPosition,
                            screenSize: screenSize,
                            windowFrame: windowFrame,
                            lastClickType: lastClickType,
                            scrollDelta: scrollDelta
                        )
                        Spacer()
                        ControlPanel(
                            mode: $mode,
                            showGrid: $showGrid,
                            onStartCalibration: startCalibration,
                            onClearLog: { logger.clearLog() }
                        )
                    }
                    .padding()

                    Spacer()

                    // Event log
                    EventLogView(events: logger.events)
                        .frame(height: 150)
                        .padding()
                }
            }
            .onAppear {
                updateScreenInfo()
                screenSize = geometry.size
            }
            .onChange(of: geometry.size) { newSize in
                screenSize = newSize
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didChangeScreenNotification)) { _ in
            updateScreenInfo()
        }
    }

    func updateScreenInfo() {
        if let screen = NSScreen.main {
            screenSize = screen.frame.size
        }
        if let window = NSApplication.shared.windows.first {
            windowFrame = window.frame
        }
    }

    func startCalibration() {
        guard let window = NSApplication.shared.windows.first else { return }
        let size = window.contentView?.frame.size ?? CGSize(width: 1920, height: 1080)

        // Generate calibration targets in a grid pattern
        let margin: CGFloat = 100
        let cols = 5
        let rows = 4

        calibrationTargets = []
        calibrationResults = []

        for row in 0..<rows {
            for col in 0..<cols {
                let x = margin + (size.width - 2 * margin) * CGFloat(col) / CGFloat(cols - 1)
                let y = margin + (size.height - 2 * margin) * CGFloat(row) / CGFloat(rows - 1)
                calibrationTargets.append(CalibrationTarget(
                    x: x,
                    y: y,
                    label: "\(row * cols + col + 1)"
                ))
            }
        }

        currentTargetIndex = 0
        mode = .calibration
    }

    func handleTargetHit(_ position: CGPoint) {
        guard currentTargetIndex < calibrationTargets.count else { return }

        var target = calibrationTargets[currentTargetIndex]
        target.hit = true
        target.hitX = position.x
        target.hitY = position.y
        target.deviation = sqrt(pow(position.x - target.x, 2) + pow(position.y - target.y, 2))

        calibrationResults.append(target)
        calibrationTargets[currentTargetIndex] = target

        currentTargetIndex += 1

        if currentTargetIndex >= calibrationTargets.count {
            // Calibration complete
            printCalibrationResults()
        }
    }

    func handleGridTargetClick(_ position: CGPoint, targetPosition: CGPoint) {
        let logEvent = MouseEvent(
            eventType: "GRID_TARGET_HIT",
            screenX: screenPosition.x,
            screenY: screenPosition.y,
            windowX: position.x,
            windowY: position.y,
            targetX: targetPosition.x,
            targetY: targetPosition.y
        )
        EventLogger.shared.log(logEvent)
    }

    func printCalibrationResults() {
        print("\n=== CALIBRATION RESULTS ===")
        var totalDeviation: CGFloat = 0
        for result in calibrationResults {
            if let dev = result.deviation {
                print("Target \(result.label): Deviation = \(String(format: "%.1f", dev))px")
                totalDeviation += dev
            }
        }
        let avgDeviation = totalDeviation / CGFloat(calibrationResults.count)
        print("Average Deviation: \(String(format: "%.1f", avgDeviation))px")
        print("===========================\n")
    }
}

// MARK: - Supporting Views

struct GridOverlay: View {
    let size: CGSize
    let gridSpacing: CGFloat = 100

    var body: some View {
        Canvas { context, size in
            // Vertical lines
            var x: CGFloat = 0
            while x <= size.width {
                var path = Path()
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: size.height))
                context.stroke(path, with: .color(.gray.opacity(0.3)), lineWidth: 1)
                x += gridSpacing
            }

            // Horizontal lines
            var y: CGFloat = 0
            while y <= size.height {
                var path = Path()
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                context.stroke(path, with: .color(.gray.opacity(0.3)), lineWidth: 1)
                y += gridSpacing
            }
        }
    }
}

struct CrosshairView: View {
    var body: some View {
        ZStack {
            // Vertical line
            Rectangle()
                .fill(Color.green)
                .frame(width: 1, height: 40)
            // Horizontal line
            Rectangle()
                .fill(Color.green)
                .frame(width: 40, height: 1)
            // Center dot
            Circle()
                .fill(Color.green)
                .frame(width: 6, height: 6)
        }
    }
}

struct CalibrationTargetView: View {
    let target: CalibrationTarget
    let isActive: Bool

    var body: some View {
        ZStack {
            // Outer circle
            Circle()
                .stroke(isActive ? Color.yellow : (target.hit ? Color.green : Color.white), lineWidth: 2)
                .frame(width: 40, height: 40)

            // Inner circle
            Circle()
                .fill(isActive ? Color.yellow.opacity(0.3) : (target.hit ? Color.green.opacity(0.3) : Color.white.opacity(0.1)))
                .frame(width: 30, height: 30)

            // Center dot
            Circle()
                .fill(isActive ? Color.yellow : (target.hit ? Color.green : Color.white))
                .frame(width: 6, height: 6)

            // Label
            Text(target.label)
                .font(.caption)
                .foregroundColor(.white)
                .offset(y: 30)
        }
    }
}

struct GridTestTargets: View {
    let size: CGSize
    let onTargetClick: (CGPoint, CGPoint) -> Void

    let rows = 5
    let cols = 7

    var body: some View {
        let margin: CGFloat = 80
        let spacingX = (size.width - 2 * margin) / CGFloat(cols - 1)
        let spacingY = (size.height - 2 * margin) / CGFloat(rows - 1)

        ForEach(0..<rows, id: \.self) { row in
            ForEach(0..<cols, id: \.self) { col in
                let x = margin + spacingX * CGFloat(col)
                let y = margin + spacingY * CGFloat(row)

                Circle()
                    .stroke(Color.cyan, lineWidth: 1)
                    .frame(width: 20, height: 20)
                    .position(x: x, y: y)
            }
        }
    }
}

struct InfoPanel: View {
    let mousePosition: CGPoint
    let screenPosition: CGPoint
    let screenSize: CGSize
    let windowFrame: CGRect
    let lastClickType: String
    let scrollDelta: CGPoint

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Mouse Calibration Tool")
                .font(.headline)
                .foregroundColor(.white)

            Divider().background(Color.gray)

            Group {
                Text("Window Position: (\(Int(mousePosition.x)), \(Int(mousePosition.y)))")
                Text("Screen Position: (\(Int(screenPosition.x)), \(Int(screenPosition.y)))")
                Text("Screen Size: \(Int(screenSize.width)) x \(Int(screenSize.height))")
                Text("Window Frame: \(Int(windowFrame.origin.x)),\(Int(windowFrame.origin.y)) \(Int(windowFrame.width))x\(Int(windowFrame.height))")
                Text("Last Click: \(lastClickType)")
                Text("Scroll Delta: (\(String(format: "%.1f", scrollDelta.x)), \(String(format: "%.1f", scrollDelta.y)))")
            }
            .font(.system(.caption, design: .monospaced))
            .foregroundColor(.green)
        }
        .padding()
        .background(Color.black.opacity(0.8))
        .cornerRadius(8)
    }
}

struct ControlPanel: View {
    @Binding var mode: ContentView.CalibrationMode
    @Binding var showGrid: Bool
    let onStartCalibration: () -> Void
    let onClearLog: () -> Void

    var body: some View {
        VStack(alignment: .trailing, spacing: 8) {
            Picker("Mode", selection: $mode) {
                ForEach(ContentView.CalibrationMode.allCases, id: \.self) { m in
                    Text(m.rawValue).tag(m)
                }
            }
            .pickerStyle(.segmented)
            .frame(width: 300)

            HStack {
                Toggle("Show Grid", isOn: $showGrid)
                    .foregroundColor(.white)

                Button("Start Calibration") {
                    onStartCalibration()
                }

                Button("Clear Log") {
                    onClearLog()
                }

                Button("Exit (ESC)") {
                    NSApplication.shared.terminate(nil)
                }
                .keyboardShortcut(.escape, modifiers: [])
            }
        }
        .padding()
        .background(Color.black.opacity(0.8))
        .cornerRadius(8)
    }
}

struct EventLogView: View {
    let events: [MouseEvent]

    var body: some View {
        VStack(alignment: .leading) {
            Text("Event Log (last 100)")
                .font(.headline)
                .foregroundColor(.white)

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(events.suffix(20)) { event in
                            HStack {
                                Text(formatTime(event.timestamp))
                                    .foregroundColor(.gray)
                                Text(event.eventType)
                                    .foregroundColor(.yellow)
                                Text("W:(\(Int(event.windowX)),\(Int(event.windowY)))")
                                    .foregroundColor(.green)
                                Text("S:(\(Int(event.screenX)),\(Int(event.screenY)))")
                                    .foregroundColor(.cyan)
                                if let dev = event.deviationDistance {
                                    Text("Dev:\(String(format: "%.1f", dev))px")
                                        .foregroundColor(dev < 10 ? .green : (dev < 30 ? .yellow : .red))
                                }
                            }
                            .font(.system(.caption, design: .monospaced))
                            .id(event.id)
                        }
                    }
                }
                .onChange(of: events.count) { _ in
                    if let last = events.last {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
        }
        .padding()
        .background(Color.black.opacity(0.8))
        .cornerRadius(8)
    }

    func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        return formatter.string(from: date)
    }
}

#Preview {
    ContentView()
}

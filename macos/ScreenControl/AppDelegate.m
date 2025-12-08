/**
 * ScreenControl App Delegate Implementation
 * Runs as a menu bar app with status icon and native settings window
 */

#import "AppDelegate.h"
#import <ServiceManagement/ServiceManagement.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Security/Security.h>
#import <IOKit/IOKitLib.h>
#import <signal.h>

#ifdef DEBUG
#import "TestServer.h"
#endif

// Settings keys for UserDefaults
static NSString * const kAgentNameKey = @"AgentName";
static NSString * const kNetworkModeKey = @"NetworkMode";
static NSString * const kPortKey = @"Port";
static NSString * const kAPIKeyKey = @"APIKey";
static NSString * const kControlServerAddressKey = @"ControlServerAddress";

// Tools configuration path
static NSString * const kToolsConfigFilename = @"tools.json";

// Forward declare C++ agent functions
#ifdef __cplusplus
extern "C" {
#endif
    void* mcp_eyes_create_agent(void);
    void mcp_eyes_destroy_agent(void* agent);
    int mcp_eyes_start(void* agent);
    void mcp_eyes_stop(void* agent);
    int mcp_eyes_is_running(void* agent);
    const char* mcp_eyes_get_name(void* agent);
    int mcp_eyes_get_port(void* agent);
#ifdef __cplusplus
}
#endif

@interface AppDelegate ()
@property (strong) MCPServer* mcpServer;
@property (strong) NSTimer* statusTimer;
@property (strong) NSDate* startTime;
@property (assign) BOOL isRemoteMode;
@property (strong) NSURLSession* urlSession;
@property (assign) BOOL isUpdatingPermissionIndicators;
@property (assign) BOOL isUpdatingSettingsStatus;
@property (strong) NSImage* cachedNormalIcon;
@property (strong) NSImage* cachedLockedIcon;
@property (assign) BOOL currentIconIsLocked;
@property (assign) BOOL isAppTerminating;

// Helper method declarations
- (NSString *)getToolsConfigPath;
- (void)loadToolsConfig;
- (void)saveToolsConfig;
- (void)createDefaultToolsConfig;
- (BOOL)ensureAllCategoriesExist;
- (NSArray *)getToolsForCategory:(NSString *)categoryId;
- (NSView *)createGeneralTabView;
- (NSView *)createToolsTabView;
- (NSView *)createPermissionsTabView;
- (NSView *)createDebugTabView;
- (void)debugConnect:(id)sender;
- (void)debugDisconnect:(id)sender;
- (void)debugSendRegistration;
- (void)debugSendHeartbeat;
- (void)debugReceiveMessage;
- (void)debugLog:(NSString *)message;
- (NSString *)getMachineId;
- (CGFloat)addCategoryBox:(NSString *)categoryName categoryId:(NSString *)categoryId tools:(NSArray *)tools toView:(NSView *)documentView atY:(CGFloat)y;
- (void)categoryToggleChanged:(NSButton *)sender;
- (void)toolToggleChanged:(NSButton *)sender;
- (void)loadBundledDebugConfig;
@end

@implementation AppDelegate

#pragma mark - Application Lifecycle

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    self.startTime = [NSDate date];

    // Initialize URL session for control server connections
    NSURLSessionConfiguration *config = [NSURLSessionConfiguration defaultSessionConfiguration];
    config.timeoutIntervalForRequest = 10.0;
    self.urlSession = [NSURLSession sessionWithConfiguration:config];

    // Initialize tools configuration dictionaries
    self.categoryToggles = [NSMutableDictionary dictionary];
    self.toolToggles = [NSMutableDictionary dictionary];
    [self loadToolsConfig];

    // Create status bar item with googly eyes icon
    self.statusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSSquareStatusItemLength];
    [self updateStatusBarIcon:NO];
    self.statusItem.button.toolTip = @"ScreenControl Agent";

    // Create menu
    [self createStatusMenu];
    self.statusItem.menu = self.statusMenu;

    // Create settings window
    [self createSettingsWindow];

    // Load bundled debug config to auto-fill debug connection settings
    [self loadBundledDebugConfig];

    // Check permissions on launch
    [self checkPermissions];

    // Start agent
    [self startAgent];

    // Start browser bridge server (manages Firefox/Chrome extension communication)
    [self startBrowserBridge];

    // Check control server connection status
    [self checkControlServerConnection];

    // Update status periodically
    self.statusTimer = [NSTimer scheduledTimerWithTimeInterval:5.0
                                                        target:self
                                                      selector:@selector(updateStatus)
                                                      userInfo:nil
                                                       repeats:YES];

#ifdef DEBUG
    // Start test server for automated testing (DEBUG builds only)
    // Use port 3458 to avoid conflict with MCPServer on 3456
    self.testServer = [[TestServer alloc] initWithAppDelegate:self];
    if ([self.testServer startOnPort:3458]) {
        NSLog(@"[ScreenControl] Test server started - agent is now remotely controllable via localhost:3458");
    } else {
        NSLog(@"[ScreenControl] WARNING: Failed to start test server");
    }
#endif
}

- (void)applicationWillTerminate:(NSNotification *)notification {
    self.isAppTerminating = YES;

#ifdef DEBUG
    [self.testServer stop];
#endif

    [self stopBrowserBridge];
    [self stopAgent];
    [self.statusTimer invalidate];
}

#pragma mark - Googly Eyes Icon

- (void)updateStatusBarIcon:(BOOL)locked {
    // Ensure we're on the main thread
    if (![NSThread isMainThread]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self updateStatusBarIcon:locked];
        });
        return;
    }

    // Only update if the state actually changed
    if (self.currentIconIsLocked == locked && (locked ? self.cachedLockedIcon : self.cachedNormalIcon) != nil) {
        return;
    }

    self.currentIconIsLocked = locked;

    // Check if we have cached icons
    NSImage *targetIcon = locked ? self.cachedLockedIcon : self.cachedNormalIcon;

    if (!targetIcon) {
        // Create icons if not cached
        CGFloat menuBarSize = 22.0;

        // Load app icon from bundle
        NSImage *appIcon = [[NSWorkspace sharedWorkspace] iconForFile:[NSBundle mainBundle].bundlePath];
        if (!appIcon || appIcon.size.width == 0) {
            appIcon = [NSImage imageNamed:@"AppIcon"];
        }

        if (appIcon && appIcon.size.width > 0) {
            // Create the icon using lockFocusFlipped for better rendering
            targetIcon = [[NSImage alloc] initWithSize:NSMakeSize(menuBarSize, menuBarSize)];
            [targetIcon lockFocus];

            // Save graphics state
            [NSGraphicsContext saveGraphicsState];

            NSGraphicsContext *context = [NSGraphicsContext currentContext];
            context.imageInterpolation = NSImageInterpolationHigh;
            context.shouldAntialias = YES;

            // Draw base icon
            [appIcon drawInRect:NSMakeRect(0, 0, menuBarSize, menuBarSize)
                        fromRect:NSZeroRect
                       operation:NSCompositingOperationSourceOver
                        fraction:1.0];

            // Draw X overlay if locked
            if (locked) {
                NSBezierPath *xPath = [NSBezierPath bezierPath];
                xPath.lineWidth = 2.0;
                [[NSColor systemRedColor] setStroke];

                // Left X
                [xPath moveToPoint:NSMakePoint(menuBarSize * 0.25 - 3, menuBarSize * 0.5 - 3)];
                [xPath lineToPoint:NSMakePoint(menuBarSize * 0.25 + 3, menuBarSize * 0.5 + 3)];
                [xPath moveToPoint:NSMakePoint(menuBarSize * 0.25 + 3, menuBarSize * 0.5 - 3)];
                [xPath lineToPoint:NSMakePoint(menuBarSize * 0.25 - 3, menuBarSize * 0.5 + 3)];

                // Right X
                [xPath moveToPoint:NSMakePoint(menuBarSize * 0.75 - 3, menuBarSize * 0.5 - 3)];
                [xPath lineToPoint:NSMakePoint(menuBarSize * 0.75 + 3, menuBarSize * 0.5 + 3)];
                [xPath moveToPoint:NSMakePoint(menuBarSize * 0.75 + 3, menuBarSize * 0.5 - 3)];
                [xPath lineToPoint:NSMakePoint(menuBarSize * 0.75 - 3, menuBarSize * 0.5 + 3)];

                [xPath stroke];
            }

            // Restore graphics state
            [NSGraphicsContext restoreGraphicsState];
            [targetIcon unlockFocus];

            targetIcon.template = NO;

            // Cache the created icon
            if (locked) {
                self.cachedLockedIcon = targetIcon;
            } else {
                self.cachedNormalIcon = targetIcon;
            }
        } else {
            // Fallback icon
            targetIcon = [[NSImage alloc] initWithSize:NSMakeSize(menuBarSize, menuBarSize)];
            [targetIcon lockFocus];
            [[NSColor systemGrayColor] setFill];
            NSRectFill(NSMakeRect(0, 0, menuBarSize, menuBarSize));
            [targetIcon unlockFocus];
        }
    }

    // Apply the icon
    if (targetIcon) {
        self.statusItem.button.image = targetIcon;
    }
}

#pragma mark - Status Menu

- (void)createStatusMenu {
    self.statusMenu = [[NSMenu alloc] init];

    NSMenuItem *headerItem = [[NSMenuItem alloc] initWithTitle:@"ScreenControl Agent"
                                                        action:nil
                                                 keyEquivalent:@""];
    headerItem.enabled = NO;
    [self.statusMenu addItem:headerItem];

    NSMenuItem *statusItem = [[NSMenuItem alloc] initWithTitle:@"Starting..."
                                                        action:nil
                                                 keyEquivalent:@""];
    statusItem.tag = 100;
    [self.statusMenu addItem:statusItem];

    [self.statusMenu addItem:[NSMenuItem separatorItem]];

    NSMenuItem *settingsItem = [[NSMenuItem alloc] initWithTitle:@"Settings..."
                                                          action:@selector(openSettings:)
                                                   keyEquivalent:@","];
    [self.statusMenu addItem:settingsItem];

    NSMenuItem *copyKeyItem = [[NSMenuItem alloc] initWithTitle:@"Copy API Key"
                                                         action:@selector(copyAPIKey:)
                                                  keyEquivalent:@"k"];
    [self.statusMenu addItem:copyKeyItem];

    [self.statusMenu addItem:[NSMenuItem separatorItem]];

    NSMenuItem *permissionsItem = [[NSMenuItem alloc] initWithTitle:@"Permissions"
                                                             action:nil
                                                      keyEquivalent:@""];
    NSMenu *permissionsMenu = [[NSMenu alloc] init];

    NSMenuItem *accessibilityItem = [[NSMenuItem alloc] initWithTitle:@"Accessibility: Checking..."
                                                               action:@selector(openAccessibilityPrefs:)
                                                        keyEquivalent:@""];
    accessibilityItem.tag = 200;
    [permissionsMenu addItem:accessibilityItem];

    NSMenuItem *screenRecordingItem = [[NSMenuItem alloc] initWithTitle:@"Screen Recording: Checking..."
                                                                 action:@selector(openScreenRecordingPrefs:)
                                                          keyEquivalent:@""];
    screenRecordingItem.tag = 201;
    [permissionsMenu addItem:screenRecordingItem];

    permissionsItem.submenu = permissionsMenu;
    [self.statusMenu addItem:permissionsItem];

    [self.statusMenu addItem:[NSMenuItem separatorItem]];

    NSMenuItem *loginItem = [[NSMenuItem alloc] initWithTitle:@"Start at Login"
                                                       action:@selector(toggleLoginItem:)
                                                keyEquivalent:@""];
    loginItem.tag = 300;
    [self.statusMenu addItem:loginItem];

    [self.statusMenu addItem:[NSMenuItem separatorItem]];

    NSMenuItem *quitItem = [[NSMenuItem alloc] initWithTitle:@"Quit ScreenControl"
                                                      action:@selector(quit:)
                                               keyEquivalent:@"q"];
    [self.statusMenu addItem:quitItem];
}

#pragma mark - Settings Window

- (void)createSettingsWindow {
    CGFloat windowWidth = 600;
    CGFloat windowHeight = 700;

    NSRect windowRect = NSMakeRect(0, 0, windowWidth, windowHeight);

    self.settingsWindow = [[NSWindow alloc] initWithContentRect:windowRect
                                                      styleMask:(NSWindowStyleMaskTitled |
                                                                NSWindowStyleMaskClosable |
                                                                NSWindowStyleMaskMiniaturizable)
                                                        backing:NSBackingStoreBuffered
                                                          defer:NO];

    self.settingsWindow.title = @"ScreenControl Settings";
    self.settingsWindow.delegate = self;
    [self.settingsWindow center];

    NSView *contentView = self.settingsWindow.contentView;

    // Create tab view
    self.settingsTabView = [[NSTabView alloc] initWithFrame:NSMakeRect(0, 50, windowWidth, windowHeight - 50)];

    // Create tabs
    NSTabViewItem *generalTab = [[NSTabViewItem alloc] initWithIdentifier:@"general"];
    generalTab.label = @"General";
    generalTab.view = [self createGeneralTabView];
    [self.settingsTabView addTabViewItem:generalTab];

    NSTabViewItem *toolsTab = [[NSTabViewItem alloc] initWithIdentifier:@"tools"];
    toolsTab.label = @"Tools";
    toolsTab.view = [self createToolsTabView];
    [self.settingsTabView addTabViewItem:toolsTab];

    NSTabViewItem *permissionsTab = [[NSTabViewItem alloc] initWithIdentifier:@"permissions"];
    permissionsTab.label = @"Permissions";
    permissionsTab.view = [self createPermissionsTabView];
    [self.settingsTabView addTabViewItem:permissionsTab];

    NSTabViewItem *debugTab = [[NSTabViewItem alloc] initWithIdentifier:@"debug"];
    debugTab.label = @"Debug";
    debugTab.view = [self createDebugTabView];
    [self.settingsTabView addTabViewItem:debugTab];

    [contentView addSubview:self.settingsTabView];

    // Save Button
    CGFloat padding = 20;
    NSButton *saveButton = [[NSButton alloc] initWithFrame:NSMakeRect(windowWidth - padding - 100, 15, 90, 32)];
    saveButton.title = @"Save";
    saveButton.bezelStyle = NSBezelStyleRounded;
    saveButton.keyEquivalent = @"\r";
    saveButton.target = self;
    saveButton.action = @selector(saveSettings:);
    [contentView addSubview:saveButton];

    [self updatePermissionIndicators];
}

#pragma mark - Tab View Creation

- (NSView *)createGeneralTabView {
    CGFloat tabWidth = 600;
    CGFloat tabHeight = 650;
    NSView *tabView = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, tabWidth, tabHeight)];

    CGFloat padding = 20;
    CGFloat labelWidth = 120;
    CGFloat controlWidth = tabWidth - padding * 2 - labelWidth - 10;
    CGFloat rowHeight = 30;
    CGFloat y = tabHeight - 50;  // Increased gap to prevent tab overlap

    // Agent Configuration Section
    NSBox *configBox = [[NSBox alloc] initWithFrame:NSMakeRect(padding, y - 140, tabWidth - padding * 2, 150)];
    configBox.title = @"Agent Configuration";
    configBox.titlePosition = NSAtTop;
    [tabView addSubview:configBox];

    CGFloat boxPadding = 15;
    CGFloat boxY = 100;

    NSTextField *nameLabel = [self createLabel:@"Agent Name:"
                                         frame:NSMakeRect(boxPadding, boxY, labelWidth, rowHeight)];
    [configBox addSubview:nameLabel];

    self.agentNameField = [[NSTextField alloc] initWithFrame:NSMakeRect(boxPadding + labelWidth, boxY, controlWidth - 20, 24)];
    self.agentNameField.placeholderString = @"My Mac";
    self.agentNameField.stringValue = [self loadSetting:kAgentNameKey defaultValue:[[NSHost currentHost] localizedName]];
    self.agentNameField.delegate = self;
    [configBox addSubview:self.agentNameField];
    boxY -= rowHeight + 5;

    NSTextField *modeLabel = [self createLabel:@"Network Mode:"
                                         frame:NSMakeRect(boxPadding, boxY, labelWidth, rowHeight)];
    [configBox addSubview:modeLabel];

    self.networkModePopup = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(boxPadding + labelWidth, boxY, controlWidth - 20, 24)];
    [self.networkModePopup addItemsWithTitles:@[@"Localhost Only", @"Local Network (LAN)", @"Internet (WAN)"]];
    NSString *savedMode = [self loadSetting:kNetworkModeKey defaultValue:@"localhost"];
    if ([savedMode isEqualToString:@"lan"]) {
        [self.networkModePopup selectItemAtIndex:1];
    } else if ([savedMode isEqualToString:@"wan"]) {
        [self.networkModePopup selectItemAtIndex:2];
    }
    [self.networkModePopup setTarget:self];
    [self.networkModePopup setAction:@selector(networkModeChanged:)];
    [configBox addSubview:self.networkModePopup];
    boxY -= rowHeight + 5;

    NSTextField *portLabel = [self createLabel:@"Port:"
                                         frame:NSMakeRect(boxPadding, boxY, labelWidth, rowHeight)];
    [configBox addSubview:portLabel];

    self.portField = [[NSTextField alloc] initWithFrame:NSMakeRect(boxPadding + labelWidth, boxY, 80, 24)];
    self.portField.stringValue = [self loadSetting:kPortKey defaultValue:@"3456"];
    self.portField.delegate = self;
    [configBox addSubview:self.portField];

    y -= 160;

    // Security Section
    NSBox *securityBox = [[NSBox alloc] initWithFrame:NSMakeRect(padding, y - 90, tabWidth - padding * 2, 100)];
    securityBox.title = @"Security";
    securityBox.titlePosition = NSAtTop;
    [tabView addSubview:securityBox];

    boxY = 50;

    NSTextField *keyLabel = [self createLabel:@"API Key:"
                                        frame:NSMakeRect(boxPadding, boxY, labelWidth, rowHeight)];
    [securityBox addSubview:keyLabel];

    self.apiKeyField = [[NSTextField alloc] initWithFrame:NSMakeRect(boxPadding + labelWidth, boxY, controlWidth - 60, 24)];
    self.apiKeyField.stringValue = [self loadOrGenerateAPIKey];
    self.apiKeyField.editable = NO;
    self.apiKeyField.selectable = YES;
    self.apiKeyField.font = [NSFont monospacedSystemFontOfSize:11 weight:NSFontWeightRegular];
    [securityBox addSubview:self.apiKeyField];

    // Copy button with clipboard icon
    self.duplicateKeyButton = [[NSButton alloc] initWithFrame:NSMakeRect(boxPadding + labelWidth + controlWidth - 55, boxY, 24, 24)];
    self.duplicateKeyButton.bezelStyle = NSBezelStyleRounded;
    self.duplicateKeyButton.image = [NSImage imageWithSystemSymbolName:@"doc.on.doc" accessibilityDescription:@"Copy"];
    self.duplicateKeyButton.imagePosition = NSImageOnly;
    self.duplicateKeyButton.toolTip = @"Copy API Key";
    self.duplicateKeyButton.target = self;
    self.duplicateKeyButton.action = @selector(copyAPIKey:);
    [securityBox addSubview:self.duplicateKeyButton];

    // Regenerate button with refresh icon
    self.regenerateKeyButton = [[NSButton alloc] initWithFrame:NSMakeRect(boxPadding + labelWidth + controlWidth - 28, boxY, 24, 24)];
    self.regenerateKeyButton.bezelStyle = NSBezelStyleRounded;
    self.regenerateKeyButton.image = [NSImage imageWithSystemSymbolName:@"arrow.clockwise" accessibilityDescription:@"Regenerate"];
    self.regenerateKeyButton.imagePosition = NSImageOnly;
    self.regenerateKeyButton.toolTip = @"Regenerate API Key";
    self.regenerateKeyButton.target = self;
    self.regenerateKeyButton.action = @selector(regenerateAPIKey:);
    [securityBox addSubview:self.regenerateKeyButton];

    y -= 110;

    // Control Server Section
    NSBox *controlServerBox = [[NSBox alloc] initWithFrame:NSMakeRect(padding, y - 105, tabWidth - padding * 2, 115)];
    controlServerBox.title = @"Control Server (Remote Mode)";
    controlServerBox.titlePosition = NSAtTop;
    [tabView addSubview:controlServerBox];

    boxY = 70;

    // URL field with Connect button
    NSTextField *urlLabel = [self createLabel:@"URL:"
                                        frame:NSMakeRect(boxPadding, boxY, labelWidth, rowHeight)];
    [controlServerBox addSubview:urlLabel];

    self.controlServerAddressField = [[NSTextField alloc] initWithFrame:NSMakeRect(boxPadding + labelWidth, boxY, controlWidth - 100, 24)];
    self.controlServerAddressField.placeholderString = @"https://control.example.com";
    self.controlServerAddressField.stringValue = [self loadSetting:kControlServerAddressKey defaultValue:@""];
    self.controlServerAddressField.delegate = self;
    [controlServerBox addSubview:self.controlServerAddressField];

    // Connect button
    self.connectButton = [[NSButton alloc] initWithFrame:NSMakeRect(boxPadding + labelWidth + controlWidth - 95, boxY, 80, 24)];
    self.connectButton.title = @"Connect";
    self.connectButton.bezelStyle = NSBezelStyleRounded;
    self.connectButton.target = self;
    self.connectButton.action = @selector(connectControlServer:);
    [controlServerBox addSubview:self.connectButton];
    boxY -= rowHeight + 5;

    // Health status label
    self.healthStatusLabel = [self createLabel:@"Health: --"
                                         frame:NSMakeRect(boxPadding, boxY, controlWidth / 2, 20)];
    self.healthStatusLabel.textColor = [NSColor secondaryLabelColor];
    [controlServerBox addSubview:self.healthStatusLabel];

    // Connection status label
    self.connectionStatusLabel = [self createLabel:@"Status: Not connected"
                                             frame:NSMakeRect(boxPadding + controlWidth / 2, boxY, controlWidth / 2, 20)];
    self.connectionStatusLabel.textColor = [NSColor secondaryLabelColor];
    [controlServerBox addSubview:self.connectionStatusLabel];

    y -= 115;

    // Status Section
    NSBox *statusBox = [[NSBox alloc] initWithFrame:NSMakeRect(padding, y - 70, tabWidth - padding * 2, 80)];
    statusBox.title = @"Status";
    statusBox.titlePosition = NSAtTop;
    [tabView addSubview:statusBox];

    boxY = 35;

    self.statusLabel = [self createLabel:@"Server: Starting..."
                                   frame:NSMakeRect(boxPadding, boxY, tabWidth - padding * 2 - boxPadding * 2, 20)];
    [statusBox addSubview:self.statusLabel];
    boxY -= 25;

    self.uptimeLabel = [self createLabel:@"Uptime: 0s"
                                   frame:NSMakeRect(boxPadding, boxY, tabWidth - padding * 2 - boxPadding * 2, 20)];
    self.uptimeLabel.textColor = [NSColor secondaryLabelColor];
    [statusBox addSubview:self.uptimeLabel];

    return tabView;
}

- (NSView *)createToolsTabView {
    CGFloat tabWidth = 600;
    CGFloat tabHeight = 650;
    NSView *tabView = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, tabWidth, tabHeight)];

    CGFloat padding = 20;

    // Create scroll view for tools list
    self.toolsScrollView = [[NSScrollView alloc] initWithFrame:NSMakeRect(padding, 20, tabWidth - padding * 2, tabHeight - 40)];
    self.toolsScrollView.hasVerticalScroller = YES;
    self.toolsScrollView.autohidesScrollers = YES;
    self.toolsScrollView.borderType = NSBezelBorder;

    // Tools configuration should already be loaded in applicationDidFinishLaunching
    // Only load if it hasn't been loaded yet
    if (!self.toolsConfig) {
        [self loadToolsConfig];
    }

    // Calculate total height needed first (two-pass approach to avoid layout recursion)
    CGFloat calculatedHeight = 20;
    NSArray *categories = @[
        @{@"id": @"gui", @"name": @"GUI & Accessibility"},
        @{@"id": @"browser", @"name": @"Browser Automation"},
        @{@"id": @"filesystem", @"name": @"File System"},
        @{@"id": @"shell", @"name": @"Shell Commands"}
    ];

    // First pass: calculate total height needed
    for (NSDictionary *category in categories) {
        NSString *categoryId = category[@"id"];
        NSArray *categoryTools = [self getToolsForCategory:categoryId];
        CGFloat boxHeight = 50 + (categoryTools.count * 25);
        calculatedHeight += boxHeight + 15; // spacing between boxes
    }

    // Create document view with correct height from the start
    NSView *documentView = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, tabWidth - padding * 2 - 20, calculatedHeight)];

    // Second pass: add category boxes
    CGFloat y = 20;
    for (NSDictionary *category in categories) {
        NSString *categoryId = category[@"id"];
        NSString *categoryName = category[@"name"];

        // Get tools for this category
        NSArray *categoryTools = [self getToolsForCategory:categoryId];

        y = [self addCategoryBox:categoryName
                      categoryId:categoryId
                           tools:categoryTools
                          toView:documentView
                            atY:y];
        y += 15; // spacing between boxes
    }

    // Set document view after all content is added (no frame changes after this)
    self.toolsScrollView.documentView = documentView;
    [tabView addSubview:self.toolsScrollView];

    return tabView;
}

- (NSView *)createPermissionsTabView {
    CGFloat tabWidth = 600;
    CGFloat tabHeight = 650;
    NSView *tabView = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, tabWidth, tabHeight)];

    CGFloat padding = 20;
    CGFloat y = tabHeight - 40;

    // Permissions Section
    NSBox *permBox = [[NSBox alloc] initWithFrame:NSMakeRect(padding, y - 90, tabWidth - padding * 2, 100)];
    permBox.title = @"Permissions";
    permBox.titlePosition = NSAtTop;
    [tabView addSubview:permBox];

    CGFloat boxPadding = 15;
    CGFloat boxY = 55;

    self.accessibilityIndicator = [[NSImageView alloc] initWithFrame:NSMakeRect(boxPadding, boxY, 20, 20)];
    [permBox addSubview:self.accessibilityIndicator];

    self.accessibilityLabel = [self createLabel:@"Accessibility"
                                          frame:NSMakeRect(boxPadding + 25, boxY, 150, 20)];
    [permBox addSubview:self.accessibilityLabel];

    NSButton *grantAccessBtn = [[NSButton alloc] initWithFrame:NSMakeRect(tabWidth - padding * 2 - 100, boxY, 80, 24)];
    grantAccessBtn.title = @"Grant";
    grantAccessBtn.bezelStyle = NSBezelStyleRounded;
    grantAccessBtn.target = self;
    grantAccessBtn.action = @selector(openAccessibilityPrefs:);
    [permBox addSubview:grantAccessBtn];
    boxY -= 30;

    self.screenRecordingIndicator = [[NSImageView alloc] initWithFrame:NSMakeRect(boxPadding, boxY, 20, 20)];
    [permBox addSubview:self.screenRecordingIndicator];

    self.screenRecordingLabel = [self createLabel:@"Screen Recording"
                                            frame:NSMakeRect(boxPadding + 25, boxY, 150, 20)];
    [permBox addSubview:self.screenRecordingLabel];

    NSButton *grantScreenBtn = [[NSButton alloc] initWithFrame:NSMakeRect(tabWidth - padding * 2 - 100, boxY, 80, 24)];
    grantScreenBtn.title = @"Grant";
    grantScreenBtn.bezelStyle = NSBezelStyleRounded;
    grantScreenBtn.target = self;
    grantScreenBtn.action = @selector(openScreenRecordingPrefs:);
    [permBox addSubview:grantScreenBtn];

    return tabView;
}

- (NSView *)createDebugTabView {
    CGFloat tabWidth = 600;
    CGFloat tabHeight = 750;  // Increased for OAuth section
    NSView *tabView = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, tabWidth, tabHeight)];

    CGFloat padding = 20;
    CGFloat labelWidth = 120;
    CGFloat controlWidth = tabWidth - padding * 2 - labelWidth - 10;
    CGFloat rowHeight = 30;
    CGFloat y = tabHeight - 50;
    CGFloat boxPadding = 15;
    CGFloat boxY;

    // OAuth Join Section (Join by URL - like Claude MCP)
    NSBox *oauthBox = [[NSBox alloc] initWithFrame:NSMakeRect(padding, y - 100, tabWidth - padding * 2, 110)];
    oauthBox.title = @"Join by URL (OAuth Discovery)";
    oauthBox.titlePosition = NSAtTop;
    [tabView addSubview:oauthBox];

    boxY = 65;

    // MCP URL field
    NSTextField *mcpUrlLabel = [self createLabel:@"MCP URL:"
                                           frame:NSMakeRect(boxPadding, boxY, labelWidth, rowHeight)];
    [oauthBox addSubview:mcpUrlLabel];

    self.debugMcpUrlField = [[NSTextField alloc] initWithFrame:NSMakeRect(boxPadding + labelWidth, boxY, controlWidth - 130, 24)];
    self.debugMcpUrlField.placeholderString = @"https://screencontrol.knws.co.uk/mcp/<uuid>";
    self.debugMcpUrlField.font = [NSFont monospacedSystemFontOfSize:11 weight:NSFontWeightRegular];
    [oauthBox addSubview:self.debugMcpUrlField];

    // Discover & Join button
    self.debugDiscoverButton = [[NSButton alloc] initWithFrame:NSMakeRect(controlWidth - 5, boxY - 3, 120, 28)];
    self.debugDiscoverButton.title = @"Discover & Join";
    self.debugDiscoverButton.bezelStyle = NSBezelStyleRounded;
    self.debugDiscoverButton.target = self;
    self.debugDiscoverButton.action = @selector(discoverAndJoinClicked:);
    [oauthBox addSubview:self.debugDiscoverButton];
    boxY -= rowHeight + 5;

    // OAuth status
    self.debugOAuthStatusLabel = [self createLabel:@"OAuth: Not configured"
                                             frame:NSMakeRect(boxPadding, boxY, controlWidth, 20)];
    self.debugOAuthStatusLabel.textColor = [NSColor secondaryLabelColor];
    [oauthBox addSubview:self.debugOAuthStatusLabel];

    y -= 120;

    // ScreenControl Connection Section (Manual/Debug)
    NSBox *connectionBox = [[NSBox alloc] initWithFrame:NSMakeRect(padding, y - 200, tabWidth - padding * 2, 210)];
    connectionBox.title = @"Manual Connection (Debug)";
    connectionBox.titlePosition = NSAtTop;
    [tabView addSubview:connectionBox];

    boxY = 165;

    // Server URL
    NSTextField *urlLabel = [self createLabel:@"Server URL:"
                                        frame:NSMakeRect(boxPadding, boxY, labelWidth, rowHeight)];
    [connectionBox addSubview:urlLabel];

    self.debugServerUrlField = [[NSTextField alloc] initWithFrame:NSMakeRect(boxPadding + labelWidth, boxY, controlWidth - 20, 24)];
    self.debugServerUrlField.placeholderString = @"wss://screencontrol.knws.co.uk/ws";
    self.debugServerUrlField.stringValue = @"wss://screencontrol.knws.co.uk/ws";
    [connectionBox addSubview:self.debugServerUrlField];
    boxY -= rowHeight + 5;

    // Endpoint UUID (simulates stamped build)
    NSTextField *endpointLabel = [self createLabel:@"Endpoint UUID:"
                                             frame:NSMakeRect(boxPadding, boxY, labelWidth, rowHeight)];
    [connectionBox addSubview:endpointLabel];

    self.debugEndpointUuidField = [[NSTextField alloc] initWithFrame:NSMakeRect(boxPadding + labelWidth, boxY, controlWidth - 20, 24)];
    self.debugEndpointUuidField.placeholderString = @"From MCP connection in dashboard";
    self.debugEndpointUuidField.font = [NSFont monospacedSystemFontOfSize:11 weight:NSFontWeightRegular];
    [connectionBox addSubview:self.debugEndpointUuidField];
    boxY -= rowHeight + 5;

    // Customer ID (optional)
    NSTextField *customerLabel = [self createLabel:@"Customer ID:"
                                             frame:NSMakeRect(boxPadding, boxY, labelWidth, rowHeight)];
    [connectionBox addSubview:customerLabel];

    self.debugCustomerIdField = [[NSTextField alloc] initWithFrame:NSMakeRect(boxPadding + labelWidth, boxY, controlWidth - 20, 24)];
    self.debugCustomerIdField.placeholderString = @"Optional - User ID from dashboard";
    self.debugCustomerIdField.font = [NSFont monospacedSystemFontOfSize:11 weight:NSFontWeightRegular];
    [connectionBox addSubview:self.debugCustomerIdField];
    boxY -= rowHeight + 10;

    // Connect/Disconnect buttons
    self.debugConnectButton = [[NSButton alloc] initWithFrame:NSMakeRect(boxPadding, boxY, 100, 32)];
    self.debugConnectButton.title = @"Connect";
    self.debugConnectButton.bezelStyle = NSBezelStyleRounded;
    self.debugConnectButton.target = self;
    self.debugConnectButton.action = @selector(debugConnect:);
    [connectionBox addSubview:self.debugConnectButton];

    self.debugDisconnectButton = [[NSButton alloc] initWithFrame:NSMakeRect(boxPadding + 110, boxY, 100, 32)];
    self.debugDisconnectButton.title = @"Disconnect";
    self.debugDisconnectButton.bezelStyle = NSBezelStyleRounded;
    self.debugDisconnectButton.target = self;
    self.debugDisconnectButton.action = @selector(debugDisconnect:);
    self.debugDisconnectButton.enabled = NO;
    [connectionBox addSubview:self.debugDisconnectButton];

    // Reconnect button (for forcing immediate reconnection)
    self.debugReconnectButton = [[NSButton alloc] initWithFrame:NSMakeRect(boxPadding + 220, boxY, 100, 32)];
    self.debugReconnectButton.title = @"Reconnect";
    self.debugReconnectButton.bezelStyle = NSBezelStyleRounded;
    self.debugReconnectButton.target = self;
    self.debugReconnectButton.action = @selector(debugReconnectClicked:);
    self.debugReconnectButton.enabled = NO;  // Enabled when connected or during reconnect attempts
    [connectionBox addSubview:self.debugReconnectButton];

    // Save Settings button
    NSButton *saveSettingsButton = [[NSButton alloc] initWithFrame:NSMakeRect(boxPadding + 330, boxY, 70, 32)];
    saveSettingsButton.title = @"Save";
    saveSettingsButton.bezelStyle = NSBezelStyleRounded;
    saveSettingsButton.target = self;
    saveSettingsButton.action = @selector(debugSaveSettingsClicked:);
    [connectionBox addSubview:saveSettingsButton];

    // Copy MCP URL button
    NSButton *copyMcpUrlButton = [[NSButton alloc] initWithFrame:NSMakeRect(boxPadding + 410, boxY, 110, 32)];
    copyMcpUrlButton.title = @"Copy MCP URL";
    copyMcpUrlButton.bezelStyle = NSBezelStyleRounded;
    copyMcpUrlButton.target = self;
    copyMcpUrlButton.action = @selector(copyMcpUrl:);
    [connectionBox addSubview:copyMcpUrlButton];
    boxY -= rowHeight + 5;

    // Connect on startup checkbox
    self.debugConnectOnStartupCheckbox = [[NSButton alloc] initWithFrame:NSMakeRect(boxPadding, boxY, controlWidth, 20)];
    self.debugConnectOnStartupCheckbox.title = @"Connect automatically on app startup";
    [self.debugConnectOnStartupCheckbox setButtonType:NSButtonTypeSwitch];
    self.debugConnectOnStartupCheckbox.state = [[NSUserDefaults standardUserDefaults] boolForKey:@"debugConnectOnStartup"] ? NSControlStateValueOn : NSControlStateValueOff;
    [connectionBox addSubview:self.debugConnectOnStartupCheckbox];
    boxY -= rowHeight + 5;

    // Connection status
    self.debugConnectionStatusLabel = [self createLabel:@"Status: Not connected"
                                                  frame:NSMakeRect(boxPadding, boxY, controlWidth, 20)];
    self.debugConnectionStatusLabel.textColor = [NSColor secondaryLabelColor];
    [connectionBox addSubview:self.debugConnectionStatusLabel];

    y -= 220;

    // Status Section
    NSBox *statusBox = [[NSBox alloc] initWithFrame:NSMakeRect(padding, y - 80, tabWidth - padding * 2, 90)];
    statusBox.title = @"Agent Status";
    statusBox.titlePosition = NSAtTop;
    [tabView addSubview:statusBox];

    boxY = 45;

    self.debugLicenseStatusLabel = [self createLabel:@"License: --"
                                               frame:NSMakeRect(boxPadding, boxY, controlWidth, 20)];
    [statusBox addSubview:self.debugLicenseStatusLabel];
    boxY -= 25;

    self.debugAgentIdLabel = [self createLabel:@"Agent ID: --"
                                         frame:NSMakeRect(boxPadding, boxY, controlWidth, 20)];
    self.debugAgentIdLabel.font = [NSFont monospacedSystemFontOfSize:11 weight:NSFontWeightRegular];
    [statusBox addSubview:self.debugAgentIdLabel];

    y -= 100;

    // Log Section
    NSBox *logBox = [[NSBox alloc] initWithFrame:NSMakeRect(padding, 20, tabWidth - padding * 2, y - 30)];
    logBox.title = @"Connection Log";
    logBox.titlePosition = NSAtTop;
    [tabView addSubview:logBox];

    NSScrollView *logScrollView = [[NSScrollView alloc] initWithFrame:NSMakeRect(10, 10, logBox.frame.size.width - 20, logBox.frame.size.height - 35)];
    logScrollView.hasVerticalScroller = YES;
    logScrollView.autohidesScrollers = YES;
    logScrollView.borderType = NSBezelBorder;

    self.debugLogView = [[NSTextView alloc] initWithFrame:NSMakeRect(0, 0, logScrollView.contentSize.width, logScrollView.contentSize.height)];
    self.debugLogTextView = self.debugLogView;  // Alias for TestServer
    self.debugLogView.editable = NO;
    self.debugLogView.font = [NSFont monospacedSystemFontOfSize:10 weight:NSFontWeightRegular];
    self.debugLogView.backgroundColor = [NSColor textBackgroundColor];
    [self.debugLogView setAutoresizingMask:NSViewWidthSizable | NSViewHeightSizable];
    logScrollView.documentView = self.debugLogView;
    [logBox addSubview:logScrollView];

    return tabView;
}

#pragma mark - Debug WebSocket Connection

- (NSString *)getMachineId {
    // Get hardware UUID as machine ID
    io_service_t platformExpert = IOServiceGetMatchingService(kIOMasterPortDefault, IOServiceMatching("IOPlatformExpertDevice"));
    if (platformExpert) {
        CFTypeRef serialNumberAsCFString = IORegistryEntryCreateCFProperty(platformExpert, CFSTR(kIOPlatformUUIDKey), kCFAllocatorDefault, 0);
        IOObjectRelease(platformExpert);
        if (serialNumberAsCFString) {
            NSString *uuid = (__bridge_transfer NSString *)serialNumberAsCFString;
            return uuid;
        }
    }
    return [[NSUUID UUID] UUIDString]; // Fallback
}

- (void)debugLog:(NSString *)message {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
        formatter.dateFormat = @"HH:mm:ss";
        NSString *timestamp = [formatter stringFromDate:[NSDate date]];
        NSString *logLine = [NSString stringWithFormat:@"[%@] %@\n", timestamp, message];

        NSAttributedString *attrStr = [[NSAttributedString alloc] initWithString:logLine attributes:@{
            NSFontAttributeName: [NSFont monospacedSystemFontOfSize:10 weight:NSFontWeightRegular],
            NSForegroundColorAttributeName: [NSColor textColor]
        }];
        [[self.debugLogView textStorage] appendAttributedString:attrStr];
        [self.debugLogView scrollRangeToVisible:NSMakeRange(self.debugLogView.string.length, 0)];
    });
}

- (void)debugConnect:(id)sender {
    // Cancel any pending reconnect
    [self debugCancelReconnect];

    NSString *serverUrl = self.debugServerUrlField.stringValue;
    if (serverUrl.length == 0) {
        serverUrl = @"wss://screencontrol.knws.co.uk/ws";
    }

    [self debugLog:[NSString stringWithFormat:@"Connecting to %@...", serverUrl]];

    NSURL *url = [NSURL URLWithString:serverUrl];
    if (!url) {
        [self debugLog:@"ERROR: Invalid URL"];
        return;
    }

    NSURLSessionConfiguration *config = [NSURLSessionConfiguration defaultSessionConfiguration];
    self.debugSession = [NSURLSession sessionWithConfiguration:config];

    self.debugWebSocketTask = [self.debugSession webSocketTaskWithURL:url];

    // Start receiving messages
    [self debugReceiveMessage];

    // Resume the task to start connection
    [self.debugWebSocketTask resume];

    // Update UI
    self.debugConnectButton.enabled = NO;
    self.debugDisconnectButton.enabled = YES;
    self.debugReconnectButton.enabled = NO;
    self.debugConnectionStatusLabel.stringValue = @"Status: Connecting...";
    self.debugConnectionStatusLabel.textColor = [NSColor systemOrangeColor];

    // Send registration after a brief delay to ensure connection is established
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 500 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
        [self debugSendRegistration];
    });
}

- (void)debugDisconnect:(id)sender {
    [self debugLog:@"Disconnecting..."];

    // Disable auto-reconnect when manually disconnecting
    self.debugAutoReconnectEnabled = NO;
    [self debugCancelReconnect];

    // Stop heartbeat timer
    [self.debugHeartbeatTimer invalidate];
    self.debugHeartbeatTimer = nil;

    // Close WebSocket
    [self.debugWebSocketTask cancelWithCloseCode:NSURLSessionWebSocketCloseCodeNormalClosure reason:nil];
    self.debugWebSocketTask = nil;

    // Invalidate session to clean up resources
    [self.debugSession invalidateAndCancel];
    self.debugSession = nil;

    self.debugIsConnected = NO;

    // Update UI
    dispatch_async(dispatch_get_main_queue(), ^{
        self.debugConnectButton.enabled = YES;
        self.debugDisconnectButton.enabled = NO;
        self.debugReconnectButton.enabled = NO;
        self.debugConnectionStatusLabel.stringValue = @"Status: Disconnected";
        self.debugConnectionStatusLabel.textColor = [NSColor secondaryLabelColor];
        self.debugLicenseStatusLabel.stringValue = @"License: --";
        self.debugAgentIdLabel.stringValue = @"Agent ID: --";

        // Update General tab connection status
        self.connectionStatusLabel.stringValue = @"Status: Not connected";
        self.connectionStatusLabel.textColor = [NSColor secondaryLabelColor];
        self.connectButton.enabled = YES;
    });

    [self debugLog:@"Disconnected"];
}

#pragma mark - Auto-Reconnect

- (void)debugScheduleReconnect {
    // Calculate delay with exponential backoff: 5s, 10s, 20s, 40s, max 60s
    NSTimeInterval baseDelay = 5.0;
    NSTimeInterval delay = MIN(baseDelay * pow(2, self.debugReconnectAttempt), 60.0);

    self.debugReconnectAttempt++;

    [self debugLog:[NSString stringWithFormat:@"Scheduling reconnect attempt %ld in %.0f seconds...", (long)self.debugReconnectAttempt, delay]];

    self.debugConnectionStatusLabel.stringValue = [NSString stringWithFormat:@"Status: Reconnecting in %.0fs (attempt %ld)", delay, (long)self.debugReconnectAttempt];
    self.debugConnectionStatusLabel.textColor = [NSColor systemOrangeColor];

    // Cancel existing timer if any
    [self.debugReconnectTimer invalidate];

    // Schedule reconnect
    __weak typeof(self) weakSelf = self;
    self.debugReconnectTimer = [NSTimer scheduledTimerWithTimeInterval:delay repeats:NO block:^(NSTimer *timer) {
        [weakSelf debugLog:@"Attempting reconnect..."];
        [weakSelf debugConnect:nil];
    }];
}

- (void)debugCancelReconnect {
    [self.debugReconnectTimer invalidate];
    self.debugReconnectTimer = nil;
    self.debugReconnectAttempt = 0;
}

- (IBAction)debugReconnectClicked:(id)sender {
    [self debugLog:@"Manual reconnect requested"];
    [self debugCancelReconnect];
    self.debugAutoReconnectEnabled = YES;  // Re-enable auto-reconnect
    [self debugConnect:nil];
}

#pragma mark - OAuth Discovery and Connection

- (void)discoverAndJoinClicked:(id)sender {
    NSString *mcpUrl = self.debugMcpUrlField.stringValue;
    if (mcpUrl.length == 0) {
        [self debugLog:@"ERROR: Please enter an MCP URL"];
        self.debugOAuthStatusLabel.stringValue = @"OAuth: Enter MCP URL first";
        self.debugOAuthStatusLabel.textColor = [NSColor systemRedColor];
        return;
    }

    [self debugLog:[NSString stringWithFormat:@"Discovering OAuth from: %@", mcpUrl]];
    self.debugOAuthStatusLabel.stringValue = @"OAuth: Discovering...";
    self.debugOAuthStatusLabel.textColor = [NSColor systemOrangeColor];
    self.debugDiscoverButton.enabled = NO;

    [self discoverOAuthFromMcpUrl:mcpUrl];
}

- (void)discoverOAuthFromMcpUrl:(NSString *)mcpUrl {
    // Parse the MCP URL to extract base URL and endpoint UUID
    // Format: https://screencontrol.knws.co.uk/mcp/<uuid>
    NSURL *url = [NSURL URLWithString:mcpUrl];
    if (!url) {
        [self debugLog:@"ERROR: Invalid MCP URL format"];
        dispatch_async(dispatch_get_main_queue(), ^{
            self.debugOAuthStatusLabel.stringValue = @"OAuth: Invalid URL";
            self.debugOAuthStatusLabel.textColor = [NSColor systemRedColor];
            self.debugDiscoverButton.enabled = YES;
        });
        return;
    }

    // Extract base URL and UUID from path
    NSString *scheme = url.scheme;
    NSString *host = url.host;
    NSNumber *port = url.port;
    NSString *path = url.path;

    // Build base URL
    NSString *baseUrl;
    if (port) {
        baseUrl = [NSString stringWithFormat:@"%@://%@:%@", scheme, host, port];
    } else {
        baseUrl = [NSString stringWithFormat:@"%@://%@", scheme, host];
    }
    self.mcpBaseUrl = baseUrl;

    // Extract UUID from path (e.g., /mcp/cmivv9aar000310vcfp9lg0qj)
    NSArray *pathComponents = [path componentsSeparatedByString:@"/"];
    if (pathComponents.count >= 3 && [pathComponents[1] isEqualToString:@"mcp"]) {
        self.mcpEndpointUuid = pathComponents[2];
        [self debugLog:[NSString stringWithFormat:@"Extracted UUID: %@", self.mcpEndpointUuid]];
    } else {
        [self debugLog:@"WARNING: Could not extract UUID from path"];
    }

    // Fetch OAuth discovery document from .well-known endpoint
    NSString *discoveryUrl = [NSString stringWithFormat:@"%@/.well-known/oauth-authorization-server", baseUrl];
    [self debugLog:[NSString stringWithFormat:@"Fetching: %@", discoveryUrl]];

    NSURL *discoverURL = [NSURL URLWithString:discoveryUrl];
    NSURLSessionDataTask *task = [self.urlSession dataTaskWithURL:discoverURL completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error) {
            [self debugLog:[NSString stringWithFormat:@"ERROR: Discovery failed: %@", error.localizedDescription]];
            dispatch_async(dispatch_get_main_queue(), ^{
                self.debugOAuthStatusLabel.stringValue = @"OAuth: Discovery failed";
                self.debugOAuthStatusLabel.textColor = [NSColor systemRedColor];
                self.debugDiscoverButton.enabled = YES;
            });
            return;
        }

        NSHTTPURLResponse *httpResponse = (NSHTTPURLResponse *)response;
        if (httpResponse.statusCode != 200) {
            [self debugLog:[NSString stringWithFormat:@"ERROR: Discovery returned %ld", (long)httpResponse.statusCode]];
            dispatch_async(dispatch_get_main_queue(), ^{
                self.debugOAuthStatusLabel.stringValue = [NSString stringWithFormat:@"OAuth: HTTP %ld", (long)httpResponse.statusCode];
                self.debugOAuthStatusLabel.textColor = [NSColor systemRedColor];
                self.debugDiscoverButton.enabled = YES;
            });
            return;
        }

        NSError *jsonError;
        NSDictionary *discovery = [NSJSONSerialization JSONObjectWithData:data options:0 error:&jsonError];
        if (jsonError || !discovery) {
            [self debugLog:@"ERROR: Failed to parse discovery JSON"];
            dispatch_async(dispatch_get_main_queue(), ^{
                self.debugOAuthStatusLabel.stringValue = @"OAuth: Invalid JSON";
                self.debugOAuthStatusLabel.textColor = [NSColor systemRedColor];
                self.debugDiscoverButton.enabled = YES;
            });
            return;
        }

        // Extract OAuth endpoints
        self.oauthIssuer = discovery[@"issuer"];
        self.oauthAuthorizationEndpoint = discovery[@"authorization_endpoint"];
        self.oauthTokenEndpoint = discovery[@"token_endpoint"];
        self.oauthRegistrationEndpoint = discovery[@"registration_endpoint"];

        [self debugLog:[NSString stringWithFormat:@"Discovered issuer: %@", self.oauthIssuer]];
        [self debugLog:[NSString stringWithFormat:@"Token endpoint: %@", self.oauthTokenEndpoint]];
        [self debugLog:[NSString stringWithFormat:@"Registration endpoint: %@", self.oauthRegistrationEndpoint]];

        dispatch_async(dispatch_get_main_queue(), ^{
            self.debugOAuthStatusLabel.stringValue = @"OAuth: Discovered, registering...";
            self.debugOAuthStatusLabel.textColor = [NSColor systemOrangeColor];
        });

        // Check if we have stored credentials for this endpoint
        [self loadOAuthCredentialsFromKeychain];

        if (self.oauthClientId && self.oauthClientSecret) {
            [self debugLog:@"Found stored OAuth credentials, requesting token..."];
            [self requestOAuthToken];
        } else {
            [self debugLog:@"No stored credentials, registering new client..."];
            [self registerOAuthClient];
        }
    }];
    [task resume];
}

- (void)registerOAuthClient {
    if (!self.oauthRegistrationEndpoint) {
        [self debugLog:@"ERROR: No registration endpoint discovered"];
        dispatch_async(dispatch_get_main_queue(), ^{
            self.debugOAuthStatusLabel.stringValue = @"OAuth: No registration endpoint";
            self.debugOAuthStatusLabel.textColor = [NSColor systemRedColor];
            self.debugDiscoverButton.enabled = YES;
        });
        return;
    }

    [self debugLog:@"Registering OAuth client..."];

    // Build registration request
    NSString *hostname = [[NSHost currentHost] localizedName];
    NSString *machineId = [self getMachineId];

    NSDictionary *regRequest = @{
        @"client_name": [NSString stringWithFormat:@"ScreenControl Agent - %@", hostname],
        @"grant_types": @[@"client_credentials"],
        @"token_endpoint_auth_method": @"client_secret_basic",
        @"scope": @"mcp:tools mcp:resources mcp:agents:read mcp:agents:write",
        @"software_id": @"screencontrol-agent-macos",
        @"software_version": @"1.0.0",
        @"client_uri": [NSString stringWithFormat:@"local://%@", machineId],
        // Redirect URIs required by server even for client_credentials (localhost allowed)
        @"redirect_uris": @[@"http://localhost/oauth/callback"],
        // Include endpoint UUID if we have it (links this client to the MCP endpoint)
        @"mcp_endpoint_uuid": self.mcpEndpointUuid ?: @""
    };

    NSError *jsonError;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:regRequest options:0 error:&jsonError];
    if (jsonError) {
        [self debugLog:@"ERROR: Failed to serialize registration request"];
        return;
    }

    NSURL *regUrl = [NSURL URLWithString:self.oauthRegistrationEndpoint];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:regUrl];
    request.HTTPMethod = @"POST";
    request.HTTPBody = jsonData;
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];

    NSURLSessionDataTask *task = [self.urlSession dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error) {
            [self debugLog:[NSString stringWithFormat:@"ERROR: Registration failed: %@", error.localizedDescription]];
            dispatch_async(dispatch_get_main_queue(), ^{
                self.debugOAuthStatusLabel.stringValue = @"OAuth: Registration failed";
                self.debugOAuthStatusLabel.textColor = [NSColor systemRedColor];
                self.debugDiscoverButton.enabled = YES;
            });
            return;
        }

        NSHTTPURLResponse *httpResponse = (NSHTTPURLResponse *)response;
        if (httpResponse.statusCode != 201 && httpResponse.statusCode != 200) {
            NSString *responseBody = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
            [self debugLog:[NSString stringWithFormat:@"ERROR: Registration returned %ld: %@", (long)httpResponse.statusCode, responseBody]];
            dispatch_async(dispatch_get_main_queue(), ^{
                self.debugOAuthStatusLabel.stringValue = [NSString stringWithFormat:@"OAuth: Reg failed (%ld)", (long)httpResponse.statusCode];
                self.debugOAuthStatusLabel.textColor = [NSColor systemRedColor];
                self.debugDiscoverButton.enabled = YES;
            });
            return;
        }

        NSError *parseError;
        NSDictionary *regResponse = [NSJSONSerialization JSONObjectWithData:data options:0 error:&parseError];
        if (parseError || !regResponse) {
            [self debugLog:@"ERROR: Failed to parse registration response"];
            dispatch_async(dispatch_get_main_queue(), ^{
                self.debugOAuthStatusLabel.stringValue = @"OAuth: Invalid response";
                self.debugOAuthStatusLabel.textColor = [NSColor systemRedColor];
                self.debugDiscoverButton.enabled = YES;
            });
            return;
        }

        // Extract client credentials
        self.oauthClientId = regResponse[@"client_id"];
        self.oauthClientSecret = regResponse[@"client_secret"];

        if (!self.oauthClientId || !self.oauthClientSecret) {
            [self debugLog:@"ERROR: Registration response missing credentials"];
            dispatch_async(dispatch_get_main_queue(), ^{
                self.debugOAuthStatusLabel.stringValue = @"OAuth: Missing credentials in response";
                self.debugOAuthStatusLabel.textColor = [NSColor systemRedColor];
                self.debugDiscoverButton.enabled = YES;
            });
            return;
        }

        [self debugLog:[NSString stringWithFormat:@"Registered client_id: %@", self.oauthClientId]];

        // Save credentials to keychain
        [self saveOAuthCredentialsToKeychain];

        dispatch_async(dispatch_get_main_queue(), ^{
            self.debugOAuthStatusLabel.stringValue = @"OAuth: Registered, getting token...";
        });

        // Now request an access token
        [self requestOAuthToken];
    }];
    [task resume];
}

- (void)requestOAuthToken {
    if (!self.oauthTokenEndpoint || !self.oauthClientId || !self.oauthClientSecret) {
        [self debugLog:@"ERROR: Missing OAuth configuration for token request"];
        dispatch_async(dispatch_get_main_queue(), ^{
            self.debugOAuthStatusLabel.stringValue = @"OAuth: Missing configuration";
            self.debugOAuthStatusLabel.textColor = [NSColor systemRedColor];
            self.debugDiscoverButton.enabled = YES;
        });
        return;
    }

    [self debugLog:@"Requesting OAuth access token..."];

    // Build token request (client_credentials grant)
    NSString *body = [NSString stringWithFormat:@"grant_type=client_credentials&scope=%@",
                      [@"mcp:tools mcp:resources mcp:agents:read mcp:agents:write" stringByAddingPercentEncodingWithAllowedCharacters:[NSCharacterSet URLQueryAllowedCharacterSet]]];

    NSURL *tokenUrl = [NSURL URLWithString:self.oauthTokenEndpoint];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:tokenUrl];
    request.HTTPMethod = @"POST";
    request.HTTPBody = [body dataUsingEncoding:NSUTF8StringEncoding];
    [request setValue:@"application/x-www-form-urlencoded" forHTTPHeaderField:@"Content-Type"];

    // Add Basic auth header with client credentials
    NSString *credentials = [NSString stringWithFormat:@"%@:%@", self.oauthClientId, self.oauthClientSecret];
    NSData *credData = [credentials dataUsingEncoding:NSUTF8StringEncoding];
    NSString *base64Creds = [credData base64EncodedStringWithOptions:0];
    [request setValue:[NSString stringWithFormat:@"Basic %@", base64Creds] forHTTPHeaderField:@"Authorization"];

    NSURLSessionDataTask *task = [self.urlSession dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error) {
            [self debugLog:[NSString stringWithFormat:@"ERROR: Token request failed: %@", error.localizedDescription]];
            dispatch_async(dispatch_get_main_queue(), ^{
                self.debugOAuthStatusLabel.stringValue = @"OAuth: Token request failed";
                self.debugOAuthStatusLabel.textColor = [NSColor systemRedColor];
                self.debugDiscoverButton.enabled = YES;
            });
            return;
        }

        NSHTTPURLResponse *httpResponse = (NSHTTPURLResponse *)response;
        if (httpResponse.statusCode != 200) {
            NSString *responseBody = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
            [self debugLog:[NSString stringWithFormat:@"ERROR: Token request returned %ld: %@", (long)httpResponse.statusCode, responseBody]];

            // If unauthorized, clear stored credentials and re-register
            if (httpResponse.statusCode == 401) {
                [self debugLog:@"Credentials invalid, clearing and re-registering..."];
                [self clearOAuthCredentials];
                dispatch_async(dispatch_get_main_queue(), ^{
                    self.debugOAuthStatusLabel.stringValue = @"OAuth: Re-registering...";
                });
                [self registerOAuthClient];
                return;
            }

            dispatch_async(dispatch_get_main_queue(), ^{
                self.debugOAuthStatusLabel.stringValue = [NSString stringWithFormat:@"OAuth: Token failed (%ld)", (long)httpResponse.statusCode];
                self.debugOAuthStatusLabel.textColor = [NSColor systemRedColor];
                self.debugDiscoverButton.enabled = YES;
            });
            return;
        }

        NSError *parseError;
        NSDictionary *tokenResponse = [NSJSONSerialization JSONObjectWithData:data options:0 error:&parseError];
        if (parseError || !tokenResponse) {
            [self debugLog:@"ERROR: Failed to parse token response"];
            dispatch_async(dispatch_get_main_queue(), ^{
                self.debugOAuthStatusLabel.stringValue = @"OAuth: Invalid token response";
                self.debugOAuthStatusLabel.textColor = [NSColor systemRedColor];
                self.debugDiscoverButton.enabled = YES;
            });
            return;
        }

        // Extract access token
        self.oauthAccessToken = tokenResponse[@"access_token"];
        NSNumber *expiresIn = tokenResponse[@"expires_in"];

        if (!self.oauthAccessToken) {
            [self debugLog:@"ERROR: Token response missing access_token"];
            dispatch_async(dispatch_get_main_queue(), ^{
                self.debugOAuthStatusLabel.stringValue = @"OAuth: No token in response";
                self.debugOAuthStatusLabel.textColor = [NSColor systemRedColor];
                self.debugDiscoverButton.enabled = YES;
            });
            return;
        }

        // Calculate token expiry and schedule refresh
        if (expiresIn) {
            self.oauthTokenExpiry = [NSDate dateWithTimeIntervalSinceNow:expiresIn.doubleValue];
            [self debugLog:[NSString stringWithFormat:@"Token expires in %@ seconds", expiresIn]];

            // Schedule token refresh at 90% of expiry time (or 5 minutes before, whichever is less)
            NSTimeInterval refreshDelay = MIN(expiresIn.doubleValue * 0.9, expiresIn.doubleValue - 300);
            if (refreshDelay < 60) refreshDelay = 60; // At minimum, wait 60 seconds before refresh

            dispatch_async(dispatch_get_main_queue(), ^{
                [self.oauthRefreshTimer invalidate];
                self.oauthRefreshTimer = [NSTimer scheduledTimerWithTimeInterval:refreshDelay
                                                                          target:self
                                                                        selector:@selector(oauthRefreshTokenIfNeeded)
                                                                        userInfo:nil
                                                                         repeats:NO];
                [self debugLog:[NSString stringWithFormat:@"Scheduled token refresh in %.0f seconds", refreshDelay]];
            });
        }

        [self debugLog:@"OAuth token obtained successfully!"];

        dispatch_async(dispatch_get_main_queue(), ^{
            self.debugOAuthStatusLabel.stringValue = @"OAuth: Connected!";
            self.debugOAuthStatusLabel.textColor = [NSColor systemGreenColor];
            self.debugDiscoverButton.enabled = YES;

            // Auto-fill the manual connection fields
            if (self.mcpBaseUrl) {
                self.debugServerUrlField.stringValue = [NSString stringWithFormat:@"%@/ws", [self.mcpBaseUrl stringByReplacingOccurrencesOfString:@"http://" withString:@"ws://"]];
                self.debugServerUrlField.stringValue = [self.debugServerUrlField.stringValue stringByReplacingOccurrencesOfString:@"https://" withString:@"wss://"];
            }
            if (self.mcpEndpointUuid) {
                self.debugEndpointUuidField.stringValue = self.mcpEndpointUuid;
            }
        });

        // Connect using the OAuth token
        [self connectWithOAuthToken];
    }];
    [task resume];
}

- (void)oauthRefreshTokenIfNeeded {
    [self debugLog:@"Token refresh timer fired - checking if refresh needed..."];

    // Check if we have the necessary credentials to refresh
    if (!self.oauthTokenEndpoint || !self.oauthClientId || !self.oauthClientSecret) {
        [self debugLog:@"Cannot refresh token - missing OAuth configuration"];
        return;
    }

    // Check if token is actually expiring soon (within 5 minutes)
    if (self.oauthTokenExpiry) {
        NSTimeInterval timeUntilExpiry = [self.oauthTokenExpiry timeIntervalSinceNow];
        [self debugLog:[NSString stringWithFormat:@"Token expires in %.0f seconds", timeUntilExpiry]];

        if (timeUntilExpiry > 300) {
            [self debugLog:@"Token not expiring soon, skipping refresh"];
            return;
        }
    }

    dispatch_async(dispatch_get_main_queue(), ^{
        self.debugOAuthStatusLabel.stringValue = @"OAuth: Refreshing token...";
        self.debugOAuthStatusLabel.textColor = [NSColor systemOrangeColor];
    });

    [self debugLog:@"Refreshing OAuth token..."];
    [self requestOAuthToken];
}

- (void)connectWithOAuthToken {
    if (!self.oauthAccessToken) {
        [self debugLog:@"ERROR: No OAuth token available"];
        return;
    }

    [self debugLog:@"Connecting with OAuth token..."];

    // Build WebSocket URL with token
    NSString *wsUrl = self.debugServerUrlField.stringValue;
    if (wsUrl.length == 0 && self.mcpBaseUrl) {
        wsUrl = [NSString stringWithFormat:@"%@/ws", [self.mcpBaseUrl stringByReplacingOccurrencesOfString:@"http://" withString:@"ws://"]];
        wsUrl = [wsUrl stringByReplacingOccurrencesOfString:@"https://" withString:@"wss://"];
    }

    dispatch_async(dispatch_get_main_queue(), ^{
        self.debugServerUrlField.stringValue = wsUrl;

        // Set endpoint UUID
        if (self.mcpEndpointUuid) {
            self.debugEndpointUuidField.stringValue = self.mcpEndpointUuid;
        }

        // Trigger connection
        [self debugConnect:nil];
    });
}

#pragma mark - Keychain Helpers

static NSString * const kKeychainService = @"com.screencontrol.agent.oauth";

- (void)saveOAuthCredentialsToKeychain {
    if (!self.oauthClientId || !self.oauthClientSecret || !self.mcpBaseUrl) return;

    [self debugLog:@"Saving OAuth credentials to Keychain..."];

    // Create a unique account name based on the server URL
    NSString *account = [NSString stringWithFormat:@"%@::%@", self.mcpBaseUrl, self.mcpEndpointUuid ?: @"default"];

    // Store credentials as JSON
    NSDictionary *credentials = @{
        @"client_id": self.oauthClientId,
        @"client_secret": self.oauthClientSecret,
        @"endpoint_uuid": self.mcpEndpointUuid ?: @"",
        @"base_url": self.mcpBaseUrl
    };

    NSError *jsonError;
    NSData *credData = [NSJSONSerialization dataWithJSONObject:credentials options:0 error:&jsonError];
    if (jsonError) {
        [self debugLog:@"ERROR: Failed to serialize credentials for Keychain"];
        return;
    }

    // Delete any existing item first
    NSDictionary *deleteQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrService: kKeychainService,
        (__bridge id)kSecAttrAccount: account
    };
    SecItemDelete((__bridge CFDictionaryRef)deleteQuery);

    // Add new item
    NSDictionary *addQuery = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrService: kKeychainService,
        (__bridge id)kSecAttrAccount: account,
        (__bridge id)kSecValueData: credData,
        (__bridge id)kSecAttrAccessible: (__bridge id)kSecAttrAccessibleAfterFirstUnlock
    };

    OSStatus status = SecItemAdd((__bridge CFDictionaryRef)addQuery, NULL);
    if (status == errSecSuccess) {
        [self debugLog:@"OAuth credentials saved to Keychain"];
    } else {
        [self debugLog:[NSString stringWithFormat:@"WARNING: Failed to save to Keychain (status: %d)", (int)status]];
    }
}

- (void)loadOAuthCredentialsFromKeychain {
    if (!self.mcpBaseUrl) return;

    NSString *account = [NSString stringWithFormat:@"%@::%@", self.mcpBaseUrl, self.mcpEndpointUuid ?: @"default"];

    NSDictionary *query = @{
        (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
        (__bridge id)kSecAttrService: kKeychainService,
        (__bridge id)kSecAttrAccount: account,
        (__bridge id)kSecReturnData: @YES,
        (__bridge id)kSecMatchLimit: (__bridge id)kSecMatchLimitOne
    };

    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &result);

    if (status == errSecSuccess && result) {
        NSData *credData = (__bridge_transfer NSData *)result;
        NSError *jsonError;
        NSDictionary *credentials = [NSJSONSerialization JSONObjectWithData:credData options:0 error:&jsonError];

        if (!jsonError && credentials) {
            self.oauthClientId = credentials[@"client_id"];
            self.oauthClientSecret = credentials[@"client_secret"];
            [self debugLog:[NSString stringWithFormat:@"Loaded OAuth credentials from Keychain for %@", account]];
        }
    } else {
        [self debugLog:@"No stored OAuth credentials found"];
    }
}

- (void)clearOAuthCredentials {
    self.oauthClientId = nil;
    self.oauthClientSecret = nil;
    self.oauthAccessToken = nil;
    self.oauthTokenExpiry = nil;

    // Cancel any pending token refresh
    [self.oauthRefreshTimer invalidate];
    self.oauthRefreshTimer = nil;

    if (self.mcpBaseUrl) {
        NSString *account = [NSString stringWithFormat:@"%@::%@", self.mcpBaseUrl, self.mcpEndpointUuid ?: @"default"];

        NSDictionary *deleteQuery = @{
            (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
            (__bridge id)kSecAttrService: kKeychainService,
            (__bridge id)kSecAttrAccount: account
        };
        SecItemDelete((__bridge CFDictionaryRef)deleteQuery);
        [self debugLog:@"Cleared OAuth credentials from Keychain"];
    }
}

- (void)debugSendRegistration {
    if (!self.debugWebSocketTask) return;

    NSString *machineId = [self getMachineId];
    NSString *hostname = [[NSHost currentHost] localizedName];
    NSString *endpointUuid = self.debugEndpointUuidField.stringValue;
    NSString *customerId = self.debugCustomerIdField.stringValue;
    NSString *agentSecret = self.apiKeyField.stringValue;

    // Build registration message matching server expectations
    NSMutableDictionary *message = [NSMutableDictionary dictionary];
    message[@"type"] = @"register";
    message[@"machineId"] = machineId;
    message[@"machineName"] = hostname;
    message[@"osType"] = @"darwin";
    message[@"osVersion"] = [[NSProcessInfo processInfo] operatingSystemVersionString];
    message[@"arch"] = @"arm64"; // or detect properly
    message[@"agentVersion"] = @"1.0.0-debug";

    if (endpointUuid.length > 0) {
        message[@"licenseUuid"] = endpointUuid;
    }
    if (customerId.length > 0) {
        message[@"customerId"] = customerId;
    }

    // Include agent secret for server-side authentication
    // Server stores this on first registration and validates on reconnection
    // This ensures the agent can re-establish connection after token expiry
    if (agentSecret.length > 0) {
        message[@"agentSecret"] = agentSecret;
    }

    // Add fingerprint info (simplified for debug mode)
    message[@"fingerprint"] = @{
        @"hostname": hostname,
        @"cpuModel": @"Apple Silicon",
        @"macAddresses": @[@"debug-mode"]
    };

    NSError *error;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:message options:0 error:&error];
    if (error) {
        [self debugLog:[NSString stringWithFormat:@"ERROR: Failed to serialize registration: %@", error]];
        return;
    }

    NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
    [self debugLog:[NSString stringWithFormat:@"→ REGISTER: %@", hostname]];

    NSURLSessionWebSocketMessage *wsMessage = [[NSURLSessionWebSocketMessage alloc] initWithString:jsonString];
    __weak typeof(self) weakSelf = self;
    [self.debugWebSocketTask sendMessage:wsMessage completionHandler:^(NSError *error) {
        if (error && weakSelf) {
            [weakSelf debugLog:[NSString stringWithFormat:@"ERROR sending registration: %@", error.localizedDescription]];
        }
    }];
}

- (void)debugSendHeartbeat {
    if (!self.debugWebSocketTask || !self.debugIsConnected) return;

    NSDictionary *message = @{
        @"type": @"heartbeat",
        @"timestamp": @([[NSDate date] timeIntervalSince1970] * 1000),
        @"powerState": @"ACTIVE",
        @"isScreenLocked": @([self isScreenLocked])
    };

    NSError *error;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:message options:0 error:&error];
    if (error) return;

    NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];

    NSURLSessionWebSocketMessage *wsMessage = [[NSURLSessionWebSocketMessage alloc] initWithString:jsonString];
    __weak typeof(self) weakSelf = self;
    [self.debugWebSocketTask sendMessage:wsMessage completionHandler:^(NSError *error) {
        if (!weakSelf) return;
        if (error) {
            [weakSelf debugLog:[NSString stringWithFormat:@"ERROR sending heartbeat: %@", error.localizedDescription]];
        } else {
            [weakSelf debugLog:@"→ HEARTBEAT"];
        }
    }];
}

- (void)debugReceiveMessage {
    if (!self.debugWebSocketTask) return;

    __weak typeof(self) weakSelf = self;
    [self.debugWebSocketTask receiveMessageWithCompletionHandler:^(NSURLSessionWebSocketMessage *message, NSError *error) {
        if (error) {
            [weakSelf debugLog:[NSString stringWithFormat:@"ERROR: WebSocket error: %@", error.localizedDescription]];

            dispatch_async(dispatch_get_main_queue(), ^{
                weakSelf.debugIsConnected = NO;
                weakSelf.debugConnectButton.enabled = YES;
                weakSelf.debugDisconnectButton.enabled = NO;
                weakSelf.debugReconnectButton.enabled = YES;  // Enable reconnect button
                weakSelf.debugConnectionStatusLabel.stringValue = @"Status: Connection failed";
                weakSelf.debugConnectionStatusLabel.textColor = [NSColor systemRedColor];
                [weakSelf.debugHeartbeatTimer invalidate];
                weakSelf.debugHeartbeatTimer = nil;

                // Update General tab connection status
                weakSelf.connectionStatusLabel.stringValue = @"Status: Connection failed";
                weakSelf.connectionStatusLabel.textColor = [NSColor systemRedColor];
                weakSelf.connectButton.enabled = YES;

                // Trigger auto-reconnect if enabled
                if (weakSelf.debugAutoReconnectEnabled) {
                    [weakSelf debugScheduleReconnect];
                }
            });
            return;
        }

        if (message.type == NSURLSessionWebSocketMessageTypeString) {
            NSString *text = message.string;
            NSData *data = [text dataUsingEncoding:NSUTF8StringEncoding];
            NSError *jsonError;
            NSDictionary *json = [NSJSONSerialization JSONObjectWithData:data options:0 error:&jsonError];

            if (json) {
                NSString *type = json[@"type"];

                if ([type isEqualToString:@"registered"]) {
                    [weakSelf debugLog:[NSString stringWithFormat:@"← REGISTERED: license=%@", json[@"licenseStatus"]]];

                    dispatch_async(dispatch_get_main_queue(), ^{
                        weakSelf.debugIsConnected = YES;
                        weakSelf.debugReconnectAttempt = 0;  // Reset reconnect attempts on success
                        weakSelf.debugReconnectButton.enabled = YES;  // Enable reconnect for manual force-reconnect
                        weakSelf.debugConnectionStatusLabel.stringValue = @"Status: Connected";
                        weakSelf.debugConnectionStatusLabel.textColor = [NSColor systemGreenColor];

                        // Update General tab connection status
                        weakSelf.connectionStatusLabel.stringValue = @"Status: Connected";
                        weakSelf.connectionStatusLabel.textColor = [NSColor systemGreenColor];
                        weakSelf.connectButton.enabled = YES;

                        NSString *licenseStatus = json[@"licenseStatus"] ?: @"unknown";
                        weakSelf.debugLicenseStatusLabel.stringValue = [NSString stringWithFormat:@"License: %@", [licenseStatus uppercaseString]];

                        if ([licenseStatus isEqualToString:@"active"]) {
                            weakSelf.debugLicenseStatusLabel.textColor = [NSColor systemGreenColor];
                        } else if ([licenseStatus isEqualToString:@"pending"]) {
                            weakSelf.debugLicenseStatusLabel.textColor = [NSColor systemOrangeColor];
                        } else {
                            weakSelf.debugLicenseStatusLabel.textColor = [NSColor systemRedColor];
                        }

                        NSString *agentId = json[@"agentId"] ?: @"--";
                        weakSelf.debugAgentIdLabel.stringValue = [NSString stringWithFormat:@"Agent ID: %@", agentId];

                        // Start heartbeat timer
                        NSInteger heartbeatInterval = [json[@"config"][@"heartbeatInterval"] integerValue] ?: 5000;
                        weakSelf.debugHeartbeatTimer = [NSTimer scheduledTimerWithTimeInterval:heartbeatInterval / 1000.0
                                                                                        target:weakSelf
                                                                                      selector:@selector(debugSendHeartbeat)
                                                                                      userInfo:nil
                                                                                       repeats:YES];
                    });

                } else if ([type isEqualToString:@"heartbeat_ack"]) {
                    NSString *licenseStatus = json[@"licenseStatus"] ?: @"unknown";
                    [weakSelf debugLog:[NSString stringWithFormat:@"← HEARTBEAT_ACK: license=%@", licenseStatus]];

                    dispatch_async(dispatch_get_main_queue(), ^{
                        weakSelf.debugLicenseStatusLabel.stringValue = [NSString stringWithFormat:@"License: %@", [licenseStatus uppercaseString]];
                        if ([licenseStatus isEqualToString:@"active"]) {
                            weakSelf.debugLicenseStatusLabel.textColor = [NSColor systemGreenColor];
                        } else if ([licenseStatus isEqualToString:@"pending"]) {
                            weakSelf.debugLicenseStatusLabel.textColor = [NSColor systemOrangeColor];
                        } else {
                            weakSelf.debugLicenseStatusLabel.textColor = [NSColor systemRedColor];
                        }
                    });

                } else if ([type isEqualToString:@"ping"]) {
                    [weakSelf debugLog:@"← PING (server keepalive)"];

                } else if ([type isEqualToString:@"request"]) {
                    NSString *method = json[@"method"] ?: @"unknown";
                    [weakSelf debugLog:[NSString stringWithFormat:@"← REQUEST: %@", method]];

                    // Send a basic response
                    NSDictionary *response = @{
                        @"type": @"response",
                        @"id": json[@"id"] ?: @"",
                        @"result": @{@"status": @"debug-mode"}
                    };
                    NSData *respData = [NSJSONSerialization dataWithJSONObject:response options:0 error:nil];
                    NSString *respString = [[NSString alloc] initWithData:respData encoding:NSUTF8StringEncoding];
                    NSURLSessionWebSocketMessage *respMsg = [[NSURLSessionWebSocketMessage alloc] initWithString:respString];
                    if (weakSelf.debugWebSocketTask) {
                        [weakSelf.debugWebSocketTask sendMessage:respMsg completionHandler:^(NSError *error) {
                            // Ignore errors - just for cleanup
                        }];
                    }

                } else if ([type isEqualToString:@"wake"]) {
                    [weakSelf debugLog:[NSString stringWithFormat:@"← WAKE: reason=%@", json[@"reason"]]];

                } else {
                    [weakSelf debugLog:[NSString stringWithFormat:@"← %@: %@", type, text]];
                }
            } else {
                [weakSelf debugLog:[NSString stringWithFormat:@"← RAW: %@", text]];
            }
        }

        // Continue receiving
        [weakSelf debugReceiveMessage];
    }];
}

- (NSTextField *)createLabel:(NSString *)text frame:(NSRect)frame {
    NSTextField *label = [[NSTextField alloc] initWithFrame:frame];
    label.stringValue = text;
    label.bezeled = NO;
    label.drawsBackground = NO;
    label.editable = NO;
    label.selectable = NO;
    return label;
}

#pragma mark - Settings Management

- (NSString *)loadSetting:(NSString *)key defaultValue:(NSString *)defaultValue {
    NSString *value = [[NSUserDefaults standardUserDefaults] stringForKey:key];
    return value ?: defaultValue;
}

- (void)saveSetting:(NSString *)key value:(NSString *)value {
    [[NSUserDefaults standardUserDefaults] setObject:value forKey:key];
    [[NSUserDefaults standardUserDefaults] synchronize];
}

- (NSString *)loadOrGenerateAPIKey {
    NSString *key = [[NSUserDefaults standardUserDefaults] stringForKey:kAPIKeyKey];
    if (!key || key.length == 0) {
        key = [self generateAPIKey];
        [self saveSetting:kAPIKeyKey value:key];
    }
    return key;
}

- (NSString *)generateAPIKey {
    NSMutableData *data = [NSMutableData dataWithLength:32];
    OSStatus status = SecRandomCopyBytes(kSecRandomDefault, 32, data.mutableBytes);
    if (status != errSecSuccess) {
        NSLog(@"Warning: SecRandomCopyBytes failed with status %d", (int)status);
    }

    NSMutableString *hexString = [NSMutableString stringWithCapacity:64];
    const unsigned char *bytes = data.bytes;
    for (int i = 0; i < 32; i++) {
        [hexString appendFormat:@"%02x", bytes[i]];
    }
    return hexString;
}

#pragma mark - Tools Configuration Management

- (NSString *)getToolsConfigPath {
    NSArray *paths = NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES);
    NSString *appSupportDir = [paths firstObject];
    NSString *screenControlDir = [appSupportDir stringByAppendingPathComponent:@"ScreenControl"];

    // Create directory if it doesn't exist
    NSFileManager *fileManager = [NSFileManager defaultManager];
    if (![fileManager fileExistsAtPath:screenControlDir]) {
        [fileManager createDirectoryAtPath:screenControlDir withIntermediateDirectories:YES attributes:nil error:nil];
    }

    return [screenControlDir stringByAppendingPathComponent:kToolsConfigFilename];
}

- (void)loadToolsConfig {
    NSString *configPath = [self getToolsConfigPath];
    NSFileManager *fileManager = [NSFileManager defaultManager];

    if ([fileManager fileExistsAtPath:configPath]) {
        NSData *data = [NSData dataWithContentsOfFile:configPath];
        NSError *error = nil;
        NSDictionary *config = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];

        if (config && !error) {
            self.toolsConfig = [NSMutableDictionary dictionaryWithDictionary:config];
            
            BOOL needsSave = NO;
            
            // Migrate old "accessibility" category to "gui" if it exists
            if (self.toolsConfig[@"accessibility"] && !self.toolsConfig[@"gui"]) {
                NSLog(@"Migrating 'accessibility' category to 'gui'");
                self.toolsConfig[@"gui"] = self.toolsConfig[@"accessibility"];
                [self.toolsConfig removeObjectForKey:@"accessibility"];
                needsSave = YES;
            }
            
            // Ensure all expected categories exist with default tools
            BOOL categoriesChanged = [self ensureAllCategoriesExist];
            needsSave = needsSave || categoriesChanged;
            
            // Only save if we made changes
            if (needsSave) {
                [self saveToolsConfig];
            }
            
            NSLog(@"Loaded tools config from %@", configPath);
        } else {
            NSLog(@"Error loading tools config: %@", error);
            [self createDefaultToolsConfig];
        }
    } else {
        NSLog(@"No tools config found, creating default");
        [self createDefaultToolsConfig];
    }
}

- (BOOL)ensureAllCategoriesExist {
    // Get the complete list of tools from default config
    NSDictionary *defaultToolDefinitions = @{
        @"gui": @[
            @"listApplications",
            @"focusApplication",
            @"launchApplication",
            @"screenshot",
            @"screenshot_app",
            @"click",
            @"click_absolute",
            @"doubleClick",
            @"clickElement",
            @"moveMouse",
            @"scroll",
            @"scrollMouse",
            @"drag",
            @"getClickableElements",
            @"getUIElements",
            @"getMousePosition",
            @"typeText",
            @"pressKey",
            @"analyzeWithOCR",
            @"checkPermissions",
            @"closeApp",
            @"wait"
        ],
        @"browser": @[
            @"browser_listConnected",
            @"browser_setDefaultBrowser",
            @"browser_getTabs",
            @"browser_getActiveTab",
            @"browser_focusTab",
            @"browser_createTab",
            @"browser_closeTab",
            @"browser_getPageInfo",
            @"browser_inspectCurrentPage",
            @"browser_getInteractiveElements",
            @"browser_getPageContext",
            @"browser_clickElement",
            @"browser_fillElement",
            @"browser_fillFormField",
            @"browser_fillWithFallback",
            @"browser_fillFormNative",
            @"browser_scrollTo",
            @"browser_executeScript",
            @"browser_getFormData",
            @"browser_setWatchMode",
            @"browser_getVisibleText",
            @"browser_searchVisibleText",
            @"browser_getUIElements",
            @"browser_waitForSelector",
            @"browser_waitForPageLoad",
            @"browser_selectOption",
            @"browser_isElementVisible",
            @"browser_getConsoleLogs",
            @"browser_getNetworkRequests",
            @"browser_getLocalStorage",
            @"browser_getCookies",
            // Enhanced browser tools
            @"browser_clickByText",
            @"browser_clickMultiple",
            @"browser_getFormStructure",
            @"browser_answerQuestions",
            @"browser_getDropdownOptions",
            @"browser_openDropdownNative",
            @"browser_listInteractiveElements",
            @"browser_clickElementWithDebug",
            @"browser_findElementWithDebug",
            @"browser_findTabByUrl",
            // Playwright-style browser automation tools
            @"browser_navigate",
            @"browser_screenshot",
            @"browser_go_back",
            @"browser_go_forward",
            @"browser_get_visible_html",
            @"browser_hover",
            @"browser_drag",
            @"browser_press_key",
            @"browser_upload_file",
            @"browser_save_as_pdf"
        ],
        @"filesystem": @[
            @"fs_list",
            @"fs_read",
            @"fs_read_range",
            @"fs_write",
            @"fs_delete",
            @"fs_move",
            @"fs_search",
            @"fs_grep",
            @"fs_patch"
        ],
        @"shell": @[
            @"shell_exec",
            @"shell_start_session",
            @"shell_send_input",
            @"shell_stop_session"
        ]
    };
    
    BOOL madeChanges = NO;
    
    // Ensure each category exists and has all expected tools
    for (NSString *categoryId in defaultToolDefinitions) {
        NSDictionary *existingCategoryConfig = self.toolsConfig[categoryId];
        NSMutableDictionary *categoryConfig;
        
        if (existingCategoryConfig) {
            // Make a mutable copy of the existing config
            categoryConfig = [existingCategoryConfig mutableCopy];
        } else {
            // Create a new category config
            categoryConfig = [NSMutableDictionary dictionary];
            categoryConfig[@"enabled"] = @YES;
            madeChanges = YES;
        }
        
        // Ensure tools dictionary is mutable
        NSDictionary *existingTools = categoryConfig[@"tools"];
        NSMutableDictionary *tools;
        if (existingTools) {
            tools = [existingTools mutableCopy];
        } else {
            tools = [NSMutableDictionary dictionary];
        }
        
        // Add any missing tools from the default list
        NSArray *expectedTools = defaultToolDefinitions[categoryId];
        for (NSString *toolName in expectedTools) {
            if (!tools[toolName]) {
                tools[toolName] = @YES; // Default to enabled
                madeChanges = YES;
            }
        }
        
        categoryConfig[@"tools"] = tools;
        self.toolsConfig[categoryId] = categoryConfig;
    }
    
    // Return YES if we made any changes (added missing categories or tools)
    return madeChanges;
}

- (void)saveToolsConfig {
    NSString *configPath = [self getToolsConfigPath];
    NSError *error = nil;

    NSData *data = [NSJSONSerialization dataWithJSONObject:self.toolsConfig
                                                   options:NSJSONWritingPrettyPrinted
                                                     error:&error];

    if (data && !error) {
        [data writeToFile:configPath atomically:YES];
        NSLog(@"Saved tools config to %@", configPath);
    } else {
        NSLog(@"Error saving tools config: %@", error);
    }
}

- (void)createDefaultToolsConfig {
    self.toolsConfig = [NSMutableDictionary dictionary];

    // Define all tools with their categories
    NSDictionary *toolDefinitions = @{
        @"gui": @[
            @"listApplications",
            @"focusApplication",
            @"launchApplication",
            @"screenshot",
            @"screenshot_app",
            @"click",
            @"click_absolute",
            @"doubleClick",
            @"clickElement",
            @"moveMouse",
            @"scroll",
            @"scrollMouse",
            @"drag",
            @"getClickableElements",
            @"getUIElements",
            @"getMousePosition",
            @"typeText",
            @"pressKey",
            @"analyzeWithOCR",
            @"checkPermissions",
            @"closeApp",
            @"wait"
        ],
        @"browser": @[
            @"browser_listConnected",
            @"browser_setDefaultBrowser",
            @"browser_getTabs",
            @"browser_getActiveTab",
            @"browser_focusTab",
            @"browser_createTab",
            @"browser_closeTab",
            @"browser_getPageInfo",
            @"browser_inspectCurrentPage",
            @"browser_getInteractiveElements",
            @"browser_getPageContext",
            @"browser_clickElement",
            @"browser_fillElement",
            @"browser_fillFormField",
            @"browser_fillWithFallback",
            @"browser_fillFormNative",
            @"browser_scrollTo",
            @"browser_executeScript",
            @"browser_getFormData",
            @"browser_setWatchMode",
            @"browser_getVisibleText",
            @"browser_searchVisibleText",
            @"browser_getUIElements",
            @"browser_waitForSelector",
            @"browser_waitForPageLoad",
            @"browser_selectOption",
            @"browser_isElementVisible",
            @"browser_getConsoleLogs",
            @"browser_getNetworkRequests",
            @"browser_getLocalStorage",
            @"browser_getCookies",
            // Enhanced browser tools
            @"browser_clickByText",
            @"browser_clickMultiple",
            @"browser_getFormStructure",
            @"browser_answerQuestions",
            @"browser_getDropdownOptions",
            @"browser_openDropdownNative",
            @"browser_listInteractiveElements",
            @"browser_clickElementWithDebug",
            @"browser_findElementWithDebug",
            @"browser_findTabByUrl",
            // Playwright-style browser automation tools
            @"browser_navigate",
            @"browser_screenshot",
            @"browser_go_back",
            @"browser_go_forward",
            @"browser_get_visible_html",
            @"browser_hover",
            @"browser_drag",
            @"browser_press_key",
            @"browser_upload_file",
            @"browser_save_as_pdf"
        ],
        @"filesystem": @[
            @"fs_list",
            @"fs_read",
            @"fs_read_range",
            @"fs_write",
            @"fs_delete",
            @"fs_move",
            @"fs_search",
            @"fs_grep",
            @"fs_patch"
        ],
        @"shell": @[
            @"shell_exec",
            @"shell_start_session",
            @"shell_send_input",
            @"shell_stop_session"
        ]
    };

    // Initialize categories with all tools enabled
    for (NSString *category in toolDefinitions) {
        NSMutableDictionary *categoryConfig = [NSMutableDictionary dictionary];
        categoryConfig[@"enabled"] = @YES;

        NSMutableDictionary *tools = [NSMutableDictionary dictionary];
        NSArray *toolNames = toolDefinitions[category];
        for (NSString *toolName in toolNames) {
            tools[toolName] = @YES;
        }
        categoryConfig[@"tools"] = tools;

        self.toolsConfig[category] = categoryConfig;
    }

    [self saveToolsConfig];
}

- (NSArray *)getToolsForCategory:(NSString *)categoryId {
    NSDictionary *categoryConfig = self.toolsConfig[categoryId];
    if (!categoryConfig) return @[];

    NSDictionary *tools = categoryConfig[@"tools"];
    if (!tools) return @[];

    return [tools.allKeys sortedArrayUsingSelector:@selector(compare:)];
}

- (CGFloat)addCategoryBox:(NSString *)categoryName
               categoryId:(NSString *)categoryId
                    tools:(NSArray *)tools
                   toView:(NSView *)documentView
                     atY:(CGFloat)y {

    CGFloat boxWidth = documentView.frame.size.width - 20;
    CGFloat boxHeight = 50 + (tools.count * 25);

    NSBox *categoryBox = [[NSBox alloc] initWithFrame:NSMakeRect(10, y, boxWidth, boxHeight)];
    categoryBox.title = categoryName;
    categoryBox.titlePosition = NSAtTop;
    [documentView addSubview:categoryBox];

    CGFloat boxPadding = 15;
    CGFloat boxY = boxHeight - 40;

    // Category master toggle
    NSButton *categoryToggle = [[NSButton alloc] initWithFrame:NSMakeRect(boxPadding, boxY, boxWidth - boxPadding * 2, 20)];
    [categoryToggle setButtonType:NSButtonTypeSwitch];
    categoryToggle.title = @"Enable All";
    categoryToggle.tag = [categoryId hash]; // Use hash as tag

    // Set initial state
    NSDictionary *categoryConfig = self.toolsConfig[categoryId];
    BOOL categoryEnabled = [categoryConfig[@"enabled"] boolValue];
    categoryToggle.state = categoryEnabled ? NSControlStateValueOn : NSControlStateValueOff;

    categoryToggle.target = self;
    categoryToggle.action = @selector(categoryToggleChanged:);
    [categoryBox addSubview:categoryToggle];

    // Store toggle reference
    if (!self.categoryToggles) {
        self.categoryToggles = [NSMutableDictionary dictionary];
    }
    self.categoryToggles[categoryId] = categoryToggle;

    boxY -= 30;

    // Individual tool toggles
    if (!self.toolToggles) {
        self.toolToggles = [NSMutableDictionary dictionary];
    }

    NSDictionary *toolsConfig = categoryConfig[@"tools"];

    for (NSString *toolName in tools) {
        NSButton *toolToggle = [[NSButton alloc] initWithFrame:NSMakeRect(boxPadding + 20, boxY, boxWidth - boxPadding * 2 - 20, 20)];
        [toolToggle setButtonType:NSButtonTypeSwitch];
        toolToggle.title = toolName;

        // Set initial state
        BOOL toolEnabled = [toolsConfig[toolName] boolValue];
        toolToggle.state = toolEnabled ? NSControlStateValueOn : NSControlStateValueOff;
        toolToggle.enabled = categoryEnabled;

        toolToggle.target = self;
        toolToggle.action = @selector(toolToggleChanged:);
        [categoryBox addSubview:toolToggle];

        // Store toggle reference with composite key
        NSString *toolKey = [NSString stringWithFormat:@"%@.%@", categoryId, toolName];
        self.toolToggles[toolKey] = toolToggle;

        boxY -= 25;
    }

    return y + boxHeight;
}

- (void)categoryToggleChanged:(NSButton *)sender {
    // Find which category this belongs to
    NSString *categoryId = nil;
    for (NSString *catId in self.categoryToggles) {
        if (self.categoryToggles[catId] == sender) {
            categoryId = catId;
            break;
        }
    }

    if (!categoryId) return;

    BOOL enabled = (sender.state == NSControlStateValueOn);

    // Update config
    NSMutableDictionary *categoryConfig = [self.toolsConfig[categoryId] mutableCopy];
    categoryConfig[@"enabled"] = @(enabled);
    self.toolsConfig[categoryId] = categoryConfig;

    // Enable/disable all tool toggles in this category
    NSArray *tools = [self getToolsForCategory:categoryId];
    for (NSString *toolName in tools) {
        NSString *toolKey = [NSString stringWithFormat:@"%@.%@", categoryId, toolName];
        NSButton *toolToggle = self.toolToggles[toolKey];
        toolToggle.enabled = enabled;
    }

    NSLog(@"Category %@ %@", categoryId, enabled ? @"enabled" : @"disabled");
}

- (void)toolToggleChanged:(NSButton *)sender {
    // Find which tool this belongs to
    NSString *categoryId = nil;
    NSString *toolName = sender.title;

    for (NSString *toolKey in self.toolToggles) {
        if (self.toolToggles[toolKey] == sender) {
            NSArray *parts = [toolKey componentsSeparatedByString:@"."];
            if (parts.count == 2) {
                categoryId = parts[0];
                break;
            }
        }
    }

    if (!categoryId || !toolName) return;

    BOOL enabled = (sender.state == NSControlStateValueOn);

    // Update config
    NSMutableDictionary *categoryConfig = [self.toolsConfig[categoryId] mutableCopy];
    NSMutableDictionary *toolsConfig = [categoryConfig[@"tools"] mutableCopy];
    toolsConfig[toolName] = @(enabled);
    categoryConfig[@"tools"] = toolsConfig;
    self.toolsConfig[categoryId] = categoryConfig;

    NSLog(@"Tool %@.%@ %@", categoryId, toolName, enabled ? @"enabled" : @"disabled");
}

- (void)saveSettings:(id)sender {
    // Track which settings need restart vs immediate apply
    NSString *oldPort = [self loadSetting:kPortKey defaultValue:@"3456"];
    NSString *oldNetworkMode = [self loadSetting:kNetworkModeKey defaultValue:@"localhost"];

    [self saveSetting:kAgentNameKey value:self.agentNameField.stringValue];

    NSInteger modeIndex = self.networkModePopup.indexOfSelectedItem;
    NSString *mode = @"localhost";
    if (modeIndex == 1) mode = @"lan";
    else if (modeIndex == 2) mode = @"wan";
    [self saveSetting:kNetworkModeKey value:mode];

    [self saveSetting:kPortKey value:self.portField.stringValue];

    // Save control server settings
    [self saveSetting:kControlServerAddressKey value:self.controlServerAddressField.stringValue];

    // Save tools configuration
    [self saveToolsConfig];

    // Apply control server settings immediately (no restart needed)
    [self checkControlServerConnection];

    // Check if MCP server settings changed (these need restart)
    BOOL needsRestart = ![oldPort isEqualToString:self.portField.stringValue] ||
                        ![oldNetworkMode isEqualToString:mode];

    if (needsRestart) {
        NSAlert *alert = [[NSAlert alloc] init];
        alert.messageText = @"Settings Saved";
        alert.informativeText = @"Port or network mode changed. Restart the agent for these changes to take effect.";
        alert.alertStyle = NSAlertStyleInformational;
        [alert addButtonWithTitle:@"OK"];
        [alert addButtonWithTitle:@"Restart Now"];

        NSModalResponse response = [alert runModal];
        if (response == NSAlertSecondButtonReturn) {
            [self restartAgent];
        }
    } else {
        // Just show confirmation - control server settings applied immediately
        NSAlert *alert = [[NSAlert alloc] init];
        alert.messageText = @"Settings Saved";
        alert.informativeText = @"Your settings have been applied.";
        alert.alertStyle = NSAlertStyleInformational;
        [alert addButtonWithTitle:@"OK"];
        [alert runModal];
    }

    [self.settingsWindow close];
}

- (void)networkModeChanged:(id)sender {
    NSInteger modeIndex = self.networkModePopup.indexOfSelectedItem;
    if (modeIndex == 2) {
        NSAlert *alert = [[NSAlert alloc] init];
        alert.messageText = @"Internet Mode Warning";
        alert.informativeText = @"Exposing this agent to the internet requires:\n\n"
                                @"1. A strong API key (auto-generated)\n"
                                @"2. Firewall/router configuration\n"
                                @"3. Optionally, TLS encryption\n\n"
                                @"Only enable this if you understand the security implications.";
        alert.alertStyle = NSAlertStyleWarning;
        [alert addButtonWithTitle:@"I Understand"];
        [alert addButtonWithTitle:@"Cancel"];

        NSModalResponse response = [alert runModal];
        if (response == NSAlertSecondButtonReturn) {
            [self.networkModePopup selectItemAtIndex:0];
        }
    }
}

- (void)regenerateAPIKey:(id)sender {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Regenerate API Key?";
    alert.informativeText = @"This will invalidate any existing connections using the current key.";
    alert.alertStyle = NSAlertStyleWarning;
    [alert addButtonWithTitle:@"Regenerate"];
    [alert addButtonWithTitle:@"Cancel"];

    NSModalResponse response = [alert runModal];
    if (response == NSAlertFirstButtonReturn) {
        NSString *newKey = [self generateAPIKey];
        [self saveSetting:kAPIKeyKey value:newKey];
        self.apiKeyField.stringValue = newKey;
    }
}

#pragma mark - Control Server Management

- (void)connectControlServer:(id)sender {
    NSString *address = self.controlServerAddressField.stringValue;
    if (address.length == 0) {
        if (sender != nil) {
            // Only show alert if user clicked the button
            NSAlert *alert = [[NSAlert alloc] init];
            alert.messageText = @"Missing URL";
            alert.informativeText = @"Please enter a control server URL.";
            alert.alertStyle = NSAlertStyleWarning;
            [alert addButtonWithTitle:@"OK"];
            [alert runModal];
        }
        return;
    }

    // Parse address (may include port)
    NSString *urlString = address;
    if (![urlString hasPrefix:@"http://"] && ![urlString hasPrefix:@"https://"]) {
        urlString = [NSString stringWithFormat:@"https://%@", address];
    }

    // Parse MCP URL to extract endpoint UUID if present
    // Format: https://server.com/mcp/UUID or https://server.com
    NSURL *parsedUrl = [NSURL URLWithString:urlString];
    NSString *baseUrl = urlString;
    NSString *endpointUuid = @"";

    if (parsedUrl) {
        NSString *path = parsedUrl.path;
        // Check if path contains /mcp/UUID
        if ([path hasPrefix:@"/mcp/"]) {
            // Extract UUID from path
            NSString *uuidPart = [path substringFromIndex:5]; // Skip "/mcp/"
            // Remove any trailing slashes or path components
            NSRange slashRange = [uuidPart rangeOfString:@"/"];
            if (slashRange.location != NSNotFound) {
                uuidPart = [uuidPart substringToIndex:slashRange.location];
            }
            endpointUuid = uuidPart;

            // Build base URL without the /mcp/UUID path
            NSString *scheme = parsedUrl.scheme ?: @"https";
            NSString *host = parsedUrl.host ?: @"";
            NSNumber *port = parsedUrl.port;
            if (port) {
                baseUrl = [NSString stringWithFormat:@"%@://%@:%@", scheme, host, port];
            } else {
                baseUrl = [NSString stringWithFormat:@"%@://%@", scheme, host];
            }

            NSLog(@"Parsed MCP URL - Base: %@, Endpoint UUID: %@", baseUrl, endpointUuid);
        }
    }

    // Store endpoint UUID in debug field (used by registration)
    self.debugEndpointUuidField.stringValue = endpointUuid;

    // Save the URL to UserDefaults
    [self saveSetting:kControlServerAddressKey value:self.controlServerAddressField.stringValue];

    // Start health check in background (use base URL)
    [self checkServerHealth:baseUrl];

    // Build WebSocket URL from base URL
    NSString *wsUrl = baseUrl;
    wsUrl = [wsUrl stringByReplacingOccurrencesOfString:@"https://" withString:@"wss://"];
    wsUrl = [wsUrl stringByReplacingOccurrencesOfString:@"http://" withString:@"ws://"];
    wsUrl = [NSString stringWithFormat:@"%@/ws", wsUrl];

    // Update debug server URL field and initiate WebSocket connection
    self.debugServerUrlField.stringValue = wsUrl;

    // Update UI
    self.connectButton.enabled = NO;
    self.connectionStatusLabel.stringValue = @"Status: Connecting...";
    self.connectionStatusLabel.textColor = [NSColor systemOrangeColor];

    // Cancel any pending reconnect and connect
    [self debugCancelReconnect];

    NSURL *url = [NSURL URLWithString:wsUrl];
    if (!url) {
        self.connectionStatusLabel.stringValue = @"Status: Invalid URL";
        self.connectionStatusLabel.textColor = [NSColor systemRedColor];
        self.connectButton.enabled = YES;
        return;
    }

    NSURLSessionConfiguration *config = [NSURLSessionConfiguration defaultSessionConfiguration];
    self.debugSession = [NSURLSession sessionWithConfiguration:config];
    self.debugWebSocketTask = [self.debugSession webSocketTaskWithURL:url];

    // Start receiving messages
    [self debugReceiveMessage];

    // Resume the task to start connection
    [self.debugWebSocketTask resume];

    // Update debug UI as well
    self.debugConnectButton.enabled = NO;
    self.debugDisconnectButton.enabled = YES;
    self.debugReconnectButton.enabled = NO;
    self.debugConnectionStatusLabel.stringValue = @"Status: Connecting...";
    self.debugConnectionStatusLabel.textColor = [NSColor systemOrangeColor];

    // Send registration after a brief delay to ensure connection is established
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 500 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
        [self debugSendRegistration];
    });
}

- (void)checkServerHealth:(NSString *)urlString {
    NSURL *testURL = [NSURL URLWithString:[NSString stringWithFormat:@"%@/api/health", urlString]];
    if (!testURL) {
        self.healthStatusLabel.stringValue = @"Health: Invalid URL";
        self.healthStatusLabel.textColor = [NSColor systemRedColor];
        return;
    }

    self.healthStatusLabel.stringValue = @"Health: Checking...";
    self.healthStatusLabel.textColor = [NSColor systemOrangeColor];

    NSURLRequest *request = [NSURLRequest requestWithURL:testURL
                                             cachePolicy:NSURLRequestUseProtocolCachePolicy
                                         timeoutInterval:10.0];

    NSURLSessionDataTask *task = [self.urlSession dataTaskWithRequest:request
                                                    completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (error) {
                self.healthStatusLabel.stringValue = @"Health: Error";
                self.healthStatusLabel.textColor = [NSColor systemRedColor];
                return;
            }

            NSHTTPURLResponse *httpResponse = (NSHTTPURLResponse *)response;
            if (httpResponse.statusCode == 200 && data) {
                NSError *jsonError;
                NSDictionary *result = [NSJSONSerialization JSONObjectWithData:data options:0 error:&jsonError];
                if (result && [result[@"status"] isEqualToString:@"ok"]) {
                    self.healthStatusLabel.stringValue = @"Health: Ok";
                    self.healthStatusLabel.textColor = [NSColor systemGreenColor];
                } else {
                    self.healthStatusLabel.stringValue = @"Health: Bad";
                    self.healthStatusLabel.textColor = [NSColor systemRedColor];
                }
            } else {
                self.healthStatusLabel.stringValue = [NSString stringWithFormat:@"Health: %ld", (long)httpResponse.statusCode];
                self.healthStatusLabel.textColor = [NSColor systemRedColor];
            }
        });
    }];

    [task resume];
}

- (void)checkControlServerConnection {
    NSString *address = [self loadSetting:kControlServerAddressKey defaultValue:@""];
    if (address.length == 0) {
        self.isRemoteMode = NO;
        self.connectionStatusLabel.stringValue = @"Not connected";
        self.connectionStatusLabel.textColor = [NSColor secondaryLabelColor];
        [self updateStatusBarIcon:[self isScreenLocked]];
        return;
    }

    // If address is configured, try to connect
    [self connectControlServer:nil];
}

#pragma mark - Agent Management

- (void)startAgent {
    NSLog(@"ScreenControl Agent starting...");

    NSString *apiKey = [self loadOrGenerateAPIKey];
    NSString *portStr = [self loadSetting:kPortKey defaultValue:@"3456"];
    NSUInteger port = [portStr integerValue];

    self.mcpServer = [[MCPServer alloc] initWithPort:port apiKey:apiKey];
    self.mcpServer.delegate = self;

    if ([self.mcpServer start]) {
        NSLog(@"MCP Server started on port %lu", (unsigned long)port);
        [self saveTokenFile:apiKey port:port];
    } else {
        NSLog(@"Failed to start MCP Server");
    }

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 1 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        [self updateStatus];
    });
}

- (void)stopAgent {
    NSLog(@"ScreenControl Agent stopped");
    [self.mcpServer stop];
    self.mcpServer = nil;
}

- (void)restartAgent {
    [self stopAgent];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 500 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
        [self startAgent];
    });
}

- (void)saveTokenFile:(NSString *)apiKey port:(NSUInteger)port {
    // Save token file for MCP proxy to read
    NSString *tokenPath = [NSHomeDirectory() stringByAppendingPathComponent:@".screencontrol-token"];
    NSDictionary *tokenData = @{
        @"apiKey": apiKey,
        @"port": @(port),
        @"host": @"127.0.0.1",
        @"createdAt": [[NSISO8601DateFormatter new] stringFromDate:[NSDate date]]
    };

    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:tokenData options:0 error:nil];
    [jsonData writeToFile:tokenPath atomically:YES];

    // Set file permissions to owner only (0600)
    [[NSFileManager defaultManager] setAttributes:@{NSFilePosixPermissions: @0600} ofItemAtPath:tokenPath error:nil];
}

- (void)updateStatus {
    // Batch UI updates to prevent animation conflicts
    if (![NSThread isMainThread]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self updateStatus];
        });
        return;
    }

    // Cache the last state to avoid unnecessary updates
    static BOOL lastScreenLocked = NO;
    static BOOL lastRunning = NO;
    static NSString *lastPort = nil;
    static BOOL lastRemoteMode = NO;

    NSMenuItem *statusItem = [self.statusMenu itemWithTag:100];
    BOOL screenLocked = [self isScreenLocked];
    BOOL running = self.mcpServer.isRunning;
    NSString *port = [self loadSetting:kPortKey defaultValue:@"3456"];

    // Batch all UI updates in a single animation block
    [NSAnimationContext beginGrouping];
    [[NSAnimationContext currentContext] setDuration:0];

    // Only update icon if state changed
    if (screenLocked != lastScreenLocked || running != lastRunning || self.isRemoteMode != lastRemoteMode) {
        [self updateStatusBarIcon:screenLocked];
        lastScreenLocked = screenLocked;
        lastRunning = running;
        lastRemoteMode = self.isRemoteMode;
    }

    // Update menu item
    NSString *newTitle = nil;
    if (screenLocked) {
        newTitle = @"Screen Locked - waiting...";
    } else if (running) {
        NSString *mode = self.isRemoteMode ? @" (Remote)" : @"";
        newTitle = [NSString stringWithFormat:@"Running on port %@%@", port, mode];
    } else {
        newTitle = @"Stopped";
    }

    if (![statusItem.title isEqualToString:newTitle]) {
        statusItem.title = newTitle;
    }

    [NSAnimationContext endGrouping];

    lastPort = port;

    // Only update settings window if visible
    if (self.settingsWindow.isVisible && !self.isUpdatingSettingsStatus) {
        [self updateSettingsWindowStatus];
    }

    // Check permissions less frequently (every 3 updates = 15 seconds)
    static NSUInteger permissionCheckCounter = 0;
    if (++permissionCheckCounter % 3 == 0) {
        [self checkPermissions];
    }

    // Periodically check control server connection
    static NSUInteger checkCounter = 0;
    if (++checkCounter % 12 == 0) { // Every 60 seconds (12 * 5s)
        [self checkControlServerConnection];
    }
}

- (BOOL)isScreenLocked {
    CFDictionaryRef sessionDict = CGSessionCopyCurrentDictionary();
    if (sessionDict) {
        CFBooleanRef screenLocked = CFDictionaryGetValue(sessionDict, CFSTR("CGSSessionScreenIsLocked"));
        BOOL locked = (screenLocked && CFBooleanGetValue(screenLocked));
        CFRelease(sessionDict);
        if (locked) return YES;
    }

    NSRunningApplication *frontApp = [[NSWorkspace sharedWorkspace] frontmostApplication];
    if ([frontApp.bundleIdentifier isEqualToString:@"com.apple.loginwindow"] ||
        [frontApp.bundleIdentifier isEqualToString:@"com.apple.ScreenSaver.Engine"]) {
        return YES;
    }

    return NO;
}

- (void)updateSettingsWindowStatus {
    if (![NSThread isMainThread]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self updateSettingsWindowStatus];
        });
        return;
    }

    if (self.isUpdatingSettingsStatus) {
        return;
    }

    self.isUpdatingSettingsStatus = YES;
    [self applySettingsWindowStatus];
}

- (void)applySettingsWindowStatus {
    // Batch UI updates
    [NSAnimationContext beginGrouping];
    [[NSAnimationContext currentContext] setDuration:0];

    NSString *port = [self loadSetting:kPortKey defaultValue:@"3456"];
    self.statusLabel.stringValue = [NSString stringWithFormat:@"Server: Running on port %@", port];

    NSTimeInterval uptime = [[NSDate date] timeIntervalSinceDate:self.startTime];
    if (uptime < 60) {
        self.uptimeLabel.stringValue = [NSString stringWithFormat:@"Uptime: %.0fs", uptime];
    } else if (uptime < 3600) {
        self.uptimeLabel.stringValue = [NSString stringWithFormat:@"Uptime: %.0fm %.0fs",
                                        floor(uptime / 60), fmod(uptime, 60)];
    } else {
        self.uptimeLabel.stringValue = [NSString stringWithFormat:@"Uptime: %.0fh %.0fm",
                                        floor(uptime / 3600), fmod(floor(uptime / 60), 60)];
    }

    [NSAnimationContext endGrouping];

    [self updatePermissionIndicators];
    self.isUpdatingSettingsStatus = NO;
}

#pragma mark - Permissions

- (void)checkPermissions {
    BOOL hasAccessibility = AXIsProcessTrusted();

    // Find the Permissions submenu
    NSMenuItem *permissionsMenuItem = nil;
    for (NSMenuItem *item in self.statusMenu.itemArray) {
        if ([item.title isEqualToString:@"Permissions"]) {
            permissionsMenuItem = item;
            break;
        }
    }

    if (permissionsMenuItem && permissionsMenuItem.submenu) {
        NSMenuItem *accessItem = [permissionsMenuItem.submenu itemWithTag:200];
        if (accessItem) {
            accessItem.title = hasAccessibility ? @"Accessibility: Granted ✓" : @"Accessibility: Not Granted ✗";
        }

        BOOL hasScreenRecording = NO;
        if (@available(macOS 10.15, *)) {
            hasScreenRecording = CGPreflightScreenCaptureAccess();
        } else {
            hasScreenRecording = YES;
        }

        NSMenuItem *screenItem = [permissionsMenuItem.submenu itemWithTag:201];
        if (screenItem) {
            screenItem.title = hasScreenRecording ? @"Screen Recording: Granted ✓" : @"Screen Recording: Not Granted ✗";
        }
    }
}

- (void)updatePermissionIndicators {
    if (![NSThread isMainThread]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self updatePermissionIndicators];
        });
        return;
    }

    if (self.isUpdatingPermissionIndicators) {
        return;
    }

    self.isUpdatingPermissionIndicators = YES;
    [self applyPermissionIndicatorState];
}

- (void)applyPermissionIndicatorState {
    BOOL hasAccessibility = AXIsProcessTrusted();
    BOOL hasScreenRecording = NO;
    if (@available(macOS 10.15, *)) {
        hasScreenRecording = CGPreflightScreenCaptureAccess();
    } else {
        hasScreenRecording = YES;
    }

    // Batch UI updates
    [NSAnimationContext beginGrouping];
    [[NSAnimationContext currentContext] setDuration:0];

    self.accessibilityLabel.stringValue = @"Accessibility";
    if (hasAccessibility) {
        self.accessibilityIndicator.image = [NSImage imageWithSystemSymbolName:@"checkmark.circle.fill" accessibilityDescription:@"Granted"];
        self.accessibilityIndicator.contentTintColor = [NSColor systemGreenColor];
    } else {
        self.accessibilityIndicator.image = [NSImage imageWithSystemSymbolName:@"xmark.circle.fill" accessibilityDescription:@"Not Granted"];
        self.accessibilityIndicator.contentTintColor = [NSColor systemRedColor];
    }

    self.screenRecordingLabel.stringValue = @"Screen Recording";
    if (hasScreenRecording) {
        self.screenRecordingIndicator.image = [NSImage imageWithSystemSymbolName:@"checkmark.circle.fill" accessibilityDescription:@"Granted"];
        self.screenRecordingIndicator.contentTintColor = [NSColor systemGreenColor];
    } else {
        self.screenRecordingIndicator.image = [NSImage imageWithSystemSymbolName:@"xmark.circle.fill" accessibilityDescription:@"Not Granted"];
        self.screenRecordingIndicator.contentTintColor = [NSColor systemRedColor];
    }

    [NSAnimationContext endGrouping];

    self.isUpdatingPermissionIndicators = NO;
}

#pragma mark - Actions

- (void)openSettings:(id)sender {
    [self updateSettingsWindowStatus];
    [self.settingsWindow makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}

- (void)copyAPIKey:(id)sender {
    NSString *apiKey = self.apiKeyField ? self.apiKeyField.stringValue : nil;
    if (!apiKey || apiKey.length == 0) {
        apiKey = [self loadOrGenerateAPIKey];
    }

    NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
    [pasteboard clearContents];
    [pasteboard setString:apiKey forType:NSPasteboardTypeString];

    self.statusItem.button.toolTip = @"API Key Copied!";
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        self.statusItem.button.toolTip = @"ScreenControl Agent";
    });
}

- (void)openAccessibilityPrefs:(id)sender {
    NSDictionary *options = @{(__bridge id)kAXTrustedCheckOptionPrompt: @YES};
    AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
}

- (void)openScreenRecordingPrefs:(id)sender {
    if (@available(macOS 10.15, *)) {
        CGRequestScreenCaptureAccess();
    }

    NSURL *url = [NSURL URLWithString:@"x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"];
    [[NSWorkspace sharedWorkspace] openURL:url];
}

- (void)toggleLoginItem:(id)sender {
    NSMenuItem *item = (NSMenuItem *)sender;
    BOOL currentState = (item.state == NSControlStateValueOn);

    if (@available(macOS 13.0, *)) {
        SMAppService *service = [SMAppService mainAppService];
        NSError *error = nil;

        if (currentState) {
            [service unregisterAndReturnError:&error];
        } else {
            [service registerAndReturnError:&error];
        }

        if (error) {
            NSLog(@"Failed to toggle login item: %@", error);
        }
    }

    item.state = currentState ? NSControlStateValueOff : NSControlStateValueOn;
}

- (void)quit:(id)sender {
    [NSApp terminate:nil];
}

#pragma mark - NSWindowDelegate

- (void)windowWillClose:(NSNotification *)notification {
}

#pragma mark - NSTextFieldDelegate

- (void)controlTextDidEndEditing:(NSNotification *)notification {
}

#pragma mark - MCPServerDelegate

- (void)serverDidStart:(NSUInteger)port {
    NSLog(@"MCP Server started on port %lu", (unsigned long)port);
    [self updateStatus];
}

- (void)serverDidStop {
    NSLog(@"MCP Server stopped");
    [self updateStatus];
}

- (void)serverDidReceiveRequest:(NSString *)path {
    NSLog(@"MCP Request: %@", path);
}

#pragma mark - Browser Bridge Server Management

- (NSString *)browserBridgeServerPath {
    // First check if running from Xcode (development)
    NSString *devPath = [NSHomeDirectory() stringByAppendingPathComponent:@"dev/screencontrol/dist/browser-bridge-server.js"];
    if ([[NSFileManager defaultManager] fileExistsAtPath:devPath]) {
        return devPath;
    }

    // Check bundle resources
    NSString *bundlePath = [[NSBundle mainBundle] pathForResource:@"browser-bridge-server" ofType:@"js"];
    if (bundlePath) {
        return bundlePath;
    }

    // Fallback to npm global install
    NSString *npmPath = @"/usr/local/lib/node_modules/screencontrol/dist/browser-bridge-server.js";
    if ([[NSFileManager defaultManager] fileExistsAtPath:npmPath]) {
        return npmPath;
    }

    return nil;
}

- (NSString *)nodeExecutablePath {
    // Check common Node.js installation paths
    NSArray *nodePaths = @[
        @"/usr/local/bin/node",
        @"/opt/homebrew/bin/node",
        @"/usr/bin/node",
        [NSHomeDirectory() stringByAppendingPathComponent:@".nvm/versions/node/*/bin/node"]
    ];

    for (NSString *path in nodePaths) {
        if ([path containsString:@"*"]) {
            // Handle glob pattern for nvm
            NSString *baseDir = [path stringByDeletingLastPathComponent];
            baseDir = [baseDir stringByDeletingLastPathComponent];
            NSArray *contents = [[NSFileManager defaultManager] contentsOfDirectoryAtPath:baseDir error:nil];
            for (NSString *version in contents) {
                NSString *nodePath = [[baseDir stringByAppendingPathComponent:version] stringByAppendingPathComponent:@"bin/node"];
                if ([[NSFileManager defaultManager] isExecutableFileAtPath:nodePath]) {
                    return nodePath;
                }
            }
        } else if ([[NSFileManager defaultManager] isExecutableFileAtPath:path]) {
            return path;
        }
    }

    return nil;
}

- (void)startBrowserBridge {
    if (self.browserBridgeTask && self.browserBridgeTask.isRunning) {
        NSLog(@"Browser bridge already running");
        return;
    }

    NSString *nodePath = [self nodeExecutablePath];
    if (!nodePath) {
        NSLog(@"Error: Node.js not found. Browser bridge requires Node.js.");
        return;
    }

    NSString *bridgePath = [self browserBridgeServerPath];
    if (!bridgePath) {
        NSLog(@"Error: browser-bridge-server.js not found");
        return;
    }

    NSLog(@"Starting browser bridge: %@ %@", nodePath, bridgePath);

    self.browserBridgeTask = [[NSTask alloc] init];
    self.browserBridgeTask.executableURL = [NSURL fileURLWithPath:nodePath];
    self.browserBridgeTask.arguments = @[bridgePath];

    // Set environment to include common paths
    NSMutableDictionary *env = [[[NSProcessInfo processInfo] environment] mutableCopy];
    env[@"PATH"] = [NSString stringWithFormat:@"/usr/local/bin:/opt/homebrew/bin:%@", env[@"PATH"] ?: @""];
    self.browserBridgeTask.environment = env;

    // Capture output for logging
    self.browserBridgePipe = [NSPipe pipe];
    self.browserBridgeTask.standardOutput = self.browserBridgePipe;
    self.browserBridgeTask.standardError = self.browserBridgePipe;

    // Read output asynchronously
    [[self.browserBridgePipe fileHandleForReading] setReadabilityHandler:^(NSFileHandle *handle) {
        NSData *data = [handle availableData];
        if (data.length > 0) {
            NSString *output = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
            NSLog(@"[Browser Bridge] %@", [output stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]]);
        }
    }];

    // Handle termination
    __weak typeof(self) weakSelf = self;
    self.browserBridgeTask.terminationHandler = ^(NSTask *task) {
        NSLog(@"Browser bridge terminated with status: %d", task.terminationStatus);

        // Clear the readability handler
        [[weakSelf.browserBridgePipe fileHandleForReading] setReadabilityHandler:nil];

        // Auto-restart if it crashed (non-zero exit) and app is still running
        if (task.terminationStatus != 0 && !weakSelf.isAppTerminating) {
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
                NSLog(@"Restarting browser bridge after crash...");
                [weakSelf startBrowserBridge];
            });
        }
    };

    NSError *error = nil;
    if (![self.browserBridgeTask launchAndReturnError:&error]) {
        NSLog(@"Failed to start browser bridge: %@", error.localizedDescription);
        self.browserBridgeTask = nil;
        return;
    }

    NSLog(@"Browser bridge started (PID: %d)", self.browserBridgeTask.processIdentifier);
}

- (void)stopBrowserBridge {
    if (!self.browserBridgeTask || !self.browserBridgeTask.isRunning) {
        return;
    }

    NSLog(@"Stopping browser bridge (PID: %d)", self.browserBridgeTask.processIdentifier);

    // Clear termination handler to prevent auto-restart
    self.browserBridgeTask.terminationHandler = nil;

    // Clear readability handler
    [[self.browserBridgePipe fileHandleForReading] setReadabilityHandler:nil];

    // Send SIGTERM for graceful shutdown
    [self.browserBridgeTask terminate];

    // Wait briefly for graceful shutdown
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 500 * NSEC_PER_MSEC), dispatch_get_global_queue(QOS_CLASS_DEFAULT, 0), ^{
        if (self.browserBridgeTask.isRunning) {
            // Force kill if still running
            kill(self.browserBridgeTask.processIdentifier, SIGKILL);
        }
    });

    self.browserBridgeTask = nil;
    self.browserBridgePipe = nil;
}

- (BOOL)isBrowserBridgeRunning {
    return self.browserBridgeTask && self.browserBridgeTask.isRunning;
}

#pragma mark - Debug Configuration

- (void)loadBundledDebugConfig {
    // Load debug-config.json from app bundle Resources
    NSString *configPath = [[NSBundle mainBundle] pathForResource:@"debug-config" ofType:@"json"];
    if (!configPath) {
        NSLog(@"No bundled debug-config.json found - using defaults");
        return;
    }

    NSError *error = nil;
    NSData *configData = [NSData dataWithContentsOfFile:configPath options:0 error:&error];
    if (!configData) {
        NSLog(@"Failed to read debug-config.json: %@", error.localizedDescription);
        return;
    }

    NSDictionary *config = [NSJSONSerialization JSONObjectWithData:configData options:0 error:&error];
    if (!config) {
        NSLog(@"Failed to parse debug-config.json: %@", error.localizedDescription);
        return;
    }

    NSLog(@"Loaded bundled debug config: %@", config);

    // Auto-fill debug fields if autoFillDebugSettings is true
    if ([config[@"autoFillDebugSettings"] boolValue]) {
        if (config[@"serverUrl"] && [config[@"serverUrl"] length] > 0) {
            self.debugServerUrlField.stringValue = config[@"serverUrl"];
        }
        if (config[@"endpointUuid"] && [config[@"endpointUuid"] length] > 0) {
            self.debugEndpointUuidField.stringValue = config[@"endpointUuid"];
        }
        if (config[@"customerId"] && [config[@"customerId"] length] > 0) {
            self.debugCustomerIdField.stringValue = config[@"customerId"];
        }

        // Log who this debug build belongs to
        NSString *developerEmail = config[@"developerEmail"];
        NSString *environment = config[@"environment"];
        if (developerEmail) {
            NSLog(@"Debug build configured for developer: %@", developerEmail);
        }
        if (environment) {
            NSLog(@"Environment: %@", environment);
        }
    }

    // Enable auto-reconnect by default (agents should stay connected)
    self.debugAutoReconnectEnabled = YES;

    // Auto-connect on startup if configured
    if ([config[@"connectOnStartup"] boolValue]) {
        NSLog(@"Auto-connecting to debug server on startup...");
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
            [self debugConnect:nil];
        });
    }
}

#pragma mark - TestServer Wrapper Methods

- (IBAction)debugConnectClicked:(id)sender {
    [self debugConnect:sender];
}

- (IBAction)debugDisconnectClicked:(id)sender {
    [self debugDisconnect:sender];
}

- (IBAction)debugSaveSettingsClicked:(id)sender {
    // Save debug-specific settings to UserDefaults
    NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
    [defaults setObject:self.debugServerUrlField.stringValue forKey:@"debugServerUrl"];
    [defaults setObject:self.debugEndpointUuidField.stringValue forKey:@"debugEndpointUuid"];
    [defaults setObject:self.debugCustomerIdField.stringValue forKey:@"debugCustomerId"];
    if (self.debugConnectOnStartupCheckbox) {
        [defaults setBool:(self.debugConnectOnStartupCheckbox.state == NSControlStateValueOn) forKey:@"debugConnectOnStartup"];
    }
    [defaults synchronize];

    [self debugLog:@"Settings saved"];
}

- (IBAction)copyMcpUrl:(id)sender {
    // Get the endpoint UUID from the debug field
    NSString *endpointUuid = self.debugEndpointUuidField.stringValue;

    if (endpointUuid.length == 0) {
        [self debugLog:@"ERROR: No Endpoint UUID configured - cannot generate MCP URL"];
        return;
    }

    // Get the server URL and convert to HTTPS for MCP endpoint
    NSString *serverUrl = self.debugServerUrlField.stringValue;
    if (serverUrl.length == 0) {
        serverUrl = @"wss://screencontrol.knws.co.uk/ws";
    }

    // Convert WebSocket URL to HTTPS URL for MCP
    // wss://screencontrol.knws.co.uk/ws -> https://screencontrol.knws.co.uk
    // ws://localhost:3000/ws -> http://localhost:3000
    NSString *httpUrl = serverUrl;
    httpUrl = [httpUrl stringByReplacingOccurrencesOfString:@"wss://" withString:@"https://"];
    httpUrl = [httpUrl stringByReplacingOccurrencesOfString:@"ws://" withString:@"http://"];

    // Remove /ws suffix if present
    if ([httpUrl hasSuffix:@"/ws"]) {
        httpUrl = [httpUrl substringToIndex:httpUrl.length - 3];
    }

    // Construct the MCP URL
    NSString *mcpUrl = [NSString stringWithFormat:@"%@/mcp/%@", httpUrl, endpointUuid];

    // Copy to clipboard
    NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
    [pasteboard clearContents];
    [pasteboard setString:mcpUrl forType:NSPasteboardTypeString];

    [self debugLog:[NSString stringWithFormat:@"MCP URL copied to clipboard: %@", mcpUrl]];
}

@end

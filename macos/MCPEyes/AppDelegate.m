/**
 * MCP-Eyes App Delegate Implementation
 * Runs as a menu bar app with status icon and native settings window
 */

#import "AppDelegate.h"
#import <ServiceManagement/ServiceManagement.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Security/Security.h>
#import <signal.h>

// Settings keys for UserDefaults
static NSString * const kAgentNameKey = @"AgentName";
static NSString * const kNetworkModeKey = @"NetworkMode";
static NSString * const kPortKey = @"Port";
static NSString * const kAPIKeyKey = @"APIKey";
static NSString * const kControlServerModeKey = @"ControlServerMode";
static NSString * const kControlServerAddressKey = @"ControlServerAddress";
static NSString * const kControlServerKeyKey = @"ControlServerKey";

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
- (CGFloat)addCategoryBox:(NSString *)categoryName categoryId:(NSString *)categoryId tools:(NSArray *)tools toView:(NSView *)documentView atY:(CGFloat)y;
- (void)categoryToggleChanged:(NSButton *)sender;
- (void)toolToggleChanged:(NSButton *)sender;
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
    self.statusItem.button.toolTip = @"MCP-Eyes Agent";

    // Create menu
    [self createStatusMenu];
    self.statusItem.menu = self.statusMenu;

    // Create settings window
    [self createSettingsWindow];

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
}

- (void)applicationWillTerminate:(NSNotification *)notification {
    self.isAppTerminating = YES;
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

    NSMenuItem *headerItem = [[NSMenuItem alloc] initWithTitle:@"MCP-Eyes Agent"
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

    NSMenuItem *quitItem = [[NSMenuItem alloc] initWithTitle:@"Quit MCP-Eyes"
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

    self.settingsWindow.title = @"MCP-Eyes Settings";
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
    NSBox *controlServerBox = [[NSBox alloc] initWithFrame:NSMakeRect(padding, y - 140, tabWidth - padding * 2, 150)];
    controlServerBox.title = @"Control Server (Remote Mode)";
    controlServerBox.titlePosition = NSAtTop;
    [tabView addSubview:controlServerBox];

    boxY = 100;

    NSTextField *controlModeLabel = [self createLabel:@"Mode:"
                                                 frame:NSMakeRect(boxPadding, boxY, labelWidth, rowHeight)];
    [controlServerBox addSubview:controlModeLabel];

    self.controlServerModePopup = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(boxPadding + labelWidth, boxY, controlWidth - 20, 24)];
    [self.controlServerModePopup addItemsWithTitles:@[@"Disabled", @"Auto (Bonjour)", @"Manual (WAN)"]];
    NSString *savedControlMode = [self loadSetting:kControlServerModeKey defaultValue:@"disabled"];
    if ([savedControlMode isEqualToString:@"auto"]) {
        [self.controlServerModePopup selectItemAtIndex:1];
    } else if ([savedControlMode isEqualToString:@"manual"]) {
        [self.controlServerModePopup selectItemAtIndex:2];
    }
    [self.controlServerModePopup setTarget:self];
    [self.controlServerModePopup setAction:@selector(controlServerModeChanged:)];
    [controlServerBox addSubview:self.controlServerModePopup];

    // Initialize field states based on saved mode
    BOOL manualMode = ([savedControlMode isEqualToString:@"manual"]);
    self.controlServerAddressField.enabled = manualMode;
    self.controlServerKeyField.enabled = manualMode;
    self.testConnectionButton.enabled = manualMode;
    boxY -= rowHeight + 5;

    NSTextField *serverAddressLabel = [self createLabel:@"Server Address:"
                                                  frame:NSMakeRect(boxPadding, boxY, labelWidth, rowHeight)];
    [controlServerBox addSubview:serverAddressLabel];

    self.controlServerAddressField = [[NSTextField alloc] initWithFrame:NSMakeRect(boxPadding + labelWidth, boxY, controlWidth - 20, 24)];
    self.controlServerAddressField.placeholderString = @"control.example.com:3457 or 192.168.1.100:3457";
    self.controlServerAddressField.stringValue = [self loadSetting:kControlServerAddressKey defaultValue:@""];
    self.controlServerAddressField.delegate = self;
    [controlServerBox addSubview:self.controlServerAddressField];
    boxY -= rowHeight + 5;

    NSTextField *serverKeyLabel = [self createLabel:@"Secure Key:"
                                               frame:NSMakeRect(boxPadding, boxY, labelWidth, rowHeight)];
    [controlServerBox addSubview:serverKeyLabel];

    self.controlServerKeyField = [[NSTextField alloc] initWithFrame:NSMakeRect(boxPadding + labelWidth, boxY, controlWidth - 100, 24)];
    self.controlServerKeyField.placeholderString = @"agt_...";
    self.controlServerKeyField.stringValue = [self loadSetting:kControlServerKeyKey defaultValue:@""];
    self.controlServerKeyField.delegate = self;
    self.controlServerKeyField.font = [NSFont monospacedSystemFontOfSize:11 weight:NSFontWeightRegular];
    [controlServerBox addSubview:self.controlServerKeyField];

    // Test connection button
    self.testConnectionButton = [[NSButton alloc] initWithFrame:NSMakeRect(boxPadding + labelWidth + controlWidth - 95, boxY, 80, 24)];
    self.testConnectionButton.title = @"Test";
    self.testConnectionButton.bezelStyle = NSBezelStyleRounded;
    self.testConnectionButton.target = self;
    self.testConnectionButton.action = @selector(testControlServerConnection:);
    [controlServerBox addSubview:self.testConnectionButton];
    boxY -= rowHeight + 5;

    // Connection status label
    self.connectionStatusLabel = [self createLabel:@"Status: Not connected"
                                             frame:NSMakeRect(boxPadding, boxY, controlWidth, 20)];
    self.connectionStatusLabel.textColor = [NSColor secondaryLabelColor];
    [controlServerBox addSubview:self.connectionStatusLabel];

    y -= 150;

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
    NSString *mcpEyesDir = [appSupportDir stringByAppendingPathComponent:@"MCPEyes"];

    // Create directory if it doesn't exist
    NSFileManager *fileManager = [NSFileManager defaultManager];
    if (![fileManager fileExistsAtPath:mcpEyesDir]) {
        [fileManager createDirectoryAtPath:mcpEyesDir withIntermediateDirectories:YES attributes:nil error:nil];
    }

    return [mcpEyesDir stringByAppendingPathComponent:kToolsConfigFilename];
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
    [self saveSetting:kAgentNameKey value:self.agentNameField.stringValue];

    NSInteger modeIndex = self.networkModePopup.indexOfSelectedItem;
    NSString *mode = @"localhost";
    if (modeIndex == 1) mode = @"lan";
    else if (modeIndex == 2) mode = @"wan";
    [self saveSetting:kNetworkModeKey value:mode];

    [self saveSetting:kPortKey value:self.portField.stringValue];

    // Save control server settings
    NSInteger controlModeIndex = self.controlServerModePopup.indexOfSelectedItem;
    NSString *controlMode = @"disabled";
    if (controlModeIndex == 1) controlMode = @"auto";
    else if (controlModeIndex == 2) controlMode = @"manual";
    [self saveSetting:kControlServerModeKey value:controlMode];
    [self saveSetting:kControlServerAddressKey value:self.controlServerAddressField.stringValue];
    [self saveSetting:kControlServerKeyKey value:self.controlServerKeyField.stringValue];

    // Save tools configuration
    [self saveToolsConfig];

    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"Settings Saved";
    alert.informativeText = @"Your settings have been saved. Restart the agent for changes to take effect.";
    alert.alertStyle = NSAlertStyleInformational;
    [alert addButtonWithTitle:@"OK"];
    [alert addButtonWithTitle:@"Restart Now"];

    NSModalResponse response = [alert runModal];
    if (response == NSAlertSecondButtonReturn) {
        [self restartAgent];
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

- (void)controlServerModeChanged:(id)sender {
    NSInteger modeIndex = self.controlServerModePopup.indexOfSelectedItem;
    
    // Enable/disable fields based on mode
    BOOL manualMode = (modeIndex == 2);
    self.controlServerAddressField.enabled = manualMode;
    self.controlServerKeyField.enabled = manualMode;
    self.testConnectionButton.enabled = manualMode;
    
    if (modeIndex == 2) {
        // Manual mode - show warning
        NSAlert *alert = [[NSAlert alloc] init];
        alert.messageText = @"Manual Control Server Mode";
        alert.informativeText = @"In manual mode, you must:\n\n"
                                @"1. Enter the control server IP or domain\n"
                                @"2. Provide a secure key (Argon2 encrypted)\n"
                                @"3. Ensure the control server is accessible\n\n"
                                @"The agent will connect to the control server and become controllable remotely.";
        alert.alertStyle = NSAlertStyleInformational;
        [alert addButtonWithTitle:@"OK"];
        [alert runModal];
    }
}

- (void)testControlServerConnection:(id)sender {
    NSString *address = self.controlServerAddressField.stringValue;
    if (address.length == 0) {
        NSAlert *alert = [[NSAlert alloc] init];
        alert.messageText = @"Missing Server Address";
        alert.informativeText = @"Please enter a control server address.";
        alert.alertStyle = NSAlertStyleWarning;
        [alert addButtonWithTitle:@"OK"];
        [alert runModal];
        return;
    }

    // Parse address (may include port)
    NSString *urlString = address;
    if (![urlString hasPrefix:@"http://"] && ![urlString hasPrefix:@"https://"]) {
        urlString = [NSString stringWithFormat:@"http://%@", address];
    }
    
    // Ensure port is included
    if (![urlString containsString:@":"]) {
        urlString = [urlString stringByAppendingString:@":3457"];
    }

    NSURL *testURL = [NSURL URLWithString:[NSString stringWithFormat:@"%@/api/test", urlString]];
    if (!testURL) {
        self.connectionStatusLabel.stringValue = @"Status: Invalid address";
        self.connectionStatusLabel.textColor = [NSColor systemRedColor];
        return;
    }

    self.testConnectionButton.enabled = NO;
    self.connectionStatusLabel.stringValue = @"Status: Testing...";
    self.connectionStatusLabel.textColor = [NSColor systemBlueColor];

    NSURLRequest *request = [NSURLRequest requestWithURL:testURL
                                                 cachePolicy:NSURLRequestUseProtocolCachePolicy
                                             timeoutInterval:10.0];

    NSURLSessionDataTask *task = [self.urlSession dataTaskWithRequest:request
                                                     completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            self.testConnectionButton.enabled = YES;
            
            if (error) {
                self.connectionStatusLabel.stringValue = [NSString stringWithFormat:@"Status: Connection failed - %@", error.localizedDescription];
                self.connectionStatusLabel.textColor = [NSColor systemRedColor];
                self.isRemoteMode = NO;
                [self updateStatusBarIcon:[self isScreenLocked]];
                return;
            }

            NSHTTPURLResponse *httpResponse = (NSHTTPURLResponse *)response;
            if (httpResponse.statusCode == 200 && data) {
                NSError *jsonError;
                NSDictionary *result = [NSJSONSerialization JSONObjectWithData:data options:0 error:&jsonError];
                if (result && [result[@"status"] isEqualToString:@"ok"]) {
                    BOOL isInternal = [result[@"isInternal"] boolValue];
                    NSString *clientIP = result[@"clientIP"] ?: @"unknown";
                    self.connectionStatusLabel.stringValue = [NSString stringWithFormat:@"Status: Connected (%@ - %@)", clientIP, isInternal ? @"Internal" : @"External"];
                    self.connectionStatusLabel.textColor = [NSColor systemGreenColor];
                    self.isRemoteMode = YES;
                    [self updateStatusBarIcon:[self isScreenLocked]];
                } else {
                    self.connectionStatusLabel.stringValue = @"Status: Invalid response";
                    self.connectionStatusLabel.textColor = [NSColor systemRedColor];
                    self.isRemoteMode = NO;
                    [self updateStatusBarIcon:[self isScreenLocked]];
                }
            } else {
                self.connectionStatusLabel.stringValue = [NSString stringWithFormat:@"Status: Server error (%ld)", (long)httpResponse.statusCode];
                self.connectionStatusLabel.textColor = [NSColor systemRedColor];
                self.isRemoteMode = NO;
                [self updateStatusBarIcon:[self isScreenLocked]];
            }
        });
    }];

    [task resume];
}

- (void)checkControlServerConnection {
    NSString *controlMode = [self loadSetting:kControlServerModeKey defaultValue:@"disabled"];
    if ([controlMode isEqualToString:@"disabled"]) {
        self.isRemoteMode = NO;
        [self updateStatusBarIcon:[self isScreenLocked]];
        return;
    }

    if ([controlMode isEqualToString:@"manual"]) {
        // Test connection periodically
        [self testControlServerConnection:nil];
    } else if ([controlMode isEqualToString:@"auto"]) {
        // Bonjour discovery - would need NSNetServiceBrowser implementation
        // For now, just mark as remote mode if auto is enabled
        self.isRemoteMode = YES;
        [self updateStatusBarIcon:[self isScreenLocked]];
    }
}

#pragma mark - Agent Management

- (void)startAgent {
    NSLog(@"MCP-Eyes Agent starting...");

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
    NSLog(@"MCP-Eyes Agent stopped");
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
    NSString *tokenPath = [NSHomeDirectory() stringByAppendingPathComponent:@".mcp-eyes-token"];
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
        self.statusItem.button.toolTip = @"MCP-Eyes Agent";
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
    NSString *devPath = [NSHomeDirectory() stringByAppendingPathComponent:@"dev/mcp_eyes/dist/browser-bridge-server.js"];
    if ([[NSFileManager defaultManager] fileExistsAtPath:devPath]) {
        return devPath;
    }

    // Check bundle resources
    NSString *bundlePath = [[NSBundle mainBundle] pathForResource:@"browser-bridge-server" ofType:@"js"];
    if (bundlePath) {
        return bundlePath;
    }

    // Fallback to npm global install
    NSString *npmPath = @"/usr/local/lib/node_modules/mcp-eyes/dist/browser-bridge-server.js";
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

@end

/**
 * MCP-Eyes App Delegate Implementation
 * Runs as a menu bar app with status icon and native settings window
 */

#import "AppDelegate.h"
#import <ServiceManagement/ServiceManagement.h>
#import <ApplicationServices/ApplicationServices.h>
#import <Security/Security.h>

// Settings keys for UserDefaults
static NSString * const kAgentNameKey = @"AgentName";
static NSString * const kNetworkModeKey = @"NetworkMode";
static NSString * const kPortKey = @"Port";
static NSString * const kAPIKeyKey = @"APIKey";
static NSString * const kControlServerModeKey = @"ControlServerMode";
static NSString * const kControlServerAddressKey = @"ControlServerAddress";
static NSString * const kControlServerKeyKey = @"ControlServerKey";

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
@end

@implementation AppDelegate

#pragma mark - Application Lifecycle

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    self.startTime = [NSDate date];

    // Initialize URL session for control server connections
    NSURLSessionConfiguration *config = [NSURLSessionConfiguration defaultSessionConfiguration];
    config.timeoutIntervalForRequest = 10.0;
    self.urlSession = [NSURLSession sessionWithConfiguration:config];

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
    [self stopAgent];
    [self.statusTimer invalidate];
}

#pragma mark - Googly Eyes Icon

- (void)updateStatusBarIcon:(BOOL)locked {
    // Load app icon from bundle (uses the icon from Assets.xcassets)
    NSImage *appIcon = [[NSWorkspace sharedWorkspace] iconForFile:[NSBundle mainBundle].bundlePath];
    
    // If that doesn't work, try loading from asset catalog directly
    if (!appIcon || appIcon.size.width == 0) {
        appIcon = [NSImage imageNamed:@"AppIcon"];
    }
    
    // Menu bar icon size (standard macOS menu bar height is 22 points)
    // For Retina displays, this will automatically scale to 44x44 pixels
    CGFloat menuBarSize = 22.0;
    
    if (appIcon && appIcon.size.width > 0) {
        // Create a resized version for the menu bar
        NSImage *menuBarIcon = [[NSImage alloc] initWithSize:NSMakeSize(menuBarSize, menuBarSize)];
        [menuBarIcon lockFocus];
        
        // Draw the app icon scaled to menu bar size with high quality
        NSGraphicsContext *context = [NSGraphicsContext currentContext];
        [context setImageInterpolation:NSImageInterpolationHigh];
        
        [appIcon drawInRect:NSMakeRect(0, 0, menuBarSize, menuBarSize)
                    fromRect:NSZeroRect
                   operation:NSCompositingOperationSourceOver
                    fraction:1.0];
        
        // If locked, draw X overlay
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
        
        [menuBarIcon unlockFocus];
        [menuBarIcon setTemplate:NO]; // Keep original colors from PNG
        self.statusItem.button.image = menuBarIcon;
    } else {
        // Fallback: create a simple placeholder if icon can't be loaded
        NSImage *fallbackImage = [[NSImage alloc] initWithSize:NSMakeSize(menuBarSize, menuBarSize)];
        [fallbackImage lockFocus];
        [[NSColor systemGrayColor] setFill];
        NSRectFill(NSMakeRect(0, 0, menuBarSize, menuBarSize));
        [fallbackImage unlockFocus];
        self.statusItem.button.image = fallbackImage;
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
    CGFloat windowWidth = 480;
    CGFloat windowHeight = 670;

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

    CGFloat padding = 20;
    CGFloat labelWidth = 120;
    CGFloat controlWidth = windowWidth - padding * 2 - labelWidth - 10;
    CGFloat rowHeight = 30;
    CGFloat y = windowHeight - 50;

    // Title
    NSTextField *titleLabel = [self createLabel:@"MCP-Eyes Agent Settings"
                                          frame:NSMakeRect(padding, y, windowWidth - padding * 2, 24)];
    titleLabel.font = [NSFont boldSystemFontOfSize:16];
    [contentView addSubview:titleLabel];
    y -= 40;

    // Agent Configuration Section
    NSBox *configBox = [[NSBox alloc] initWithFrame:NSMakeRect(padding, y - 140, windowWidth - padding * 2, 150)];
    configBox.title = @"Agent Configuration";
    configBox.titlePosition = NSAtTop;
    [contentView addSubview:configBox];

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
    NSBox *securityBox = [[NSBox alloc] initWithFrame:NSMakeRect(padding, y - 90, windowWidth - padding * 2, 100)];
    securityBox.title = @"Security";
    securityBox.titlePosition = NSAtTop;
    [contentView addSubview:securityBox];

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
    NSBox *controlServerBox = [[NSBox alloc] initWithFrame:NSMakeRect(padding, y - 140, windowWidth - padding * 2, 150)];
    controlServerBox.title = @"Control Server (Remote Mode)";
    controlServerBox.titlePosition = NSAtTop;
    [contentView addSubview:controlServerBox];

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

    // Permissions Section
    NSBox *permBox = [[NSBox alloc] initWithFrame:NSMakeRect(padding, y - 90, windowWidth - padding * 2, 100)];
    permBox.title = @"Permissions";
    permBox.titlePosition = NSAtTop;
    [contentView addSubview:permBox];

    boxY = 55;

    self.accessibilityIndicator = [[NSImageView alloc] initWithFrame:NSMakeRect(boxPadding, boxY, 20, 20)];
    [permBox addSubview:self.accessibilityIndicator];

    self.accessibilityLabel = [self createLabel:@"Accessibility"
                                          frame:NSMakeRect(boxPadding + 25, boxY, 150, 20)];
    [permBox addSubview:self.accessibilityLabel];

    NSButton *grantAccessBtn = [[NSButton alloc] initWithFrame:NSMakeRect(windowWidth - padding * 2 - 100, boxY, 80, 24)];
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

    NSButton *grantScreenBtn = [[NSButton alloc] initWithFrame:NSMakeRect(windowWidth - padding * 2 - 100, boxY, 80, 24)];
    grantScreenBtn.title = @"Grant";
    grantScreenBtn.bezelStyle = NSBezelStyleRounded;
    grantScreenBtn.target = self;
    grantScreenBtn.action = @selector(openScreenRecordingPrefs:);
    [permBox addSubview:grantScreenBtn];

    y -= 110;

    // Status Section
    NSBox *statusBox = [[NSBox alloc] initWithFrame:NSMakeRect(padding, y - 70, windowWidth - padding * 2, 80)];
    statusBox.title = @"Status";
    statusBox.titlePosition = NSAtTop;
    [contentView addSubview:statusBox];

    boxY = 35;

    self.statusLabel = [self createLabel:@"Server: Starting..."
                                   frame:NSMakeRect(boxPadding, boxY, windowWidth - padding * 2 - boxPadding * 2, 20)];
    [statusBox addSubview:self.statusLabel];
    boxY -= 25;

    self.uptimeLabel = [self createLabel:@"Uptime: 0s"
                                   frame:NSMakeRect(boxPadding, boxY, windowWidth - padding * 2 - boxPadding * 2, 20)];
    self.uptimeLabel.textColor = [NSColor secondaryLabelColor];
    [statusBox addSubview:self.uptimeLabel];

    // Save Button
    NSButton *saveButton = [[NSButton alloc] initWithFrame:NSMakeRect(windowWidth - padding - 100, 15, 90, 32)];
    saveButton.title = @"Save";
    saveButton.bezelStyle = NSBezelStyleRounded;
    saveButton.keyEquivalent = @"\r";
    saveButton.target = self;
    saveButton.action = @selector(saveSettings:);
    [contentView addSubview:saveButton];

    [self updatePermissionIndicators];
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
    NSMenuItem *statusItem = [self.statusMenu itemWithTag:100];
    BOOL screenLocked = [self isScreenLocked];
    [self updateStatusBarIcon:screenLocked];

    BOOL running = self.mcpServer.isRunning;
    NSString *port = [self loadSetting:kPortKey defaultValue:@"3456"];

    if (screenLocked) {
        statusItem.title = @"Screen Locked - waiting...";
    } else if (running) {
        NSString *mode = self.isRemoteMode ? @" (Remote)" : @"";
        statusItem.title = [NSString stringWithFormat:@"Running on port %@%@", port, mode];
    } else {
        statusItem.title = @"Stopped";
    }

    if (self.settingsWindow.isVisible) {
        [self updateSettingsWindowStatus];
    }

    [self checkPermissions];
    
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

    [self updatePermissionIndicators];
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
    BOOL hasAccessibility = AXIsProcessTrusted();
    BOOL hasScreenRecording = NO;
    if (@available(macOS 10.15, *)) {
        hasScreenRecording = CGPreflightScreenCaptureAccess();
    } else {
        hasScreenRecording = YES;
    }

    // Update accessibility indicator
    self.accessibilityLabel.stringValue = @"Accessibility";
    if (hasAccessibility) {
        self.accessibilityIndicator.image = [NSImage imageWithSystemSymbolName:@"checkmark.circle.fill" accessibilityDescription:@"Granted"];
        self.accessibilityIndicator.contentTintColor = [NSColor systemGreenColor];
    } else {
        self.accessibilityIndicator.image = [NSImage imageWithSystemSymbolName:@"xmark.circle.fill" accessibilityDescription:@"Not Granted"];
        self.accessibilityIndicator.contentTintColor = [NSColor systemRedColor];
    }

    // Update screen recording indicator
    self.screenRecordingLabel.stringValue = @"Screen Recording";
    if (hasScreenRecording) {
        self.screenRecordingIndicator.image = [NSImage imageWithSystemSymbolName:@"checkmark.circle.fill" accessibilityDescription:@"Granted"];
        self.screenRecordingIndicator.contentTintColor = [NSColor systemGreenColor];
    } else {
        self.screenRecordingIndicator.image = [NSImage imageWithSystemSymbolName:@"xmark.circle.fill" accessibilityDescription:@"Not Granted"];
        self.screenRecordingIndicator.contentTintColor = [NSColor systemRedColor];
    }
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

@end

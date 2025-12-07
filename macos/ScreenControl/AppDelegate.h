/**
 * MCP-Eyes App Delegate
 * Menu bar app with status icon, native settings window, and HTTP server
 */

#import <Cocoa/Cocoa.h>
#import "MCPServer.h"

@interface AppDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate, NSTextFieldDelegate, MCPServerDelegate>

// Status bar
@property (strong, nonatomic) NSStatusItem *statusItem;
@property (strong, nonatomic) NSMenu *statusMenu;

// Settings window
@property (strong, nonatomic) NSWindow *settingsWindow;
@property (strong, nonatomic) NSTabView *settingsTabView;

// Tools configuration
@property (strong, nonatomic) NSMutableDictionary *toolsConfig;
@property (strong, nonatomic) NSScrollView *toolsScrollView;
@property (strong, nonatomic) NSMutableDictionary *categoryToggles;
@property (strong, nonatomic) NSMutableDictionary *toolToggles;

// Settings controls
@property (strong, nonatomic) NSTextField *agentNameField;
@property (strong, nonatomic) NSPopUpButton *networkModePopup;
@property (strong, nonatomic) NSTextField *portField;
@property (strong, nonatomic) NSTextField *apiKeyField;
@property (strong, nonatomic) NSButton *regenerateKeyButton;
@property (strong, nonatomic) NSButton *duplicateKeyButton;

// Control server settings
@property (strong, nonatomic) NSPopUpButton *controlServerModePopup;
@property (strong, nonatomic) NSTextField *controlServerAddressField;
@property (strong, nonatomic) NSTextField *controlServerKeyField;
@property (strong, nonatomic) NSButton *testConnectionButton;
@property (strong, nonatomic) NSTextField *connectionStatusLabel;

// Permission indicators
@property (strong, nonatomic) NSImageView *accessibilityIndicator;
@property (strong, nonatomic) NSImageView *screenRecordingIndicator;
@property (strong, nonatomic) NSTextField *accessibilityLabel;
@property (strong, nonatomic) NSTextField *screenRecordingLabel;

// Status display
@property (strong, nonatomic) NSTextField *statusLabel;
@property (strong, nonatomic) NSTextField *uptimeLabel;

// Browser bridge server process
@property (strong, nonatomic) NSTask *browserBridgeTask;
@property (strong, nonatomic) NSPipe *browserBridgePipe;

// Debug/ScreenControl WebSocket connection
@property (strong, nonatomic) NSTextField *debugServerUrlField;
@property (strong, nonatomic) NSTextField *debugEndpointUuidField;
@property (strong, nonatomic) NSTextField *debugCustomerIdField;
@property (strong, nonatomic) NSButton *debugConnectButton;
@property (strong, nonatomic) NSButton *debugDisconnectButton;
@property (strong, nonatomic) NSTextField *debugConnectionStatusLabel;
@property (strong, nonatomic) NSTextField *debugLicenseStatusLabel;
@property (strong, nonatomic) NSTextField *debugAgentIdLabel;
@property (strong, nonatomic) NSTextView *debugLogView;
@property (strong, nonatomic) NSURLSessionWebSocketTask *debugWebSocketTask;
@property (strong, nonatomic) NSTimer *debugHeartbeatTimer;
@property (assign, nonatomic) BOOL debugIsConnected;

@end

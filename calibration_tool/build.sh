#!/bin/bash
# Build script for MouseCalibration app

set -e

echo "Building MouseCalibration..."

# Build release
swift build -c release

# Create app bundle
mkdir -p MouseCalibration.app/Contents/MacOS
mkdir -p MouseCalibration.app/Contents/Resources

# Copy executable
cp .build/release/MouseCalibration MouseCalibration.app/Contents/MacOS/

# Create Info.plist if not exists
if [ ! -f MouseCalibration.app/Contents/Info.plist ]; then
cat > MouseCalibration.app/Contents/Info.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>MouseCalibration</string>
    <key>CFBundleIdentifier</key>
    <string>com.screencontrol.mousecalibration</string>
    <key>CFBundleName</key>
    <string>MouseCalibration</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
</dict>
</plist>
EOF
fi

# Sign the app (ad-hoc)
codesign --force --deep --sign - MouseCalibration.app

echo "Build complete: MouseCalibration.app"
echo ""
echo "To run: open MouseCalibration.app"
echo "Or: ./MouseCalibration.app/Contents/MacOS/MouseCalibration"

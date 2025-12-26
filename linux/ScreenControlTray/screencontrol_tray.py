#!/usr/bin/env python3
"""
ScreenControl Tray Application for Linux

A system tray application that provides:
- System tray icon with status indication
- GUI bridge server on port 3460 for screenshot/input operations
- Settings and service control

Supports both GNOME (with AppIndicator) and KDE Plasma desktops.

Requirements:
    sudo apt install python3-gi python3-gi-cairo gir1.2-gtk-3.0 \
        gir1.2-ayatanaappindicator3-0.1 python3-pil python3-xlib \
        python3-requests xdotool scrot
"""

import gi
gi.require_version('Gtk', '3.0')

# Try AyatanaAppIndicator first (newer), fall back to AppIndicator3
try:
    gi.require_version('AyatanaAppIndicator3', '0.1')
    from gi.repository import AyatanaAppIndicator3 as AppIndicator3
    INDICATOR_TYPE = 'ayatana'
except (ValueError, ImportError):
    try:
        gi.require_version('AppIndicator3', '0.1')
        from gi.repository import AppIndicator3
        INDICATOR_TYPE = 'appindicator'
    except (ValueError, ImportError):
        AppIndicator3 = None
        INDICATOR_TYPE = 'none'

from gi.repository import Gtk, GLib, GdkPixbuf, Gdk
import os
import sys
import json
import signal
import threading
import subprocess
import tempfile
import base64
import io
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('/tmp/screencontrol-tray.log')
    ]
)
logger = logging.getLogger(__name__)

# Constants
APP_ID = "com.screencontrol.tray"
APP_NAME = "ScreenControl"
GUI_BRIDGE_PORT = 3460
SERVICE_PORT = 3459
VERSION = "1.2.0"

# Icon paths (will be set based on installation)
ICON_CONNECTED = "screencontrol-connected"
ICON_DISCONNECTED = "screencontrol-disconnected"
ICON_FALLBACK = "network-transmit-receive"


class ScreenController:
    """Handles screen capture and input simulation."""

    def __init__(self):
        self.display = None
        self._init_display()

    def _init_display(self):
        """Initialize X11 display connection."""
        try:
            from Xlib import display, X
            self.display = display.Display()
            self.screen = self.display.screen()
            self.root = self.screen.root
            logger.info("X11 display initialized")
        except Exception as e:
            logger.warning(f"X11 initialization failed: {e}")
            self.display = None

    def take_screenshot(self, format='jpeg', quality=80):
        """Capture the entire screen."""
        try:
            # Try using scrot (most reliable across desktops)
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
                tmp_path = f.name

            # Use scrot for GNOME/X11, or grim for Wayland
            if os.environ.get('XDG_SESSION_TYPE') == 'wayland':
                # Try grim for Wayland
                result = subprocess.run(['grim', tmp_path], capture_output=True)
                if result.returncode != 0:
                    # Fall back to gnome-screenshot
                    subprocess.run(['gnome-screenshot', '-f', tmp_path], capture_output=True)
            else:
                # X11 - use scrot
                subprocess.run(['scrot', '-o', tmp_path], capture_output=True, check=True)

            # Read and convert image
            from PIL import Image
            img = Image.open(tmp_path)

            # Convert to requested format
            output = io.BytesIO()
            if format.lower() == 'jpeg':
                if img.mode == 'RGBA':
                    img = img.convert('RGB')
                img.save(output, format='JPEG', quality=quality)
            else:
                img.save(output, format='PNG')

            # Clean up
            os.unlink(tmp_path)

            return output.getvalue()
        except Exception as e:
            logger.error(f"Screenshot failed: {e}")
            raise

    def move_mouse(self, x, y):
        """Move mouse to absolute coordinates."""
        try:
            subprocess.run(['xdotool', 'mousemove', str(int(x)), str(int(y))], check=True)
            return True
        except Exception as e:
            logger.error(f"Mouse move failed: {e}")
            return False

    def click(self, x, y, button='left'):
        """Click at coordinates."""
        try:
            btn = {'left': '1', 'right': '3', 'middle': '2'}.get(button, '1')
            subprocess.run(['xdotool', 'mousemove', str(int(x)), str(int(y))], check=True)
            subprocess.run(['xdotool', 'click', btn], check=True)
            return True
        except Exception as e:
            logger.error(f"Click failed: {e}")
            return False

    def double_click(self, x, y):
        """Double-click at coordinates."""
        try:
            subprocess.run(['xdotool', 'mousemove', str(int(x)), str(int(y))], check=True)
            subprocess.run(['xdotool', 'click', '--repeat', '2', '1'], check=True)
            return True
        except Exception as e:
            logger.error(f"Double-click failed: {e}")
            return False

    def scroll(self, direction='down', amount=3):
        """Scroll mouse wheel."""
        try:
            btn = '5' if direction == 'down' else '4'
            subprocess.run(['xdotool', 'click', '--repeat', str(amount), btn], check=True)
            return True
        except Exception as e:
            logger.error(f"Scroll failed: {e}")
            return False

    def drag(self, start_x, start_y, end_x, end_y):
        """Drag from one point to another."""
        try:
            subprocess.run(['xdotool', 'mousemove', str(int(start_x)), str(int(start_y))], check=True)
            subprocess.run(['xdotool', 'mousedown', '1'], check=True)
            subprocess.run(['xdotool', 'mousemove', str(int(end_x)), str(int(end_y))], check=True)
            subprocess.run(['xdotool', 'mouseup', '1'], check=True)
            return True
        except Exception as e:
            logger.error(f"Drag failed: {e}")
            return False

    def get_mouse_position(self):
        """Get current mouse position."""
        try:
            result = subprocess.run(['xdotool', 'getmouselocation'], capture_output=True, text=True, check=True)
            # Parse "x:123 y:456 screen:0 window:12345"
            parts = result.stdout.strip().split()
            x = int(parts[0].split(':')[1])
            y = int(parts[1].split(':')[1])
            return {'x': x, 'y': y}
        except Exception as e:
            logger.error(f"Get mouse position failed: {e}")
            return {'x': 0, 'y': 0}

    def type_text(self, text):
        """Type text using keyboard."""
        try:
            subprocess.run(['xdotool', 'type', '--clearmodifiers', text], check=True)
            return True
        except Exception as e:
            logger.error(f"Type text failed: {e}")
            return False

    def press_key(self, key):
        """Press a specific key."""
        try:
            # Map common key names to xdotool format
            key_map = {
                'enter': 'Return',
                'return': 'Return',
                'tab': 'Tab',
                'escape': 'Escape',
                'esc': 'Escape',
                'backspace': 'BackSpace',
                'delete': 'Delete',
                'space': 'space',
                'up': 'Up',
                'down': 'Down',
                'left': 'Left',
                'right': 'Right',
                'home': 'Home',
                'end': 'End',
                'pageup': 'Page_Up',
                'pagedown': 'Page_Down',
            }
            xdo_key = key_map.get(key.lower(), key)
            subprocess.run(['xdotool', 'key', xdo_key], check=True)
            return True
        except Exception as e:
            logger.error(f"Press key failed: {e}")
            return False

    def get_windows(self):
        """Get list of open windows."""
        try:
            result = subprocess.run(
                ['wmctrl', '-l', '-p'],
                capture_output=True, text=True, check=True
            )
            windows = []
            for line in result.stdout.strip().split('\n'):
                if line:
                    parts = line.split(None, 4)
                    if len(parts) >= 5:
                        windows.append({
                            'id': parts[0],
                            'desktop': parts[1],
                            'pid': parts[2],
                            'machine': parts[3],
                            'title': parts[4] if len(parts) > 4 else ''
                        })
            return windows
        except Exception as e:
            logger.error(f"Get windows failed: {e}")
            return []

    def focus_window(self, window_id):
        """Focus a window by ID."""
        try:
            subprocess.run(['wmctrl', '-i', '-a', window_id], check=True)
            return True
        except Exception as e:
            logger.error(f"Focus window failed: {e}")
            return False


class GUIBridgeHandler(BaseHTTPRequestHandler):
    """HTTP handler for GUI bridge server."""

    controller = None

    def log_message(self, format, *args):
        logger.debug(f"HTTP: {args[0]}")

    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _send_image(self, data, content_type='image/jpeg'):
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length:
            return json.loads(self.rfile.read(content_length))
        return {}

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        try:
            if path == '/health':
                self._send_json({'status': 'ok', 'service': 'screencontrol-gui-bridge'})

            elif path == '/screenshot':
                fmt = params.get('format', ['jpeg'])[0]
                quality = int(params.get('quality', [80])[0])
                return_base64 = params.get('return_base64', ['false'])[0].lower() == 'true'

                image_data = self.controller.take_screenshot(format=fmt, quality=quality)

                if return_base64:
                    b64 = base64.b64encode(image_data).decode()
                    self._send_json({
                        'success': True,
                        'format': fmt,
                        'data': b64
                    })
                else:
                    content_type = 'image/jpeg' if fmt == 'jpeg' else 'image/png'
                    self._send_image(image_data, content_type)

            elif path == '/mouse/position':
                pos = self.controller.get_mouse_position()
                self._send_json({'success': True, **pos})

            elif path == '/ui/windows':
                windows = self.controller.get_windows()
                self._send_json({'success': True, 'windows': windows})

            else:
                self._send_json({'error': 'Not found'}, 404)

        except Exception as e:
            logger.error(f"GET {path} error: {e}")
            self._send_json({'error': str(e)}, 500)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            data = self._read_json()

            if path == '/click':
                x = data.get('x', 0)
                y = data.get('y', 0)
                button = data.get('button', 'left')
                success = self.controller.click(x, y, button)
                self._send_json({'success': success})

            elif path == '/double_click':
                x = data.get('x', 0)
                y = data.get('y', 0)
                success = self.controller.double_click(x, y)
                self._send_json({'success': success})

            elif path == '/mouse/move':
                x = data.get('x', 0)
                y = data.get('y', 0)
                success = self.controller.move_mouse(x, y)
                self._send_json({'success': success})

            elif path == '/mouse/scroll':
                direction = data.get('direction', 'down')
                amount = data.get('amount', 3)
                success = self.controller.scroll(direction, amount)
                self._send_json({'success': success})

            elif path == '/mouse/drag':
                success = self.controller.drag(
                    data.get('startX', 0),
                    data.get('startY', 0),
                    data.get('endX', 0),
                    data.get('endY', 0)
                )
                self._send_json({'success': success})

            elif path == '/keyboard/type':
                text = data.get('text', '')
                success = self.controller.type_text(text)
                self._send_json({'success': success})

            elif path == '/keyboard/key':
                key = data.get('key', '')
                success = self.controller.press_key(key)
                self._send_json({'success': success})

            elif path == '/ui/focus':
                window_id = data.get('windowId', '')
                success = self.controller.focus_window(window_id)
                self._send_json({'success': success})

            else:
                self._send_json({'error': 'Not found'}, 404)

        except Exception as e:
            logger.error(f"POST {path} error: {e}")
            self._send_json({'error': str(e)}, 500)


class GUIBridgeServer:
    """HTTP server for GUI bridge."""

    def __init__(self, port=GUI_BRIDGE_PORT):
        self.port = port
        self.server = None
        self.thread = None
        self.controller = ScreenController()

    def start(self):
        """Start the GUI bridge server."""
        GUIBridgeHandler.controller = self.controller

        try:
            self.server = HTTPServer(('127.0.0.1', self.port), GUIBridgeHandler)
            self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
            self.thread.start()
            logger.info(f"GUI bridge server started on port {self.port}")
            return True
        except Exception as e:
            logger.error(f"Failed to start GUI bridge server: {e}")
            return False

    def stop(self):
        """Stop the GUI bridge server."""
        if self.server:
            self.server.shutdown()
            logger.info("GUI bridge server stopped")


class ScreenControlTray:
    """Main tray application."""

    def __init__(self):
        self.indicator = None
        self.menu = None
        self.gui_bridge = None
        self.connected = False
        self.status_item = None

        # Initialize GUI bridge server
        self.gui_bridge = GUIBridgeServer()

    def create_indicator(self):
        """Create the system tray indicator."""
        if AppIndicator3 is None:
            logger.warning("AppIndicator not available - using fallback status icon")
            return self._create_fallback_icon()

        self.indicator = AppIndicator3.Indicator.new(
            APP_ID,
            ICON_FALLBACK,
            AppIndicator3.IndicatorCategory.APPLICATION_STATUS
        )
        self.indicator.set_status(AppIndicator3.IndicatorStatus.ACTIVE)
        self.indicator.set_title(APP_NAME)

        # Create menu
        self.menu = Gtk.Menu()

        # Status item
        self.status_item = Gtk.MenuItem(label="Status: Checking...")
        self.status_item.set_sensitive(False)
        self.menu.append(self.status_item)

        self.menu.append(Gtk.SeparatorMenuItem())

        # Service control
        start_item = Gtk.MenuItem(label="Start Service")
        start_item.connect("activate", self.on_start_service)
        self.menu.append(start_item)

        stop_item = Gtk.MenuItem(label="Stop Service")
        stop_item.connect("activate", self.on_stop_service)
        self.menu.append(stop_item)

        restart_item = Gtk.MenuItem(label="Restart Service")
        restart_item.connect("activate", self.on_restart_service)
        self.menu.append(restart_item)

        self.menu.append(Gtk.SeparatorMenuItem())

        # Settings
        settings_item = Gtk.MenuItem(label="Settings...")
        settings_item.connect("activate", self.on_settings)
        self.menu.append(settings_item)

        # About
        about_item = Gtk.MenuItem(label="About")
        about_item.connect("activate", self.on_about)
        self.menu.append(about_item)

        self.menu.append(Gtk.SeparatorMenuItem())

        # Quit
        quit_item = Gtk.MenuItem(label="Quit")
        quit_item.connect("activate", self.on_quit)
        self.menu.append(quit_item)

        self.menu.show_all()
        self.indicator.set_menu(self.menu)

        return True

    def _create_fallback_icon(self):
        """Create a fallback Gtk.StatusIcon when AppIndicator is not available."""
        try:
            self.status_icon = Gtk.StatusIcon()
            self.status_icon.set_from_icon_name(ICON_FALLBACK)
            self.status_icon.set_tooltip_text(APP_NAME)
            self.status_icon.connect('popup-menu', self._on_popup_menu)
            self.status_icon.set_visible(True)

            # Create menu
            self.menu = Gtk.Menu()

            self.status_item = Gtk.MenuItem(label="Status: Checking...")
            self.status_item.set_sensitive(False)
            self.menu.append(self.status_item)

            self.menu.append(Gtk.SeparatorMenuItem())

            quit_item = Gtk.MenuItem(label="Quit")
            quit_item.connect("activate", self.on_quit)
            self.menu.append(quit_item)

            self.menu.show_all()

            return True
        except Exception as e:
            logger.error(f"Failed to create fallback icon: {e}")
            return False

    def _on_popup_menu(self, icon, button, time):
        """Handle right-click on status icon."""
        self.menu.popup(None, None, Gtk.StatusIcon.position_menu, icon, button, time)

    def update_status(self):
        """Check service status and update indicator."""
        try:
            response = requests.get(f'http://127.0.0.1:{SERVICE_PORT}/health', timeout=2)
            if response.status_code == 200:
                self.connected = True
                if self.status_item:
                    GLib.idle_add(self.status_item.set_label, "Status: Connected")
                if self.indicator:
                    GLib.idle_add(self.indicator.set_icon_full, ICON_FALLBACK, "Connected")
            else:
                self.connected = False
                if self.status_item:
                    GLib.idle_add(self.status_item.set_label, "Status: Disconnected")
        except:
            self.connected = False
            if self.status_item:
                GLib.idle_add(self.status_item.set_label, "Status: Service not running")

        # Schedule next check
        return True

    def on_start_service(self, widget):
        """Start the ScreenControl service."""
        try:
            subprocess.run(['sudo', 'systemctl', 'start', 'screencontrol'], check=True)
            self.show_notification("Service Started", "ScreenControl service has been started.")
        except Exception as e:
            self.show_notification("Error", f"Failed to start service: {e}")

    def on_stop_service(self, widget):
        """Stop the ScreenControl service."""
        try:
            subprocess.run(['sudo', 'systemctl', 'stop', 'screencontrol'], check=True)
            self.show_notification("Service Stopped", "ScreenControl service has been stopped.")
        except Exception as e:
            self.show_notification("Error", f"Failed to stop service: {e}")

    def on_restart_service(self, widget):
        """Restart the ScreenControl service."""
        try:
            subprocess.run(['sudo', 'systemctl', 'restart', 'screencontrol'], check=True)
            self.show_notification("Service Restarted", "ScreenControl service has been restarted.")
        except Exception as e:
            self.show_notification("Error", f"Failed to restart service: {e}")

    def on_settings(self, widget):
        """Open settings dialog."""
        dialog = SettingsDialog()
        dialog.run()
        dialog.destroy()

    def on_about(self, widget):
        """Show about dialog."""
        dialog = Gtk.AboutDialog()
        dialog.set_program_name(APP_NAME)
        dialog.set_version(VERSION)
        dialog.set_comments("Remote desktop control agent for Linux")
        dialog.set_website("https://github.com/screencontrol/screencontrol")
        dialog.run()
        dialog.destroy()

    def on_quit(self, widget):
        """Quit the application."""
        if self.gui_bridge:
            self.gui_bridge.stop()
        Gtk.main_quit()

    def show_notification(self, title, message):
        """Show a desktop notification."""
        try:
            subprocess.run(['notify-send', title, message], check=False)
        except:
            pass

    def run(self):
        """Run the tray application."""
        # Start GUI bridge server
        if not self.gui_bridge.start():
            logger.error("Failed to start GUI bridge server")
            return 1

        # Create indicator
        if not self.create_indicator():
            logger.error("Failed to create system tray indicator")
            return 1

        # Start status check timer
        GLib.timeout_add_seconds(5, self.update_status)
        self.update_status()

        logger.info("ScreenControl tray application started")

        # Handle signals
        signal.signal(signal.SIGINT, lambda s, f: self.on_quit(None))
        signal.signal(signal.SIGTERM, lambda s, f: self.on_quit(None))

        # Run GTK main loop
        Gtk.main()

        return 0


class SettingsDialog(Gtk.Dialog):
    """Settings dialog."""

    def __init__(self):
        super().__init__(title="ScreenControl Settings", flags=0)
        self.add_buttons(Gtk.STOCK_CANCEL, Gtk.ResponseType.CANCEL,
                        Gtk.STOCK_OK, Gtk.ResponseType.OK)

        self.set_default_size(400, 300)

        box = self.get_content_area()
        box.set_spacing(10)
        box.set_margin_start(10)
        box.set_margin_end(10)
        box.set_margin_top(10)
        box.set_margin_bottom(10)

        # Load current settings from service
        self.settings = self.load_settings()

        # Agent name
        name_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        name_label = Gtk.Label(label="Agent Name:")
        name_label.set_xalign(0)
        self.name_entry = Gtk.Entry()
        self.name_entry.set_text(self.settings.get('agentName', ''))
        self.name_entry.set_hexpand(True)
        name_box.pack_start(name_label, False, False, 0)
        name_box.pack_start(self.name_entry, True, True, 0)
        box.pack_start(name_box, False, False, 0)

        # Control server URL
        url_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        url_label = Gtk.Label(label="Control Server:")
        url_label.set_xalign(0)
        self.url_entry = Gtk.Entry()
        self.url_entry.set_text(self.settings.get('controlServerUrl', ''))
        self.url_entry.set_hexpand(True)
        url_box.pack_start(url_label, False, False, 0)
        url_box.pack_start(self.url_entry, True, True, 0)
        box.pack_start(url_box, False, False, 0)

        # Auto-start checkbox
        self.autostart_check = Gtk.CheckButton(label="Start automatically at login")
        self.autostart_check.set_active(self.check_autostart())
        box.pack_start(self.autostart_check, False, False, 0)

        self.show_all()
        self.connect("response", self.on_response)

    def load_settings(self):
        """Load settings from service."""
        try:
            response = requests.get(f'http://127.0.0.1:{SERVICE_PORT}/settings', timeout=2)
            if response.status_code == 200:
                return response.json()
        except:
            pass
        return {}

    def check_autostart(self):
        """Check if autostart is enabled."""
        autostart_dir = os.path.expanduser('~/.config/autostart')
        autostart_file = os.path.join(autostart_dir, 'screencontrol-tray.desktop')
        return os.path.exists(autostart_file)

    def set_autostart(self, enabled):
        """Enable or disable autostart."""
        autostart_dir = os.path.expanduser('~/.config/autostart')
        autostart_file = os.path.join(autostart_dir, 'screencontrol-tray.desktop')

        if enabled:
            os.makedirs(autostart_dir, exist_ok=True)
            desktop_entry = f"""[Desktop Entry]
Type=Application
Name=ScreenControl Tray
Comment=ScreenControl system tray application
Exec=/opt/screencontrol/screencontrol-tray
Icon=network-transmit-receive
Terminal=false
Categories=Utility;
StartupNotify=false
X-GNOME-Autostart-enabled=true
"""
            with open(autostart_file, 'w') as f:
                f.write(desktop_entry)
        else:
            if os.path.exists(autostart_file):
                os.remove(autostart_file)

    def on_response(self, dialog, response):
        """Handle dialog response."""
        if response == Gtk.ResponseType.OK:
            # Save settings to service
            try:
                data = {
                    'agentName': self.name_entry.get_text(),
                    'controlServerUrl': self.url_entry.get_text()
                }
                requests.post(
                    f'http://127.0.0.1:{SERVICE_PORT}/settings',
                    json=data,
                    timeout=2
                )
            except Exception as e:
                logger.error(f"Failed to save settings: {e}")

            # Handle autostart
            self.set_autostart(self.autostart_check.get_active())


def main():
    """Main entry point."""
    # Check for required tools
    required_tools = ['xdotool', 'scrot']
    missing_tools = []

    for tool in required_tools:
        try:
            subprocess.run(['which', tool], capture_output=True, check=True)
        except:
            missing_tools.append(tool)

    if missing_tools:
        logger.warning(f"Missing tools (some features may not work): {', '.join(missing_tools)}")
        logger.info("Install with: sudo apt install " + ' '.join(missing_tools))

    # Create and run application
    app = ScreenControlTray()
    return app.run()


if __name__ == '__main__':
    sys.exit(main())

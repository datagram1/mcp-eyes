# ScreenControl Web Server Setup

Deploy the ScreenControl web application to this server (192.168.10.10).

## Target Configuration

- **Domain**: `screencontrol.knws.co.uk`
- **Install path**: `/var/www/html/screencontrol/web`
- **Node port**: `3001` (Apache proxies 80/443 to this)
- **Web server**: Apache2 with SSL (Let's Encrypt)
- **Database**: PostgreSQL at `192.168.11.3:5432` (already configured in .env)

## GitHub Repository

- **Repo**: `https://github.com/anthropics/mcp_eyes_screen_control` (or the actual repo URL)
- **Branch**: `main`
- **Only need**: the `web/` directory

---

## Step 1: Clone Only the Web Directory

```bash
sudo mkdir -p /var/www/html/screencontrol
cd /var/www/html/screencontrol

# Sparse checkout to get only web/
git init
git remote add origin <REPO_URL>
git sparse-checkout init --cone
git sparse-checkout set web
git pull origin main
```

Alternatively, if the repo is already cloned elsewhere, just copy the `web/` folder.

---

## Step 2: Install Dependencies and Build

```bash
cd /var/www/html/screencontrol/web
npm install
npm run build
```

---

## Step 3: Configure Environment

Create/update `/var/www/html/screencontrol/web/.env`:

```env
# DATABASE
DATABASE_URL="postgresql://keynetworks:K3yn3tw0rk5@192.168.11.3:5432/screencontrol?schema=public"

# NEXTAUTH - UPDATE THESE FOR PRODUCTION
NEXTAUTH_URL="https://screencontrol.knws.co.uk"
NEXTAUTH_SECRET="cB9MSP8ygiBrLUGQZSvAlkoLwsv5RThrwMwjWZyhMFE="

# EMAIL
EMAIL_SERVER_HOST="192.168.10.6"
EMAIL_SERVER_PORT="25"
EMAIL_SERVER_USER=""
EMAIL_SERVER_PASSWORD=""
EMAIL_FROM="noreply@screencontrol.knws.co.uk"

# APPLICATION
NODE_ENV="production"
APP_URL="https://screencontrol.knws.co.uk"
PORT="3001"
```

---

## Step 4: Apache2 Configuration

### 4.1 Enable Required Modules

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite ssl headers
```

### 4.2 Create Virtual Host

Create `/etc/apache2/sites-available/screencontrol.knws.co.uk.conf`:

```apache
<VirtualHost *:80>
    ServerName screencontrol.knws.co.uk

    # Redirect all HTTP to HTTPS
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}$1 [R=301,L]
</VirtualHost>

<VirtualHost *:443>
    ServerName screencontrol.knws.co.uk

    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/screencontrol.knws.co.uk/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/screencontrol.knws.co.uk/privkey.pem

    # Security Headers
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"

    # Proxy to Next.js on port 3001
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:3001/
    ProxyPassReverse / http://127.0.0.1:3001/

    # WebSocket support for agent connections at /ws
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} websocket [NC]
    RewriteCond %{HTTP:Connection} upgrade [NC]
    RewriteRule ^/ws(.*)$ ws://127.0.0.1:3001/ws$1 [P,L]

    # Logging
    ErrorLog ${APACHE_LOG_DIR}/screencontrol_error.log
    CustomLog ${APACHE_LOG_DIR}/screencontrol_access.log combined
</VirtualHost>
```

### 4.3 Enable the Site

```bash
sudo a2ensite screencontrol.knws.co.uk.conf
sudo apache2ctl configtest
```

---

## Step 5: SSL Certificate

Get SSL certificate using certbot:

```bash
# If certbot isn't installed
sudo apt install certbot python3-certbot-apache

# Get certificate (apache plugin or webroot)
sudo certbot certonly --apache -d screencontrol.knws.co.uk

# Or using webroot if Apache is already running
sudo certbot certonly --webroot -w /var/www/html -d screencontrol.knws.co.uk
```

---

## Step 6: Systemd Service for Next.js

Create `/etc/systemd/system/screencontrol.service`:

```ini
[Unit]
Description=ScreenControl Web Application
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/html/screencontrol/web
ExecStart=/usr/bin/node --import tsx server.ts
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
```

**Note**: If `tsx` isn't globally available, use the npm script instead:

```ini
ExecStart=/usr/bin/npm run start
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable screencontrol
sudo systemctl start screencontrol
sudo systemctl status screencontrol
```

---

## Step 7: Restart Apache

```bash
sudo systemctl restart apache2
```

---

## Step 8: Verify

1. Check service is running: `sudo systemctl status screencontrol`
2. Check logs: `sudo journalctl -u screencontrol -f`
3. Test locally: `curl http://127.0.0.1:3001`
4. Test via Apache: `curl -I https://screencontrol.knws.co.uk`
5. Test WebSocket: Browser dev tools on `wss://screencontrol.knws.co.uk/ws`

---

## Updating (Future Deployments)

```bash
cd /var/www/html/screencontrol
git pull origin main
cd web
npm install
npm run build
sudo systemctl restart screencontrol
```

---

## Troubleshooting

### Port already in use
```bash
sudo lsof -i :3001
```

### Check Apache error logs
```bash
sudo tail -f /var/log/apache2/screencontrol_error.log
```

### Check Next.js logs
```bash
sudo journalctl -u screencontrol -f
```

### Database connection issues
Test from server:
```bash
psql -h 192.168.11.3 -U keynetworks -d screencontrol
```

### Permissions
```bash
sudo chown -R www-data:www-data /var/www/html/screencontrol
```

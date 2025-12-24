# ScreenControl Web Server Deployment

This guide covers both local development and production deployment of the ScreenControl web application.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ HTTPS (443)
┌─────────────────────────────────────────────────────────────┐
│                    Apache Reverse Proxy                      │
│  - SSL termination (Let's Encrypt)                          │
│  - WebSocket proxy for /ws                                  │
│  - Security headers                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ HTTP (3002)
┌─────────────────────────────────────────────────────────────┐
│                   Next.js Application                        │
│  - PM2 process manager                                      │
│  - Server-side rendering                                    │
│  - API routes                                               │
│  - WebSocket server for agent connections                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ TCP (5432)
┌─────────────────────────────────────────────────────────────┐
│                      PostgreSQL                              │
│  - Agent registry                                           │
│  - User authentication                                      │
│  - Session storage                                          │
└─────────────────────────────────────────────────────────────┘
```

## Local Development

### Prerequisites

- Node.js 20.x or later
- PostgreSQL (local or remote)
- npm or yarn

### Quick Start

```bash
cd web

# Install dependencies
npm install

# Copy environment template
cp deploy/.env.example .env

# Edit .env with your local settings
# For local dev, you can use:
#   DATABASE_URL="postgresql://user:pass@localhost:5432/screencontrol"
#   NEXTAUTH_URL="http://localhost:3000"
#   NEXTAUTH_SECRET="any-random-string-for-dev"

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

The development server runs on **http://localhost:3000** with hot reloading.

### Development Environment Variables

| Variable | Local Value |
|----------|-------------|
| `DATABASE_URL` | `postgresql://user:pass@localhost:5432/screencontrol` |
| `NEXTAUTH_URL` | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | Any random string |
| `NODE_ENV` | `development` |
| `PORT` | `3000` (default) |

### Database Setup (Local)

```bash
# Create database
createdb screencontrol

# Run migrations
cd web
npx prisma migrate dev

# Generate Prisma client
npx prisma generate

# View database (optional)
npx prisma studio
```

---

## Production Deployment

### Production Server Details

| Setting | Value |
|---------|-------|
| **Domain** | screencontrol.knws.co.uk |
| **Server IP** | 192.168.10.10 |
| **Web Root** | `/var/www/html/screencontrol/web` |
| **App Port** | 3002 |
| **Database** | PostgreSQL on 192.168.10.15:5432 |

### Prerequisites

- Ubuntu/Debian server
- Node.js 20.x
- PM2 (`npm install -g pm2`)
- Apache with modules: `proxy`, `proxy_http`, `proxy_wstunnel`, `rewrite`, `headers`, `ssl`
- PostgreSQL database
- Let's Encrypt SSL certificate

### Initial Server Setup

#### 1. Clone Repository (Sparse Checkout)

The production server uses sparse checkout to only sync relevant directories:

```bash
cd /var/www/html
git clone --depth 1 --filter=blob:none --sparse https://github.com/datagram1/screen_control.git screencontrol
cd screencontrol
git sparse-checkout set todo web
```

#### 2. Install Dependencies

```bash
cd web
npm install
```

#### 3. Configure Environment

```bash
cp deploy/.env.example .env
nano .env
```

Required production values:
```env
DATABASE_URL="postgresql://user:password@db-host:5432/screencontrol?schema=public"
NEXTAUTH_URL="https://screencontrol.knws.co.uk"
NEXTAUTH_SECRET="<generate-secure-random-string>"
EMAIL_SERVER_HOST="smtp.example.com"
EMAIL_SERVER_PORT="25"
EMAIL_FROM="screencontrol@example.com"
NODE_ENV="production"
APP_URL="https://screencontrol.knws.co.uk"
PORT="3002"
DEBUG_MODE="false"
```

#### 4. Setup Database

```bash
npx prisma migrate deploy
npx prisma generate
```

#### 5. Build Application

```bash
npm run build
```

#### 6. Setup PM2

```bash
# Start with ecosystem config
pm2 start deploy/pm2/ecosystem.config.js

# Save PM2 process list
pm2 save

# Enable startup on boot
pm2 startup
# Follow the instructions printed
```

#### 7. Configure Apache

```bash
# Copy configs
sudo cp deploy/apache/*.conf /etc/apache2/sites-available/

# Enable required modules
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers ssl

# Enable sites
sudo a2ensite screencontrol.knws.co.uk.conf
sudo a2ensite screencontrol.knws.co.uk-le-ssl.conf

# Test and reload
sudo apache2ctl configtest
sudo systemctl reload apache2
```

### Apache Configuration

The Apache configuration handles:
- **SSL termination** via Let's Encrypt
- **HTTP to HTTPS redirect**
- **Reverse proxy** to Next.js on port 3002
- **WebSocket proxy** for `/ws` endpoint (agent connections)
- **Security headers** (X-Frame-Options, X-Content-Type-Options)

Config files are in `web/deploy/apache/`:
- `screencontrol.knws.co.uk.conf` - HTTP vhost (redirects to HTTPS)
- `screencontrol.knws.co.uk-le-ssl.conf` - HTTPS vhost with SSL

### PM2 Configuration

The PM2 ecosystem config (`web/deploy/pm2/ecosystem.config.js`) manages:
- Process name: `screencontrol-web`
- Working directory: `/var/www/html/screencontrol/web`
- Script: `npm start`
- Port: 3002
- Memory limit: 500MB
- Auto-restart on failure

---

## Deployment Updates

### Option 1: Git Pull (Recommended)

```bash
ssh richardbrown@192.168.10.10
cd /var/www/html/screencontrol

# Reset any local changes and pull
git checkout -- .
git pull origin main

# Rebuild
cd web
npm install
npm run build

# Restart
pm2 restart screencontrol-web
```

### Option 2: Direct Rsync

From local machine:
```bash
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env' \
  ./web/ richardbrown@192.168.10.10:/var/www/html/screencontrol/web/

ssh richardbrown@192.168.10.10 "cd /var/www/html/screencontrol/web && npm install && npm run build && pm2 restart screencontrol-web"
```

---

## Monitoring & Logs

### PM2 Commands

```bash
# View status
pm2 status

# View logs
pm2 logs screencontrol-web

# Monitor resources
pm2 monit

# Restart
pm2 restart screencontrol-web

# Stop
pm2 stop screencontrol-web
```

### Apache Logs

```bash
# Error log
sudo tail -f /var/log/apache2/screencontrol_error.log

# Access log
sudo tail -f /var/log/apache2/screencontrol_access.log
```

---

## Troubleshooting

### WebSocket Connection Issues

Agents connect via WebSocket at `/ws`. If connections fail:

1. Verify Apache modules:
   ```bash
   sudo a2enmod proxy_wstunnel
   sudo systemctl reload apache2
   ```

2. Check SSL config includes WebSocket proxy rules

3. Test WebSocket endpoint:
   ```bash
   curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Key: test" -H "Sec-WebSocket-Version: 13" \
     https://screencontrol.knws.co.uk/ws
   ```

### Database Connection Issues

```bash
# Test PostgreSQL connection
psql -h 192.168.10.15 -U keynetworks -d screencontrol

# Check connection string in .env
cat .env | grep DATABASE_URL
```

### PM2 Issues

```bash
# Full restart (delete and recreate)
pm2 delete screencontrol-web
pm2 start deploy/pm2/ecosystem.config.js

# Check for startup errors
pm2 logs screencontrol-web --lines 50
```

### SSL Certificate Renewal

Let's Encrypt certificates auto-renew via certbot. Manual renewal:

```bash
sudo certbot renew
sudo systemctl reload apache2
```

---

## Security Notes

- Never commit `.env` files to git
- Keep `NEXTAUTH_SECRET` secure and unique per environment
- SSL certificates managed by Let's Encrypt (auto-renewal)
- Apache configured with security headers
- Database credentials should use least-privilege accounts

---

## File Structure

```
web/
├── deploy/
│   ├── apache/
│   │   ├── screencontrol.knws.co.uk.conf
│   │   └── screencontrol.knws.co.uk-le-ssl.conf
│   ├── pm2/
│   │   └── ecosystem.config.js
│   ├── .env.example
│   └── README.md
├── prisma/
│   └── schema.prisma
├── src/
│   └── ...
├── package.json
└── .env (not in git)
```

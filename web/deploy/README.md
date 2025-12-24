# ScreenControl Web Deployment Guide

This directory contains deployment configuration for the ScreenControl web application.

## Server Details

- **Domain**: screencontrol.knws.co.uk
- **Server**: 192.168.10.10
- **Web Root**: `/var/www/html/screencontrol/web`
- **Port**: 3002 (proxied via Apache on 80/443)

## Architecture

```
Internet
    ↓ HTTPS (443)
Apache (reverse proxy)
    ↓ HTTP (3002)
Next.js (PM2 managed)
    ↓
PostgreSQL (192.168.10.15:5432)
```

## Prerequisites

- Ubuntu/Debian server
- Node.js 20.x
- PM2 (`npm install -g pm2`)
- Apache with modules: proxy, proxy_http, proxy_wstunnel, rewrite, headers, ssl
- PostgreSQL database
- Let's Encrypt SSL certificate

## File Structure

```
deploy/
├── apache/
│   ├── screencontrol.knws.co.uk.conf        # HTTP vhost (redirects to HTTPS)
│   └── screencontrol.knws.co.uk-le-ssl.conf # HTTPS vhost with SSL
├── pm2/
│   └── ecosystem.config.js                   # PM2 process configuration
├── .env.example                              # Environment template
└── README.md                                 # This file
```

## Initial Server Setup

### 1. Clone Repository (Sparse Checkout)

```bash
cd /var/www/html
git clone --depth 1 --filter=blob:none --sparse https://github.com/knws-dev/screen_control.git screencontrol
cd screencontrol
git sparse-checkout set todo web
```

### 2. Install Dependencies

```bash
cd web
npm install
```

### 3. Configure Environment

```bash
cp deploy/.env.example .env
# Edit .env with your production values
nano .env
```

### 4. Setup Database

```bash
npx prisma migrate deploy
npx prisma generate
```

### 5. Build Application

```bash
npm run build
```

### 6. Setup PM2

```bash
pm2 start deploy/pm2/ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions to enable on boot
```

### 7. Configure Apache

```bash
sudo cp deploy/apache/*.conf /etc/apache2/sites-available/
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers ssl
sudo a2ensite screencontrol.knws.co.uk.conf
sudo a2ensite screencontrol.knws.co.uk-le-ssl.conf
sudo systemctl reload apache2
```

## Deployment Updates

### Option 1: Git Pull (Recommended)

```bash
ssh richardbrown@192.168.10.10
cd /var/www/html/screencontrol
git pull origin main
cd web
npm install
npm run build
pm2 restart screencontrol-web
```

### Option 2: Rsync (Direct)

From local machine:
```bash
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env' \
  --exclude 'deploy/.env.example' \
  ./web/ richardbrown@192.168.10.10:/var/www/html/screencontrol/web/

ssh richardbrown@192.168.10.10 "cd /var/www/html/screencontrol/web && npm install && npm run build && pm2 restart screencontrol-web"
```

## Monitoring

```bash
# View logs
pm2 logs screencontrol-web

# Monitor resources
pm2 monit

# Check status
pm2 status
```

## Troubleshooting

### WebSocket Connection Issues

The Apache config includes WebSocket proxy support for `/ws`. If agents can't connect:

1. Check Apache modules: `sudo a2enmod proxy_wstunnel`
2. Verify proxy settings in SSL config
3. Check firewall allows WebSocket upgrades

### Database Connection Issues

```bash
# Test PostgreSQL connection
psql -h 192.168.10.15 -U keynetworks -d screencontrol
```

### PM2 Issues

```bash
# Full restart
pm2 delete screencontrol-web
pm2 start deploy/pm2/ecosystem.config.js
```

### SSL Certificate Renewal

Let's Encrypt certificates auto-renew via certbot. To manual renew:

```bash
sudo certbot renew
sudo systemctl reload apache2
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_URL` | Public URL for auth callbacks |
| `NEXTAUTH_SECRET` | Random secret for session encryption |
| `EMAIL_SERVER_HOST` | SMTP server for emails |
| `EMAIL_SERVER_PORT` | SMTP port (typically 25, 587, or 465) |
| `EMAIL_FROM` | From address for outgoing emails |
| `PORT` | Application port (default: 3002) |
| `NODE_ENV` | Set to "production" |

## Security Notes

- Never commit `.env` files to git
- Keep `NEXTAUTH_SECRET` secure and unique
- SSL certificates managed by Let's Encrypt
- Apache configured with security headers (X-Frame-Options, X-Content-Type-Options)

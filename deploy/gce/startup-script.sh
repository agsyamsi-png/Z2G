#!/usr/bin/env bash
# ==============================================================================
# Z2G - Google Compute Engine Automated Startup Script
# This script runs automatically on VM boot via Compute Engine metadata.
# It provisions Node.js 22 LTS, Nginx, builds Z2G, and configures systemd.
# ==============================================================================

set -euo pipefail

LOG_FILE="/var/log/z2g-startup.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "===================================================================="
echo " Starting Z2G GCE Instance Provisioning: $(date)"
echo "===================================================================="

# 1. Update system packages
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git build-essential nginx tar gzip lsof ca-certificates

# 2. Install Node.js 22 LTS via NodeSource
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt 20 ]; then
  echo "Installing Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

# 3. Create app directory
APP_DIR="/opt/z2g"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# 4. Check for code upload or clone from GitHub
if [ ! -f "package.json" ]; then
  echo "Checking metadata for repository or initial payload..."
  REPO_URL=$(curl -s -f -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/attributes/git-repo" 2>/dev/null || echo "")
  
  if [ -n "$REPO_URL" ]; then
    echo "Cloning repository from $REPO_URL..."
    git clone "$REPO_URL" .
  else
    echo "Waiting for project files upload or repository setup..."
  fi
fi

# 5. Restore migration data snapshot if present
if [ -f "z2g-migration-data.tar.gz" ] && [ ! -f "data/migration.db" ]; then
  echo "Unpacking z2g-migration-data.tar.gz..."
  tar -xzf z2g-migration-data.tar.gz
  echo "Migration data and credentials successfully unpacked."
fi

# 6. Ensure .env.local exists
if [ ! -f ".env.local" ]; then
  ENV_META=$(curl -s -f -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/attributes/env-local" 2>/dev/null || echo "")
  if [ -n "$ENV_META" ]; then
    echo "$ENV_META" > .env.local
  elif [ -f ".env.example" ]; then
    cp .env.example .env.local
  fi
fi

# 7. Configure .npmrc to prevent blocked lifecycle scripts
cat << 'NPMRC' > .npmrc
ignore-scripts=false
foreground-scripts=true
NPMRC

# 8. Install dependencies & build Next.js application if package.json exists
if [ -f "package.json" ]; then
  echo "Installing project dependencies..."
  npm install

  echo "Building Next.js production bundle..."
  npm run build
fi

# 9. Configure systemd service
echo "Configuring systemd service for Z2G..."
cat << 'SERVICE' > /etc/systemd/system/z2g.service
[Unit]
Description=Z2G Zoho to Google Workspace Migration Engine
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/z2g
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable z2g
if [ -f "package.json" ]; then
  systemctl restart z2g || true
fi

# 10. Configure Nginx Reverse Proxy (port 80 -> port 3000)
echo "Configuring Nginx reverse proxy..."
cat << 'NGINX_CONF' > /etc/nginx/sites-available/z2g
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_CONF

ln -sf /etc/nginx/sites-available/z2g /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

echo "===================================================================="
echo " Z2G GCE Instance Provisioning Complete: $(date)"
echo " Service status: $(systemctl is-active z2g 2>/dev/null || echo 'pending upload')"
echo "===================================================================="

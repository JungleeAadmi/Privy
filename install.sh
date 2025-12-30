#!/bin/bash

# Privy Installer Script
# Usage: sudo ./install.sh

echo "🍷 Welcome to Privy Installer..."

# 1. System Updates & Interactive Timezone
echo "🔄 Updating system packages..."
apt-get update && apt-get upgrade -y
echo "🌍 Setting Timezone..."
dpkg-reconfigure tzdata

# 2. Install Dependencies (Node.js, NPM, SQLite3)
echo "📦 Installing Node.js and system tools..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt-get install -y nodejs sqlite3 build-essential

# 3. Setup Directory & Permissions
APP_DIR="/opt/privy"
DATA_DIR="$APP_DIR/data"
mkdir -p "$DATA_DIR/uploads/cards"
mkdir -p "$DATA_DIR/uploads/books"

# Copy files from current location to /opt/privy if running from source, 
# or assume we are pulling git. For this script, we assume we are inside the repo.
echo "📂 Moving files to $APP_DIR..."
cp -r . "$APP_DIR/"

# 4. Install App Dependencies
echo "🧱 Installing Application Dependencies..."
cd "$APP_DIR"
# Install backend deps
npm install
# Install frontend deps
cd client
npm install
# Build the React frontend
echo "🎨 Building Frontend..."
npm run build
cd ..

# 5. Create Systemd Service (Auto-start on boot)
echo "⚙️ Creating System Service..."
cat <<EOF > /etc/systemd/system/privy.service
[Unit]
Description=Privy - Couple Games App
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server/server.js
Restart=on-failure
Environment=PORT=80
Environment=DATA_DIR=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF

# 6. Enable and Start
systemctl daemon-reload
systemctl enable privy
systemctl restart privy

echo "✅ Privy is installed! Access it at http://$(hostname -I | awk '{print $1}')"
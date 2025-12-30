#!/bin/bash

# Privy Installer Script
# Usage: sudo ./install.sh

echo "🍷 Welcome to Privy Installer..."

# 1. System Updates & Interactive Timezone
echo "🔄 Updating system packages..."
apt-get update && apt-get upgrade -y

echo "🌍 Setting Timezone..."
# FIX: Force input from /dev/tty to allow interactive selection even when running via curl
if [ -c /dev/tty ]; then
    # Ensure TERM is set so the UI renders correctly
    export TERM=${TERM:-xterm}
    dpkg-reconfigure tzdata < /dev/tty > /dev/tty
else
    echo "⚠️  No interactive terminal detected. Skipping timezone setup."
fi

# 2. Install Dependencies (Node.js, NPM, SQLite3)
echo "📦 Installing Node.js and system tools..."
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
apt-get install -y nodejs sqlite3 build-essential

# 3. Setup Directory & Permissions
APP_DIR="/opt/privy"
DATA_DIR="$APP_DIR/data"
mkdir -p "$DATA_DIR/uploads/cards"
mkdir -p "$DATA_DIR/uploads/books"

# Copy files from current location to /opt/privy
# We assume the script is run from inside the repo folder OR cloned by the installer
echo "📂 Moving files to $APP_DIR..."

# If running from curl (files not present), we might need to clone.
# However, based on your workflow, we assume this script is running in a context 
# where files are present OR you want to clone them now.
# To make the curl command fully standalone, we should clone if files aren't here.

if [ ! -f "server/server.js" ]; then
    echo "📥 Cloning repository..."
    git clone https://github.com/JungleeAadmi/Privy.git temp_privy
    cp -r temp_privy/* .
    rm -rf temp_privy
fi

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
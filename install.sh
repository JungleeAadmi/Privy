#!/bin/bash

# Privy Installer Script
# Usage: bash <(curl -sSL https://raw.githubusercontent.com/JungleeAadmi/Privy/main/install.sh)

echo "🍷 Welcome to Privy Installer..."

# 1. System Updates & Interactive Timezone
echo "🔄 Updating system packages..."
apt-get update && apt-get upgrade -y
# Install dialog (UI), git, poppler-utils (PDF extraction), and zip (Backup export)
apt-get install -y dialog git poppler-utils zip

echo "🌍 Setting Timezone..."
if [ -c /dev/tty ]; then
    export TERM=${TERM:-xterm}
    dpkg-reconfigure tzdata < /dev/tty > /dev/tty 2> /dev/tty
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
mkdir -p "$DATA_DIR/uploads/toys"
mkdir -p "$DATA_DIR/uploads/lingerie"
mkdir -p "$DATA_DIR/uploads/condoms"
mkdir -p "$DATA_DIR/uploads/lubes"

# 4. Handle File Retrieval
echo "📂 Moving files to $APP_DIR..."

if [ -f "server/server.js" ]; then
    # Local install (if you cloned the repo manually)
    cp -r . "$APP_DIR/"
else
    # Remote install
    echo "📥 Downloading application files..."
    TEMP_DIR=$(mktemp -d)
    git clone https://github.com/JungleeAadmi/Privy.git "$TEMP_DIR"
    cp -r "$TEMP_DIR/"* "$APP_DIR/"
    rm -rf "$TEMP_DIR"
fi

# 5. Install App Dependencies
echo "🧱 Installing Application Dependencies..."
cd "$APP_DIR"
npm install
cd client
npm install
echo "🎨 Building Frontend..."
npm run build
cd ..

# 6. Create Systemd Service
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

# 7. Enable and Start
systemctl daemon-reload
systemctl enable privy
systemctl restart privy

echo "✅ Privy is installed! Access it at http://$(hostname -I | awk '{print $1}')"
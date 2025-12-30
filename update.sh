#!/bin/bash

# Privy Updater Script
# Usage: bash <(curl -sSL https://raw.githubusercontent.com/JungleeAadmi/Privy/main/update.sh)

APP_DIR="/opt/privy"
TEMP_DIR=$(mktemp -d)

echo "🔄 Updating Privy..."

# 1. Download latest code to a temporary directory
echo "📥 Downloading latest code..."
git clone https://github.com/JungleeAadmi/Privy.git "$TEMP_DIR"

# 2. Build Frontend in the temporary directory
echo "🧱 Building Frontend..."
cd "$TEMP_DIR/client" || exit
npm install
npm run build

# 3. Sync files to the App Directory
# We exclude 'data' to protect user uploads/db
# We exclude 'node_modules' to avoid copying massive folders (we will install deps in target)
echo "📂 Deploying to $APP_DIR..."
cd "$TEMP_DIR"
rsync -av --delete \
    --exclude 'data' \
    --exclude 'node_modules' \
    --exclude 'client/node_modules' \
    --exclude '.git' \
    . "$APP_DIR/"

# 4. Install Backend Dependencies in the actual App Directory
echo "📦 Updating Backend Dependencies..."
cd "$APP_DIR"
npm install

# 5. Cleanup & Restart
echo "🧹 Cleaning up..."
rm -rf "$TEMP_DIR"

echo "⚙️ Restarting Service..."
systemctl restart privy

echo "✅ Update Complete!"
#!/bin/bash

# Privy Updater Script
# Usage: sudo ./update.sh

APP_DIR="/opt/privy"

echo "🔄 Updating Privy..."

# 1. Pull latest code (Assumes git is setup)
git pull origin main

# 2. Re-install dependencies in case of changes
npm install
cd client
npm install

# 3. Re-build Frontend
npm run build
cd ..

# 4. Copy new files to install dir, BUT skip 'data' folder
# We use rsync to exclude data
rsync -av --progress . "$APP_DIR" --exclude data --exclude node_modules --exclude client/node_modules

# 5. Restart Service
systemctl restart privy

echo "✅ Update Complete!"
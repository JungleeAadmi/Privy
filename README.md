# **🍷 Privy**

**Note:** This application was **Thought by humans and 100% coded by AI**. No human coding was involved in the creation of this project.  
**Privy** is a self-hosted, private web application designed for couples to add a little mystery and fun to their routine. It features digital scratch cards, a spin wheel for random selection, and a private book library, all wrapped in a sleek, mobile-first PWA interface.

## **✨ Features**

* **🃏 Mystery Cards:** Upload photos (dates, ideas, memories) hidden behind a "Triple Tap" reveal mechanism.  
* **🎡 Spin The Wheel:** Can't decide? Let the wheel pick a random card from your collection.  
* **📚 Private Library:** Upload and read PDF books (guides, stories) directly in the app.  
* **🔔 Push Notifications:** Integrated with [Ntfy](https://ntfy.sh) to send the revealed image to your partner's phone instantly.  
* **📱 Mobile First:** Fully responsive Progressive Web App (PWA) that installs on your home screen.  
* **🔒 Self-Hosted:** Your data stays on your server. Uses a local SQLite database.  
* **🎨 Lush UI:** Designed with a "moody" aesthetic using Deep Burgundy, Eggplant, and Gold.

## **🚀 Quick Install**

You can install Privy on any Debian/Ubuntu-based server (LXC container, VPS, Raspberry Pi) with a single command.

### **1\. Install**

Run this command on your fresh server instance:  

```
bash <(curl -sSL https://raw.githubusercontent.com/JungleeAadmi/Privy/main/install.sh)
```

This script will:

1. Update your system packages.  
2. Install Node.js, SQLite3, and dependencies.  
3. Set up the directory structure at /opt/privy.  
4. Create and start a systemd service for auto-start on boot.

### **2\. Update**

To update the app to the latest version from GitHub without losing your data (images/database):  
```
bash <(curl -sSL https://raw.githubusercontent.com/JungleeAadmi/Privy/main/update.sh)
```
## **⚙️ Configuration**

### **Ntfy Integration (Optional)**

To receive push notifications with images when a card is revealed:

**IMPORTANT** 
1. **Set up Ntfy:** You need a self-hosted Ntfy server configured to allow attachments.  
   * *Note: Public ntfy.sh servers may not support the file upload method used here.*  
   * Ensure your Ntfy server config has attachment-cache-dir enabled.  

2. **In App:** Go to **Settings** \-\> **Notifications**.  
3. **Enter Details:**  
   * **Server URL:** https://your-ntfy-domain.com  
   * **Topic:** your\_secret\_topic\_name  
4. **Save & Test:** Click the "Test" button to verify connectivity.

## **🛠️ Tech Stack**

* **Frontend:** React, Vite, Tailwind CSS, Lucide Icons.  
* **Backend:** Node.js, Express.  
* **Database:** SQLite.  
* **Interaction:** Custom Canvas API for scratch/reveal effects.

*Disclaimer: This project is intended for private, self-hosted use. The creators accept no responsibility for the content uploaded or the usage of the application.*

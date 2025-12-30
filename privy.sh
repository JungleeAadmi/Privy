#!/bin/bash

echo "🚀 Setting up Privy Project Structure..."

# 1. Create Directories
mkdir -p server
mkdir -p client/public
mkdir -p client/src/components

# 2. Create Root Files

# install.sh
cat << 'EOF' > install.sh
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

# Copy files from current location to /opt/privy
echo "📂 Moving files to $APP_DIR..."
cp -r . "$APP_DIR/"

# 4. Install App Dependencies
echo "🧱 Installing Application Dependencies..."
cd "$APP_DIR"
npm install
cd client
npm install
echo "🎨 Building Frontend..."
npm run build
cd ..

# 5. Create Systemd Service
echo "⚙️ Creating System Service..."
cat <<SERVICE > /etc/systemd/system/privy.service
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
SERVICE

# 6. Enable and Start
systemctl daemon-reload
systemctl enable privy
systemctl restart privy

echo "✅ Privy is installed! Access it at http://$(hostname -I | awk '{print $1}')"
EOF

# update.sh
cat << 'EOF' > update.sh
#!/bin/bash
# Privy Updater Script
APP_DIR="/opt/privy"
echo "🔄 Updating Privy..."
git pull origin main
npm install
cd client && npm install && npm run build && cd ..
rsync -av --progress . "$APP_DIR" --exclude data --exclude node_modules --exclude client/node_modules
systemctl restart privy
echo "✅ Update Complete!"
EOF

# package.json (Root)
cat << 'EOF' > package.json
{
  "name": "privy",
  "version": "1.0.0",
  "description": "Self-hosted Couple Games App",
  "main": "server/server.js",
  "scripts": {
    "start": "node server/server.js",
    "dev": "concurrently \"npm run server\" \"npm run client\"",
    "server": "nodemon server/server.js",
    "client": "cd client && npm run dev",
    "build": "cd client && npm run build"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.0",
    "multer": "^1.4.5-lts.1",
    "sqlite3": "^5.1.6"
  },
  "devDependencies": {
    "concurrently": "^8.0.1",
    "nodemon": "^2.0.22"
  }
}
EOF

# .gitignore
cat << 'EOF' > .gitignore
node_modules
client/node_modules
client/dist
data
*.db
.env
EOF

# 3. Create Server Files

# server/server.js
cat << 'EOF' > server/server.js
/**
 * Privy Backend - Node.js
 */
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'privy.db');
const SECRET_KEY = 'privy_super_secret_love_key'; 

app.use(express.json());
app.use(cors());
app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));
app.use(express.static(path.join(__dirname, '../client/dist')));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('DB Error:', err.message);
    else console.log('✅ Connected to SQLite database.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT,
        age INTEGER,
        gender TEXT,
        avatar TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filepath TEXT,
        scratched_count INTEGER DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        filepath TEXT
    )`);
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = req.path.includes('book') ? 'books' : 'cards';
        const dir = path.join(DATA_DIR, 'uploads', type);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

const auth = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: 'No token' });
    try {
        const decoded = jwt.verify(token.split(' ')[1], SECRET_KEY);
        req.user = decoded;
        next();
    } catch (e) { res.status(401).json({ error: 'Unauthorized' }); }
};

app.post('/api/register', (req, res) => {
    const { username, password, name, age, gender } = req.body;
    const hash = bcrypt.hashSync(password, 8);
    db.run(`INSERT INTO users (username, password, name, age, gender) VALUES (?,?,?,?,?)`,
        [username, hash, name, age, gender],
        function(err) {
            if (err) return res.status(400).json({ error: 'Username taken' });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (!user || !bcrypt.compareSync(password, user.password)) 
            return res.status(400).json({ error: 'Invalid credentials' });
        const token = jwt.sign({ id: user.id, name: user.name }, SECRET_KEY);
        res.json({ token, user });
    });
});

app.put('/api/user', auth, (req, res) => {
    const { name, age, gender, password } = req.body;
    let sql = `UPDATE users SET name = ?, age = ?, gender = ? WHERE id = ?`;
    let params = [name, age, gender, req.user.id];
    if (password) {
        sql = `UPDATE users SET name = ?, age = ?, gender = ?, password = ? WHERE id = ?`;
        params = [name, age, gender, bcrypt.hashSync(password, 8), req.user.id];
    }
    db.run(sql, params, (err) => {
        if (err) return res.status(500).json({error: err.message});
        res.json({success: true});
    });
});

app.get('/api/cards', auth, (req, res) => {
    db.all(`SELECT * FROM cards`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/cards', auth, upload.single('file'), (req, res) => {
    if(!req.file) return res.status(400).json({error: 'No file'});
    const filepath = `/uploads/cards/${req.file.filename}`;
    db.run(`INSERT INTO cards (filepath) VALUES (?)`, [filepath], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, filepath });
    });
});

app.post('/api/cards/:id/scratch', auth, (req, res) => {
    db.run(`UPDATE cards SET scratched_count = scratched_count + 1 WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get('/api/books', auth, (req, res) => {
    db.all(`SELECT * FROM books`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/books', auth, upload.single('file'), (req, res) => {
    if(!req.file) return res.status(400).json({error: 'No file'});
    const filepath = `/uploads/books/${req.file.filename}`;
    db.run(`INSERT INTO books (title, filepath) VALUES (?, ?)`, [req.file.originalname, filepath], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, filepath });
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Privy running on port ${PORT}`);
});
EOF

# 4. Create Client Files

# client/package.json
cat << 'EOF' > client/package.json
{
  "name": "privy-client",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "lucide-react": "^0.263.1",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.14.2"
  },
  "devDependencies": {
    "@types/react": "^18.2.15",
    "@types/react-dom": "^18.2.7",
    "@vitejs/plugin-react": "^4.0.3",
    "autoprefixer": "^10.4.14",
    "postcss": "^8.4.27",
    "tailwindcss": "^3.3.3",
    "vite": "^4.4.5",
    "vite-plugin-pwa": "^0.16.4"
  }
}
EOF

# client/vite.config.js
cat << 'EOF' > client/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Privy',
        short_name: 'Privy',
        description: 'Couple Games & Intimacy App',
        theme_color: '#301934',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000'
    }
  }
});
EOF

# client/tailwind.config.js
cat << 'EOF' > client/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        lipstick: '#D2042D',
        eggplant: '#301934',
        burgundy: '#800020',
        gold: '#FFD700',
      },
      fontFamily: {
        caveat: ['Caveat', 'cursive'],
      },
    },
  },
  plugins: [],
}
EOF

# client/postcss.config.js
cat << 'EOF' > client/postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF

# client/index.html
cat << 'EOF' > client/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Privy</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
EOF

# client/src/index.css
cat << 'EOF' > client/src/index.css
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-lipstick: #D2042D;
  --color-eggplant: #301934;
  --color-burgundy: #800020;
  --color-gold: #FFD700;
}

body {
  margin: 0;
  font-family: 'Caveat', cursive;
  background-color: #000;
  color: #fff;
  -webkit-font-smoothing: antialiased;
}
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: #111; }
::-webkit-scrollbar-thumb { background: #800020; border-radius: 3px; }
.pb-safe { padding-bottom: env(safe-area-inset-bottom); }
EOF

# client/src/main.jsx
cat << 'EOF' > client/src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
EOF

# client/src/App.jsx
cat << 'EOF' > client/src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, User, LogOut, Upload, Book, Layers, Shuffle, EyeOff, Heart } from 'lucide-react';

const API_URL = '/api';

const ScratchCard = ({ image, id, onScratchComplete, isHidden }) => {
  const canvasRef = useRef(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [ctx, setCtx] = useState(null);

  useEffect(() => {
    if (isHidden) {
      resetCard();
    }
  }, [isHidden]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    setCtx(context);
    resetCard();
  }, [image]);

  const resetCard = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#C0C0C0'; 
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = '20px Caveat';
    context.fillStyle = '#333';
    context.fillText("Scratch to Reveal", 60, 100);
    setIsRevealed(false);
  };

  const handleScratch = (e) => {
    if (isRevealed || !ctx) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fill();
    checkReveal();
  };

  const checkReveal = () => {
    if (isRevealed) return;
    onScratchComplete(id);
    setIsRevealed(true); 
  };

  return (
    <div className="relative w-64 h-64 m-4 rounded-xl overflow-hidden shadow-2xl border-4 border-gold">
      <img src={image} alt="Secret" className="absolute inset-0 w-full h-full object-cover" />
      <canvas
        ref={canvasRef}
        width={256}
        height={256}
        className="absolute inset-0 cursor-pointer touch-none"
        onMouseMove={(e) => e.buttons === 1 && handleScratch(e)}
        onTouchMove={handleScratch}
        onMouseDown={handleScratch}
      />
    </div>
  );
};

const Auth = ({ setUser }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ username: '', password: '', name: '', age: '', gender: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const endpoint = isLogin ? '/login' : '/register';
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);
    } else if (data.success) {
      setIsLogin(true);
    } else {
      alert(data.error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-eggplant via-burgundy to-black text-gold font-caveat">
      <h1 className="text-6xl mb-8 drop-shadow-lg text-lipstick">{isLogin ? 'Privy Login' : 'Join Privy'}</h1>
      <form onSubmit={handleSubmit} className="bg-black/50 p-8 rounded-2xl border border-gold/30 backdrop-blur-md w-80">
        <input className="w-full p-3 mb-4 bg-gray-900 border border-burgundy rounded text-white" placeholder="Username" onChange={e => setForm({...form, username: e.target.value})} />
        <input className="w-full p-3 mb-4 bg-gray-900 border border-burgundy rounded text-white" type="password" placeholder="Password" onChange={e => setForm({...form, password: e.target.value})} />
        {!isLogin && (
          <>
            <input className="w-full p-3 mb-4 bg-gray-900 border border-burgundy rounded text-white" placeholder="Name" onChange={e => setForm({...form, name: e.target.value})} />
            <div className="flex gap-2 mb-4">
               <input className="w-1/2 p-3 bg-gray-900 border border-burgundy rounded text-white" type="number" placeholder="Age" onChange={e => setForm({...form, age: e.target.value})} />
               <select className="w-1/2 p-3 bg-gray-900 border border-burgundy rounded text-white" onChange={e => setForm({...form, gender: e.target.value})}>
                 <option value="">Gender</option>
                 <option value="Male">Male</option>
                 <option value="Female">Female</option>
                 <option value="Other">Other</option>
               </select>
            </div>
          </>
        )}
        <button className="w-full bg-lipstick hover:bg-red-700 text-white font-bold py-3 rounded shadow-lg transition transform hover:scale-105">
          {isLogin ? 'Enter' : 'Sign Up'}
        </button>
      </form>
      <p className="mt-4 cursor-pointer hover:text-white" onClick={() => setIsLogin(!isLogin)}>
        {isLogin ? "New here? Create Account" : "Have an account? Login"}
      </p>
    </div>
  );
};

const Home = () => {
  const [cards, setCards] = useState([]);
  const [hideTrigger, setHideTrigger] = useState(0);

  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    const res = await fetch(`${API_URL}/cards`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    if (res.ok) setCards(await res.json());
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    await fetch(`${API_URL}/cards`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: formData
    });
    fetchCards();
  };

  const handleScratch = async (id) => {
    await fetch(`${API_URL}/cards/${id}/scratch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    fetchCards(); 
  };

  const shuffleCards = () => {
    setCards([...cards].sort(() => Math.random() - 0.5));
  };

  return (
    <div className="p-4 pb-20">
      <div className="flex justify-between items-center mb-6 bg-black/40 p-4 rounded-xl backdrop-blur-sm sticky top-20 z-10 border-b border-gold/20">
        <div className="flex gap-4">
          <button onClick={shuffleCards} className="flex items-center gap-2 text-gold hover:text-white"><Shuffle size={20}/> Shuffle</button>
          <button onClick={() => setHideTrigger(prev => prev + 1)} className="flex items-center gap-2 text-gold hover:text-white"><EyeOff size={20}/> Hide All</button>
        </div>
        <label className="flex items-center gap-2 bg-burgundy px-4 py-2 rounded-full cursor-pointer hover:bg-lipstick transition shadow-lg">
          <Upload size={18} className="text-white"/>
          <span className="text-white text-sm font-bold">Add Card</span>
          <input type="file" className="hidden" accept="image/*" onChange={handleUpload} />
        </label>
      </div>

      <div className="flex flex-wrap justify-center gap-6">
        {cards.map(card => (
          <div key={card.id} className="flex flex-col items-center">
            <ScratchCard 
              id={card.id} 
              image={card.filepath} 
              onScratchComplete={() => handleScratch(card.id)}
              isHidden={hideTrigger} 
            />
            <div className="text-gold text-sm mt-2 flex items-center gap-1">
              <Heart size={12} className="fill-lipstick text-lipstick"/> Scratched: {card.scratched_count} times
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Books = () => {
  const [books, setBooks] = useState([]);

  useEffect(() => {
    const loadBooks = async () => {
      const res = await fetch(`${API_URL}/books`, {
         headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setBooks(await res.json());
    };
    loadBooks();
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    await fetch(`${API_URL}/books`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: formData
    });
    window.location.reload();
  };

  return (
    <div className="p-6 pb-20">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl text-gold">Library</h2>
        <label className="flex items-center gap-2 bg-burgundy px-4 py-2 rounded-full cursor-pointer hover:bg-lipstick">
          <Upload size={18} className="text-white"/>
          <span className="text-white text-sm">Add Book (PDF)</span>
          <input type="file" className="hidden" accept="application/pdf" onChange={handleUpload} />
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {books.map(book => (
          <a key={book.id} href={book.filepath} target="_blank" rel="noopener noreferrer" className="block">
            <div className="bg-gray-900 border border-gold/20 p-6 rounded-lg hover:bg-gray-800 transition flex items-center gap-4">
              <Book size={32} className="text-burgundy"/>
              <div>
                <h3 className="text-xl text-white truncate w-48">{book.title}</h3>
                <p className="text-gray-500 text-sm">Tap to read</p>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

const Settings = ({ user, logout }) => {
  const [form, setForm] = useState({ ...user, password: '' });

  const handleUpdate = async (e) => {
    e.preventDefault();
    await fetch(`${API_URL}/user`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}` 
      },
      body: JSON.stringify(form)
    });
    alert('Profile Updated');
  };

  return (
    <div className="p-6 text-gold">
      <h2 className="text-3xl mb-6">Settings</h2>
      <form onSubmit={handleUpdate} className="max-w-md mx-auto space-y-4">
        <div>
           <label>Display Name</label>
           <input className="w-full p-2 bg-gray-800 rounded border border-burgundy" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
        </div>
        <div>
           <label>Change Password (Optional)</label>
           <input className="w-full p-2 bg-gray-800 rounded border border-burgundy" type="password" onChange={e => setForm({...form, password: e.target.value})} />
        </div>
        <button className="w-full bg-gold text-black font-bold p-3 rounded hover:bg-yellow-600">Save Changes</button>
      </form>
      <button onClick={logout} className="w-full mt-8 bg-red-900 text-white font-bold p-3 rounded flex items-center justify-center gap-2">
        <LogOut size={18} /> Logout
      </button>
    </div>
  );
};

const Layout = ({ children, user, logout }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-black text-white font-caveat selection:bg-lipstick">
      <header className="fixed top-0 w-full bg-gradient-to-r from-eggplant to-black border-b border-gold/20 z-50 px-4 py-3 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-lipstick rounded-full flex items-center justify-center text-xs font-bold shadow-inner border border-gold">P</div>
          <h1 className="text-2xl text-gold tracking-widest">Privy</h1>
        </div>
        <button onClick={() => setMenuOpen(!menuOpen)} className="text-gold focus:outline-none">
          {menuOpen ? <X size={28} /> : <div className="space-y-1">
             <div className="w-6 h-0.5 bg-gold"></div>
             <div className="w-6 h-0.5 bg-gold"></div>
             <div className="w-6 h-0.5 bg-gold"></div>
          </div>}
        </button>
      </header>
      {menuOpen && (
        <div className="fixed top-14 right-0 w-64 bg-gray-900 border-l border-gold/30 h-full z-40 p-4 shadow-2xl transform transition-transform">
           <div className="flex flex-col gap-4 text-xl">
             <Link to="/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-2 hover:bg-white/10 rounded"><User size={20}/> Profile</Link>
             <button onClick={logout} className="flex items-center gap-3 p-2 text-lipstick hover:bg-white/10 rounded"><LogOut size={20}/> Logout</button>
           </div>
        </div>
      )}
      <main className="pt-20 min-h-screen bg-gradient-to-b from-black via-eggplant/20 to-black">
        {children}
      </main>
      <nav className="fixed bottom-0 w-full bg-black/90 backdrop-blur-md border-t border-gold/20 flex justify-around py-3 pb-safe z-50">
        <Link to="/" className={`flex flex-col items-center ${location.pathname === '/' ? 'text-lipstick' : 'text-gray-500'}`}>
          <Layers size={24} />
          <span className="text-xs">Cards</span>
        </Link>
        <Link to="/books" className={`flex flex-col items-center ${location.pathname === '/books' ? 'text-lipstick' : 'text-gray-500'}`}>
          <Book size={24} />
          <span className="text-xs">Books</span>
        </Link>
      </nav>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    const saved = localStorage.getItem('user');
    if (saved) setUser(JSON.parse(saved));
  }, []);
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };
  if (!user) return <Auth setUser={setUser} />;
  return (
    <Router>
      <Layout user={user} logout={logout}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/books" element={<Books />} />
          <Route path="/settings" element={<Settings user={user} logout={logout} />} />
        </Routes>
      </Layout>
    </Router>
  );
}
EOF

# Make install executable
chmod +x install.sh
chmod +x update.sh

echo "✨ Structure created successfully!"
EOF

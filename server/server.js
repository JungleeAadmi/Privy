/**
 * Privy Backend - Node.js
 * Handles API, Database, File Serving, and Notifications
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

// --- Middleware ---
app.use(express.json());
app.use(cors());
app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));
app.use(express.static(path.join(__dirname, '../client/dist'))); 

// --- Database Setup ---
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('DB Error:', err.message);
    else console.log('✅ Connected to SQLite database.');
});

// Init Tables
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
        scratched_count INTEGER DEFAULT 0,
        section_id INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS card_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(card_id) REFERENCES cards(id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        filepath TEXT
    )`);

    // Settings table for Ntfy config
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);
});

// --- Helper: Send Ntfy Notification with Image ---
const sendNtfy = (cardId) => {
    // 1. Get Settings
    db.all(`SELECT * FROM settings WHERE key IN ('ntfy_url', 'ntfy_topic')`, [], (err, rows) => {
        if (err || !rows) return;
        
        const settings = rows.reduce((acc, r) => ({...acc, [r.key]: r.value}), {});
        if (!settings.ntfy_url || !settings.ntfy_topic) {
            console.log("Ntfy: Missing URL or Topic");
            return;
        }

        // 2. Get Card Image Path
        db.get(`SELECT filepath FROM cards WHERE id = ?`, [cardId], (err, card) => {
            if (!card) {
                console.log("Ntfy: Card not found for ID", cardId);
                return;
            }

            // Construct absolute path to file
            const cleanPath = card.filepath.replace('/uploads/', '');
            const absPath = path.join(DATA_DIR, 'uploads', cleanPath);

            if (fs.existsSync(absPath)) {
                if (typeof fetch !== 'function') {
                    console.error("Ntfy: Node environment missing 'fetch'");
                    return;
                }

                try {
                    const fileBuffer = fs.readFileSync(absPath);
                    const { size } = fs.statSync(absPath);
                    
                    // Construct URL (handle trailing slash)
                    const baseUrl = settings.ntfy_url.replace(/\/$/, '');
                    const url = `${baseUrl}/${settings.ntfy_topic}`;

                    console.log(`Ntfy: Sending image to ${url} (${size} bytes)`);

                    fetch(url, {
                        method: 'POST', // POST is often preferred for file uploads
                        body: fileBuffer,
                        headers: {
                            'Title': 'Privy: Card Revealed!',
                            'X-Title': 'Privy: Card Revealed!', // Compatibility alias
                            'Message': 'Someone revealed a card! Tap to view.', 
                            'X-Message': 'Someone revealed a card! Tap to view.', // Compatibility alias
                            'Tags': 'heart,fire,camera',
                            'X-Tags': 'heart,fire,camera',
                            'Priority': 'high',
                            'X-Priority': 'high',
                            'Filename': 'reveal.jpg',
                            'Content-Length': size
                        }
                    }).then(res => {
                        if (!res.ok) {
                            res.text().then(text => console.error(`Ntfy Failed (${res.status}): ${text}`));
                        } else {
                            console.log("Ntfy: Image notification sent successfully.");
                        }
                    }).catch(err => console.error("Ntfy Network Error:", err.message));
                } catch (readErr) {
                    console.error("File Read Error:", readErr);
                }
            } else {
                console.error("Ntfy: File does not exist at", absPath);
            }
        });
    });
};

// --- File Upload Config ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = req.path.includes('book') ? 'books' : 'cards';
        const dir = path.join(DATA_DIR, 'uploads', type);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        cb(null, Date.now() + '-' + safeName);
    }
});
const upload = multer({ storage });

// --- Helpers ---
const auth = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: 'No token' });
    try {
        const decoded = jwt.verify(token.split(' ')[1], SECRET_KEY);
        req.user = decoded;
        next();
    } catch (e) { res.status(401).json({ error: 'Unauthorized' }); }
};

// --- Routes: Auth ---
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

// --- Routes: Settings ---
app.get('/api/settings', auth, (req, res) => {
    db.all(`SELECT * FROM settings`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const settings = rows.reduce((acc, r) => ({...acc, [r.key]: r.value}), {});
        res.json(settings);
    });
});

app.put('/api/settings', auth, (req, res) => {
    const { ntfy_url, ntfy_topic } = req.body;
    db.serialize(() => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
        stmt.run('ntfy_url', ntfy_url);
        stmt.run('ntfy_topic', ntfy_topic);
        stmt.finalize();
        res.json({ success: true });
    });
});

// TEST Endpoint for Notifications
app.post('/api/settings/test', auth, (req, res) => {
    const { ntfy_url, ntfy_topic } = req.body;
    
    if (!ntfy_url || !ntfy_topic) {
        return res.status(400).json({ error: 'Missing Ntfy configuration details' });
    }

    const baseUrl = ntfy_url.replace(/\/$/, '');
    const url = `${baseUrl}/${ntfy_topic}`;

    if (typeof fetch !== 'function') return res.status(500).json({error: 'Server fetch support missing'});

    fetch(url, {
        method: 'POST',
        body: "Privy Notification Test Successful! 🎉",
        headers: {
            'Title': 'Privy Test',
            'Tags': 'tada,check_mark',
            'Priority': 'default'
        }
    })
    .then(response => {
        if (response.ok) res.json({ success: true });
        else res.status(500).json({ error: `Ntfy Error: ${response.status} ${response.statusText}` });
    })
    .catch(err => res.status(500).json({ error: err.message }));
});

// --- Routes: Sections ---
app.get('/api/sections', auth, (req, res) => {
    db.all(`SELECT * FROM sections`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/sections', auth, (req, res) => {
    const { title } = req.body;
    db.run(`INSERT INTO sections (title) VALUES (?)`, [title], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, title });
    });
});

app.put('/api/sections/:id', auth, (req, res) => {
    const { title } = req.body;
    db.run(`UPDATE sections SET title = ? WHERE id = ?`, [title, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/sections/:id', auth, (req, res) => {
    const id = req.params.id;
    db.all(`SELECT filepath FROM cards WHERE section_id = ?`, [id], (err, rows) => {
        if(rows) {
            rows.forEach(row => {
                try {
                    const cleanPath = row.filepath.replace('/uploads/', '');
                    const absPath = path.join(DATA_DIR, 'uploads', cleanPath);
                    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
                } catch(e) { console.error("File deletion error", e); }
            });
        }
        db.serialize(() => {
            db.run(`DELETE FROM cards WHERE section_id = ?`, [id]);
            db.run(`DELETE FROM sections WHERE id = ?`, [id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
        });
    });
});

// --- Routes: Cards ---
app.get('/api/cards', auth, (req, res) => {
    db.all(`SELECT * FROM cards`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/cards', auth, upload.single('file'), (req, res) => {
    if(!req.file) return res.status(400).json({error: 'No file'});
    const filepath = `/uploads/cards/${req.file.filename}`;
    const sectionId = req.body.section_id || null;
    db.run(`INSERT INTO cards (filepath, section_id) VALUES (?, ?)`, [filepath, sectionId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, filepath });
    });
});

app.delete('/api/cards/:id', auth, (req, res) => {
    const id = req.params.id;
    db.get(`SELECT filepath FROM cards WHERE id = ?`, [id], (err, row) => {
        if (!row) return res.status(404).json({error: 'Card not found'});
        const cleanPath = row.filepath.replace('/uploads/', '');
        const absPath = path.join(DATA_DIR, 'uploads', cleanPath);
        if (fs.existsSync(absPath)) fs.unlinkSync(absPath);

        db.serialize(() => {
            db.run(`DELETE FROM card_history WHERE card_id = ?`, [id]);
            db.run(`DELETE FROM cards WHERE id = ?`, [id], (err) => {
                if(err) return res.status(500).json({error: err.message});
                res.json({success: true});
            });
        });
    });
});

app.post('/api/cards/:id/scratch', auth, (req, res) => {
    const cardId = req.params.id;
    db.serialize(() => {
        db.run(`INSERT INTO card_history (card_id) VALUES (?)`, [cardId]);
        db.run(`UPDATE cards SET scratched_count = scratched_count + 1 WHERE id = ?`, [cardId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            
            // Trigger Notification with image
            sendNtfy(cardId);
            
            res.json({ success: true });
        });
    });
});

app.get('/api/cards/:id/history', auth, (req, res) => {
    db.all(`SELECT timestamp FROM card_history WHERE card_id = ? ORDER BY timestamp DESC`, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- Routes: Books ---
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

app.put('/api/books/:id', auth, (req, res) => {
    const { title } = req.body;
    db.run(`UPDATE books SET title = ? WHERE id = ?`, [title, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/books/:id', auth, (req, res) => {
    const id = req.params.id;
    db.get(`SELECT filepath FROM books WHERE id = ?`, [id], (err, row) => {
        if (!row) return res.status(404).json({error: 'Book not found'});
        const cleanPath = row.filepath.replace('/uploads/', '');
        const absPath = path.join(DATA_DIR, 'uploads', cleanPath);
        if (fs.existsSync(absPath)) fs.unlinkSync(absPath);

        db.run(`DELETE FROM books WHERE id = ?`, [id], (err) => {
            if(err) return res.status(500).json({error: err.message});
            res.json({success: true});
        });
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Privy running on port ${PORT}`);
});
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
const { exec } = require('child_process'); 

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
    // Users
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT,
        age INTEGER,
        gender TEXT,
        avatar TEXT
    )`);

    // Cards
    db.run(`CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filepath TEXT,
        scratched_count INTEGER DEFAULT 0,
        section_id INTEGER
    )`);

    // Sections
    db.run(`CREATE TABLE IF NOT EXISTS sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT
    )`);
    
    // History
    db.run(`CREATE TABLE IF NOT EXISTS card_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(card_id) REFERENCES cards(id)
    )`);
    
    // Books
    db.run(`CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        filepath TEXT
    )`);

    // Settings
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);
    
    // Dice Options
    db.run(`CREATE TABLE IF NOT EXISTS dice_options (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT, -- 'act' or 'location'
        text TEXT,
        role TEXT DEFAULT 'wife'
    )`);

    // Locations Checklist
    db.run(`CREATE TABLE IF NOT EXISTS location_unlocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        unlocked_at DATETIME,
        count INTEGER DEFAULT 0
    )`);
    
    // Fantasies
    db.run(`CREATE TABLE IF NOT EXISTS fantasies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        pulled_at DATETIME -- NULL if still in jar
    )`);
    
    // Migrations (Run safely)
    db.run(`PRAGMA table_info(dice_options)`, (err, rows) => {
        db.run(`ALTER TABLE dice_options ADD COLUMN role TEXT DEFAULT 'wife'`, () => {});
    });
    db.run(`PRAGMA table_info(location_unlocks)`, (err, rows) => {
        db.run(`ALTER TABLE location_unlocks ADD COLUMN count INTEGER DEFAULT 0`, () => {});
    });

    // Seed default dice options
    db.get("SELECT count(*) as count FROM dice_options", (err, row) => {
        if (row && row.count === 0) {
            const defaults = [
                ['act', 'Kiss', 'wife'], ['act', 'Lick', 'wife'], ['act', 'Massage', 'wife'], 
                ['location', 'Neck', 'wife'], ['location', 'Ears', 'wife'], ['location', 'Thighs', 'wife'],
                ['act', 'Kiss', 'husband'], ['act', 'Lick', 'husband'], ['act', 'Massage', 'husband'], 
                ['location', 'Neck', 'husband'], ['location', 'Ears', 'husband'], ['location', 'Thighs', 'husband']
            ];
            const stmt = db.prepare("INSERT INTO dice_options (type, text, role) VALUES (?, ?, ?)");
            defaults.forEach(d => stmt.run(d));
            stmt.finalize();
        }
    });

    // Seed default locations
    db.get("SELECT count(*) as count FROM location_unlocks", (err, row) => {
        if (row && row.count === 0) {
            const defaults = ['Kitchen', 'Shower', 'Car', 'Balcony', 'Hotel', 'Woods', 'Living Room', 'Stairs'];
            const stmt = db.prepare("INSERT INTO location_unlocks (name) VALUES (?)");
            defaults.forEach(d => stmt.run(d));
            stmt.finalize();
        }
    });
});

// --- Ntfy Helper ---
const sendNtfy = (cardId) => {
    db.all(`SELECT * FROM settings WHERE key IN ('ntfy_url', 'ntfy_topic')`, [], (err, rows) => {
        if (err || !rows) return;
        
        const settings = rows.reduce((acc, r) => ({...acc, [r.key]: r.value}), {});
        if (!settings.ntfy_url || !settings.ntfy_topic) return;

        db.get(`SELECT filepath FROM cards WHERE id = ?`, [cardId], (err, card) => {
            if (!card) return;

            const cleanPath = card.filepath.replace('/uploads/', '');
            const absPath = path.join(DATA_DIR, 'uploads', cleanPath);

            if (fs.existsSync(absPath)) {
                if (typeof fetch !== 'function') return;

                try {
                    const fileBuffer = fs.readFileSync(absPath);
                    const { size } = fs.statSync(absPath);
                    const ext = path.extname(absPath) || '.jpg';
                    const timestamp = Date.now();
                    const filename = `card_${cardId}_${timestamp}${ext}`;

                    let contentType = 'application/octet-stream';
                    if (ext === '.png') contentType = 'image/png';
                    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
                    else if (ext === '.gif') contentType = 'image/gif';
                    
                    const baseUrl = settings.ntfy_url.replace(/\/$/, '');
                    const ntfyUrl = new URL(`${baseUrl}/${settings.ntfy_topic}`);
                    ntfyUrl.searchParams.append('message', "Today's Position \uD83D\uDE09"); 
                    ntfyUrl.searchParams.append('title', 'Privy: Card Revealed!');
                    ntfyUrl.searchParams.append('tags', 'heart,fire,camera');
                    ntfyUrl.searchParams.append('priority', 'high');
                    ntfyUrl.searchParams.append('filename', filename);

                    fetch(ntfyUrl.toString(), {
                        method: 'POST',
                        body: fileBuffer,
                        headers: {
                            'Content-Length': size.toString(),
                            'Content-Type': contentType
                        }
                    }).catch(err => console.error("Ntfy Error:", err.message));

                } catch (readErr) {
                    console.error("File Read Error:", readErr.message);
                }
            }
        });
    });
};

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

const auth = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: 'No token' });
    try {
        const decoded = jwt.verify(token.split(' ')[1], SECRET_KEY);
        req.user = decoded;
        next();
    } catch (e) { res.status(401).json({ error: 'Unauthorized' }); }
};

// --- Routes ---

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

app.post('/api/settings/test', auth, (req, res) => {
    const { ntfy_url, ntfy_topic } = req.body;
    if (!ntfy_url || !ntfy_topic) return res.status(400).json({ error: 'Missing Ntfy config' });

    const baseUrl = ntfy_url.replace(/\/$/, '');
    const url = `${baseUrl}/${ntfy_topic}`;

    if (typeof fetch !== 'function') return res.status(500).json({error: 'Fetch missing'});

    fetch(url, {
        method: 'POST',
        body: "Privy Notification Test Successful! 🎉",
        headers: { 'Title': 'Privy Test', 'Tags': 'tada,check_mark' }
    })
    .then(response => {
        if (response.ok) res.json({ success: true });
        else res.status(500).json({ error: `Ntfy Error: ${response.status}` });
    })
    .catch(err => res.status(500).json({ error: err.message }));
});

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
        if (row) {
            try {
                const cleanPath = row.filepath.replace('/uploads/', '');
                const absPath = path.join(DATA_DIR, 'uploads', cleanPath);
                if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
            } catch(e) { console.error(e); }
        }
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

app.post('/api/reset-app', auth, (req, res) => {
    db.serialize(() => {
        db.run(`DELETE FROM card_history`);
        db.run(`UPDATE cards SET scratched_count = 0`, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
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
        if (row) {
            try {
                const cleanPath = row.filepath.replace('/uploads/', '');
                const absPath = path.join(DATA_DIR, 'uploads', cleanPath);
                if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
            } catch(e) { console.error(e); }
        }
        db.run(`DELETE FROM books WHERE id = ?`, [id], (err) => {
            if(err) return res.status(500).json({error: err.message});
            res.json({success: true});
        });
    });
});

app.post('/api/books/:id/extract', auth, (req, res) => {
    const bookId = req.params.id;
    req.setTimeout(1200000); // 20 min timeout
    db.get(`SELECT * FROM books WHERE id = ?`, [bookId], (err, book) => {
        if (err || !book) return res.status(404).json({ error: 'Book not found' });

        const bookPath = book.filepath.replace('/uploads/', '');
        const absBookPath = path.join(DATA_DIR, 'uploads', bookPath);
        
        if (!fs.existsSync(absBookPath)) return res.status(404).json({ error: 'File missing' });

        const sectionTitle = `From: ${book.title}`;
        db.run(`INSERT INTO sections (title) VALUES (?)`, [sectionTitle], function(err) {
            if (err) return res.status(500).json({ error: 'Failed to create section' });
            
            const sectionId = this.lastID;
            const tempDir = path.join(DATA_DIR, 'uploads', 'temp_' + Date.now());
            fs.mkdirSync(tempDir);

            // -png: Output png
            const cmd = `pdfimages -png "${absBookPath}" "${tempDir}/img"`;
            
            exec(cmd, { maxBuffer: 1024 * 1024 * 100, timeout: 600000 }, (error, stdout, stderr) => {
                if (error) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                    return res.status(500).json({ error: 'Extraction failed/timed out' });
                }

                fs.readdir(tempDir, (err, files) => {
                    if (err) {
                        fs.rmSync(tempDir, { recursive: true, force: true });
                        return res.status(500).json({ error: 'Read dir failed' });
                    }

                    const cardPromises = files.map(file => {
                        return new Promise((resolve) => {
                            const tempFilePath = path.join(tempDir, file);
                            const stats = fs.statSync(tempFilePath);
                            
                            // Filter tiny images (< 50KB)
                            if (stats.size < 50 * 1024) { 
                                fs.unlinkSync(tempFilePath);
                                resolve(null);
                                return;
                            }

                            const newFilename = `${Date.now()}_${file}`;
                            const newPath = path.join(DATA_DIR, 'uploads', 'cards', newFilename);
                            fs.renameSync(tempFilePath, newPath);

                            const dbPath = `/uploads/cards/${newFilename}`;
                            db.run(`INSERT INTO cards (filepath, section_id) VALUES (?, ?)`, [dbPath, sectionId], function() {
                                resolve(this.lastID);
                            });
                        });
                    });

                    Promise.all(cardPromises).then(() => {
                        fs.rmSync(tempDir, { recursive: true, force: true });
                        res.json({ success: true, sectionId, message: 'Images extracted successfully' });
                    });
                });
            });
        });
    });
});

// --- Dice ---
app.get('/api/dice', auth, (req, res) => {
    db.all(`SELECT * FROM dice_options`, [], (err, rows) => {
        if(err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

app.put('/api/dice', auth, (req, res) => {
    const { items, role } = req.body;
    db.serialize(() => {
        db.run(`DELETE FROM dice_options WHERE role = ?`, [role || 'wife']);
        const stmt = db.prepare(`INSERT INTO dice_options (type, text, role) VALUES (?, ?, ?)`);
        items.forEach(item => stmt.run(item.type, item.text, role || 'wife'));
        stmt.finalize();
        res.json({success: true});
    });
});

// --- Locations ---
app.get('/api/locations', auth, (req, res) => {
    db.all(`SELECT * FROM location_unlocks`, [], (err, rows) => {
        if(err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

app.post('/api/locations/:id/toggle', auth, (req, res) => {
    const { increment } = req.body; 
    const time = new Date().toISOString();
    db.run(`UPDATE location_unlocks SET count = count + 1, unlocked_at = ? WHERE id = ?`, [time, req.params.id], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({success: true});
    });
});

app.post('/api/locations/:id/reset', auth, (req, res) => {
    db.run(`UPDATE location_unlocks SET count = 0, unlocked_at = NULL WHERE id = ?`, [req.params.id], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({success: true});
    });
});

app.post('/api/locations', auth, (req, res) => {
    const { name } = req.body;
    db.run(`INSERT INTO location_unlocks (name, count) VALUES (?, 0)`, [name], function(err) {
        if(err) return res.status(500).json({error: err.message});
        res.json({id: this.lastID, name, unlocked_at: null, count: 0});
    });
});

app.delete('/api/locations/:id', auth, (req, res) => {
    db.run(`DELETE FROM location_unlocks WHERE id = ?`, [req.params.id], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({success: true});
    });
});

// --- Fantasy Jar ---
app.get('/api/fantasies', auth, (req, res) => {
    db.all(`SELECT * FROM fantasies WHERE pulled_at IS NULL ORDER BY created_at DESC`, [], (err, rows) => {
        if(err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

app.get('/api/fantasies/history', auth, (req, res) => {
    db.all(`SELECT * FROM fantasies WHERE pulled_at IS NOT NULL ORDER BY pulled_at DESC`, [], (err, rows) => {
        if(err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

app.post('/api/fantasies', auth, (req, res) => {
    const { text } = req.body;
    db.run(`INSERT INTO fantasies (text) VALUES (?)`, [text], function(err) {
        if(err) return res.status(500).json({error: err.message});
        res.json({success: true, id: this.lastID});
    });
});

app.post('/api/fantasies/pull', auth, (req, res) => {
    db.get(`SELECT * FROM fantasies WHERE pulled_at IS NULL ORDER BY RANDOM() LIMIT 1`, [], (err, row) => {
        if(err) return res.status(500).json({error: err.message});
        if(!row) return res.json({empty: true});
        db.run(`UPDATE fantasies SET pulled_at = CURRENT_TIMESTAMP WHERE id = ?`, [row.id]);
        res.json(row);
    });
});

app.post('/api/fantasies/:id/return', auth, (req, res) => {
    db.run(`UPDATE fantasies SET pulled_at = NULL WHERE id = ?`, [req.params.id], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({success: true});
    });
});

app.delete('/api/fantasies/:id', auth, (req, res) => {
    db.run(`DELETE FROM fantasies WHERE id = ?`, [req.params.id], (err) => {
        if(err) return res.status(500).json({error: err.message});
        res.json({success: true});
    });
});

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, '../client/dist/index.html')); });
app.listen(PORT, () => { console.log(`🚀 Privy running on port ${PORT}`); });
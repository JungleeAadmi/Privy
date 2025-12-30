/**
 * Privy Backend - Node.js
 * Handles API, Database, and File Serving
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
        scratched_count INTEGER DEFAULT 0
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
});

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
    db.run(`INSERT INTO cards (filepath) VALUES (?)`, [filepath], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, filepath });
    });
});

app.delete('/api/cards/:id', auth, (req, res) => {
    const id = req.params.id;
    db.get(`SELECT filepath FROM cards WHERE id = ?`, [id], (err, row) => {
        if (!row) return res.status(404).json({error: 'Card not found'});
        
        // Try to delete file
        const fullPath = path.join(DATA_DIR, row.filepath); // filepath already includes /uploads/...
        // The filepath in DB starts with /uploads, but DATA_DIR points to data.
        // We mounted /uploads static route to DATA_DIR/uploads.
        // So we need to construct the absolute path carefully.
        // If row.filepath is "/uploads/cards/file.png" and DATA_DIR is "/opt/privy/data"
        // We need "/opt/privy/data/uploads/cards/file.png".
        const cleanPath = row.filepath.replace('/uploads/', '');
        const absPath = path.join(DATA_DIR, 'uploads', cleanPath);

        if (fs.existsSync(absPath)) {
            fs.unlinkSync(absPath);
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
            res.json({ success: true });
        });
    });
});

app.get('/api/cards/:id/history', auth, (req, res) => {
    db.all(
        `SELECT timestamp FROM card_history WHERE card_id = ? ORDER BY timestamp DESC`, 
        [req.params.id], 
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
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

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Privy running on port ${PORT}`);
});
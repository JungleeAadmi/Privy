/**
 * Privy Backend - Node.js
 * STABLE VERSION: Calendar Added, Export Removed
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

// --- Global Error Handlers ---
process.on('uncaughtException', (err) => {
    console.error('CRITICAL ERROR (Uncaught):', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL ERROR (Unhandled Rejection):', reason);
});

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
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('DB Error:', err.message);
    else console.log('✅ Connected to SQLite database.');
});

// --- Init Tables ---
db.serialize(() => {
    // Users
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, name TEXT, age INTEGER, gender TEXT, avatar TEXT)`);
    // Settings
    db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
    
    // Cards & Structure
    db.run(`CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT, filepath TEXT, scratched_count INTEGER DEFAULT 0, section_id INTEGER)`);
    db.run(`CREATE TABLE IF NOT EXISTS sections (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, header_id INTEGER)`);
    db.run(`CREATE TABLE IF NOT EXISTS header_sections (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS card_history (id INTEGER PRIMARY KEY AUTOINCREMENT, card_id INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(card_id) REFERENCES cards(id))`);
    
    // Books
    db.run(`CREATE TABLE IF NOT EXISTS books (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, filepath TEXT)`);
    
    // Dice
    db.run(`CREATE TABLE IF NOT EXISTS dice_options (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, text TEXT, role TEXT DEFAULT 'wife')`);
    
    // Locations
    db.run(`CREATE TABLE IF NOT EXISTS location_unlocks (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, unlocked_at DATETIME, count INTEGER DEFAULT 0)`);
    
    // Fantasies
    db.run(`CREATE TABLE IF NOT EXISTS fantasies (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, pulled_at DATETIME)`);

    // Galleries
    db.run(`CREATE TABLE IF NOT EXISTS toys (id INTEGER PRIMARY KEY AUTOINCREMENT, filepath TEXT, chosen_count INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS lingerie (id INTEGER PRIMARY KEY AUTOINCREMENT, filepath TEXT, chosen_count INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS condoms (id INTEGER PRIMARY KEY, filepath TEXT, chosen_count INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS lubes (id INTEGER PRIMARY KEY, filepath TEXT, chosen_count INTEGER DEFAULT 0)`);

    // Calendar
    db.run(`CREATE TABLE IF NOT EXISTS calendar_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, text TEXT)`);

    // Safe Migrations
    const runMigration = (sql) => { try { db.run(sql, () => {}); } catch (e) {} };
    runMigration(`ALTER TABLE dice_options ADD COLUMN role TEXT DEFAULT 'wife'`);
    runMigration(`ALTER TABLE location_unlocks ADD COLUMN count INTEGER DEFAULT 0`);
    runMigration(`ALTER TABLE sections ADD COLUMN header_id INTEGER`);
});

// --- Helper: Ntfy ---
const sendNtfy = (itemId, type) => {
    db.all(`SELECT * FROM settings WHERE key IN ('ntfy_url', 'ntfy_topic')`, [], (err, rows) => {
        if (err || !rows) return;
        const settings = rows.reduce((acc, r) => ({...acc, [r.key]: r.value}), {});
        if (!settings.ntfy_url) return;

        let table = 'cards', msg = "New Activity", title = "Privy Update";
        if (type === 'card') { title = "Card Revealed!"; msg = "Let's play..."; }
        else if (type === 'toy') { table = 'toys'; title = "Toy Selected!"; msg = "Tonight's toy is..."; }
        else if (type === 'lingerie') { table = 'lingerie'; title = "Wear This!"; msg = "Please wear..."; }
        else if (type === 'condoms') { table = 'condoms'; title = "Safety First"; msg = "Use this..."; }
        else if (type === 'lubes') { table = 'lubes'; title = "Lube Up"; msg = "Smooth..."; }

        db.get(`SELECT filepath FROM ${table} WHERE id = ?`, [itemId], (err, row) => {
            if (!row) return;
            const p = path.join(DATA_DIR, 'uploads', row.filepath.replace('/uploads/', ''));
            if (fs.existsSync(p)) {
                try {
                    const u = new URL(`${settings.ntfy_url.replace(/\/$/, '')}/${settings.ntfy_topic}`);
                    u.searchParams.append('message', msg);
                    u.searchParams.append('title', title);
                    u.searchParams.append('filename', `${type}_${itemId}.jpg`);
                    if (typeof fetch === 'function') {
                        fetch(u.toString(), { method: 'POST', body: fs.readFileSync(p) }).catch(console.error);
                    }
                } catch (e) { console.error("Ntfy Error", e); }
            }
        });
    });
};

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, f, cb) => {
            let sub = 'cards';
            if (req.path.includes('book')) sub = 'books';
            else if (req.path.includes('toy')) sub = 'toys';
            else if (req.path.includes('lingerie')) sub = 'lingerie';
            else if (req.path.includes('condom')) sub = 'condoms';
            else if (req.path.includes('lube')) sub = 'lubes';
            const d = path.join(DATA_DIR, 'uploads', sub);
            if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
            cb(null, d);
        },
        filename: (req, f, cb) => cb(null, Date.now() + '-' + f.originalname.replace(/[^a-zA-Z0-9.]/g, '_'))
    })
});

const auth = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: 'No token' });
    try {
        const t = token.split(' ')[1];
        req.user = jwt.verify(t, SECRET_KEY);
        next();
    } catch (e) { res.status(401).json({ error: 'Unauthorized' }); }
};

// --- ROUTES ---

// Auth
app.post('/api/login', (req, res) => {
    db.get(`SELECT * FROM users WHERE username=?`, [req.body.username], (err, user) => {
        if (!user || !bcrypt.compareSync(req.body.password, user.password)) return res.status(400).json({ error: 'Invalid' });
        res.json({ token: jwt.sign({ id: user.id }, SECRET_KEY), user });
    });
});
app.post('/api/register', (req, res) => {
    const hash = bcrypt.hashSync(req.body.password, 8);
    db.run(`INSERT INTO users (username, password) VALUES (?,?)`, [req.body.username, hash], function(err) {
        if (err) return res.status(400).json({ error: 'Taken' });
        res.json({ success: true, id: this.lastID });
    });
});

// Settings
app.get('/api/settings', auth, (req, res) => db.all(`SELECT * FROM settings`, [], (err, rows) => res.json(rows ? rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {}) : {})));
app.put('/api/settings', auth, (req, res) => {
    db.serialize(() => {
        const s = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
        if (req.body.ntfy_url) { s.run('ntfy_url', req.body.ntfy_url); s.run('ntfy_topic', req.body.ntfy_topic); }
        s.finalize();
        res.json({ success: true });
    });
});

// Calendar
app.get('/api/calendar', auth, (req, res) => db.all('SELECT * FROM calendar_notes', [], (err, rows) => res.json(rows || [])));
app.post('/api/calendar', auth, (req, res) => {
    db.run('INSERT INTO calendar_notes (date, text) VALUES (?,?)', [req.body.date, req.body.text], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});
app.delete('/api/calendar/:id', auth, (req, res) => {
    db.run('DELETE FROM calendar_notes WHERE id=?', [req.params.id], () => res.json({ success: true }));
});

// Sections
app.get('/api/sections', auth, (req, res) => db.all(`SELECT * FROM sections`, [], (err, rows) => res.json(rows || [])));
app.post('/api/sections', auth, (req, res) => db.run(`INSERT INTO sections (title) VALUES (?)`, [req.body.title], function() { res.json({ id: this.lastID }) }));
app.put('/api/sections/:id', auth, (req, res) => db.run(`UPDATE sections SET title=? WHERE id=?`, [req.body.title, req.params.id], () => res.json({ success: true })));
app.delete('/api/sections/:id', auth, (req, res) => {
    db.all(`SELECT filepath FROM cards WHERE section_id = ?`, [req.params.id], (err, rows) => {
        if (rows) rows.forEach(r => { try { fs.unlinkSync(path.join(DATA_DIR, 'uploads', r.filepath.replace('/uploads/', ''))); } catch (e) {} });
        db.serialize(() => {
            db.run(`DELETE FROM cards WHERE section_id=?`, [req.params.id]);
            db.run(`DELETE FROM sections WHERE id=?`, [req.params.id], () => res.json({ success: true }));
        });
    });
});

// Cards
app.get('/api/cards', auth, (req, res) => db.all(`SELECT * FROM cards`, [], (err, rows) => res.json(rows || [])));
app.post('/api/cards', auth, upload.single('file'), (req, res) => {
    db.run(`INSERT INTO cards (filepath, section_id) VALUES (?,?)`, [`/uploads/cards/${req.file.filename}`, req.body.section_id || null], function() {
        res.json({ id: this.lastID, filepath: `/uploads/cards/${req.file.filename}` });
    });
});
app.delete('/api/cards/:id', auth, (req, res) => {
    db.get(`SELECT filepath FROM cards WHERE id=?`, [req.params.id], (err, r) => {
        if (r) try { fs.unlinkSync(path.join(DATA_DIR, 'uploads', r.filepath.replace('/uploads/', ''))); } catch (e) {}
        db.serialize(() => {
            db.run(`DELETE FROM card_history WHERE card_id=?`, [req.params.id]);
            db.run(`DELETE FROM cards WHERE id=?`, [req.params.id], () => res.json({ success: true }));
        });
    });
});
app.post('/api/cards/:id/scratch', auth, (req, res) => {
    db.run(`INSERT INTO card_history (card_id) VALUES (?)`, [req.params.id]);
    db.run(`UPDATE cards SET scratched_count=scratched_count+1 WHERE id=?`, [req.params.id], () => { sendNtfy(req.params.id, 'card'); res.json({ success: true }); });
});
app.get('/api/cards/:id/history', auth, (req, res) => db.all(`SELECT timestamp FROM card_history WHERE card_id=? ORDER BY timestamp DESC`, [req.params.id], (err, rows) => res.json(rows || [])));

// Books
app.get('/api/books', auth, (req, res) => db.all(`SELECT * FROM books`, [], (err, rows) => res.json(rows || [])));
app.post('/api/books', auth, upload.single('file'), (req, res) => {
    db.run(`INSERT INTO books (title, filepath) VALUES (?,?)`, [req.file.originalname, `/uploads/books/${req.file.filename}`], function() { res.json({ id: this.lastID }); });
});
app.delete('/api/books/:id', auth, (req, res) => {
    db.get(`SELECT filepath FROM books WHERE id=?`, [req.params.id], (err, r) => {
        if (r) try { fs.unlinkSync(path.join(DATA_DIR, 'uploads', r.filepath.replace('/uploads/', ''))); } catch (e) {}
        db.run(`DELETE FROM books WHERE id=?`, [req.params.id], () => res.json({ success: true }));
    });
});

// Dice
app.get('/api/dice', auth, (req, res) => db.all(`SELECT * FROM dice_options`, [], (err, rows) => res.json(rows || [])));
app.put('/api/dice', auth, (req, res) => {
    db.serialize(() => {
        db.run(`DELETE FROM dice_options WHERE role=?`, [req.body.role || 'wife']);
        const s = db.prepare(`INSERT INTO dice_options (type, text, role) VALUES (?,?,?)`);
        req.body.items.forEach(i => s.run(i.type, i.text, req.body.role || 'wife'));
        s.finalize();
        res.json({ success: true });
    });
});

// Locations
app.get('/api/locations', auth, (req, res) => db.all(`SELECT * FROM location_unlocks`, [], (err, rows) => res.json(rows || [])));
app.post('/api/locations', auth, (req, res) => db.run(`INSERT INTO location_unlocks (name) VALUES (?)`, [req.body.name], function() { res.json({ id: this.lastID }) }));
app.post('/api/locations/:id/toggle', auth, (req, res) => db.run(`UPDATE location_unlocks SET count=count+1, unlocked_at=? WHERE id=?`, [new Date().toISOString(), req.params.id], () => res.json({ success: true })));
app.delete('/api/locations/:id', auth, (req, res) => db.run(`DELETE FROM location_unlocks WHERE id=?`, [req.params.id], () => res.json({ success: true })));

// Galleries
const makeGallery = (t, sub) => {
    app.get(`/api/${t}`, auth, (req, res) => db.all(`SELECT * FROM ${t}`, [], (e, r) => res.json(r || [])));
    app.post(`/api/${t}`, auth, upload.single('file'), (req, res) => {
        db.run(`INSERT INTO ${t} (filepath) VALUES (?)`, [`/uploads/${sub}/${req.file.filename}`], function() { res.json({ id: this.lastID }); });
    });
    app.delete(`/api/${t}/:id`, auth, (req, res) => {
        db.get(`SELECT filepath FROM ${t} WHERE id=?`, [req.params.id], (e, r) => {
            if (r) try { fs.unlinkSync(path.join(DATA_DIR, 'uploads', r.filepath.replace('/uploads/', ''))); } catch (e) {}
            db.run(`DELETE FROM ${t} WHERE id=?`, [req.params.id], () => res.json({ success: true }));
        });
    });
    app.post(`/api/${t}/:id/draw`, auth, (req, res) => {
        db.run(`UPDATE ${t} SET chosen_count=chosen_count+1 WHERE id=?`, [req.params.id]);
        sendNtfy(req.params.id, sub);
        res.json({ success: true });
    });
};
makeGallery('toys', 'toy');
makeGallery('lingerie', 'lingerie');
makeGallery('condoms', 'condoms');
makeGallery('lubes', 'lubes');

app.post('/api/reset-app', auth, (req, res) => {
    db.serialize(() => {
        ['card_history', 'cards', 'location_unlocks', 'toys', 'lingerie', 'condoms', 'lubes'].forEach(t => {
            const f = t === 'card_history' ? 'DELETE FROM' : 'UPDATE';
            const s = t === 'card_history' ? '' : t === 'location_unlocks' ? 'SET count=0, unlocked_at=NULL' : 'SET scratched_count=0';
            const w = t === 'toys' || t === 'lingerie' || t === 'condoms' || t === 'lubes' ? 'SET chosen_count=0' : s;
            db.run(`${f} ${t} ${w}`);
        });
        res.json({ success: true });
    });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../client/dist/index.html')));
app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));
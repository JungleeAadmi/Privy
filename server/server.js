/**
 * Privy Backend - Node.js
 * COMPLETE VERSION
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
    // Core
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, name TEXT, age INTEGER, gender TEXT, avatar TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
    
    // Cards
    db.run(`CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT, filepath TEXT, scratched_count INTEGER DEFAULT 0, section_id INTEGER)`);
    db.run(`CREATE TABLE IF NOT EXISTS sections (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT)`);
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
    db.run(`CREATE TABLE IF NOT EXISTS condoms (id INTEGER PRIMARY KEY AUTOINCREMENT, filepath TEXT, chosen_count INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS lubes (id INTEGER PRIMARY KEY AUTOINCREMENT, filepath TEXT, chosen_count INTEGER DEFAULT 0)`);

    // Migrations
    try {
        db.run(`ALTER TABLE dice_options ADD COLUMN role TEXT DEFAULT 'wife'`, () => {});
        db.run(`ALTER TABLE location_unlocks ADD COLUMN count INTEGER DEFAULT 0`, () => {});
    } catch (e) {}
});

// --- Unified Ntfy Helper ---
const sendNtfy = (itemId, type = 'card') => {
    db.all(`SELECT * FROM settings WHERE key IN ('ntfy_url', 'ntfy_topic')`, [], (err, rows) => {
        if (err || !rows) return;
        const settings = rows.reduce((acc, r) => ({...acc, [r.key]: r.value}), {});
        if (!settings.ntfy_url || !settings.ntfy_topic) return;

        let table = 'cards';
        let title = 'Privy: Card Revealed!';
        let message = "Today's Position \uD83D\uDE09"; 
        
        if (type === 'toy') { table = 'toys'; title = 'Privy: Toy Selected!'; message = "Let's play with this tonight \uD83D\uDD25"; }
        else if (type === 'lingerie') { table = 'lingerie'; title = 'Privy: Lingerie Chosen!'; message = "Wear this for me \uD83D\uDC8B"; }
        else if (type === 'condoms') { table = 'condoms'; title = 'Privy: Protection Selected'; message = "Safety First! \uD83D\uDEE1\uFE0F"; }
        else if (type === 'lubes') { table = 'lubes'; title = 'Privy: Lube Selected'; message = "Smooth things over \uD83D\uDCA7"; }

        db.get(`SELECT filepath FROM ${table} WHERE id = ?`, [itemId], (err, item) => {
            if (!item) return;

            const cleanPath = item.filepath.replace('/uploads/', '');
            const absPath = path.join(DATA_DIR, 'uploads', cleanPath);

            if (fs.existsSync(absPath)) {
                if (typeof fetch !== 'function') return;
                try {
                    const fileBuffer = fs.readFileSync(absPath);
                    const { size } = fs.statSync(absPath);
                    const ext = path.extname(absPath) || '.jpg';
                    const filename = `${type}_${itemId}_${Date.now()}${ext}`;

                    let contentType = 'application/octet-stream';
                    if (ext === '.png') contentType = 'image/png';
                    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';

                    const baseUrl = settings.ntfy_url.replace(/\/$/, '');
                    const ntfyUrl = new URL(`${baseUrl}/${settings.ntfy_topic}`);
                    ntfyUrl.searchParams.append('message', message);
                    ntfyUrl.searchParams.append('title', title);
                    ntfyUrl.searchParams.append('tags', 'heart,fire,camera');
                    ntfyUrl.searchParams.append('priority', 'high');
                    ntfyUrl.searchParams.append('filename', filename);

                    fetch(ntfyUrl.toString(), {
                        method: 'POST',
                        body: fileBuffer,
                        headers: { 'Content-Length': size.toString(), 'Content-Type': contentType }
                    }).catch(err => console.error("Ntfy Error:", err.message));
                } catch (readErr) { console.error("File Read Error:", readErr.message); }
            }
        });
    });
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let subfolder = 'cards';
        if (req.path.includes('book')) subfolder = 'books';
        else if (req.path.includes('toy')) subfolder = 'toys';
        else if (req.path.includes('lingerie')) subfolder = 'lingerie';
        else if (req.path.includes('condom')) subfolder = 'condoms';
        else if (req.path.includes('lube')) subfolder = 'lubes';
        
        const dir = path.join(DATA_DIR, 'uploads', subfolder);
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
    try { const decoded = jwt.verify(token.split(' ')[1], SECRET_KEY); req.user = decoded; next(); } catch (e) { res.status(401).json({ error: 'Unauthorized' }); }
};

// --- ROUTES ---

// ... (Auth/User/Settings routes identical)
app.post('/api/register', (req, res) => { const { username, password } = req.body; const hash = bcrypt.hashSync(password, 8); db.run(`INSERT INTO users (username, password) VALUES (?,?)`, [username, hash], function(err) { if(err) return res.status(400).json({error:'Taken'}); res.json({success:true, id:this.lastID}); }); });
app.post('/api/login', (req, res) => { const { username, password } = req.body; db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => { if (!user || !bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: 'Invalid' }); const token = jwt.sign({ id: user.id, name: user.name }, SECRET_KEY); res.json({ token, user }); }); });
app.put('/api/user', auth, (req, res) => { const { name, password } = req.body; let sql = `UPDATE users SET name = ? WHERE id = ?`; let params = [name, req.user.id]; if(password){ sql=`UPDATE users SET name=?, password=? WHERE id=?`; params=[name, bcrypt.hashSync(password, 8), req.user.id];} db.run(sql, params, (err)=>{ if(err)return res.status(500).json({error:err.message}); res.json({success:true}); }); });
app.get('/api/settings', auth, (req, res) => { db.all(`SELECT * FROM settings`, [], (err, rows) => { const s = rows ? rows.reduce((acc, r) => ({...acc, [r.key]: r.value}), {}) : {}; res.json(s); }); });
app.put('/api/settings', auth, (req, res) => { const { ntfy_url, ntfy_topic } = req.body; db.serialize(() => { const s=db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`); s.run('ntfy_url', ntfy_url); s.run('ntfy_topic', ntfy_topic); s.finalize(); res.json({success:true}); }); });
app.post('/api/settings/test', auth, (req, res) => { const { ntfy_url, ntfy_topic } = req.body; if(!ntfy_url) return res.status(400).json({error:'No Config'}); const u = new URL(`${ntfy_url.replace(/\/$/,'')}/${ntfy_topic}`); fetch(u.toString(), {method:'POST', body:'Test'}).then(r=>{if(r.ok)res.json({success:true});else res.status(500).json({error:r.status})}).catch(e=>res.status(500).json({error:e.message})); });

// ... (Sections/Cards/Books routes same as previous)
app.get('/api/sections', auth, (req, res) => { db.all(`SELECT * FROM sections`, [], (err, rows) => { res.json(rows || []); }); });
app.post('/api/sections', auth, (req, res) => { db.run(`INSERT INTO sections (title) VALUES (?)`, [req.body.title], function(err){ res.json({id:this.lastID}); }); });
app.put('/api/sections/:id', auth, (req, res) => { db.run(`UPDATE sections SET title = ? WHERE id = ?`, [req.body.title, req.params.id], (err)=>{ res.json({success:true}); }); });
app.delete('/api/sections/:id', auth, (req, res) => { const id=req.params.id; db.all(`SELECT filepath FROM cards WHERE section_id = ?`, [id], (err, rows)=>{ if(rows) rows.forEach(r=>{ try{ fs.unlinkSync(path.join(DATA_DIR, 'uploads', r.filepath.replace('/uploads/',''))); }catch(e){} }); db.serialize(()=>{ db.run(`DELETE FROM cards WHERE section_id=?`,[id]); db.run(`DELETE FROM sections WHERE id=?`,[id],()=>{ res.json({success:true}); }); }); }); });

app.get('/api/cards', auth, (req, res) => { db.all(`SELECT * FROM cards`, [], (err, rows) => { res.json(rows || []); }); });
app.post('/api/cards', auth, upload.single('file'), (req, res) => { if(!req.file) return res.status(400).json({error:'No file'}); db.run(`INSERT INTO cards (filepath, section_id) VALUES (?,?)`, [`/uploads/cards/${req.file.filename}`, req.body.section_id||null], function(err){ res.json({id:this.lastID}); }); });
app.delete('/api/cards/:id', auth, (req, res) => { const id=req.params.id; db.get(`SELECT filepath FROM cards WHERE id=?`,[id],(err,r)=>{ if(r) try{ fs.unlinkSync(path.join(DATA_DIR, 'uploads', r.filepath.replace('/uploads/',''))); }catch(e){} db.serialize(()=>{ db.run(`DELETE FROM card_history WHERE card_id=?`,[id]); db.run(`DELETE FROM cards WHERE id=?`,[id],()=>{ res.json({success:true}); }); }); }); });
app.post('/api/cards/:id/scratch', auth, (req, res) => { const id=req.params.id; db.serialize(()=>{ db.run(`INSERT INTO card_history (card_id) VALUES (?)`, [id]); db.run(`UPDATE cards SET scratched_count=scratched_count+1 WHERE id=?`, [id], ()=>{ sendNtfy(id, 'card'); res.json({success:true}); }); }); });
app.get('/api/cards/:id/history', auth, (req, res) => { db.all(`SELECT timestamp FROM card_history WHERE card_id=? ORDER BY timestamp DESC`, [req.params.id], (err, rows) => { res.json(rows||[]); }); });

app.get('/api/books', auth, (req, res) => { db.all(`SELECT * FROM books`, [], (err, rows) => res.json(rows||[])); });
app.post('/api/books', auth, upload.single('file'), (req, res) => { if(!req.file) return res.status(400).json({error:'No file'}); db.run(`INSERT INTO books (title, filepath) VALUES (?,?)`, [req.file.originalname, `/uploads/books/${req.file.filename}`], function(err){ res.json({id:this.lastID}); }); });
app.put('/api/books/:id', auth, (req, res) => { db.run(`UPDATE books SET title=? WHERE id=?`, [req.body.title, req.params.id], ()=>{ res.json({success:true}); }); });
app.delete('/api/books/:id', auth, (req, res) => { const id=req.params.id; db.get(`SELECT filepath FROM books WHERE id=?`,[id],(err,r)=>{ if(r) try{ fs.unlinkSync(path.join(DATA_DIR, 'uploads', r.filepath.replace('/uploads/',''))); }catch(e){} db.run(`DELETE FROM books WHERE id=?`,[id],()=>{ res.json({success:true}); }); }); });
app.post('/api/books/:id/extract', auth, (req, res) => {
    const bookId = req.params.id;
    req.setTimeout(1200000); 
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
            
            exec(`pdfimages -png "${absBookPath}" "${tempDir}/img"`, { timeout: 600000 }, (error) => {
                if (error) { fs.rmSync(tempDir, {recursive:true, force:true}); return res.status(500).json({error:'Extract failed'}); }
                fs.readdir(tempDir, (err, files) => {
                    if (err) return res.status(500).json({error:'Read failed'});
                    const promises = files.map(file => new Promise(resolve => {
                        const tPath = path.join(tempDir, file);
                        if (fs.statSync(tPath).size < 50*1024) { fs.unlinkSync(tPath); resolve(); return; }
                        const nName = `${Date.now()}_${file}`;
                        fs.renameSync(tPath, path.join(DATA_DIR, 'uploads', 'cards', nName));
                        db.run(`INSERT INTO cards (filepath, section_id) VALUES (?,?)`, [`/uploads/cards/${nName}`, sectionId], ()=>resolve());
                    }));
                    Promise.all(promises).then(() => { fs.rmSync(tempDir, {recursive:true, force:true}); res.json({success:true}); });
                });
            });
        });
    });
});

// ... (Dice/Locations/Fantasies same as before)
app.get('/api/dice', auth, (req, res) => { db.all(`SELECT * FROM dice_options`, [], (err, rows) => res.json(rows||[])); });
app.put('/api/dice', auth, (req, res) => { const { items, role } = req.body; db.serialize(()=>{ db.run(`DELETE FROM dice_options WHERE role=?`, [role||'wife']); const s=db.prepare(`INSERT INTO dice_options (type, text, role) VALUES (?,?,?)`); items.forEach(i=>s.run(i.type, i.text, role||'wife')); s.finalize(); res.json({success:true}); }); });
app.get('/api/locations', auth, (req, res) => { db.all(`SELECT * FROM location_unlocks`, [], (err, rows) => res.json(rows||[])); });
app.post('/api/locations', auth, (req, res) => { db.run(`INSERT INTO location_unlocks (name) VALUES (?)`, [req.body.name], function(){ res.json({id:this.lastID}); }); });
app.post('/api/locations/:id/toggle', auth, (req, res) => { db.run(`UPDATE location_unlocks SET count=count+1, unlocked_at=? WHERE id=?`, [new Date().toISOString(), req.params.id], ()=>{ res.json({success:true}); }); });
app.post('/api/locations/:id/reset', auth, (req, res) => { db.run(`UPDATE location_unlocks SET count=0, unlocked_at=NULL WHERE id=?`, [req.params.id], ()=>{ res.json({success:true}); }); });
app.delete('/api/locations/:id', auth, (req, res) => { db.run(`DELETE FROM location_unlocks WHERE id=?`, [req.params.id], ()=>{ res.json({success:true}); }); });
app.get('/api/fantasies', auth, (req, res) => { db.all(`SELECT * FROM fantasies WHERE pulled_at IS NULL ORDER BY created_at DESC`, [], (err, rows) => res.json(rows||[])); });
app.get('/api/fantasies/history', auth, (req, res) => { db.all(`SELECT * FROM fantasies WHERE pulled_at IS NOT NULL ORDER BY pulled_at DESC`, [], (err, rows) => res.json(rows||[])); });
app.post('/api/fantasies', auth, (req, res) => { db.run(`INSERT INTO fantasies (text) VALUES (?)`, [req.body.text], function(){ res.json({success:true}); }); });
app.post('/api/fantasies/pull', auth, (req, res) => { db.get(`SELECT * FROM fantasies WHERE pulled_at IS NULL ORDER BY RANDOM() LIMIT 1`, [], (err, row) => { if(!row) return res.json({empty:true}); db.run(`UPDATE fantasies SET pulled_at=CURRENT_TIMESTAMP WHERE id=?`, [row.id]); res.json(row); }); });
app.post('/api/fantasies/:id/return', auth, (req, res) => { db.run(`UPDATE fantasies SET pulled_at=NULL WHERE id=?`, [req.params.id], ()=>{ res.json({success:true}); }); });
app.delete('/api/fantasies/:id', auth, (req, res) => { db.run(`DELETE FROM fantasies WHERE id=?`, [req.params.id], ()=>{ res.json({success:true}); }); });
app.post('/api/reset-app', auth, (req, res) => { db.serialize(()=>{ db.run(`DELETE FROM card_history`); db.run(`UPDATE cards SET scratched_count=0`); db.run(`UPDATE location_unlocks SET count=0, unlocked_at=NULL`); db.run(`UPDATE toys SET chosen_count=0`); db.run(`UPDATE lingerie SET chosen_count=0`); db.run(`UPDATE condoms SET chosen_count=0`); db.run(`UPDATE lubes SET chosen_count=0`); res.json({success:true}); }); });

// --- Unified Gallery Handlers (Toys, Lingerie, Protection) ---
const handleGalleryGet = (table) => (req, res) => { db.all(`SELECT * FROM ${table}`, [], (err, rows) => res.json(rows||[])); };
const handleGalleryPost = (table, subfolder) => (req, res) => { if(!req.file) return res.status(400).json({error:'No file'}); db.run(`INSERT INTO ${table} (filepath) VALUES (?)`, [`/uploads/${subfolder}/${req.file.filename}`], function(err){ res.json({id:this.lastID}); }); };
const handleGalleryDelete = (table) => (req, res) => { db.get(`SELECT filepath FROM ${table} WHERE id=?`,[req.params.id],(err,r)=>{ if(r) try{ fs.unlinkSync(path.join(DATA_DIR, 'uploads', r.filepath.replace('/uploads/',''))); }catch(e){} db.run(`DELETE FROM ${table} WHERE id=?`, [req.params.id], ()=>{ res.json({success:true}); }); }); };
const handleGalleryDraw = (table, type) => (req, res) => { db.get(`SELECT * FROM ${table} WHERE id=?`, [req.params.id], (err, item) => { if(item) { db.run(`UPDATE ${table} SET chosen_count=chosen_count+1 WHERE id=?`, [req.params.id]); sendNtfy(req.params.id, type); res.json({success:true}); } else res.status(404).json({error:'Not found'}); }); };

// Toys
app.get('/api/toys', auth, handleGalleryGet('toys'));
app.post('/api/toys', auth, upload.single('file'), handleGalleryPost('toys', 'toys'));
app.delete('/api/toys/:id', auth, handleGalleryDelete('toys'));
app.post('/api/toys/:id/draw', auth, handleGalleryDraw('toys', 'toy'));

// Lingerie
app.get('/api/lingerie', auth, handleGalleryGet('lingerie'));
app.post('/api/lingerie', auth, upload.single('file'), handleGalleryPost('lingerie', 'lingerie'));
app.delete('/api/lingerie/:id', auth, handleGalleryDelete('lingerie'));
app.post('/api/lingerie/:id/draw', auth, handleGalleryDraw('lingerie', 'lingerie'));

// Protection (Condoms & Lubes)
app.get('/api/condoms', auth, handleGalleryGet('condoms'));
app.post('/api/condoms', auth, upload.single('file'), handleGalleryPost('condoms', 'condoms'));
app.delete('/api/condoms/:id', auth, handleGalleryDelete('condoms'));
app.post('/api/condoms/:id/draw', auth, handleGalleryDraw('condoms', 'condoms'));

app.get('/api/lubes', auth, handleGalleryGet('lubes'));
app.post('/api/lubes', auth, upload.single('file'), handleGalleryPost('lubes', 'lubes'));
app.delete('/api/lubes/:id', auth, handleGalleryDelete('lubes'));
app.post('/api/lubes/:id/draw', auth, handleGalleryDraw('lubes', 'lubes'));

// --- EXPORT DATA ---
app.get('/api/export', auth, (req, res) => {
    // 1. Create Temp Directory
    const timestamp = Date.now();
    const exportRoot = path.join('/tmp', `privy_export_${timestamp}`);
    const exportDataDir = path.join(exportRoot, 'data');
    
    fs.mkdirSync(exportDataDir, { recursive: true });

    // Helper to copy
    const copyFile = (srcRel, destFolder) => {
        const srcAbs = path.join(DATA_DIR, 'uploads', srcRel.replace(/^\/uploads\//, ''));
        const destAbs = path.join(exportDataDir, destFolder);
        if(!fs.existsSync(destAbs)) fs.mkdirSync(destAbs, { recursive: true });
        if(fs.existsSync(srcAbs)) {
            const fileName = path.basename(srcAbs);
            fs.copyFileSync(srcAbs, path.join(destAbs, fileName));
        }
    };

    // 2. Query all data and copy files
    db.serialize(() => {
        // Cards organized by Section
        db.all(`SELECT c.filepath, s.title as section FROM cards c LEFT JOIN sections s ON c.section_id = s.id`, [], (err, rows) => {
            if(rows) rows.forEach(row => copyFile(row.filepath, `Cards/${row.section || 'Unsorted'}`));
        });
        
        // Other Assets
        db.all(`SELECT filepath, title FROM books`, [], (err, rows) => { if(rows) rows.forEach(r => copyFile(r.filepath, 'Books')); });
        db.all(`SELECT filepath FROM toys`, [], (err, rows) => { if(rows) rows.forEach(r => copyFile(r.filepath, 'Toys')); });
        db.all(`SELECT filepath FROM lingerie`, [], (err, rows) => { if(rows) rows.forEach(r => copyFile(r.filepath, 'Lingerie')); });
        db.all(`SELECT filepath FROM condoms`, [], (err, rows) => { if(rows) rows.forEach(r => copyFile(r.filepath, 'Protection/Condoms')); });
        db.all(`SELECT filepath FROM lubes`, [], (err, rows) => { if(rows) rows.forEach(r => copyFile(r.filepath, 'Protection/Lubes')); });

        // Wait a bit for copies to finish (simple hack since copyFileSync is sync)
        setTimeout(() => {
            // 3. Zip
            const zipPath = `${exportRoot}.zip`;
            exec(`cd /tmp && zip -r ${zipPath} privy_export_${timestamp}`, (error) => {
                if (error) {
                    return res.status(500).json({ error: 'Zip failed. Is zip installed?' });
                }
                
                // 4. Send and Cleanup
                res.download(zipPath, `privy_backup_${new Date().toISOString().split('T')[0]}.zip`, () => {
                    fs.rmSync(exportRoot, { recursive: true, force: true });
                    fs.unlinkSync(zipPath);
                });
            });
        }, 1000);
    });
});


app.get('*', (req, res) => { res.sendFile(path.join(__dirname, '../client/dist/index.html')); });
app.listen(PORT, () => { console.log(`🚀 Privy running on port ${PORT}`); });
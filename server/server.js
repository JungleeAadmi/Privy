/**
 * Privy Backend - Node.js
 * STABLE ROLLBACK + DICE/GALLERY FIXES
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
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, name TEXT, age INTEGER, gender TEXT, avatar TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
    
    db.run(`CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT, filepath TEXT, scratched_count INTEGER DEFAULT 0, section_id INTEGER)`);
    db.run(`CREATE TABLE IF NOT EXISTS sections (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, header_id INTEGER)`);
    db.run(`CREATE TABLE IF NOT EXISTS header_sections (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS card_history (id INTEGER PRIMARY KEY AUTOINCREMENT, card_id INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(card_id) REFERENCES cards(id))`);
    
    db.run(`CREATE TABLE IF NOT EXISTS books (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, filepath TEXT)`);
    
    db.run(`CREATE TABLE IF NOT EXISTS dice_options (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, text TEXT, role TEXT DEFAULT 'wife')`);
    
    db.run(`CREATE TABLE IF NOT EXISTS location_unlocks (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, unlocked_at DATETIME, count INTEGER DEFAULT 0)`);
    
    db.run(`CREATE TABLE IF NOT EXISTS fantasies (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, pulled_at DATETIME)`);

    // Galleries
    db.run(`CREATE TABLE IF NOT EXISTS toys (id INTEGER PRIMARY KEY AUTOINCREMENT, filepath TEXT, chosen_count INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS lingerie (id INTEGER PRIMARY KEY AUTOINCREMENT, filepath TEXT, chosen_count INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS condoms (id INTEGER PRIMARY KEY, filepath TEXT, chosen_count INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS lubes (id INTEGER PRIMARY KEY, filepath TEXT, chosen_count INTEGER DEFAULT 0)`);

    // Safe Migrations
    const runMigration = (sql) => { try { db.run(sql, () => {}); } catch (e) {} };
    runMigration(`ALTER TABLE dice_options ADD COLUMN role TEXT DEFAULT 'wife'`);
    runMigration(`ALTER TABLE location_unlocks ADD COLUMN count INTEGER DEFAULT 0`);
    runMigration(`ALTER TABLE sections ADD COLUMN header_id INTEGER`);
});

// --- Ntfy Helper ---
const sendNtfy = (itemId, type = 'card') => {
    db.all(`SELECT * FROM settings WHERE key IN ('ntfy_url', 'ntfy_topic')`, [], (err, rows) => {
        if (err || !rows) return;
        const settings = rows.reduce((acc, r) => ({...acc, [r.key]: r.value}), {});
        if (!settings.ntfy_url || !settings.ntfy_topic) return;

        let table = 'cards';
        let msg = "New Activity";
        let title = "Privy Update";
        
        if (type === 'toy') { table = 'toys'; title = "Toy Selected!"; }
        else if (type === 'lingerie') { table = 'lingerie'; title = "Wear This!"; }
        else if (type === 'condoms') { table = 'condoms'; title = "Safety First"; }
        else if (type === 'lubes') { table = 'lubes'; title = "Lube Selected"; }

        db.get(`SELECT filepath FROM ${table} WHERE id = ?`, [itemId], (err, item) => {
            if (!item) return;

            const cleanPath = item.filepath.replace('/uploads/', '');
            const absPath = path.join(DATA_DIR, 'uploads', cleanPath);

            if (fs.existsSync(absPath)) {
                try {
                    const stats = fs.statSync(absPath);
                    const fileBuffer = fs.readFileSync(absPath);
                    const filename = `${type}_${itemId}_${Date.now()}.jpg`;
                    const u = new URL(`${settings.ntfy_url.replace(/\/$/, '')}/${settings.ntfy_topic}`);
                    
                    u.searchParams.append('message', msg);
                    u.searchParams.append('title', title);
                    u.searchParams.append('filename', filename);
                    
                    if (typeof fetch === 'function') {
                        fetch(u.toString(), {
                            method: 'POST',
                            body: fileBuffer,
                            headers: { 'Content-Length': stats.size }
                        }).catch(err => console.error("Ntfy Error:", err.message));
                    }
                } catch (e) { console.error("Ntfy fail", e); }
            }
        });
    });
};

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, f, cb) => {
            let folder = 'cards';
            if (req.path.includes('book')) folder = 'books';
            else if (req.path.includes('toy')) folder = 'toys';
            else if (req.path.includes('lingerie')) folder = 'lingerie';
            else if (req.path.includes('condom')) folder = 'condoms';
            else if (req.path.includes('lube')) folder = 'lubes';
            const dir = path.join(DATA_DIR, 'uploads', folder);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, f, cb) => {
            cb(null, Date.now() + '-' + f.originalname.replace(/[^a-zA-Z0-9.]/g, '_'));
        }
    })
});
const auth = (req, res, next) => {
    let token = req.headers['authorization'];
    if (!token && req.query.token) token = 'Bearer ' + req.query.token;
    if (!token) return res.status(403).json({ error: 'No token' });
    try {
        const t = token.startsWith('Bearer ') ? token.split(' ')[1] : token;
        req.user = jwt.verify(t, SECRET_KEY);
        next();
    } catch (e) { res.status(401).json({ error: 'Unauthorized' }); }
};

// --- ROUTES ---

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
app.put('/api/user', auth, (req, res) => {
    let sql = `UPDATE users SET name=? WHERE id=?`, params = [req.body.name, req.user.id];
    if (req.body.password) { 
        sql = `UPDATE users SET name=?, password=? WHERE id=?`; 
        params = [req.body.name, bcrypt.hashSync(req.body.password, 8), req.user.id]; 
    }
    db.run(sql, params, (err) => res.json({ success: !err }));
});

// Settings
app.get('/api/settings', auth, (req, res) => {
    db.all(`SELECT * FROM settings`, [], (err, rows) => res.json(rows ? rows.reduce((acc, r) => ({...acc, [r.key]: r.value}), {}) : {}));
});
app.put('/api/settings', auth, (req, res) => {
    db.serialize(() => {
        const s = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
        if (req.body.ntfy_url) { s.run('ntfy_url', req.body.ntfy_url); s.run('ntfy_topic', req.body.ntfy_topic); }
        s.finalize();
        res.json({success:true});
    });
});
app.post('/api/settings/test', auth, (req, res) => { 
    if(!req.body.ntfy_url) return res.status(400).json({error:'No Config'}); 
    fetch(`${req.body.ntfy_url}/${req.body.ntfy_topic}`, {method:'POST', body:'Test'}).then(r=>res.json({success:r.ok})).catch(e=>res.status(500).json({error:e.message})); 
});

// Sections & Headers
app.get('/api/headers', auth, (req, res) => db.all(`SELECT * FROM header_sections`, [], (e,r)=>res.json(r||[])));
app.post('/api/headers', auth, (req, res) => db.run(`INSERT INTO header_sections (title) VALUES (?)`, [req.body.title], function(){res.json({id:this.lastID})}));
app.delete('/api/headers/:id', auth, (req, res) => {
    db.run(`UPDATE sections SET header_id=NULL WHERE header_id=?`, [req.params.id]);
    db.run(`DELETE FROM header_sections WHERE id=?`, [req.params.id], ()=>res.json({success:true}));
});
app.get('/api/sections', auth, (req, res) => db.all(`SELECT * FROM sections`, [], (e,r)=>res.json(r||[])));
app.post('/api/sections', auth, (req, res) => db.run(`INSERT INTO sections (title, header_id) VALUES (?,?)`, [req.body.title, req.body.header_id], function(){res.json({id:this.lastID})}));
app.put('/api/sections/:id', auth, (req, res) => db.run(`UPDATE sections SET title=?, header_id=? WHERE id=?`, [req.body.title, req.body.header_id, req.params.id], ()=>res.json({success:true})));
app.delete('/api/sections/:id', auth, (req, res) => {
    db.all(`SELECT filepath FROM cards WHERE section_id=?`, [req.params.id], (e,r)=>{
        if(r) r.forEach(x=>{ try{ fs.unlinkSync(path.join(DATA_DIR,'uploads',x.filepath.replace('/uploads/',''))); }catch(e){} });
        db.run(`DELETE FROM cards WHERE section_id=?`, [req.params.id]);
        db.run(`DELETE FROM sections WHERE id=?`, [req.params.id], ()=>res.json({success:true}));
    });
});

// Cards
app.get('/api/cards', auth, (req, res) => db.all(`SELECT * FROM cards`, [], (e,r)=>res.json(r||[])));
app.post('/api/cards', auth, upload.single('file'), (req, res) => {
    db.run(`INSERT INTO cards (filepath, section_id) VALUES (?,?)`, [`/uploads/cards/${req.file.filename}`, req.body.section_id||null], function(){res.json({id:this.lastID, filepath:`/uploads/cards/${req.file.filename}`})});
});
app.delete('/api/cards/:id', auth, (req, res) => {
    db.get(`SELECT filepath FROM cards WHERE id=?`,[req.params.id],(e,r)=>{
        if(r) try{ fs.unlinkSync(path.join(DATA_DIR,'uploads',r.filepath.replace('/uploads/',''))); }catch(e){}
        db.run(`DELETE FROM card_history WHERE card_id=?`,[req.params.id]);
        db.run(`DELETE FROM cards WHERE id=?`,[req.params.id], ()=>res.json({success:true}));
    });
});
app.post('/api/cards/:id/scratch', auth, (req, res) => {
    db.run(`INSERT INTO card_history (card_id) VALUES (?)`, [req.params.id]);
    db.run(`UPDATE cards SET scratched_count=scratched_count+1 WHERE id=?`, [req.params.id], ()=>{ sendNtfy(req.params.id, 'card'); res.json({success:true}); });
});
app.get('/api/cards/:id/history', auth, (req, res) => db.all(`SELECT timestamp FROM card_history WHERE card_id=? ORDER BY timestamp DESC`, [req.params.id], (e,r)=>res.json(r||[])));

// Books
app.get('/api/books', auth, (req, res) => db.all(`SELECT * FROM books`, [], (e,r)=>res.json(r||[])));
app.post('/api/books', auth, upload.single('file'), (req, res) => {
    db.run(`INSERT INTO books (title, filepath) VALUES (?,?)`, [req.file.originalname, `/uploads/books/${req.file.filename}`], function(){res.json({id:this.lastID})});
});
app.delete('/api/books/:id', auth, (req, res) => {
    db.get(`SELECT filepath FROM books WHERE id=?`,[req.params.id],(e,r)=>{
        if(r) try{ fs.unlinkSync(path.join(DATA_DIR,'uploads',r.filepath.replace('/uploads/',''))); }catch(e){}
        db.run(`DELETE FROM books WHERE id=?`,[req.params.id], ()=>res.json({success:true}));
    });
});
app.post('/api/books/:id/extract', auth, (req, res) => {
    req.setTimeout(600000);
    db.get(`SELECT * FROM books WHERE id=?`,[req.params.id], (e,b)=>{
        if(!b) return res.status(404).json({error:'Not found'});
        const bp = path.join(DATA_DIR,'uploads',b.filepath.replace('/uploads/',''));
        db.run(`INSERT INTO sections (title) VALUES (?)`, [`From: ${b.title}`], function(err){
            const sid = this.lastID;
            const tmp = path.join(DATA_DIR,'uploads',`tmp_${Date.now()}`);
            fs.mkdirSync(tmp);
            exec(`pdfimages -png "${bp}" "${tmp}/img"`, {timeout:300000}, (err)=>{
                if(err) { fs.rmSync(tmp,{recursive:true}); return res.status(500).json({error:'Failed'}); }
                fs.readdir(tmp, (e,files)=>{
                    const p = files.map(f => new Promise(res=>{
                        if(fs.statSync(path.join(tmp,f)).size < 50*1024) { fs.unlinkSync(path.join(tmp,f)); res(); return; }
                        const n = `${Date.now()}_${f}`;
                        fs.renameSync(path.join(tmp,f), path.join(DATA_DIR,'uploads','cards',n));
                        db.run(`INSERT INTO cards (filepath, section_id) VALUES (?,?)`, [`/uploads/cards/${n}`, sid], res);
                    }));
                    Promise.all(p).then(()=>{ fs.rmSync(tmp,{recursive:true}); res.json({success:true}); });
                });
            });
        });
    });
});

// Dice & Extras
app.get('/api/dice', auth, (req, res) => db.all(`SELECT * FROM dice_options`, [], (e,r)=>res.json(r||[])));
app.put('/api/dice', auth, (req, res) => {
    db.serialize(()=>{
        db.run(`DELETE FROM dice_options WHERE role=?`, [req.body.role||'wife']);
        const s=db.prepare(`INSERT INTO dice_options (type,text,role) VALUES (?,?,?)`);
        req.body.items.forEach(i=>s.run(i.type,i.text, req.body.role||'wife'));
        s.finalize(); res.json({success:true});
    });
});
app.get('/api/locations', auth, (req, res) => db.all(`SELECT * FROM location_unlocks`, [], (e,r)=>res.json(r||[])));
app.post('/api/locations', auth, (req,res) => db.run(`INSERT INTO location_unlocks (name) VALUES (?)`,[req.body.name], function(){res.json({id:this.lastID})}));
app.post('/api/locations/:id/toggle', auth, (req,res) => db.run(`UPDATE location_unlocks SET count=count+1, unlocked_at=? WHERE id=?`, [new Date().toISOString(), req.params.id], ()=>res.json({success:true})));
app.post('/api/locations/:id/reset', auth, (req,res) => db.run(`UPDATE location_unlocks SET count=0, unlocked_at=NULL WHERE id=?`, [req.params.id], ()=>res.json({success:true})));
app.delete('/api/locations/:id', auth, (req,res) => db.run(`DELETE FROM location_unlocks WHERE id=?`,[req.params.id], ()=>res.json({success:true})));

app.get('/api/fantasies', auth, (req,res) => db.all(`SELECT * FROM fantasies WHERE pulled_at IS NULL`,[],(e,r)=>res.json(r||[])));
app.get('/api/fantasies/history', auth, (req,res) => db.all(`SELECT * FROM fantasies WHERE pulled_at IS NOT NULL`,[],(e,r)=>res.json(r||[])));
app.post('/api/fantasies', auth, (req,res) => db.run(`INSERT INTO fantasies (text) VALUES (?)`, [req.body.text], ()=>res.json({success:true})));
app.post('/api/fantasies/pull', auth, (req,res) => db.get(`SELECT * FROM fantasies WHERE pulled_at IS NULL ORDER BY RANDOM() LIMIT 1`,[],(e,r)=>{
    if(r) db.run(`UPDATE fantasies SET pulled_at=CURRENT_TIMESTAMP WHERE id=?`,[r.id]);
    res.json(r||{empty:true});
}));
app.post('/api/fantasies/:id/return', auth, (req,res) => db.run(`UPDATE fantasies SET pulled_at=NULL WHERE id=?`,[req.params.id], ()=>res.json({success:true})));
app.delete('/api/fantasies/:id', auth, (req,res) => db.run(`DELETE FROM fantasies WHERE id=?`,[req.params.id], ()=>res.json({success:true})));

// Galleries
const handleGalleryGet = (table) => (req, res) => db.all(`SELECT * FROM ${table}`, [], (e,r) => res.json(r||[]));
const handleGalleryPost = (table, sub) => (req, res) => {
    if(!req.file) return res.status(400).json({error:'No file'});
    db.run(`INSERT INTO ${table} (filepath) VALUES (?)`, [`/uploads/${sub}/${req.file.filename}`], function(){res.json({id:this.lastID})});
};
const handleGalleryDelete = (table) => (req, res) => {
    db.get(`SELECT filepath FROM ${table} WHERE id=?`,[req.params.id],(e,r)=>{
        if(r) try { fs.unlinkSync(path.join(DATA_DIR,'uploads',r.filepath.replace('/uploads/',''))); } catch(e){}
        db.run(`DELETE FROM ${table} WHERE id=?`,[req.params.id], ()=>res.json({success:true}));
    });
};
const handleGalleryDraw = (table, type) => (req, res) => {
    db.run(`UPDATE ${table} SET chosen_count=chosen_count+1 WHERE id=?`, [req.params.id]);
    sendNtfy(req.params.id, type);
    res.json({success:true});
};

app.get('/api/toys', auth, handleGalleryGet('toys'));
app.post('/api/toys', auth, upload.single('file'), handleGalleryPost('toys', 'toys'));
app.delete('/api/toys/:id', auth, handleGalleryDelete('toys'));
app.post('/api/toys/:id/draw', auth, handleGalleryDraw('toys', 'toy'));

app.get('/api/lingerie', auth, handleGalleryGet('lingerie'));
app.post('/api/lingerie', auth, upload.single('file'), handleGalleryPost('lingerie', 'lingerie'));
app.delete('/api/lingerie/:id', auth, handleGalleryDelete('lingerie'));
app.post('/api/lingerie/:id/draw', auth, handleGalleryDraw('lingerie', 'lingerie'));

app.get('/api/condoms', auth, handleGalleryGet('condoms'));
app.post('/api/condoms', auth, upload.single('file'), handleGalleryPost('condoms', 'condoms'));
app.delete('/api/condoms/:id', auth, handleGalleryDelete('condoms'));
app.post('/api/condoms/:id/draw', auth, handleGalleryDraw('condoms', 'condoms'));

app.get('/api/lubes', auth, handleGalleryGet('lubes'));
app.post('/api/lubes', auth, upload.single('file'), handleGalleryPost('lubes', 'lubes'));
app.delete('/api/lubes/:id', auth, handleGalleryDelete('lubes'));
app.post('/api/lubes/:id/draw', auth, handleGalleryDraw('lubes', 'lubes'));

app.post('/api/reset-app', auth, (req, res) => {
    db.serialize(() => {
        ['card_history','cards','location_unlocks','toys','lingerie','condoms','lubes'].forEach(t => {
            const f = t==='card_history' ? 'DELETE FROM' : 'UPDATE';
            const s = t==='card_history' ? '' : t==='location_unlocks' ? 'SET count=0, unlocked_at=NULL' : 'SET scratched_count=0';
            const w = t==='toys' || t==='lingerie' || t==='condoms' || t==='lubes' ? 'SET chosen_count=0' : s;
            db.run(`${f} ${t} ${w}`);
        });
        res.json({success:true});
    });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../client/dist/index.html')));
app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));
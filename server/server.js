const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { exec } = require('child_process');

process.on('uncaughtException', (e) => console.error('CRITICAL:', e));
process.on('unhandledRejection', (r) => console.error('UNHANDLED:', r));

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'privy.db');
const SECRET_KEY = 'privy_secret';

app.use(express.json());
app.use(cors());
app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));
app.use(express.static(path.join(__dirname, '../client/dist')));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
    const run = (sql) => { try { db.run(sql); } catch (e) {} };
    run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT, name TEXT, age INTEGER, gender TEXT, avatar TEXT)`);
    run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
    run(`CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY, filepath TEXT, scratched_count INTEGER DEFAULT 0, section_id INTEGER)`);
    run(`CREATE TABLE IF NOT EXISTS sections (id INTEGER PRIMARY KEY, title TEXT, header_id INTEGER)`);
    run(`CREATE TABLE IF NOT EXISTS header_sections (id INTEGER PRIMARY KEY, title TEXT)`);
    run(`CREATE TABLE IF NOT EXISTS card_history (id INTEGER PRIMARY KEY, card_id INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(card_id) REFERENCES cards(id))`);
    run(`CREATE TABLE IF NOT EXISTS books (id INTEGER PRIMARY KEY, title TEXT, filepath TEXT)`);
    run(`CREATE TABLE IF NOT EXISTS dice_options (id INTEGER PRIMARY KEY, type TEXT, text TEXT, role TEXT DEFAULT 'wife')`);
    run(`CREATE TABLE IF NOT EXISTS location_unlocks (id INTEGER PRIMARY KEY, name TEXT UNIQUE, unlocked_at DATETIME, count INTEGER DEFAULT 0)`);
    run(`CREATE TABLE IF NOT EXISTS fantasies (id INTEGER PRIMARY KEY, text TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, pulled_at DATETIME)`);
    run(`CREATE TABLE IF NOT EXISTS toys (id INTEGER PRIMARY KEY, filepath TEXT, chosen_count INTEGER DEFAULT 0)`);
    run(`CREATE TABLE IF NOT EXISTS lingerie (id INTEGER PRIMARY KEY, filepath TEXT, chosen_count INTEGER DEFAULT 0)`);
    run(`CREATE TABLE IF NOT EXISTS condoms (id INTEGER PRIMARY KEY, filepath TEXT, chosen_count INTEGER DEFAULT 0)`);
    run(`CREATE TABLE IF NOT EXISTS lubes (id INTEGER PRIMARY KEY, filepath TEXT, chosen_count INTEGER DEFAULT 0)`);
    
    // Migrations
    run(`ALTER TABLE dice_options ADD COLUMN role TEXT DEFAULT 'wife'`);
    run(`ALTER TABLE location_unlocks ADD COLUMN count INTEGER DEFAULT 0`);
    run(`ALTER TABLE sections ADD COLUMN header_id INTEGER`);

    // Seeds
    db.get("SELECT count(*) as count FROM dice_options", (e, r) => {
        if (r && r.count === 0) {
            const d = [['act','Kiss','wife'],['act','Lick','wife'],['location','Neck','wife'],['act','Kiss','husband'],['location','Neck','husband']];
            const s = db.prepare("INSERT INTO dice_options (type, text, role) VALUES (?, ?, ?)");
            d.forEach(v => s.run(v)); s.finalize();
        }
    });
});

const sendNtfy = (id, type='card') => {
    db.all(`SELECT * FROM settings`, [], (e, r) => {
        if(!r) return;
        const s = r.reduce((a,x)=>({...a, [x.key]:x.value}),{});
        if(!s.ntfy_url) return;
        let tbl='cards';
        if(type==='toy') tbl='toys'; else if(type==='lingerie') tbl='lingerie';
        else if(type==='condoms') tbl='condoms'; else if(type==='lubes') tbl='lubes';
        
        db.get(`SELECT filepath FROM ${tbl} WHERE id=?`, [id], (e, row)=>{
            if(!row) return;
            const p = path.join(DATA_DIR, 'uploads', row.filepath.replace('/uploads/',''));
            if(fs.existsSync(p)) {
                try {
                    const u = new URL(`${s.ntfy_url.replace(/\/$/,'')}/${s.ntfy_topic}`);
                    u.searchParams.append('filename', `${type}_${id}.jpg`);
                    u.searchParams.append('message', `New ${type} selected!`);
                    fetch(u.toString(), { method:'POST', body:fs.readFileSync(p) }).catch(()=>{});
                } catch(e){}
            }
        });
    });
};

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, f, cb) => {
            let sub = 'cards';
            if(req.path.includes('book')) sub='books';
            else if(req.path.includes('toy')) sub='toys';
            else if(req.path.includes('lingerie')) sub='lingerie';
            else if(req.path.includes('condom')) sub='condoms';
            else if(req.path.includes('lube')) sub='lubes';
            const d = path.join(DATA_DIR, 'uploads', sub);
            if(!fs.existsSync(d)) fs.mkdirSync(d, {recursive:true});
            cb(null, d);
        },
        filename: (req, f, cb) => cb(null, Date.now()+'-'+f.originalname.replace(/[^a-zA-Z0-9.]/g,'_'))
    })
});

const auth = (req, res, next) => {
    let t = req.headers['authorization'];
    if(!t && req.query.token) t = 'Bearer '+req.query.token;
    if(!t) return res.status(403).json({error:'No token'});
    try { req.user = jwt.verify(t.split(' ')[1], SECRET_KEY); next(); } catch(e){ res.status(401).json({error:'Auth failed'}); }
};

// Routes
app.post('/api/login', (req, res) => {
    db.get(`SELECT * FROM users WHERE username=?`, [req.body.username], (e, u) => {
        if(!u || !bcrypt.compareSync(req.body.password, u.password)) return res.status(400).json({error:'Invalid'});
        res.json({token:jwt.sign({id:u.id}, SECRET_KEY), user:u});
    });
});
app.post('/api/register', (req, res) => {
    db.run(`INSERT INTO users (username,password) VALUES (?,?)`, [req.body.username, bcrypt.hashSync(req.body.password,8)], function(e){
        if(e) return res.status(400).json({error:'Taken'}); res.json({success:true, id:this.lastID});
    });
});
app.put('/api/user', auth, (req, res) => {
    let q=`UPDATE users SET name=? WHERE id=?`, p=[req.body.name, req.user.id];
    if(req.body.password) { q=`UPDATE users SET name=?, password=? WHERE id=?`; p=[req.body.name, bcrypt.hashSync(req.body.password,8), req.user.id]; }
    db.run(q, p, (e)=>res.json({success:!e}));
});

app.get('/api/settings', auth, (req, res) => db.all(`SELECT * FROM settings`, [], (e,r)=>res.json(r?r.reduce((a,x)=>({...a,[x.key]:x.value}),{}):{})));
app.put('/api/settings', auth, (req, res) => {
    db.serialize(()=>{
        const s = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)`);
        s.run('ntfy_url', req.body.ntfy_url); s.run('ntfy_topic', req.body.ntfy_topic); s.finalize();
        res.json({success:true});
    });
});
app.post('/api/settings/test', auth, (req, res) => { 
    if(!req.body.ntfy_url) return res.status(400).json({error:'No Config'}); 
    fetch(`${req.body.ntfy_url}/${req.body.ntfy_topic}`, {method:'POST', body:'Test'}).then(r=>res.json({success:r.ok})).catch(e=>res.status(500).json({error:e.message})); 
});

const getTable = (t) => (req, res) => db.all(`SELECT * FROM ${t}`, [], (e,r)=>res.json(r||[]));
const delItem = (t) => (req, res) => {
    db.get(`SELECT filepath FROM ${t} WHERE id=?`,[req.params.id],(e,r)=>{
        if(r) try { fs.unlinkSync(path.join(DATA_DIR, 'uploads', r.filepath.replace('/uploads/',''))); } catch(e){}
        db.run(`DELETE FROM ${t} WHERE id=?`,[req.params.id], ()=>res.json({success:true}));
    });
};
const postFile = (t) => (req, res) => {
    if(!req.file) return res.status(400).json({error:'No file'});
    db.run(`INSERT INTO ${t} (filepath) VALUES (?)`, [`/uploads/${req.file.destination.split('/').pop()}/${req.file.filename}`], function(){res.json({id:this.lastID})});
};

app.get('/api/headers', auth, getTable('header_sections'));
app.post('/api/headers', auth, (req, res) => db.run(`INSERT INTO header_sections (title) VALUES (?)`, [req.body.title], function(){res.json({id:this.lastID})}));
app.delete('/api/headers/:id', auth, (req, res) => {
    db.run(`UPDATE sections SET header_id=NULL WHERE header_id=?`, [req.params.id]);
    db.run(`DELETE FROM header_sections WHERE id=?`, [req.params.id], ()=>res.json({success:true}));
});
app.get('/api/sections', auth, getTable('sections'));
app.post('/api/sections', auth, (req, res) => db.run(`INSERT INTO sections (title, header_id) VALUES (?,?)`, [req.body.title, req.body.header_id], function(){res.json({id:this.lastID})}));
app.put('/api/sections/:id', auth, (req, res) => db.run(`UPDATE sections SET title=?, header_id=? WHERE id=?`, [req.body.title, req.body.header_id, req.params.id], ()=>res.json({success:true})));
app.delete('/api/sections/:id', auth, (req, res) => {
    db.all(`SELECT filepath FROM cards WHERE section_id=?`, [req.params.id], (e,r)=>{
        if(r) r.forEach(x=>{ try{ fs.unlinkSync(path.join(DATA_DIR,'uploads',x.filepath.replace('/uploads/',''))); }catch(e){} });
        db.run(`DELETE FROM cards WHERE section_id=?`, [req.params.id]);
        db.run(`DELETE FROM sections WHERE id=?`, [req.params.id], ()=>res.json({success:true}));
    });
});

app.get('/api/cards', auth, getTable('cards'));
app.post('/api/cards', auth, upload.single('file'), (req, res) => {
    if(!req.file) return res.status(400).json({error:'No file'});
    db.run(`INSERT INTO cards (filepath, section_id) VALUES (?,?)`, [`/uploads/cards/${req.file.filename}`, req.body.section_id||null], function(){res.json({id:this.lastID})});
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
    db.run(`UPDATE cards SET scratched_count=scratched_count+1 WHERE id=?`, [req.params.id], ()=>{ sendNtfy(req.params.id); res.json({success:true}); });
});
app.get('/api/cards/:id/history', auth, (req, res) => db.all(`SELECT timestamp FROM card_history WHERE card_id=? ORDER BY timestamp DESC`, [req.params.id], (e,r)=>res.json(r||[])));

app.get('/api/books', auth, getTable('books'));
app.post('/api/books', auth, upload.single('file'), (req, res) => {
    if(!req.file) return res.status(400).json({error:'No file'});
    db.run(`INSERT INTO books (title, filepath) VALUES (?,?)`, [req.file.originalname, `/uploads/books/${req.file.filename}`], function(){res.json({id:this.lastID})});
});
app.delete('/api/books/:id', auth, delItem('books'));
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

app.get('/api/dice', auth, getTable('dice_options'));
app.put('/api/dice', auth, (req, res) => {
    const { items, role } = req.body;
    db.serialize(()=>{
        db.run(`DELETE FROM dice_options WHERE role=?`, [role||'wife']);
        const s=db.prepare(`INSERT INTO dice_options (type,text,role) VALUES (?,?,?)`);
        items.forEach(i=>s.run(i.type,i.text, role||'wife'));
        s.finalize(); res.json({success:true});
    });
});

app.get('/api/locations', auth, getTable('location_unlocks'));
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

const gal = (t, sub) => {
    app.get(`/api/${t}`, auth, getTable(t));
    app.post(`/api/${t}`, auth, upload.single('file'), postFile(t));
    app.delete(`/api/${t}/:id`, auth, delItem(t));
    app.post(`/api/${t}/:id/draw`, auth, (req, res) => {
        db.run(`UPDATE ${t} SET chosen_count=chosen_count+1 WHERE id=?`, [req.params.id]);
        sendNtfy(req.params.id, sub);
        res.json({success:true});
    });
};
gal('toys', 'toy');
gal('lingerie', 'lingerie');
gal('condoms', 'condoms');
gal('lubes', 'lubes');

app.get('/api/export', auth, (req, res) => {
    const ts = Date.now();
    const root = path.join('/tmp', `export_${ts}`);
    fs.mkdirSync(path.join(root, 'data'), {recursive:true});
    const cp = (src, dest) => {
        const s = path.join(DATA_DIR,'uploads',src.replace(/^\/uploads\//,''));
        const d = path.join(root,'data',dest);
        if(!fs.existsSync(path.dirname(d))) fs.mkdirSync(path.dirname(d), {recursive:true});
        if(fs.existsSync(s)) fs.copyFileSync(s, d);
    };

    db.serialize(() => {
        db.all(`SELECT c.filepath, s.title as sec, h.title as head FROM cards c LEFT JOIN sections s ON c.section_id=s.id LEFT JOIN header_sections h ON s.header_id=h.id`, [], (e,r)=>{
            if(r) r.forEach(x => {
                const f = x.head ? `${x.head}/${x.sec}` : (x.sec || 'Unsorted');
                cp(x.filepath, `Cards/${f}/${path.basename(x.filepath)}`);
            });
        });
        ['books','toys','lingerie','condoms','lubes'].forEach(t => db.all(`SELECT filepath FROM ${t}`, [], (e,r)=>{ if(r) r.forEach(x=>cp(x.filepath, `${t}/${path.basename(x.filepath)}`)); }));
        
        setTimeout(() => {
            exec(`cd /tmp && zip -r export_${ts}.zip export_${ts}`, (err) => {
                if(err) return res.status(500).json({error:'Zip failed'});
                res.download(`/tmp/export_${ts}.zip`, 'backup.zip', ()=>{
                    fs.rmSync(root, {recursive:true}); fs.unlinkSync(`/tmp/export_${ts}.zip`);
                });
            });
        }, 3000);
    });
});

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
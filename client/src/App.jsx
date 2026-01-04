import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, User, LogOut, Upload, Book, Layers, Shuffle, Heart, Maximize2, Clock, Calendar, Trash2, Edit2, Plus, Folder, RefreshCw, Bell, Send, Aperture, RotateCcw, AlertTriangle, Scissors, Dices, MapPin, Sparkles, Timer, Play, Pause, CheckCircle, RotateCw, Square, Zap, Shirt, Shield, Download, Grid } from 'lucide-react';

const API_URL = '/api';

const safeFetch = async (url, options = {}) => {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) return await res.json();
    return null;
  } catch (e) { console.error(e); return null; }
};

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, info) { console.error("Crash:", error, info); }
  handleReset() { localStorage.clear(); window.location.reload(); }
  render() {
    if (this.state.hasError) return <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white"><h1 className="text-2xl mb-4">Something went wrong</h1><button onClick={this.handleReset} className="bg-red-600 px-4 py-2 rounded">Reload</button></div>;
    return this.props.children;
  }
}

const useLongPress = (callback = () => {}, ms = 800) => {
  const [start, setStart] = useState(false);
  useEffect(() => { let t; if (start) t = setTimeout(callback, ms); else clearTimeout(t); return () => clearTimeout(t); }, [start]);
  return { onMouseDown: () => setStart(true), onMouseUp: () => setStart(false), onMouseLeave: () => setStart(false), onTouchStart: () => setStart(true), onTouchEnd: () => setStart(false) };
};

let audioCtx = null;
const initAudio = () => {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
};
const playSound = (type) => {
    try {
        const ctx = initAudio();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        const now = ctx.currentTime;
        if (type === 'ting') {
            osc.frequency.setValueAtTime(800, now); osc.frequency.exponentialRampToValueAtTime(400, now + 0.5);
            gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
            osc.start(now); osc.stop(now + 0.5);
        } else {
            [0, 0.2, 0.4].forEach(t => {
                const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination);
                o.type = 'square'; o.frequency.setValueAtTime(600, now + t);
                g.gain.setValueAtTime(0.2, now + t); g.gain.linearRampToValueAtTime(0, now + t + 0.1);
                o.start(now + t); o.stop(now + t + 0.1);
            });
        }
    } catch(e) {}
};

// --- Shared Components ---
const RevealCard = ({ image, id, onRevealComplete }) => {
  const [revealed, setRevealed] = useState(false);
  const tap = useRef(0);
  const timer = useRef(null);
  const handleInteraction = () => {
    if (timer.current) clearTimeout(timer.current);
    tap.current += 1;
    if (tap.current === 3) { if (!revealed) { setRevealed(true); onRevealComplete(id); } tap.current = 0; } 
    else { timer.current = setTimeout(() => { tap.current = 0; }, 400); }
  };
  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black" onClick={handleInteraction}>
      <img src={image} className="max-w-full max-h-full object-contain" />
      {!revealed && <div className="absolute inset-0 bg-black/90 flex items-center justify-center"><div className="border-2 border-gold p-4 rounded-xl animate-pulse"><span className="text-gold text-2xl font-bold">Triple Tap</span></div></div>}
    </div>
  );
};

const HistoryList = ({ cardId, onClose }) => {
  const [history, setHistory] = useState([]);
  useEffect(() => { safeFetch(`${API_URL}/cards/${cardId}/history`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(d => { if(Array.isArray(d)) setHistory(d); }); }, [cardId]);
  return (
    <div className="w-full h-full bg-gray-900 p-4 overflow-y-auto">
       <div className="flex justify-between items-center mb-4"><h3 className="text-gold text-xl">History</h3><button onClick={onClose}><X className="text-white"/></button></div>
       {history.map((h, i) => (<div key={i} className="bg-white/5 p-3 rounded mb-2 text-white text-sm flex justify-between"><span>{new Date(h.timestamp).toLocaleDateString()}</span><span>{new Date(h.timestamp).toLocaleTimeString()}</span></div>))}
    </div>
  );
};

const PDFViewer = ({ url, title, bookId, onClose }) => {
  const [extracting, setExtracting] = useState(false);
  const handleExtract = async () => {
    if (!confirm("Extract images?")) return;
    setExtracting(true);
    const res = await safeFetch(`${API_URL}/books/${bookId}/extract`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
    setExtracting(false);
    if(res && res.success) alert("Done!"); else alert("Failed");
  };
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex justify-between p-4 bg-gray-900">
          <span className="text-gold truncate w-2/3">{title}</span>
          <div className="flex gap-4"><button onClick={handleExtract} disabled={extracting} className="text-white"><RefreshCw className={extracting?"animate-spin":""}/></button><button onClick={onClose} className="text-white"><X/></button></div>
      </div>
      <div className="flex-1 flex items-center justify-center"><object data={url} type="application/pdf" className="w-full h-full"><a href={url} className="text-white">Download PDF</a></object></div>
    </div>
  );
};

const CardItem = ({ card, onDelete, onClick }) => {
    const lp = useLongPress(() => onDelete(card.id));
    const lastTap = useRef(0);
    const handleTap = () => { const now = Date.now(); if (now - lastTap.current < 300) onClick(card); lastTap.current = now; };
    return <div {...lp} onClick={handleTap} className="aspect-[3/4] bg-gray-800 rounded border border-gold/30 flex items-center justify-center overflow-hidden"><Maximize2 className="text-gold"/></div>;
};

const SectionTab = ({ section, activeSection, setActiveSection, onLongPress }) => {
    const lp = useLongPress(() => onLongPress && onLongPress(section));
    return ( <button {...lp} onClick={() => setActiveSection(activeSection===section.id?null:section.id)} className={`px-4 py-2 rounded-full border whitespace-nowrap ${activeSection===section.id ? 'bg-burgundy text-white border-gold' : 'text-gray-400 border-gray-600'}`}>{section.title}</button> );
};

const HeaderTab = ({ header, activeHeader, setActiveHeader, onLongPress }) => {
    const lp = useLongPress(() => onLongPress && onLongPress(header));
    return ( <button {...lp} onClick={() => setActiveHeader(activeHeader===header.id?null:header.id)} className={`px-4 py-2 rounded-full border whitespace-nowrap ${activeHeader===header.id ? 'bg-eggplant text-white border-gold' : 'text-gray-400 border-gray-600'}`}>{header.title}</button> );
};

const GalleryItem = ({ item, onDeleteRequest }) => {
    const lp = useLongPress(() => onDeleteRequest(item.id));
    return (<div {...lp} className="relative aspect-square bg-gray-900 rounded overflow-hidden border border-gold/30"><img src={item.filepath} className="w-full h-full object-cover" /></div>);
};

const LocationItem = ({ loc, onToggle, onDeleteRequest }) => {
    const lp = useLongPress(() => onDeleteRequest(loc));
    return (
        <div {...lp} onClick={() => onToggle(loc.id)} className={`p-4 rounded-xl border flex items-center justify-between transition ${loc.count > 0 ? 'bg-burgundy/20 border-gold' : 'bg-gray-900 border-gray-700'}`}>
            <div className="flex items-center gap-4"><span className={`text-2xl font-bold ${loc.count > 0 ? 'text-gold' : 'text-gray-400'}`}>{loc.name}</span>{loc.count > 0 && <span className="bg-gold text-black text-xs font-bold px-2 py-0.5 rounded-full">{loc.count}x</span>}</div>
            {loc.count > 0 ? <CheckCircle className="text-green-500"/> : <div className="w-6 h-6 rounded-full border-2 border-gray-600"></div>}
        </div>
    );
};

const HistoryItem = ({ item, onReturn, onDeleteRequest }) => {
    const lp = useLongPress(() => onDeleteRequest(item));
    return (
        <div {...lp} className="bg-gray-900 p-4 rounded-lg border border-gray-800 flex justify-between items-center">
            <div><p className="text-gold font-bold text-xl">{item.text}</p></div>
            <button onClick={() => onReturn(item.id)} className="text-xs bg-gray-800 px-2 py-1 rounded text-white flex gap-1"><RotateCw size={12}/> Return</button>
        </div>
    );
};

const BookItem = ({ book, onClick, onLongPress }) => {
    const lp = useLongPress(() => onLongPress(book));
    return ( <div {...lp} onClick={() => onClick(book)} className="bg-gray-900 border border-gold/20 p-6 rounded-lg hover:bg-gray-800 transition flex flex-col items-center justify-center gap-4 cursor-pointer text-center"><Book size={32} className="text-burgundy"/><h3 className="text-white truncate w-full">{book.title}</h3></div> );
};

// --- Pages ---

const Auth = ({ setUser }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ username: '', password: '', name: '', age: '', gender: '' });
  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await safeFetch(`${API_URL}/${isLogin ? 'login' : 'register'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res && res.token) { localStorage.setItem('token', res.token); localStorage.setItem('user', JSON.stringify(res.user)); setUser(res.user); } 
    else if (res && res.success) setIsLogin(true); 
    else alert("Error");
  };
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-eggplant via-burgundy to-black text-gold p-6 font-caveat">
      <h1 className="text-6xl mb-8 drop-shadow-lg">{isLogin ? 'Privy Login' : 'Join Privy'}</h1>
      <form onSubmit={handleSubmit} className="bg-black/50 p-8 rounded-2xl border border-gold/30 backdrop-blur-md w-full max-w-sm space-y-4">
        <input className="w-full p-3 bg-gray-900 border border-burgundy rounded text-white" placeholder="Username" onChange={e => setForm({...form, username: e.target.value})} />
        <input className="w-full p-3 bg-gray-900 border border-burgundy rounded text-white" type="password" placeholder="Password" onChange={e => setForm({...form, password: e.target.value})} />
        {!isLogin && <><input className="w-full p-3 bg-gray-900 border border-burgundy rounded text-white" placeholder="Name" onChange={e => setForm({...form, name: e.target.value})} /><div className="flex gap-2"><input className="w-1/2 p-3 bg-gray-900 border border-burgundy rounded text-white" type="number" placeholder="Age" onChange={e => setForm({...form, age: e.target.value})} /><select className="w-1/2 p-3 bg-gray-900 border border-burgundy rounded text-white" onChange={e => setForm({...form, gender: e.target.value})}><option value="">Gender</option><option value="Male">Male</option><option value="Female">Female</option></select></div></>}
        <button className="w-full bg-lipstick hover:bg-red-700 text-white font-bold py-3 rounded shadow-lg">{isLogin ? 'Enter' : 'Sign Up'}</button>
      </form>
      <button onClick={() => setIsLogin(!isLogin)} className="mt-4 text-sm underline hover:text-white">{isLogin ? "Create Account" : "Login"}</button>
    </div>
  );
};

const Gallery = ({ title, endpoint, icon }) => {
    const [items, setItems] = useState([]);
    const [winner, setWinner] = useState(null);
    const [drawing, setDrawing] = useState(false);
    const [editing, setEditing] = useState(false);
    const [delId, setDelId] = useState(null);

    const load = useCallback(() => { safeFetch(`${API_URL}/${endpoint}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(d => { if(Array.isArray(d)) setItems(d); }); }, [endpoint]);
    useEffect(() => { load(); }, [load]);

    const upload = async (e) => {
        const files = Array.from(e.target.files);
        for(const f of files) { const fd = new FormData(); fd.append('file', f); await safeFetch(`${API_URL}/${endpoint}`, { method:'POST', headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}, body:fd }); }
        load();
    };

    const draw = () => {
        if(items.length===0) return;
        setDrawing(true); setWinner(null);
        let c = 0;
        const i = setInterval(() => {
            setWinner(items[Math.floor(Math.random()*items.length)]);
            c++;
            if(c>20) { clearInterval(i); setDrawing(false); const w = items[Math.floor(Math.random()*items.length)]; setWinner(w); safeFetch(`${API_URL}/${endpoint}/${w.id}/draw`, { method:'POST', headers:{Authorization:`Bearer ${localStorage.getItem('token')}`} }); }
        }, 100);
    };
    
    const del = async () => { await safeFetch(`${API_URL}/${endpoint}/${delId}`, { method:'DELETE', headers:{Authorization:`Bearer ${localStorage.getItem('token')}`} }); setDelId(null); load(); };

    return (
        <div className="p-4 pb-24 min-h-screen flex flex-col items-center w-full">
            <h2 className="text-gold text-2xl mb-6 flex items-center gap-2 w-full">{icon} {title}</h2>
            {winner ? (
                <div className="relative w-full max-w-sm aspect-square border-4 border-gold rounded-xl overflow-hidden mb-6">
                    <img src={winner.filepath} className="w-full h-full object-cover"/>
                    {!drawing && <button onClick={()=>setWinner(null)} className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full"><X/></button>}
                </div>
            ) : (
                <button onClick={draw} disabled={drawing || items.length===0} className="w-full max-w-sm aspect-video bg-gray-800 border-2 border-dashed border-gray-600 rounded-xl flex flex-col items-center justify-center text-gray-400 mb-6 transition active:scale-95">
                    {drawing ? <RefreshCw className="animate-spin"/> : <Shuffle size={40}/>}
                    <span className="mt-2 font-bold">{items.length>0 ? "TAP TO DRAW" : "Empty Collection"}</span>
                </button>
            )}
            <div className="w-full flex justify-end mb-4"><button onClick={()=>setEditing(!editing)} className="border border-gold text-gold px-4 py-1 rounded-full text-sm">{editing?'Done':'Manage'}</button></div>
            {editing && <div className="w-full grid grid-cols-3 gap-2 animate-fadeIn">
                <label className="aspect-square bg-gray-800 border-2 border-dashed border-gray-600 rounded flex flex-col items-center justify-center cursor-pointer"><Plus className="text-gray-400"/><span className="text-xs text-gray-500 mt-1">Add</span><input type="file" className="hidden" multiple accept="image/*" onChange={upload} /></label>
                {items.map(i => <GalleryItem key={i.id} item={i} onDeleteRequest={setDelId} />)}
            </div>}
            {delId && <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"><div className="bg-gray-800 p-6 rounded text-center"><p className="text-white mb-4">Delete Item?</p><button onClick={del} className="bg-red-600 text-white px-4 py-2 rounded">Delete</button><button onClick={()=>setDelId(null)} className="ml-4 text-gray-400">Cancel</button></div></div>}
        </div>
    );
};

const Protection = () => {
    const [tab, setTab] = useState('condoms');
    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex justify-center gap-4 p-4">
                <button onClick={()=>setTab('condoms')} className={`px-4 py-1 rounded-full border ${tab==='condoms'?'bg-gold text-black':'text-gray-400 border-gray-600'}`}>Condoms</button>
                <button onClick={()=>setTab('lubes')} className={`px-4 py-1 rounded-full border ${tab==='lubes'?'bg-gold text-black':'text-gray-400 border-gray-600'}`}>Lubes</button>
            </div>
            {tab === 'condoms' ? <Gallery title="Condoms" endpoint="condoms" icon={<Shield size={24}/>}/> : <Gallery title="Lubes" endpoint="lubes" icon={<Folder size={24}/>}/>}
        </div>
    );
};

const Spin = () => {
    const [data, setData] = useState({cards:[], sections:[], headers:[]});
    const [activeHeader, setActiveHeader] = useState(null);
    const [activeSection, setActiveSection] = useState(null);
    const [spinState, setSpinState] = useState({ spinning:false, winner:null, rotation:0 });
    const [history, setHistory] = useState(false);

    useEffect(() => {
        const load = async () => {
            const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
            const [c, s, hd] = await Promise.all([safeFetch(`${API_URL}/cards`,{headers:h}), safeFetch(`${API_URL}/sections`,{headers:h}), safeFetch(`${API_URL}/headers`,{headers:h})]);
            setData({ cards: Array.isArray(c)?c:[], sections: Array.isArray(s)?s:[], headers: Array.isArray(hd)?hd:[] });
        };
        load();
    }, []);

    const sections = activeHeader ? data.sections.filter(s => s.header_id === activeHeader) : data.sections;
    const cards = data.cards.filter(c => activeSection ? c.section_id === activeSection : true);

    const spin = () => {
        if(cards.length===0) return alert("No cards!");
        setSpinState(p => ({...p, spinning:true, winner:null}));
        const winIdx = Math.floor(Math.random() * cards.length);
        const winner = cards[winIdx];
        const rot = p => p + 1800 + Math.random()*360;
        setSpinState(p => ({...p, rotation: rot(p.rotation)}));
        setTimeout(() => {
            setSpinState(p => ({...p, spinning:false, winner}));
            safeFetch(`${API_URL}/cards/${winner.id}/scratch`, { method:'POST', headers:{Authorization:`Bearer ${localStorage.getItem('token')}`} });
        }, 4000);
    };

    return (
        <div className="flex flex-col items-center w-full min-h-full py-4 overflow-hidden">
            <div className="w-full overflow-x-auto whitespace-nowrap px-4 mb-2 no-scrollbar">
                <button onClick={()=>setActiveHeader(null)} className={`mr-2 px-3 py-1 rounded-full border text-xs ${activeHeader===null?'bg-gold text-black':'text-gray-400 border-gray-600'}`}>All</button>
                {data.headers.map(h => <button key={h.id} onClick={()=>setActiveHeader(h.id)} className={`mr-2 px-3 py-1 rounded-full border text-xs ${activeHeader===h.id?'bg-gold text-black':'text-gray-400 border-gray-600'}`}>{h.title}</button>)}
            </div>
            <div className="w-full overflow-x-auto whitespace-nowrap px-4 mb-4 no-scrollbar">
                {sections.map(s => <button key={s.id} onClick={()=>setActiveSection(activeSection===s.id?null:s.id)} className={`mr-2 px-3 py-1 rounded-full border text-xs ${activeSection===s.id?'bg-red-600 text-white':'text-gray-400 border-gray-600'}`}>{s.title}</button>)}
            </div>
            <div className="relative w-72 h-72 rounded-full border-4 border-gold overflow-hidden flex items-center justify-center transition-transform duration-[4000ms] ease-out" style={{transform: `rotate(${spinState.rotation}deg)`, background: 'conic-gradient(#800020 0deg 22.5deg, #111 22.5deg 45deg)'}}>
               {/* Wheel segments visual simplified */}
               <div className="text-white font-bold">SPIN</div>
            </div>
            <button onClick={spin} disabled={spinState.spinning} className="mt-8 px-8 py-3 bg-gold text-black font-bold rounded-full shadow-lg active:scale-95 transition">SPIN</button>
            {spinState.winner && <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
                <div className="relative w-full max-w-sm h-[60vh]"><img src={spinState.winner.filepath} className="w-full h-full object-contain"/><button onClick={()=>setSpinState(p=>({...p, winner:null}))} className="absolute top-0 right-0 p-2 bg-black text-white"><X/></button></div>
                <div className="mt-4 flex gap-4"><button onClick={()=>setHistory(true)} className="text-gold flex gap-2 items-center"><Clock/> History</button></div>
                {history && <div className="absolute inset-0 bg-gray-900"><HistoryList cardId={spinState.winner.id} onClose={()=>setHistory(false)}/></div>}
            </div>}
        </div>
    );
};

const DiceGame = () => {
    const [data, setData] = useState([]);
    const [result, setResult] = useState({ act:'?', loc:'?', time:'?' });
    const [rolling, setRolling] = useState(false);
    const [timeLeft, setTimeLeft] = useState(0);
    const [activeRole, setActiveRole] = useState('wife');
    const [edit, setEdit] = useState(false);

    useEffect(() => { safeFetch(`${API_URL}/dice`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(d => { if(Array.isArray(d)) setData(d); }); }, []);

    const roll = () => {
        setRolling(true); setTimeLeft(0);
        const acts = data.filter(d => d.type==='act' && (d.role===activeRole || !d.role));
        const locs = data.filter(d => d.type==='location' && (d.role===activeRole || !d.role));
        let c = 0;
        const i = setInterval(() => {
            setResult({
                act: acts.length ? acts[Math.floor(Math.random()*acts.length)].text : '?',
                loc: locs.length ? locs[Math.floor(Math.random()*locs.length)].text : '?',
                time: [10,15,30,45,60,'∞'][Math.floor(Math.random()*6)]
            });
            c++;
            if(c>20) { clearInterval(i); setRolling(false); }
        }, 100);
    };

    const timer = () => {
        if(result.time === '?' || result.time === '∞') return;
        initAudio(); playSound('ting');
        setTimeLeft(parseInt(result.time));
    };

    useEffect(() => {
        let i;
        if(timeLeft > 0) i = setInterval(() => setTimeLeft(t => t - 1), 1000);
        else if (timeLeft === 0 && !rolling) playSound('end');
        return () => clearInterval(i);
    }, [timeLeft]);

    if(edit) return <div className="p-4 text-white"><button onClick={()=>setEdit(false)}>Back</button><h1>Edit Dice ({activeRole})</h1><p>Use Desktop to edit for now.</p></div>;

    return (
        <div className="flex flex-col items-center pt-10 gap-6 w-full">
            <div className="flex bg-gray-800 rounded-full p-1"><button onClick={()=>setActiveRole('wife')} className={`px-6 py-2 rounded-full ${activeRole==='wife'?'bg-red-600 text-white':'text-gray-400'}`}>Wife</button><button onClick={()=>setActiveRole('husband')} className={`px-6 py-2 rounded-full ${activeRole==='husband'?'bg-blue-600 text-white':'text-gray-400'}`}>Husband</button></div>
            <div className="flex gap-4 text-center">
                <div className="w-24 h-24 bg-red-900 border-2 border-gold flex items-center justify-center rounded-lg text-white font-bold">{result.act}</div>
                <div className="w-24 h-24 bg-blue-900 border-2 border-gold flex items-center justify-center rounded-lg text-white font-bold">{result.loc}</div>
                <div className="w-24 h-24 bg-gray-800 border-2 border-gold flex items-center justify-center rounded-lg text-white font-bold text-3xl">{result.time}</div>
            </div>
            {timeLeft > 0 && <div className="text-7xl font-mono text-red-500 font-bold">{timeLeft}</div>}
            <div className="flex gap-4">
                {!rolling && result.time !== '?' && result.time !== '∞' && <button onClick={timer} className="p-4 rounded-full bg-green-600 text-white shadow-lg active:scale-95"><Play/></button>}
                <button onClick={roll} disabled={rolling} className="px-8 py-3 bg-gold text-black font-bold rounded-full shadow-lg active:scale-95 transition">ROLL</button>
            </div>
            <button onClick={()=>setEdit(true)} className="text-gray-500 flex items-center gap-2"><Edit2 size={16}/> Edit</button>
        </div>
    );
};

const Settings = ({user, logout}) => <div className="p-6 text-white"><h2 className="text-2xl mb-4 text-gold">Settings</h2><button onClick={logout} className="text-red-500 flex items-center gap-2 border border-red-500 px-4 py-2 rounded"><LogOut/> Logout</button></div>;
const Notifications = () => <div className="p-6 text-white">Notifications Settings</div>;

const Home = () => {
    const [cards, setCards] = useState([]);
    const [sections, setSections] = useState([]);
    const [headers, setHeaders] = useState([]);
    const [activeHeader, setActiveHeader] = useState(null);
    const [activeSection, setActiveSection] = useState(null);
    const [selectedCard, setSelectedCard] = useState(null);
    const [deleteId, setDeleteId] = useState(null);
    
    // CRUD States
    const [newHeader, setNewHeader] = useState("");
    const [newSection, setNewSection] = useState("");
    const [showHeaderInput, setShowHeaderInput] = useState(false);
    const [showSectionInput, setShowSectionInput] = useState(false);
    const [sectionMenu, setSectionMenu] = useState(null);
    const [moveTarget, setMoveTarget] = useState(null);
    const [headerMenu, setHeaderMenu] = useState(null);

    const refresh = async () => {
        const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
        const [c, s, hd] = await Promise.all([safeFetch(`${API_URL}/cards`,{headers:h}), safeFetch(`${API_URL}/sections`,{headers:h}), safeFetch(`${API_URL}/headers`,{headers:h})]);
        if(Array.isArray(c)) setCards(c);
        if(Array.isArray(s)) setSections(s);
        if(Array.isArray(hd)) setHeaders(hd);
    };
    useEffect(() => { refresh(); }, []);

    const addHeader = async () => { await safeFetch(`${API_URL}/headers`, { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('token')}`}, body:JSON.stringify({title:newHeader}) }); setNewHeader(""); setShowHeaderInput(false); refresh(); };
    const addSection = async () => { await safeFetch(`${API_URL}/sections`, { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('token')}`}, body:JSON.stringify({title:newSection, header_id:activeHeader}) }); setNewSection(""); setShowSectionInput(false); refresh(); };
    const uploadCard = async (e) => {
        const files = Array.from(e.target.files);
        for(const f of files) { const fd = new FormData(); fd.append('file', f); fd.append('section_id', activeSection); await safeFetch(`${API_URL}/cards`, { method:'POST', headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}, body:fd }); }
        refresh();
    };
    const deleteCard = async () => { await safeFetch(`${API_URL}/cards/${deleteId}`, { method:'DELETE', headers:{Authorization:`Bearer ${localStorage.getItem('token')}`} }); setDeleteId(null); refresh(); };
    const deleteSection = async () => { await safeFetch(`${API_URL}/sections/${sectionMenu.id}`, { method:'DELETE', headers:{Authorization:`Bearer ${localStorage.getItem('token')}`} }); setSectionMenu(null); refresh(); };
    const deleteHeader = async () => { await safeFetch(`${API_URL}/headers/${headerMenu.id}`, { method:'DELETE', headers:{Authorization:`Bearer ${localStorage.getItem('token')}`} }); setHeaderMenu(null); setActiveHeader(null); refresh(); };
    const moveSection = async (hid) => { await safeFetch(`${API_URL}/sections/${sectionMenu.id}`, { method:'PUT', headers:{'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('token')}`}, body:JSON.stringify({title:sectionMenu.title, header_id:hid}) }); setMoveTarget(null); setSectionMenu(null); refresh(); };

    const filSections = activeHeader ? sections.filter(s => s.header_id === activeHeader) : sections.filter(s => !s.header_id);
    const filCards = cards.filter(c => activeSection ? c.section_id === activeSection : !c.section_id);

    return (
        <div className="pb-24 px-4 w-full">
            <div className="flex gap-2 overflow-x-auto p-2 pb-0 no-scrollbar">
                <button onClick={()=>setActiveHeader(null)} className={`px-4 py-1 rounded-full border text-sm ${!activeHeader?'bg-gold text-black':'text-gray-400 border-gray-600'}`}>Unsorted</button>
                {headers.map(h => {
                    const lp = useLongPress(()=>setHeaderMenu(h));
                    return <button key={h.id} {...lp} onClick={()=>setActiveHeader(h.id)} className={`px-4 py-1 rounded-full border text-sm ${activeHeader===h.id?'bg-gold text-black':'text-gray-400 border-gray-600'}`}>{h.title}</button>
                })}
                <button onClick={()=>setShowHeaderInput(true)} className="px-2 rounded-full border text-gray-400"><Plus/></button>
            </div>
            {showHeaderInput && <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"><div className="bg-gray-800 p-4 rounded"><input value={newHeader} onChange={e=>setNewHeader(e.target.value)} className="text-black p-2 rounded"/><button onClick={addHeader} className="ml-2 bg-gold p-2 rounded">Add</button><button onClick={()=>setShowHeaderInput(false)} className="ml-2 text-white">X</button></div></div>}

            <div className="flex gap-2 overflow-x-auto p-2 pb-4 no-scrollbar bg-white/5 mt-2 rounded">
                {filSections.map(s => {
                    const lp = useLongPress(()=>setSectionMenu(s));
                    return <button key={s.id} {...lp} onClick={()=>setActiveSection(s.id===activeSection?null:s.id)} className={`px-4 py-1 rounded-full border text-sm ${activeSection===s.id?'bg-red-600 text-white':'text-gray-400'}`}>{s.title}</button>
                })}
                <button onClick={()=>setShowSectionInput(true)} className="px-2 rounded-full border text-gray-400"><Plus/></button>
            </div>
            {showSectionInput && <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"><div className="bg-gray-800 p-4 rounded"><input value={newSection} onChange={e=>setNewSection(e.target.value)} className="text-black p-2 rounded"/><button onClick={addSection} className="ml-2 bg-gold p-2 rounded">Add</button><button onClick={()=>setShowSectionInput(false)} className="ml-2 text-white">X</button></div></div>}

            <div className="my-4 flex justify-between">
                <label className="bg-red-600 px-4 py-2 rounded text-white flex gap-2 items-center cursor-pointer"><Upload size={16}/> Upload<input type="file" className="hidden" multiple accept="image/*" onChange={uploadCard}/></label>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {filCards.map(c => <CardItem key={c.id} card={c} onDeleteRequest={setDeleteId} onClick={setSelectedCard} />)}
            </div>

            {/* Modals */}
            {selectedCard && <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"><div className="relative h-[80%]"><img src={selectedCard.filepath} className="h-full object-contain"/><button onClick={()=>setSelectedCard(null)} className="absolute top-0 right-0 p-4 text-white"><X/></button></div></div>}
            {deleteId && <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"><div className="bg-gray-800 p-6 rounded text-center"><p className="text-white mb-4">Delete Card?</p><button onClick={deleteCard} className="bg-red-600 text-white px-4 py-2 rounded">Yes</button><button onClick={()=>setDeleteId(null)} className="ml-4 text-gray-400">No</button></div></div>}
            {headerMenu && <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"><div className="bg-gray-800 p-6 rounded text-center"><p className="text-white mb-4">Delete Category "{headerMenu.title}"?</p><button onClick={deleteHeader} className="bg-red-600 text-white px-4 py-2 rounded">Delete</button><button onClick={()=>setHeaderMenu(null)} className="ml-4 text-gray-400">Cancel</button></div></div>}
            {sectionMenu && !moveTarget && <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"><div className="bg-gray-800 p-6 rounded text-center flex flex-col gap-4"><h3 className="text-gold text-xl">{sectionMenu.title}</h3><button onClick={()=>setMoveTarget(true)} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 justify-center"><Grid/> Move to Category</button><button onClick={deleteSection} className="bg-red-600 text-white px-4 py-2 rounded flex items-center gap-2 justify-center"><Trash2/> Delete Section</button><button onClick={()=>setSectionMenu(null)} className="text-gray-400">Cancel</button></div></div>}
            {moveTarget && <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"><div className="bg-gray-800 p-6 rounded w-64 max-h-[80vh] overflow-y-auto"><h3 className="text-white mb-4">Move to...</h3><button onClick={()=>moveSection(null)} className="w-full text-left p-2 border-b border-gray-600 text-gray-300">Unsorted</button>{headers.map(h=><button key={h.id} onClick={()=>moveSection(h.id)} className="w-full text-left p-2 border-b border-gray-600 text-gold">{h.title}</button>)}<button onClick={()=>setMoveTarget(null)} className="mt-4 text-gray-400 w-full">Cancel</button></div></div>}
        </div>
    );
};

const Layout = ({ children, user, logout }) => {
    const [menu, setMenu] = useState(false);
    const loc = useLocation();
    const handleExport = () => window.open(`${API_URL}/export?token=${localStorage.getItem('token')}`, '_blank');
    
    return (
        <div className="fixed inset-0 bg-black text-white flex flex-col font-sans">
            <div className="flex justify-between items-center p-4 bg-gray-900 border-b border-gray-800">
                <h1 className="text-gold text-xl font-bold">Privy</h1>
                <button onClick={()=>setMenu(!menu)}><Menu className="text-gold"/></button>
            </div>
            {menu && <div className="absolute top-14 right-0 w-64 bg-gray-900 border-l border-gold z-50 p-4 shadow-xl">
                <div className="flex flex-col gap-4">
                    <Link to="/settings" onClick={()=>setMenu(false)} className="flex gap-2 items-center text-white"><User/> Profile</Link>
                    <button onClick={handleExport} className="flex gap-2 items-center text-white"><Download/> Export Data</button>
                    <button onClick={logout} className="flex gap-2 items-center text-red-500"><LogOut/> Logout</button>
                </div>
            </div>}
            <div className="flex-1 overflow-y-auto w-full">{children}</div>
            <div className="bg-gray-900 border-t border-gray-800 p-2 flex justify-around overflow-x-auto no-scrollbar">
                <Link to="/" className={`p-2 ${loc.pathname==='/'?'text-red-500':'text-gray-500'}`}><Layers/></Link>
                <Link to="/spin" className={`p-2 ${loc.pathname==='/spin'?'text-red-500':'text-gray-500'}`}><Aperture/></Link>
                <Link to="/dice" className={`p-2 ${loc.pathname==='/dice'?'text-red-500':'text-gray-500'}`}><Dices/></Link>
                <Link to="/extras" className={`p-2 ${loc.pathname==='/extras'?'text-red-500':'text-gray-500'}`}><Sparkles/></Link>
                <Link to="/books" className={`p-2 ${loc.pathname==='/books'?'text-red-500':'text-gray-500'}`}><Book/></Link>
                <Link to="/toys" className={`p-2 ${loc.pathname==='/toys'?'text-red-500':'text-gray-500'}`}><Zap/></Link>
                <Link to="/lingerie" className={`p-2 ${loc.pathname==='/lingerie'?'text-red-500':'text-gray-500'}`}><Shirt/></Link>
                <Link to="/protection" className={`p-2 ${loc.pathname==='/protection'?'text-red-500':'text-gray-500'}`}><Shield/></Link>
            </div>
        </div>
    );
};

export default function App() {
  const [user, setUser] = useState(null);
  useEffect(() => { try { const u = JSON.parse(localStorage.getItem('user')); if(u) setUser(u); } catch(e){} }, []);
  const logout = () => { localStorage.clear(); setUser(null); };
  return (<ErrorBoundary>{!user ? <Auth setUser={setUser}/> : <Router><Layout user={user} logout={logout}><Routes>
      <Route path="/" element={<Home/>}/>
      <Route path="/spin" element={<Spin/>}/>
      <Route path="/dice" element={<DiceGame/>}/>
      <Route path="/extras" element={<Extras/>}/>
      <Route path="/books" element={<Books/>}/>
      <Route path="/toys" element={<Gallery title="Toys" endpoint="toys" icon={<Zap size={32}/>}/>}/>
      <Route path="/lingerie" element={<Gallery title="Lingerie" endpoint="lingerie" icon={<Shirt size={32}/>}/>}/>
      <Route path="/protection" element={<Protection/>}/>
      <Route path="/settings" element={<Settings user={user} logout={logout}/>}/>
      <Route path="/notifications" element={<Notifications/>}/>
  </Routes></Layout></Router>}</ErrorBoundary>);
}
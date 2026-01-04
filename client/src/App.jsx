import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, User, LogOut, Upload, Book, Layers, Shuffle, Heart, Maximize2, Clock, Calendar, Trash2, Edit2, Plus, Folder, RefreshCw, Bell, Send, Aperture, RotateCcw, AlertTriangle, Scissors, Dices, MapPin, Sparkles, Timer, Play, Pause, CheckCircle, RotateCw, Square, Zap, Shirt, Shield, ChevronLeft, ChevronRight } from 'lucide-react';

const API_URL = '/api';

const safeFetch = async (url, options = {}) => {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) return await res.json();
    return null;
  } catch (e) { console.error(e); return null; }
};

// --- Error Boundary ---
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

// --- Hooks ---
const useLongPress = (callback = () => {}, ms = 800) => {
  const [start, setStart] = useState(false);
  useEffect(() => { let t; if (start) t = setTimeout(callback, ms); else clearTimeout(t); return () => clearTimeout(t); }, [start]);
  return { onMouseDown: () => setStart(true), onMouseUp: () => setStart(false), onMouseLeave: () => setStart(false), onTouchStart: () => setStart(true), onTouchEnd: () => setStart(false) };
};

// --- Audio ---
const playSound = (type) => {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
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

// --- Components ---

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
    <div className="relative w-full h-full bg-black select-none overflow-hidden flex items-center justify-center" onClick={handleInteraction}>
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
       <div className="flex justify-between items-center mb-4 border-b border-gold/30 pb-2"><h3 className="text-gold text-xl">History</h3><button onClick={onClose}><X className="text-white"/></button></div>
       {history.map((h, i) => (<div key={i} className="bg-white/5 p-3 rounded mb-2 text-white text-sm flex justify-between"><span>{new Date(h.timestamp).toLocaleDateString()}</span><span>{new Date(h.timestamp).toLocaleTimeString()}</span></div>))}
    </div>
  );
};

const CardItem = ({ card, onDeleteRequest, onClick }) => {
    const lp = useLongPress(() => onDeleteRequest(card.id));
    const lastTap = useRef(0);
    const handleTap = () => { const now = Date.now(); if (now - lastTap.current < 300) onClick(card); lastTap.current = now; };
    return <div {...lp} onClick={handleTap} className="aspect-[3/4] bg-gray-800 rounded-lg border border-gold/30 flex items-center justify-center overflow-hidden"><Maximize2 className="text-gold"/></div>;
};

const CalendarView = () => {
    const [dt, setDt] = useState(new Date()); 
    const [notes, setNotes] = useState([]);
    const [sel, setSel] = useState(null); 
    const [noteTxt, setNoteTxt] = useState("");

    const load = async () => {
        const n = await safeFetch(`${API_URL}/calendar`,{headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}});
        if(Array.isArray(n)) setNotes(n);
    };
    useEffect(()=>{load()},[]);

    const days = [];
    const y=dt.getFullYear(), m=dt.getMonth();
    const first = new Date(y,m,1).getDay();
    const numDays = new Date(y,m+1,0).getDate();
    for(let i=0;i<first;i++) days.push(null);
    for(let i=1;i<=numDays;i++) days.push(new Date(y,m,i));

    const saveNote = async () => {
        if(!noteTxt) return;
        await safeFetch(`${API_URL}/calendar`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('token')}`},body:JSON.stringify({date:sel,text:noteTxt})});
        setNoteTxt(""); load();
    };
    const delNote = async (id) => {
        await safeFetch(`${API_URL}/calendar/${id}`,{method:'DELETE',headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}});
        load();
    };

    return (
        <div className="p-4 flex flex-col items-center pb-24">
            <div className="flex justify-between w-full mb-4 text-gold text-xl font-bold">
                <button onClick={()=>setDt(new Date(y,m-1,1))}><ChevronLeft/></button>
                <span>{dt.toLocaleString('default',{month:'long', year:'numeric'})}</span>
                <button onClick={()=>setDt(new Date(y,m+1,1))}><ChevronRight/></button>
            </div>
            <div className="grid grid-cols-7 gap-2 w-full mb-4">
                {['S','M','T','W','T','F','S'].map((d,i)=><div key={i} className="text-center text-gray-500 text-xs">{d}</div>)}
                {days.map((d,i)=>{
                    if(!d) return <div key={i}></div>;
                    const ds = d.toISOString().split('T')[0];
                    const hasNote = notes.some(n=>n.date===ds);
                    return <div key={i} onClick={()=>setSel(ds)} className={`aspect-square flex flex-col items-center justify-center rounded-lg relative cursor-pointer ${sel===ds?'border border-gold bg-gray-700':'bg-gray-800'}`}>
                        <span className="text-white text-sm">{d.getDate()}</span>
                        {hasNote && <div className="w-1.5 h-1.5 bg-gold rounded-full mt-1"></div>}
                    </div>;
                })}
            </div>
            <div className="w-full bg-gray-900 p-4 rounded-lg">
                <h3 className="text-gold mb-2">{sel ? new Date(sel).toDateString() : "Select a date"}</h3>
                {sel && (
                    <>
                        <div className="flex gap-2 mb-4">
                            <input className="flex-1 bg-black text-white p-2 rounded border border-gray-700" value={noteTxt} onChange={e=>setNoteTxt(e.target.value)} placeholder="Add note..."/>
                            <button onClick={saveNote} className="bg-gold text-black px-4 rounded"><Plus/></button>
                        </div>
                        <ul className="space-y-2">
                            {notes.filter(n=>n.date===sel).map(n=>(
                                <li key={n.id} className="flex justify-between text-white text-sm bg-black/40 p-2 rounded">
                                    <span>• {n.text}</span>
                                    <button onClick={()=>delNote(n.id)} className="text-red-500"><Trash2 size={14}/></button>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </div>
        </div>
    );
};

// --- Pages ---

const Auth = ({ setUser }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ username: '', password: '', name: '', age: '', gender: '' });
  const handleSubmit = async (e) => {
    e.preventDefault();
    const endpoint = isLogin ? '/login' : '/register';
    const data = await safeFetch(`${API_URL}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (data && data.token) { localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user)); setUser(data.user); } 
    else if (data && data.success) { setIsLogin(true); } 
    else { alert(data?.error || "Error"); }
  };
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-eggplant via-burgundy to-black text-gold p-6 font-caveat">
      <h1 className="text-6xl mb-8">{isLogin ? 'Privy Login' : 'Join Privy'}</h1>
      <form onSubmit={handleSubmit} className="bg-black/50 p-8 rounded-2xl border border-gold/30 backdrop-blur-md w-full max-w-sm space-y-4">
        <input className="w-full p-3 mb-4 bg-gray-900 border border-burgundy rounded text-white" placeholder="Username" onChange={e => setForm({...form, username: e.target.value})} />
        <input className="w-full p-3 mb-4 bg-gray-900 border border-burgundy rounded text-white" type="password" placeholder="Password" onChange={e => setForm({...form, password: e.target.value})} />
        {!isLogin && <input className="w-full p-3 mb-4 bg-gray-900 border border-burgundy rounded text-white" placeholder="Name" onChange={e => setForm({...form, name: e.target.value})} />}
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
    const [delId, setDeleteId] = useState(null);

    const load = useCallback(() => { safeFetch(`${API_URL}/${endpoint}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(d => { if(Array.isArray(d)) setItems(d); }); }, [endpoint]);
    useEffect(() => { load(); }, [load]);

    const upload = async (e) => {
        const files = Array.from(e.target.files);
        for(const f of files) { const fd = new FormData(); fd.append('file', f); await safeFetch(`${API_URL}/${endpoint}`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, body: formData }); }
        load();
    };

    const draw = () => {
        if(items.length===0) return;
        setDrawing(true); setWinner(null);
        let c = 0;
        const i = setInterval(() => {
            setWinner(items[Math.floor(Math.random()*items.length)]);
            c++;
            if(c>20) { clearInterval(i); setDrawing(false); const w = items[Math.floor(Math.random()*items.length)]; setWinner(w); safeFetch(`${API_URL}/${endpoint}/${w.id}/draw`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); }
        }, 100);
    };
    
    const del = async () => { await safeFetch(`${API_URL}/${endpoint}/${delId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); setDeleteId(null); load(); };

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
                <label className="aspect-square bg-gray-800 border-2 border-dashed border-gray-600 rounded flex flex-col items-center justify-center cursor-pointer"><Plus className="text-gray-400"/><input type="file" className="hidden" multiple accept="image/*" onChange={upload} /></label>
                {items.map(i => (<GalleryItem key={i.id} item={i} onDeleteRequest={setDeleteId} />))}
            </div>}
            {delId && <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"><div className="bg-gray-800 p-6 rounded text-center"><p className="text-white mb-4">Delete Item?</p><button onClick={del} className="bg-red-600 text-white px-4 py-2 rounded">Delete</button><button onClick={()=>setDeleteId(null)} className="ml-4 text-gray-400">Cancel</button></div></div>}
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

const Spin = () => { return <div className="p-10 text-white text-center">Spin Wheel (Placeholder)</div>; };
const DiceGame = () => { return <div className="p-10 text-white text-center">Dice Game (Placeholder)</div>; };
const Extras = () => { return <div className="p-10 text-white text-center">Extras (Placeholder)</div>; };
const Books = () => { return <div className="p-10 text-white text-center">Books (Placeholder)</div>; };
const Settings = ({user, logout}) => <div className="p-6 text-white"><button onClick={logout} className="text-red-500 border border-red-500 px-4 py-2 rounded">Logout</button></div>;
const Notifications = () => <div className="p-6 text-white">Notifications</div>;

const Home = () => {
    const [cards, setCards] = useState([]);
    const [sections, setSections] = useState([]);
    const [activeSection, setActiveSection] = useState(null);
    const [selectedCard, setSelectedCard] = useState(null);
    const [deleteId, setDeleteId] = useState(null);
    
    // CRUD
    const [newSection, setNewSection] = useState("");
    const [showSectionInput, setShowSectionInput] = useState(false);

    const refresh = async () => {
        const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
        const [c, s] = await Promise.all([safeFetch(`${API_URL}/cards`,{headers:h}), safeFetch(`${API_URL}/sections`,{headers:h})]);
        if(Array.isArray(c)) setCards(c);
        if(Array.isArray(s)) setSections(s);
    };
    useEffect(() => { refresh(); }, []);

    const uploadCard = async (e) => {
        const files = Array.from(e.target.files);
        for(const f of files) { const fd = new FormData(); fd.append('file', f); if(activeSection) fd.append('section_id', activeSection); await safeFetch(`${API_URL}/cards`, { method:'POST', headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}, body:fd }); }
        refresh();
    };
    const addSection = async () => { await safeFetch(`${API_URL}/sections`, { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('token')}`}, body:JSON.stringify({title:newSection}) }); setNewSection(""); setShowSectionInput(false); refresh(); };
    const deleteCard = async () => { await safeFetch(`${API_URL}/cards/${deleteId}`,{method:'DELETE',headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}}); setDeleteId(null); refresh(); };
    const handleReveal = async (id) => { await safeFetch(`${API_URL}/cards/${id}/scratch`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); setCards(prev => prev.map(c => c.id === id ? {...c, scratched_count: c.scratched_count + 1} : c)); };
    
    const filCards = cards.filter(c => activeSection ? c.section_id === activeSection : !c.section_id);

    return (
        <div className="pb-24 px-4 w-full">
            <div className="flex gap-2 overflow-x-auto p-2 pb-4 mb-4 no-scrollbar bg-white/5 mt-2 rounded">
                <button onClick={()=>setActiveSection(null)} className={`px-4 py-1 rounded-full border text-sm ${!activeSection?'bg-red-600 text-white':'text-gray-400 border-gray-600'}`}>All</button>
                {sections.map(s => <button key={s.id} onClick={()=>setActiveSection(s.id)} className={`px-4 py-1 rounded-full border text-sm ${activeSection===s.id?'bg-red-600 text-white':'text-gray-400 border-gray-600'}`}>{s.title}</button>)}
                <button onClick={()=>setShowSectionInput(true)} className="px-2 rounded-full border text-gray-400"><Plus/></button>
            </div>
            {showSectionInput && <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"><div className="bg-gray-800 p-4 rounded"><input value={newSection} onChange={e=>setNewSection(e.target.value)} className="text-black p-2 rounded"/><button onClick={addSection} className="ml-2 bg-gold p-2 rounded">Add</button><button onClick={()=>setShowSectionInput(false)} className="ml-2 text-white">X</button></div></div>}

            <div className="my-4 flex justify-between">
                <label className="bg-red-600 px-4 py-2 rounded text-white flex gap-2 items-center cursor-pointer"><Upload size={16}/> Upload<input type="file" hidden multiple accept="image/*" onChange={uploadCard}/></label>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {filCards.map(c => <CardItem key={c.id} card={c} onDeleteRequest={setDeleteId} onClick={setSelectedCard} />)}
            </div>

            {selectedCard && <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"><div className="relative h-[80%]"><img src={selectedCard.filepath} className="h-full object-contain"/><button onClick={()=>setSelectedCard(null)} className="absolute top-0 right-0 p-4 text-white"><X/></button><div className="absolute bottom-0 w-full flex justify-center"><RevealCard image={selectedCard.filepath} id={selectedCard.id} onRevealComplete={handleReveal} /></div></div></div>}
            {deleteId && <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"><div className="bg-gray-800 p-6 rounded text-center"><p className="text-white mb-4">Delete?</p><button onClick={deleteCard} className="bg-red-600 text-white px-4 py-2 rounded">Yes</button><button onClick={()=>setDeleteId(null)} className="ml-4 text-gray-400">No</button></div></div>}
        </div>
    );
};

const Layout = ({ children, user, logout }) => {
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  
  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col font-sans overflow-hidden">
      <header className="flex-none bg-gradient-to-r from-eggplant to-black border-b border-gold/20 p-4 flex justify-between items-center shadow-lg"><span className="text-xl text-gold font-bold">Privy</span><button onClick={()=>setMenu(!menu)}><Menu className="text-gold"/></button></header>
      {menu && <div className="absolute top-14 right-0 w-64 bg-gray-900 border-l border-gold z-50 p-4 shadow-xl flex flex-col gap-4"><Link to="/settings" onClick={()=>setMenu(false)} className="flex gap-2 items-center text-white"><User/> Profile</Link><button onClick={logout} className="flex gap-2 items-center text-red-500"><LogOut/> Logout</button></div>}
      <main className="flex-1 overflow-y-auto w-full">{children}</main>
      <nav className="flex-none bg-black/90 backdrop-blur-md border-t border-gold/20 flex justify-around pt-4 pb-8 z-50 overflow-x-auto no-scrollbar gap-8 px-4">
        {[
            {p:'/',i:<Layers/>,l:'Cards'},{p:'/spin',i:<Aperture/>,l:'Spin'},{p:'/dice',i:<Dices/>,l:'Dice'},
            {p:'/extras',i:<Sparkles/>,l:'Extras'},{p:'/books',i:<Book/>,l:'Books'},{p:'/toys',i:<Zap/>,l:'Toys'},
            {p:'/lingerie',i:<Shirt/>,l:'Lingerie'},{p:'/protection',i:<Shield/>,l:'Safety'},{p:'/calendar',i:<Calendar/>,l:'Calendar'}
        ].map(x=><Link key={x.p} to={x.p} className={`flex flex-col items-center min-w-[50px] ${loc.pathname===x.p?'text-lipstick':'text-gray-500'}`}>{x.i}<span className="text-xs">{x.l}</span></Link>)}
      </nav>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  useEffect(() => { try { const saved = localStorage.getItem('user'); if (saved) setUser(JSON.parse(saved)); } catch (e) { localStorage.clear(); } }, []);
  const logout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); };
  return (<ErrorBoundary>{!user ? (<Auth setUser={setUser} />) : (<Router><Layout user={user} logout={logout}><Routes>
      <Route path="/" element={<Home />} />
      <Route path="/spin" element={<Spin />} />
      <Route path="/dice" element={<DiceGame />} />
      <Route path="/extras" element={<Extras />} />
      <Route path="/books" element={<Books />} />
      <Route path="/toys" element={<Gallery title="Toys" endpoint="toys" icon={<Zap size={32}/>} />} />
      <Route path="/lingerie" element={<Gallery title="Lingerie" endpoint="lingerie" icon={<Shirt size={32}/>} />} />
      <Route path="/protection" element={<Protection />} />
      <Route path="/settings" element={<Settings user={user} logout={logout} />} />
      <Route path="/notifications" element={<Notifications />} />
      <Route path="/calendar" element={<CycleTracker />} />
  </Routes></Layout></Router>)}</ErrorBoundary>);
}
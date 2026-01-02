import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, User, LogOut, Upload, Book, Layers, Shuffle, Heart, Maximize2, Clock, Calendar, Trash2, Edit2, Plus, Folder, RefreshCw, Bell, Send, Aperture, RotateCcw, AlertTriangle, Scissors, Dices, MapPin, Sparkles, Timer, Play, Pause, CheckCircle, RotateCw, Square } from 'lucide-react';

const API_URL = '/api';

// --- Error Boundary ---
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { console.error("Crash:", error, errorInfo); }
  handleReset() {
    localStorage.clear();
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
    window.location.reload();
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-gold p-6 text-center font-sans z-[9999]">
          <AlertTriangle size={64} className="mb-4 text-red-500" />
          <h1 className="text-4xl mb-4 font-bold">App Crashed</h1>
          <p className="text-sm mb-8 text-gray-300">{this.state.error?.message || "Unknown Error"}</p>
          <button onClick={this.handleReset} className="px-6 py-3 bg-red-600 rounded-full text-white font-bold flex items-center gap-2"><RefreshCw size={20} /> Force Reset</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Hooks ---
const useLongPress = (callback = () => {}, ms = 800) => {
  const [startLongPress, setStartLongPress] = useState(false);
  useEffect(() => {
    let timerId;
    if (startLongPress) { timerId = setTimeout(callback, ms); } else { clearTimeout(timerId); }
    return () => clearTimeout(timerId);
  }, [startLongPress, callback, ms]);
  return {
    onMouseDown: () => setStartLongPress(true),
    onMouseUp: () => setStartLongPress(false),
    onMouseLeave: () => setStartLongPress(false),
    onTouchStart: () => setStartLongPress(true),
    onTouchEnd: () => setStartLongPress(false),
    onTouchCancel: () => setStartLongPress(false)
  };
};

// --- Audio ---
const playSound = (type) => {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        // Resume context if suspended (browser policy)
        if (ctx.state === 'suspended') ctx.resume();
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        const now = ctx.currentTime;
        if (type === 'ting') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(400, now + 0.5);
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);
        } else if (type === 'end') {
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            
            osc.frequency.setValueAtTime(600, now);
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
            
            osc2.frequency.setValueAtTime(800, now + 0.25);
            gain2.gain.setValueAtTime(0.5, now + 0.25);
            gain2.gain.linearRampToValueAtTime(0, now + 0.5);
            osc2.start(now + 0.25); osc2.stop(now + 0.5);
        }
    } catch(e) { console.warn("Audio error", e); }
};

// --- Top Level Components ---

const RevealCard = ({ image, id, onRevealComplete }) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const tapCount = useRef(0);
  const tapTimer = useRef(null);
  useEffect(() => { setIsRevealed(false); tapCount.current = 0; }, [image]);
  
  const handleInteraction = () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapCount.current += 1;
    if (tapCount.current === 3) {
      if (!isRevealed) { setIsRevealed(true); onRevealComplete(id); }
      tapCount.current = 0;
    } else { tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 400); }
  };

  return (
    <div className="relative w-full h-full bg-black select-none overflow-hidden flex items-center justify-center" onClick={handleInteraction}>
      <img src={image} alt="Secret" className="max-w-full max-h-full object-contain pointer-events-none" />
      {!isRevealed && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4" style={{ backgroundImage: `conic-gradient(#301934 0.25turn, #000 0.25turn 0.5turn, #301934 0.5turn 0.75turn, #000 0.75turn)`, backgroundSize: '50px 50px', backgroundPosition: 'top left' }}>
          <div className="bg-black/60 backdrop-blur-md px-6 py-3 rounded-2xl border-2 border-gold/50 shadow-lg animate-pulse select-none pointer-events-none"><span className="text-gold font-caveat text-3xl drop-shadow-md">Triple Tap</span></div>
        </div>
      )}
    </div>
  );
};

const HistoryList = ({ cardId, onClose }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    fetch(`${API_URL}/cards/${cardId}/history`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => { if(mounted) { setHistory(Array.isArray(d) ? d : []); setLoading(false); } })
      .catch(() => { if(mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [cardId]);
  
  return (
    <div className="w-full h-full bg-gray-900 p-4 overflow-y-auto animate-fadeIn">
       <div className="flex justify-between items-center mb-4 border-b border-gold/30 pb-2"><h3 className="text-gold text-xl flex items-center gap-2"><Clock size={18}/> History</h3></div>
       {loading ? <p className="text-gray-400">Loading...</p> : history.length === 0 ? <p className="text-gray-400 text-center mt-10">No history yet.</p> : (
         <ul className="space-y-3">{history.map((h, i) => {
             const d = new Date(h.timestamp.endsWith('Z') ? h.timestamp : h.timestamp + 'Z');
             return (<li key={i} className="bg-white/5 p-3 rounded flex items-center justify-between text-sm"><span className="text-white flex items-center gap-2"><Calendar size={14} className="text-burgundy"/> {d.toLocaleDateString()}</span><span className="text-gold font-mono">{d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></li>)
         })}</ul>
       )}
    </div>
  );
};

const PDFViewer = ({ url, title, bookId, onClose }) => {
  const [isExtracting, setIsExtracting] = useState(false);
  const [progressText, setProgressText] = useState("");
  const handleExtract = async () => {
    if (!confirm("Extract all images from this book into a new card section?")) return;
    setIsExtracting(true); setProgressText("Initializing...");
    const intervals = [setTimeout(() => setProgressText("Scanning..."), 2000), setTimeout(() => setProgressText("Extracting..."), 5000), setTimeout(() => setProgressText("Creating cards..."), 10000)];
    try {
        const res = await fetch(`${API_URL}/books/${bookId}/extract`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        const data = await res.json();
        intervals.forEach(clearTimeout);
        if (res.ok) { setProgressText("Done!"); setTimeout(() => { alert(`Success! ${data.message}`); setIsExtracting(false); }, 500); } 
        else { alert(`Error: ${data.error}`); setIsExtracting(false); }
    } catch { intervals.forEach(clearTimeout); alert("Failed."); setIsExtracting(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col animate-fadeIn">
      <div className="flex justify-between items-center px-4 pb-4 pt-12 bg-gray-900 border-b border-gold/20 safe-top">
        <div className="flex flex-col max-w-[60%]"><h3 className="text-gold text-xl truncate">{title}</h3>{isExtracting && <span className="text-xs text-gold/80 animate-pulse">{progressText}</span>}</div>
        <div className="flex gap-4 items-center">
            <button onClick={handleExtract} disabled={isExtracting} className={`p-2 rounded-full text-white shadow-lg ${isExtracting ? 'bg-gray-700' : 'bg-blue-600'}`}><RefreshCw className={isExtracting ? "animate-spin" : ""} size={24}/></button>
            <button onClick={onClose} className="p-2 bg-burgundy rounded-full text-white hover:bg-lipstick shadow-lg"><X size={24}/></button>
        </div>
      </div>
      {isExtracting && <div className="w-full h-1 bg-gray-800"><div className="animate-progress-indeterminate w-full h-full"></div></div>}
      <div className="flex-1 w-full h-full bg-gray-800 flex items-center justify-center p-2 overflow-hidden relative">
        <object data={url} type="application/pdf" className="w-full h-full rounded-lg border border-gold/20"><div className="text-white text-center flex flex-col items-center justify-center h-full gap-4"><p>Preview not supported.</p><a href={url} download className="bg-gold text-black font-bold py-2 px-6 rounded-full">Download PDF</a></div></object>
      </div>
    </div>
  );
};

const SectionTab = ({ section, activeSection, setActiveSection, onLongPress }) => {
    const longPressProps = useLongPress(() => { if (onLongPress) onLongPress(section); }, 800);
    const isActive = activeSection === section.id;
    return ( <button {...longPressProps} onClick={() => setActiveSection(isActive ? null : section.id)} className={`px-4 py-2 rounded-full whitespace-nowrap transition border ${isActive ? 'bg-burgundy border-gold text-white shadow-lg transform scale-105 z-10' : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'}`}>{section.title}</button> );
};

const CardItem = ({ card, onDeleteRequest, onClick }) => {
    const longPressProps = useLongPress(() => onDeleteRequest(card.id), 800);
    const lastTap = useRef(0);
    const handleDoubleTap = () => { const now = Date.now(); if (now - lastTap.current < 300 && now - lastTap.current > 0) onClick(card); lastTap.current = now; };
    return ( <div {...longPressProps} onClick={handleDoubleTap} className="aspect-[3/4] bg-gradient-to-br from-gray-800 to-black rounded-lg border-2 border-gold/50 hover:border-lipstick cursor-pointer flex flex-col items-center justify-center relative overflow-hidden transition transform hover:scale-105 shadow-lg select-none"><div className="absolute inset-0 bg-pattern opacity-20"></div><Maximize2 className="text-gold mb-2" size={32} /><span className="text-gold font-caveat text-xl">Double Tap to Play</span></div> );
};

const LocationItem = ({ loc, onToggle, onDeleteRequest }) => {
    const longPressProps = useLongPress(() => onDeleteRequest(loc), 800);
    return (
        <div {...longPressProps} onClick={() => onToggle(loc.id)} className={`p-4 rounded-xl border flex items-center justify-between transition cursor-pointer select-none ${loc.count > 0 ? 'bg-burgundy/20 border-gold' : 'bg-gray-900 border-gray-700'}`}>
            <div className="flex items-center gap-4"><span className={`text-2xl font-caveat ${loc.count > 0 ? 'text-gold' : 'text-gray-400'}`}>{loc.name}</span>{loc.count > 0 && <span className="bg-gold text-black text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">{loc.count}x</span>}</div>
            {loc.count > 0 ? (<div className="text-right flex-shrink-0"><CheckCircle className="text-green-500 inline mb-1"/><div className="text-xs text-gray-500">{new Date(loc.unlocked_at).toLocaleDateString()}</div></div>) : (<div className="w-6 h-6 rounded-full border-2 border-gray-600 flex-shrink-0"></div>)}
        </div>
    );
};

const HistoryItem = ({ item, onReturn, onDeleteRequest }) => {
    const longPressProps = useLongPress(() => onDeleteRequest(item), 800);
    return (
        <div {...longPressProps} className="bg-gray-900 p-4 rounded-lg border border-gray-800 flex justify-between items-center select-none">
            <div><p className="text-gold font-caveat text-xl">{item.text}</p><p className="text-xs text-gray-500">{item.pulled_at ? new Date(item.pulled_at).toLocaleDateString() : ''}</p></div>
            <button onClick={() => onReturn(item.id)} className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-white flex items-center gap-1"><RotateCw size={12}/> Return</button>
        </div>
    );
};

const BookItem = ({ book, onClick, onLongPress }) => {
    const longPressProps = useLongPress(() => onLongPress(book), 800);
    return ( <div {...longPressProps} onClick={() => onClick(book)} className="bg-gray-900 border border-gold/20 p-6 rounded-lg hover:bg-gray-800 transition flex items-center gap-4 cursor-pointer shadow-md group select-none"><Book size={32} className="text-burgundy group-hover:text-lipstick transition-colors"/><div className="overflow-hidden"><h3 className="text-xl text-white truncate w-full">{book.title}</h3><p className="text-gray-500 text-sm group-hover:text-gold">Tap to read</p></div></div> );
};

// --- Pages ---

const Auth = ({ setUser }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ username: '', password: '', name: '', age: '', gender: '' });
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const endpoint = isLogin ? '/login' : '/register';
      const res = await fetch(`${API_URL}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.token) { localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user)); setUser(data.user); } else { alert(data.error); }
    } catch { alert("Network Error"); }
  };
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-eggplant via-burgundy to-black text-gold font-caveat">
      <h1 className="text-6xl mb-8 drop-shadow-lg text-lipstick">{isLogin ? 'Privy Login' : 'Join Privy'}</h1>
      <form onSubmit={handleSubmit} className="bg-black/50 p-8 rounded-2xl border border-gold/30 backdrop-blur-md w-80">
        <input className="w-full p-3 mb-4 bg-gray-900 border border-burgundy rounded text-white" placeholder="Username" onChange={e => setForm({...form, username: e.target.value})} />
        <input className="w-full p-3 mb-4 bg-gray-900 border border-burgundy rounded text-white" type="password" placeholder="Password" onChange={e => setForm({...form, password: e.target.value})} />
        {!isLogin && (<><input className="w-full p-3 mb-4 bg-gray-900 border border-burgundy rounded text-white" placeholder="Name" onChange={e => setForm({...form, name: e.target.value})} /><div className="flex gap-2 mb-4"><input className="w-1/2 p-3 bg-gray-900 border border-burgundy rounded text-white" type="number" placeholder="Age" onChange={e => setForm({...form, age: e.target.value})} /><select className="w-1/2 p-3 bg-gray-900 border border-burgundy rounded text-white" onChange={e => setForm({...form, gender: e.target.value})}><option value="">Gender</option><option value="Male">Male</option><option value="Female">Female</option></select></div></>)}
        <button className="w-full bg-lipstick hover:bg-red-700 text-white font-bold py-3 rounded shadow-lg transform active:scale-95">{isLogin ? 'Enter' : 'Sign Up'}</button>
      </form>
    </div>
  );
};

const Spin = () => {
    const [cards, setCards] = useState([]);
    const [sections, setSections] = useState([]);
    const [activeSection, setActiveSection] = useState(null);
    const [rotation, setRotation] = useState(0);
    const [isSpinning, setIsSpinning] = useState(false);
    const [winner, setWinner] = useState(null); 
    const [showHistory, setShowHistory] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const token = localStorage.getItem('token');
                const [cRes, sRes] = await Promise.all([ fetch(`${API_URL}/cards`, { headers: { Authorization: `Bearer ${token}` } }), fetch(`${API_URL}/sections`, { headers: { Authorization: `Bearer ${token}` } }) ]);
                if (cRes.ok && sRes.ok) {
                    const cData = await cRes.json();
                    const sData = await sRes.json();
                    if(Array.isArray(cData)) setCards(cData);
                    if(Array.isArray(sData)) setSections(sData);
                }
            } catch(e) {}
        };
        fetchData();
    }, []);

    const wheelGradient = `conic-gradient(${Array.from({length: 16}).map((_, i) => `${i % 2 === 0 ? '#800020' : '#111'} ${i * 22.5}deg ${(i + 1) * 22.5}deg`).join(', ')})`;

    const handleSpin = () => {
        if (isSpinning) return;
        const pool = cards.filter(c => { if (activeSection === null) return c.section_id == null; return c.section_id === activeSection; });
        if (pool.length === 0) { alert("No cards in this section!"); return; }
        setIsSpinning(true); setWinner(null);
        
        const winningIndex = Math.floor(Math.random() * 16);
        const winningCard = pool[Math.floor(Math.random() * pool.length)]; 
        
        const segmentAngle = 360 / 16; 
        const offset = (winningIndex * segmentAngle) + (segmentAngle / 2);
        const target = 360 - offset; 
        let delta = target - (rotation % 360);
        if (delta < 0) delta += 360;
        const totalRotation = rotation + (5 * 360) + delta;
        setRotation(totalRotation);

        setTimeout(() => {
            setIsSpinning(false);
            setWinner(winningCard);
            fetch(`${API_URL}/cards/${winningCard.id}/scratch`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        }, 4000);
    };

    return (
        <div className="flex flex-col items-center w-full min-h-full py-4">
            <div className="w-full flex gap-2 overflow-x-auto p-2 pb-4 mb-8 no-scrollbar justify-center shrink-0">{sections.map(s => (<SectionTab key={s.id} section={s} activeSection={activeSection} setActiveSection={setActiveSection} onLongPress={null} />))}</div>
            <div className="relative w-80 h-80 shrink-0">
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-t-[30px] border-t-lipstick drop-shadow-lg"></div>
                <div className="w-full h-full rounded-full border-4 border-gold shadow-[0_0_50px_rgba(128,0,32,0.6)] relative overflow-hidden" style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 4s cubic-bezier(0.25, 0.1, 0.25, 1)', background: wheelGradient }}>
                    {Array.from({length: 16}).map((_, i) => (<div key={i} className="absolute top-0 left-1/2 w-[1px] h-[50%] origin-bottom" style={{ transform: `rotate(${i * 22.5 + 11.25}deg)` }}><span className="absolute -top-1 -left-3 w-6 text-center text-gold font-bold font-caveat text-xl">{i + 1}</span></div>))}
                </div>
                <button onClick={handleSpin} disabled={isSpinning} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-gold border-4 border-burgundy shadow-lg flex items-center justify-center z-10 active:scale-95 transition"><span className="text-burgundy font-black text-xl font-sans tracking-widest">SPIN</span></button>
            </div>
            {winner && (<div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"><div className="relative w-full max-w-sm h-[75vh] flex flex-col border-4 border-gold rounded-xl overflow-hidden bg-black"><button onClick={() => setWinner(null)} className="absolute top-2 right-2 z-30 bg-black/50 text-white p-2 rounded-full"><X size={24}/></button><div className="h-[80%] relative border-b-4 border-gold bg-black flex items-center justify-center">{showHistory ? (<HistoryList cardId={winner.id} onClose={() => setShowHistory(false)}/>) : (<img src={winner.filepath} alt="Winner" className="max-w-full max-h-full object-contain"/>)}</div><div className="h-[20%] flex flex-col items-center justify-center p-4"><h3 className="text-gold text-2xl font-caveat mb-2">The Wheel has Spoken!</h3><button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-2 text-white/50 text-sm hover:text-white"><Heart size={16} className="fill-lipstick text-lipstick"/><span>Revealed {winner.scratched_count + 1} times</span></button></div></div></div>)}
        </div>
    );
};

const DiceGame = () => {
    const [acts, setActs] = useState([]);
    const [locations, setLocations] = useState([]);
    const [result, setResult] = useState({ act: '?', loc: '?', time: '?' });
    const [rolling, setRolling] = useState(false);
    const [timerActive, setTimerActive] = useState(false);
    const [timerPaused, setTimerPaused] = useState(false);
    const [timeLeft, setTimeLeft] = useState(0);
    const [isEditing, setIsEditing] = useState(false);
    const [activeRole, setActiveRole] = useState('wife');

    const [allOptions, setAllOptions] = useState([]);

    useEffect(() => {
        fetch(`${API_URL}/dice`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
            .then(res => res.json())
            .then(data => { if(Array.isArray(data)) setAllOptions(data); })
            .catch(console.error);
    }, []);

    useEffect(() => {
        const roleActs = allOptions.filter(d => d.type === 'act' && (d.role === activeRole || (!d.role && activeRole === 'wife'))); 
        const roleLocs = allOptions.filter(d => d.type === 'location' && (d.role === activeRole || (!d.role && activeRole === 'wife')));
        setActs(roleActs);
        setLocations(roleLocs);
    }, [allOptions, activeRole]);

    const generateTime = () => {
        const standard = [10, 15, 30, 45, 60];
        const pool = [...standard, ...standard, ...standard, '∞']; 
        return pool[Math.floor(Math.random() * pool.length)];
    };

    const handleRoll = () => {
        if (rolling) return;
        setRolling(true); setTimerActive(false); setTimerPaused(false); setResult({ act: '?', loc: '?', time: '?' }); 
        let steps = 0;
        const interval = setInterval(() => {
            const randomAct = acts.length ? acts[Math.floor(Math.random() * acts.length)].text : '?';
            const randomLoc = locations.length ? locations[Math.floor(Math.random() * locations.length)].text : '?';
            const randomTime = generateTime();
            setResult({ act: randomAct, loc: randomLoc, time: randomTime });
            steps++;
            if (steps > 20) { clearInterval(interval); setRolling(false); }
        }, 100);
    };

    const startTimer = () => { 
        if (result.time === '?' || result.time === '∞') return; 
        if (!timerActive) playSound('ting'); 
        if (!timerPaused && !timerActive) setTimeLeft(parseInt(result.time)); 
        setTimerActive(true); 
        setTimerPaused(false); 
    };
    
    const pauseTimer = () => { setTimerPaused(true); setTimerActive(false); };
    const stopTimer = () => { setTimerActive(false); setTimerPaused(false); setTimeLeft(0); };

    useEffect(() => {
        let interval = null;
        if (timerActive && !timerPaused && timeLeft > 0) interval = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
        else if (timerActive && timeLeft === 0) { playSound('end'); setTimerActive(false); }
        return () => clearInterval(interval);
    }, [timerActive, timerPaused, timeLeft]);

    if (isEditing) {
        return (
            <div className="p-4 pb-24 text-center h-full overflow-y-auto">
                <h2 className="text-gold text-2xl mb-4">Edit {activeRole === 'husband' ? "Husband's" : "Wife's"} Dice</h2>
                <div className="space-y-4 text-left">
                    <div><label className="text-white block mb-2">Actions (One per line)</label><textarea className="w-full bg-gray-900 border border-gold p-2 rounded h-32 text-white" defaultValue={acts.map(a => a.text).join('\n')} id="editActs"/></div>
                    <div><label className="text-white block mb-2">Locations (One per line)</label><textarea className="w-full bg-gray-900 border border-gold p-2 rounded h-32 text-white" defaultValue={locations.map(a => a.text).join('\n')} id="editLocs"/></div>
                    <div className="flex gap-4"><button onClick={() => setIsEditing(false)} className="flex-1 py-3 bg-gray-700 rounded text-white">Cancel</button><button onClick={async () => { const newActs = document.getElementById('editActs').value.split('\n').filter(Boolean).map(t => ({type:'act', text:t})); const newLocs = document.getElementById('editLocs').value.split('\n').filter(Boolean).map(t => ({type:'location', text:t})); await fetch(`${API_URL}/dice`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ items: [...newActs, ...newLocs], role: activeRole }) }); window.location.reload(); }} className="flex-1 py-3 bg-gold text-black font-bold rounded">Save</button></div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center justify-start h-full p-4 gap-6 w-full max-w-md mx-auto pt-4 overflow-y-auto">
            <div className="flex bg-gray-900 rounded-full p-1 mb-4 border border-gold/30">
                <button onClick={() => setActiveRole('wife')} className={`px-6 py-2 rounded-full transition ${activeRole === 'wife' ? 'bg-burgundy text-white font-bold' : 'text-gray-400'}`}>Wife's Turn</button>
                <button onClick={() => setActiveRole('husband')} className={`px-6 py-2 rounded-full transition ${activeRole === 'husband' ? 'bg-eggplant text-white font-bold' : 'text-gray-400'}`}>Husband's Turn</button>
            </div>
            <div className="flex flex-wrap gap-4 w-full justify-center">
                <div className="w-24 h-24 bg-burgundy rounded-xl border-4 border-gold flex items-center justify-center text-center p-1"><span className="text-white font-bold text-3xl leading-tight">{result.act}</span></div>
                <div className="w-24 h-24 bg-eggplant rounded-xl border-4 border-gold flex items-center justify-center text-center p-1"><span className="text-white font-bold text-3xl leading-tight">{result.loc}</span></div>
                <div className="w-24 h-24 bg-gray-900 rounded-xl border-4 border-gold flex items-center justify-center text-center p-1"><span className="text-white font-bold text-3xl">{result.time === '∞' ? '∞' : (result.time === '?' ? '?' : result.time + 's')}</span></div>
            </div>
            {(!rolling && result.act !== '?' && result.loc !== '?') && (<div className="bg-black/40 px-6 py-3 rounded-xl border border-gold/30 text-center animate-fadeIn w-full"><p className="text-white text-3xl font-caveat font-bold leading-relaxed"><span className="text-gold">{result.act}</span> your partner's <span className="text-gold">{result.loc}</span> {result.time === '∞' ? " until asked to stop." : ` for ${result.time} seconds.`}</p></div>)}
            
            {/* Active Timer Display - Separate from Dice */}
            {(timerActive || timerPaused) && (<div className="text-red-500 font-mono text-7xl font-bold animate-pulse my-4">{timeLeft}</div>)}
            
            <div className="h-20 flex items-center justify-center w-full gap-6">{!rolling && result.time !== '?' && result.time !== '∞' && (<>{timerActive ? (<button onClick={pauseTimer} className="w-16 h-16 rounded-full bg-yellow-600 flex items-center justify-center shadow-lg"><Pause fill="white" size={32} /></button>) : (<button onClick={startTimer} className="w-16 h-16 rounded-full bg-green-600 flex items-center justify-center shadow-lg animate-bounce"><Play fill="white" size={32} /></button>)}{(timerActive || timerPaused) && (<button onClick={stopTimer} className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg"><Square fill="white" size={28} /></button>)}</>)}</div>
            <button onClick={handleRoll} disabled={rolling || timerActive} className="px-12 py-4 bg-gold text-black font-black text-2xl rounded-full shadow-[0_0_20px_#FFD700] active:scale-95 transition disabled:opacity-50">ROLL</button>
            <button onClick={() => setIsEditing(true)} className="text-gray-500 flex items-center gap-2 mt-4"><Edit2 size={16} /> Edit Dice ({activeRole})</button>
        </div>
    );
};

const LocationUnlocks = () => {
    const [locations, setLocations] = useState([]);
    const [newLoc, setNewLoc] = useState("");
    const [menuTarget, setMenuTarget] = useState(null);
    const fetchLocs = () => { fetch(`${API_URL}/locations`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(res => res.json()).then(data => { if(Array.isArray(data)) setLocations(data); }).catch(console.error); };
    useEffect(() => { fetchLocs(); }, []);
    const toggleLoc = async (id) => { await fetch(`${API_URL}/locations/${id}/toggle`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ increment: true }) }); fetchLocs(); };
    const addLoc = async () => { if(!newLoc) return; const res = await fetch(`${API_URL}/locations`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ name: newLoc }) }); if(res.ok) { fetchLocs(); setNewLoc(""); } };
    const deleteLoc = async () => { if(!menuTarget) return; await fetch(`${API_URL}/locations/${menuTarget.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); setMenuTarget(null); fetchLocs(); };
    const resetLoc = async () => { if(!menuTarget) return; await fetch(`${API_URL}/locations/${menuTarget.id}/reset`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); setMenuTarget(null); fetchLocs(); };
    return (
        <div>
            <h2 className="text-gold text-3xl mb-6 flex items-center gap-2"><MapPin/> Locations</h2>
            <div className="grid grid-cols-1 gap-3 mb-6">{locations.map(loc => <LocationItem key={loc.id} loc={loc} onToggle={toggleLoc} onDeleteRequest={setMenuTarget} />)}</div>
            <div className="flex gap-2"><input className="flex-1 bg-black border border-gray-600 rounded p-3 text-white" placeholder="Add custom location..." value={newLoc} onChange={e => setNewLoc(e.target.value)} /><button onClick={addLoc} className="bg-gray-800 text-gold p-3 rounded hover:bg-gray-700"><Plus/></button></div>
            {menuTarget && (<div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"><div className="bg-gray-900 border border-burgundy p-6 rounded-xl w-64 text-center"><h3 className="text-white text-xl mb-4 truncate">{menuTarget.name}</h3><div className="flex flex-col gap-3"><button onClick={resetLoc} className="flex items-center justify-center gap-2 p-3 rounded bg-gray-800 hover:bg-gray-700 text-gold w-full"><RotateCcw size={18}/> Reset Count</button><button onClick={deleteLoc} className="flex items-center justify-center gap-2 p-3 rounded bg-red-900/50 hover:bg-red-900 text-white w-full"><Trash2 size={18}/> Delete</button><button onClick={() => setMenuTarget(null)} className="p-2 mt-2 rounded text-gray-400 hover:text-white text-sm">Cancel</button></div></div></div>)}
        </div>
    );
};

const FantasyJar = () => {
    const [wish, setWish] = useState("");
    const [pulled, setPulled] = useState(null);
    const [unpulledCount, setUnpulledCount] = useState(0); 
    const [history, setHistory] = useState([]);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const fetchData = () => {
        fetch(`${API_URL}/fantasies`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(res => res.json()).then(data => { if(Array.isArray(data)) setUnpulledCount(data.length); });
        fetch(`${API_URL}/fantasies/history`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(res => res.json()).then(data => { if(Array.isArray(data)) setHistory(data); });
    };
    useEffect(() => { fetchData(); }, []);
    const handleDrop = async () => { if(!wish.trim()) return; await fetch(`${API_URL}/fantasies`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ text: wish }) }); setWish(""); alert("Wish dropped in the jar! 🤫"); fetchData(); };
    const handlePull = async () => { const res = await fetch(`${API_URL}/fantasies/pull`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); const data = await res.json(); if(data.empty) { alert("The jar is empty! Add more fantasies."); } else { setPulled(data.text); fetchData(); } };
    const handleReturn = async (id) => { await fetch(`${API_URL}/fantasies/${id}/return`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); fetchData(); };
    const handleDelete = async () => { if (!deleteTarget) return; await fetch(`${API_URL}/fantasies/${deleteTarget.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); setDeleteTarget(null); fetchData(); };
    return (
        <div className="flex flex-col items-center justify-center gap-8">
            <h2 className="text-gold text-3xl font-caveat">The Fantasy Jar</h2>
            {pulled ? (<div className="bg-white/10 p-8 rounded-xl border-2 border-gold text-center animate-fadeIn w-full max-w-sm"><Sparkles className="text-gold mx-auto mb-4" size={40} /><p className="text-3xl text-white font-caveat">{pulled}</p><button onClick={() => setPulled(null)} className="mt-6 text-gray-400 text-sm underline">Put away</button></div>) : (<div onClick={handlePull} className="relative w-40 h-56 cursor-pointer group"><div className="absolute -top-2 left-1/2 -translate-x-1/2 w-32 h-6 bg-gold rounded-sm shadow-md z-20"></div><div className="w-full h-full bg-white/5 border-4 border-gray-600 rounded-b-[3rem] rounded-t-lg backdrop-blur-sm flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.5)] group-hover:border-gold transition-all relative overflow-hidden">{unpulledCount > 0 ? (<div className="absolute bottom-0 w-full h-3/4 flex flex-wrap content-end justify-center gap-1 p-2 opacity-70">{Array.from({length: Math.min(unpulledCount, 15)}).map((_, i) => (<div key={i} className="w-8 h-8 bg-white/20 border border-white/40 rotate-12 rounded-sm" style={{transform: `rotate(${Math.random()*90}deg)`}}></div>))}</div>) : (<span className="text-gray-600 font-bold">EMPTY</span>)}<span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gold font-caveat text-3xl drop-shadow-md z-10 whitespace-nowrap">Tap to Pull</span></div></div>)}
            <div className="w-full max-w-sm mt-4"><textarea className="w-full bg-black border border-gray-700 rounded p-4 text-white mb-2 focus:border-burgundy outline-none" placeholder="Whisper a fantasy..." value={wish} onChange={e => setWish(e.target.value)} /><button onClick={handleDrop} className="w-full bg-burgundy text-white py-3 rounded font-bold hover:bg-red-800 transition">Drop in Jar</button></div>
            {history.length > 0 && (<div className="w-full max-w-sm mt-8"><h3 className="text-gray-500 text-sm uppercase tracking-widest mb-4">Pulled Memories</h3><div className="space-y-3">{history.map(item => (<HistoryItem key={item.id} item={item} onReturn={handleReturn} onDeleteRequest={setDeleteTarget} />))}</div></div>)}
            {deleteTarget && (<div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"><div className="bg-gray-900 border border-burgundy p-6 rounded-xl w-64 text-center"><Trash2 size={40} className="mx-auto text-lipstick mb-4" /><h3 className="text-white text-xl mb-4">Delete Memory?</h3><div className="flex justify-center gap-4"><button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded bg-gray-700 text-white">Cancel</button><button onClick={handleDelete} className="px-4 py-2 rounded bg-lipstick text-white">Delete</button></div></div></div>)}
        </div>
    );
};

const Extras = () => { return ( <div className="p-4 pb-24 space-y-12"><LocationUnlocks /><div className="border-t border-gray-800"></div><FantasyJar /></div> ); };

const Home = () => {
  const [cards, setCards] = useState([]);
  const [sections, setSections] = useState([]);
  const [activeSection, setActiveSection] = useState(null); 
  const [selectedCard, setSelectedCard] = useState(null); 
  const [showHistory, setShowHistory] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [sectionMenu, setSectionMenu] = useState(null); 
  const [isCreatingSection, setIsCreatingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [renameText, setRenameText] = useState("");
  const [isRenamingSection, setIsRenamingSection] = useState(false);
  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [cardsRes, sectionsRes] = await Promise.all([
        fetch(`${API_URL}/cards`, { headers }),
        fetch(`${API_URL}/sections`, { headers })
      ]);
      if (cardsRes.ok && sectionsRes.ok) {
        const cardsData = await cardsRes.json();
        const sectionsData = await sectionsRes.json();
        if(Array.isArray(cardsData)) setCards(prev => {
            if(prev.length !== cardsData.length) return cardsData.sort(() => Math.random() - 0.5);
            return cardsData.map(c => { const old = prev.find(p => p.id === c.id); return old ? {...c} : c; });
        });
        if(Array.isArray(sectionsData)) setSections(sectionsData);
      }
    } catch (e) { console.error("Sync error", e); }
  };
  useEffect(() => { fetchData(); const interval = setInterval(fetchData, 5000); return () => clearInterval(interval); }, []);
  const handleUpload = async (e) => { const files = Array.from(e.target.files); if (files.length === 0) return; for (const file of files) { const formData = new FormData(); formData.append('file', file); if (activeSection) formData.append('section_id', activeSection); await fetch(`${API_URL}/cards`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, body: formData }); } fetchData(); };
  const handleCreateSection = async () => { if (!newSectionName.trim()) return; await fetch(`${API_URL}/sections`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ title: newSectionName }) }); setNewSectionName(""); setIsCreatingSection(false); fetchData(); };
  const handleRenameSection = async () => { if (!sectionMenu || !renameText.trim()) return; await fetch(`${API_URL}/sections/${sectionMenu.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ title: renameText }) }); setSectionMenu(null); setIsRenamingSection(false); fetchData(); };
  const handleDeleteSection = async () => { if (!sectionMenu) return; await fetch(`${API_URL}/sections/${sectionMenu.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); setSectionMenu(null); if (activeSection === sectionMenu.id) setActiveSection(null); fetchData(); };
  const handleReveal = async (id) => { await fetch(`${API_URL}/cards/${id}/scratch`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); setCards(prev => prev.map(c => c.id === id ? {...c, scratched_count: c.scratched_count + 1} : c)); };
  const handleDeleteCard = async () => { if (!deleteId) return; await fetch(`${API_URL}/cards/${deleteId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); setDeleteId(null); fetchData(); };
  const shuffleCards = () => { setCards([...cards].sort(() => Math.random() - 0.5)); };
  const filteredCards = cards.filter(c => { if (activeSection === null) return c.section_id == null; return c.section_id === activeSection; });
  return (
    <div className="pb-24 px-4 w-full">
      <div className="flex gap-2 overflow-x-auto p-2 pb-4 mb-4 no-scrollbar -mx-2">{sections.map(s => (<SectionTab key={s.id} section={s} activeSection={activeSection} setActiveSection={setActiveSection} onLongPress={(sec) => { setSectionMenu(sec); setRenameText(sec.title); setIsRenamingSection(false); }} />))}<button onClick={() => setIsCreatingSection(true)} className="px-3 py-2 rounded-full bg-gray-800 border border-gray-600 text-gold hover:bg-gray-700 flex items-center shrink-0"><Plus size={18} /></button></div>
      <div className="flex justify-between items-center mb-6 bg-black/40 p-4 rounded-xl backdrop-blur-sm border-b border-gold/20"><div className="flex gap-4"><button onClick={shuffleCards} className="flex items-center gap-2 text-gold hover:text-white"><Shuffle size={20}/> Shuffle</button></div><label className="flex items-center gap-2 bg-burgundy px-4 py-2 rounded-full cursor-pointer hover:bg-lipstick transition shadow-lg"><Upload size={18} className="text-white"/><span className="text-white text-sm font-bold">Add Cards</span><input type="file" className="hidden" accept="image/*" multiple onChange={handleUpload} /></label></div>
      {filteredCards.length === 0 ? (<div className="flex flex-col items-center justify-center mt-10 text-gray-500 gap-4"><Folder size={48} /><p>No cards in this section yet.</p></div>) : (<div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fadeIn">{filteredCards.map(card => (<CardItem key={card.id} card={card} onDeleteRequest={setDeleteId} onClick={setSelectedCard} />))}</div>)}
      {isCreatingSection && (<div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"><div className="bg-gray-900 border border-gold p-6 rounded-xl w-72"><h3 className="text-gold text-lg mb-4">New Section</h3><input autoFocus className="w-full p-2 bg-black border border-gray-600 rounded text-white mb-4" placeholder="Section Name" value={newSectionName} onChange={e => setNewSectionName(e.target.value)} /><div className="flex justify-end gap-2"><button onClick={() => setIsCreatingSection(false)} className="px-3 py-1 text-gray-400">Cancel</button><button onClick={handleCreateSection} className="px-4 py-2 bg-gold text-black rounded font-bold">Create</button></div></div></div>)}
      {sectionMenu && (<div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"><div className="bg-gray-900 border border-burgundy p-6 rounded-xl w-72 text-center shadow-2xl"><h3 className="text-gold text-xl mb-4 truncate">{sectionMenu.title}</h3>{isRenamingSection ? (<div className="space-y-4"><input autoFocus className="w-full p-2 bg-black border border-gold rounded text-white" value={renameText} onChange={(e) => setRenameText(e.target.value)} /><div className="flex justify-center gap-2"><button onClick={() => setIsRenamingSection(false)} className="px-3 py-2 rounded bg-gray-700 text-white text-sm">Cancel</button><button onClick={handleRenameSection} className="px-3 py-2 rounded bg-gold text-black text-sm font-bold">Save</button></div></div>) : (<div className="flex flex-col gap-3"><button onClick={() => setIsRenamingSection(true)} className="flex items-center justify-center gap-2 p-3 rounded bg-gray-800 hover:bg-gray-700 text-white w-full"><Edit2 size={18} /> Rename</button><button onClick={handleDeleteSection} className="flex items-center justify-center gap-2 p-3 rounded bg-red-900/50 hover:bg-red-900 text-white w-full"><Trash2 size={18} /> Delete</button><button onClick={() => setSectionMenu(null)} className="p-2 mt-2 rounded text-gray-400 hover:text-white text-sm">Cancel</button></div>)}</div></div>)}
      {selectedCard && (<div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"><div className="relative w-full max-w-sm h-[75vh] flex flex-col border-4 border-gold rounded-xl overflow-hidden shadow-[0_0_50px_rgba(255,215,0,0.3)] bg-black animate-fadeIn"><button onClick={() => setSelectedCard(null)} className="absolute top-2 right-2 z-30 bg-black/50 text-white p-2 rounded-full hover:bg-red-600 transition"><X size={24} /></button><div className="h-[80%] relative border-b-4 border-gold bg-black flex items-center justify-center">{showHistory ? (<HistoryList cardId={selectedCard.id} onClose={() => setShowHistory(false)}/>) : (<RevealCard id={selectedCard.id} image={selectedCard.filepath} onRevealComplete={() => handleReveal(selectedCard.id)} />)}</div><div className="h-[20%] bg-gradient-to-t from-black to-gray-900 flex flex-col items-center justify-center p-4"><button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-2 text-gold text-xl bg-white/5 px-6 py-2 rounded-full border border-gold/30 hover:bg-gold/20 transition active:scale-95"><Heart size={20} className={showHistory ? "text-gray-400" : "fill-lipstick text-lipstick"}/><span>{showHistory ? "Back to Card" : `Revealed ${cards.find(c => c.id === selectedCard.id)?.scratched_count || 0} times`}</span></button></div></div></div>)}
      {deleteId && (<div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"><div className="bg-gray-900 border border-burgundy p-6 rounded-xl w-64 text-center"><Trash2 size={40} className="mx-auto text-lipstick mb-4" /><h3 className="text-white text-xl mb-4">Delete this card?</h3><div className="flex justify-center gap-4"><button onClick={() => setDeleteId(null)} className="px-4 py-2 rounded bg-gray-700 text-white">Cancel</button><button onClick={handleDeleteCard} className="px-4 py-2 rounded bg-lipstick text-white">Delete</button></div></div></div>)}
    </div>
  );
};

const Settings = ({ user, logout }) => {
  const [form, setForm] = useState({ ...user, password: '' });
  const handleUpdate = async (e) => { e.preventDefault(); await fetch(`${API_URL}/user`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(form) }); alert('Profile Updated'); };
  return (<div className="p-6 text-gold pb-24"><h2 className="text-3xl mb-6">Profile Settings</h2><form onSubmit={handleUpdate} className="max-w-md mx-auto space-y-4"><div className="space-y-4 border-b border-gold/30 pb-6"><div><label>Display Name</label><input className="w-full p-2 bg-gray-800 rounded border border-burgundy" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div><div><label>Change Password (Optional)</label><input className="w-full p-2 bg-gray-800 rounded border border-burgundy" type="password" onChange={e => setForm({...form, password: e.target.value})} /></div></div><button className="w-full bg-gold text-black font-bold p-3 rounded hover:bg-yellow-600">Save Changes</button></form></div>);
};

const Notifications = () => {
  const [ntfy, setNtfy] = useState({ ntfy_url: '', ntfy_topic: '' });
  useEffect(() => { fetch(`${API_URL}/settings`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(res => res.json()).then(setNtfy).catch(console.error); }, []);
  const handleUpdate = async (e) => { e.preventDefault(); await fetch(`${API_URL}/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(ntfy) }); alert('Notification Settings Updated'); };
  const handleTestNtfy = async () => { const res = await fetch(`${API_URL}/settings/test`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(ntfy) }); if (res.ok) alert('Notification Sent! Check your device.'); else alert('Failed to send notification. Check URL/Topic.'); };
  return (<div className="p-6 text-gold pb-24"><h2 className="text-3xl mb-6">Notifications</h2><form onSubmit={handleUpdate} className="max-w-md mx-auto space-y-4"><div className="space-y-4 border-b border-gold/30 pb-6 relative"><div className="flex justify-between items-center"><h3 className="text-xl text-white/80 flex items-center gap-2"><Bell size={20}/> Ntfy Configuration</h3><button type="button" onClick={handleTestNtfy} className="flex items-center gap-1 bg-burgundy/80 hover:bg-burgundy px-3 py-1 rounded text-white text-sm"><Send size={14} /> Test</button></div><div><label>Server URL (e.g. https://ntfy.sh)</label><input className="w-full p-2 bg-gray-800 rounded border border-burgundy" value={ntfy.ntfy_url || ''} onChange={e => setNtfy({...ntfy, ntfy_url: e.target.value})} placeholder="https://ntfy.sh" /></div><div><label>Topic Name</label><input className="w-full p-2 bg-gray-800 rounded border border-burgundy" value={ntfy.ntfy_topic || ''} onChange={e => setNtfy({...ntfy, ntfy_topic: e.target.value})} placeholder="my_secret_couple_channel" /></div></div><button className="w-full bg-gold text-black font-bold p-3 rounded hover:bg-yellow-600">Save Changes</button></form></div>);
};

const Layout = ({ children, user, logout }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetInput, setResetInput] = useState("");
  const handleReload = async () => { if ('serviceWorker' in navigator) { const registrations = await navigator.serviceWorker.getRegistrations(); for (const registration of registrations) await registration.unregister(); } window.location.reload(true); };
  const handleResetSubmit = async () => { if (resetInput !== 'RESET') { alert("Please type 'RESET' exactly."); return; } if (resetStep === 1) { setResetStep(2); setResetInput(""); } else { await fetch(`${API_URL}/reset-app`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }); alert("App has been reset."); setShowResetModal(false); setResetStep(1); setResetInput(""); handleReload(); } };
  return (
    <div className="fixed inset-0 w-full h-full bg-black text-white font-caveat selection:bg-lipstick flex flex-col overflow-hidden">
      <header className="flex-none w-full bg-gradient-to-r from-eggplant to-black border-b border-gold/20 z-50 px-4 py-2 flex justify-between items-center shadow-lg"><div className="flex items-center gap-3"><img src="/apple-touch-icon.png" alt="Logo" className="w-10 h-10 rounded-full border border-gold shadow-md" /><div className="flex flex-col"><h1 className="text-2xl text-gold tracking-widest leading-none">Privy</h1><span className="text-xl text-gray-400 -mt-1">@{user?.username}</span></div></div><div className="flex items-center gap-4"><button onClick={handleReload} className="text-gold/80 hover:text-gold focus:outline-none active:rotate-180 transition-transform duration-500"><RefreshCw size={24} /></button><button onClick={() => setMenuOpen(!menuOpen)} className="text-gold focus:outline-none">{menuOpen ? <X size={28} /> : <div className="space-y-1"><div className="w-6 h-0.5 bg-gold"></div><div className="w-6 h-0.5 bg-gold"></div><div className="w-6 h-0.5 bg-gold"></div></div>}</button></div></header>
      {menuOpen && (<div className="absolute top-14 right-0 w-64 bg-gray-900 border-l border-gold/30 h-full z-50 p-4 shadow-2xl transform transition-transform"><div className="flex flex-col gap-4 text-xl"><Link to="/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-2 hover:bg-white/10 rounded text-gold"><User size={20}/> Profile</Link><Link to="/notifications" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-2 hover:bg-white/10 rounded text-gold"><Bell size={20}/> Notifications</Link><div className="my-2 border-t border-gray-700"></div><button onClick={() => { setShowResetModal(true); setMenuOpen(false); }} className="flex items-center gap-3 p-2 text-red-400 hover:bg-white/10 rounded"><RotateCcw size={20}/> Reset App</button><button onClick={logout} className="flex items-center gap-3 p-2 text-lipstick hover:bg-white/10 rounded"><LogOut size={20}/> Logout</button></div></div>)}
      <main className="flex-1 overflow-y-auto bg-gradient-to-b from-black via-eggplant/20 to-black relative w-full">{children}</main>
      <nav className="flex-none w-full bg-black/90 backdrop-blur-md border-t border-gold/20 flex justify-around pt-4 pb-8 z-50"><Link to="/" className={`flex flex-col items-center ${location.pathname === '/' ? 'text-lipstick' : 'text-gray-500'}`}><Layers size={24} /><span className="text-xs">Cards</span></Link><Link to="/spin" className={`flex flex-col items-center ${location.pathname === '/spin' ? 'text-lipstick' : 'text-gray-500'}`}><Aperture size={24} /><span className="text-xs">Spin</span></Link><Link to="/dice" className={`flex flex-col items-center ${location.pathname === '/dice' ? 'text-lipstick' : 'text-gray-500'}`}><Dices size={24} /><span className="text-xs">Dice</span></Link><Link to="/extras" className={`flex flex-col items-center ${location.pathname === '/extras' ? 'text-lipstick' : 'text-gray-500'}`}><Sparkles size={24} /><span className="text-xs">Extras</span></Link><Link to="/books" className={`flex flex-col items-center ${location.pathname === '/books' ? 'text-lipstick' : 'text-gray-500'}`}><Book size={24} /><span className="text-xs">Books</span></Link></nav>
      {showResetModal && (<div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"><div className="bg-gray-900 border border-red-500 p-6 rounded-xl w-80 text-center shadow-2xl"><AlertTriangle size={48} className="mx-auto text-red-500 mb-4" /><h3 className="text-white text-2xl mb-2 font-bold">App Reset</h3><p className="text-gray-400 text-sm mb-6">{resetStep === 1 ? "This will reset all scratch counts and history to zero. This cannot be undone." : "Are you really sure? This is your last chance."}</p><input className="w-full p-3 bg-black border border-gray-700 rounded text-white text-center tracking-widest mb-4 uppercase" placeholder="Type RESET" value={resetInput} onChange={e => setResetInput(e.target.value.toUpperCase())} /><div className="flex justify-center gap-4"><button onClick={() => { setShowResetModal(false); setResetStep(1); setResetInput(""); }} className="px-4 py-2 rounded bg-gray-700 text-white">Cancel</button><button onClick={handleResetSubmit} className={`px-4 py-2 rounded font-bold text-white ${resetInput === 'RESET' ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 cursor-not-allowed'}`} disabled={resetInput !== 'RESET'}>{resetStep === 1 ? "Next Step" : "CONFIRM RESET"}</button></div></div></div>)}
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  useEffect(() => { try { const saved = localStorage.getItem('user'); if (saved) setUser(JSON.parse(saved)); } catch (e) { localStorage.clear(); } }, []);
  const logout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); };
  return (<ErrorBoundary>{!user ? (<Auth setUser={setUser} />) : (<Router><Layout user={user} logout={logout}><Routes><Route path="/" element={<Home />} /><Route path="/spin" element={<Spin />} /><Route path="/dice" element={<DiceGame />} /><Route path="/extras" element={<Extras />} /><Route path="/books" element={<Books />} /><Route path="/settings" element={<Settings user={user} logout={logout} />} /><Route path="/notifications" element={<Notifications />} /></Routes></Layout></Router>)}</ErrorBoundary>);
}
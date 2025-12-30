import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, User, LogOut, Upload, Book, Layers, Shuffle, EyeOff, Heart, Maximize2, Clock, Calendar } from 'lucide-react';

// --- Theme Colors ---
// Primary: #800020 (Burgundy)
// Accent: #301934 (Deep Eggplant)
// Text: Gold/Neutral

const API_URL = '/api';

// --- Components ---

// 1. Scratch Card Component (Canvas Logic)
const ScratchCard = ({ image, id, onScratchComplete, isHidden }) => {
  const canvasRef = useRef(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [ctx, setCtx] = useState(null);

  useEffect(() => {
    if (isHidden) {
      resetCard();
    }
  }, [isHidden]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    setCtx(context);
    resetCard();
  }, [image]);

  const resetCard = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    
    // Ensure canvas is clean
    context.clearRect(0, 0, canvas.width, canvas.height);

    // Set Silver/Gold scratch layer
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#C0C0C0'; // Silver scratch color
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Pattern or Texture for scratch surface
    context.font = '30px Caveat';
    context.fillStyle = '#333';
    context.textAlign = "center";
    context.fillText("Scratch Me!", canvas.width / 2, canvas.height / 2);
    
    setIsRevealed(false);
  };

  const handleScratch = (e) => {
    // Critical: Prevent scrolling while scratching
    if (e.cancelable) e.preventDefault(); 
    if (e.stopPropagation) e.stopPropagation();

    if (isRevealed || !ctx) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if (e.changedTouches) {
       clientX = e.changedTouches[0].clientX;
       clientY = e.changedTouches[0].clientY;
    } else {
       clientX = e.clientX;
       clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2); // Increased brush size for better feel
    ctx.fill();

    checkReveal();
  };

  const checkReveal = () => {
    if (isRevealed) return;
    onScratchComplete(id);
    setIsRevealed(true); 
  };

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden shadow-2xl border-4 border-gold bg-white">
      {/* Background Image (Hidden behind canvas) */}
      <img src={image} alt="Secret" className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none" />
      
      {/* Scratch Canvas */}
      <canvas
        ref={canvasRef}
        width={320}
        height={480}
        className="absolute inset-0 cursor-pointer touch-none"
        style={{ touchAction: 'none' }} // Critical for mobile
        onMouseMove={(e) => e.buttons === 1 && handleScratch(e)}
        onTouchMove={(e) => handleScratch(e)}
        onMouseDown={handleScratch}
      />
    </div>
  );
};

// 2. History List Component
const HistoryList = ({ cardId, onClose }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const res = await fetch(`${API_URL}/cards/${cardId}/history`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        setHistory(await res.json());
      }
      setLoading(false);
    };
    fetchHistory();
  }, [cardId]);

  return (
    <div className="absolute inset-0 bg-gray-900 rounded-xl p-4 overflow-y-auto animate-fadeIn z-20">
       <div className="flex justify-between items-center mb-4 border-b border-gold/30 pb-2">
         <h3 className="text-gold text-xl flex items-center gap-2"><Clock size={18}/> History</h3>
         <button onClick={onClose}><X className="text-white" size={20}/></button>
       </div>
       {loading ? (
         <p className="text-gray-400">Loading...</p>
       ) : history.length === 0 ? (
         <p className="text-gray-400 text-center mt-10">No history yet.</p>
       ) : (
         <ul className="space-y-3">
           {history.map((h, i) => {
             const date = new Date(h.timestamp);
             return (
               <li key={i} className="bg-white/5 p-3 rounded flex items-center justify-between text-sm">
                 <span className="text-white flex items-center gap-2">
                   <Calendar size={14} className="text-burgundy"/> {date.toLocaleDateString()}
                 </span>
                 <span className="text-gold font-mono">
                   {date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                 </span>
               </li>
             )
           })}
         </ul>
       )}
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
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);
    } else if (data.success) {
      setIsLogin(true); // Switch to login after register
    } else {
      alert(data.error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-eggplant via-burgundy to-black text-gold font-caveat">
      <h1 className="text-6xl mb-8 drop-shadow-lg text-lipstick">{isLogin ? 'Privy Login' : 'Join Privy'}</h1>
      <form onSubmit={handleSubmit} className="bg-black/50 p-8 rounded-2xl border border-gold/30 backdrop-blur-md w-80">
        <input className="w-full p-3 mb-4 bg-gray-900 border border-burgundy rounded text-white" placeholder="Username" onChange={e => setForm({...form, username: e.target.value})} />
        <input className="w-full p-3 mb-4 bg-gray-900 border border-burgundy rounded text-white" type="password" placeholder="Password" onChange={e => setForm({...form, password: e.target.value})} />
        {!isLogin && (
          <>
            <input className="w-full p-3 mb-4 bg-gray-900 border border-burgundy rounded text-white" placeholder="Name" onChange={e => setForm({...form, name: e.target.value})} />
            <div className="flex gap-2 mb-4">
               <input className="w-1/2 p-3 bg-gray-900 border border-burgundy rounded text-white" type="number" placeholder="Age" onChange={e => setForm({...form, age: e.target.value})} />
               <select className="w-1/2 p-3 bg-gray-900 border border-burgundy rounded text-white" onChange={e => setForm({...form, gender: e.target.value})}>
                 <option value="">Gender</option>
                 <option value="Male">Male</option>
                 <option value="Female">Female</option>
                 <option value="Other">Other</option>
               </select>
            </div>
          </>
        )}
        <button className="w-full bg-lipstick hover:bg-red-700 text-white font-bold py-3 rounded shadow-lg transition transform hover:scale-105">
          {isLogin ? 'Enter' : 'Sign Up'}
        </button>
      </form>
      <p className="mt-4 cursor-pointer hover:text-white" onClick={() => setIsLogin(!isLogin)}>
        {isLogin ? "New here? Create Account" : "Have an account? Login"}
      </p>
    </div>
  );
};

const Home = () => {
  const [cards, setCards] = useState([]);
  const [hideTrigger, setHideTrigger] = useState(0);
  const [selectedCard, setSelectedCard] = useState(null); 
  const [showHistory, setShowHistory] = useState(false); // Toggle for history view

  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    const res = await fetch(`${API_URL}/cards`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    if (res.ok) setCards(await res.json());
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      await fetch(`${API_URL}/cards`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
    }
    fetchCards();
  };

  const handleScratch = async (id) => {
    await fetch(`${API_URL}/cards/${id}/scratch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    setCards(prev => prev.map(c => c.id === id ? {...c, scratched_count: c.scratched_count + 1} : c));
  };

  const shuffleCards = () => {
    setCards([...cards].sort(() => Math.random() - 0.5));
  };

  const openCard = (card) => {
    setSelectedCard(card);
    setShowHistory(false);
  };

  return (
    <div className="p-4 pb-20">
      {/* Controls */}
      <div className="flex justify-between items-center mb-6 bg-black/40 p-4 rounded-xl backdrop-blur-sm sticky top-20 z-10 border-b border-gold/20">
        <div className="flex gap-4">
          <button onClick={shuffleCards} className="flex items-center gap-2 text-gold hover:text-white"><Shuffle size={20}/> Shuffle</button>
          <button onClick={() => setHideTrigger(prev => prev + 1)} className="flex items-center gap-2 text-gold hover:text-white"><EyeOff size={20}/> Hide All</button>
        </div>
        <label className="flex items-center gap-2 bg-burgundy px-4 py-2 rounded-full cursor-pointer hover:bg-lipstick transition shadow-lg">
          <Upload size={18} className="text-white"/>
          <span className="text-white text-sm font-bold">Add Cards</span>
          <input type="file" className="hidden" accept="image/*" multiple onChange={handleUpload} />
        </label>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(card => (
          <div 
            key={card.id} 
            onClick={() => openCard(card)}
            className="aspect-[3/4] bg-gradient-to-br from-gray-800 to-black rounded-lg border-2 border-gold/50 hover:border-lipstick cursor-pointer flex flex-col items-center justify-center relative overflow-hidden transition transform hover:scale-105 shadow-lg"
          >
            <div className="absolute inset-0 bg-pattern opacity-20"></div>
            <Maximize2 className="text-gold mb-2" size={32} />
            <span className="text-gold font-caveat text-xl">Tap to Play</span>
          </div>
        ))}
      </div>

      {/* Modal Overlay */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
           <div className="relative w-full max-w-sm flex flex-col items-center animate-fadeIn">
              
              {/* Close Button */}
              <button 
                onClick={() => setSelectedCard(null)} 
                className="absolute -top-12 right-0 bg-white/10 p-2 rounded-full text-white hover:bg-white/30"
              >
                <X size={24} />
              </button>

              {/* The Game Card Container */}
              <div className="relative w-full aspect-[3/4]"> 
                 {showHistory ? (
                    <HistoryList cardId={selectedCard.id} onClose={() => setShowHistory(false)} />
                 ) : (
                    <ScratchCard 
                      id={selectedCard.id} 
                      image={selectedCard.filepath} 
                      onScratchComplete={() => handleScratch(selectedCard.id)}
                      isHidden={hideTrigger}
                    />
                 )}
              </div>

              {/* Stats - Clickable for History */}
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className="mt-6 flex items-center gap-2 text-gold text-xl bg-black/50 px-6 py-2 rounded-full border border-gold/30 hover:bg-white/10 transition"
              >
                <Heart size={20} className="fill-lipstick text-lipstick"/> 
                <span>
                    {showHistory ? "Back to Card" : `Revealed ${cards.find(c => c.id === selectedCard.id)?.scratched_count || 0} times`}
                </span>
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

const Books = () => {
  const [books, setBooks] = useState([]);

  useEffect(() => {
    const loadBooks = async () => {
      const res = await fetch(`${API_URL}/books`, {
         headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setBooks(await res.json());
    };
    loadBooks();
  }, []);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    for(const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        await fetch(`${API_URL}/books`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: formData
        });
    }
    window.location.reload();
  };

  return (
    <div className="p-6 pb-20">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl text-gold">Library</h2>
        <label className="flex items-center gap-2 bg-burgundy px-4 py-2 rounded-full cursor-pointer hover:bg-lipstick">
          <Upload size={18} className="text-white"/>
          <span className="text-white text-sm">Add Books (PDF)</span>
          <input type="file" className="hidden" accept="application/pdf" multiple onChange={handleUpload} />
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {books.map(book => (
          <a 
            key={book.id} 
            href={book.filepath} 
            target="_blank" 
            rel="noopener noreferrer" 
            download
            className="block group text-decoration-none"
          >
            <div className="bg-gray-900 border border-gold/20 p-6 rounded-lg group-hover:bg-gray-800 transition flex items-center gap-4 cursor-pointer shadow-md">
              <Book size={32} className="text-burgundy group-hover:text-lipstick transition-colors"/>
              <div className="overflow-hidden">
                <h3 className="text-xl text-white truncate w-full">{book.title}</h3>
                <p className="text-gray-500 text-sm group-hover:text-gold">Tap to open / download</p>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

const Settings = ({ user, logout }) => {
  const [form, setForm] = useState({ ...user, password: '' });

  const handleUpdate = async (e) => {
    e.preventDefault();
    await fetch(`${API_URL}/user`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}` 
      },
      body: JSON.stringify(form)
    });
    alert('Profile Updated');
  };

  return (
    <div className="p-6 text-gold">
      <h2 className="text-3xl mb-6">Settings</h2>
      <form onSubmit={handleUpdate} className="max-w-md mx-auto space-y-4">
        <div>
           <label>Display Name</label>
           <input className="w-full p-2 bg-gray-800 rounded border border-burgundy" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
        </div>
        <div>
           <label>Change Password (Optional)</label>
           <input className="w-full p-2 bg-gray-800 rounded border border-burgundy" type="password" onChange={e => setForm({...form, password: e.target.value})} />
        </div>
        <button className="w-full bg-gold text-black font-bold p-3 rounded hover:bg-yellow-600">Save Changes</button>
      </form>
      <button onClick={logout} className="w-full mt-8 bg-red-900 text-white font-bold p-3 rounded flex items-center justify-center gap-2">
        <LogOut size={18} /> Logout
      </button>
    </div>
  );
};

const Layout = ({ children, user, logout }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-black text-white font-caveat selection:bg-lipstick">
      {/* Top Bar */}
      <header className="fixed top-0 w-full bg-gradient-to-r from-eggplant to-black border-b border-gold/20 z-50 px-4 py-3 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-2">
          <img src="/apple-touch-icon.png" alt="Logo" className="w-8 h-8 rounded-full border border-gold shadow-md" />
          <h1 className="text-2xl text-gold tracking-widest">Privy</h1>
        </div>
        
        <button onClick={() => setMenuOpen(!menuOpen)} className="text-gold focus:outline-none">
          {menuOpen ? <X size={28} /> : <div className="space-y-1">
             <div className="w-6 h-0.5 bg-gold"></div>
             <div className="w-6 h-0.5 bg-gold"></div>
             <div className="w-6 h-0.5 bg-gold"></div>
          </div>}
        </button>
      </header>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="fixed top-14 right-0 w-64 bg-gray-900 border-l border-gold/30 h-full z-40 p-4 shadow-2xl transform transition-transform">
           <div className="flex flex-col gap-4 text-xl">
             <Link to="/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-2 hover:bg-white/10 rounded"><User size={20}/> Profile</Link>
             <button onClick={logout} className="flex items-center gap-3 p-2 text-lipstick hover:bg-white/10 rounded"><LogOut size={20}/> Logout</button>
           </div>
        </div>
      )}

      {/* Content */}
      <main className="pt-20 min-h-screen bg-gradient-to-b from-black via-eggplant/20 to-black">
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 w-full bg-black/90 backdrop-blur-md border-t border-gold/20 flex justify-around py-3 pb-safe z-50">
        <Link to="/" className={`flex flex-col items-center ${location.pathname === '/' ? 'text-lipstick' : 'text-gray-500'}`}>
          <Layers size={24} />
          <span className="text-xs">Cards</span>
        </Link>
        <Link to="/books" className={`flex flex-col items-center ${location.pathname === '/books' ? 'text-lipstick' : 'text-gray-500'}`}>
          <Book size={24} />
          <span className="text-xs">Books</span>
        </Link>
      </nav>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    const saved = localStorage.getItem('user');
    if (saved) setUser(JSON.parse(saved));
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (!user) return <Auth setUser={setUser} />;

  return (
    <Router>
      <Layout user={user} logout={logout}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/books" element={<Books />} />
          <Route path="/settings" element={<Settings user={user} logout={logout} />} />
        </Routes>
      </Layout>
    </Router>
  );
}
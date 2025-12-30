import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, User, LogOut, Upload, Book, Layers, Shuffle, Heart, Maximize2, Clock, Calendar, Trash2 } from 'lucide-react';

const API_URL = '/api';

// --- Hooks ---
const useLongPress = (callback = () => {}, ms = 800) => {
  const [startLongPress, setStartLongPress] = useState(false);

  useEffect(() => {
    let timerId;
    if (startLongPress) {
      timerId = setTimeout(callback, ms);
    } else {
      clearTimeout(timerId);
    }
    return () => clearTimeout(timerId);
  }, [startLongPress, callback, ms]);

  return {
    onMouseDown: () => setStartLongPress(true),
    onMouseUp: () => setStartLongPress(false),
    onMouseLeave: () => setStartLongPress(false),
    onTouchStart: () => setStartLongPress(true),
    onTouchEnd: () => setStartLongPress(false),
  };
};

// --- Components ---

// 1. Triple Tap Reveal Card (Replaces Double Tap)
const RevealCard = ({ image, id, onRevealComplete }) => {
  const [isRevealed, setIsRevealed] = useState(false);
  
  // Use refs for tap counting to avoid re-renders during rapid tapping
  const tapCount = useRef(0);
  const tapTimer = useRef(null);

  useEffect(() => {
    // Reset when image changes
    setIsRevealed(false);
    tapCount.current = 0;
  }, [image]);

  const handleInteraction = (e) => {
    // Clear the reset timer if it exists
    if (tapTimer.current) clearTimeout(tapTimer.current);

    tapCount.current += 1;

    // Check for Triple Tap (3 taps)
    if (tapCount.current === 3) {
      if (!isRevealed) {
        setIsRevealed(true);
        onRevealComplete(id);
      }
      tapCount.current = 0; // Reset after reveal
    } else {
      // Set a timer to reset the count if the next tap doesn't happen quickly (400ms window)
      tapTimer.current = setTimeout(() => {
        tapCount.current = 0;
      }, 400); 
    }
  };

  return (
    <div 
      className="relative w-full h-full bg-black select-none overflow-hidden flex items-center justify-center"
      onClick={handleInteraction}
    >
      {/* The Image (Fits to window) */}
      <img src={image} alt="Secret" className="max-w-full max-h-full object-contain pointer-events-none" />

      {/* The Chess Pattern Overlay */}
      {!isRevealed && (
        <div 
          className="absolute inset-0 z-10 flex items-center justify-center p-4"
          style={{
            // CSS Chess Board Pattern: Purple (#301934) and Black (#000)
            backgroundImage: `conic-gradient(#301934 0.25turn, #000 0.25turn 0.5turn, #301934 0.5turn 0.75turn, #000 0.75turn)`,
            backgroundSize: '50px 50px',
            backgroundPosition: 'top left'
          }}
        >
          <div className="bg-black/60 backdrop-blur-md px-6 py-3 rounded-2xl border-2 border-gold/50 shadow-[0_0_20px_rgba(255,215,0,0.3)] animate-pulse select-none pointer-events-none">
            <span className="text-gold font-caveat text-3xl drop-shadow-md">Triple Tap</span>
          </div>
        </div>
      )}
    </div>
  );
};

// 2. History List Component (Timezone Fixed)
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
    <div className="w-full h-full bg-gray-900 p-4 overflow-y-auto animate-fadeIn">
       <div className="flex justify-between items-center mb-4 border-b border-gold/30 pb-2">
         <h3 className="text-gold text-xl flex items-center gap-2"><Clock size={18}/> History</h3>
       </div>
       {loading ? (
         <p className="text-gray-400">Loading...</p>
       ) : history.length === 0 ? (
         <p className="text-gray-400 text-center mt-10">No history yet.</p>
       ) : (
         <ul className="space-y-3">
           {history.map((h, i) => {
             // Appending 'Z' forces JS to treat SQL string as UTC, then converts to local device time
             const date = new Date(h.timestamp + 'Z'); 
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

// 3. PDF Viewer Modal (Improved for Mobile)
const PDFViewer = ({ url, title, onClose }) => {
  return (
    <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col animate-fadeIn">
      <div className="flex justify-between items-center p-4 bg-gray-900 border-b border-gold/20 safe-top">
        <h3 className="text-gold text-xl truncate pr-4 max-w-[80%]">{title}</h3>
        <button onClick={onClose} className="p-2 bg-burgundy rounded-full text-white hover:bg-lipstick shadow-lg">
          <X size={24} />
        </button>
      </div>
      <div className="flex-1 w-full h-full bg-gray-800 flex items-center justify-center p-2 overflow-hidden">
        {/* Using <object> is generally better than iframe for mobile PDF embedding compliance */}
        <object 
          data={url} 
          type="application/pdf" 
          className="w-full h-full rounded-lg border border-gold/20"
        >
            <div className="text-white text-center flex flex-col items-center justify-center h-full gap-4">
                <p>Preview not supported on this device.</p>
                <a 
                  href={url} 
                  download 
                  className="bg-gold text-black font-bold py-2 px-6 rounded-full hover:bg-yellow-500 transition"
                >
                  Download PDF
                </a>
            </div>
        </object>
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
      setIsLogin(true); 
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
  const [selectedCard, setSelectedCard] = useState(null); 
  const [showHistory, setShowHistory] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    const res = await fetch(`${API_URL}/cards`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    if (res.ok) {
      const data = await res.json();
      // Auto-shuffle on load
      setCards(data.sort(() => Math.random() - 0.5));
    }
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

  const handleReveal = async (id) => {
    await fetch(`${API_URL}/cards/${id}/scratch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    setCards(prev => prev.map(c => c.id === id ? {...c, scratched_count: c.scratched_count + 1} : c));
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`${API_URL}/cards/${deleteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    setDeleteId(null);
    fetchCards();
  };

  const shuffleCards = () => {
    setCards([...cards].sort(() => Math.random() - 0.5));
  };

  const openCard = (card) => {
    setSelectedCard(card);
    setShowHistory(false);
  };

  // Card Item Component with Long Press
  const CardItem = ({ card }) => {
    const longPressProps = useLongPress(() => {
      setDeleteId(card.id);
    }, 800);

    return (
      <div 
        {...longPressProps}
        onClick={() => !deleteId && openCard(card)}
        className="aspect-[3/4] bg-gradient-to-br from-gray-800 to-black rounded-lg border-2 border-gold/50 hover:border-lipstick cursor-pointer flex flex-col items-center justify-center relative overflow-hidden transition transform hover:scale-105 shadow-lg select-none"
      >
        <div className="absolute inset-0 bg-pattern opacity-20"></div>
        <Maximize2 className="text-gold mb-2" size={32} />
        <span className="text-gold font-caveat text-xl">Tap to Play</span>
      </div>
    );
  };

  return (
    <div className="p-4 pb-20">
      {/* Controls */}
      <div className="flex justify-between items-center mb-6 bg-black/40 p-4 rounded-xl backdrop-blur-sm sticky top-20 z-10 border-b border-gold/20">
        <div className="flex gap-4">
          <button onClick={shuffleCards} className="flex items-center gap-2 text-gold hover:text-white"><Shuffle size={20}/> Shuffle</button>
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
          <CardItem key={card.id} card={card} />
        ))}
      </div>

      {/* New Golden Window Modal */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
           {/* The Vertical Rectangle Container */}
           <div className="relative w-full max-w-sm h-[75vh] flex flex-col border-4 border-gold rounded-xl overflow-hidden shadow-[0_0_50px_rgba(255,215,0,0.3)] bg-black animate-fadeIn">
              
              {/* Close Button */}
              <button 
                onClick={() => setSelectedCard(null)} 
                className="absolute top-2 right-2 z-30 bg-black/50 text-white p-2 rounded-full hover:bg-red-600 transition"
              >
                <X size={24} />
              </button>

              {/* Top 80%: Game Area */}
              <div className="h-[80%] relative border-b-4 border-gold bg-black flex items-center justify-center"> 
                 {showHistory ? (
                    <HistoryList cardId={selectedCard.id} />
                 ) : (
                    <RevealCard 
                      id={selectedCard.id} 
                      image={selectedCard.filepath} 
                      onRevealComplete={() => handleReveal(selectedCard.id)}
                    />
                 )}
              </div>

              {/* Bottom 20%: Stats & Controls */}
              <div className="h-[20%] bg-gradient-to-t from-black to-gray-900 flex flex-col items-center justify-center p-4">
                <button 
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex items-center gap-2 text-gold text-xl bg-white/5 px-6 py-2 rounded-full border border-gold/30 hover:bg-gold/20 transition active:scale-95"
                >
                  <Heart size={20} className={showHistory ? "text-gray-400" : "fill-lipstick text-lipstick"}/> 
                  <span>
                      {showHistory ? "Back to Card" : `Revealed ${cards.find(c => c.id === selectedCard.id)?.scratched_count || 0} times`}
                  </span>
                </button>
              </div>

           </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-burgundy p-6 rounded-xl w-64 text-center shadow-2xl">
            <Trash2 size={40} className="mx-auto text-lipstick mb-4" />
            <h3 className="text-white text-xl mb-4">Delete this card?</h3>
            <div className="flex justify-center gap-4">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 rounded bg-gray-700 text-white">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 rounded bg-lipstick text-white">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Books = () => {
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);

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
          <div 
            key={book.id} 
            onClick={() => setSelectedBook(book)}
            className="bg-gray-900 border border-gold/20 p-6 rounded-lg hover:bg-gray-800 transition flex items-center gap-4 cursor-pointer shadow-md group"
          >
            <Book size={32} className="text-burgundy group-hover:text-lipstick transition-colors"/>
            <div className="overflow-hidden">
              <h3 className="text-xl text-white truncate w-full">{book.title}</h3>
              <p className="text-gray-500 text-sm group-hover:text-gold">Tap to read</p>
            </div>
          </div>
        ))}
      </div>

      {selectedBook && (
        <PDFViewer 
          url={selectedBook.filepath} 
          title={selectedBook.title} 
          onClose={() => setSelectedBook(null)} 
        />
      )}
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
      <header className="fixed top-0 w-full bg-gradient-to-r from-eggplant to-black border-b border-gold/20 z-50 px-4 py-2 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-3">
          <img src="/apple-touch-icon.png" alt="Logo" className="w-10 h-10 rounded-full border border-gold shadow-md" />
          <div className="flex flex-col">
            <h1 className="text-2xl text-gold tracking-widest leading-none">Privy</h1>
            <span className="text-sm text-gray-400 font-sans">@{user?.username}</span>
          </div>
        </div>
        
        <button onClick={() => setMenuOpen(!menuOpen)} className="text-gold focus:outline-none">
          {menuOpen ? <X size={28} /> : <div className="space-y-1">
             <div className="w-6 h-0.5 bg-gold"></div>
             <div className="w-6 h-0.5 bg-gold"></div>
             <div className="w-6 h-0.5 bg-gold"></div>
          </div>}
        </button>
      </header>
      {menuOpen && (
        <div className="fixed top-14 right-0 w-64 bg-gray-900 border-l border-gold/30 h-full z-40 p-4 shadow-2xl transform transition-transform">
           <div className="flex flex-col gap-4 text-xl">
             <Link to="/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 p-2 hover:bg-white/10 rounded"><User size={20}/> Profile</Link>
             <button onClick={logout} className="flex items-center gap-3 p-2 text-lipstick hover:bg-white/10 rounded"><LogOut size={20}/> Logout</button>
           </div>
        </div>
      )}
      <main className="pt-20 min-h-screen bg-gradient-to-b from-black via-eggplant/20 to-black">
        {children}
      </main>
      
      {/* Bottom Nav - Adjusted for iPhone (pb-safe + extra padding) */}
      <nav className="fixed bottom-0 w-full bg-black/90 backdrop-blur-md border-t border-gold/20 flex justify-around py-4 pb-safe z-50">
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
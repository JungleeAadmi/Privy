import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { 
  Lock, 
  Unlock, 
  Plus, 
  Search, 
  Calendar, 
  Trash2, 
  Edit2, 
  Save, 
  X, 
  ChevronLeft, 
  Settings, 
  LogOut,
  Moon,
  Sun,
  Book,
  MoreVertical,
  Shield
} from 'lucide-react';

// --- Firebase Configuration & Initialization ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Utility Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', icon: Icon, disabled = false }) => {
  const baseStyle = "flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg active:scale-95",
    secondary: "bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-sm active:scale-95",
    danger: "bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 active:scale-95",
    ghost: "bg-transparent hover:bg-gray-100 text-gray-600 hover:text-gray-900",
    dark: "bg-slate-800 text-white hover:bg-slate-700 shadow-md"
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${className}`}
    >
      {Icon && <Icon size={18} className={children ? "mr-2" : ""} />}
      {children}
    </button>
  );
};

const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-full min-h-[200px]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
  </div>
);

// --- PIN Screen Component ---
const PinScreen = ({ mode, onSuccess, onCancel, existingPin = null, title, subTitle }) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState(mode === 'setup' ? 'create' : 'enter'); // 'create', 'confirm', 'enter'

  const handlePress = (num) => {
    setError('');
    if (pin.length < 4) {
      setPin(prev => prev + num);
    }
  };

  const handleDelete = () => {
    setError('');
    setPin(prev => prev.slice(0, -1));
  };

  useEffect(() => {
    if (pin.length === 4) {
      handleComplete(pin);
    }
  }, [pin]);

  const handleComplete = (inputPin) => {
    if (mode === 'verify' || mode === 'unlock') {
      if (inputPin === existingPin) {
        onSuccess(inputPin);
      } else {
        setError('Incorrect PIN');
        setPin('');
      }
    } else if (mode === 'setup') {
      if (step === 'create') {
        setConfirmPin(inputPin);
        setPin('');
        setStep('confirm');
      } else if (step === 'confirm') {
        if (inputPin === confirmPin) {
          onSuccess(inputPin);
        } else {
          setError('PINs do not match. Try again.');
          setPin('');
          setStep('create');
          setConfirmPin('');
        }
      }
    }
  };

  const getTitle = () => {
    if (title) return title;
    if (mode === 'unlock') return 'Locked';
    if (mode === 'verify') return 'Enter PIN';
    if (step === 'create') return 'Create PIN';
    if (step === 'confirm') return 'Confirm PIN';
    return 'Security';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] w-full max-w-sm mx-auto p-6 animate-fade-in">
      <div className="mb-8 text-center">
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock size={32} className="text-indigo-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800">{getTitle()}</h2>
        <p className="text-gray-500 mt-2 text-sm">
          {subTitle || (error ? <span className="text-red-500 font-medium">{error}</span> : "Enter your 4-digit passcode")}
        </p>
      </div>

      <div className="flex gap-4 mb-8">
        {[0, 1, 2, 3].map(i => (
          <div 
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
              pin.length > i 
                ? 'bg-indigo-600 border-indigo-600 scale-110' 
                : 'border-gray-300 bg-transparent'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 w-full max-w-[280px]">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
          <button
            key={num}
            onClick={() => handlePress(num)}
            className="h-16 w-16 rounded-full text-2xl font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors focus:outline-none"
          >
            {num}
          </button>
        ))}
        <div className="flex items-center justify-center">
          {onCancel && (
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
              Cancel
            </button>
          )}
        </div>
        <button
          onClick={() => handlePress(0)}
          className="h-16 w-16 rounded-full text-2xl font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors focus:outline-none"
        >
          0
        </button>
        <button
          onClick={handleDelete}
          className="h-16 w-16 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none"
        >
          <ChevronLeft size={24} />
        </button>
      </div>
    </div>
  );
};

// --- Main Journal App Component ---
const JournalApp = ({ user, logout }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list', 'create', 'edit', 'settings', 'locked'
  const [activeEntry, setActiveEntry] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [settings, setSettings] = useState({ pin: null, theme: 'light' });
  const [isLocked, setIsLocked] = useState(true);
  
  // Fetch Settings & Entries
  useEffect(() => {
    if (!user) return;

    // Listen to settings
    const settingsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'config');
    const unsubSettings = onSnapshot(settingsRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setSettings(data);
        // If no PIN is set, unlock automatically
        if (!data.pin) setIsLocked(false);
      } else {
        // Init default settings
        setSettings({ pin: null, theme: 'light' });
        setIsLocked(false);
      }
    }, (err) => console.error("Settings listener error:", err));

    // Listen to entries
    const entriesQuery = query(
      collection(db, 'artifacts', appId, 'users', user.uid, 'entries'),
      orderBy('createdAt', 'desc')
    );

    const unsubEntries = onSnapshot(entriesQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Convert timestamp to Date object safely
        createdAt: doc.data().createdAt?.toDate() || new Date()
      }));
      setEntries(data);
      setLoading(false);
    }, (err) => console.error("Entries listener error:", err));

    return () => {
      unsubSettings();
      unsubEntries();
    };
  }, [user]);

  // Actions
  const handleCreateEntry = async (entryData) => {
    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'entries'), {
        ...entryData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setView('list');
    } catch (err) {
      console.error("Error creating entry:", err);
    }
  };

  const handleUpdateEntry = async (id, entryData) => {
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'entries', id), {
        ...entryData,
        updatedAt: serverTimestamp()
      });
      setView('list');
      setActiveEntry(null);
    } catch (err) {
      console.error("Error updating entry:", err);
    }
  };

  const handleDeleteEntry = async (id) => {
    if (window.confirm("Are you sure you want to delete this entry?")) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'entries', id));
        if (activeEntry?.id === id) {
          setView('list');
          setActiveEntry(null);
        }
      } catch (err) {
        console.error("Error deleting entry:", err);
      }
    }
  };

  const updatePin = async (newPin) => {
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'config'), {
        ...settings,
        pin: newPin
      }, { merge: true });
    } catch (err) {
      console.error("Error updating PIN:", err);
    }
  };

  const filteredEntries = entries.filter(entry => 
    entry.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    entry.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Render Logic
  if (loading) return <LoadingSpinner />;

  // Locked View
  if (isLocked && settings.pin) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
          <PinScreen 
            mode="unlock"
            existingPin={settings.pin}
            onSuccess={() => setIsLocked(false)}
            subTitle="Your journal is secured"
          />
        </div>
      </div>
    );
  }

  // Settings View (Update PIN)
  if (view === 'settings') {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto">
          <header className="mb-6 flex items-center gap-4">
            <Button variant="ghost" onClick={() => setView('list')} icon={ChevronLeft}>Back</Button>
            <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
          </header>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                <Shield size={20} className="text-indigo-600"/> Security
              </h3>
              
              {!settings.pin ? (
                <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
                  <h4 className="font-semibold text-indigo-900 mb-2">Set a Passcode</h4>
                  <p className="text-indigo-700 text-sm mb-4">Protect your journal entries from prying eyes.</p>
                  <div className="bg-white p-4 rounded-xl shadow-sm">
                    <PinScreen 
                      mode="setup" 
                      onSuccess={(pin) => updatePin(pin)}
                      title="Create Passcode"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h4 className="font-medium text-gray-900">Passcode Protection</h4>
                    <p className="text-sm text-gray-500">Your journal is currently locked with a 4-digit PIN.</p>
                  </div>
                  <Button 
                    variant="danger" 
                    onClick={() => {
                      if (window.confirm("Remove passcode protection?")) {
                        updatePin(null);
                      }
                    }}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>

            <div className="p-6 bg-gray-50">
               <div className="flex justify-between items-center">
                 <div>
                   <h4 className="font-medium text-gray-900">Account</h4>
                   <p className="text-sm text-gray-500">User ID: {user.uid.slice(0, 8)}...</p>
                 </div>
                 <Button variant="secondary" icon={LogOut} onClick={logout}>Sign Out</Button>
               </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Create/Edit View
  if (view === 'create' || view === 'edit') {
    return (
      <EntryEditor 
        initialData={activeEntry}
        mode={view}
        onSave={(data) => view === 'create' ? handleCreateEntry(data) : handleUpdateEntry(activeEntry.id, data)}
        onCancel={() => {
          setView('list');
          setActiveEntry(null);
        }}
        onDelete={view === 'edit' ? () => handleDeleteEntry(activeEntry.id) : null}
      />
    );
  }

  // List View (Default)
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2 rounded-lg text-white">
                <Book size={24} />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">My Journal</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setView('settings')} className="p-2 rounded-full">
                <Settings size={20} />
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search entries..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              />
            </div>
            <Button 
              variant="primary" 
              icon={Plus} 
              onClick={() => {
                setActiveEntry(null);
                setView('create');
              }}
            >
              New
            </Button>
          </div>
        </div>
      </header>

      {/* Entry List */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-6">
        {filteredEntries.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Book size={40} className="text-gray-300" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No entries found</h3>
            <p className="text-gray-500 mt-1">Start writing your thoughts today.</p>
            <div className="mt-6">
              <Button variant="primary" icon={Plus} onClick={() => setView('create')}>Create First Entry</Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredEntries.map(entry => (
              <EntryCard 
                key={entry.id} 
                entry={entry} 
                onClick={() => {
                  setActiveEntry(entry);
                  setView('edit');
                }} 
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

const EntryCard = ({ entry, onClick }) => {
  const date = entry.createdAt;
  const moods = {
    happy: '😊',
    neutral: '😐',
    sad: '😔',
    excited: '🤩',
    anxious: '😰',
    calm: '😌'
  };

  return (
    <div 
      onClick={onClick}
      className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer group flex flex-col h-[200px]"
    >
      <div className="flex justify-between items-start mb-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
        {entry.mood && <span className="text-xl" title={entry.mood}>{moods[entry.mood]}</span>}
      </div>
      
      <h3 className="font-bold text-gray-900 mb-2 line-clamp-1 group-hover:text-indigo-600 transition-colors">
        {entry.title || "Untitled Entry"}
      </h3>
      
      <p className="text-gray-500 text-sm line-clamp-4 leading-relaxed flex-1">
        {entry.content}
      </p>
    </div>
  );
};

const EntryEditor = ({ initialData, mode, onSave, onCancel, onDelete }) => {
  const [title, setTitle] = useState(initialData?.title || '');
  const [content, setContent] = useState(initialData?.content || '');
  const [mood, setMood] = useState(initialData?.mood || '');
  
  const moods = [
    { id: 'happy', icon: '😊', label: 'Happy' },
    { id: 'excited', icon: '🤩', label: 'Excited' },
    { id: 'calm', icon: '😌', label: 'Calm' },
    { id: 'neutral', icon: '😐', label: 'Neutral' },
    { id: 'anxious', icon: '😰', label: 'Anxious' },
    { id: 'sad', icon: '😔', label: 'Sad' },
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    onSave({ title, content, mood });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        {/* Editor Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-20">
          <div className="flex justify-between items-center">
            <Button type="button" variant="ghost" onClick={onCancel} icon={ChevronLeft}>
              Back
            </Button>
            <div className="flex gap-2">
              {mode === 'edit' && (
                <Button type="button" variant="danger" onClick={onDelete} icon={Trash2} className="!p-2">
                </Button>
              )}
              <Button type="submit" variant="primary" icon={Save} disabled={!content.trim()}>
                Save
              </Button>
            </div>
          </div>
        </div>

        {/* Editor Body */}
        <div className="flex-1 p-4 sm:p-6 space-y-6">
          <input
            type="text"
            placeholder="Entry Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-3xl font-bold text-gray-900 placeholder-gray-300 border-none bg-transparent focus:ring-0 px-0"
          />

          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {moods.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMood(m.id === mood ? '' : m.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  mood === m.id 
                    ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500 ring-offset-1' 
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span>{m.icon}</span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          <textarea
            placeholder="What's on your mind?..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-[calc(100vh-300px)] resize-none text-lg text-gray-700 leading-relaxed placeholder-gray-300 border-none bg-transparent focus:ring-0 px-0"
          />
        </div>
      </form>
    </div>
  );
};

// --- Auth Component ---
const AuthScreen = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    setLoading(true);
    try {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    } catch (error) {
      console.error("Auth error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
        <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg rotate-3">
          <Book size={40} className="text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Secure Journal</h1>
        <p className="text-gray-500 mb-8">Your private thoughts, safe and sound.</p>
        
        <Button 
          onClick={handleAuth} 
          disabled={loading}
          className="w-full py-3 text-lg"
        >
          {loading ? 'Accessing...' : 'Open Journal'}
        </Button>
        <p className="text-xs text-gray-400 mt-6">
          By entering, you agree to keep your thoughts private.
        </p>
      </div>
    </div>
  );
};

// --- App Container ---
export default function App() {
  const [user, setUser] = useState(null);
  const [init, setInit] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        try {
          await signInWithCustomToken(auth, __initial_auth_token);
        } catch (e) {
          console.error("Custom token auth failed", e);
        }
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setInit(false);
    });
    return () => unsubscribe();
  }, []);

  if (init) return <LoadingSpinner />;

  return user ? (
    <JournalApp user={user} logout={() => signOut(auth)} /> 
  ) : ( 
    <AuthScreen /> 
  );
}
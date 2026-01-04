import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, User, LogOut, Upload, Book, Layers, Shuffle, Heart, Maximize2, Clock, Calendar, Trash2, Edit2, Plus, Folder, RefreshCw, Bell, Send, Aperture, RotateCcw, AlertTriangle, Scissors, Dices, MapPin, Sparkles, Timer, Play, Pause, CheckCircle, RotateCw, Square, Zap, Shirt, Shield, Download, Grid, ChevronLeft, ChevronRight } from 'lucide-react';

const API_URL = '/api';
const safeFetch = async (url, opts={}) => { try { const r=await fetch(url,opts); return r.headers.get("content-type")?.includes("json") ? await r.json() : null; } catch(e){ return null; } };

// Components
const ErrorBoundary = class extends React.Component {
  constructor(p){super(p);this.state={e:false}} static getDerivedStateFromError(){return{e:true}}
  render(){ return this.state.e ? <div className="h-screen flex flex-col items-center justify-center bg-gray-900 text-red-500"><AlertTriangle size={64}/><h1 className="text-3xl">Crashed</h1><button onClick={()=>{localStorage.clear();window.location.reload()}} className="mt-4 bg-white text-black px-4 py-2 rounded">Reset</button></div> : this.props.children; }
};
const useLongPress = (cb, ms=800) => {
  const [s, setS] = useState(false); useEffect(()=>{ let t; if(s) t=setTimeout(cb,ms); return ()=>clearTimeout(t); },[s,cb,ms]);
  return { onMouseDown:()=>setS(true), onMouseUp:()=>setS(false), onMouseLeave:()=>setS(false), onTouchStart:()=>setS(true), onTouchEnd:()=>setS(false) };
};
const playSound = (t) => {
    try { const c = new (window.AudioContext||window.webkitAudioContext)(); if(c.state==='suspended') c.resume();
    const o=c.createOscillator(), g=c.createGain(); o.connect(g); g.connect(c.destination);
    if(t==='ting'){ o.frequency.value=800; g.gain.value=0.5; o.start(); o.stop(c.currentTime+0.5); }
    else { [0,0.2,0.4].forEach(x=>{ const o2=c.createOscillator(), g2=c.createGain(); o2.connect(g2); g2.connect(c.destination); o2.type='square'; o2.frequency.value=600; g2.gain.value=0.2; o2.start(c.currentTime+x); o2.stop(c.currentTime+x+0.1); }); }
    } catch(e){}
};

// Sub-Components
const RevealCard = ({ image, id, onRevealComplete }) => {
  const [rev, setRev] = useState(false); const tap=useRef(0); const tm=useRef(null);
  const click = () => { clearTimeout(tm.current); tap.current++; if(tap.current===3){ if(!rev){ setRev(true); onRevealComplete(id); } tap.current=0; } else tm.current=setTimeout(()=>tap.current=0,400); };
  return <div className="relative w-full h-full bg-black flex items-center justify-center" onClick={click}><img src={image} className="max-w-full max-h-full object-contain pointer-events-none"/>{!rev && <div className="absolute inset-0 bg-black/90 flex items-center justify-center"><span className="border-2 border-gold text-gold p-4 rounded-xl font-bold animate-pulse">Triple Tap</span></div>}</div>;
};
const History = ({ id, close }) => {
  const [h, setH] = useState([]); useEffect(()=>{ safeFetch(`${API_URL}/cards/${id}/history`,{headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}}).then(d=>Array.isArray(d)&&setH(d)); },[id]);
  return <div className="w-full h-full bg-gray-900 p-4 overflow-y-auto"><div className="flex justify-between mb-4 text-gold text-xl"><h3>History</h3><button onClick={close}><X/></button></div>{h.map((x,i)=><div key={i} className="bg-white/5 p-2 mb-2 rounded text-white text-sm flex justify-between"><span>{new Date(x.timestamp).toLocaleDateString()}</span><span>{new Date(x.timestamp).toLocaleTimeString()}</span></div>)}</div>;
};
const PDFView = ({ url, title, id, close }) => {
  const [load, setLoad] = useState(false);
  const ext = async () => { if(confirm("Extract images?")){ setLoad(true); const r=await safeFetch(`${API_URL}/books/${id}/extract`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}}); setLoad(false); alert(r?.success?"Done":"Failed"); }};
  return <div className="fixed inset-0 z-50 bg-black flex flex-col"><div className="flex justify-between p-4 bg-gray-900 text-gold"><span className="truncate w-2/3">{title}</span><div className="flex gap-4"><button onClick={ext} disabled={load}><RefreshCw className={load?"animate-spin":""}/></button><button onClick={close}><X/></button></div></div><div className="flex-1 flex items-center justify-center"><object data={url} className="w-full h-full" type="application/pdf"><a href={url} className="text-white underline">Download PDF</a></object></div></div>;
};
const Section = ({ s, active, set, onL }) => (<button {...useLongPress(()=>onL&&onL(s))} onClick={()=>set(active===s.id?null:s.id)} className={`px-4 py-2 rounded-full border whitespace-nowrap ${active===s.id?'bg-burgundy text-white':'text-gray-400 border-gray-600'}`}>{s.title}</button>);
const Header = ({ h, active, set, onL }) => (<button {...useLongPress(()=>onL&&onL(h))} onClick={()=>set(active===h.id?null:h.id)} className={`px-4 py-2 rounded-full border whitespace-nowrap ${active===h.id?'bg-eggplant text-white':'text-gray-400 border-gray-600'}`}>{h.title}</button>);

const CycleTracker = () => {
    const [dt, setDt] = useState(new Date()); // Viewing date
    const [cfg, setCfg] = useState({s:null, c:28, p:5});
    const [notes, setNotes] = useState([]);
    const [sel, setSel] = useState(null); // Selected date string YYYY-MM-DD
    const [noteTxt, setNoteTxt] = useState("");

    const load = async () => {
        const h = {Authorization:`Bearer ${localStorage.getItem('token')}`};
        const s = await safeFetch(`${API_URL}/settings`,{headers:h});
        const n = await safeFetch(`${API_URL}/calendar`,{headers:h});
        if(s) setCfg({s:s.cycle_start?new Date(s.cycle_start):null, c:parseInt(s.cycle_len)||28, p:parseInt(s.period_len)||5});
        if(Array.isArray(n)) setNotes(n);
    };
    useEffect(()=>{load()},[]);

    const getStatus = (d) => {
        if(!cfg.s) return null;
        const diff = Math.floor((d - cfg.s)/(1000*60*60*24));
        const dayInCycle = ((diff % cfg.c) + cfg.c) % cfg.c; // Handle negative
        if(dayInCycle < cfg.p) return 'bg-red-900'; // Period
        const ovul = cfg.c - 14;
        if(dayInCycle >= ovul-5 && dayInCycle <= ovul) return 'bg-green-800'; // Fertile
        return '';
    };

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
                    const st = getStatus(d);
                    return <div key={i} onClick={()=>setSel(ds)} className={`aspect-square flex flex-col items-center justify-center rounded-lg relative cursor-pointer ${sel===ds?'border border-gold':''} ${st||'bg-gray-800'}`}>
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
            <div className="mt-4 flex gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1"><div className="w-3 h-3 bg-red-900 rounded-full"></div> Period</span>
                <span className="flex items-center gap-1"><div className="w-3 h-3 bg-green-800 rounded-full"></div> Fertile</span>
            </div>
        </div>
    );
};

// Pages
const Auth = ({ setUser }) => {
  const [login, setLogin] = useState(true); const [f, setF] = useState({});
  const sub = async (e) => { e.preventDefault(); const r=await safeFetch(`${API_URL}/${login?'login':'register'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(f)}); if(r?.token){localStorage.setItem('token',r.token);localStorage.setItem('user',JSON.stringify(r.user));setUser(r.user);}else alert(r?.error||'Error'); };
  return <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-eggplant to-black text-gold p-6"><h1 className="text-5xl mb-8 font-caveat">{login?'Privy':'Join'}</h1><form onSubmit={sub} className="w-full max-w-sm space-y-4"><input className="w-full p-2 bg-black border border-gold rounded text-white" placeholder="Username" onChange={e=>setF({...f,username:e.target.value})}/><input className="w-full p-2 bg-black border border-gold rounded text-white" type="password" placeholder="Password" onChange={e=>setF({...f,password:e.target.value})}/>{!login && <input className="w-full p-2 bg-black border border-gold rounded text-white" placeholder="Name" onChange={e=>setF({...f,name:e.target.value})}/>}<button className="w-full bg-red-800 text-white py-2 rounded font-bold">{login?'Enter':'Sign Up'}</button></form><button onClick={()=>setLogin(!login)} className="mt-4 text-sm underline">{login?"Create Account":"Login"}</button></div>;
};

const Gallery = ({ title, endpoint, icon }) => {
    const [items, setI] = useState([]); const [win, setW] = useState(null); const [draw, setD] = useState(false); const [edit, setE] = useState(false); const [del, setDel] = useState(null);
    const load = useCallback(() => safeFetch(`${API_URL}/${endpoint}`,{headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}}).then(d=>Array.isArray(d)&&setI(d)), [endpoint]);
    useEffect(()=>{load()},[load]);
    const up = async (e) => { for(const f of e.target.files){const fd=new FormData();fd.append('file',f);await safeFetch(`${API_URL}/${endpoint}`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem('token')}`},body:fd});} load(); };
    const roll = () => { if(!items.length)return; setD(true); let c=0; const i=setInterval(()=>{ setW(items[Math.floor(Math.random()*items.length)]); c++; if(c>20){clearInterval(i); setD(false); const fin=items[Math.floor(Math.random()*items.length)]; setW(fin); safeFetch(`${API_URL}/${endpoint}/${fin.id}/draw`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}}); }},100); };
    return <div className="p-4 flex flex-col items-center min-h-screen"><h2 className="text-gold text-2xl mb-6 flex items-center gap-2 w-full">{icon} {title}</h2>
    {win ? <div className="relative w-full max-w-sm aspect-square border-4 border-gold rounded-xl overflow-hidden mb-6"><img src={win.filepath} className="w-full h-full object-cover"/>{!draw&&<button onClick={()=>setW(null)} className="absolute top-2 right-2 bg-black text-white p-2 rounded-full"><X/></button>}</div> 
    : <button onClick={roll} disabled={draw||!items.length} className="w-full max-w-sm aspect-video bg-gray-800 border-2 border-dashed border-gray-600 rounded-xl flex flex-col items-center justify-center text-gray-400 mb-6">{draw?<RefreshCw className="animate-spin"/>:<Shuffle size={40}/>}<span className="mt-2 font-bold">{items.length>0?"TAP TO DRAW":"Empty Collection"}</span></button>}
    <div className="w-full flex justify-end mb-4"><button onClick={()=>setE(!edit)} className="border border-gold text-gold px-4 py-1 rounded-full text-sm">{edit?'Done':'Manage'}</button></div>
    {edit && <div className="w-full grid grid-cols-3 gap-2"><label className="aspect-square bg-gray-800 border-2 border-dashed rounded flex flex-col items-center justify-center cursor-pointer"><Plus className="text-gray-400"/><input type="file" hidden multiple accept="image/*" onChange={up}/></label>{items.map(i=><div key={i.id} {...useLongPress(()=>setDel(i.id))} className="aspect-square bg-gray-900 rounded overflow-hidden"><img src={i.filepath} className="w-full h-full object-cover"/></div>)}</div>}
    {del && <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"><div className="bg-gray-800 p-6 rounded text-center"><p className="text-white mb-4">Delete Item?</p><button onClick={async()=>{await safeFetch(`${API_URL}/${endpoint}/${del}`,{method:'DELETE',headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}});setDel(null);load();}} className="bg-red-600 text-white px-4 py-2 rounded">Delete</button><button onClick={()=>setDel(null)} className="ml-4 text-gray-400">Cancel</button></div></div>}</div>;
};

const Protection = () => {
    const [t, setT] = useState('condoms');
    return <div className="w-full h-full flex flex-col"><div className="flex justify-center gap-4 p-4"><button onClick={()=>setT('condoms')} className={`px-4 py-1 rounded-full border ${t==='condoms'?'bg-gold text-black':'text-gray-400 border-gray-600'}`}>Condoms</button><button onClick={()=>setT('lubes')} className={`px-4 py-1 rounded-full border ${t==='lubes'?'bg-gold text-black':'text-gray-400 border-gray-600'}`}>Lubes</button></div>{t==='condoms'?<Gallery title="Condoms" endpoint="condoms" icon={<Shield/>}/>:<Gallery title="Lubes" endpoint="lubes" icon={<Folder/>}/>}</div>;
};

const Spin = () => {
    const [d, setD] = useState({c:[],s:[],h:[]}); const [ah, setAh] = useState(null); const [as, setAs] = useState(null); const [rot, setRot] = useState(0); const [spin, setSpin] = useState(false); const [win, setW] = useState(null); const [hist, setH] = useState(false);
    useEffect(() => { const l=async()=>{const h={Authorization:`Bearer ${localStorage.getItem('token')}`}; const [c,s,hd]=await Promise.all([safeFetch(`${API_URL}/cards`,{headers:h}),safeFetch(`${API_URL}/sections`,{headers:h}),safeFetch(`${API_URL}/headers`,{headers:h})]); setD({c:Array.isArray(c)?c:[],s:Array.isArray(s)?s:[],h:Array.isArray(hd)?hd:[]});}; l(); }, []);
    const secs = ah ? d.s.filter(s=>s.header_id===ah) : d.s; const cards = d.c.filter(c=>as?c.section_id===as:true);
    const go = () => { if(!cards.length)return alert("No cards!"); setSpin(true); setW(null); const w=cards[Math.floor(Math.random()*cards.length)]; setRot(r=>r+1800+Math.random()*360); setTimeout(()=>{setSpin(false);setW(w);safeFetch(`${API_URL}/cards/${w.id}/scratch`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}});},4000); };
    return <div className="flex flex-col items-center w-full min-h-full py-4 overflow-hidden"><div className="w-full flex gap-2 overflow-x-auto p-2 no-scrollbar"><button onClick={()=>setAh(null)} className="px-4 py-1 border rounded-full text-xs bg-gold text-black">All</button>{d.h.map(h=><button key={h.id} onClick={()=>setAh(h.id)} className="px-4 py-1 border rounded-full text-xs text-gray-400">{h.title}</button>)}</div><div className="w-full flex gap-2 overflow-x-auto p-2 no-scrollbar">{secs.map(s=><button key={s.id} onClick={()=>setAs(as===s.id?null:s.id)} className={`px-4 py-1 border rounded-full text-xs ${as===s.id?'bg-red-600 text-white':'text-gray-400'}`}>{s.title}</button>)}</div><div className="relative w-72 h-72 rounded-full border-4 border-gold overflow-hidden flex items-center justify-center transition-transform duration-[4000ms] ease-out mt-8" style={{transform:`rotate(${rot}deg)`,background:'conic-gradient(#800020 0deg 22.5deg, #111 22.5deg 45deg)'}}><span className="text-white font-bold">SPIN</span></div><button onClick={go} disabled={spin} className="mt-8 px-8 py-3 bg-gold text-black font-bold rounded-full shadow-lg">SPIN</button>{win && <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"><div className="relative w-full max-w-sm h-[60vh]"><img src={win.filepath} className="w-full h-full object-contain"/><button onClick={()=>setW(null)} className="absolute top-0 right-0 p-2 text-white"><X/></button></div><button onClick={()=>setH(true)} className="mt-4 text-gold flex gap-2"><Clock/> History</button>{hist && <div className="absolute inset-0 bg-gray-900"><History id={win.id} close={()=>setH(false)}/></div>}</div>}</div>;
};

const Dice = () => {
    const [ops, setOps] = useState([]); const [res, setR] = useState({a:'?',l:'?',t:'?'}); const [roll, setRoll] = useState(false); const [time, setT] = useState(0); const [role, setRole] = useState('wife'); const [edit, setE] = useState(false);
    useEffect(() => { safeFetch(`${API_URL}/dice`,{headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}}).then(d=>Array.isArray(d)&&setOps(d)); }, []);
    const go = () => { setRoll(true); setT(0); let c=0; const acts=ops.filter(o=>o.type==='act'&&(o.role===role||!o.role)); const locs=ops.filter(o=>o.type==='location'&&(o.role===role||!o.role)); const i=setInterval(()=>{ setR({a:acts[Math.floor(Math.random()*acts.length)]?.text||'?',l:locs[Math.floor(Math.random()*locs.length)]?.text||'?',t:[10,15,30,45,60,'∞'][Math.floor(Math.random()*6)]}); c++; if(c>20){clearInterval(i); setRoll(false);} },100); };
    useEffect(() => { let i; if(time>0)i=setInterval(()=>setT(t=>t-1),1000); else if(time===0 && !roll) playSound('end'); return ()=>clearInterval(i); },[time]);
    if(edit) return <div className="p-4 text-white"><button onClick={()=>setE(false)}>Back</button><h1>Edit Dice ({role})</h1><p>Use Desktop to edit.</p></div>;
    return <div className="flex flex-col items-center pt-10 gap-6 w-full"><div className="flex bg-gray-800 rounded-full p-1"><button onClick={()=>setRole('wife')} className={`px-6 py-2 rounded-full ${role==='wife'?'bg-red-600 text-white':'text-gray-400'}`}>Wife</button><button onClick={()=>setRole('husband')} className={`px-6 py-2 rounded-full ${role==='husband'?'bg-blue-600 text-white':'text-gray-400'}`}>Husband</button></div><div className="flex gap-4 text-center"><div className="w-24 h-24 bg-red-900 border-2 border-gold flex items-center justify-center rounded-lg text-white font-bold">{res.a}</div><div className="w-24 h-24 bg-blue-900 border-2 border-gold flex items-center justify-center rounded-lg text-white font-bold">{res.l}</div><div className="w-24 h-24 bg-gray-800 border-2 border-gold flex items-center justify-center rounded-lg text-white font-bold text-3xl">{res.t}</div></div>{time>0 && <div className="text-7xl font-mono text-red-500 font-bold">{time}</div>}<div className="flex gap-4">{!roll&&res.t!=='?'&&res.t!=='∞'&&<button onClick={()=>{initAudio();playSound('ting');setT(parseInt(res.t))}} className="p-4 rounded-full bg-green-600 text-white"><Play/></button>}<button onClick={go} disabled={roll} className="px-8 py-3 bg-gold text-black font-bold rounded-full shadow-lg">ROLL</button></div><button onClick={()=>setE(true)} className="text-gray-500 flex items-center gap-2"><Edit2 size={16}/> Edit</button></div>;
};

const Home = () => {
    const [d, setD] = useState({c:[],s:[],h:[]}); const [ah, setAh] = useState(null); const [as, setAs] = useState(null); const [sel, setSel] = useState(null); const [del, setDel] = useState(null);
    const [ui, setUi] = useState({newS:'',newH:'',ren:''}); const [mod, setMod] = useState({s:false,h:false,sm:null,hm:null,mv:null});
    const ref = async () => { const h={Authorization:`Bearer ${localStorage.getItem('token')}`}; const [c,s,hd]=await Promise.all([safeFetch(`${API_URL}/cards`,{headers:h}),safeFetch(`${API_URL}/sections`,{headers:h}),safeFetch(`${API_URL}/headers`,{headers:h})]); setD({c:Array.isArray(c)?c:[],s:Array.isArray(s)?s:[],h:Array.isArray(hd)?hd:[]}); };
    useEffect(() => { ref(); }, []);
    const up = async (e) => { for(const f of e.target.files){const fd=new FormData();fd.append('file',f);if(as)fd.append('section_id',as);await safeFetch(`${API_URL}/cards`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem('token')}`},body:fd});} ref(); };
    const crS = async () => { await safeFetch(`${API_URL}/sections`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('token')}`},body:JSON.stringify({title:ui.newS,header_id:ah})}); setUi({...ui,newS:''}); setMod({...mod,s:false}); ref(); };
    const crH = async () => { await safeFetch(`${API_URL}/headers`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('token')}`},body:JSON.stringify({title:ui.newH})}); setUi({...ui,newH:''}); setMod({...mod,h:false}); ref(); };
    const mov = async (hid) => { await safeFetch(`${API_URL}/sections/${mod.sm.id}`,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('token')}`},body:JSON.stringify({title:mod.sm.title,header_id:hid})}); setMod({...mod,sm:null,mv:null}); ref(); };
    const delS = async () => { await safeFetch(`${API_URL}/sections/${mod.sm.id}`,{method:'DELETE',headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}}); setMod({...mod,sm:null}); ref(); };
    const delH = async () => { await safeFetch(`${API_URL}/headers/${mod.hm.id}`,{method:'DELETE',headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}}); setMod({...mod,hm:null}); setAh(null); ref(); };
    const delC = async () => { await safeFetch(`${API_URL}/cards/${del}`,{method:'DELETE',headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}}); setDel(null); ref(); };
    
    const fs = ah ? d.s.filter(s=>s.header_id===ah) : d.s.filter(s=>!s.header_id);
    const fc = d.c.filter(c=>as?c.section_id===as:!c.section_id);

    return (
        <div className="pb-24 px-4 w-full">
            <div className="flex gap-2 overflow-x-auto p-2 no-scrollbar"><button onClick={()=>setAh(null)} className={`px-4 py-1 rounded-full border text-sm ${!ah?'bg-gold text-black':'text-gray-400'}`}>Unsorted</button>{d.h.map(h=><Header key={h.id} h={h} active={ah} set={setAh} onL={x=>setMod({...mod,hm:x})}/>)}<button onClick={()=>setMod({...mod,h:true})} className="px-2 rounded-full border text-gray-400"><Plus/></button></div>
            <div className="flex gap-2 overflow-x-auto p-2 no-scrollbar bg-white/5 mt-2 rounded">{fs.map(s=><Section key={s.id} s={s} active={as} set={setAs} onL={x=>setMod({...mod,sm:x})}/>)}<button onClick={()=>setMod({...mod,s:true})} className="px-2 rounded-full border text-gray-400"><Plus/></button></div>
            <div className="my-4 flex justify-between"><label className="bg-red-600 px-4 py-2 rounded text-white flex gap-2 items-center cursor-pointer"><Upload size={16}/> Upload<input type="file" hidden multiple accept="image/*" onChange={up}/></label></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{fc.map(c=>{ const lp=useLongPress(()=>setDel(c.id)); return <div key={c.id} {...lp} onClick={()=>setSel(c)} className="aspect-[3/4] bg-gray-800 rounded border border-gold/30 flex items-center justify-center overflow-hidden"><Maximize2 className="text-gold"/></div> })}</div>
            
            {/* Modals */}
            {mod.s && <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"><div className="bg-gray-800 p-4 rounded"><input value={ui.newS} onChange={e=>setUi({...ui,newS:e.target.value})} className="text-black p-2 rounded" placeholder="Section Name"/><button onClick={crS} className="ml-2 bg-gold p-2 rounded">Add</button><button onClick={()=>setMod({...mod,s:false})} className="ml-2 text-white">X</button></div></div>}
            {mod.h && <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"><div className="bg-gray-800 p-4 rounded"><input value={ui.newH} onChange={e=>setUi({...ui,newH:e.target.value})} className="text-black p-2 rounded" placeholder="Category Name"/><button onClick={crH} className="ml-2 bg-gold p-2 rounded">Add</button><button onClick={()=>setMod({...mod,h:false})} className="ml-2 text-white">X</button></div></div>}
            {mod.sm && !mod.mv && <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"><div className="bg-gray-800 p-6 rounded text-center flex flex-col gap-4"><h3 className="text-gold text-xl">{mod.sm.title}</h3><button onClick={()=>setMod({...mod,mv:true})} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 justify-center"><Grid/> Move</button><button onClick={delS} className="bg-red-600 text-white px-4 py-2 rounded flex items-center gap-2 justify-center"><Trash2/> Delete</button><button onClick={()=>setMod({...mod,sm:null})} className="text-gray-400">Cancel</button></div></div>}
            {mod.hm && <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"><div className="bg-gray-800 p-6 rounded text-center"><p className="text-white mb-4">Delete Category "{mod.hm.title}"?</p><button onClick={delH} className="bg-red-600 text-white px-4 py-2 rounded">Delete</button><button onClick={()=>setMod({...mod,hm:null})} className="ml-4 text-gray-400">Cancel</button></div></div>}
            {mod.mv && <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"><div className="bg-gray-800 p-6 rounded w-64 max-h-[80vh] overflow-y-auto"><h3 className="text-white mb-4">Move to...</h3><button onClick={()=>mov(null)} className="w-full text-left p-2 border-b border-gray-600 text-gray-300">Unsorted</button>{d.h.map(h=><button key={h.id} onClick={()=>mov(h.id)} className="w-full text-left p-2 border-b border-gray-600 text-gold">{h.title}</button>)}<button onClick={()=>setMod({...mod,mv:null})} className="mt-4 text-gray-400 w-full">Cancel</button></div></div>}
            {sel && <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"><div className="relative h-[80%]"><img src={sel.filepath} className="h-full object-contain"/><button onClick={()=>setSel(null)} className="absolute top-0 right-0 p-4 text-white"><X/></button><div className="absolute bottom-0 w-full flex justify-center"><RevealCard image={sel.filepath} id={sel.id} onRevealComplete={id=>safeFetch(`${API_URL}/cards/${id}/scratch`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}})} /></div></div></div>}
            {del && <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"><div className="bg-gray-800 p-6 rounded text-center"><p className="text-white mb-4">Delete?</p><button onClick={delC} className="bg-red-600 text-white px-4 py-2 rounded">Yes</button><button onClick={()=>setDel(null)} className="ml-4 text-gray-400">No</button></div></div>}
        </div>
    );
};

const Settings = ({user, logout}) => {
    const [cfg, setCfg] = useState({cycle_len:28, period_len:5, cycle_start:'', ntfy_url:'', ntfy_topic:''});
    useEffect(() => { safeFetch(`${API_URL}/settings`,{headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}}).then(d=>d&&setCfg(p=>({...p,...d}))); },[]);
    const save = async () => { await safeFetch(`${API_URL}/settings`,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('token')}`},body:JSON.stringify(cfg)}); alert("Saved"); };
    return <div className="p-6 text-white overflow-y-auto"><h2 className="text-2xl mb-4 text-gold">Settings</h2><div className="space-y-4 mb-8"><div><label>Cycle Length</label><input type="number" className="w-full bg-black border p-2" value={cfg.cycle_len} onChange={e=>setCfg({...cfg,cycle_len:e.target.value})}/></div><div><label>Period Length</label><input type="number" className="w-full bg-black border p-2" value={cfg.period_len} onChange={e=>setCfg({...cfg,period_len:e.target.value})}/></div><div><label>Last Period Start</label><input type="date" className="w-full bg-black border p-2 text-white" value={cfg.cycle_start} onChange={e=>setCfg({...cfg,cycle_start:e.target.value})}/></div><button onClick={save} className="bg-gold text-black px-4 py-2 rounded">Save</button></div><button onClick={logout} className="text-red-500 border border-red-500 px-4 py-2 rounded">Logout</button></div>;
};

const Notifications = () => <div className="p-6 text-white text-center">Notifications Placeholder</div>;

const Layout = ({ children, user, logout }) => {
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  const exp = () => window.open(`${API_URL}/export?token=${localStorage.getItem('token')}`, '_blank');
  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col font-sans overflow-hidden">
      <header className="flex-none bg-gradient-to-r from-eggplant to-black border-b border-gold/20 p-4 flex justify-between items-center shadow-lg"><span className="text-xl text-gold font-bold">Privy</span><button onClick={()=>setMenu(!menu)}><Menu className="text-gold"/></button></header>
      {menu && <div className="absolute top-14 right-0 w-64 bg-gray-900 border-l border-gold z-50 p-4 shadow-xl flex flex-col gap-4"><Link to="/settings" onClick={()=>setMenu(false)} className="flex gap-2 items-center text-white"><User/> Settings</Link><button onClick={exp} className="flex gap-2 items-center text-white"><Download/> Export</button><button onClick={logout} className="flex gap-2 items-center text-red-500"><LogOut/> Logout</button></div>}
      <main className="flex-1 overflow-y-auto w-full">{children}</main>
      <nav className="flex-none bg-black/90 backdrop-blur-md border-t border-gold/20 flex justify-around pt-4 pb-8 z-50 overflow-x-auto no-scrollbar gap-8 px-4">
        {[
            {p:'/',i:<Layers/>,l:'Cards'},{p:'/spin',i:<Aperture/>,l:'Spin'},{p:'/dice',i:<Dices/>,l:'Dice'},
            {p:'/extras',i:<Sparkles/>,l:'Extras'},{p:'/books',i:<Book/>,l:'Books'},{p:'/toys',i:<Zap/>,l:'Toys'},
            {p:'/lingerie',i:<Shirt/>,l:'Lingerie'},{p:'/protection',i:<Shield/>,l:'Safety'},{p:'/tracker',i:<CalIcon/>,l:'Cycle'}
        ].map(x=><Link key={x.p} to={x.p} className={`flex flex-col items-center min-w-[50px] ${loc.pathname===x.p?'text-lipstick':'text-gray-500'}`}>{x.i}<span className="text-xs">{x.l}</span></Link>)}
      </nav>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  useEffect(() => { try { const u = JSON.parse(localStorage.getItem('user')); if(u) setUser(u); } catch(e){ localStorage.clear(); } }, []);
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
      <Route path="/tracker" element={<CycleTracker/>}/>
      <Route path="/notifications" element={<Notifications/>}/>
  </Routes></Layout></Router>}</ErrorBoundary>);
}
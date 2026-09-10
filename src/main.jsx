import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import {Search, Play, Plus, Trash2, Upload, LogIn, LogOut, X, Film, ShieldCheck} from 'lucide-react';
import './style.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = url && key ? createClient(url, key) : null;

function App(){
  const [session,setSession]=useState(null);
  const [profile,setProfile]=useState(null);
  const [movies,setMovies]=useState([]);
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState(null);
  const [showLogin,setShowLogin]=useState(false);
  const [showAdmin,setShowAdmin]=useState(false);
  const [loading,setLoading]=useState(true);

  async function load(){
    if(!supabase){setLoading(false);return}
    const {data}=await supabase.from('movies').select('*').order('created_at',{ascending:false});
    setMovies(data||[]);
    const {data:{session:s}}=await supabase.auth.getSession();
    setSession(s);
    if(s){
      const {data:p}=await supabase.from('profiles').select('*').eq('id',s.user.id).maybeSingle();
      setProfile(p);
    } else setProfile(null);
    setLoading(false);
  }
  useEffect(()=>{
    load();
    if(!supabase) return;
    const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>load());
    return ()=>subscription.unsubscribe();
  },[]);

  const filtered=useMemo(()=>movies.filter(m=>
    (m.title||'').toLowerCase().includes(query.toLowerCase()) ||
    (m.genre||'').toLowerCase().includes(query.toLowerCase())
  ),[movies,query]);

  if(!supabase) return <SetupScreen/>;

  return <div className="app">
    <header className="nav">
      <div className="brand"><Film size={25}/><span>Cine<span>Verse</span></span></div>
      <div className="search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search movies..."/></div>
      <div className="navActions">
        {profile?.role==='admin' && <button className="ghost" onClick={()=>setShowAdmin(true)}><ShieldCheck size={17}/> Admin</button>}
        {session ? <button className="ghost" onClick={()=>supabase.auth.signOut()}><LogOut size={17}/> Logout</button> :
          <button className="ghost" onClick={()=>setShowLogin(true)}><LogIn size={17}/> Admin Login</button>}
      </div>
    </header>

    <section className="hero">
      <div className="heroText">
        <p className="eyebrow">YOUR MOVIE UNIVERSE</p>
        <h1>Every story.<br/><em>One place.</em></h1>
        <p>Discover and watch movies in your personal CineVerse.</p>
        <button className="primary" onClick={()=>document.getElementById('movies').scrollIntoView({behavior:'smooth'})}><Play size={18} fill="currentColor"/> Browse Movies</button>
      </div>
    </section>

    <main id="movies">
      <div className="sectionHead"><div><p className="eyebrow">LIBRARY</p><h2>{query?`Results for "${query}"`:'Movies'}</h2></div><span>{filtered.length} titles</span></div>
      {loading?<div className="empty">Loading...</div>:filtered.length===0?<div className="empty">No movies yet. An admin can upload the first one.</div>:
      <div className="grid">{filtered.map(m=><MovieCard key={m.id} movie={m} onClick={()=>setSelected(m)}/>)}</div>}
    </main>

    {selected && <MovieModal movie={selected} onClose={()=>setSelected(null)}/>}
    {showLogin && <LoginModal onClose={()=>setShowLogin(false)} onDone={load}/>}
    {showAdmin && profile?.role==='admin' && <AdminPanel movies={movies} onClose={()=>setShowAdmin(false)} onChanged={load}/>}
  </div>
}

function MovieCard({movie,onClick}){
  return <button className="card" onClick={onClick}>
    <div className="poster">{movie.poster_url?<img src={movie.poster_url} alt=""/>:<div className="posterFallback"><Film/></div>}</div>
    <div className="cardInfo"><h3>{movie.title}</h3><p>{movie.year||'—'} · {movie.genre||'Movie'} · ⭐ {movie.rating||'—'}</p></div>
  </button>
}

function MovieModal({movie,onClose}){
  return <div className="overlay"><div className="modal playerModal"><button className="close" onClick={onClose}><X/></button>
    <div className="player">{movie.video_url?<video controls playsInline src={movie.video_url}/>:<div className="noVideo"><Film size={45}/><p>Video not available yet.</p></div>}</div>
    <div className="modalBody"><p className="eyebrow">{movie.genre||'MOVIE'} · {movie.year||''}</p><h2>{movie.title}</h2><p>{movie.description||'No description added.'}</p></div>
  </div></div>
}

function LoginModal({onClose,onDone}){
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  async function login(e){e.preventDefault();setBusy(true);setError('');
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error)setError(error.message); else {await onDone();onClose();}
    setBusy(false);
  }
  return <div className="overlay"><form className="modal form" onSubmit={login}><button type="button" className="close" onClick={onClose}><X/></button>
    <p className="eyebrow">CINEVERSE</p><h2>Admin Login</h2>
    <label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
    <label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {error&&<div className="error">{error}</div>}<button className="primary full" disabled={busy}>{busy?'Signing in...':'Sign in'}</button>
  </form></div>
}

function AdminPanel({movies,onClose,onChanged}){
  const [title,setTitle]=useState(''); const [description,setDescription]=useState(''); const [year,setYear]=useState(''); const [genre,setGenre]=useState(''); const [rating,setRating]=useState(''); const [poster,setPoster]=useState(null); const [video,setVideo]=useState(null); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const [progress,setProgress]=useState(0);

  async function callR2(body){
    const {data:{session}}=await supabase.auth.getSession();
    if(!session) throw new Error('Please sign in again.');
    const res=await fetch('/.netlify/functions/r2-multipart',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify(body)});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||'R2 upload service failed.');
    return data;
  }

  async function uploadVideo(file){
    const PART_SIZE=50*1024*1024;
    const totalParts=Math.ceil(file.size/PART_SIZE);
    setProgress(0);
    const init=await callR2({action:'init',name:file.name,contentType:file.type||'video/mp4'});
    const urls=new Map();
    for(let first=1; first<=totalParts; first+=10){
      const nums=[]; for(let n=first;n<=Math.min(first+9,totalParts);n++) nums.push(n);
      const signed=await callR2({action:'sign',key:init.key,uploadId:init.uploadId,partNumbers:nums});
      signed.urls.forEach(x=>urls.set(x.partNumber,x.url));
    }
    const uploaded=[]; let completed=0;
    const workers=Array.from({length:3},(_,workerIndex)=> (async()=>{
      for(let part=workerIndex+1; part<=totalParts; part+=3){
        const start=(part-1)*PART_SIZE; const end=Math.min(start+PART_SIZE,file.size); const blob=file.slice(start,end);
        const response=await fetch(urls.get(part),{method:'PUT',body:blob});
        if(!response.ok) throw new Error(`Video upload failed at part ${part} (${response.status}).`);
        const etag=response.headers.get('ETag'); if(!etag) throw new Error('R2 did not return an ETag. Check the R2 CORS policy.');
        uploaded.push({PartNumber:part,ETag:etag}); completed++; setProgress(Math.round((completed/totalParts)*100));
      }
    })());
    try { await Promise.all(workers); }
    catch(err){ try{await callR2({action:'abort',key:init.key,uploadId:init.uploadId});}catch{} throw err; }
    uploaded.sort((a,b)=>a.PartNumber-b.PartNumber);
    const done=await callR2({action:'complete',key:init.key,uploadId:init.uploadId,parts:uploaded});
    setProgress(100); return done.videoUrl;
  }

  async function uploadPoster(file){
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'-'); const path=`${crypto.randomUUID()}-${safe}`;
    const {error}=await supabase.storage.from('posters').upload(path,file,{upsert:false});
    if(error) throw error; return supabase.storage.from('posters').getPublicUrl(path).data.publicUrl;
  }

  async function publish(e){
    e.preventDefault(); setBusy(true); setMessage(''); setProgress(0);
    try{
      if(!video) throw new Error('Please choose a movie video file.');
      setMessage('Uploading video to R2…');
      const videoUrl=await uploadVideo(video);
      setMessage('Uploading poster…');
      const posterUrl=poster?await uploadPoster(poster):null;
      const {error}=await supabase.from('movies').insert({title,description,year:year?Number(year):null,genre,rating:rating?Number(rating):0,poster_url:posterUrl,video_url:videoUrl,published:true});
      if(error) throw error;
      setTitle('');setDescription('');setYear('');setGenre('');setRating('');setPoster(null);setVideo(null);setProgress(0);
      document.querySelectorAll('input[type=file]').forEach(x=>x.value='');
      setMessage('Published successfully!'); await onChanged();
    }catch(err){setMessage(err.message||'Upload failed.');}
    setBusy(false);
  }
  async function remove(id){if(!confirm('Delete this movie?'))return; const {error}=await supabase.from('movies').delete().eq('id',id); if(error)alert(error.message); else onChanged();}
  return <div className="overlay"><div className="modal admin"><button className="close" onClick={onClose}><X/></button>
    <div className="adminHead"><div><p className="eyebrow">ADMIN DASHBOARD</p><h2>Upload a movie</h2></div><Upload size={28}/></div>
    <form onSubmit={publish} className="uploadForm">
      <div className="two"><label>Movie title<input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="Example: My Movie"/></label><label>Year<input inputMode="numeric" value={year} onChange={e=>setYear(e.target.value)} placeholder="2026"/></label></div>
      <div className="two"><label>Genre<input value={genre} onChange={e=>setGenre(e.target.value)} placeholder="Action, Drama"/></label><label>Rating<input type="number" min="0" max="10" step=".1" value={rating} onChange={e=>setRating(e.target.value)} placeholder="8.5"/></label></div>
      <label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Short movie description"/></label>
      <label>Poster image<input type="file" accept="image/*" onChange={e=>setPoster(e.target.files?.[0]||null)}/></label>
      <label>Movie video <span className="hint">(MP4/WebM recommended; MKV may not play in browsers)</span><input required type="file" accept="video/*,.mkv" onChange={e=>setVideo(e.target.files?.[0]||null)}/></label>
      {busy&&<div className="progressWrap"><div className="progressBar"><span style={{width:`${progress}%`}}/></div><small>{progress}% — keep this page open</small></div>}
      {message&&<div className={message.includes('success')?'success':'error'}>{message}</div>}
      <button className="primary full" disabled={busy}>{busy?'Uploading… please keep this page open':'Upload & Publish'}</button>
    </form>
    <div className="manage"><h3>Published movies</h3>{movies.filter(m=>m.published).map(m=><div className="manageRow" key={m.id}><span>{m.title}</span><button onClick={()=>remove(m.id)}><Trash2 size={16}/></button></div>)}</div>
  </div></div>
}

function SetupScreen(){return <div className="setup"><Film size={45}/><h1>CineVerse</h1><p>Connect Supabase to enable real movie uploads.</p><code>VITE_SUPABASE_URL<br/>VITE_SUPABASE_ANON_KEY</code><p>See <b>SUPABASE_SETUP.md</b> in the project.</p></div>}

createRoot(document.getElementById('root')).render(<App/>);

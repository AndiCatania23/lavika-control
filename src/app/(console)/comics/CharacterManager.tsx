'use client';
/* eslint-disable @next/next/no-img-element -- Editorial artwork. */
import {useEffect,useState,type FormEvent} from 'react';
import {api} from '@/lib/comics/client';
import type {ComicCharacter} from '@/lib/comics/characters';
import styles from './page.module.css';
type Person={id:string;full_name:string;position:string|null;slug:string|null};
const empty=()=>({id:crypto.randomUUID(),revision:null as number|null,name:'',role:'',color:'#c92c36',image_url:'',player_id:null as string|null,active:true,sort_order:0});
type Form=ReturnType<typeof empty>;
const artUrl=(url:string)=>url.startsWith('/')?`https://lavika-home-beta.vercel.app${url}`:url;
export function CharacterManager({characters,onSaved}:{characters:ComicCharacter[];onSaved:()=>Promise<void>}){
 const [form,setForm]=useState<Form|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [query,setQuery]=useState(''),[people,setPeople]=useState<Person[]>([]),[searchError,setSearchError]=useState(''),[searching,setSearching]=useState(false),[sourceName,setSourceName]=useState('');
 useEffect(()=>{
  let cancelled=false;
  const timer=setTimeout(async()=>{
   if(query.trim().length<2){setPeople([]);setSearching(false);return;}
   setSearching(true);setSearchError('');
   try{const data=await api(`/characters?q=${encodeURIComponent(query)}`);if(!cancelled)setPeople(data.people);}
   catch(e){if(!cancelled)setSearchError((e as Error).message);}
   finally{if(!cancelled)setSearching(false);}
  },250);
  return()=>{cancelled=true;clearTimeout(timer);};
 },[query]);
 function edit(c?:ComicCharacter){setForm(c?{id:c.id,revision:c.revision,name:c.name,role:c.role,color:c.color,image_url:c.image_url,player_id:c.player_id,active:c.active,sort_order:c.sort_order}:{...empty(),sort_order:characters.length});setSourceName(c?.person?.full_name??'');setQuery('');setPeople([]);setSearchError('');setError('');setMessage('');}
 async function upload(file:File){if(!form||busy)return;setBusy(true);setError('');try{const fd=new FormData();fd.set('id',form.id);fd.set('file',file);const data=await api('/characters/upload',fd);setForm({...form,image_url:data.image_url});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function save(e:FormEvent){e.preventDefault();if(!form||busy)return;setBusy(true);setError('');try{const {id,revision,...data}=form;await api('/characters',{id,revision,data});await onSaved();setForm(null);setMessage('Personaggio salvato. Disponibile nel selettore degli episodi.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <details className={styles.catalog}><summary>Catalogo protagonisti · {characters.length}</summary><p className={styles.help}>Collega la caricatura alla persona già presente in LAVIKA. Nome breve e ruolo qui sono editoriali; la scheda originale e la foto del giocatore restano indipendenti. Per dirigenti non ancora censiti o personaggi inventati puoi creare una voce editoriale e collegarla in seguito.</p>
 <button type="button" disabled={busy} onClick={()=>edit()}>Nuovo protagonista</button>
 <div className={styles.catalogList}>{characters.map(c=><button type="button" key={c.id} disabled={busy} onClick={()=>edit(c)}><img src={artUrl(c.image_url)} alt=""/><span><strong>{c.name}</strong><small>{c.role} · {c.active?'Attivo':'Archiviato'}</small><small>{c.person?.full_name??'Personaggio editoriale'}</small></span></button>)}</div>
 {message&&<p role="status" className={styles.success}>{message}</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}
 {form&&<form onSubmit={save} className={styles.editor}><h2>{form.revision?'Modifica protagonista':'Nuovo protagonista'}</h2><fieldset disabled={busy}>
 <label>Cerca nell’anagrafica LAVIKA<input value={query} placeholder="Nome del giocatore o dell’allenatore…" onChange={e=>setQuery(e.target.value)}/></label>
 {searching&&<p role="status">Ricerca…</p>}{searchError&&<p role="alert">{searchError}</p>}
 {query.trim().length>=2&&!searching&&!searchError&&!people.length&&<p className={styles.help}>Nessuna persona trovata. Puoi creare una voce editoriale.</p>}
 <div className={styles.personResults}>{people.map(p=>{const linked=characters.some(c=>c.player_id===p.id&&c.id!==form.id);return <button type="button" key={p.id} disabled={linked} onClick={()=>{setForm({...form,player_id:p.id,name:form.name||p.full_name,role:form.role||(/coach/i.test(p.position??'')?'Mister':'Giocatore')});setSourceName(p.full_name);setQuery('');setPeople([]);}}>{p.full_name} <small>{p.position}{linked?' · Già nel catalogo':''}</small></button>;})}</div>
 {form.player_id&&<p className={styles.help}>Collegato a: <strong>{sourceName||form.player_id}</strong> <button type="button" className={styles.secondary} onClick={()=>{setForm({...form,player_id:null});setSourceName('');}}>Scollega</button></p>}
 <div className={styles.fields}><label>Nome da mostrare<input required maxLength={80} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Ruolo nella rubrica<input maxLength={100} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}/></label><label>Colore del cerchio<input type="color" value={form.color} onChange={e=>setForm({...form,color:e.target.value})}/></label><label>Ordine nel carosello<input type="number" min={0} max={99999} value={form.sort_order} onChange={e=>setForm({...form,sort_order:Number(e.target.value)})}/></label><label>Stato<select value={form.active?'active':'archived'} onChange={e=>setForm({...form,active:e.target.value==='active'})}><option value="active">Attivo</option><option value="archived">Archiviato</option></select></label></div>
 <p className={styles.help}>Archiviare conserva i collegamenti alle card già uscite. Il protagonista resta consultabile se ha episodi nella raccolta.</p>
 <label>Caricatura trasparente · PNG o WebP, massimo 4 MB<input type="file" accept="image/png,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/></label>
 {form.image_url&&<img className={styles.characterPreview} src={artUrl(form.image_url)} alt="Anteprima caricatura"/>}
 <div className={styles.actions}><button type="submit" disabled={!form.image_url}>{busy?'Salvataggio…':'Salva protagonista'}</button><button type="button" className={styles.secondary} onClick={()=>setForm(null)}>Annulla</button></div>
 </fieldset></form>}
 </details>;
}

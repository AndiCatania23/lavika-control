'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {supabase} from '@/lib/supabaseClient';
import {localRomeToUtcIso,utcIsoToRomeLocal} from '@/lib/schedule/timezone';
import type {AuctionConfig,AuctionFields,AuctionRow} from '@/lib/auction/schema';
import styles from './page.module.css';
const states={scheduled:'In attesa',live:'Copertura LIVE',paused:'In pausa',closed:'Conclusa'};
const statuses={draft:'Bozza',published:'Pubblicato',withdrawn:'Ritirato'};
const stamp=(v:string|null)=>v?new Date(v).toLocaleString('it-IT',{timeZone:'Europe/Rome'}):'Non pubblicato';
const empty=()=>({amount:'',source_kind:'article' as 'article'|'broadcast',source_name:'',source_url:'',source_title:'',source_published_at:'',source_timecode:'',internal_notes:'',status:'draft' as AuctionFields['status'],change_reason:'Prima pubblicazione'});
async function api(method:string,body?:unknown,path=''){
 const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('Sessione scaduta. Accedi nuovamente.');
 const response=await fetch('/api/auction'+path,{method,headers:{Authorization:`Bearer ${session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const result=await response.json();if(!response.ok)throw Error(result.error??'Operazione non riuscita');return result;
}
export default function AuctionPage(){
 const [auction,setAuction]=useState<AuctionConfig|null>(null),[rows,setRows]=useState<AuctionRow[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [editing,setEditing]=useState<AuctionRow|null>(null),[visible,setVisible]=useState(false),[form,setForm]=useState(empty),[history,setHistory]=useState<Record<string,unknown>[]|null>(null);
 const requestId=useRef<string|null>(null),editor=useRef<HTMLFormElement>(null);
 const load=useCallback(async()=>{try{const data=await api('GET');setAuction(data.auction);setRows(data.updates);setError('');}catch(e){setError((e as Error).message);}},[]);
 useEffect(()=>{void load();},[load]);
 const start=(row:AuctionRow|null)=>{setEditing(row);requestId.current=row?.id??crypto.randomUUID();setForm(row?{...row,amount:String(row.amount),source_published_at:utcIsoToRomeLocal(row.source_published_at).slice(0,16),source_timecode:row.source_timecode??'',change_reason:''}:empty());setVisible(true);setHistory(null);setError('');setMessage('');requestAnimationFrame(()=>editor.current?.scrollIntoView({behavior:'smooth',block:'start'}));};
 const submit=async(e:FormEvent)=>{e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');try{
  const data={...form,amount:Number(form.amount),source_published_at:localRomeToUtcIso(form.source_published_at),source_timecode:form.source_kind==='broadcast'&&form.source_timecode?form.source_timecode:null};
  // Keep only the permitted fields when editing a loaded record.
  const fields={amount:data.amount,source_kind:data.source_kind,source_name:data.source_name,source_url:data.source_url,source_title:data.source_title,source_published_at:data.source_published_at,source_timecode:data.source_timecode,internal_notes:data.internal_notes,status:data.status,change_reason:data.change_reason};
  await api('POST',editing?{action:'edit',id:editing.id,revision:editing.revision,data:fields}:{action:'create',id:requestId.current,data:fields});setVisible(false);setMessage('Salvato. La beta leggerà l’aggiornamento automaticamente.');await load();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const changeState=async(state:AuctionConfig['state'])=>{if(!auction||busy||state===auction.state)return;setBusy(true);setError('');try{await api('POST',{action:'state',state,revision:auction.revision,change_reason:`Stato editoriale: ${states[state]}`});setMessage('Stato editoriale aggiornato.');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const audit=async(id:string)=>{try{const data=await api('GET',undefined,`?history=${id}`);setHistory(data.history);setError('');}catch(e){setError((e as Error).message);}};
 const latest=rows.filter(r=>r.status==='published').sort((a,b)=>(b.published_at??'').localeCompare(a.published_at??'')||a.id.localeCompare(b.id))[0];
 return <div className={styles.page}>
  <header className={styles.header}><div><p className={styles.eyebrow}>EDITORIALE · HOME BETA</p><h1>Asta del logo storico</h1><p>Importi riportati dalle fonti. Documentazione completa nel Control, solo il nome della fonte nell’app.</p></div><button onClick={()=>start(null)} disabled={busy}>Nuovo aggiornamento</button></header>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{message&&<p role="status" className={styles.success}>{message}</p>}
  <section className={styles.panel}><div className={styles.panelHead}><h2>Copertura editoriale</h2><button className={styles.quiet} onClick={()=>void load()} disabled={busy}>Ricarica</button></div>
   <div className={styles.states}>{(Object.entries(states) as [AuctionConfig['state'],string][]).map(([value,label])=><button key={value} aria-pressed={auction?.state===value} disabled={!auction||busy} onClick={()=>void changeState(value)}>{label}</button>)}</div>
   <p className={styles.help}>LIVE segnala una copertura editoriale attiva, non un collegamento alla piattaforma d’asta. Lo stato non cambia automaticamente con la data.</p>
   {auction&&<button className={styles.quiet} onClick={()=>void audit(auction.id)}>Storico dei cambi di stato</button>}
  </section>
  <div className={styles.columns}><section className={styles.panel}><h2>Anteprima ultimo aggiornamento</h2><span className={styles.help}>{auction?states[auction.state]:'Caricamento…'}</span><strong className={styles.amount}>{latest?`€ ${Number(latest.amount).toLocaleString('it-IT')}`:'—'}</strong><p>{latest?`Fonte: ${latest.source_name}`:'Nessun aggiornamento pubblicato'}</p><p className={styles.help}>{latest?`Pubblicato: ${stamp(latest.published_at)}`:'Le bozze e le voci ritirate non compaiono nella beta.'}</p></section>
  <section className={styles.panel}><h2>Come viene mostrato</h2><p>“Ultimo aggiornamento” sopra l’importo. “Fonte: …” sotto ogni voce.</p><p className={styles.help}>Link, titolo dell’articolo o puntata, data della fonte, minuto video, note e motivazioni restano riservati agli amministratori. La data visualizzata nell’app è quella di pubblicazione, non un presunto orario dell’offerta.</p></section></div>
  {visible&&<form className={styles.panel} ref={editor} onSubmit={submit}><h2>{editing?'Modifica aggiornamento':'Nuovo aggiornamento'}</h2><fieldset disabled={busy} className={styles.form}>
   <label>Importo (€)<input required type="number" min="0.01" max="999999999" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
   <label>Stato della voce<select value={form.status} onChange={e=>setForm({...form,status:e.target.value as AuctionFields['status']})}>{Object.entries(statuses).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label>Tipo di fonte<select value={form.source_kind} onChange={e=>setForm({...form,source_kind:e.target.value as 'article'|'broadcast',source_timecode:''})}><option value="article">Articolo online</option><option value="broadcast">Trasmissione / puntata</option></select></label>
   <label>Nome della fonte · visibile nell’app<input required maxLength={120} value={form.source_name} onChange={e=>setForm({...form,source_name:e.target.value})}/></label>
   <label className={styles.wide}>Link articolo o puntata · riservato<input type="url" required maxLength={2000} value={form.source_url} onChange={e=>setForm({...form,source_url:e.target.value})}/></label>
   <label className={styles.wide}>Titolo articolo o puntata · riservato<input required maxLength={500} value={form.source_title} onChange={e=>setForm({...form,source_title:e.target.value})}/></label>
   <label>Data e ora della fonte · ora italiana<input type="datetime-local" required value={form.source_published_at} onChange={e=>setForm({...form,source_published_at:e.target.value})}/></label>
   {form.source_kind==='broadcast'&&<label>Minuto del passaggio · facoltativo<input placeholder="24:30 oppure 01:24:30" value={form.source_timecode} onChange={e=>setForm({...form,source_timecode:e.target.value})}/></label>}
   <label className={styles.wide}>Note interne<textarea maxLength={10000} rows={3} value={form.internal_notes} onChange={e=>setForm({...form,internal_notes:e.target.value})}/></label>
   <label className={styles.wide}>Motivo del salvataggio · conservato nello storico<input required minLength={3} maxLength={1000} placeholder="Es. correzione dell’importo riportato" value={form.change_reason} onChange={e=>setForm({...form,change_reason:e.target.value})}/></label>
   <div className={`${styles.actions} ${styles.wide}`}><button type="submit">{busy?'Salvataggio…':form.status==='published'?'Salva e pubblica nella beta':'Salva '+statuses[form.status].toLowerCase()}</button><button type="button" className={styles.quiet} onClick={()=>setVisible(false)}>Annulla</button></div>
  </fieldset></form>}
  <section className={styles.panel}><h2>Aggiornamenti e fonti</h2>{!rows.length&&<p className={styles.help}>Nessuna voce. Crea una bozza con importo e fonte per iniziare.</p>}
   {rows.map(row=><article className={styles.row} key={row.id}><div><span className={styles.tag}>{statuses[row.status]}</span><h3>€ {Number(row.amount).toLocaleString('it-IT')} <small>· {row.source_name}</small></h3><p>{row.source_title}</p><p className={styles.help}>{row.source_kind==='broadcast'?'Trasmissione':'Articolo'} · Fonte del {stamp(row.source_published_at)}{row.source_timecode?` · ${row.source_timecode}`:''}</p><a href={row.source_url} target="_blank" rel="noopener noreferrer">Apri fonte ↗</a><p className={styles.help}>Pubblicazione: {stamp(row.published_at)} · revisione {row.revision}</p>{row.internal_notes&&<details><summary>Note interne</summary><p>{row.internal_notes}</p></details>}</div><div className={styles.actions}><button className={styles.quiet} onClick={()=>start(row)}>Modifica / ritira</button><button className={styles.quiet} onClick={()=>void audit(row.id)}>Storico</button></div></article>)}
  </section>
  {history&&<section className={styles.panel}><div className={styles.panelHead}><h2>Traccia delle modifiche</h2><button className={styles.quiet} onClick={()=>setHistory(null)}>Chiudi storico</button></div><p className={styles.help}>Registro riservato: prima e dopo ogni salvataggio, autore e motivazione. Fino alle ultime 100 revisioni.</p>{history.map((entry,index)=><details key={String(entry.id??index)}><summary>{stamp(String(entry.recorded_at))}</summary><pre className={styles.audit}>{JSON.stringify(entry,null,2)}</pre></details>)}</section>}
 </div>;
}

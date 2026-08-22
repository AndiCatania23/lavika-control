import Link from 'next/link';
import { ArrowRight, CheckCircle2, CircleAlert, Flame, Inbox, Sparkles, Target } from 'lucide-react';
import { actionPriority, type OperationalAction, type SocialOpportunity } from '@/lib/social-insights/operations';
import type { EditorialTrigger } from '@/lib/social-insights/editorialRadar';

const STATUS_LABEL: Record<OperationalAction['status'], string> = {
  done: 'Fatto', ready: 'Pronto', needs_approval: 'Da approvare', scheduled: 'Programmato', waiting_trigger: 'In attesa', suggested: 'Suggerito', blocked: 'Bloccato', skipped: 'Ignorato',
};

function ActionCard({ action, primary = false }: { action: OperationalAction; primary?: boolean }) {
  const score = actionPriority(action);
  const priority = score >= 85 ? 'Critica' : score >= 70 ? 'Alta' : score >= 50 ? 'Media' : 'Bassa';
  return (
    <article className={`rounded-[18px] border p-4 ${primary ? 'border-orange-300/50 bg-orange-50/70' : 'border-[color:var(--hairline-soft)] bg-[color:var(--card)]'}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-orange-700">{action.timingLabel}</span>
        <span className="text-[10px] text-muted-foreground">{STATUS_LABEL[action.status]} · Priorità {priority}</span>
      </div>
      <h3 className="mt-2 text-[16px] font-semibold leading-snug text-[color:var(--text)]">{action.title}</h3>
      <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-muted-foreground">{action.summary}</p>
      <Link href={action.href} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[color:var(--accent-raw)] px-4 py-2 text-[12px] font-semibold text-white transition-transform duration-150 active:scale-[0.97]">
        {action.actionLabel}<ArrowRight size={14} aria-hidden="true" />
      </Link>
    </article>
  );
}

export function TodayCommandCenter({ subtitle, objective, actions }: { subtitle: string; objective: string; actions: OperationalAction[] }) {
  const [primary, ...rest] = actions;
  return (
    <section className="rounded-[22px] border border-orange-200/60 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2"><Target size={18} className="text-orange-600" /><h2 className="text-[20px] font-semibold">Oggi</h2></div>
      <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
      <div className="mt-4 rounded-xl bg-neutral-50 p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Obiettivo di oggi</div><p className="mt-1 text-[13px] leading-relaxed">{objective}</p></div>
      {primary ? <div className="mt-4"><div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-orange-700"><Flame size={14} />Prossima azione</div><ActionCard action={primary} primary /></div> : <div className="mt-4 rounded-xl border border-dashed p-4 text-[13px] text-muted-foreground">Nessuna azione urgente. Il calendario editoriale è coperto.</div>}
      {rest.length > 0 && <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-[12px] font-medium text-muted-foreground">Altre {rest.length} azioni di oggi</summary><div className="grid gap-2 sm:grid-cols-2">{rest.map((action) => <ActionCard key={action.id} action={action} />)}</div></details>}
    </section>
  );
}

export function ApprovalQueue({ approvals }: { approvals: Array<{ id: string; title: string; sourceType: string; readyVariants: number }> }) {
  return (
    <section className="rounded-[18px] border border-[color:var(--hairline-soft)] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Inbox size={17} className="text-orange-600" /><h2 className="text-[16px] font-semibold">Da approvare</h2></div><span className="rounded-full bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700">{approvals.length}</span></div>
      {approvals.length === 0 ? <p className="mt-3 text-[12.5px] text-muted-foreground">Nessun pacchetto pronto da approvare.</p> : <div className="mt-3 space-y-2">{approvals.slice(0, 3).map((draft) => <Link key={draft.id} href={`/social/composer/draft/${draft.id}`} className="flex min-h-12 items-center gap-3 rounded-xl border border-[color:var(--hairline-soft)] p-3 text-inherit no-underline"><CheckCircle2 size={16} className="shrink-0 text-orange-600" /><div className="min-w-0 grow"><div className="truncate text-[12.5px] font-medium">{draft.title}</div><div className="text-[10.5px] text-muted-foreground">{draft.readyVariants} formati pronti · {draft.sourceType}</div></div><ArrowRight size={14} className="shrink-0 text-muted-foreground" /></Link>)}</div>}
      {approvals.length > 3 && <Link href="/social/drafts?status=review" className="mt-3 inline-flex min-h-10 items-center text-[12px] font-semibold text-orange-700">VEDI TUTTI</Link>}
    </section>
  );
}

export function OpportunityFeed({ opportunities }: { opportunities: SocialOpportunity[] }) {
  return (
    <section className="rounded-[22px] border border-[color:var(--hairline-soft)] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2"><Sparkles size={18} className="text-orange-600" /><h2 className="text-[18px] font-semibold">Opportunità</h2></div>
      {opportunities.length === 0 ? <div className="mt-4 rounded-xl border border-dashed p-4 text-[13px] text-muted-foreground">Nessuna opportunità sufficientemente supportata dai dati.</div> : <div className="mt-4 grid gap-3 md:grid-cols-2">{opportunities.map((opportunity) => <article key={opportunity.id} className="rounded-2xl border border-[color:var(--hairline-soft)] p-4"><div className="flex items-start gap-2"><Flame size={16} className="mt-0.5 shrink-0 text-orange-600" /><h3 className="line-clamp-2 text-[15px] font-semibold leading-snug">{opportunity.title}</h3></div><p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{opportunity.summary}</p><div className="mt-3 space-y-1">{opportunity.evidence.slice(0, 2).map((item) => <div key={item} className="text-[11px]">• {item}</div>)}</div><div className="mt-2 flex items-center gap-1 text-[10.5px] text-muted-foreground"><CircleAlert size={12} />Confidenza {opportunity.confidence} · {opportunity.sampleSize} confronti</div>{opportunity.href !== '#' && <Link href={opportunity.href} className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-[11.5px] font-semibold text-orange-700">{opportunity.actionLabel}<ArrowRight size={13} /></Link>}</article>)}</div>}
    </section>
  );
}

function triggerTime(trigger: EditorialTrigger) {
  if (!trigger.expectedAt) return 'Da definire';
  return new Date(trigger.expectedAt).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

export function EditorialRadar({ triggers }: { triggers: EditorialTrigger[] }) {
  const automatic = triggers.filter((item) => item.automationLevel === 'generate').length;
  const approval = triggers.filter((item) => item.automationLevel === 'approval').length;
  return (
    <section className="rounded-[22px] border border-[color:var(--hairline-soft)] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-[18px] font-semibold">Radar editoriale</h2><p className="mt-0.5 text-[12px] text-muted-foreground">Prossime 48 ore</p></div><span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold">{triggers.length} opportunità</span></div>
      {triggers.length === 0 ? <div className="mt-4 rounded-xl border border-dashed p-4 text-[13px] text-muted-foreground">Nessun evento editoriale imminente rilevato.</div> : <><div className="mt-3 flex gap-3 text-[10.5px] text-muted-foreground"><span>{automatic} generabili</span><span>{approval} con approvazione</span><span>0 auto-publish</span></div><div className="mt-4 space-y-1.5">{triggers.slice(0, 7).map((trigger) => <div key={trigger.id} className="flex items-center gap-3 rounded-xl border border-[color:var(--hairline-soft)] px-3 py-2.5"><div className={`h-2 w-2 shrink-0 rounded-full ${trigger.status === 'ready' ? 'bg-orange-500' : 'bg-neutral-300'}`} /><div className="min-w-0 grow"><div className="truncate text-[12.5px] font-medium">{trigger.title}</div><div className="text-[10.5px] text-muted-foreground">{triggerTime(trigger)} · {trigger.status === 'ready' ? 'Pronto' : 'In attesa del momento'}</div></div>{trigger.href && <Link href={trigger.href} className="min-h-10 shrink-0 py-3 text-[10.5px] font-semibold text-orange-700">{trigger.actionLabel}</Link>}</div>)}</div></>}
    </section>
  );
}

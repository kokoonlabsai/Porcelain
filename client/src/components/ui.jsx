import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Loader2, X, Sparkles, Leaf, Droplets, Syringe, HelpCircle, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../lib/store';
import { fileUrl } from '../lib/api';
import { STATUS } from '../lib/format';

/** Wordmark in the style of the balcony sign: the first word in spaced capitals, the rest beneath. */
export function Logo({ name }) {
  const { settings } = useApp();
  const full = (name || settings.clinic_name || 'Clinic').trim();
  const [first, ...rest] = full.split(/\s+/);
  return (
    <Link to="/" className="logo" aria-label={full}>
      <span className="wordmark">
        <b>{first.toUpperCase()}</b>
        {rest.length > 0 && <small>{rest.join(' ')}</small>}
      </span>
    </Link>
  );
}

export function Button({ loading, children, className = '', ...props }) {
  return (
    <button className={`btn ${className}`} disabled={loading || props.disabled} {...props}>
      {loading && <Loader2 size={16} className="spin" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      {label && <span className="label">{label}</span>}
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2 className="serif">{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Badge({ tone = 'grey', children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, tone: 'grey' };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function Empty({ icon: Icon = Sparkles, title, children, action }) {
  return (
    <div className="empty">
      <div className="ico"><Icon size={24} /></div>
      {title && <h3>{title}</h3>}
      {children && <div className="small">{children}</div>}
      {action && <div className="mt-16">{action}</div>}
    </div>
  );
}

export function Skeleton({ h = 18, w = '100%', style }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} />;
}
export function PageSkeleton() {
  return (
    <div className="stack gap-16">
      <Skeleton h={40} w={260} />
      <div className="grid g-3"><Skeleton h={110} /><Skeleton h={110} /><Skeleton h={110} /></div>
      <Skeleton h={240} />
    </div>
  );
}
export function ErrorBox({ error, onRetry }) {
  return (
    <div className="notice red">
      <AlertCircle size={18} />
      <div className="grow">{error?.message || 'Something went wrong'}</div>
      {onRetry && <button className="link" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'err' ? 'err' : ''}`}>
          {t.kind === 'err' ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Avatar({ name = '', lg }) {
  const initials = name.replace(/^dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return <span className={`avatar ${lg ? 'lg' : ''}`}>{initials || '?'}</span>;
}

const CONCERN_STYLE = {
  hair: { icon: Leaf, bg: '#E8ECF4', fg: '#1F3264' },
  skin: { icon: Droplets, bg: '#F4EEE2', fg: '#8A6E3E' },
  wellness: { icon: Sparkles, bg: '#EEF0F2', fg: '#4B5260' },
  procedure: { icon: Syringe, bg: '#E8ECF4', fg: '#2B4482' },
  other: { icon: HelpCircle, bg: '#EFE8DC', fg: '#6E7383' },
};
export function ConcernIcon({ concern, size = 22, box = 46 }) {
  const s = CONCERN_STYLE[concern] || CONCERN_STYLE.other;
  const Icon = s.icon;
  return (
    <span className="ico" style={{ width: box, height: box, borderRadius: '50%', background: s.bg, color: s.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={size} />
    </span>
  );
}

export const CAT_COLORS = { procedures: '#1F3264', hair: '#4B5260', skin: '#A88A55', myths: '#8C5A62', wellness: '#6E8A7A' };

/** Inline bold/italic for the tiny Markdown subset used by articles. */
function inline(text) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    parts.push(t.startsWith('**') ? <strong key={k++}>{t.slice(2, -2)}</strong> : <em key={k++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Renders headings, paragraphs, lists, quotes, bold and italic. */
export function Markdown({ text = '' }) {
  const blocks = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('### ')) { blocks.push(<h3 key={i}>{inline(line.slice(4))}</h3>); i++; continue; }
    if (line.startsWith('## ')) { blocks.push(<h2 key={i}>{inline(line.slice(3))}</h2>); i++; continue; }
    if (line.startsWith('> ')) { blocks.push(<blockquote key={i}>{inline(line.slice(2))}</blockquote>); i++; continue; }
    if (line.startsWith('- ') || /^\d+\. /.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items = [];
      const start = i;
      while (i < lines.length && (ordered ? /^\d+\. /.test(lines[i]) : lines[i].startsWith('- '))) {
        items.push(<li key={i}>{inline(lines[i].replace(/^(- |\d+\. )/, ''))}</li>);
        i++;
      }
      blocks.push(ordered ? <ol key={start}>{items}</ol> : <ul key={start}>{items}</ul>);
      continue;
    }
    const para = [];
    const start = i;
    while (i < lines.length && lines[i].trim() && !/^(#{2,3} |> |- |\d+\. )/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={start}>{inline(para.join(' '))}</p>);
  }
  return <div className="prose">{blocks}</div>;
}

/** An uploaded photo (or PDF) fetched with the session. */
export function AuthImage({ id, mime, alt = '' }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    if (mime !== 'application/pdf') fileUrl(id).then((u) => alive && setSrc(u)).catch(() => {});
    return () => { alive = false; };
  }, [id, mime]);
  if (mime === 'application/pdf') {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 4, color: 'var(--muted)' }}><FileText size={28} /><span className="tiny strong">PDF</span></div>;
  }
  return src ? <img src={src} alt={alt} loading="lazy" /> : <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 0 }} />;
}

export function PhotoGrid({ photos, renderTag, onDelete }) {
  const [open, setOpen] = useState(null);
  const current = open !== null ? photos[open] : null;
  const openFile = async (p, idx) => {
    if (p.mime === 'application/pdf') {
      const url = await fileUrl(p.id);
      window.open(url, '_blank');
    } else setOpen(idx);
  };
  return (
    <>
      <div className="photo-grid">
        {photos.map((p, idx) => (
          <div key={p.id} className="photo" onClick={() => openFile(p, idx)}>
            <AuthImage id={p.id} mime={p.mime} alt={p.caption || ''} />
            {renderTag && <span className="tag">{renderTag(p)}</span>}
            {p.caption && <div className="cap">{p.caption}</div>}
          </div>
        ))}
      </div>
      {current && (
        <div className="lightbox" onClick={() => setOpen(null)}>
          <div className="row" style={{ position: 'absolute', top: 16, right: 16 }}>
            {onDelete && <button className="btn sm" onClick={(e) => { e.stopPropagation(); onDelete(current); setOpen(null); }}>Delete</button>}
            <button className="btn sm icon" aria-label="Close"><X size={18} /></button>
          </div>
          <div className="row" onClick={(e) => e.stopPropagation()}>
            {photos.length > 1 && <button className="btn icon ghost" style={{ color: '#fff' }} onClick={() => setOpen((open - 1 + photos.length) % photos.length)}><ChevronLeft /></button>}
            <AuthImage id={current.id} mime={current.mime} />
            {photos.length > 1 && <button className="btn icon ghost" style={{ color: '#fff' }} onClick={() => setOpen((open + 1) % photos.length)}><ChevronRight /></button>}
          </div>
          {current.caption && <div className="strong">{current.caption}</div>}
        </div>
      )}
    </>
  );
}

/** Pulls { field: message } out of an ApiError for inline form errors. */
export const fieldErrors = (e) => (e && e.details && typeof e.details === 'object' ? e.details : {});

import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, BookOpen } from 'lucide-react';
import { api } from '../lib/api';
import { useLoad } from '../lib/store';
import { ARTICLE_CATS, catLabel } from '../lib/format';
import { Markdown, Skeleton, ErrorBox, Empty, CAT_COLORS } from '../components/ui';
import { ArticleCard } from './Home';

export function LearnList({ inPortal = false }) {
  const [params, setParams] = useSearchParams();
  const c = params.get('c') || '';
  const { data, error, loading, reload } = useLoad(() => api('/articles', { query: { category: c } }), [c]);
  const base = inPortal ? '/portal/learn' : '/learn';
  const body = (
    <>
      <div className="eyebrow">Learn</div>
      <h1 className="serif mt-8" style={{ fontSize: 'clamp(32px, 5vw, 46px)' }}>Straight answers about your skin and hair</h1>
      <p className="muted mt-12" style={{ maxWidth: 600 }}>Written by our dermatologists: what procedures involve, routines that actually work, and the myths worth forgetting.</p>
      <div className="chips mt-24">
        <button className={`chip ${!c ? 'on' : ''}`} onClick={() => setParams({})}>All</button>
        {ARTICLE_CATS.map((x) => (
          <button key={x.id} className={`chip ${c === x.id ? 'on' : ''}`} onClick={() => setParams({ c: x.id })}>{x.label}</button>
        ))}
      </div>
      <div className="mt-24">
        {error ? <ErrorBox error={error} onRetry={reload} /> : loading ? (
          <div className="grid g-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={170} />)}</div>
        ) : !data.articles.length ? (
          <Empty icon={BookOpen} title="Nothing here yet" />
        ) : (
          <div className="grid g-3">{data.articles.map((a) => <ArticleCard key={a.slug} a={a} base={base} />)}</div>
        )}
      </div>
    </>
  );
  return inPortal ? <div className="page">{body}</div> : <div className="contain" style={{ padding: '36px 24px 40px' }}>{body}</div>;
}

export function Article({ inPortal = false }) {
  const { slug } = useParams();
  const { data, error, loading, reload } = useLoad(() => api(`/articles/${slug}`), [slug]);
  const base = inPortal ? '/portal/learn' : '/learn';
  const content = error ? <ErrorBox error={error} onRetry={reload} /> : loading ? (
    <div className="stack gap-16"><Skeleton h={50} /><Skeleton h={20} w="60%" /><Skeleton h={300} /></div>
  ) : (
    <article className="fade-in">
      <Link to={base} className="link row gap-4 small"><ArrowLeft size={15} />All articles</Link>
      <div className="row mt-24 gap-6">
        <span style={{ width: 10, height: 10, borderRadius: 99, background: CAT_COLORS[data.article.category] }} />
        <span className="eyebrow" style={{ color: 'var(--ink-2)' }}>{catLabel(data.article.category)} · {data.article.read_minutes} min read</span>
      </div>
      <h1 className="serif mt-12" style={{ fontSize: 'clamp(32px, 5vw, 48px)', lineHeight: 1.1 }}>{data.article.title}</h1>
      <p className="mt-16" style={{ fontSize: 19, color: 'var(--muted)' }}>{data.article.summary}</p>
      <div className="divider" style={{ margin: '28px 0' }} />
      <Markdown text={data.article.body} />
      <div className="card mt-32" style={{ background: 'var(--brand-soft)', border: 0 }}>
        <div className="row between wrap">
          <div>
            <div className="card-title">Have questions about this?</div>
            <p className="small muted mt-4">Every skin is different. A consultation gets you a plan that fits yours.</p>
          </div>
          <Link to={inPortal ? '/portal/book' : '/book'} className="btn primary"><CalendarPlus size={17} />Book a visit</Link>
        </div>
      </div>
      {data.related.length > 0 && (
        <>
          <h2 className="serif mt-32" style={{ fontSize: 26 }}>Keep reading</h2>
          <div className="grid g-3 mt-16">{data.related.map((a) => <ArticleCard key={a.slug} a={a} base={base} />)}</div>
        </>
      )}
    </article>
  );
  return inPortal ? <div className="page narrow">{content}</div> : <div className="contain narrow" style={{ padding: '32px 16px 40px' }}>{content}</div>;
}

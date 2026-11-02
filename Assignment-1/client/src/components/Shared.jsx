import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, AudioLines, Heart, ListPlus, Play } from 'lucide-react';
import { api, resolveAssetUrl } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export function PageHeading({ eyebrow, title, description, actions }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </div>
  );
}

export function SectionHeading({ title, action, to, children }) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {children && <p>{children}</p>}
      </div>
      {action && (to ? <Link to={to} className="text-link">{action}<ArrowUpRight size={15} /></Link> : <span className="section-action">{action}</span>)}
    </div>
  );
}

export function TrackCard({ track, onAdd, onSave, saved }) {
  if (!track) return null;
  return (
    <article className="track-card">
      <div className="track-art-wrap">
        <Link to={`/app/track/${track.id}`} className="track-art-link" aria-label={`Open ${track.title} details`}>
          <TrackArtwork track={track} />
        </Link>
        <TrackPlaybackButton track={track} className="art-play" />
      </div>
      <div className="track-card-copy">
        <Link to={`/app/track/${track.id}`} className="track-title">{track.title}</Link>
        <span>{track.artist}</span>
        <div className="track-card-meta">
          <span>{track.acoustic?.bpm ?? '—'} BPM</span>
          <span>{track.acoustic?.camelotKey ?? '—'}</span>
        </div>
      </div>
      <div className="track-card-actions">
        <button className={`icon-button ${saved ? 'saved' : ''}`} aria-label={saved ? 'Remove from saved tracks' : 'Save track'} onClick={() => onSave?.(track.id)}><Heart size={16} fill={saved ? 'currentColor' : 'none'} /></button>
        <button className="icon-button" aria-label="Add to queue" onClick={() => onAdd?.(track)}><ListPlus size={17} /></button>
      </div>
    </article>
  );
}

export function TrackPlaybackButton({ track, className = '' }) {
  const audioRef = useRef(null);
  const { token } = useAuth();
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const source = track?.audioAssetUrl
    ? resolveAssetUrl(track.audioAssetUrl)
    : '';

  useEffect(() => {
    audioRef.current?.pause();
    setPlaying(false);
    setError('');
  }, [source]);

  async function togglePlayback() {
    if (!audioRef.current || !source) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    try {
      await audioRef.current.play();
      setPlaying(true);
      setError('');
      api.recordInteraction(token, { trackId: track.id, playedSeconds: 0 })
        .catch((recordError) => setError(`Playback started, but listening history was not saved: ${recordError.message}`));
    } catch (playError) {
      setError(`Audio could not be played: ${playError.message}`);
    }
  }

  return (
    <>
      <button
        className={className}
        aria-label={error || (playing ? `Pause ${track.title}` : `Play ${track.title}`)}
        title={error || (source ? `Play ${track.title}` : 'No audio asset is available')}
        onClick={togglePlayback}
        disabled={!source}
      >
        {playing ? <span>Ⅱ</span> : <Play size={16} fill="currentColor" />}
      </button>
      {error && <span className="sr-only" role="status">{error}</span>}
      {source && <audio ref={audioRef} src={source} preload="none" onEnded={() => setPlaying(false)} onError={() => { setPlaying(false); setError('The audio asset could not be loaded from the backend.'); }} />}
    </>
  );
}

export function TrackArtwork({ track, className = '' }) {
  const image = track?.cover || track?.coverImageUrl;
  const imageUrl = image ? resolveAssetUrl(image) : '';
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  if (!track) return null;

  if (imageFailed) {
    return (
      <div className={`track-art track-art-fallback ${className}`} role="img" aria-label={`${track.title} cover art`}>
        <AudioLines size={30} aria-hidden="true" />
        <span>{track.title}</span>
      </div>
    );
  }

  if (!image) {
    return (
      <div className={`track-art track-art-fallback ${className}`} role="img" aria-label={`${track.title} cover art unavailable`}>
        <AudioLines size={30} aria-hidden="true" />
        <span>{track.title}</span>
      </div>
    );
  }

  return (
    <img
      className={`track-art ${className}`}
      src={imageUrl}
      alt={`${track.title} cover art`}
      loading="lazy"
      onError={() => setImageFailed(true)}
    />
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="empty-state">
      {Icon && <span className="empty-state-icon"><Icon size={22} /></span>}
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, note, tone = 'violet' }) {
  return (
    <article className="stat-card">
      <span className={`stat-icon tone-${tone}`}><Icon size={18} /></span>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        {note && <small>{note}</small>}
      </div>
    </article>
  );
}

export function Notice({ children, tone = 'error' }) {
  if (!children) return null;
  return <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function SentimentBar({ score }) {
  const percentage = Number.isFinite(score) ? Math.round(score * 100) : null;
  const label = percentage == null ? 'No data yet' : score > 0.66 ? 'Feeling good' : score < 0.38 ? 'Low-key' : 'Steady';
  return (
    <div className="sentiment-widget">
      <div className="sentiment-top"><span className="sentiment-spark">✦</span><span>{label}</span><strong>{percentage == null ? '—' : `${percentage}%`}</strong></div>
      <div className="sentiment-track"><span style={{ width: `${percentage ?? 0}%` }} /></div>
      <div className="sentiment-scale"><span>Low energy</span><span>High energy</span></div>
    </div>
  );
}

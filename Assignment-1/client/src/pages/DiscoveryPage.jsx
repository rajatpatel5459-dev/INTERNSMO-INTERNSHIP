import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, AudioLines, Check, ListPlus, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { api } from '../api.js';
import { EmptyState, Notice, PageHeading, SectionHeading, TrackArtwork, TrackCard, TrackPlaybackButton } from '../components/Shared.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export function DiscoveryPage({ mode }) {
  const isDiscover = mode === 'discover';
  const { tracks, lounges, savedTrackIds, toggleSavedTrack, addToQueue, dataError } = useAppData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [genre, setGenre] = useState('All sounds');
  const [maxBpm, setMaxBpm] = useState('200');
  const [feedback, setFeedback] = useState('');

  const genres = ['All sounds', ...new Set(tracks.map((track) => track.genre).filter(Boolean))];
  const filteredTracks = useMemo(() => tracks.filter((track) => {
    const matchesText = `${track.title} ${track.artist} ${track.genre}`.toLowerCase().includes(query.toLowerCase());
    const matchesGenre = genre === 'All sounds' || track.genre === genre;
    const bpm = track.acoustic?.bpm;
    return matchesText && matchesGenre && (bpm == null || bpm <= Number(maxBpm));
  }), [tracks, query, genre, maxBpm]);

  function updateSearch(event) {
    event.preventDefault();
    setSearchParams(query ? { q: query } : {});
  }

  async function saveTrack(trackId, setNotice = setFeedback) {
    try {
      await toggleSavedTrack(trackId);
    } catch (requestError) {
      setNotice(requestError.message);
    }
  }

  async function addTrack(track) {
    const lounge = lounges.find((item) => item.status === 'live') || lounges[0];
    if (!lounge) {
      setFeedback('Create or join a lounge before adding a track.');
      return;
    }
    try {
      await addToQueue(lounge.id, track.id);
      setFeedback(`${track.title} added to ${lounge.name}.`);
    } catch (error) {
      setFeedback(error.message);
    }
  }

  return (
    <div className="page-stack">
      <PageHeading eyebrow={isDiscover ? 'FIND YOUR NEXT SOUND' : 'THE CATALOG'} title={isDiscover ? 'Discover something new.' : 'Search the sound.'} description={isDiscover ? 'Browse tracks and rooms. Find the sound that fits right now.' : 'Tracks, artists, and lounges — all in one place.'} />
      {dataError && <Notice>{dataError}</Notice>}
      {feedback && <Notice tone="info">{feedback}</Notice>}
      <section className="discovery-search-panel">
        <form className="discovery-search-form" onSubmit={updateSearch}>
          <Search size={20} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search songs, artists, genres..." aria-label="Search tracks" />
          <button className="button button-primary button-small">Search</button>
        </form>
        <div className="discovery-filters">
          <label><SlidersHorizontal size={15} /> <span>Filters</span></label>
          <select value={genre} onChange={(event) => setGenre(event.target.value)} aria-label="Filter by genre">{genres.map((item) => <option key={item}>{item}</option>)}</select>
          <label className="bpm-filter"><span>Up to</span><input type="range" min="80" max="200" value={maxBpm} onChange={(event) => setMaxBpm(event.target.value)} /><b>{maxBpm} BPM</b></label>
          <span className="filter-spacer" />
          <span className="filter-note"><Sparkles size={14} /> Acoustic metadata</span>
        </div>
      </section>
      <section className="content-section">
        <SectionHeading title={query ? `Results for “${query}”` : isDiscover ? 'Tracks for the moment' : 'All tracks'} action={`${filteredTracks.length} tracks`} />
        {filteredTracks.length ? (
          <div className="discovery-track-grid">
            {filteredTracks.map((track, index) => (
              <article className="discovery-track-card" key={track.id}>
                <div className="discovery-art"><TrackArtwork track={track} /><TrackPlaybackButton track={track} className="art-play" /><span className="track-rank">#{String(index + 1).padStart(2, '0')}</span></div>
                <div className="discovery-track-copy"><Link to={`/app/track/${track.id}`} className="track-title">{track.title}</Link><span>{track.artist}{track.genre ? ` · ${track.genre}` : ''}</span><div className="acoustic-chips"><i>{track.acoustic?.bpm ?? '—'} BPM</i><i>{track.acoustic?.camelotKey ?? '—'}</i><i>Energy {Number.isFinite(track.acoustic?.energy) ? `${Math.round(track.acoustic.energy * 100)}%` : '—'}</i></div></div>
                <div className="discovery-card-actions"><button className={`icon-button ${savedTrackIds.includes(track.id) ? 'saved' : ''}`} onClick={() => saveTrack(track.id)} aria-label="Save track">{savedTrackIds.includes(track.id) ? <Check size={17} /> : <AudioLines size={17} />}</button><button className="button button-outline button-small" onClick={() => addTrack(track)}><ListPlus size={15} /> Queue</button><Link className="icon-button" to={`/app/track/${track.id}`} aria-label="Track details"><ArrowRight size={16} /></Link></div>
              </article>
            ))}
          </div>
        ) : <EmptyState icon={Search} title="No tracks found" description="Try a different title, artist, genre, or BPM range." />}
      </section>
      <section className="content-section">
        <SectionHeading title="Rooms with a pulse" action="See all lounges" to="/app/lounges">Jump into what the community is listening to.</SectionHeading>
        <div className="discover-lounges">
          {lounges.filter((lounge) => lounge.status === 'live').map((lounge, index) => (
            <Link to={`/app/lounge/${lounge.id}`} className="discover-lounge-card" key={lounge.id}>
              <span className={`lounge-cover lounge-cover-${index + 1}`}><AudioLines size={26} /></span><span><b>{lounge.name}</b><small>{lounge.vibe} · {lounge.participants} listening</small></span><ArrowRight size={16} />
            </Link>
          ))}
          {!lounges.some((lounge) => lounge.status === 'live') && <EmptyState title="No live rooms right now" description="Start a lounge and invite your friends." />}
        </div>
      </section>
    </div>
  );
}

export function TrackDetailsPage() {
  const { trackId } = useParams();
  const navigate = useNavigate();
  const { tracks, lounges, savedTrackIds, toggleSavedTrack, addToQueue } = useAppData();
  const { token } = useAuth();
  const track = tracks.find((item) => item.id === trackId);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState('');
  const [asking, setAsking] = useState(false);

  async function saveCurrentTrack() {
    try {
      await toggleSavedTrack(track.id);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  if (!track) return <div className="page-stack"><EmptyState icon={Search} title="Track not found" description="It may have been removed from the catalog." action={<button className="button button-outline" onClick={() => navigate('/app/discover')}><ArrowLeft size={15} /> Back to discover</button>} /></div>;

  async function askQuestion(event) {
    event.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    setError('');
    try {
      const result = await api.askTrackQuestion(token, track.id, question.trim());
      setAnswer(result);
      setQuestion('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAsking(false);
    }
  }

  async function addCurrentTrack() {
    const lounge = lounges.find((item) => item.status === 'live') || lounges[0];
    if (!lounge) {
      setError('Create or join a lounge before adding this track.');
      return;
    }
    try {
      await addToQueue(lounge.id, track.id);
      setError(`${track.title} added to ${lounge.name}.`);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="page-stack">
      <button className="back-link back-link-button" onClick={() => navigate(-1)}><ArrowLeft size={15} /> Back</button>
      {error && <Notice tone="info">{error}</Notice>}
      <section className="track-detail-hero">
        <TrackArtwork track={track} className="track-detail-cover" />
        <div className="track-detail-copy">
          <div className="eyebrow">TRACK PROFILE · {track.genre || 'MUSIC'}</div>
          <h1>{track.title}</h1><p>{track.artist} <span>·</span> {track.album}</p>
          <div className="track-detail-actions"><TrackPlaybackButton track={track} className="button button-primary" /><button className="button button-outline" onClick={addCurrentTrack}><ListPlus size={16} /> Add to queue</button><button className={`button button-outline ${savedTrackIds.includes(track.id) ? 'saved' : ''}`} onClick={saveCurrentTrack}>{savedTrackIds.includes(track.id) ? <Check size={15} /> : <AudioLines size={15} />} {savedTrackIds.includes(track.id) ? 'Saved' : 'Save track'}</button></div>
        </div>
      </section>
      <div className="track-detail-grid">
        <section className="panel acoustic-panel">
          <div className="panel-heading"><div><div className="eyebrow">THE ACOUSTIC PROFILE</div><h2>Built for a smooth segue.</h2></div><span className="panel-icon"><AudioLines size={18} /></span></div>
          <div className="acoustic-stat-grid">
            <AcousticValue label="Tempo" value={track.acoustic?.bpm} unit="BPM" />
            <AcousticValue label="Camelot key" value={track.acoustic?.camelotKey} unit="wheel" />
            <AcousticValue label="Energy" value={track.acoustic?.energy == null ? '—' : `${Math.round(track.acoustic.energy * 100)}%`} unit="intensity" />
            <AcousticValue label="Valence" value={track.acoustic?.valence == null ? '—' : `${Math.round(track.acoustic.valence * 100)}%`} unit="mood" />
          </div>
          <div className="match-explainer"><Sparkles size={16} /><span><b>AI DJ match rules</b> — tempo within ±8%, with a matching, adjacent, or relative Camelot key.</span></div>
        </section>
        <section className="panel track-about-panel">
          <div className="eyebrow">LINER NOTES</div><h2>A little more about this track.</h2>
          <p>{track.timeline?.[0]?.text || 'No liner notes are available for this track.'}</p>
          <div className="metadata-tags">{track.genre && <span>{track.genre}</span>}{track.durationSeconds && <span>{formatDuration(track.durationSeconds)}</span>}{track.acoustic?.camelotKey && <span>{track.acoustic.camelotKey} key</span>}</div>
        </section>
      </div>
      <section className="panel ai-question-panel">
        <div className="panel-heading"><div><div className="eyebrow">ASK THE AI DJ</div><h2>Curious about this track?</h2><p>Answers are grounded in the track’s acoustic profile and metadata.</p></div><span className="panel-icon panel-icon-violet"><Sparkles size={18} /></span></div>
        <form className="ai-question-form" onSubmit={askQuestion}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about the sample, artist, or sound…" aria-label="Ask the AI DJ about this track" /><button className="button button-primary" disabled={asking}><Sparkles size={15} /> {asking ? 'Asking…' : 'Ask'}</button></form>
        {answer && <div className="ai-answer"><div><b>You asked</b><span>{answer.question}</span></div><div><b>AI DJ</b><p>{answer.answer}</p><small>Grounded in: {(answer.sources || []).map((source) => source.text || source.type).filter(Boolean).join(', ') || 'track metadata'}</small></div></div>}
        {!answer && <div className="suggested-questions"><button onClick={() => setQuestion('Where is this sample from?')}>Where is this sample from?</button><button onClick={() => setQuestion('What makes this track a good segue?')}>What makes this track a good segue?</button><button onClick={() => setQuestion('Tell me a bit of trivia.')}>Tell me a bit of trivia.</button></div>}
      </section>
    </div>
  );
}

function AcousticValue({ label, value, unit }) {
  return <div className="acoustic-value"><span>{label}</span><strong>{value}</strong><small>{unit}</small></div>;
}

function formatDuration(seconds = 0) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

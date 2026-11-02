import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Clock3,
  Disc3,
  Headphones,
  Heart,
  Music2,
  Radio,
  Sparkles,
  Users,
} from 'lucide-react';
import { EmptyState, Notice, PageHeading, SectionHeading, StatCard, TrackArtwork, TrackPlaybackButton } from '../components/Shared.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export function LibraryPage() {
  const { user } = useAuth();
  const { tracks, lounges, savedTrackIds, toggleSavedTrack, recentTracks } = useAppData();
  const canCreateLounge = user?.role === 'host' || user?.role === 'admin';
  const [activeTab, setActiveTab] = useState('Saved tracks');
  const [notice, setNotice] = useState('');
  const saved = savedTrackIds.map((id) => tracks.find((track) => track.id === id)).filter(Boolean);
  const recent = recentTracks;

  return (
    <div className="page-stack">
      <PageHeading eyebrow="YOUR PERSONAL SOUNDTRACK" title="Your library." description="The tracks, rooms, and moments you want to come back to." actions={<Link className="button button-primary" to="/app/discover"><Music2 size={16} /> Explore tracks</Link>} />
      {notice && <Notice>{notice}</Notice>}
      <div className="library-summary">
        <div><span className="library-summary-icon"><Heart size={17} /></span><b>{saved.length}</b><small>Saved tracks</small></div>
        <div><span className="library-summary-icon blue"><Clock3 size={17} /></span><b>{recent.length}</b><small>Recently played</small></div>
        <div><span className="library-summary-icon coral"><Headphones size={17} /></span><b>{lounges.length}</b><small>Lounges</small></div>
      </div>
      <div className="library-tabs" role="tablist" aria-label="Library views">
        {['Saved tracks', 'Recently played', 'My lounges'].map((tab) => <button key={tab} role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}
      </div>
      {activeTab === 'Saved tracks' && (
        <section className="content-section">
          <SectionHeading title="Saved for later" action={`${saved.length} tracks`} />
          {saved.length ? <div className="library-track-list">{saved.map((track, index) => <LibraryTrack key={track.id} track={track} index={index} onRemove={async () => { try { await toggleSavedTrack(track.id); } catch (error) { setNotice(error.message); } }} />)}</div> : <EmptyState icon={Heart} title="No saved tracks yet" description="Save tracks you want to revisit. Your favorites will show up here." action={<Link to="/app/discover" className="button button-primary"><Music2 size={15} /> Explore tracks</Link>} />}
        </section>
      )}
      {activeTab === 'Recently played' && (
        <section className="content-section">
          <SectionHeading title="Recently played" action={`${recent.length} tracks`} />
          {recent.length ? <div className="library-track-list">{recent.map((track, index) => <LibraryTrack key={track.id} track={track} index={index} />)}</div> : <EmptyState icon={Clock3} title="Nothing played just yet" description="Play a track to start building your listening history." action={<Link to="/app/discover" className="button button-primary">Discover tracks</Link>} />}
        </section>
      )}
      {activeTab === 'My lounges' && (
        <section className="content-section">
          <SectionHeading title="Your rooms" action={`${lounges.length} lounges`} />
          {lounges.length ? <div className="library-lounge-grid">{lounges.map((lounge) => <Link className="library-lounge-card" key={lounge.id} to={`/app/lounge/${lounge.id}`}><div className="library-lounge-art"><AudioLines size={22} /></div><div><b>{lounge.name}</b><span>{lounge.vibe} · {lounge.participants} listeners</span></div><span className={`status-pill ${lounge.status === 'live' ? 'status-live' : ''}`}>{lounge.status}</span></Link>)}</div> : <EmptyState icon={Headphones} title="No lounges yet" description={canCreateLounge ? 'Create a room or join with an invite code.' : 'Join a lounge with an invite code.'} action={<Link to={canCreateLounge ? '/app/lounges/create' : '/app/lounges/join'} className="button button-primary">{canCreateLounge ? 'Create a lounge' : 'Join with code'}</Link>} />}
        </section>
      )}
      <div className="library-footnote"><Sparkles size={15} /> Your saved tracks and recently played music shape your acoustic taste profile.</div>
    </div>
  );
}

function LibraryTrack({ track, index, onRemove }) {
  return (
    <div className="library-track-row">
      <span className="library-index">{String(index + 1).padStart(2, '0')}</span><TrackArtwork track={track} />
      <TrackPlaybackButton track={track} className="library-play" />
      <Link to={`/app/track/${track.id}`} className="library-track-copy"><b>{track.title}</b><span>{track.artist} · {track.album}</span></Link>
      <span className="library-track-meta">{track.acoustic?.bpm} BPM · {track.acoustic?.camelotKey}</span><span className="library-track-duration">{formatDuration(track.durationSeconds)}</span>
      {onRemove && <button className="icon-button saved" aria-label={`Remove ${track.title} from library`} onClick={onRemove}><Heart size={16} fill="currentColor" /></button>}
    </div>
  );
}

export function AnalyticsPage() {
  const { lounges, tasteProfile, recentTracks } = useAppData();
  const { token } = useAuth();
  const [selectedLoungeId, setSelectedLoungeId] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState('');
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const playedTracks = useMemo(() => recentTracks.slice(0, 5), [recentTracks]);
  const metrics = analytics?.session || {};
  const sentimentTimeline = (analytics?.sentiment?.timeline || []).filter((point) => Number.isFinite(point.score));
  const sentimentPath = useMemo(() => {
    if (sentimentTimeline.length < 2) return '';
    return sentimentTimeline.map((point, index) => {
      const x = (index / (sentimentTimeline.length - 1)) * 500;
      const score = Math.max(-1, Math.min(1, point.score));
      const y = 80 - score * 70;
      return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [sentimentTimeline]);

  useEffect(() => {
    if (!selectedLoungeId && lounges.length) setSelectedLoungeId(lounges[0].id);
  }, [lounges, selectedLoungeId]);

  useEffect(() => {
    if (!selectedLoungeId || !token) return undefined;
    let active = true;
    setLoadingAnalytics(true);
    api.loungeAnalytics(token, selectedLoungeId)
      .then((result) => {
        if (active) {
          setAnalytics(result.analytics);
          setAnalyticsError('');
        }
      })
      .catch((error) => {
        if (active) setAnalyticsError(error.message);
      })
      .finally(() => {
        if (active) setLoadingAnalytics(false);
      });
    return () => { active = false; };
  }, [selectedLoungeId, token]);

  return (
    <div className="page-stack">
      <PageHeading eyebrow="YOUR LISTENING, IN CONTEXT" title="Session analytics." description="A clearer picture of how your rooms and listening sessions move." actions={<button className="button button-outline button-small" onClick={() => window.print()}><Activity size={15} /> Export snapshot</button>} />
      {analyticsError && <Notice>{analyticsError}</Notice>}
      <div className="analytics-filter-row"><span><Radio size={15} /> SESSION</span><label className="analytics-lounge-filter"><span className="sr-only">Select lounge session</span><select value={selectedLoungeId} onChange={(event) => setSelectedLoungeId(event.target.value)}><option value="">Select a lounge</option>{lounges.map((lounge) => <option value={lounge.id} key={lounge.id}>{lounge.name}</option>)}</select></label><span className="analytics-updated">{loadingAnalytics ? 'Loading…' : 'Backend session data'}</span></div>
      <div className="stats-grid analytics-stats">
        <StatCard icon={Clock3} label="Listening time" value={analytics ? `${((metrics.durationMinutes || 0) / 60).toFixed(1)} hrs` : '—'} note={analytics ? `${metrics.tracksPlayed || 0} tracks played` : 'Select a lounge for analytics'} />
        <StatCard icon={Users} label="Peak room size" value={analytics ? `${metrics.peakParticipants || 0} people` : '—'} note={analytics ? `${metrics.totalParticipants || 0} participants` : 'Select a lounge for analytics'} tone="blue" />
        <StatCard icon={Radio} label="Soundclash battles" value={analytics ? String(metrics.soundclashBattles || 0) : '—'} note={analytics ? `${metrics.totalEvents || 0} recorded events` : 'Select a lounge for analytics'} tone="pink" />
        <StatCard icon={Sparkles} label="AI DJ questions" value={analytics ? String(metrics.aiDjQuestions || 0) : '—'} note={analytics ? `${metrics.aiDjSegues || 0} AI segues` : 'Select a lounge for analytics'} tone="coral" />
      </div>
      <div className="analytics-grid">
        <section className="panel analytics-chart-panel">
          <div className="panel-heading"><div><div className="eyebrow">SESSION DURATION</div><h2>Hours in the room</h2><p>{analytics?.lounge?.name || 'Select a lounge to see its session.'}</p></div><div className="chart-total"><strong>{analytics ? ((metrics.durationMinutes || 0) / 60).toFixed(1) : '—'}</strong><span>HOURS</span></div></div>
          {!analytics && !loadingAnalytics && <EmptyState icon={Clock3} title="No session selected" description="Choose one of your lounges to load its analytics." />}
          {analytics && <p className="analytics-session-summary">{metrics.tracksPlayed || 0} tracks played during this session.</p>}
        </section>
        <section className="panel sentiment-chart-panel">
          <div className="panel-heading"><div><div className="eyebrow">ROOM ENERGY</div><h2>Sentiment over time</h2><p>How the crowd mood shifted.</p></div><span className="chart-range">LIVE SESSION</span></div>
          <div className="sentiment-chart"><div className="sentiment-y-labels"><span>HIGH</span><span>STEADY</span><span>LOW</span></div><div className="sentiment-chart-area"><div className="sentiment-chart-grid"><i /><i /><i /></div>          <svg viewBox="0 0 500 160" preserveAspectRatio="none" role="img" aria-label="Room sentiment timeline"><defs><linearGradient id="sentimentGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#9b7bff" stopOpacity=".3" /><stop offset="100%" stopColor="#9b7bff" stopOpacity="0" /></linearGradient></defs>{sentimentPath && <><path d={`${sentimentPath} L500,160 L0,160Z`} fill="url(#sentimentGradient)" /><path d={sentimentPath} fill="none" stroke="#a58bff" strokeWidth="3" vectorEffect="non-scaling-stroke" /></>}</svg><div className="sentiment-x-labels"><span>Start</span><span>Session timeline</span><span>Now</span></div></div></div>
          <div className="chart-sentiment-caption"><span><i /> {sentimentTimeline.length} sentiment updates</span><b>{Number.isFinite(analytics?.sentiment?.current) ? `${Math.round(analytics.sentiment.current * 100)}%` : '—'}</b></div>
        </section>
      </div>
      <div className="analytics-grid">
        <section className="panel top-tracks-panel">
          <div className="panel-heading"><div><div className="eyebrow">THE CROWD'S FAVORITES</div><h2>Top tracks</h2></div><Link to="/app/discover" className="text-link">Explore <ArrowUpRight size={14} /></Link></div>
          {playedTracks.length ? <div className="top-track-list">{playedTracks.slice(0, 4).map((track, index) => <div className="top-track-row" key={track.id}><span>{String(index + 1).padStart(2, '0')}</span><TrackArtwork track={track} /><div><b>{track.title}</b><small>{track.artist}</small></div></div>)}</div> : <EmptyState icon={Disc3} title="No listening history yet" description="Your played tracks will appear here when the backend has recorded them." />}
        </section>
        <section className="panel acoustic-trends-panel">
          <div className="panel-heading"><div><div className="eyebrow">YOUR ACOUSTIC SIGNATURE</div><h2>Where your sound lives</h2></div><span className="panel-icon"><AudioLines size={17} /></span></div>
          <div className="trend-row"><span>Average tempo</span><b>{Number.isFinite(tasteProfile?.avgBpm) ? tasteProfile.avgBpm : '—'} <small>BPM</small></b><span className="trend-change"><ArrowUpRight size={13} /> {tasteProfile?.totalTracksListened ?? '—'} tracks</span></div>
          <div className="trend-row"><span>Energy level</span><div className="trend-meter"><i style={{ width: `${Number.isFinite(tasteProfile?.avgEnergy) ? Math.round(tasteProfile.avgEnergy * 100) : 0}%` }} /></div><b>{Number.isFinite(tasteProfile?.avgEnergy) ? `${Math.round(tasteProfile.avgEnergy * 100)}%` : '—'}</b></div>
          <div className="trend-row"><span>Valence</span><div className="trend-meter trend-meter-blue"><i style={{ width: `${Number.isFinite(tasteProfile?.avgValence) ? Math.round(tasteProfile.avgValence * 100) : 0}%` }} /></div><b>{Number.isFinite(tasteProfile?.avgValence) ? `${Math.round(tasteProfile.avgValence * 100)}%` : '—'}</b></div>
          <div className="top-keys"><span>RECENTLY PLAYED KEYS</span><div>{[...new Set(recentTracks.map((track) => track.acoustic?.camelotKey).filter(Boolean))].slice(0, 4).map((key) => <i key={key}>{key}</i>)}</div></div>
        </section>
      </div>
      <div className="analytics-footer"><span><Disc3 size={15} /> {lounges.length} rooms in your history</span><Link to="/app/profile">View your acoustic taste <ArrowRight size={14} /></Link></div>
    </div>
  );
}

function formatDuration(seconds = 0) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

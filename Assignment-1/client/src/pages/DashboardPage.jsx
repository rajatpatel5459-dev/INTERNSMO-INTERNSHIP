import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  AudioLines,
  Clock3,
  Disc3,
  Headphones,
  Plus,
  Radio,
  Sparkles,
  Users,
} from 'lucide-react';
import { PageHeading, SectionHeading, SentimentBar, TrackCard, TrackArtwork, Notice } from '../components/Shared.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAppData } from '../context/AppDataContext.jsx';

export function DashboardPage() {
  const { user } = useAuth();
  const { tracks, lounges, savedTrackIds, toggleSavedTrack, addToQueue, dataError, recommendationTracks, recentTracks, tasteProfile, dashboard } = useAppData();
  const [feedback, setFeedback] = useState('');
  const activeLounge = lounges.find((lounge) => lounge.status === 'live') || dashboard?.activeLounges?.[0];
  const canCreateLounge = user?.role === 'host' || user?.role === 'admin';
  const genres = [...new Set(recentTracks.map((track) => track.genre).filter(Boolean))].slice(0, 3);

  async function saveTrack(trackId) {
    try {
      await toggleSavedTrack(trackId);
    } catch (error) {
      setFeedback(error.message);
    }
  }

  async function addTrack(track) {
    if (!activeLounge) {
      setFeedback('Create or join a lounge before adding a track.');
      return;
    }
    try {
      await addToQueue(activeLounge.id, track.id);
      setFeedback(`${track.title} added to ${activeLounge.name}.`);
    } catch (error) {
      setFeedback(error.message);
    }
  }

  return (
    <div className="page-stack">
      <PageHeading eyebrow="YOUR MUSIC WORLD" title={`Good evening, ${user?.displayName?.split(' ')[0] || 'there'}.`} description="Here’s what’s happening in your music world." actions={canCreateLounge && <Link className="button button-primary" to="/app/lounges/create"><Plus size={16} /> Create a lounge</Link>} />
      {dataError && <Notice>{dataError}</Notice>}
      {feedback && <Notice tone="info">{feedback}</Notice>}

      <section className="dashboard-hero">
        <div className="dashboard-hero-art"><TrackArtwork track={tracks.find((track) => track.id === activeLounge?.currentTrackId)} /></div>
        <div className="dashboard-hero-overlay" />
        <div className="dashboard-hero-content">
          <div className="dashboard-hero-kicker">{activeLounge && <span className="live-dot" />}{activeLounge ? ' YOUR ROOM IS LIVE' : ' YOUR MUSIC WORLD'}</div>
          <h2>{activeLounge?.name || 'Your next favorite room is waiting.'}</h2>
          <p>{activeLounge ? `${activeLounge.participants} people listening · ${activeLounge.vibe}` : canCreateLounge ? 'Start a lounge or join your friends to get the music moving.' : 'Join your friends in a lounge and help shape the set.'}</p>
          <Link className="button button-white" to={activeLounge ? `/app/lounge/${activeLounge.id}` : canCreateLounge ? '/app/lounges/create' : '/app/lounges/join'}>{activeLounge ? 'Rejoin the room' : canCreateLounge ? 'Create your first lounge' : 'Join a lounge'} <ArrowRight size={16} /></Link>
        </div>
        {activeLounge && <div className="dashboard-hero-sentiment"><SentimentBar score={activeLounge.sentiment} /></div>}
      </section>

      <div className="quick-actions">
        {canCreateLounge && <Link to="/app/lounges/create" className="quick-action-card"><span className="quick-action-icon"><Plus size={20} /></span><span><strong>Create a lounge</strong><small>Set the room's vibe</small></span><ArrowRight size={16} /></Link>}
        <Link to="/app/lounges/join" className="quick-action-card"><span className="quick-action-icon blue"><Users size={20} /></span><span><strong>Join a lounge</strong><small>Enter an invite code</small></span><ArrowRight size={16} /></Link>
        <Link to="/app/discover" className="quick-action-card"><span className="quick-action-icon coral"><Radio size={20} /></span><span><strong>Find your next track</strong><small>Explore the sound</small></span><ArrowRight size={16} /></Link>
      </div>

      <section className="content-section">
        <SectionHeading title="Picked for your next set" action="Explore all" to="/app/discover">Matched to your listening style and the room’s current energy.</SectionHeading>
        {recommendationTracks.length ? (
          <div className="track-grid">
            {recommendationTracks.slice(0, 4).map((track) => <TrackCard key={track.id} track={track} onAdd={addTrack} onSave={saveTrack} saved={savedTrackIds.includes(track.id)} />)}
          </div>
        ) : <div className="inline-empty"><Sparkles size={18} /><span>No recommendations yet. Play a few tracks to tune your taste profile.</span></div>}
      </section>

      <div className="dashboard-lower-grid">
        <section className="content-section">
          <SectionHeading title="Your lounges" action="See all" to="/app/lounges">Rooms you’ve hosted or joined.</SectionHeading>
          <div className="lounge-list">
            {lounges.slice(0, 3).map((lounge) => {
              const currentTrack = tracks.find((track) => track.id === lounge.currentTrackId);
              return (
                <Link to={`/app/lounge/${lounge.id}`} className="lounge-list-card" key={lounge.id}>
                  <TrackArtwork track={currentTrack} />
                  <span className="lounge-list-copy"><strong>{lounge.name}</strong><small>{lounge.vibe} · {lounge.participants} listening</small></span>
                  <span className={`status-pill ${lounge.status === 'live' ? 'status-live' : ''}`}>{lounge.status === 'live' && <i />}{lounge.status}</span>
                  <ArrowRight size={15} />
                </Link>
              );
            })}
            {!lounges.length && <div className="inline-empty"><Headphones size={18} /><span>Your rooms will show up here.</span><Link to={canCreateLounge ? '/app/lounges/create' : '/app/lounges/join'}>{canCreateLounge ? 'Create one' : 'Join one'}</Link></div>}
          </div>
        </section>
        <section className="content-section taste-section">
          <SectionHeading title="Your acoustic taste" action="View analytics" to="/app/analytics">The shape of your recent listening.</SectionHeading>
          <div className="taste-card">
            <div className="taste-card-head"><span className="taste-icon"><AudioLines size={17} /></span><span>YOUR SOUND, LATELY</span></div>
            <div className="taste-main"><strong>{tasteProfile?.totalTracksListened ? 'Your listening profile' : 'Not enough listening data yet'}</strong><span>{tasteProfile?.totalTracksListened ? `${tasteProfile.totalTracksListened} tracks analyzed` : 'Listen to tracks to build your taste profile.'}</span></div>
            <TasteMeter label="Energy" value={Number.isFinite(tasteProfile?.avgEnergy) ? Math.round(tasteProfile.avgEnergy * 100) : null} color="violet" />
            <TasteMeter label="Valence" value={Number.isFinite(tasteProfile?.avgValence) ? Math.round(tasteProfile.avgValence * 100) : null} color="blue" />
            <TasteMeter label="Tempo" value={Number.isFinite(tasteProfile?.avgBpm) && tasteProfile.avgBpm > 0 ? Math.min(100, Math.round((tasteProfile.avgBpm / 180) * 100)) : null} color="pink" />
            <div className="taste-genres">{genres.length ? genres.map((genre) => <span key={genre}>{genre}</span>) : <span>No genre data yet</span>}</div>
          </div>
        </section>
      </div>

      <section className="content-section">
        <SectionHeading title="Recently played" action="Open library" to="/app/library">Pick up where you left off.</SectionHeading>
        <div className="recent-track-row">
          {recentTracks.slice(0, 5).map((track) => <RecentTrack key={track.id} track={track} />)}
        </div>
        {!recentTracks.length && <div className="inline-empty"><Clock3 size={18} /><span>Your listening history will appear here.</span></div>}
      </section>
      <div className="home-footnote"><Clock3 size={14} /> Your recent listening helps tune recommendations. <Link to="/app/settings">Manage your data</Link></div>
    </div>
  );
}

function TasteMeter({ label, value, color }) {
  const percentage = value == null ? 0 : value;
  return <div className={`taste-meter taste-${color}`}><div><span>{label}</span><b>{value == null ? '—' : `${value}%`}</b></div><i><span style={{ width: `${percentage}%` }} /></i></div>;
}

function RecentTrack({ track }) {
  return (
    <Link to={`/app/track/${track.id}`} className="recent-track">
      <TrackArtwork track={track} />
      <div><strong>{track.title}</strong><span>{track.artist}</span></div>
      <Disc3 size={16} />
    </Link>
  );
}

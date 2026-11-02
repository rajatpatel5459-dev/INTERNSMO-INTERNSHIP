import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Copy, Headphones, Link2, LockKeyhole, Plus, Radio, Users } from 'lucide-react';
import { api } from '../api.js';
import { EmptyState, Notice, PageHeading, SectionHeading, TrackArtwork } from '../components/Shared.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export function LoungesPage() {
  const { user } = useAuth();
  const { lounges, tracks } = useAppData();
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const canCreateLounge = user?.role === 'host' || user?.role === 'admin';

  async function copyInvite(code) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/app/lounges/join?code=${code}`);
      setCopied(code);
      setError('');
    } catch (copyError) {
      setError(`Could not copy the invite link: ${copyError.message}`);
    }
  }

  return (
    <div className="page-stack">
      <PageHeading eyebrow="YOUR LISTENING ROOMS" title="DJ Lounges." description="Join a room, invite your people, and let the crowd shape the set." actions={<><Link className="button button-outline" to="/app/lounges/join"><Link2 size={16} /> Join with code</Link>{canCreateLounge && <Link className="button button-primary" to="/app/lounges/create"><Plus size={16} /> Create a lounge</Link>}</>} />
      {error && <Notice>{error}</Notice>}
      <div className="lounge-summary-strip"><span><Radio size={17} /> <b>{lounges.filter((lounge) => lounge.status === 'live').length}</b> rooms live</span><span><Users size={17} /> Your recent rooms, all in one place</span><span><LockKeyhole size={16} /> Invite-only by code</span></div>
      <section className="content-section">
        <SectionHeading title="Recent rooms" action={`${lounges.length} total`} />
        {lounges.length ? (
          <div className="lounge-card-grid">
            {lounges.map((lounge) => {
              const track = tracks.find((item) => item.id === lounge.currentTrackId);
              return (
                <article className="lounge-card" key={lounge.id}>
                  <div className="lounge-card-art"><TrackArtwork track={track} /><span className={`lounge-status ${lounge.status === 'live' ? 'is-live' : ''}`}>{lounge.status === 'live' && <i />}{lounge.status}</span><div className="lounge-card-art-fade" /></div>
                  <div className="lounge-card-body">
                    <div className="lounge-card-kicker">{lounge.vibe || 'OPEN FORMAT'} · HOSTED BY {lounge.host || 'YOU'}</div>
                    <h3>{lounge.name}</h3>
                    <div className="lounge-card-meta"><span><Users size={14} /> {lounge.participants}/{lounge.maxParticipants} listening</span><span><Headphones size={14} /> {track?.title || 'No track selected'}</span></div>
                    <div className="lounge-card-actions"><Link className="button button-primary button-small" to={`/app/lounge/${lounge.id}`}>{lounge.status === 'live' ? 'Join room' : 'Open room'} <ArrowRight size={14} /></Link><button className="button button-outline button-small" onClick={() => copyInvite(lounge.inviteCode)}><Copy size={14} /> {copied === lounge.inviteCode ? 'Copied' : 'Invite'}</button></div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <EmptyState icon={Headphones} title="Your first room is waiting" description={canCreateLounge ? 'Create a lounge and invite friends to start building a set together.' : 'Join a lounge with an invite code to start listening with friends.'} action={canCreateLounge ? <Link className="button button-primary" to="/app/lounges/create"><Plus size={15} /> Create a lounge</Link> : <Link className="button button-primary" to="/app/lounges/join"><Link2 size={15} /> Join with code</Link>} />}
      </section>
    </div>
  );
}

export function CreateLoungePage() {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { tracks, addLounge } = useAppData();
  const canCreateLounge = user?.role === 'host' || user?.role === 'admin';
  const [form, setForm] = useState({
    name: '',
    description: '',
    seedTrackId: tracks[0]?.id || '',
    vibeProfile: 'High-Energy EDM',
    bpmTolerancePct: 8,
    aiOutroWindowSeconds: 5,
    aiVerbosity: 'normal',
    soundclashEnabled: true,
    maxParticipants: 40,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedTrack = tracks.find((track) => track.id === form.seedTrackId);

  function update(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  }

  if (!canCreateLounge) {
    return (
      <div className="page-stack">
        <PageHeading eyebrow="HOST ACCESS REQUIRED" title="Create a DJ lounge." description="Lounge creation is available to Host and Admin accounts." />
        <Notice>Listeners can join a room with an invite code. Ask a Host to create and share a lounge.</Notice>
        <Link className="button button-outline" to="/app/lounges/join"><Link2 size={16} /> Join with code</Link>
      </div>
    );
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Give your lounge a name before creating it.');
      return;
    }
    setLoading(true);
    try {
      let lounge;
      const result = await api.createLounge(token, {
        ...form,
        maxParticipants: Number(form.maxParticipants),
        bpmTolerancePct: Number(form.bpmTolerancePct),
        aiOutroWindowSeconds: Number(form.aiOutroWindowSeconds),
      });
      const created = result.lounge;
      lounge = {
        ...created,
        id: created.id || created._id,
        host: user.displayName,
        currentTrackId: form.seedTrackId || null,
        participants: 1,
        queue: [],
        messages: [],
        battle: { active: false, candidates: [] },
      };
      addLounge(lounge);
      navigate(`/app/lounge/${lounge.id}?invite=${lounge.inviteCode}`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeading eyebrow="SET THE SCENE" title="Create a DJ lounge." description="Give the room a starting point. Your AI DJ will help the set find its flow." />
      {error && <Notice>{error}</Notice>}
      <form className="create-lounge-layout" onSubmit={submit}>
        <div className="panel create-form-panel">
          <div className="panel-heading"><div><div className="eyebrow">01 — THE ROOM</div><h2>Make it yours.</h2><p>Choose a name and a vibe to get started.</p></div><span className="panel-icon"><Radio size={18} /></span></div>
          <label className="field-label">Lounge name<input name="name" value={form.name} onChange={update} placeholder="e.g. After Hours Frequency" maxLength="60" required /></label>
          <label className="field-label">Description <span className="optional-label">OPTIONAL</span><textarea name="description" rows="3" maxLength="180" value={form.description} onChange={update} placeholder="Set the scene for your listeners…" /></label>
          <div className="form-two-col">
            <label className="field-label">Room vibe<select name="vibeProfile" value={form.vibeProfile} onChange={update}><option value="High-Energy EDM">High-Energy Electronic</option><option value="Lo-Fi Chill">Lo-fi / Chill</option><option value="Hip-Hop">Hip-Hop</option><option value="Pop Hits">Pop Hits</option><option value="Acoustic">Acoustic</option><option value="Mixed">Open Format</option></select></label>
            <label className="field-label">Starting track<select name="seedTrackId" value={form.seedTrackId} onChange={update}>{tracks.map((track) => <option value={track.id} key={track.id}>{track.title} — {track.artist}</option>)}</select></label>
          </div>
          <div className="panel-subsection">
            <div className="subsection-title"><span>02 — THE DJ RULES</span><small>Fine-tune the set</small></div>
            <div className="form-two-col">
              <label className="field-label">BPM tolerance <b className="field-value">{form.bpmTolerancePct}%</b><input type="range" min="4" max="16" name="bpmTolerancePct" value={form.bpmTolerancePct} onChange={update} /></label>
              <label className="field-label">AI DJ style<select name="aiVerbosity" value={form.aiVerbosity} onChange={update}><option value="quiet">Keep it concise</option><option value="normal">A little context</option><option value="verbose">Tell the story</option></select></label>
            </div>
            <label className="field-label">AI segue timing <b className="field-value">{form.aiOutroWindowSeconds}s before track ends</b><input type="range" min="5" max="30" step="5" name="aiOutroWindowSeconds" value={form.aiOutroWindowSeconds} onChange={update} /></label>
            <label className="field-label capacity-label">Room capacity<select name="maxParticipants" value={form.maxParticipants} onChange={update}><option value="20">Up to 20 people</option><option value="40">Up to 40 people</option><option value="50">Up to 50 people</option></select></label>
            <label className="toggle-row"><span><b>Enable Soundclash</b><small>Let the crowd submit tracks for a timed battle.</small></span><input type="checkbox" name="soundclashEnabled" checked={form.soundclashEnabled} onChange={update} /><i /></label>
          </div>
          <button className="button button-primary button-full" disabled={loading}>{loading ? 'Creating your room…' : 'Create lounge'} <ArrowRight size={16} /></button>
        </div>
        <aside className="create-preview-column">
          <div className="create-preview panel">
            <div className="eyebrow">YOUR ROOM PREVIEW</div>
            {selectedTrack && <TrackArtwork track={selectedTrack} className="create-preview-art" />}
            <div className="create-preview-info"><span className="status-live"><i /> READY TO GO</span><h3>{form.name || 'Your new lounge'}</h3><span>{form.vibeProfile}</span></div>
            <div className="preview-track"><span className="preview-play"><Radio size={16} /></span><div><small>STARTING TRACK</small><b>{selectedTrack?.title || 'Choose a track'}</b><span>{selectedTrack?.artist}</span></div></div>
            <div className="preview-facts"><span><Users size={14} /> {form.maxParticipants} max</span><span><Headphones size={14} /> ±{form.bpmTolerancePct}% BPM</span></div>
          </div>
          <div className="invite-tip"><LockKeyhole size={16} /><p><b>Your room, your circle.</b><br />You'll get an invite code and link as soon as the lounge is created.</p></div>
        </aside>
      </form>
    </div>
  );
}

export function JoinLoungePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { lounges, tracks, addLounge } = useAppData();
  const [code, setCode] = useState((searchParams.get('code') || '').toUpperCase());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const recent = useMemo(() => lounges.slice(0, 3), [lounges]);

  async function submit(event) {
    event.preventDefault();
    const inviteCode = extractInviteCode(code);
    setError('');
    setLoading(true);
    try {
      const result = await api.joinLounge(token, inviteCode);
      const joined = result.lounge;
      const loungeId = joined.id || joined._id;
      addLounge(joined);
      navigate(`/app/lounge/${loungeId}`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeading eyebrow="COME ON IN" title="Join a DJ lounge." description="Enter an invite code or open a room link from a friend." />
      <div className="join-page-grid">
        <section className="panel join-form-panel">
          <div className="join-icon"><Link2 size={20} /></div>
          <h2>Find your room.</h2><p>Room codes are short, easy to share, and only work for the lounge they belong to.</p>
          <form onSubmit={submit}>
            <label className="field-label">Invite code or link<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Enter invite code" autoComplete="off" required /></label>
            <Notice>{error}</Notice>
            <button className="button button-primary button-full" disabled={loading}>{loading ? 'Joining room…' : 'Join lounge'} <ArrowRight size={16} /></button>
          </form>
          <div className="join-security-note"><LockKeyhole size={14} /> Joining makes you a participant. Hosts and Co-DJs manage room settings.</div>
        </section>
        <aside className="recent-rooms-panel">
          <div className="eyebrow">RECENTLY IN YOUR ORBIT</div><h2>Rooms you know.</h2><p>Rejoin a room you’ve been in before.</p>
          {recent.map((lounge) => {
            const track = tracks.find((item) => item.id === lounge.currentTrackId);
            return <Link key={lounge.id} className="recent-room-row" to={`/app/lounge/${lounge.id}`}><TrackArtwork track={track} /><span><b>{lounge.name}</b><small>{lounge.vibe} · {lounge.participants} listening</small></span><ArrowRight size={15} /></Link>;
          })}
          {!recent.length && <EmptyState icon={Headphones} title="No recent rooms" description="A room you join will show here." />}
          <div className="recent-rooms-help"><b>Don’t have a code?</b><span>Ask your host to share their room invite.</span></div>
        </aside>
      </div>
    </div>
  );
}

function extractInviteCode(value) {
  const trimmed = value.trim();
  const queryCode = trimmed.match(/[?&]code=([a-z0-9-]+)/i)?.[1];
  const lastPathPart = trimmed.match(/\/([a-z0-9-]+)\/?$/i)?.[1];
  return (queryCode || lastPathPart || trimmed).toUpperCase();
}

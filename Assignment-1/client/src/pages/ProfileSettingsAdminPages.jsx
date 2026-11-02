import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  AudioLines,
  Check,
  ChevronRight,
  Clock3,
  Disc3,
  Edit3,
  Headphones,
  LockKeyhole,
  LogOut,
  Plus,
  Save,
  Settings,
  Shield,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api, resolveAssetUrl } from '../api.js';
import { EmptyState, Notice, PageHeading, SectionHeading, StatCard, TrackArtwork } from '../components/Shared.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { camelotKeys } from '../constants.js';

export function ProfilePage() {
  const { user, token, updateUser } = useAuth();
  const { tracks, lounges, recentTracks, savedTrackIds, tasteProfile } = useAppData();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.displayName || '');
  const [notice, setNotice] = useState('');
  const genres = [...new Set(recentTracks.map((track) => track.genre).filter(Boolean))];
  const hasTasteProfile = tasteProfile?.totalTracksListened > 0 &&
    Number.isFinite(tasteProfile.avgEnergy) &&
    Number.isFinite(tasteProfile.avgValence) &&
    Number.isFinite(tasteProfile.avgBpm);

  async function saveProfile(event) {
    event.preventDefault();
    if (!name.trim()) {
      setNotice('Your display name cannot be empty.');
      return;
    }
    try {
      const result = await api.updateProfile(token, { displayName: name.trim() });
      updateUser(result.user);
      setEditing(false);
      setNotice('Profile updated.');
    } catch (requestError) {
      setNotice(requestError.message);
    }
  }

  return (
    <div className="page-stack">
      <PageHeading eyebrow="YOUR LISTENING IDENTITY" title="Your profile." description="A little about you, and a lot about what you love to listen to." actions={<button className="button button-outline button-small" onClick={() => setEditing((current) => !current)}><Edit3 size={15} /> {editing ? 'Cancel edit' : 'Edit profile'}</button>} />
      {notice && <Notice tone="info">{notice}</Notice>}
      <section className="profile-hero-card">
        <div className="profile-hero-visual"><div className="profile-avatar-large">{user?.avatar || user?.displayName?.slice(0, 2).toUpperCase()}</div><span className="profile-online-indicator" /></div>
        <div className="profile-hero-copy">
          <div className="profile-name-row"><div><span className="eyebrow">{formatRole(user?.role)}{user?.createdAt ? ` · MEMBER SINCE ${new Date(user.createdAt).toLocaleDateString()}` : ''}</span><h2>{user?.displayName}</h2><p>{user?.email}</p></div><span className="role-pill"><Shield size={13} /> {formatRole(user?.role)}</span></div>
        </div>
        {editing && <form className="profile-edit-form" onSubmit={saveProfile}><label className="field-label">Display name<input value={name} onChange={(event) => setName(event.target.value)} maxLength="50" /></label><button className="button button-primary button-small"><Save size={14} /> Save changes</button></form>}
      </section>
      <div className="stats-grid profile-stats">
        <StatCard icon={Clock3} label="Recent tracks" value={recentTracks.length} note="Recorded by the backend" />
        <StatCard icon={Headphones} label="Lounges" value={lounges.length} note="Rooms in your history" tone="blue" />
        <StatCard icon={Disc3} label="Saved tracks" value={savedTrackIds.length} note="In your library" tone="pink" />
      </div>
      <div className="profile-details-grid">
        <section className="panel taste-profile-panel">
          <div className="panel-heading"><div><div className="eyebrow">YOUR ACOUSTIC TASTE</div><h2>The shape of your sound.</h2><p>Built from the tracks and rooms you return to.</p></div><span className="panel-icon"><AudioLines size={17} /></span></div>
          {hasTasteProfile ? <div className="taste-profile-graph"><div className="taste-profile-radar"><span className="radar-ring radar-ring-one" /><span className="radar-ring radar-ring-two" /><span className="radar-ring radar-ring-three" /><i className="radar-point point-one" style={{ '--taste-value': tasteProfile.avgEnergy }} /><i className="radar-point point-two" style={{ '--taste-value': tasteProfile.avgValence }} /><i className="radar-point point-three" style={{ '--taste-value': Math.min(1, tasteProfile.avgBpm / 180) }} /><i className="radar-point point-four" style={{ '--taste-value': 1 - tasteProfile.avgEnergy }} /></div><div className="radar-label radar-label-top">ENERGY</div><div className="radar-label radar-label-right">VALENCE</div><div className="radar-label radar-label-bottom">TEMPO</div><div className="radar-label radar-label-left">LOW ENERGY</div></div> : <EmptyState icon={AudioLines} title="Not enough listening data yet" description="Your acoustic profile will appear after the backend records track listening." />}
          <div className="profile-genres"><span>GENRES FROM RECENT TRACKS</span><div>{genres.map((genre) => <i key={genre}>{genre}</i>)}</div>{!genres.length && <small>No recent genre data yet.</small>}</div>
        </section>
        <section className="panel profile-rooms-panel">
          <div className="panel-heading"><div><div className="eyebrow">YOUR RECENT ROOMS</div><h2>Music, together.</h2></div><Link to="/app/lounges" className="text-link">All rooms <ArrowRight size={14} /></Link></div>
          {lounges.length ? lounges.slice(0, 4).map((lounge) => {
            const track = tracks.find((item) => item.id === lounge.currentTrackId);
            return <Link to={`/app/lounge/${lounge.id}`} className="profile-room-row" key={lounge.id}><TrackArtwork track={track} /><span><b>{lounge.name}</b><small>{lounge.vibe} · {lounge.participants} listening</small></span><ChevronRight size={15} /></Link>;
          }) : <EmptyState icon={Headphones} title="No rooms yet" description="Join or create a lounge to see your music history." />}
        </section>
      </div>
      <div className="profile-privacy-note"><LockKeyhole size={15} /><span>Profile and taste information is loaded from your account.</span><Link to="/app/settings">Account settings</Link></div>
    </div>
  );
}

export function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');

  async function handleLogout() {
    if (window.confirm('Log out of AI DJ Engine?')) {
      try {
        await logout();
        navigate('/');
      } catch (error) {
        setMessage(`Server logout failed: ${error.message}`);
        navigate('/');
      }
    }
  }

  return (
    <div className="page-stack">
      <PageHeading eyebrow="MAKE IT YOURS" title="Settings." description="The details that make the experience feel like your own." />
      {message && <Notice tone="info">{message}</Notice>}
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections"><a href="#account" className="active">Account</a><a href="#security">Security</a></nav>
        <div className="settings-sections">
          <section className="panel settings-panel" id="account"><div className="settings-panel-heading"><span className="settings-icon"><Users size={17} /></span><div><h2>Account</h2><p>Your account details and access.</p></div></div><div className="settings-row"><div><b>Display name</b><span>{user?.displayName}</span></div><Link to="/app/profile" className="text-link">Edit <ChevronRight size={14} /></Link></div><div className="settings-row"><div><b>Email address</b><span>{user?.email}</span></div></div><div className="settings-row"><div><b>Current role</b><span>Controls which lounge tools are available to your account.</span></div><span className="role-pill">{formatRole(user?.role)}</span></div>
          </section>
          <section className="panel settings-panel" id="security"><div className="settings-panel-heading"><span className="settings-icon blue"><Shield size={17} /></span><div><h2>Security</h2><p>Manage your account session.</p></div></div><div className="settings-row"><div><b>Password reset</b><span>The backend does not currently provide password-reset functionality.</span></div></div><button className="logout-row" onClick={handleLogout}><span><LogOut size={16} /><b>Log out</b></span><ChevronRight size={16} /></button></section>
        </div>
      </div>
      <div className="settings-note"><Shield size={14} /> Account identity and permissions are provided and enforced by the backend.</div>
    </div>
  );
}

export function AdminAcousticPage() {
  const { user, token } = useAuth();
  const { tracks, addTrack, editTrack, removeTrack } = useAppData();
  const [editingId, setEditingId] = useState('');
  const [deleteId, setDeleteId] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [audioFile, setAudioFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const audioInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const initialForm = { title: '', artist: '', album: '', genre: '', durationSeconds: '', bpm: '', camelotKey: '', energy: '', valence: '', audioAssetUrl: '', coverImageUrl: '', timeline: [] };
  const [form, setForm] = useState(initialForm);

  function clearSelectedFiles() {
    setAudioFile(null);
    setCoverFile(null);
    if (audioInputRef.current) audioInputRef.current.value = '';
    if (coverInputRef.current) coverInputRef.current.value = '';
  }

  if (user?.role !== 'admin') {
    return <div className="page-stack"><PageHeading eyebrow="RESTRICTED AREA" title="Admin acoustic data." description="Only users with the Admin role can manage track profiles." /><Notice>You do not have permission to edit acoustic data. Ask an administrator to grant access.</Notice></div>;
  }

  const filteredTracks = tracks.filter((track) => `${track.title} ${track.artist}`.toLowerCase().includes(search.toLowerCase()));

  function edit(track) {
    setEditingId(track.id);
    setTimelineOpen(Boolean(track.timeline?.length));
    clearSelectedFiles();
    setForm({
      title: track.title,
      artist: track.artist,
      album: track.album || '',
      genre: track.genre || '',
      durationSeconds: track.durationSeconds ?? '',
      bpm: track.acoustic?.bpm ?? '',
      camelotKey: track.acoustic?.camelotKey ?? '',
      energy: track.acoustic?.energy ?? '',
      valence: track.acoustic?.valence ?? '',
      audioAssetUrl: track.audioAssetUrl || '',
      coverImageUrl: track.coverImageUrl || '',
      timeline: (track.timeline || []).map((entry) => ({
        ts: String(entry.ts ?? ''),
        type: entry.type || 'trivia',
        text: entry.text || '',
      })),
    });
    setError('');
  }

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function updateTimelineEntry(index, field, value) {
    setForm((current) => ({
      ...current,
      timeline: current.timeline.map((entry, entryIndex) => (
        entryIndex === index ? { ...entry, [field]: value } : entry
      )),
    }));
  }

  function addTimelineEntry() {
    setTimelineOpen(true);
    setForm((current) => ({
      ...current,
      timeline: [...current.timeline, { ts: '0', type: 'trivia', text: '' }],
    }));
  }

  function removeTimelineEntry(index) {
    setForm((current) => ({
      ...current,
      timeline: current.timeline.filter((_, entryIndex) => entryIndex !== index),
    }));
  }

  function validate() {
    if (!form.title.trim() || !form.artist.trim()) return 'Track title and artist are required.';
    if (!audioFile && !form.audioAssetUrl) return 'Upload an audio file before saving the track.';
    if (audioFile && audioFile.size > 50 * 1024 * 1024) return 'Audio file must be 50 MB or smaller.';
    if (coverFile && coverFile.size > 50 * 1024 * 1024) return 'Cover image must be 50 MB or smaller.';
    if (!Number.isFinite(Number(form.bpm)) || Number(form.bpm) <= 0) return 'BPM must be a positive number.';
    if (!camelotKeys.includes(form.camelotKey)) return 'Choose one of the valid Camelot keys.';
    if (!Number.isFinite(Number(form.energy)) || Number(form.energy) < 0 || Number(form.energy) > 1) return 'Energy must be between 0 and 1.';
    if (!Number.isFinite(Number(form.valence)) || Number(form.valence) < 0 || Number(form.valence) > 1) return 'Valence must be between 0 and 1.';
    if (!Number.isFinite(Number(form.durationSeconds)) || Number(form.durationSeconds) <= 0) return 'Duration must be a positive number of seconds.';
    for (const [index, entry] of form.timeline.entries()) {
      const timestamp = Number(entry.ts);
      if (entry.ts === '' || !Number.isInteger(timestamp) || timestamp < 0) {
        return `Timeline entry ${index + 1} needs a whole-number timestamp of 0 seconds or more.`;
      }
      if (timestamp > Number(form.durationSeconds)) {
        return `Timeline entry ${index + 1} cannot be after the track duration.`;
      }
      if (!['sample_credit', 'trivia', 'glossary'].includes(entry.type)) {
        return `Choose a valid event type for timeline entry ${index + 1}.`;
      }
      if (!entry.text.trim()) return `Add a note or fact to timeline entry ${index + 1}.`;
    }
    return '';
  }

  async function saveTrack(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    const trackData = {
      title: form.title.trim(),
      artist: form.artist.trim(),
      album: form.album.trim(),
      genre: form.genre.trim(),
      durationSeconds: Number(form.durationSeconds),
      audioAssetUrl: form.audioAssetUrl,
      coverImageUrl: form.coverImageUrl,
      acoustic: { bpm: Number(form.bpm), camelotKey: form.camelotKey, energy: Number(form.energy), valence: Number(form.valence) },
      timeline: form.timeline.map((entry) => ({
        ts: Number(entry.ts),
        type: entry.type,
        text: entry.text.trim(),
      })),
    };
    try {
      const body = new FormData();
      body.append('trackData', JSON.stringify(trackData));
      if (audioFile) body.append('audio', audioFile);
      if (coverFile) body.append('cover', coverFile);
      const result = editingId ? await api.updateTrack(token, editingId, body) : await api.createTrack(token, body);
      if (!result.track) throw new Error('The server did not return the saved track.');
      const saved = result.track;
      if (editingId) editTrack(editingId, { ...saved, id: saved._id || editingId });
      else addTrack({ ...saved, id: saved._id });
      setMessage(editingId ? 'Track profile updated.' : 'Track added to the catalog.');
      setEditingId('');
      setTimelineOpen(false);
      setForm(initialForm);
      clearSelectedFiles();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const track = tracks.find((item) => item.id === deleteId);
    try {
      await api.deleteTrack(token, deleteId);
      removeTrack(deleteId);
      setDeleteId('');
      setMessage(`${track?.title || 'Track'} removed from the catalog.`);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="page-stack">
      <PageHeading eyebrow="ADMIN WORKSPACE" title="Acoustic data." description="Manage the track profiles that help the AI DJ make explainable, harmonic choices." actions={<span className="role-pill"><Shield size={13} /> Admin only</span>} />
      {error && <Notice>{error}</Notice>}{message && <Notice tone="info">{message}</Notice>}
      <div className="admin-summary"><span><Disc3 size={16} /> <b>{tracks.length}</b> profiled tracks</span><span><AudioLines size={16} /> {camelotKeys.length} Camelot keys available</span><span><Check size={16} /> Validated before saving</span></div>
      <div className="admin-layout">
        <section className="panel admin-track-list-panel">
          <div className="panel-heading"><div><div className="eyebrow">CATALOG</div><h2>Track profiles</h2></div><label className="admin-search"><span className="sr-only">Search tracks</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search…" /></label></div>
          {filteredTracks.length ? <div className="admin-track-list">{filteredTracks.map((track) => <div className="admin-track-row" key={track.id}><TrackArtwork track={track} /><div className="admin-track-copy"><b>{track.title}</b><small>{track.artist} · {track.acoustic?.bpm} BPM · {track.acoustic?.camelotKey}</small></div><button className="icon-button" aria-label={`Edit ${track.title}`} onClick={() => edit(track)}><Edit3 size={15} /></button><button className="icon-button danger-icon" aria-label={`Delete ${track.title}`} onClick={() => setDeleteId(track.id)}><Trash2 size={15} /></button></div>)}</div> : <EmptyState icon={Disc3} title="No tracks found" description="Try another search or add a new track profile." />}
          <div className="admin-track-list-footer"><span>Metadata powers track lore, samples, and AI DJ explanations.</span><a href="#track-form">How it works ↗</a></div>
        </section>
        <form className="panel admin-track-form" id="track-form" onSubmit={saveTrack} noValidate>
          <div className="panel-heading"><div><div className="eyebrow">{editingId ? 'EDIT PROFILE' : 'NEW PROFILE'}</div><h2>{editingId ? 'Update a track.' : 'Add a track.'}</h2></div>{editingId && <button type="button" className="icon-button" aria-label="Cancel edit" onClick={() => { setEditingId(''); setTimelineOpen(false); setForm(initialForm); clearSelectedFiles(); }}><X size={16} /></button>}</div>
          <div className="admin-form-section">
            <div className="admin-form-section-heading"><b>Track details</b><small>Catalog and playback information</small></div>
            <div className="admin-form-grid">
              <label className="field-label">Track title<input name="title" value={form.title} onChange={update} placeholder="Enter track title" /></label>
              <label className="field-label">Artist<input name="artist" value={form.artist} onChange={update} placeholder="Artist name" /></label>
              <label className="field-label">Album<input name="album" value={form.album} onChange={update} placeholder="Album name" /></label>
              <label className="field-label">Genre<input name="genre" value={form.genre} onChange={update} placeholder="House, ambient…" /></label>
              <label className="field-label">Duration (seconds)<input type="number" min="1" name="durationSeconds" value={form.durationSeconds} onChange={update} /></label>
            </div>
          </div>
          <div className="admin-form-divider"><span>ACOUSTIC PROFILE</span><small>Used for matching and curation</small></div>
          <div className="form-two-col"><label className="field-label">BPM<input type="number" min="1" max="300" step="1" name="bpm" value={form.bpm} onChange={update} /></label><label className="field-label">Camelot key<select name="camelotKey" value={form.camelotKey} onChange={update}><option value="">Select a key</option>{camelotKeys.map((key) => <option key={key}>{key}</option>)}</select></label></div>
          <div className="form-two-col"><label className="field-label">Energy <span className="field-range-hint">0–1</span><input type="number" min="0" max="1" step="0.01" name="energy" value={form.energy} onChange={update} /></label><label className="field-label">Valence <span className="field-range-hint">0–1</span><input type="number" min="0" max="1" step="0.01" name="valence" value={form.valence} onChange={update} /></label></div>
          <div className="admin-form-section admin-media-section">
            <div className="admin-form-section-heading"><b>Track assets</b><small>Upload once; playback and artwork use these files</small></div>
            <div className="track-file-fields">
              <label className="field-label">Audio file {!form.audioAssetUrl && <span className="field-range-hint">required</span>}<input ref={audioInputRef} type="file" accept="audio/aac,audio/mp4,audio/mpeg,audio/ogg,audio/wav,audio/webm,audio/x-m4a,audio/x-wav" required={!form.audioAssetUrl && !audioFile} onChange={(event) => setAudioFile(event.currentTarget.files?.[0] || null)} />{audioFile ? <small>Selected: {audioFile.name}</small> : form.audioAssetUrl ? <small>Current: <a href={resolveAssetUrl(form.audioAssetUrl)} target="_blank" rel="noreferrer">play stored audio</a></small> : <small>MP3, WAV, OGG, M4A, AAC, or WebM · max 50 MB</small>}</label>
              <label className="field-label">Cover image<input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(event) => setCoverFile(event.currentTarget.files?.[0] || null)} />{coverFile ? <small>Selected: {coverFile.name}</small> : form.coverImageUrl ? <small>Current cover image is saved. Upload a new image to replace it.</small> : <small>JPEG, PNG, GIF, or WebP · max 50 MB</small>}</label>
            </div>
          </div>
          {form.coverImageUrl && !coverFile && <img className="track-upload-cover-preview" src={resolveAssetUrl(form.coverImageUrl)} alt="Current track cover" />}
          <details className="timeline-editor admin-timeline-details" open={timelineOpen} onToggle={(event) => setTimelineOpen(event.currentTarget.open)}>
            <summary><span>Metadata timeline <small>{form.timeline.length ? `${form.timeline.length} event${form.timeline.length === 1 ? '' : 's'}` : 'Optional · add track facts for AI DJ answers'}</small></span><ChevronRight size={16} /></summary>
            <div className="timeline-editor-heading">
              <div><span className="field-label">Track events</span><small>Notes used to ground AI DJ answers. Timestamps are seconds from the start of the track.</small></div>
              <button type="button" className="button button-outline button-small" onClick={addTimelineEntry}><Plus size={14} /> Add event</button>
            </div>
            {form.timeline.map((entry, index) => (
              <fieldset className="timeline-entry" key={index}>
                <legend>Event {index + 1}</legend>
                <div className="timeline-entry-fields">
                  <label className="field-label">Timestamp (seconds)<input type="number" min="0" max={form.durationSeconds || undefined} step="1" value={entry.ts} onChange={(event) => updateTimelineEntry(index, 'ts', event.target.value)} placeholder="e.g. 12" /></label>
                  <label className="field-label">Event type<select value={entry.type} onChange={(event) => updateTimelineEntry(index, 'type', event.target.value)}><option value="sample_credit">Sample credit</option><option value="trivia">Trivia</option><option value="glossary">Glossary</option></select></label>
                  <label className="field-label timeline-entry-text">Note or fact<textarea rows="2" value={entry.text} onChange={(event) => updateTimelineEntry(index, 'text', event.target.value)} placeholder="Enter a verified fact relevant at this point in the track…" /></label>
                </div>
                <button type="button" className="button button-outline button-small timeline-remove-button" aria-label={`Remove timeline event ${index + 1}`} onClick={() => removeTimelineEntry(index)}><Trash2 size={14} /> Remove event</button>
              </fieldset>
            ))}
            {!form.timeline.length && <p className="timeline-empty">No metadata events yet. Add verified notes for samples, trivia, or glossary terms.</p>}
          </details>
          <Notice>{error}</Notice>
          <button className="button button-primary button-full" disabled={saving}>{saving ? 'Saving profile…' : editingId ? 'Save changes' : 'Add to catalog'} <Save size={15} /></button>
        </form>
      </div>
      {deleteId && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title"><span className="delete-modal-icon"><Trash2 size={19} /></span><h2 id="delete-title">Remove this track?</h2><p>This track will be removed from the catalog and new rooms won’t be able to use it.</p><div><button className="button button-outline" onClick={() => setDeleteId('')}>Cancel</button><button className="button button-danger" onClick={confirmDelete}><Trash2 size={14} /> Remove track</button></div></section></div>}
    </div>
  );
}

function formatRole(role = 'listener') {
  return role.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

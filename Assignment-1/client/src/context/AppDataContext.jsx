import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from './AuthContext.jsx';

const AppDataContext = createContext(null);

export function AppDataProvider({ children }) {
  const { token } = useAuth();
  const [data, setData] = useState({ lounges: [], savedTrackIds: [] });
  const [tracks, setTracks] = useState([]);
  const [recommendationTracks, setRecommendationTracks] = useState([]);
  const [recentTracks, setRecentTracks] = useState([]);
  const [tasteProfile, setTasteProfile] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [dataError, setDataError] = useState('');

  useEffect(() => {
    localStorage.removeItem('ai-dj-engine-demo-data');
  }, []);

  useEffect(() => {
    if (!token) {
      setTracks([]);
      setData({ lounges: [], savedTrackIds: [] });
      setRecommendationTracks([]);
      setRecentTracks([]);
      setTasteProfile(null);
      setDashboard(null);
      return undefined;
    }
    setTracks([]);
    setData({ lounges: [], savedTrackIds: [] });
    setRecommendationTracks([]);
    setRecentTracks([]);
    setTasteProfile(null);
    setDashboard(null);
    setDataError('');
    let active = true;
    Promise.all([
      api.tracks(token),
      api.loungeHistory(token),
      api.recommendations(token),
      api.tasteProfile(token),
      api.interactions(token),
      api.userDashboard(token),
    ])
      .then(([trackResult, loungeResult, recommendationResult, tasteResult, interactionResult, dashboardResult]) => {
        if (!active) return;
        setTracks((trackResult.tracks || []).map(normalizeTrack));
        if (loungeResult.lounges) {
          setData((current) => ({ ...current, lounges: loungeResult.lounges.map(normalizeLounge) }));
        }
        setRecommendationTracks((recommendationResult.recommendations || []).map(normalizeTrack));
        setRecentTracks((interactionResult.recentTracks || []).map(normalizeTrack));
        setData((current) => ({ ...current, savedTrackIds: (interactionResult.savedTrackIds || []).map(String) }));
        setTasteProfile(tasteResult.tasteProfile || null);
        const dashboardData = dashboardResult.dashboard || null;
        if (dashboardData) {
          dashboardData.activeLounges = (dashboardData.activeLounges || []).map(normalizeLounge);
          dashboardData.hostedLounges = (dashboardData.hostedLounges || []).map(normalizeLounge);
          dashboardData.attendedLounges = (dashboardData.attendedLounges || []).map(normalizeLounge);
        }
        setDashboard(dashboardData);
        setDataError('');
      })
      .catch((error) => {
        if (active) setDataError(error.message);
      });
    return () => { active = false; };
  }, [token]);

  function addLounge(lounge) {
    const nextLounge = normalizeLounge(lounge);
    setData((current) => ({
      ...current,
      lounges: [nextLounge, ...current.lounges.filter((item) => item.id !== nextLounge.id)],
    }));
    return nextLounge;
  }

  function updateLounge(loungeId, update) {
    setData((current) => ({
      ...current,
      lounges: current.lounges.map((lounge) => lounge.id === loungeId ? { ...lounge, ...update } : lounge),
    }));
  }

  async function addToQueue(loungeId, trackId) {
    const result = await api.addToQueue(token, loungeId, trackId);
    if (result.queue) updateLounge(loungeId, { queue: result.queue });
  }

  async function toggleSavedTrack(trackId) {
    const liked = !data.savedTrackIds.includes(trackId);
    await api.recordInteraction(token, { trackId, liked });
    setData((current) => ({
      ...current,
      savedTrackIds: current.savedTrackIds.includes(trackId)
        ? current.savedTrackIds.filter((id) => id !== trackId)
        : [...current.savedTrackIds, trackId],
    }));
  }

  function addTrack(track) {
    setTracks((current) => [normalizeTrack(track), ...current]);
  }

  function editTrack(trackId, updates) {
    setTracks((current) => current.map((track) => track.id === trackId ? { ...track, ...updates } : track));
  }

  function removeTrack(trackId) {
    setTracks((current) => current.filter((track) => track.id !== trackId));
  }

  const value = useMemo(() => ({
    tracks,
    lounges: data.lounges,
    savedTrackIds: data.savedTrackIds,
    recentlyPlayed: recentTracks.map((track) => track.id),
    recentTracks,
    recommendationTracks,
    tasteProfile,
    dashboard,
    dataError,
    addLounge,
    updateLounge,
    addToQueue,
    toggleSavedTrack,
    addTrack,
    editTrack,
    removeTrack,
  }), [
    tracks,
    data,
    dataError,
    token,
    recommendationTracks,
    recentTracks,
    tasteProfile,
    dashboard,
  ]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

function normalizeTrack(track) {
  return {
    ...track,
    id: track._id || track.id,
    cover: track.coverImageUrl || track.cover,
  };
}

function normalizeLounge(lounge) {
  const participants = Array.isArray(lounge.participants)
    ? lounge.participants.length
    : lounge.participants;
  return {
    ...lounge,
    id: lounge._id || lounge.id,
    name: lounge.name,
    host: lounge.host?.displayName || lounge.host,
    hostId: lounge.hostId || idOf(lounge.host),
    coDjIds: (lounge.coDJs || []).map(idOf),
    mutedParticipantIds: (lounge.mutedParticipants || []).map(idOf),
    currentTrackId: lounge.currentTrack?._id || lounge.currentTrack?.id || lounge.currentTrackId,
    queue: (lounge.queue || []).map((entry) => ({
      trackId: entry.track?._id || entry.trackId || entry._id,
      votes: entry.voteCount || entry.votes || 0,
    })),
    participants,
    maxParticipants: lounge.settings?.maxParticipants || lounge.maxParticipants,
    sentiment: lounge.currentSentimentScore ?? lounge.sentiment?.rollingScore ?? lounge.sentiment,
    inviteCode: lounge.inviteCode || '',
    vibe: lounge.vibeProfile || lounge.vibe,
    messages: lounge.messages || [],
    battle: lounge.soundclash,
  };
}

function idOf(value) {
  return value?._id || value?.id || value;
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData must be used inside AppDataProvider.');
  return context;
}

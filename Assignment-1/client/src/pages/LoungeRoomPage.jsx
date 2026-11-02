import { Component, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Heart,
  ListPlus,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Rewind,
  FastForward,
  Play,
  Radio,
  Send,
  Settings2,
  Shield,
  Sparkles,
  ThumbsUp,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { api, refreshAccessToken, resolveAssetUrl } from '../api.js';
import { EmptyState, Notice, SentimentBar, TrackArtwork } from '../components/Shared.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export function LoungeRoomPage({ soundclashOnly = false }) {
  return (
    <LoungeRoomErrorBoundary>
      <LoungeRoomContent soundclashOnly={soundclashOnly} />
    </LoungeRoomErrorBoundary>
  );
}

function LoungeRoomContent({ soundclashOnly }) {
  const { loungeId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { tracks, lounges, updateLounge, addToQueue } = useAppData();
  const [remoteLounge, setRemoteLounge] = useState(null);
  const [liveState, setLiveState] = useState(null);
  const [segueSuggestion, setSegueSuggestion] = useState(null);
  const [segueMatchReason, setSegueMatchReason] = useState('');
  const [segueMessage, setSegueMessage] = useState('');
  const [playbackProgress, setPlaybackProgress] = useState({ trackId: '', positionSeconds: 0, durationSeconds: 0 });
  const [error, setError] = useState('');
  const [connection, setConnection] = useState('connecting');
  const [messageInput, setMessageInput] = useState('');
  const [questionInput, setQuestionInput] = useState('');
  const [questionTrackId, setQuestionTrackId] = useState('');
  const [questionAnswer, setQuestionAnswer] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [battleVotes, setBattleVotes] = useState({});
  const [isVoting, setIsVoting] = useState(false);
  const [battleSeconds, setBattleSeconds] = useState(38);
  const [showInvite, setShowInvite] = useState(Boolean(searchParams.get('invite')));
  const [inviteCopied, setInviteCopied] = useState(false);
  const socketRef = useRef(null);
  const chatEndRef = useRef(null);
  const advancingTrackRef = useRef(false);
  const segueRequestKeyRef = useRef('');
  const segueRequestSequenceRef = useRef(0);
  const currentTrackIdRef = useRef('');

  const localLounge = lounges.find((item) => item.id === loungeId);
  const lounge = remoteLounge || localLounge;
  const userId = String(user?._id || user?.id || '');
  const isHost = user?.role === 'admin' ||
    (user?.role === 'host' && String(lounge?.hostId || '') === userId);
  const isController = isHost ||
    (lounge?.coDjIds || []).some((id) => String(id) === userId);
  const currentTrackId = liveState?.currentTrackId || lounge?.currentTrackId;
  currentTrackIdRef.current = String(currentTrackId || '');
  const currentTrack = trackById(tracks, currentTrackId) || (typeof liveState?.currentTrack === 'object' ? normalizeTrack(liveState.currentTrack) : null);
  const queue = liveState?.queue || lounge?.queue || [];
  const queueSignature = queue
    .map((item) => idOf(item.track || item.trackId))
    .filter(Boolean)
    .map(String)
    .sort()
    .join(',');
  const messages = liveState?.messages || lounge?.messages || [];
  const battle = liveState?.battle || lounge?.battle;
  const playback = liveState?.playback || lounge?.playback || { isPlaying: false, positionSeconds: 0 };
  const queueTracks = useMemo(() => queue.map((item) => ({
    ...item,
    track: trackById(tracks, typeof item.track === 'object' ? item.track._id || item.track.id : item.trackId || item.track),
  })), [queue, tracks]);
  const recentQuestionTracks = (liveState?.recentTrackIds || [])
    .map((id) => trackById(tracks, id))
    .filter((track) => track && String(track.id) !== String(currentTrackId));

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    const socketBase = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
    const socket = io(socketBase, { auth: { token }, autoConnect: true, reconnection: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (!active) return;
      setConnection('connected');
      socket.emit('lounge:join', { loungeId });
    });
    socket.on('connect_error', (socketError) => {
      if (!active) return;
      setConnection('reconnecting');
      if (/authentication error|jwt expired|invalid token/i.test(socketError.message)) {
        refreshAccessToken()
          .then((refreshedToken) => {
            if (!active) return;
            socket.auth = { token: refreshedToken };
            socket.connect();
          })
          .catch((refreshError) => {
            if (!active) return;
            setConnection('disconnected');
            setError(`Your session expired. Please sign in again. ${refreshError.message}`);
          });
        return;
      }
      setConnection('disconnected');
      setError(`Live connection failed: ${socketError.message}`);
    });
    socket.on('disconnect', () => {
      if (active) setConnection('reconnecting');
    });
    socket.on('lounge:sync', (event) => {
      const payload = event.payload || {};
      if (!active) return;
      setLiveState({
        currentTrack: payload.currentTrack,
        currentTrackId: payload.currentTrack?._id,
        recentTrackIds: [],
        playback: payload.playback || { isPlaying: false, positionSeconds: 0 },
        queue: payload.queue || [],
        battle: {
          ...(payload.soundclash || {}),
          candidates: (payload.soundclash?.candidates || []).map((candidate) => ({
            ...candidate,
            trackId: idOf(candidate.track) || candidate.trackId,
            votes: candidate.votes || 0,
          })),
        },
        sentiment: payload.sentimentScore,
        participants: payload.participantCount,
        participantList: payload.participants || [],
        hostDisconnected: payload.hostDisconnected,
      });
    });
    socket.on('lounge:presence:update', (event) => {
      if (!active || !event.payload) return;
      setLiveState((current) => {
        const participantList = Array.isArray(event.payload.participants)
          ? event.payload.participants
          : ['left', 'disconnected', 'removed'].includes(event.payload.action)
            ? (current?.participantList || []).filter((person) => String(person._id || person.id) !== String(event.payload.userId))
            : current?.participantList || [];
        return {
          ...current,
          participants: event.payload.participantCount ?? participantList.length,
          participantList,
          hostDisconnected: event.payload.hostDisconnected,
        };
      });
    });
    socket.on('lounge:chat:message', (event) => {
      if (!active || !event.payload) return;
      setLiveState((current) => ({ ...current, messages: [...(current?.messages || []), event.payload] }));
    });
    socket.on('lounge:typing:update', (event) => {
      if (active) setLiveState((current) => ({ ...current, typing: event.payload?.displayName }));
    });
    socket.on('lounge:queue:update', (event) => {
      if (active) setLiveState((current) => ({ ...current, queue: event.payload?.queue || current?.queue || [] }));
    });
    socket.on('lounge:nowplaying:update', (event) => {
      if (!active || !event.payload) return;
      const nextTrackId = String(idOf(event.payload.currentTrack) || '');
      setSegueSuggestion(null);
      setSegueMatchReason('');
      setSegueMessage('');
      setLiveState((current) => ({
        ...current,
        currentTrack: event.payload.currentTrack,
        currentTrackId: nextTrackId,
        announcement: '',
        recentTrackIds: [...new Set([
          String(idOf(current?.currentTrack) || current?.currentTrackId || ''),
          ...(current?.recentTrackIds || []),
        ].map(String).filter((id) => id && id !== nextTrackId))].slice(0, 10),
        playback: event.payload.playback || { isPlaying: false, positionSeconds: 0 },
        queue: event.payload.queue || event.payload.remainingQueue || current?.queue || [],
      }));
    });
    socket.on('lounge:playback:update', (event) => {
      if (active && event.payload) {
        setLiveState((current) => ({ ...current, playback: event.payload }));
      }
    });
    socket.on('lounge:status:update', (event) => {
      if (active && event.payload?.status) setRemoteLounge((current) => current && ({ ...current, status: event.payload.status }));
    });
    socket.on('lounge:moderation:update', (event) => {
      if (!active || !event.payload) return;
      setRemoteLounge((current) => current && ({
        ...current,
        locked: event.payload.locked,
        hostId: event.payload.hostId || current.hostId,
        coDjIds: event.payload.coDjIds || current.coDjIds,
        mutedParticipantIds: event.payload.action === 'mute'
          ? event.payload.muted
            ? [...(current.mutedParticipantIds || []), event.payload.participantId]
            : (current.mutedParticipantIds || []).filter((id) => String(id) !== String(event.payload.participantId))
          : current.mutedParticipantIds,
      }));
      if (Array.isArray(event.payload.participants)) {
        setLiveState((current) => ({
          ...current,
          participantList: event.payload.participants,
          participants: event.payload.participantCount ?? event.payload.participants.length,
        }));
      }
      if (event.payload.action === 'remove' && event.payload.participantId) {
        setLiveState((current) => ({
          ...current,
          participantList: (current?.participantList || []).filter((person) => String(person._id || person.id) !== String(event.payload.participantId)),
        }));
      }
    });
    socket.on('lounge:sentiment:update', (event) => {
      if (active) setLiveState((current) => ({ ...current, sentiment: event.payload?.rollingScore ?? current?.sentiment }));
    });
    socket.on('lounge:soundclash:update', (event) => {
      if (active && event.payload) setLiveState((current) => ({
        ...current,
        battle: {
          ...current?.battle,
          ...event.payload,
          candidates: (event.payload.candidates || []).map((candidate) => ({
            ...candidate,
            trackId: idOf(candidate.track) || candidate.trackId,
          })),
        },
      }));
    });
    socket.on('lounge:soundclash:open', (event) => {
      if (active && event.payload) setLiveState((current) => ({
        ...current,
        battle: {
          ...current?.battle,
          active: true,
          hasVoted: false,
          votedTrackId: null,
          ...event.payload,
          candidates: (event.payload.candidates || []).map((candidate) => ({
            ...candidate,
            trackId: idOf(candidate.track) || candidate.trackId,
          })),
        },
      }));
    });
    socket.on('lounge:soundclash:vote', (event) => {
      if (!active || !event.payload?.voteCounts) return;
      setLiveState((current) => ({
        ...current,
        battle: {
          ...current?.battle,
          candidates: (current?.battle?.candidates || []).map((candidate) => {
            const candidateId = idOf(candidate.track) || candidate.trackId;
            const count = event.payload.voteCounts.find((vote) => String(vote.trackId) === String(candidateId));
            return count ? { ...candidate, votes: count.votes } : candidate;
          }),
        },
      }));
    });
    socket.on('lounge:soundclash:resolved', (event) => {
      if (!active || !event.payload) return;
      setLiveState((current) => ({
        ...current,
        battle: { ...current?.battle, active: false, winnerId: event.payload.winningTrackId },
        queue: event.payload.newQueue || current?.queue || [],
      }));
    });
    socket.on('lounge:ai:dj_announcement', (event) => {
      if (
        active &&
        event.payload?.text &&
        (!event.payload.fromTrackId || String(event.payload.fromTrackId) === currentTrackIdRef.current)
      ) {
        setLiveState((current) => ({ ...current, announcement: event.payload.text }));
      }
    });
    socket.on('lounge:ai:segue_suggestion', (event) => {
      if (!active || !event.payload) return;
      if (event.payload.fromTrackId && String(event.payload.fromTrackId) !== currentTrackIdRef.current) return;
      setSegueSuggestion(event.payload.selectedTrack ? normalizeTrack(event.payload.selectedTrack) : null);
      setSegueMatchReason(event.payload.matchReason || '');
      setSegueMessage(event.payload.message || '');
    });
    socket.on('error', (socketError) => {
      if (active) setError(socketError.message || 'The live room reported an error.');
    });

    Promise.all([api.lounge(token, loungeId), api.queue(token, loungeId), api.messages(token, loungeId), api.soundclash(token, loungeId)])
      .then(([loungeResult, queueResult, messageResult, soundclashResult]) => {
        if (!active) return;
        const record = loungeResult.lounge;
        setRemoteLounge(normalizeLounge(record, queueResult));
        setLiveState((current) => ({
          ...current,
          currentTrack: queueResult.currentTrack || record.currentTrack,
          currentTrackId: idOf(queueResult.currentTrack || record.currentTrack),
          recentTrackIds: (queueResult.recentTracks || []).map(idOf),
          playback: current?.playback || queueResult.playback || record.playback || { isPlaying: false, positionSeconds: 0 },
          queue: queueResult.queue || [],
          sentiment: queueResult.sentiment ?? record.currentSentimentScore,
          messages: messageResult.messages || [],
          battle: {
            ...(current?.battle || soundclashResult.soundclash || record.soundclash),
            hasVoted: Boolean(current?.battle?.hasVoted || soundclashResult.soundclash?.hasVoted),
            votedTrackId: current?.battle?.votedTrackId ?? soundclashResult.soundclash?.votedTrackId ?? null,
          },
          participants: current?.participants ?? record.participantCount ?? record.participants?.length ?? 0,
          participantList: current?.participantList ?? record.participants ?? [],
          hostDisconnected: record.hostDisconnected,
        }));
        setError('');
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      });

    return () => {
      active = false;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [loungeId, token]);

  const outroWindowSeconds = Number(lounge?.settings?.aiOutroWindowSeconds ?? 5);
  const progressIsForCurrentTrack = String(playbackProgress.trackId) === String(currentTrackId);
  const progressDuration = progressIsForCurrentTrack
    ? playbackProgress.durationSeconds
    : Number(currentTrack?.durationSeconds || 0);
  const progressPosition = progressIsForCurrentTrack ? playbackProgress.positionSeconds : 0;
  const isInOutroWindow = Boolean(
    isController &&
    playback.isPlaying &&
    currentTrackId &&
    queueSignature &&
    progressDuration > 0 &&
    progressPosition >= Math.max(0, progressDuration - outroWindowSeconds)
  );

  useEffect(() => {
    const requestKey = `${currentTrackId || ''}:${queueSignature}`;
    if (!isController || !token || !currentTrackId || !queueSignature || !isInOutroWindow) {
      if (segueRequestKeyRef.current !== requestKey) {
        setSegueSuggestion(null);
        setSegueMatchReason('');
        setSegueMessage('');
      }
      return undefined;
    }
    if (segueRequestKeyRef.current === requestKey) return undefined;

    segueRequestKeyRef.current = requestKey;
    const requestId = ++segueRequestSequenceRef.current;
    let active = true;
    setSegueSuggestion(null);
    setSegueMatchReason('');
    setSegueMessage('');
    api.aiSegue(token, loungeId)
      .then((result) => {
        if (!active || requestId !== segueRequestSequenceRef.current) return;
        const suggestion = result.selectedTrack ? normalizeTrack(result.selectedTrack) : null;
        setSegueSuggestion(suggestion);
        setSegueMatchReason(result.matchReason?.description || '');
        setSegueMessage(suggestion ? '' : result.message || '');
        if (result.transitionScript) {
          setLiveState((current) => ({ ...current, announcement: result.transitionScript }));
        }
      })
      .catch((requestError) => {
        if (active && requestId === segueRequestSequenceRef.current) {
          setError(requestError.message);
        }
      });

    return () => { active = false; };
  }, [isController, token, currentTrackId, queueSignature, isInOutroWindow, loungeId]);

  useEffect(() => {
    if (!battle?.active) return undefined;
    const updateRemaining = () => {
      const closesAt = battle.closesAt ? new Date(battle.closesAt).getTime() : Date.now();
      setBattleSeconds(Math.max(0, Math.ceil((closesAt - Date.now()) / 1000)));
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [battle?.active, battle?.closesAt]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  useEffect(() => {
    setQuestionTrackId('');
  }, [currentTrackId]);

  if (!lounge && !remoteLounge) {
    return <div className="page-stack"><Notice>{error || 'Loading lounge…'}</Notice><Link className="back-link" to="/app/lounges"><ArrowLeft size={15} /> Your lounges</Link></div>;
  }
  if (!currentTrack) {
    return (
      <div className="page-stack lounge-empty-state">
        <section className="panel lounge-empty-panel">
          <span className="panel-icon"><Radio size={18} /></span>
          <div className="eyebrow">YOUR LOUNGE IS READY</div>
          <h1>{lounge.name}</h1>
          <p>{error || 'There is no track playing yet. Return to your lounges or discover a track to get the room started.'}</p>
          {lounge.inviteCode && <div className="lounge-empty-invite">Invite code <b>{lounge.inviteCode}</b></div>}
          <div className="lounge-empty-actions">
            <Link className="button button-primary" to="/app/discover">Discover tracks <ArrowRight size={15} /></Link>
            <Link className="button button-outline" to="/app/lounges"><ArrowLeft size={15} /> Your lounges</Link>
          </div>
        </section>
      </div>
    );
  }

  async function perform(action, message) {
    try {
      await action();
      setFeedback(message);
      setError('');
      return true;
    } catch (actionError) {
      setError(actionError.message);
      return false;
    }
  }

  async function toggleRoomLock() {
    const locked = !lounge.locked;
    await perform(async () => {
      await api.moderateLounge(token, loungeId, { action: 'lock', locked });
      updateLounge(loungeId, { locked });
      setRemoteLounge((current) => current && ({ ...current, locked }));
    }, locked ? 'Room locked. New participants will need an invite from the host.' : 'Room unlocked for your listeners.');
  }

  async function endLounge() {
    if (!window.confirm('End this lounge session for everyone?')) return;
    await perform(async () => {
      await api.updateLoungeStatus(token, loungeId, 'ended');
      updateLounge(loungeId, { status: 'ended' });
      setRemoteLounge((current) => current && ({ ...current, status: 'ended' }));
    }, 'Lounge session ended.');
  }

  async function moderateParticipant(action, participantId, enabled) {
    const muted = action === 'mute' && !(lounge.mutedParticipantIds || []).some((id) => String(id) === String(participantId));
    await perform(async () => {
      const result = await api.moderateLounge(token, loungeId, {
        action,
        participantId,
        ...(action === 'mute' ? { muted } : {}),
        ...(action === 'set-co-dj' ? { enabled } : {}),
      });
      if (action === 'mute') {
        setRemoteLounge((current) => current && ({
          ...current,
          mutedParticipantIds: muted
            ? [...(current.mutedParticipantIds || []), participantId]
            : (current.mutedParticipantIds || []).filter((id) => String(id) !== String(participantId)),
        }));
      }
      if (action === 'set-co-dj') {
        setRemoteLounge((current) => current && ({
          ...current,
          coDjIds: result.moderation?.coDjIds || current.coDjIds || [],
        }));
      }
    }, action === 'mute'
      ? muted ? 'Participant muted.' : 'Participant unmuted.'
      : action === 'remove'
        ? 'Participant removed from the room.'
        : action === 'set-co-dj'
          ? enabled ? 'Co-DJ access granted.' : 'Co-DJ access removed.'
          : 'Host role transferred.');
  }

  async function handleVote(queueEntryId) {
    await perform(async () => {
      const result = await api.voteForTrack(token, loungeId, queueEntryId);
      setLiveState((current) => ({ ...current, queue: result.queue || current?.queue || [] }));
    }, 'Your vote is in — the room queue has been updated.');
  }

  async function handleRemoveQueueEntry(queueEntryId, trackId) {
    await perform(async () => {
      const result = await api.removeFromQueue(token, loungeId, queueEntryId);
      setLiveState((current) => ({ ...current, queue: result.queue || [] }));
      if (String(idOf(segueSuggestion)) === String(trackId)) {
        setSegueSuggestion(null);
        setSegueMatchReason('');
        setSegueMessage('');
      }
    }, 'Track removed from the queue.');
  }

  async function handleTrackEnded(positionSeconds) {
    if (!isHost || advancingTrackRef.current) return;
    if (!queue.length) {
      socketRef.current?.emit('lounge:playback:control', {
        loungeId,
        action: 'pause',
        positionSeconds,
      });
      return;
    }

    advancingTrackRef.current = true;
    try {
      const suggestedTrackId = segueSuggestion?.id || segueSuggestion?._id;
      const suggestedTrackIsQueued = suggestedTrackId && queue.some(
        (item) => String(idOf(item.track || item.trackId)) === String(suggestedTrackId)
      );
      let result;
      if (suggestedTrackIsQueued) {
        try {
          result = await api.applyAiSegue(token, loungeId, suggestedTrackId);
        } catch (segueError) {
          setError(`The AI segue could not be applied (${segueError.message}). Advancing the regular queue instead.`);
          result = await api.advanceQueue(token, loungeId);
        }
      } else {
        result = await api.advanceQueue(token, loungeId);
      }
      const nextTrack = normalizeTrack(result.currentTrack);
      const remainingQueue = result.remainingQueue || [];
      setLiveState((current) => ({
        ...current,
        currentTrack: nextTrack,
        currentTrackId: nextTrack.id,
        announcement: '',
        playback: { isPlaying: true, positionSeconds: 0, updatedAt: new Date().toISOString() },
        queue: remainingQueue,
      }));
      setSegueSuggestion(null);
      setSegueMatchReason('');
      setSegueMessage('');
      updateLounge(loungeId, { currentTrackId: nextTrack.id, queue: remainingQueue });
    } catch (advanceError) {
      setError(`Could not advance to the next track: ${advanceError.message}`);
      socketRef.current?.emit('lounge:playback:control', {
        loungeId,
        action: 'pause',
        positionSeconds,
      });
    } finally {
      advancingTrackRef.current = false;
    }
  }

  async function handleSendMessage(event) {
    event.preventDefault();
    const message = messageInput.trim();
    if (!message) return;
    await perform(async () => {
      await api.sendMessage(token, loungeId, message);
      setMessageInput('');
      socketRef.current?.emit('lounge:typing', { loungeId, isTyping: false });
    }, 'Message sent.');
  }

  async function handleAsk(event) {
    event.preventDefault();
    const question = questionInput.trim();
    if (!question) return;
    await perform(async () => {
      const result = await api.askAiDj(token, loungeId, question, questionTrackId || currentTrackId);
      setQuestionAnswer({
        question,
        response: result.answer || result.message,
        sources: result.sources || [],
        track: result.track || null,
      });
      setQuestionInput('');
    }, 'The AI DJ has a thought for you.');
  }

  async function voteBattle(trackId) {
    if (battle?.hasVoted || isVoting) return;
    setIsVoting(true);
    try {
      await perform(async () => {
        const result = await api.voteInBattle(token, loungeId, trackId);
        setLiveState((current) => ({
          ...current,
          battle: {
            ...current?.battle,
            hasVoted: true,
            votedTrackId: trackId,
            candidates: (current?.battle?.candidates || []).map((candidate) => {
              const id = idOf(candidate.track) || candidate.trackId;
              const vote = result.voteCounts?.find((item) => String(item.trackId) === String(id));
              return vote ? { ...candidate, votes: vote.votes } : candidate;
            }),
          },
        }));
        setBattleVotes((current) => ({ ...current, [trackId]: true }));
      }, 'Your Soundclash vote is in.');
    } finally {
      setIsVoting(false);
    }
  }

  async function submitBattleTrack(trackId) {
    await perform(async () => {
      const result = await api.submitBattleTrack(token, loungeId, trackId);
      setLiveState((current) => ({ ...current, battle: { ...current?.battle, active: result.active ?? current?.battle?.active, candidates: result.candidates || current?.battle?.candidates || [] } }));
      setFeedback('Track submitted to the Soundclash.');
    }, 'Track submitted to the Soundclash.');
  }

  async function removeBattleTrack(trackId) {
    await perform(async () => {
      const result = await api.removeBattleTrack(token, loungeId, trackId);
      setLiveState((current) => ({
        ...current,
        battle: { ...current?.battle, candidates: result.candidates || [] },
      }));
    }, 'Track removed from the Soundclash.');
  }

  async function resolveBattle() {
    await perform(async () => {
      await api.resolveBattle(token, loungeId);
    }, 'Soundclash resolved. The winner is next in the queue.');
  }

  async function openBattle() {
    const trackIds = battleList.map((candidate) => candidate.trackId || candidate.track?._id || candidate.track?.id);
    if (trackIds.length < 2 || trackIds.length > 4) {
      setError('A Soundclash needs 2–4 submitted tracks before it can open.');
      return;
    }
    await perform(async () => {
      const result = await api.openBattle(token, loungeId, 38);
      setLiveState((current) => ({
        ...current,
        battle: { ...current?.battle, ...(result.soundclash || {}), active: true, hasVoted: false, votedTrackId: null },
      }));
      setBattleVotes({});
      setBattleSeconds(38);
    }, 'Soundclash is live. Let the room decide.');
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/app/lounges/join?code=${lounge.inviteCode}`);
      setInviteCopied(true);
      setFeedback('Invite link copied. Share it with your people.');
    } catch (copyError) {
      setError(`Could not copy the invite link: ${copyError.message}`);
    }
  }

  function sendReaction() {
    setMessageInput((current) => `${current}${current ? ' ' : ''}✨`);
  }

  const sentiment = liveState?.sentiment ?? lounge.sentiment;
  const hostDisconnected = liveState?.hostDisconnected ?? lounge.hostDisconnected;
  const battleList = battle?.candidates || [];
  const battleTotal = battleList.reduce((total, item) => total + (item.votes || 0), 0);

  return (
    <div className="page-stack lounge-page">
      {showInvite && (
        <div className="invite-share-banner"><div><span className="invite-banner-icon"><Check size={17} /></span><span><b>Your lounge is ready.</b><small>Invite your people with code <strong>{lounge.inviteCode}</strong></small></span></div><div><button className="button button-outline button-small" onClick={copyInvite}><Copy size={14} /> {inviteCopied ? 'Copied' : 'Copy invite link'}</button><button className="icon-button" aria-label="Dismiss invite" onClick={() => setShowInvite(false)}>×</button></div></div>
      )}
      <div className="lounge-room-header">
        <div><Link className="back-link" to="/app/lounges"><ArrowLeft size={14} /> All lounges</Link><div className="lounge-room-title-row"><h1>{lounge.name}</h1><span className={`connection-pill connection-${connection}`}><i />{connection === 'connected' ? 'Live synced' : connection}</span></div><div className="lounge-room-subline"><span className="live-dot" /> LIVE ROOM <i /> {lounge.vibe} <i /> <Users size={14} /> {liveState?.participants ?? lounge.participants ?? 0} listening {lounge.inviteCode && <>· CODE <b>{lounge.inviteCode}</b></>}</div></div>
        <div className="lounge-room-actions"><button className="button button-outline button-small" onClick={copyInvite}><Copy size={14} /> Invite</button><button className="icon-button" aria-label="Room settings"><Settings2 size={17} /></button><button className="icon-button" aria-label="More room options"><MoreHorizontal size={18} /></button></div>
      </div>
      {error && <Notice>{error}</Notice>}
      {feedback && <Notice tone="info">{feedback}</Notice>}
      {hostDisconnected && <Notice tone="warning">The host is disconnected. Queue controls are temporarily paused.</Notice>}
      <div className="room-tabs"><Link className={!soundclashOnly ? 'active' : ''} to={`/app/lounge/${loungeId}`}>DJ Console</Link><Link className={soundclashOnly ? 'active' : ''} to={`/app/lounge/${loungeId}/soundclash`}>Soundclash <span>{battle?.active ? 'LIVE' : ''}</span></Link><button onClick={copyInvite}><Copy size={13} /> Invite</button></div>

      {soundclashOnly ? (
        <SoundclashStage tracks={tracks} currentTrack={currentTrack} candidates={battleList} totalVotes={battleTotal} active={Boolean(battle?.active)} winnerId={battle?.winnerId} seconds={battleSeconds} voted={battleVotes} hasVoted={Boolean(battle?.hasVoted || Object.values(battleVotes).some(Boolean))} votedTrackId={battle?.votedTrackId || Object.keys(battleVotes).find((id) => battleVotes[id])} isVoting={isVoting} isController={isController} isHost={isHost} onVote={voteBattle} onSubmit={submitBattleTrack} onRemove={removeBattleTrack} onOpen={openBattle} onResolve={resolveBattle} />
      ) : (
        <div className="lounge-console-grid">
          <div className="lounge-console-main">
            <NowPlaying track={currentTrack} sentiment={sentiment} playback={playback} isHost={isHost} onTrackEnded={handleTrackEnded} onPlaybackProgress={setPlaybackProgress} socketRef={socketRef} loungeId={loungeId} />
            <section className="panel queue-panel">
              <div className="panel-heading"><div><div className="eyebrow">THE CROWD PICKS WHAT'S NEXT</div><h2>Next up <span className="count-badge">{queueTracks.length}</span></h2></div><button className="button button-outline button-small" onClick={() => navigate('/app/search')}><ListPlus size={14} /> Add track</button></div>
              {queueTracks.length ? <div className="queue-list">{queueTracks.map((entry, index) => {
                if (!entry.track) return null;
                const addedById = idOf(entry.addedBy || entry.userId);
                const canRemove = isController || Boolean(userId && addedById === userId);
                return <QueueRow key={`${entry._id || entry.id || entry.track.id}-${index}`} track={entry.track} votes={entry.votes || 0} position={index + 1} canRemove={canRemove} onVote={() => handleVote(entry._id || entry.id || entry.track.id, entry.track.id)} onRemove={() => handleRemoveQueueEntry(entry._id || entry.id, entry.track.id)} />;
              })}</div> : <EmptyState icon={AudioLines} title="The queue is open" description="Find a track and add it to the room." action={<Link className="button button-outline button-small" to="/app/discover">Discover tracks</Link>} />}
            </section>
            <section className="panel compact-clash-panel">
              <div className="panel-heading"><div><div className="eyebrow">CROWD SOUNDCLASH</div><h2>{battle?.active ? 'The room is choosing.' : 'Make some friendly noise.'}</h2></div><Link className="text-link" to={`/app/lounge/${loungeId}/soundclash`}>Open stage <ArrowRight size={14} /></Link></div>
              {battle?.active ? <SoundclashStage tracks={tracks} currentTrack={currentTrack} candidates={battleList} totalVotes={battleTotal} active seconds={battleSeconds} voted={battleVotes} hasVoted={Boolean(battle?.hasVoted || Object.values(battleVotes).some(Boolean))} votedTrackId={battle?.votedTrackId || Object.keys(battleVotes).find((id) => battleVotes[id])} isVoting={isVoting} isController={isController} isHost={isHost} onVote={voteBattle} onSubmit={submitBattleTrack} onRemove={removeBattleTrack} onOpen={openBattle} onResolve={resolveBattle} compact /> : <div className="clash-idle"><span><Radio size={18} /></span><div><b>No active battle</b><small>Submit a track to challenge the next slot.</small></div><Link to={`/app/lounge/${loungeId}/soundclash`} className="button button-outline button-small">Enter the stage</Link></div>}
            </section>
          </div>
          <aside className="lounge-console-side">
            <SentimentPanel score={sentiment} messages={messages} />
            <AIDJPanel currentTrack={currentTrack} nextTrack={segueSuggestion} matchReason={segueMatchReason} sentiment={sentiment} isController={isController} announcement={liveState?.announcement} queueCount={queueTracks.length} suggestionMessage={segueMessage} />
            <AIQuestionPanel question={questionInput} setQuestion={setQuestionInput} answer={questionAnswer} onAsk={handleAsk} currentTrack={currentTrack} recentTracks={recentQuestionTracks} selectedTrackId={questionTrackId} setSelectedTrackId={setQuestionTrackId} />
            {isHost && <RoomControls lounge={lounge} user={user} participants={liveState?.participantList || []} onLock={toggleRoomLock} onEnd={endLounge} onModerate={moderateParticipant} />}
            <ChatPanel messages={messages} user={user} input={messageInput} setInput={setMessageInput} onSend={handleSendMessage} onReaction={sendReaction} typing={liveState?.typing} endRef={chatEndRef} socketRef={socketRef} loungeId={loungeId} />
          </aside>
        </div>
      )}
    </div>
  );
}

function NowPlaying({ track, sentiment, playback, isHost, onTrackEnded, onPlaybackProgress, socketRef, loungeId }) {
  const audioRef = useRef(null);
  const lastReportedPosition = useRef(0);
  const autoplayBlocked = useRef(false);
  const { token } = useAuth();
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [seekPosition, setSeekPosition] = useState(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [playbackError, setPlaybackError] = useState('');
  const [needsAudioEnable, setNeedsAudioEnable] = useState(false);
  const sentimentText = Number.isFinite(sentiment) ? `${Math.round(sentiment * 100)}%` : 'unavailable';
  const source = track.audioAssetUrl
    ? resolveAssetUrl(track.audioAssetUrl)
    : '';
  const duration = audioDuration || track.durationSeconds || 0;
  const displayedPosition = seekPosition ?? currentTime;
  const progress = duration ? Math.min(100, (displayedPosition / duration) * 100) : 0;
  const visibleTimeline = hasStarted
    ? (track.timeline || []).filter((entry) => Number.isFinite(Number(entry.ts)) && Number(entry.ts) <= currentTime)
    : [];

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setHasStarted(false);
    setSeekPosition(null);
    setIsSeeking(false);
    setAudioDuration(0);
    setPlaybackError('');
    setNeedsAudioEnable(false);
    autoplayBlocked.current = false;
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
  }, [source]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !source || !playback) return;
    const updatedAt = playback.updatedAt ? new Date(playback.updatedAt).getTime() : Date.now();
    const elapsedSinceSync = playback.isPlaying ? Math.max(0, (Date.now() - updatedAt) / 1000) : 0;
    const targetPosition = Math.min(
      duration || Number.POSITIVE_INFINITY,
      (playback.positionSeconds || 0) + elapsedSinceSync
    );
    if (!isSeeking && Math.abs(audio.currentTime - targetPosition) > 2) {
      audio.currentTime = targetPosition;
      setCurrentTime(targetPosition);
    }

    if (!playback.isPlaying) {
      audio.pause();
      setPlaying(false);
      setNeedsAudioEnable(false);
      autoplayBlocked.current = false;
      return;
    }
    if (autoplayBlocked.current) return;
    if (audio.paused) {
      audio.play()
        .then(() => {
          setPlaying(true);
          setNeedsAudioEnable(false);
          setPlaybackError('');
        })
        .catch((error) => {
          setPlaying(false);
          setNeedsAudioEnable(true);
          if (error.name !== 'NotAllowedError') {
            setPlaybackError(`Audio could not be played: ${error.message}`);
          } else {
            autoplayBlocked.current = true;
          }
        });
    }
  }, [playback?.isPlaying, playback?.positionSeconds, playback?.updatedAt, source, duration, isSeeking]);

  async function togglePlayback() {
    if (!audioRef.current || !source) return;
    if (!isHost) {
      await enableListenerAudio();
      return;
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
      socketRef.current?.emit('lounge:playback:control', {
        loungeId,
        action: 'pause',
        positionSeconds: audioRef.current.currentTime,
      });
      return;
    }
    try {
      await audioRef.current.play();
      setPlaybackError('');
      setPlaying(true);
      setNeedsAudioEnable(false);
      autoplayBlocked.current = false;
      socketRef.current?.emit('lounge:playback:control', {
        loungeId,
        action: 'play',
        positionSeconds: audioRef.current.currentTime,
      });
      api.recordInteraction(token, { trackId: track.id, playedSeconds: 0 })
        .catch((recordError) => setPlaybackError(`Playback started, but listening history was not saved: ${recordError.message}`));
    } catch (error) {
      setPlaybackError(`Audio could not be played: ${error.message}`);
    }
  }

  async function enableListenerAudio() {
    if (!audioRef.current || !source || !playback?.isPlaying) return;
    try {
      const updatedAt = playback.updatedAt ? new Date(playback.updatedAt).getTime() : Date.now();
      const targetPosition = (playback.positionSeconds || 0) + Math.max(0, (Date.now() - updatedAt) / 1000);
      audioRef.current.currentTime = Math.min(duration || targetPosition, targetPosition);
      await audioRef.current.play();
      setPlaying(true);
      setNeedsAudioEnable(false);
      setPlaybackError('');
      api.recordInteraction(token, { trackId: track.id, playedSeconds: 0 })
        .catch((recordError) => setPlaybackError(`Playback started, but listening history was not saved: ${recordError.message}`));
    } catch (error) {
      setPlaybackError(`Audio could not be enabled: ${error.message}`);
    }
  }

  function reportPlaybackPosition() {
    const audio = audioRef.current;
    if (!isHost || !playing || !audio) return;
    if (audio.currentTime - lastReportedPosition.current < 5) return;
    lastReportedPosition.current = audio.currentTime;
    socketRef.current?.emit('lounge:playback:control', {
      loungeId,
      action: 'position',
      positionSeconds: audio.currentTime,
    });
  }

  function seekTo(positionSeconds) {
    const audio = audioRef.current;
    if (!isHost || !audio || !source || !duration) return;
    const targetPosition = Math.max(0, Math.min(duration, positionSeconds));
    try {
      audio.currentTime = targetPosition;
      setCurrentTime(targetPosition);
      setSeekPosition(null);
      setIsSeeking(false);
      socketRef.current?.emit('lounge:playback:control', {
        loungeId,
        action: 'position',
        positionSeconds: targetPosition,
      });
    } catch (error) {
      setPlaybackError(`Could not seek in this track: ${error.message}`);
    }
  }

  function skipBy(seconds) {
    const position = audioRef.current?.currentTime ?? currentTime;
    seekTo(position + seconds);
  }

  return (
    <section className="panel now-playing-panel">
      <div className="now-playing-heading"><div className="eyebrow"><span className="live-dot" /> NOW PLAYING</div><div className="now-playing-live"><span className="equalizer"><i /><i /><i /><i /></span> LIVE SET</div></div>
      <div className="now-playing-content"><div className="now-playing-art-wrap"><TrackArtwork track={track} className="now-playing-art" /><span className="art-glow" /></div><div className="now-playing-details"><div className="now-track-kicker">CURRENT TRACK</div><h2>{track.title}</h2><p>{track.artist} {track.album && <><i /> {track.album}</>}</p><div className="now-track-tags">{track.acoustic?.bpm && <span>{track.acoustic.bpm} BPM</span>}{track.acoustic?.camelotKey && <span>{track.acoustic.camelotKey} KEY</span>}{track.acoustic?.energy != null && <span><Zap size={12} /> {Math.round(track.acoustic.energy * 100)}% ENERGY</span>}{track.acoustic?.demoOnly && <span className="demo-profile-badge">DEMO BPM/KEY</span>}</div></div></div>
      {source && <audio
        ref={audioRef}
        src={source}
        preload="metadata"
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          const durationSeconds = audio?.duration || duration;
          setAudioDuration(durationSeconds);
          onPlaybackProgress({ trackId: track.id, positionSeconds: audio?.currentTime || 0, durationSeconds });
        }}
        onPlay={() => setHasStarted(true)}
        onTimeUpdate={() => {
          const audio = audioRef.current;
          const positionSeconds = audio?.currentTime || 0;
          setCurrentTime(positionSeconds);
          onPlaybackProgress({
            trackId: track.id,
            positionSeconds,
            durationSeconds: audio?.duration || duration,
          });
          reportPlaybackPosition();
        }}
        onEnded={() => { setPlaying(false); if (isHost) onTrackEnded(audioRef.current?.currentTime || 0); }}
        onError={() => { setPlaying(false); setPlaybackError('The audio asset could not be loaded from the backend.'); }}
      />}
      <div className="player-controls">
        <button className="player-skip" type="button" aria-label="Back 10 seconds" title="Back 10 seconds" onClick={() => skipBy(-10)} disabled={!isHost || !source || !duration}><Rewind size={17} /><span>10</span></button>
        <div className="player-progress-wrap">
          <div className="player-time"><span>{formatTime(seekPosition ?? currentTime)}</span><span>{formatTime(duration)}</span></div>
          <input
            className="player-progress"
            type="range"
            aria-label="Seek through track"
            min="0"
            max={duration || 0}
            step="0.1"
            value={seekPosition ?? currentTime}
            style={{ '--progress': `${progress}%` }}
            onChange={(event) => {
              setSeekPosition(Number(event.target.value));
              setIsSeeking(true);
            }}
            onPointerUp={(event) => seekTo(Number(event.currentTarget.value))}
            onKeyUp={(event) => seekTo(Number(event.currentTarget.value))}
            onBlur={() => {
              if (seekPosition != null) seekTo(seekPosition);
            }}
            disabled={!isHost || !source || !duration}
          />
        </div>
        <button className="player-skip" type="button" aria-label="Forward 10 seconds" title="Forward 10 seconds" onClick={() => skipBy(10)} disabled={!isHost || !source || !duration}><FastForward size={17} /><span>10</span></button>
        <button className="player-play" aria-label={isHost ? (playing ? 'Pause room playback' : 'Play room playback') : needsAudioEnable ? 'Enable synced audio' : 'Playback is controlled by the host'} onClick={togglePlayback} disabled={!source || (!isHost && (!needsAudioEnable || !playback?.isPlaying))}>{playing ? <span>Ⅱ</span> : <Play size={17} fill="currentColor" />}</button>
      </div>
      {!isHost && <div className="now-playing-foot"><span>{needsAudioEnable ? <button className="button button-outline button-small" onClick={enableListenerAudio}>Enable synced audio</button> : playback?.isPlaying ? 'Synced to the Host’s playback' : 'Playback is controlled by the Host'}</span><span>{playback?.isPlaying ? 'LIVE' : 'PAUSED'}</span></div>}
      {playbackError && <Notice>{playbackError}</Notice>}
      {!source && <div className="now-playing-foot"><span>Audio is not available for this track.</span><span>Room mood: {sentimentText}</span></div>}
      {source && <div className="now-playing-foot"><span>{needsAudioEnable ? <button className="button button-outline button-small" onClick={togglePlayback}>Resume playback</button> : <><AudioLines size={14} /> Audio playback available</>}</span><span>Room mood: {sentimentText}</span></div>}
      {visibleTimeline.length > 0 && (
        <div className="now-playing-timeline" aria-label={`${track.title} metadata timeline`}>
          <div className="now-playing-timeline-heading">
            <span><Sparkles size={13} /> TRACK NOTES</span>
            <small>{visibleTimeline.length} {visibleTimeline.length === 1 ? 'note' : 'notes'}</small>
          </div>
          <ul aria-live="polite">
            {visibleTimeline.map((entry, index) => (
              <li key={`${entry.ts}-${entry.type}-${index}`}>
                <div><span className={`timeline-type timeline-type-${entry.type}`}>{formatTimelineType(entry.type)}</span><time>{formatTime(entry.ts)}</time></div>
                <p>{entry.text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function formatTimelineType(type) {
  if (type === 'sample_credit') return 'Sample credit';
  if (type === 'glossary') return 'Glossary';
  return 'Trivia';
}

function QueueRow({ track, votes, position, canRemove, onVote, onRemove }) {
  return (
    <div className="queue-row">
      <span className="queue-position">{String(position).padStart(2, '0')}</span><TrackArtwork track={track} />
      <div className="queue-track-copy">
        <Link to={`/app/track/${track.id}`}><b>{track.title}</b></Link><span>{track.artist}</span>{track.acoustic?.demoOnly && <small className="demo-profile-badge">DEMO BPM/KEY</small>}
      </div>
      <span className="queue-track-acoustic">{track.acoustic?.bpm} <small>BPM</small> · {track.acoustic?.camelotKey}</span>
      {canRemove && <button className="queue-remove-button" onClick={onRemove} aria-label={`Remove ${track.title} from queue`} title="Remove from queue"><Trash2 size={14} /></button>}
      <button className="queue-vote-button" onClick={onVote} aria-label={`Upvote ${track.title}`}><ThumbsUp size={15} /> <span>{votes}</span></button>
    </div>
  );
}

function SentimentPanel({ score, messages }) {
  const buckets = {
    positive: messages.filter((message) => message.sentiment === 'positive').length,
    neutral: messages.filter((message) => !message.sentiment || message.sentiment === 'neutral').length,
    negative: messages.filter((message) => message.sentiment === 'negative').length,
  };
  const total = Math.max(1, Object.values(buckets).reduce((sum, value) => sum + value, 0));
  return (
    <section className="panel sentiment-panel">
      <div className="panel-heading"><div><div className="eyebrow">LIVE SENTIMENT</div><h2>How the room feels</h2></div><span className="sentiment-panel-icon">✦</span></div>
      <SentimentBar score={score} />
      <div className="sentiment-breakdown"><SentimentDot label="Positive" value={buckets.positive} total={total} tone="positive" /><SentimentDot label="Neutral" value={buckets.neutral} total={total} tone="neutral" /><SentimentDot label="Low-key" value={buckets.negative} total={total} tone="negative" /></div>
      <div className="sentiment-foot"><span><i /> Updating from room chat</span><small>last 5 min</small></div>
    </section>
  );
}

function SentimentDot({ label, value, total, tone }) {
  return <div className="sentiment-dot-row"><i className={`sentiment-${tone}`} /><span>{label}</span><b>{Math.round((value / total) * 100)}%</b></div>;
}

function AIDJPanel({ currentTrack, nextTrack, matchReason, sentiment, isController, announcement, queueCount, suggestionMessage }) {
  const currentKey = currentTrack.acoustic?.camelotKey;
  const nextKey = nextTrack?.acoustic?.camelotKey;
  const bpmDelta = nextTrack?.acoustic?.bpm && currentTrack.acoustic?.bpm
    ? Math.abs(nextTrack.acoustic.bpm - currentTrack.acoustic.bpm)
    : null;
  return (
    <section className="panel ai-dj-panel">
      <div className="panel-heading"><div><div className="eyebrow">YOUR AI DJ</div><h2>In the mix.</h2></div><span className="ai-orb"><Sparkles size={16} /></span></div>
      <div className="ai-banter"><div className="ai-banter-top"><span className="ai-avatar"><AudioLines size={14} /></span><span>AI DJ</span><span className="ai-live-indicator">LIVE</span></div><p>{announcement || matchReason || 'Segue suggestions are generated from the backend track profiles and room data.'}</p><div className="ai-source"><Sparkles size={13} /> Backend track and room data</div></div>
      <div className="ai-match-title"><span>WHY THIS NEXT TRACK</span><small>{Number.isFinite(sentiment) ? `${Math.round(sentiment * 100)}% room energy` : 'Room energy unavailable'}</small></div>
      {nextTrack && <div className="ai-match-details">{bpmDelta !== null && <span>{bpmDelta} BPM difference</span>}{currentKey && nextKey && <span>{currentKey} → {nextKey}</span>}{matchReason && <span>{matchReason}</span>}</div>}
      <div className="ai-next-card"><span className="ai-next-art"><AudioLines size={15} /></span><span><small>NEXT IN THE FLOW</small><b>{nextTrack?.title || (queueCount ? 'No compatible track available' : 'No track queued')}</b><i>{nextTrack?.artist || suggestionMessage || (queueCount ? 'The queued tracks do not match the current track’s tempo and key.' : 'Add tracks to the queue for a segue suggestion.')}</i></span>{nextKey && <span className="ai-fit">{nextKey}</span>}</div>
      {nextTrack && <div className="segue-review-state"><Check size={13} /> {isController ? 'AI pick will play when this track ends.' : 'AI pick is set for when this track ends.'}</div>}
      <div className="ai-ask"><div><Sparkles size={15} /><span>Curious about the music?</span></div><Link to={`/app/track/${currentTrack.id}`}>Track details <ArrowRight size={13} /></Link></div>
    </section>
  );
}

function AIQuestionPanel({ question, setQuestion, answer, onAsk, currentTrack, recentTracks, selectedTrackId, setSelectedTrackId }) {
  return (
    <section className="panel ai-qa-panel">
      <div className="panel-heading"><div><div className="eyebrow">AI DJ Q&A</div><h2>Ask about the music.</h2></div><span className="panel-icon panel-icon-violet"><Sparkles size={16} /></span></div>
      <label className="ai-qa-track-select">Ask about
        <select value={selectedTrackId || currentTrack.id} onChange={(event) => setSelectedTrackId(event.target.value)}>
          <option value={currentTrack.id}>Now playing · {currentTrack.title}</option>
          {recentTracks.map((track) => <option key={track.id} value={track.id}>Recently played · {track.title}</option>)}
        </select>
      </label>
      <form className="ai-qa-form" onSubmit={onAsk}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Where is this sample from?" aria-label="Ask the AI DJ a question" /><button className="button button-primary button-small">Ask</button></form>
      {answer ? <div className="ai-qa-answer"><div><b>You asked{answer.track?.title ? ` about ${answer.track.title}` : ''}</b><span>{answer.question}</span></div><div><b>AI DJ</b><p>{answer.response}</p><small>Grounded in: {(answer.sources || []).map((source) => typeof source === 'string' ? source : source.text || source.type || 'track metadata').join(', ') || 'track metadata'}</small></div></div> : <div className="ai-qa-suggestions"><button type="button" onClick={() => setQuestion('Why did you choose this track?')}>Why this track?</button><button type="button" onClick={() => setQuestion('Where is this sample from?')}>Sample origin?</button></div>}
    </section>
  );
}

function RoomControls({ lounge, user, participants, onLock, onEnd, onModerate }) {
  const userId = String(user._id || user.id);
  const otherParticipants = participants.filter((person) => String(person._id || person.id) !== userId);
  const availableParticipants = otherParticipants;
  const [selectedId, setSelectedId] = useState('');
  const targetId = availableParticipants.some((person) => String(person._id || person.id) === selectedId)
    ? selectedId
    : String(availableParticipants[0]?._id || availableParticipants[0]?.id || '');
  const selectedParticipant = availableParticipants.find((person) => String(person._id || person.id) === targetId);
  const selectedIsMuted = (lounge.mutedParticipantIds || []).some((id) => String(id) === targetId);
  const selectedIsCoDj = (lounge.coDjIds || []).some((id) => String(id) === targetId);
  const canTransferHost = ['host', 'admin'].includes(selectedParticipant?.role);

  return (
    <section className="panel room-controls-panel">
      <div className="panel-heading"><div><div className="eyebrow">HOST CONTROLS</div><h2>Run the room.</h2></div><span className="panel-icon"><Settings2 size={16} /></span></div>
      <button className="room-control-row" onClick={onLock}><span><LockKeyhole size={15} /><b>{lounge.locked ? 'Unlock room' : 'Lock room'}</b></span><small>{lounge.locked ? 'Invite-only' : 'Allow invited listeners'}</small></button>
      <div className="room-moderation"><label className="field-label">Participant<select value={targetId} onChange={(event) => setSelectedId(event.target.value)} disabled={!targetId}><option value="">No other participants</option>{availableParticipants.map((person) => <option key={person._id || person.id} value={person._id || person.id}>{person.displayName} · {formatParticipantRole(person.role)}</option>)}</select></label><div className="moderation-buttons"><button className="button button-outline button-small" onClick={() => onModerate('mute', targetId)} disabled={!targetId}>{selectedIsMuted ? 'Unmute' : 'Mute'}</button><button className="button button-outline button-small" onClick={() => onModerate('remove', targetId)} disabled={!targetId}>Remove</button><button className="button button-outline button-small" onClick={() => onModerate('set-co-dj', targetId, !selectedIsCoDj)} disabled={!targetId}>{selectedIsCoDj ? 'Remove Co-DJ' : 'Make Co-DJ'}</button><button className="button button-outline button-small" onClick={() => onModerate('transfer', targetId)} disabled={!canTransferHost}>Transfer host</button></div></div>
      <button className="end-room-button" onClick={onEnd}><span><Radio size={15} /><b>End this session</b></span><small>Save the room and wrap up</small></button>
    </section>
  );
}

function ChatPanel({ messages, user, input, setInput, onSend, onReaction, typing, endRef, socketRef, loungeId }) {
  const currentUserId = String(user?._id || user?.id || '');

  return (
    <section className="panel chat-panel">
      <div className="panel-heading chat-heading"><div><div className="eyebrow">THE ROOM</div><h2>Live chat <span className="chat-online-dot" /></h2></div><button className="icon-button" aria-label="Chat options"><MoreHorizontal size={17} /></button></div>
      <div className="chat-messages">
        {messages.length ? messages.map((message, index) => {
          const sender = message.user;
          const senderId = typeof sender === 'string'
            ? sender
            : sender?._id || sender?.id || message.userId;
          const isAiMessage = message.system || message.msgType === 'ai_answer' || message.msgType === 'dj_announcement';
          const isOwnMessage = !isAiMessage && currentUserId && String(senderId || '') === currentUserId;
          const displayName = isOwnMessage
            ? 'You'
            : typeof sender === 'string'
              ? sender
              : sender?.displayName || 'AI DJ';
          const initials = message.initials || String(displayName).slice(0, 1).toUpperCase();
          const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
          return (
            <div className={`chat-message${isOwnMessage ? ' chat-message-own' : ''}${isAiMessage ? ' chat-message-ai' : ''}`} key={message.id || message.messageId || message._id || `${displayName}-${index}`}>
              {!isOwnMessage && <span className="avatar avatar-tiny">{initials}</span>}
              <div className="chat-message-content"><div><b>{displayName}</b>{time && <small>{time}</small>}</div><p>{message.text || message.body}</p></div>
            </div>
          );
        }) : <EmptyState icon={MessageCircle} title="It’s quiet in here" description="Say hello and set the room’s tone." />}
        {typing && <div className="typing-indicator"><span /><span /><span /> {typing} is typing</div>}
        <div ref={endRef} />
      </div>
      <form className="chat-compose" onSubmit={onSend}><button type="button" className="reaction-button" aria-label="Add sparkle reaction" onClick={onReaction}>✦</button><input value={input} onChange={(event) => { setInput(event.target.value); socketRef.current?.emit('lounge:typing', { loungeId, isTyping: Boolean(event.target.value) }); }} placeholder={`Message as ${(user?.displayName || 'listener').trim().split(/\s+/)[0]}…`} aria-label="Write a chat message" /><button className="chat-send" aria-label="Send message"><Send size={15} /></button></form>
      <div className="chat-safety"><Shield size={12} /> Keep it kind. This room is for everyone.</div>
    </section>
  );
}

function SoundclashStage({ tracks, currentTrack, candidates, totalVotes, active, winnerId, seconds, voted, hasVoted, votedTrackId, isVoting, isController, isHost, onVote, onSubmit, onRemove, onOpen, onResolve, compact = false }) {
  const [selectedTrack, setSelectedTrack] = useState('');
  const [showSubmit, setShowSubmit] = useState(false);
  const candidateIds = candidates.map((candidate) => idOf(candidate.track) || candidate.trackId);
  const availableTracks = tracks.filter((track) => track.id !== currentTrack.id && !candidateIds.includes(track.id));

  return (
    <section className={`panel soundclash-stage ${compact ? 'soundclash-compact' : ''}`}>
      <div className="soundclash-heading"><div><div className="eyebrow">{active ? 'BATTLE IS LIVE' : winnerId ? 'BATTLE RESULT' : 'SOUNDCLASH STAGE'}</div><h2>{active ? 'The room decides what plays next.' : winnerId ? 'The crowd picked a winner.' : 'Drop a track into the ring.'}</h2><p>{active ? 'Two to four tracks. One crowd-picked winner.' : winnerId ? 'The winning track is now in Next Up.' : 'Submit a challenger and let everyone vote.'}</p></div>{active && <div className="battle-countdown"><Clock3 size={15} /><b>00:{String(seconds).padStart(2, '0')}</b><small>LEFT TO VOTE</small></div>}</div>
      {winnerId && !active && <div className="battle-winner-banner"><span><Check size={16} /></span><div><b>Winner added to Next Up</b><small>{tracks.find((track) => track.id === winnerId)?.title || 'Winning track'} is next in the room.</small></div></div>}
      <div className="battle-current-track"><TrackArtwork track={currentTrack} /><span><small>ON THE DECKS</small><b>{currentTrack.title}</b><i>{currentTrack.artist}</i></span><span className="vs-badge">VS</span></div>
      {candidates.length ? <div className="battle-candidates">{candidates.map((candidate, index) => {
        const trackId = idOf(candidate.track) || candidate.trackId;
        const track = trackById(tracks, trackId) || (typeof candidate.track === 'object' ? normalizeTrack(candidate.track) : null);
        const votes = candidate.votes || 0;
        const percent = totalVotes ? Math.round((votes / totalVotes) * 100) : 0;
        if (!track) return null;
        const trackMetadata = [
          track.artist,
          track.album,
          track.acoustic?.bpm ? `${track.acoustic.bpm} BPM` : null,
          track.acoustic?.camelotKey || null,
          track.genre || null,
          track.durationSeconds ? formatTime(track.durationSeconds) : null,
        ].filter(Boolean);
        return (
          <article className="battle-candidate" key={track.id || index}>
            <div className="battle-candidate-art"><TrackArtwork track={track} /><span className="candidate-index">0{index + 1}</span></div>
            <div className="battle-candidate-content"><div className="battle-candidate-title"><div><b>{track.title}</b><span>{trackMetadata.join(' · ')}</span></div><strong>{percent}%</strong></div><div className="battle-vote-track"><span style={{ width: `${percent}%` }} /></div><div className="battle-candidate-foot"><span>{votes} {votes === 1 ? 'vote' : 'votes'}</span><div className="battle-candidate-actions">{isHost && !active && <button className="button button-outline button-small battle-remove-button" onClick={() => onRemove(trackId)} aria-label={`Remove ${track.title} from Soundclash`} title="Remove track"><Trash2 size={13} /> Remove</button>}<button className={`button ${votedTrackId === trackId || voted?.[trackId] ? 'button-outline' : 'button-primary'} button-small`} disabled={!active || hasVoted || isVoting} onClick={() => onVote(trackId)}>{votedTrackId === trackId || voted?.[trackId] ? <><Check size={13} /> Voted</> : hasVoted ? 'Already voted' : isVoting ? 'Submitting…' : <><Heart size={13} /> Vote for this</>}</button></div></div></div>
          </article>
        );
      })}</div> : <EmptyState icon={Radio} title="Waiting for challengers" description="Submit a track from the catalog to get the battle started." />}
      <div className="battle-stage-actions">
        {showSubmit && !active ? <div className="battle-submit-form"><select value={selectedTrack} onChange={(event) => setSelectedTrack(event.target.value)} aria-label="Choose a track to submit"><option value="">Choose a track…</option>{availableTracks.map((track) => <option value={track.id} key={track.id}>{track.title} — {track.artist}</option>)}</select><button className="button button-primary button-small" disabled={!selectedTrack || candidates.length >= 4} onClick={() => { onSubmit(selectedTrack); setSelectedTrack(''); setShowSubmit(false); }}>Submit track</button><button className="icon-button" aria-label="Cancel" onClick={() => setShowSubmit(false)}>×</button></div> : <button className="button button-outline button-small" onClick={() => setShowSubmit(true)} disabled={active || availableTracks.length === 0 || candidates.length >= 4}><PlusIcon /> Submit a track</button>}
        {isHost && !active && candidates.length >= 2 && <button className="button button-primary button-small" onClick={onOpen}><Radio size={13} /> Open battle</button>}
        {isController && active && <button className="button button-primary button-small" onClick={onResolve} disabled={seconds > 0}><Check size={14} /> {seconds > 0 ? 'Vote in progress' : 'Resolve battle'}</button>}
        {active && <span className="battle-vote-total"><Users size={14} /> {totalVotes} votes in the room</span>}
      </div>
    </section>
  );
}

function PlusIcon() {
  return <Plus size={14} aria-hidden="true" />;
}

function normalizeTrack(track) {
  return {
    ...track,
    id: track._id || track.id,
    cover: track.coverImageUrl || track.cover,
  };
}

function normalizeLounge(record, queueResult) {
  const participants = Array.isArray(record.participants)
    ? record.participants.length
    : record.participants;
  return {
    ...record,
    id: record._id || record.id,
    host: record.host?.displayName || record.host,
    hostId: idOf(record.host),
    coDjIds: (record.coDJs || []).map(idOf),
    mutedParticipantIds: (record.mutedParticipants || []).map(idOf),
    currentTrackId: idOf(queueResult.currentTrack || record.currentTrack),
    queue: queueResult.queue || record.queue || [],
    participants,
    sentiment: queueResult.sentiment ?? record.currentSentimentScore,
    inviteCode: record.inviteCode,
    vibe: record.vibeProfile,
    status: record.status,
    messages: [],
    battle: record.soundclash,
  };
}

function trackById(tracks, id) {
  if (!id) return null;
  return tracks.find((track) => track.id === id || track._id === id) || null;
}

function formatParticipantRole(role) {
  if (role === 'co_dj') return 'Co-DJ';
  if (role === 'host') return 'Host';
  if (role === 'admin') return 'Admin';
  return 'Listener';
}

function idOf(track) {
  if (!track) return null;
  return typeof track === 'object' ? track._id || track.id : track;
}

function formatTime(seconds) {
  const wholeSeconds = Math.floor(Number(seconds) || 0);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

class LoungeRoomErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Lounge room failed to render:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="page-stack lounge-empty-state">
        <section className="panel lounge-empty-panel" role="alert">
          <span className="panel-icon"><Radio size={18} /></span>
          <div className="eyebrow">LOUNGE ERROR</div>
          <h1>This room couldn’t load.</h1>
          <p>{this.state.error.message || 'An unexpected error occurred while displaying the lounge.'}</p>
          <div className="lounge-empty-actions">
            <button className="button button-primary" onClick={() => window.location.reload()}>Reload room</button>
            <Link className="button button-outline" to="/app/lounges"><ArrowLeft size={15} /> Your lounges</Link>
          </div>
        </section>
      </div>
    );
  }
}

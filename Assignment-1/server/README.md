# AI DJ Studio — Backend API

A real-time collaborative DJ platform built with **Node.js + Express + MongoDB + Socket.io**.

## 🚀 Quick Start

### Prerequisites
- Node.js (v18+)
- MongoDB (running locally on port 27017)

### 1. Setup

```bash
cd server
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update the values:

```bash
cp .env.example .env
```

> ⚠️ **Never commit your `.env` file to git!**

### 3. Seed Local Development Data

```bash
npm run assets:generate
node seed.js
```

The first command generates the original synthetic WAV tracks and procedural PNG covers
in the repository's `assets/` folder. The seed creates any missing local development
accounts and refreshes the five demo tracks; unrelated tracks, accounts, lounges, and
database records are preserved. It validates audio duration, cover signatures, and track
fields, then stores playable copies under `server/uploads/tracks/`. The demo profiles'
BPM, Camelot key, energy, and valence are manually authored fixtures, not measurements
of the generated audio. Their `demoOnly` flag and timeline notes identify this distinction.
See [`docs/AUDIO_ASSET_SOURCES.md`](../docs/AUDIO_ASSET_SOURCES.md) for the asset
inventory and provenance details. The seed updates the five known legacy demo records
and removes their known obsolete upload copies when rerun.
Set unique `DEMO_HOST_PASSWORD`, `DEMO_LISTENER_PASSWORD`, and `DEMO_ADMIN_PASSWORD`
values in the ignored local `server/.env` before seeding if those accounts do not yet
exist. Each password must have at least six characters. The seed never resets existing
account passwords and does not print passwords.

### 4. Start the Server

```bash
# Development (auto-restart on file changes)
npm run dev

# Production
npm start
```

Server runs at: **http://localhost:5000**

---

## 📁 Project Structure

```
server/
├── server.js              ← Entry point
├── seed.js                ← Database seeder
├── config/
│   └── db.js              ← MongoDB connection
├── middleware/
│   ├── auth.js            ← JWT + RBAC middleware
│   └── errorHandler.js    ← Global error handler
├── models/
│   ├── User.js            ← User schema
│   ├── Track.js           ← Track + acoustic features schema
│   ├── Lounge.js          ← DJ Lounge schema
│   ├── QueueEvent.js      ← Event log (analytics)
│   ├── ChatMessage.js     ← Chat messages
│   └── Interaction.js     ← Listening interactions (recommendations)
├── routes/
│   ├── auth.js
│   ├── tracks.js
│   ├── lounges.js
│   ├── queue.js
│   ├── soundclash.js
│   ├── chat.js
│   ├── aiDj.js
│   ├── analytics.js
│   └── recommendations.js
├── controllers/           ← Route handler logic
├── services/
│   ├── acousticMatcher.js    ← BPM + Camelot key compatibility rules
│   ├── sentimentEngine.js    ← Chat sentiment scoring
│   ├── aiDjEngine.js         ← AI DJ banter + Q&A
│   ├── queueEngine.js        ← Queue ordering and Soundclash winner selection
│   ├── soundclashService.js  ← Idempotent battle resolution
│   ├── accessPolicy.js       ← Lounge membership and control rules
│   └── recommendationEngine.js ← Hybrid recommendations
├── tests/
│   └── prdAcceptance.test.js ← Node.js acceptance/unit tests
└── socket/
    └── socketHandler.js   ← Socket.io real-time events
```

---

## 🔌 API Reference

### Authentication

| Method | Endpoint           | Description            | Auth |
|--------|--------------------|------------------------|------|
| POST   | `/api/auth/register` | Register new user     | No   |
| POST   | `/api/auth/login`    | Login                 | No   |
| POST   | `/api/auth/refresh`  | Rotate refresh session and issue a new access token | Refresh cookie |
| POST   | `/api/auth/logout`   | Revoke refresh session | Refresh cookie |
| GET    | `/api/auth/me`       | Get my profile        | Yes  |
| PUT    | `/api/auth/me`       | Update my profile     | Yes  |

Access tokens expire within one hour, regardless of a longer `JWT_EXPIRE`
value. Login and registration set a rotating, HttpOnly refresh cookie
(`JWT_REFRESH_EXPIRE`, default 30 days); refresh hashes are stored on the user,
and logout revokes the active refresh session. Set `CLIENT_URL` to the exact
browser origin when hosting the client separately (or a comma-separated list
of exact origins) so credentialed requests and Socket.IO can connect. Production
refresh cookies use `SameSite=None; Secure` for separately hosted HTTPS clients.

### Tracks

| Method | Endpoint           | Description            | Auth |
|--------|--------------------|------------------------|------|
| GET    | `/api/tracks`        | Get all tracks (with search) | Yes |
| GET    | `/api/tracks/:id`    | Get track + acoustic profile | Yes |
| POST   | `/api/tracks`        | Upload track with acoustic data | Admin |
| PUT    | `/api/tracks/:id`    | Update own track       | Uploader/Admin |
| DELETE | `/api/tracks/:id`    | Delete track           | Admin |

### DJ Lounges

Role access: Hosts create lounges, open Soundclash battles, and manage room moderation/session status; Co-DJs can control the queue and resolve Soundclash battles; listeners can join, chat, add/vote on queue tracks, and submit/vote on Soundclash candidates. Admins retain administrative access. These checks are enforced by the API, not only by the client.

| Method | Endpoint               | Description          | Auth  |
|--------|------------------------|----------------------|-------|
| GET    | `/api/lounges`           | Get all active lounges | Yes |
| GET    | `/api/lounges/my`        | My lounge history    | Yes   |
| GET    | `/api/lounges/:id`       | Get lounge state     | Lounge member |
| POST   | `/api/lounges`           | Create a lounge      | Host/Admin |
| POST   | `/api/lounges/join`      | Join via invite code | Yes   |
| PUT    | `/api/lounges/:id/status`| Start/end session    | Host/Admin |
| POST   | `/api/lounges/:id/leave` | Leave a lounge       | Member |
| PUT    | `/api/lounges/:id/moderation` | Mute, remove/ban, lock, assign Co-DJ, or transfer host | Host/Admin |

### Queue

| Method | Endpoint                  | Description           |
|--------|---------------------------|-----------------------|
| GET    | `/api/queue/:loungeId`      | Get current queue     | Lounge member |
| POST   | `/api/queue/:loungeId/add`  | Add track to queue    | Lounge member |
| POST   | `/api/queue/:loungeId/vote` | Vote once for a track | Lounge member |
| DELETE | `/api/queue/:loungeId/:queueEntryId` | Remove own queued track; Host/Co-DJ can remove any | Lounge member |
| POST   | `/api/queue/:loungeId/next` | Advance to next       | Host/Co-DJ |

### Soundclash Battles

| Method | Endpoint                        | Description           |
|--------|---------------------------------|-----------------------|
| GET    | `/api/soundclash/:loungeId`       | Get battle state       | Lounge member |
| POST   | `/api/soundclash/:loungeId/submit` | Submit a candidate    | Lounge member |
| DELETE | `/api/soundclash/:loungeId/candidates/:trackId` | Remove a candidate before a battle opens | Host/Admin |
| POST   | `/api/soundclash/:loungeId/open`   | Open a timed battle   | Host/Admin |
| POST   | `/api/soundclash/:loungeId/vote`   | Vote once in battle   | Lounge member |
| POST   | `/api/soundclash/:loungeId/resolve`| Resolve after deadline | Host/Co-DJ |

### Chat

| Method | Endpoint          | Description            |
|--------|-------------------|------------------------|
| GET    | `/api/chat/:loungeId` | Get message history |
| POST   | `/api/chat/:loungeId` | Send a message      |
| POST   | `/api/chat/:loungeId/:messageId/reactions` | Toggle an allowed reaction |

### AI DJ

| Method | Endpoint                       | Description              |
|--------|--------------------------------|--------------------------|
| GET    | `/api/aidj/:loungeId/compatible` | Check queue compatibility |
| POST   | `/api/aidj/:loungeId/segue`      | Get AI segue decision    |
| POST   | `/api/aidj/:loungeId/segue/apply`| Recheck and apply a segue | Host/Co-DJ |
| POST   | `/api/aidj/:loungeId/ask`        | Ask AI DJ a question     |
| POST   | `/api/aidj/tracks/:trackId/ask`  | Ask a question about a catalog track |

### Analytics & Recommendations

| Method | Endpoint                      | Description              |
|--------|-------------------------------|--------------------------|
| GET    | `/api/analytics/user/dashboard` | User dashboard data    |
| GET    | `/api/analytics/:loungeId`      | Session analytics       |
| GET    | `/api/recommendations`          | Personalized tracks     |
| GET    | `/api/recommendations/taste-profile` | Acoustic taste profile |
| GET    | `/api/recommendations/interactions` | Saved and recent tracks |
| POST   | `/api/recommendations/interaction` | Record listening event |

---

## 🔌 Socket.io Events

Connect with JWT auth:
```javascript
const socket = io('http://localhost:5000', {
  auth: { token: 'Bearer <your_jwt_token>' }
});
```

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `lounge:join` | `{ loungeId }` | Join a lounge room and receive a state sync |
| `lounge:leave` | `{ loungeId }` | Leave a lounge room |
| `lounge:playback:control` | `{ loungeId, action, positionSeconds }` | Host playback actions (`play`, `pause`, `position`) |
| `lounge:typing` | `{ loungeId, isTyping }` | Typing indicator |
| `lounge:ping` | `{ loungeId, clientSentAt }` | Latency check |

### Server → Client Events

| Event                    | Description                      |
|--------------------------|----------------------------------|
| `lounge:sync`            | Full lounge state (on join)      |
| `lounge:queue:update`    | Queue reordered or track added   |
| `lounge:nowplaying:update` | Now Playing changed            |
| `lounge:playback:update` | Host-controlled playback state and current position; listeners follow it |
| `lounge:status:update`   | Lounge status changed            |
| `lounge:presence:update` | Live connected participant list/count after joins, leaves, or disconnects |
| `lounge:chat:message`    | New chat message                 |
| `lounge:chat:reaction`   | Updated reaction counts          |
| `lounge:sentiment:update`| Updated room sentiment score     |
| `lounge:moderation:update` | Room controls or membership changed |
| `lounge:soundclash:open` | Battle started                   |
| `lounge:soundclash:update` | Candidate list changed         |
| `lounge:soundclash:vote` | Vote counts updated              |
| `lounge:soundclash:resolved` | Battle winner announced      |
| `lounge:ai:dj_announcement` | AI DJ banter message         |
| `lounge:ai:qa`           | AI DJ Q&A answer                 |
| `lounge:ai:segue_suggestion` | Compatible queued-track suggestion |
| `lounge:typing:update`   | Who is typing                    |
| `lounge:pong`            | Latency response                 |
| `error`                  | Rejected socket action, as `{ message }` |

Events use an envelope with `event`, `loungeId`, `payload`, and `ts` where provided.
Playback controls are authorized server-side; only the host can control playback.

The client closes its lounge socket when navigating away from the room; this is
treated as leaving, not as a host disconnect. The host-disconnected warning is
reserved for transport close, transport error, and ping timeout events (such as
closing or refreshing the tab, or losing the network connection).

### Socket.IO payload examples

The client sends these event payloads after authenticating the connection with
`auth.token`:

| Client event | Example payload |
|---|---|
| `lounge:join` | `{"loungeId":"665000000000000000000001"}` |
| `lounge:leave` | `{"loungeId":"665000000000000000000001"}` |
| `lounge:playback:control` | `{"loungeId":"665000000000000000000001","action":"position","positionSeconds":42}` |
| `lounge:typing` | `{"loungeId":"665000000000000000000001","isTyping":true}` |
| `lounge:ping` | `{"loungeId":"665000000000000000000001","clientSentAt":1730000000000}` |

Server event examples show the `payload` object inside the event envelope. IDs
and timestamps are illustrative.

| Server event | Example payload |
|---|---|
| `lounge:sync` | `{"currentTrack":{"_id":"665000000000000000000010"},"queue":[],"sentimentScore":0.2,"participantCount":2}` |
| `lounge:queue:update` | `{"queue":[],"reason":"vote"}` |
| `lounge:nowplaying:update` | `{"currentTrack":{"_id":"665000000000000000000010"},"playback":{"isPlaying":true,"positionSeconds":0},"queue":[],"reason":"manual_advance"}` |
| `lounge:playback:update` | `{"isPlaying":true,"positionSeconds":42,"trackId":"665000000000000000000010"}` |
| `lounge:status:update` | `{"status":"live","endedAt":null}` |
| `lounge:presence:update` | `{"userId":"665000000000000000000020","action":"joined","participants":[],"participantCount":2,"hostDisconnected":false}` |
| `lounge:chat:message` | `{"messageId":"665000000000000000000030","user":{"id":"665000000000000000000020","displayName":"Alex"},"body":"Great mix!","sentimentScore":0.7,"sentimentBucket":"positive"}` |
| `lounge:chat:reaction` | `{"messageId":"665000000000000000000030","userId":"665000000000000000000020","reactions":[{"emoji":"🔥","count":1}]}` |
| `lounge:sentiment:update` | `{"rollingScore":0.35,"label":"positive","windowSeconds":600,"sampleSize":8}` |
| `lounge:moderation:update` | `{"action":"lock","participantId":null,"locked":true,"hostId":"665000000000000000000020","coDjIds":[],"participants":[],"participantCount":2}` |
| `lounge:soundclash:open` | `{"battleId":"665000000000000000000001","candidates":[],"closesAt":"2026-11-02T18:00:00.000Z","durationSeconds":60}` |
| `lounge:soundclash:update` | `{"active":false,"candidates":[]}` |
| `lounge:soundclash:vote` | `{"voteCounts":[{"trackId":"665000000000000000000010","votes":2}]}` |
| `lounge:soundclash:resolved` | `{"winningTrackId":"665000000000000000000010","winningTrack":{"_id":"665000000000000000000010"},"totalVotes":4,"announcement":"The crowd chose this track!","newQueue":[]}` |
| `lounge:ai:dj_announcement` | `{"text":"A smooth harmonic transition is coming up.","relatedTrackId":"665000000000000000000011","fromTrackId":"665000000000000000000010","matchReason":"Compatible tempo and Camelot key."}` |
| `lounge:ai:qa` | `{"question":"What is the mood?","answer":"The track is marked as reflective.","sources":[{"type":"mood","text":"Reflective"}],"track":{"id":"665000000000000000000010","title":"Sample track","artist":"Sample artist"}}` |
| `lounge:ai:segue_suggestion` | `{"selectedTrack":{"_id":"665000000000000000000011"},"matchReason":"Compatible tempo and Camelot key.","message":"","fromTrackId":"665000000000000000000010"}` |
| `lounge:typing:update` | `{"typingUsers":["Alex"]}` |
| `lounge:pong` | `{"clientSentAt":1730000000000,"serverReceivedAt":1730000000001}` |
| `error` | `{"message":"Only the Host can control room playback."}` |

### REST request/response examples

Send JSON with `Content-Type: application/json` unless marked multipart. Use
`Authorization: Bearer <access-token>` for authenticated routes; refresh and
logout use the HttpOnly `ai_dj_refresh` cookie. Response snippets show the
stable response envelope and representative fields; database-generated IDs,
timestamps, populated records, and token values are illustrative.

Health endpoints are public and do not require a bearer token:

| Endpoint | Example response |
|---|---|
| `GET /health` | `{"status":"ok","database":"connected","api":"available","realtime":"available"}` |
| `GET /health/queue-gateway` | `{"status":"ok","database":"connected","queueGateway":"available","connectedSockets":3}` |

#### Authentication

| Endpoint | Example request | Example response |
|---|---|---|
| `POST /api/auth/register` | `{"displayName":"Alex","email":"alex@example.test","password":"example-password"}` | `{"success":true,"token":"<access-token>","expiresIn":3600,"user":{"id":"<userId>","role":"listener"}}` |
| `POST /api/auth/login` | `{"email":"alex@example.test","password":"example-password"}` | `{"success":true,"token":"<access-token>","expiresIn":3600,"user":{"id":"<userId>","role":"listener"}}` |
| `POST /api/auth/refresh` | Cookie: `ai_dj_refresh=<refresh-token>`; no JSON body | `{"success":true,"token":"<new-access-token>","expiresIn":3600,"user":{"id":"<userId>","role":"listener"}}` |
| `POST /api/auth/logout` | Cookie: `ai_dj_refresh=<refresh-token>`; no JSON body | `{"success":true,"message":"Logged out."}` |
| `GET /api/auth/me` | No body | `{"success":true,"user":{"id":"<userId>","displayName":"Alex","email":"alex@example.test","role":"listener","preferences":{}}}` |
| `PUT /api/auth/me` | `{"displayName":"Alex DJ","preferences":{"genres":["indie"]}}` | `{"success":true,"message":"Profile updated!","user":{"id":"<userId>","displayName":"Alex DJ","role":"listener"}}` |

#### Tracks

| Endpoint | Example request | Example response |
|---|---|---|
| `GET /api/tracks?search=sample&minBpm=80&maxBpm=130` | No body | `{"success":true,"count":1,"tracks":[{"_id":"<trackId>","title":"Sample track","acoustic":{"bpm":100,"camelotKey":"8A","energy":0.6,"valence":0.5}}]}` |
| `GET /api/tracks/<trackId>` | No body | `{"success":true,"track":{"_id":"<trackId>","title":"Sample track","artist":"Sample artist","acoustic":{"bpm":100,"camelotKey":"8A","energy":0.6,"valence":0.5}}}` |
| `POST /api/tracks` (multipart) | `trackData` contains `{"title":"Sample track","artist":"Sample artist","durationSeconds":180,"acoustic":{"bpm":100,"camelotKey":"8A","energy":0.6,"valence":0.5},"timeline":[]}` plus required `audio` file; optional `cover` | `{"success":true,"message":"Track uploaded successfully!","track":{"_id":"<trackId>","title":"Sample track"}}` |
| `PUT /api/tracks/<trackId>` | JSON `{"title":"Updated title","acoustic":{"bpm":101,"camelotKey":"8A","energy":0.62,"valence":0.52}}`; multipart may include `trackData`, `audio`, and `cover` | `{"success":true,"message":"Track updated!","track":{"_id":"<trackId>","title":"Updated title"}}` |
| `DELETE /api/tracks/<trackId>` | No body | `{"success":true,"message":"Track deleted."}` |

#### Lounges

| Endpoint | Example request | Example response |
|---|---|---|
| `GET /api/lounges` | No body | `{"success":true,"count":1,"lounges":[{"_id":"<loungeId>","name":"Friday mix","status":"live"}]}` |
| `GET /api/lounges/my` | No body | `{"success":true,"count":1,"lounges":[{"_id":"<loungeId>","name":"Friday mix"}]}` |
| `GET /api/lounges/<loungeId>` | No body | `{"success":true,"lounge":{"_id":"<loungeId>","name":"Friday mix","participantCount":2,"queue":[]}}` |
| `POST /api/lounges` | `{"name":"Friday mix","seedTrackId":"<trackId>","vibeProfile":"Mixed","maxParticipants":50,"bpmTolerancePct":8,"aiOutroWindowSeconds":5,"soundclashEnabled":true,"aiVerbosity":"normal"}` | `{"success":true,"message":"DJ Lounge created!","lounge":{"id":"<loungeId>","name":"Friday mix","inviteCode":"<code>","status":"live"}}` |
| `POST /api/lounges/join` | `{"inviteCode":"A3F7B2C1"}` | `{"success":true,"message":"Joined lounge \"Friday mix\"!","lounge":{"id":"<loungeId>","name":"Friday mix","participantCount":2}}` |
| `PUT /api/lounges/<loungeId>/status` | `{"status":"live"}` | `{"success":true,"message":"Lounge status updated to \"live\".","lounge":{"_id":"<loungeId>","status":"live"}}` |
| `POST /api/lounges/<loungeId>/leave` | No body | `{"success":true,"message":"You left the lounge."}` |
| `PUT /api/lounges/<loungeId>/moderation` | `{"action":"lock","locked":true}`; other actions: `mute`/`remove`/`transfer`/`set-co-dj` with `participantId` and relevant `muted`/`enabled` field | `{"success":true,"moderation":{"action":"lock","locked":true,"participantCount":2}}` |

#### Queue and Soundclash

| Endpoint | Example request | Example response |
|---|---|---|
| `GET /api/queue/<loungeId>` | No body | `{"success":true,"currentTrack":{"_id":"<trackId>"},"playback":{"isPlaying":true,"positionSeconds":42},"queue":[],"recentTracks":[],"sentiment":0.2}` |
| `POST /api/queue/<loungeId>/add` | `{"trackId":"<trackId>"}` | `{"success":true,"message":"\"Sample track\" added to queue!","queue":[]}` |
| `POST /api/queue/<loungeId>/vote` | `{"queueEntryId":"<queueEntryId>"}` | `{"success":true,"message":"Vote counted!","queue":[]}` |
| `DELETE /api/queue/<loungeId>/<queueEntryId>` | No body | `{"success":true,"message":"Track removed from queue.","queue":[]}` |
| `POST /api/queue/<loungeId>/next` | No body | `{"success":true,"message":"Advanced to next track!","currentTrack":{"_id":"<trackId>"},"remainingQueue":[]}` |
| `GET /api/soundclash/<loungeId>` | No body | `{"success":true,"soundclash":{"active":false,"candidates":[],"hasVoted":false,"winnerId":null}}` |
| `POST /api/soundclash/<loungeId>/submit` | `{"trackId":"<trackId>"}` | `{"success":true,"message":"\"Sample track\" submitted to Soundclash!","candidates":[]}` |
| `DELETE /api/soundclash/<loungeId>/candidates/<trackId>` | No body | `{"success":true,"candidates":[]}` |
| `POST /api/soundclash/<loungeId>/open` | `{"durationSeconds":60}` | `{"success":true,"soundclash":{"active":true,"candidates":[],"closesAt":"<timestamp>","winnerId":null}}` |
| `POST /api/soundclash/<loungeId>/vote` | `{"candidateTrackId":"<trackId>"}` | `{"success":true,"message":"Vote counted!","voteCounts":[{"trackId":"<trackId>","votes":1}]}` |
| `POST /api/soundclash/<loungeId>/resolve` | No body; voting must have closed | `{"success":true,"message":"Battle resolved!","winner":{"track":"<trackId>"},"announcement":"<text>"}` |

#### Chat and AI DJ

| Endpoint | Example request | Example response |
|---|---|---|
| `GET /api/chat/<loungeId>?limit=50` | No body | `{"success":true,"count":1,"messages":[{"body":"Great mix!","sentimentScore":0.7}]}` |
| `POST /api/chat/<loungeId>` | `{"body":"Great mix!"}` | `{"success":true,"message":{"body":"Great mix!","sentimentScore":0.7},"roomSentiment":{"score":0.2,"label":"positive"}}` |
| `POST /api/chat/<loungeId>/<messageId>/reactions` | `{"emoji":"🔥"}` | `{"success":true,"messageId":"<messageId>","reactions":[{"emoji":"🔥","count":1,"reactedByMe":true}]}` |
| `GET /api/aidj/<loungeId>/compatible` | No body | `{"success":true,"currentTrack":{"bpm":100,"camelotKey":"8A"},"queueCompatibility":[{"track":{"id":"<trackId>","bpm":102,"camelotKey":"8A"},"compatible":true,"reason":"<reason>"}]}` |
| `POST /api/aidj/<loungeId>/segue` | No body | `{"success":true,"selectedTrack":{"_id":"<trackId>"},"matchReason":{"description":"<reason>","bpmCurrent":100,"bpmNext":102,"keyCurrent":"8A","keyNext":"8A"},"transitionScript":"<text>","sources":[],"sentimentInfluence":0.2}` |
| `POST /api/aidj/<loungeId>/segue/apply` | `{"trackId":"<trackId>"}` | `{"success":true,"currentTrack":{"_id":"<trackId>"},"remainingQueue":[],"matchReason":"<reason>"}` |
| `POST /api/aidj/<loungeId>/ask` | `{"question":"What is the mood?","trackId":"<optional-recent-trackId>"}` | `{"success":true,"question":"What is the mood?","answer":"<grounded answer>","sources":[],"track":{"id":"<trackId>","title":"Sample track","artist":"Sample artist"}}` |
| `POST /api/aidj/tracks/<trackId>/ask` | `{"question":"What is the mood?"}` | `{"success":true,"question":"What is the mood?","answer":"<grounded answer>","sources":[],"track":{"id":"<trackId>","title":"Sample track","artist":"Sample artist"}}` |

#### Analytics and recommendations

| Endpoint | Example request | Example response |
|---|---|---|
| `GET /api/analytics/user/dashboard` | No body | `{"success":true,"dashboard":{"activeLounges":[],"hostedLounges":[],"attendedLounges":[],"stats":{"totalHosted":0,"totalAttended":0}}}` |
| `GET /api/analytics/<loungeId>` | No body | `{"success":true,"analytics":{"session":{"durationMinutes":12,"peakParticipants":2,"tracksPlayed":3,"totalEvents":9},"sentiment":{"current":0.2,"timeline":[]}}}` |
| `GET /api/recommendations?limit=5` | No body | `{"success":true,"count":1,"recommendations":[{"_id":"<trackId>","title":"Sample track"}]}` |
| `GET /api/recommendations/taste-profile` | No body | `{"success":true,"tasteProfile":{"totalTracksListened":3,"avgBpm":100,"avgEnergy":0.6,"avgValence":0.5}}` |
| `GET /api/recommendations/interactions` | No body | `{"success":true,"savedTrackIds":["<trackId>"],"recentTracks":[]}` |
| `POST /api/recommendations/interaction` | `{"trackId":"<trackId>","playedSeconds":120,"completed":false,"liked":true,"loungeId":"<loungeId>","coListenedWith":["<userId>"]}` | `{"success":true,"message":"Interaction recorded!","interaction":{"track":"<trackId>","playedSeconds":120,"liked":true}}` |

---

## 🎵 Acoustic Compatibility Rules

The AI DJ follows **hard rules** for track selection:

1. **BPM Tolerance**: Candidate BPM must be within ±8% of the current BPM, or its half-time/double-time equivalent
2. **Camelot Key Wheel**: Candidate key must be:
   - Same key (e.g., 8A → 8A)
   - Adjacent number on same letter (e.g., 8A → 7A or 9A)
   - Same number, opposite letter (e.g., 8A → 8B)

**Example compatibility rules:**
```
8A → 9A   ✓ adjacent Camelot key
8A → 8B   ✓ relative Camelot key
120 BPM → 126 BPM   ✓ within 8% tempo tolerance
120 BPM → 90 BPM    ✗ outside tempo tolerance
```

Segue selection runs when the host/co-DJ playback enters the lounge's configured
outro window (5 seconds by default; configurable from 5–30 seconds when creating
the lounge). Compatible candidates are ranked by harmonic closeness, sentiment-
matched energy, and recent-play history. The selected track and metadata-grounded
transition line are broadcast to the room. If the selected track is still queued
when the current track ends, it is applied automatically; otherwise playback falls
back to the regular queue. Stale suggestions and announcements are cleared on track
change.
Listeners can ask about the current track or one of the ten most recently played
tracks.

Battle expiry is resolved by a server-side scheduler, so resolution does not
depend on a host browser timer. The winner is placed ahead of the normal
vote-ranked queue. Queue and battle votes are applied atomically and reject
repeat votes. Voter IDs are not included in queue or Soundclash API and
Socket.IO payloads.

## Data model overview

- `User` owns profile data and the global `listener`, `host`, or `admin` role.
- `Track` stores acoustic values and a timestamped metadata timeline.
- `Lounge` references its host, participants, Co-DJs, current track, queue,
  Soundclash candidates, moderation state, and session timestamps.
- `QueueEvent` records activity used for session analytics.
- `ChatMessage` stores room messages and reactions.
- `Interaction` stores listening feedback used by recommendations.

The active queue and Soundclash state are embedded in the lounge document;
user and track references point to their corresponding collections.

## Health checks and structured operation logs

- `GET /health` reports API, database, and realtime readiness.
- `GET /health/queue-gateway` reports database/gateway readiness and the connected
  Socket.IO client count. It returns HTTP 503 when the database or gateway is unavailable.
- Completed queue mutations, Soundclash operations, and AI DJ routes emit structured
  JSON request-completion logs with request ID, lounge session correlation ID, user/lounge
  IDs, method/path, status, and duration. Soundclash resolution also emits a queue mutation
  log, including when resolved by the scheduler. Request bodies, chat text, tokens, and AI
  prompts/answers are not logged.
- New lounge documents receive a persistent correlation ID. Lounge REST responses include
  it as the `X-Correlation-ID` response header.

Example:

```json
{"event":"queue.mutation.completed","category":"queue_mutation","queueMutation":true,"requestId":"<request-id>","correlationId":"<lounge-session-id>","loungeId":"<lounge-id>","userId":"<user-id>","method":"POST","path":"/api/queue/<lounge-id>/vote","statusCode":200,"durationMs":12}
```

`GET /health/queue-gateway` response:

```json
{"status":"ok","database":"connected","queueGateway":"available","connectedSockets":3}
```

## Verification and known limits

Run the deterministic unit/acceptance tests with:

```bash
npm test
```

The suite covers acoustic compatibility (including 20 simulated decisions),
segue ranking, sentiment shifts and a 20-message labeled smoke set, Q&A source
citation/abstention, queue ordering/removal, Soundclash winner selection,
lounge access policy, host presence, seed validation, and the configured AI
segue outro window. It also includes an HTTP track-upload test and a Mongo-backed
concurrent Soundclash scheduler test, request-logging/health-handler tests, and a
synthetic Precision@5 evaluation.
The Mongo-backed concurrent battle-resolution test runs when
`PRD_TEST_MONGO_URI` is set; it creates and drops a process-specific test
database:

```powershell
$env:PRD_TEST_MONGO_URI = "mongodb://127.0.0.1:27017/aidj_test"
npm test
```

A production build is run separately from `client` with `npm run build`.
Performance targets have not been benchmarked, and the project does not yet
include a persistent automated HTTP integration suite or full multi-client
test report. Use a disposable MongoDB database for manual API verification.

Reproduce the synthetic recommendation metric with:

```powershell
npm run evaluate:recommendations
```

The generated holdout meets Precision@5 0.60 but is not a real-listener evaluation;
see `..\docs\RECOMMENDATION_EVALUATION.md` for methodology and limitations.

Admins can upload an audio file (AAC, M4A, MP3, OGG, WAV, or WebM) and a cover
image (JPEG, PNG, GIF, or WebP) when creating or editing a track. The backend
stores these files under `server/uploads/tracks` (ignored by Git) and serves
them from `/uploads/tracks/...`; track records reference those URLs for playback
and artwork across the app. Each file is limited to 50 MB. New tracks require
audio; cover art is optional. Keep the upload directory on persistent storage
when deploying, or configure an external object-storage service for
multi-instance/ephemeral deployments. The backend does not provide licensed
audio assets or an audio-analysis pipeline. The AI DJ uses deterministic rules
and track metadata rather than an external generative AI service.

---

## 👥 User Roles (RBAC)

| Role      | Permissions                                               |
|-----------|-----------------------------------------------------------|
| `listener`| Join lounges, chat, vote, ask AI DJ, submit Soundclash candidates |
| `host`    | Listener permissions + create lounges and manage the hosted lounge |
| Lounge Co-DJ | Host/Co-DJ controls for the lounge where they were assigned |
| `admin`   | All lounge controls + manage the track catalog             |

Co-DJ is a per-lounge assignment stored in `Lounge.coDjs`; it is not a global
user role. Admins can control any lounge and administer the track catalog.

# AI DJ Studio

AI DJ Studio is a Track A (full-stack) collaborative listening-room prototype. It uses
React/Vite, Express, MongoDB/Mongoose, and Socket.IO. A host creates a lounge; listeners
join, chat, vote, and submit Soundclash tracks. The AI DJ selects compatible tracks from
the lounge queue and explains its choices using track metadata.

## Requirements

- Node.js 18 or newer
- MongoDB 6 or newer, available locally or through a MongoDB URI
- PowerShell on Windows (commands below use PowerShell syntax)

## First-time setup

1. Configure the backend:

   ```powershell
   Set-Location .\server
   Copy-Item .env.example .env
   ```

   Set `MONGO_URI`, a long random `JWT_SECRET`, `CLIENT_URL`, and `PORT` in `server\.env`.
   Never use the example JWT secret outside local development.

2. Install backend dependencies and seed the configured development database:

   ```powershell
   npm install
   node .\seed.js
   ```

   Seeding refreshes the five original synthetic demo tracks and creates missing
   development accounts. The in-repository generator creates the WAV audio and PNG
   covers; the acoustic profiles are manually authored demo values, not verified
   measurements. See [asset source and profile notes](./docs/AUDIO_ASSET_SOURCES.md).
   The seed script migrates the five known legacy seed tracks and removes their known
   bundled upload copies; unrelated database records are preserved.

   To regenerate the original demo files:

   ```powershell
   npm run assets:generate
   ```

3. Configure and install the client in another PowerShell terminal:

   ```powershell
   Set-Location .\client
   Copy-Item .env.example .env
   npm install
   ```

   Set `VITE_API_URL=http://localhost:5000/api` in `client\.env` for local development.

## Run

Start the backend in one terminal:

```powershell
Set-Location .\server
npm run dev
```

Start the client in another:

```powershell
Set-Location .\client
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). Development-only seed accounts
and complete environment guidance are documented in [server/README.md](./server/README.md).

## Verify

```powershell
Set-Location .\server
npm test

Set-Location ..\client
npm run build
```

The Mongo-backed concurrent Soundclash scheduler test uses an isolated database and is
skipped unless `PRD_TEST_MONGO_URI` is set. See the backend README for the safe test
command. The API health endpoint is `GET http://localhost:5000/health`.

## Documentation

- [Backend setup, endpoint tables, and Socket.IO events](./server/README.md)
- [Architecture and data model](./docs/ARCHITECTURE.md)
- [Project retrospective](./docs/RETROSPECTIVE.md)
- [Final submission checklist and evidence](./docs/SUBMISSION_CHECKLIST.md)
- [Recommendation Precision@5 evaluation](./docs/RECOMMENDATION_EVALUATION.md)

## Known scope

- AI DJ segue candidates come from the lounge queue, not the entire catalog.
- Segues use deterministic BPM/Camelot rules; transition banter is a metadata-grounded
  template, not an external LLM. No waveform processing or audio crossfade is implemented.
- Two seeded tracks have a clearly labeled `demoOnly` acoustic profile for exercising a
  valid segue. These are not verified analysis values.
- Performance targets and end-to-end demo evidence must be measured and recorded on the
  submission machine; passing unit tests/builds alone does not establish those targets.

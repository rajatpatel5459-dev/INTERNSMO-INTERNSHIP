# AI DJ Engine — Client

Responsive React + Vite frontend for the AI DJ Engine.

## Run locally

1. Start MongoDB and the Express backend. The backend setup and database seed instructions are in [`../server/README.md`](../server/README.md).
2. Create the client environment file and configure the API URL:

   ```powershell
   Copy-Item .env.example .env
   ```

   ```env
   VITE_API_URL=http://localhost:5000/api
   ```

3. Install dependencies and run Vite:

   ```powershell
   npm install
   npm run dev
   ```

The client has no mock-data mode. Authentication, tracks, lounges, recommendations, library interactions, and analytics are loaded from the backend. Create an account through the app or use the test accounts listed in the backend README after seeding the database.

Access tokens are kept in memory and refreshed through the backend's HttpOnly cookie. The API must allow credentialed requests from the Vite origin (`CLIENT_URL=http://localhost:5173` by default).

Track playback uses the `audioAssetUrl` saved on each track. Admins can upload audio and cover images on the Admin acoustic data page; uploaded files are stored by the backend and reused by track playback and artwork throughout the app. New tracks require audio; cover art is optional. Seeded tracks without audio remain metadata-only.

Admin track metadata timelines are entered event by event. Each event needs a timestamp in whole seconds from the track start, a type (`sample_credit`, `trivia`, or `glossary`), and a verified note. Timestamps cannot exceed the track duration.

## Screen map

```text
Landing
├── Login / Register
└── App shell
    ├── Home ── Backend recommendations / listening history
    ├── Search / Discover ── Track details / backend Q&A
    ├── Library
    ├── DJ Lounges
    │   ├── Create lounge ── Invite link ── DJ room
    │   ├── Join by code ── DJ room
    │   └── DJ room ── Queue / Chat / AI DJ / Soundclash
    ├── Analytics
    ├── Profile
    ├── Settings
    └── Admin ── Acoustic data management
```

## Source structure

```text
src/
├── components/     Shared app shell and UI components
├── context/        Authentication and backend data state
├── pages/          Public, discovery, lounge, analytics, profile, and admin screens
├── api.js          REST client for the backend
├── App.jsx         React Router routes
├── main.jsx        Vite entry point
└── styles.css      Shared design system and responsive layouts
```

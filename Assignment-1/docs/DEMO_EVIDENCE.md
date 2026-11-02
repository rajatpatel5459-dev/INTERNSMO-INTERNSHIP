# End-to-End Demo Evidence

**Status: partial capture.** These are real screenshots from a local run on
November 3, 2026 (IST), using a temporary MongoDB database and synthetic demo
tracks. The screenshots are static browser captures, not a continuous recording.
No login email, password, or access token is shown.

## 1. Two-client lounge and live queue

- **Lounge:** Live Demo Lounge; Host and Listener connected from separate browser
  origins and saw the same room.
- **Screenshots:** [Host view](../evidence/demo-01-two-client-host.png) ·
  [Listener view](../evidence/demo-01-two-client-listener.png)
- **Observed state:** Both clients showed Live Synced and two listeners.
- **Queue screenshots:** [Host queue](../evidence/demo-02-queue-votes-synced-host.png) ·
  [Listener queue](../evidence/demo-02-queue-votes-synced-listener.png)
- **Observed result:** Both participants voted for Demo Track 04. It moved ahead of
  Demo Track 03 and appeared with two votes on both clients.
- **Capture times:** 01:01–01:06 IST.

## 2. AI DJ segue

- **Screenshot:** [Segue and compatibility details](../evidence/demo-03-ai-dj-segue.png)
- **Observed pair:** Demo Track 04 (108 BPM, 10B) → Demo Track 03 (108 BPM, 9B).
- **Displayed rule result:** 0 BPM difference; adjacent Camelot keys; compatible.
- **Transition text:** The UI displayed a metadata-grounded transition naming the
  current and next tracks and quoting the synthetic track note.
- **Important limitation:** These acoustic profiles are manually authored demo
  values, not measurements. The transition is deterministic/template-based, not a
  hosted LLM response.
- **Capture time:** 01:14 IST.

## 3. Metadata-grounded Q&A

- **Screenshot:** [Q&A response and source](../evidence/demo-04-grounded-qa.png)
- **Prompt:** “Are the BPM and key manually authored?”
- **Observed answer:** The response says the BPM, Camelot key, energy, and valence
  are manually authored demo values, not measurements, and cites the matching
  track note as its source.
- **Capture time:** 01:17 IST.

## 4. Sentiment display — diagnostic evidence only

- **Screenshots:** [After positive chat](../evidence/demo-05-sentiment-positive.png) ·
  [After negative chat](../evidence/demo-05-sentiment-negative.png)
- **Messages:** “I love this track!”, “Great transition!”, followed by “This
  transition is bad.” and “Not enjoying this.”
- **Observed display:** The sentiment label changed from “Feeling good 100%” to
  “Low-key 18%”.
- **Known discrepancy:** The category breakdown continued to show the messages as
  neutral while the displayed sentiment label changed. These screenshots do not
  validate sentiment accuracy; fix and retest that inconsistency before claiming
  this scenario complete.
- **Capture times:** 01:18–01:19 IST.

## 5. Soundclash — pending

- No browser screenshot of a complete two-participant Soundclash (submissions,
  votes, resolution, and winner entering the queue) was captured. This end-to-end
  scenario remains pending.

## 6. Server-side RBAC

See [Four-Role RBAC Evidence](./RBAC_EVIDENCE.md) and its screenshot in
`evidence/RBAC_EVIDENCE_SCREENSHOT.png`. That report documents actual local
HTTP/Socket.IO requests; it is separate from this browser walkthrough.

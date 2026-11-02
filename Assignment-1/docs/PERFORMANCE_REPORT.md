# Performance Evidence

**Status: pending measurement.** No performance measurements are currently recorded.
Run measurements on the submission build and report the environment, workload, sample
count, measurement method, and actual results. Do not fill results with estimates.

| Metric | PRD target | Measured result | Workload / method |
|---|---:|---|---|
| Non-AI API latency (P95) | < 200 ms | Not measured | Record endpoint mix, sample count, percentiles, and machine/database setup. |
| Queue state sync drift | < 100 ms under normal network conditions | Not measured | Record mutation-to-identical-state delay across connected clients; include concurrent votes. |
| AI DJ transition generation latency | < 3 seconds (P95) | Not measured | Measure from outro-window trigger to rendered transition/segue decision; report sample count and P95. |
| WebSocket message fan-out | < 500 ms to last client for rooms up to design capacity | Not measured | Measure server receipt to delivery at the final client; record actual client count. |
| Room capacity | Design target: 50 concurrent participants per room | Not measured | If testing fewer clients, state the actual count and do not claim validation at 50. |

## Test environment

- Submission build/commit:
- Machine and operating system:
- Node.js and MongoDB versions:
- Network conditions:
- Client count:
- Run duration / sample count:
- Measurement tools and procedure:

Include raw, sanitized output or an attached report so the values can be reproduced.

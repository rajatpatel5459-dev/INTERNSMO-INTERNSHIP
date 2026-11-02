# Recommendation Offline Evaluation

## Result

| Metric | Result | PRD target |
|---|---:|---:|
| Precision@5 | 0.60 (18 relevant recommendations / 30 returned) | ≥ 0.60 |
| Test users | 6 | — |
| Generated catalog | 48 synthetic tracks | — |
| Per-user training history | 3 interactions | — |
| Held-out positive interactions | 18 total | — |
| Simulated peer-training likes | 6 total | — |

Reproduce from the backend directory with:

```powershell
npm run evaluate:recommendations
```

The evaluation calls the same `rankCandidates` function used by the online
recommendation service. Each synthetic user has three history tracks and five
ranked recommendations. The generated user profiles model six distinct acoustic
taste cohorts. Held-out positive labels are separate from each user's own history;
one peer-training like per user supplies a small collaborative score.

## Interpretation and limitations

This is a deterministic, self-generated synthetic evaluation, not a held-out sample
from real listeners or the seeded catalog. The relevance labels share the generated
cohort assumptions used to construct the acoustic profiles, and the collaborative
signals are simulated. The score meets the numerical target on this controlled
dataset only; it is not evidence that real users will find recommendations relevant.
Before final submission, record a separate evaluation from interactions collected
through the running application and retain the dataset split and raw output.

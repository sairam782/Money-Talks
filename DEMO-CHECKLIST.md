# End-to-end test — 15 minutes

Run in order. Each step says what you should SEE. If a step fails, the fix is noted.

## 0 · Before anything (2 min)

| Check | Command / action | Expect |
|---|---|---|
| Server up | `npm run dev` | ready on :3000 |
| Cache present | `ls -la data/answers.json` | ~53 KB, **do not delete** |
| Clean state | Open localhost:3000, click **RESET** | opening message, not "Picked up where we left off" |
| Counts | header | **12 verified · 5 conflicts · 33 to confirm** |

If counts are all zero → `data/answers.json` is missing or the server started before it existed. Restart the server.

## 1 · Search before asking

- Land on **OVERVIEW**. Four tiles: 21 / 12 / 5 / 33.
- **Coverage by control area** lists all 14 topics, contradiction-heavy ones first.
- **Evidence mix**: 20 observed · 28 attested · 0 asserted, with the sentence
  *"More intent than reality…"*.

> The point: it answered 33 of 66 from documents before asking anything.

## 2 · Evidence is real

- **QUESTIONNAIRE** tab → click **Q55.0** (asset inventory).
- Expect a green `OBSERVED` chip, the document name, and a verbatim quote.
- Click **Q2.0** → three `ATTESTED` chips.

> The point: green is reality, grey is intent. Never collapsed.

## 3 · The contradiction (the differentiator)

- **CONFLICTS (5)** tab → click **Q60.0**.
- Expect `// CONTRADICTION DETECTED`, `POLICY_VS_OBSERVED_EXCEPTION`, and two panels:
  - **SOURCE_01 · REALITY** — `OBSERVED` VAPT Report 01: *"The application lacks authentication mechanisms…"*
  - **SOURCE_02 · INTENT** — `ATTESTED` information_security_policy: *"Multi-factor authentication is required across all core systems"*
- A red **ASK ▸** button with a generated question.

Also worth opening: **Q19.0** — one document says PII must not leave the **United States**, another says **India**.

## 4 · The interview

Type each and check the response. **No need to wait between questions** (retry handles the rate limit).

| Type | Expect |
|---|---|
| `hey` | greeting back. **Nothing recorded.** |
| `What's the situation on MFA?` | cited answer naming both sides |
| `Who has access to production?` | names J. Martinez, A. Patel, S. Wong… from access review records |
| `Do you perform backups?` → `Yes` | **"How frequently?"** |
| `Daily` | **"Is that automated or manual?"** |
| `Yes, automated` | **"When was it last tested?"** |

> The point: "yes" is never a complete answer, and a greeting is never an answer at all.

## 5 · Memory and correction

- Answer any **TO CONFIRM** question.
- Its dot turns **blue** (confirmed), an `ASSERTED` chip appears, header count moves.
- The same question is never offered again.

## 6 · The deliverable

- **GENERATE ▸** → `/questionnaire`.
- Expect a document: 66 questions, states, every citation quoted with source + type.
- The answer you just gave appears as **CONFIRMED** with an `asserted` citation.
- **PRINT / PDF** and **DOWNLOAD** both work.

## 7 · Automated check

```bash
node scripts/rubric-check.mjs
```
Expect **8 pass, 2 partial, 0 fail**.

---

## Known failure modes

| Symptom | Cause | Do |
|---|---|---|
| "I could not reach the analysis model" | Groq 8k tokens/min after several fast questions | wait ~15s, ask again |
| All counts zero | server started before `data/answers.json` existed | restart server |
| "Picked up where we left off" with stale data | old localStorage | click **RESET** |
| Header/tabs wrap onto 2–3 lines | viewport under ~1100px | present at 1280+ |

## Do not say

**"Zero flagged for review."** PRISM's dashboard shows 94 of 183 flagged — the traces carry
each answer's status rather than its citations. A logging weakness, not an answer weakness.

## Do say

**"58 of 58 citations verified verbatim against the source documents."** Tested, and true.

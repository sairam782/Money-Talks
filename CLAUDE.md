# AI Security Analyst — Regodit

Next.js App Router, **JavaScript not TypeScript**, Tailwind. No database, no vector
store, no auth. See `ARCHITECTURE.md` for the design and `PLAN.md` for the build order.

## Hard rules

1. **Never guess.** `unknown` is a real answer and stays visible.
2. **No citation, no answer.** Every quote is checked verbatim against the corpus by
   `keepOnlyRealEvidence` in `lib/corpus.js`. If a quote is not found, the evidence is
   dropped and the answer downgrades. Do not weaken this check.
3. **Never mutate on correction.** Append to `history`, keep the old value.
4. **The server holds no state.** The client posts the profile up and gets it back.
5. Retrieval is keyword-based over paragraphs (`lib/retrieve.js`). Groq's free tier is
   8000 tokens/minute, so the corpus cannot go in context whole.

## PRISM tracing (do not remove)

This project sends traces to PRISM. Env vars: `PRISMTRACE_API_KEY`,
`PRISMTRACE_PROJECT_ID`, `PRISMTRACE_HOST`.

Tracing is currently wired at: `lib/prism.js`, `app/api/chat/route.js`,
`scripts/build-answers.mjs`

**Standing rule.** Whenever you add or change an agent, chain, graph, tool,
retriever, or any entry point that calls a model, wire it to PRISM before you
finish. Unwired code is invisible in the dashboard. If you are unsure whether
something is covered, assume it is not and wire it.

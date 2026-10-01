<p align="center">
  <img src="docs/logo.svg" width="76" alt="">
</p>

<h1 align="center">Cite</h1>

<p align="center">
  Ask the TanStack Query docs a question. Every claim in the answer links to the lines it came from.<br>
  <sub>Next.js 16 · React 19 · Postgres + pgvector · local embeddings · Claude · Vitest</sub>
</p>

<br>

The name is the rule: an answer has to cite its sources, or say the docs
don't cover the question. I wanted the parts most "chat with your docs" demos
skip: citations a reader can check in one click, a refusal instead of
improvising, and retrieval quality that is measured, so a pipeline change is a
number going up or down.

The corpus is TanStack Query's React documentation (87 files, 894 passages),
copied at a pinned release with its MIT license.

![An answer with numbered citations; the fifth is open, showing the cited lines highlighted in their file](docs/screenshots/ask-light.jpg)

## Running it

You need Node 24 (`nvm use` reads the `.nvmrc`) and Docker for Postgres 17
with pgvector. Without Docker, any Postgres with the `vector` extension works:
point `DATABASE_URL` at it.

1. Clone and install:

   ```bash
   git clone https://github.com/Brunoskyy/cite.git && cd cite
   nvm use
   npm install
   ```

2. From the repo root, start the database and load the corpus:

   ```bash
   docker compose up -d      # Postgres on localhost:5432
   cp .env.example .env      # DATABASE_URL already matches the compose file
   npm run db:migrate
   npm run ingest            # chunks and embeds the docs, about 45 s the first time
   ```

3. From the repo root, start the app and open http://localhost:3000:

   ```bash
   npm run dev
   ```

The first ingest downloads the embedding model (33 MB) and the first reranked
question downloads the reranker (288 MB), both into `~/.cache/cite-models`.

**No API key is needed.** The eight demo questions on the home page replay
answers I wrote against the exact passages search returns, and any other
question shows the passages Cite would send to the model. For live answers
from Claude Opus 5.5, set `ANTHROPIC_API_KEY` in `.env` and restart `npm run dev`.

Stop the app with Ctrl+C and the database with `docker compose down`;
`docker compose down -v` also deletes its data, after which you rerun step 2.

| Command (repo root) | |
| --- | --- |
| `npm test` | 83 tests, no database or key needed |
| `npm run eval:retrieval -- --mode rerank` | one retrieval run, written to `evals/runs/` |
| `npm run eval:answers` | answer quality over the same questions; needs a key |
| `npm run fixtures` | re-records the demo answers against the current index |

## How retrieval works

1. **Chunking:** Markdown split by heading, long sections cut into overlapping
   windows without splitting a code block. Each passage keeps its file and
   line range, which is what makes a citation clickable.
2. **Two retrievers:** Postgres full-text search with headings weighted above
   body text, and nearest-neighbour search over 384-dimension embeddings with
   an HNSW index.
3. **Fusion:** reciprocal rank fusion scores each passage 1/(60 + rank) in each
   list, so a text rank and a cosine distance never need the same scale.
4. **Reranking:** a cross-encoder (bge-reranker-base) reorders the top twenty;
   the model gets the first six.

The Retrieval page shows all four stages for any question, with each passage's
rank in each list.

![The retrieval inspector: each candidate's rank in keyword search, vector search, after fusion and after reranking](docs/screenshots/inspect-light.jpg)

## How citations work

The model gets six numbered passages inside escaped `<passage>` tags and must
put a number after each claim, or answer with one fixed sentence when the
passages don't cover the question.

As the answer streams, a parser splits it into text and citations. A marker
can arrive cut in half (`[1` then `2]`), so the parser holds back only a tail
that could still become one. It tracks code across chunks, so `data.pages[1]`
stays code. A number that points at no passage is dropped. Citations reach the
Markdown renderer as private-use characters, so a model-written
`[docs](#cite-9)` stays an ordinary link.

## Evals

41 questions in `evals/questions.yaml` name the section that answers them, and
8 more ask about things the docs don't cover. A hit is a passage from the
right file that overlaps the right lines. The committed runs:

| Pipeline        | Recall@1 | Recall@3 | Recall@5  | MRR   | Time per question |
| --------------- | -------- | -------- | --------- | ----- | ----------------- |
| Keyword         | 0.366    | 0.585    | 0.659     | 0.479 | 2 ms              |
| Vector          | 0.488    | 0.683    | 0.732     | 0.587 | 6 ms              |
| Hybrid (RRF)    | 0.537    | 0.756    | 0.805     | 0.645 | 6 ms              |
| Hybrid + rerank | 0.512    | 0.805    | **0.902** | 0.671 | 1,982 ms          |

Fusion beats either retriever alone. Reranking lifts recall at five, the
context the model reads, from 0.805 to 0.902 for about two seconds of CPU, but
recall at one drops, so a "top result only" product would skip it. I have not
committed an `eval:answers` run yet; it needs a key.

![The evals page: a dot plot of recall at five and MRR per pipeline](docs/screenshots/evals-light.jpg)

## Things worth opening

- **`src/lib/citations.ts`:** the streaming citation parser, about seventy
  lines, and the tests that pin its edge cases.
- **`scripts/record-fixtures.ts`:** demo answers cite `{{file:line}}`, and the
  recorder refuses to write if a cited passage was not retrieved. I added it
  after a reranker change pointed one answer at the wrong source.
- **`src/lib/generate.ts`:** the answer call, typed against a narrow slice of
  the SDK so tests drive it with a fake stream.
- **`src/app/api/ask/route.ts`:** newline-delimited JSON, a body limit, a
  per-client rate limit and a semaphore around the CPU-bound retrieval.

## Tests

The 83 tests cover chunking, fusion, the citation parser including hostile
Markdown, prompt escaping, the generator against a fake stream, the fixture
recorder, the eval metrics, the ask route's limits, and the React components.

## Layout

```
corpus/        TanStack Query docs at a pinned commit, with SOURCE.md
db/schema.sql  chunks, tsvector, pgvector, indexes
evals/         questions.yaml and the committed runs
fixtures/      hand-written demo answers
scripts/       migrate, ingest, eval:retrieval, eval:answers, fixtures
src/lib/       chunk, retrieve, rrf, prompt, citations, generate, answer
src/app/       Ask, Retrieval and Evals pages; /api/ask, /api/source
```

## What's missing

- No answer-quality run is committed; the numbers above are retrieval only.
- One corpus: the pipeline is generic, the eval questions are not.
- The rate limit is in-process, and `X-Forwarded-For` is only trusted when
  `TRUST_PROXY` is set.
- Reranking on CPU is the slowest part of every answer.
- No conversation; each question stands alone.

The code is MIT licensed. The corpus keeps its own MIT license, in
`corpus/LICENSE`.

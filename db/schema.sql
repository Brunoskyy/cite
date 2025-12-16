-- One row per passage. The text is searchable two ways: by words through a
-- generated tsvector, and by meaning through a 384-dimension embedding.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS chunks (
  id          bigserial PRIMARY KEY,
  file        text    NOT NULL,
  title       text    NOT NULL,
  headings    text[]  NOT NULL DEFAULT '{}',
  -- The same path as plain text, for the full-text column below (array
  -- functions are not immutable, so a generated column cannot use them).
  heading_path text   NOT NULL DEFAULT '',
  start_line  integer NOT NULL,
  end_line    integer NOT NULL,
  content     text    NOT NULL,
  -- Headings weigh more than body text: a question that names a concept
  -- should land on the section about it.
  tsv         tsvector GENERATED ALWAYS AS (
                setweight(to_tsvector('english', title || ' ' || heading_path), 'A') ||
                setweight(to_tsvector('english', content), 'B')
              ) STORED,
  embedding   vector(384) NOT NULL,
  hash        text    NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS chunks_file_idx ON chunks (file);

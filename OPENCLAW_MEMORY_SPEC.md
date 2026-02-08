# OpenClaw Memory System Research & LowCal Implementation Spec Sheet

## Executive Summary

OpenClaw implements a **file-first, Markdown-driven memory system** with SQLite + vector database for semantic search. Key innovations include two-tier memory (ephemeral/durable), hybrid search (BM25 + vector), and intelligent context compaction. This spec sheet translates those concepts into LowCal-specific requirements.

---

## 1. OpenClaw Memory Architecture Overview

| Component | Description |
|-----------|-------------|
| **Storage Layer** | Plain Markdown files on disk (`MEMORY.md`, `memory/YYYY-MM-DD.md`) |
| **Vector DB** | SQLite with `sqlite-vec` extension for embeddings |
| **Full-text Search** | SQLite FTS5 (BM25) for lexical matching |
| **Embedding Providers** | Local (Gemma 300M), OpenAI (`text-embedding-3-small`), Gemini (`gemini-embedding-001`) |
| **Chunk Size** | ~400 tokens with 80-token overlap, line-aware |

---

## 2. Two-Tier Memory System

### Ephemeral Memory (Daily Logs)
- **Location**: `memory/YYYY-MM-DD.md`
- **Purpose**: Running context for recent work
- **Behavior**: Auto-loads today's and yesterday's logs at session start
- **Lifecycle**: Append-only, automatically compacted

### Durable Memory (Curated Knowledge)
- **Location**: `MEMORY.md`
- **Purpose**: Important decisions, preferences, project conventions, long-term todos
- **Access Control**: Only loaded in private sessions (never group contexts)

---

## 3. Hybrid Search Implementation

OpenClaw combines two retrieval methods:

| Method | Purpose | Weight |
|--------|---------|--------|
| Vector Search | Semantic similarity | 70% |
| BM25 (FTS5) | Lexical matching | 30% |

**Search Results**: Snippets (~700 chars) with file path, line range, relevance score, and text.

---

## 4. Context Window Management

**Compaction Trigger**:
```javascript
currentTokens >= contextWindow - reserveTokensFloor - softThresholdTokens
// Example: 200000 - 20000 - 4000 = 176000 tokens
```

**Memory Flush Behavior**:
- Silent (`NO_REPLY`) if nothing important to save
- One flush per compaction cycle
- System prompt guides what to store

---

## 5. Batch Embedding Optimization

| Feature | Implementation |
|---------|----------------|
| Cache-first | SHA-256 hash deduplication |
| Batch APIs | OpenAI/Gemini (50% cost reduction) |
| Fallback | Auto-switch to sync API after 2 failures |
| Concurrency | Default 4 parallel batch jobs |

---

## 6. LowCal Implementation Spec Sheet

### 6.1 Memory Storage Structure

```
~/.lowcal/
├── memory/
│   ├── MEMORY.md              # Durable knowledge base
│   └── memory/                # Daily logs (YYYY-MM-DD.md)
├── sessions/
│   └── YYYY-MM-DD-<slug>.md  # Conversation transcripts
└── embeddings.db             # SQLite with sqlite-vec
```

### 6.2 Core Memory Tools

| Tool | Purpose |
|------|---------|
| `memory_search` | Semantic + BM25 search across all memory files |
| `memory_get` | Read specific memory file with optional line range |
| `memory_write` | Append to durable/ephemeral memory |
| `memory_compact` | Trigger context compaction and flush |

### 6.3 Configuration Schema

```typescript
interface MemoryConfig {
  contextWindow: number;           // e.g., 200000
  reserveTokensFloor: number;      // e.g., 20000
  softThresholdTokens: number;     // e.g., 4000
  chunkSize: number;               // e.g., 400 tokens
  overlapSize: number;             // e.g., 80 tokens
  searchWeights: {
    vector: number;                // e.g., 0.7
    bm25: number;                  // e.g., 0.3
  };
  embeddingProvider: 'local' | 'openai' | 'gemini';
  embeddingModel?: string;
  batchConcurrency: number;        // e.g., 4
}
```

### 6.4 Embedding Provider Options

| Provider | Model | Dimensions | Cost |
|----------|-------|------------|------|
| Local | `embeddinggemma-300M-Q8_0.gguf` | ~768 | Free, offline |
| OpenAI | `text-embedding-3-small` | 1536 | $/token (batch 50% off) |
| Gemini | `gemini-embedding-001` | 768 | Free tier available |

### 6.5 Indexing Strategy

**Incremental Processing**:
- Debounced sync: 100KB new data OR 50 messages
- Delta-based (only process new content)
- Hash-based deduplication for embeddings

**Markdown Chunking**:
- Target ~400 tokens per chunk
- Preserve line boundaries with line numbers
- 80-token overlap between chunks

### 6.6 Session Isolation

Each conversation type has isolated memory:
- **Main session**: Full memory access
- **Group sessions**: No durable memory (privacy)
- **Background jobs**: Separate session state

---

## 7. Implementation Priority

| Phase | Feature | Complexity |
|-------|---------|------------|
| 1 | Basic Markdown storage (MEMORY.md, daily logs) | Low |
| 2 | SQLite + sqlite-vec setup | Medium |
| 3 | Vector embedding integration (local provider first) | High |
| 4 | Hybrid search (BM25 + vector fusion) | High |
| 5 | Context compaction & memory flush | Medium |
| 6 | Batch embedding optimization | Medium |

---

## 8. Key Differences: LowCal vs OpenClaw

| Aspect | OpenClaw | LowCal Adaptation |
|--------|----------|-------------------|
| Workspace | `~/.openclaw/` | `~/.lowcal/` |
| Session Storage | JSONL format | Markdown transcripts |
| Agent System | Multi-agent gateway | Single CLI REPL |
| Plugin Architecture | Extension workspaces | Tool-based extensions |

---

## 9. References

- [OpenClaw Memory Deep Dive](https://snowan.gitbook.io/study-notes/ai-blogs/openclaw-memory-system-deep-dive)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [SQLite Vector Extension](https://www.sqlite.ai/sqlite-vector)
- [Cognee Integration](https://www.cognee.ai/blog/integrations/what-is-openclaw-ai-and-how-we-give-it-memory-with-cognee)

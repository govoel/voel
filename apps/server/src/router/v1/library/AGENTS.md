# Library Module - Scanning & Identification

## OVERVIEW

Orchestrates audiobook discovery: filesystem scan → metadata extraction → Audible matching → database insertion.

## STRUCTURE

```
library/
├── machine.ts              # XState actor + Effect scan pipeline
├── index.ts                # tRPC router (scan triggers, status)
├── scanning/
│   ├── getLibraryDirents.ts      # Recursive directory traversal
│   ├── prepareAudiobookFile.ts   # Initial file processing
│   ├── extractAudiobookFileMetadata.ts  # ffprobe extraction
│   ├── cleanupAudiobookFile.ts   # Handle file changes
│   ├── deleteAudiobookFile.ts    # Handle deletions
│   └── restoreDeletedBook.ts     # Restore soft-deleted
├── identifying/
│   ├── identifyAudiobook.ts      # Auto-match via Audible
│   ├── forceIdentifyAudiobook.ts # Manual ASIN assignment
│   ├── insertAudiobook.ts        # DB insertion
│   └── gatherAuxiliaryAudiobookData.ts  # Chapters, images
├── audible/
│   ├── getProductByAsin.ts       # Audible product lookup
│   ├── getAuthorByAsin.ts        # Author details
│   ├── getChaptersByAsin.ts      # Chapter markers
│   ├── getBooksBySearch.ts       # Search API
│   └── generateThumbhash.ts      # Image placeholders
├── fsExtended.ts           # Effect-wrapped fs operations
└── hash.ts                 # Content hashing utilities
```

## KEY CONCEPTS

### Scan Pipeline (Effect Streams)

```
getLibraryDirents → Stream of files
  ↓
prepareAudiobookFile → Hash, detect type
  ↓
extractAudiobookFileMetadata → ffprobe (batched)
  ↓
identifyAudiobook → Audible search/match
  ↓
insertAudiobook → DB write + SourceTap events
```

### XState Machine (`machine.ts`)

- States: `idle` → `scanning` → `idle`
- One actor per library (prevents concurrent scans)
- `getLibraryActor(libraryId)` / `removeLibraryActor(libraryId)`

### Effect Services

```typescript
// Dependencies injected via Layers
Audible; // External API client
FsExtended; // Filesystem operations
Hash; // Content hashing
```

## CONVENTIONS

### Error Handling

```typescript
// All errors are tagged
Effect.catchTags({
  SystemError: ...,
  DatabaseError: ...,
  AudibleError: ...,
})

// Use Match.tagsExhaustive for exhaustive handling
```

### Batch Processing

- Controlled by `env.METADATA_EXTRACTION_BATCH_SIZE`
- ffprobe calls are parallelized within batches

### HTTP Caching

- `__http__/` contains cached Audible responses
- Used for testing reproducibility

## ANTI-PATTERNS

- **Never** call Audible without rate limiting
- **Never** skip error handling in streams
- **Never** modify files outside of `FsExtended` service

## TESTING

Tests colocated: `*.test.ts`

- Use in-memory SQLite
- Mock Audible responses from `__http__/`

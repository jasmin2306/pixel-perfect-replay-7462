# VisionChat AI — FastAPI backend design (Phase 2 proposal)

Status: **design only**. Nothing deployed, no provider connected. The backend lives in a **separate repository** (`visionchat-api`); this frontend never runs Python.

---

## 1. Contract review: docs vs. current frontend

| # | Area | Frontend today | Doc / backend need | Resolution |
|---|------|----------------|--------------------|-----------|
| M1 | `ChatTransport.uploadImage` | returns `Promise<void>` | server returns `attachment_id` | Return `Promise<{ attachmentId: string }>` |
| M2 | `streamReply` input | `{ conversationId, prompt, hasImages }` | needs `attachment_ids`, `client_message_id` | Replace `hasImages` with `attachmentIds: string[]`, add `clientMessageId` |
| M3 | Conversation ID | new chat gets local `uid()` before any server call | server owns IDs | `POST /conversations` first, or let message endpoint create it (see D3) |
| M4 | Message IDs | local `uid()` for user + assistant | server IDs arrive in `message.created` | Store must re-key local messages on that event |
| M5 | Field casing | camelCase (`createdAt`, `previewUrl`) | API snake_case | Map in transport layer only; UI types unchanged |
| M6 | Attachment URL | blob object URL | short-lived signed URL; expires | Keep blob URL locally after send; history uses signed URL, refetch on expiry |
| M7 | Error model | `error?: string`; Retry shown for every failure | `code` + `retryable` | Add `errorCode?` and `retryable?` to `ChatMessage`; hide Retry when `retryable === false` |
| M8 | Retry | re-streams into same assistant message locally | doc: regenerate endpoint | `POST /messages/{id}/regenerate`, same SSE stream |
| M9 | Cancellation | client abort only | proxies may not propagate disconnect | Also call `POST /generations/{id}/cancel` on Stop |
| M10 | Upload cancel | no Stop during upload phase | — | Show Stop while `isUploading`; abort XHR |
| M11 | Upload progress | simulated | fetch cannot report upload progress | XHR in HTTP transport |
| M12 | Titles | first 42 chars of prompt, client-side | — | Server derives same rule; returns title in `message.created` |
| M13 | HEIC | accepted client-side | server must decode | Convert HEIC→WEBP client-side (Phase 2 canvas step) or server-side with `pillow-heif` (D5) |
| M14 | Ownership | no user concept | needed for history | Anonymous device session (D1) |

Limits already aligned: JPG/PNG/WEBP/HEIC, 10 MB per image, 4 images per message.

---

## 2. Folder structure (`visionchat-api` repo)

```text
visionchat-api/
  pyproject.toml            # uv / poetry; ruff, mypy, pytest config
  alembic.ini
  .env.example              # names only, no values
  Dockerfile
  app/
    main.py                 # app factory, CORS, middleware, routers
    config.py               # pydantic-settings; all secrets from env
    db.py                   # async engine + session dependency
    deps.py                 # auth/session, ownership helpers
    errors.py               # ApiError, handlers -> {error:{code,message,retryable}}
    middleware.py           # request id, body size limit, timing
    models/                 # SQLAlchemy 2.x typed models
      session.py conversation.py message.py attachment.py generation.py
    schemas/                # Pydantic v2 request/response models
      common.py conversation.py message.py upload.py sse.py
    api/v1/
      health.py sessions.py conversations.py uploads.py messages.py generations.py
    services/
      conversations.py messages.py uploads.py generation.py
      storage/   base.py local.py s3.py        # StorageBackend interface
      providers/ base.py registry.py           # VisionProvider interface (no impl yet)
      sse.py                                   # event encoder + heartbeat
      rate_limit.py
  migrations/               # alembic env + versions/
  tests/
    conftest.py             # test Postgres, httpx AsyncClient
    test_health.py test_conversations.py test_uploads.py
    test_messages_stream.py test_cancel.py test_ownership.py
    fakes/fake_provider.py  # test-only, never registered in prod
```

---

## 3. API contracts (`/api/v1`, JSON, snake_case)

All errors: `{"error": {"code": str, "message": str, "retryable": bool, "request_id": str}}`.
Auth header on every route except health/session: `Authorization: Bearer <session_token>`.

### Health
```
GET /healthz  -> 200 {"status":"ok"}
GET /readyz   -> 200 {"status":"ok","db":"ok","storage":"ok"} | 503 same shape with "error"
```

### Session (anonymous, see D1)
```
POST /sessions -> 201 {"session_token": str, "expires_at": datetime}
```

### Conversations
```
POST /conversations          body {"title": str (1..120) | null}
  -> 201 Conversation
GET  /conversations?limit=1..50(20)&cursor=str
  -> 200 {"items": [ConversationSummary], "next_cursor": str | null}
GET  /conversations/{id}     -> 200 ConversationDetail | 404 not_found (also when not owner)
PATCH /conversations/{id}    body {"title": str (1..120)} -> 200 Conversation
DELETE /conversations/{id}   -> 204

ConversationSummary = {id: uuid, title: str, updated_at: datetime}
ConversationDetail  = ConversationSummary + {messages: [Message]}
Message = {
  id: uuid, role: "user"|"assistant", content: str,
  status: "streaming"|"completed"|"cancelled"|"failed",
  created_at: datetime, attachments: [Attachment],
  error: {code: str, message: str, retryable: bool} | null
}
Attachment = {id: uuid, url: str (signed, ~15 min), mime_type: str, width: int, height: int, size: int}
```

### Uploads
```
POST /uploads   multipart/form-data, field "file"
  limits: <= 10 MB (enforced while streaming, not after), mime sniffed from bytes
          in {image/jpeg, image/png, image/webp, image/heic, image/heif}, max 8000x8000 px
  server: strip EXIF, re-encode to WEBP, store privately
  -> 201 {"attachment_id": uuid, "mime_type": "image/webp", "width": int, "height": int, "size": int}
  -> 413 file_too_large | 415 unsupported_type | 422 invalid_image
```
Unattached uploads expire after 24 h (cleanup job).

### Messages + generation stream
```
POST /conversations/{id}/messages
  Accept: text/event-stream
  body {
    "content": str (0..8000),
    "attachment_ids": [uuid] (0..4, owned, unattached),
    "client_message_id": str (1..64)     # idempotency key
  }
  rule: content or attachment_ids must be non-empty
  -> 200 SSE stream (below) | 400/404/409/413/429 JSON error before stream starts
  409 generation_in_progress if the conversation already has an active generation

POST /messages/{assistant_id}/regenerate   -> 200 SSE stream (same events)
POST /generations/{generation_id}/cancel   -> 202 {"status":"cancelling"} | 404 | 409 already_finished
```

---

## 4. SSE format

`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`. Each event: `event: <name>\ndata: <json>\n\n`.

| Event | Data | Client action |
|-------|------|---------------|
| `message.created` | `{conversation_id, user_message_id, assistant_message_id, generation_id, title}` | Re-key local messages; store `generation_id` for cancel |
| `token` | `{delta: str}` | Append to assistant content |
| `done` | `{assistant_message_id, finish_reason: "stop"\|"length", usage?: {input_tokens, output_tokens}}` | status `completed` |
| `error` | `{code, message, retryable}` | status `failed` |
| `cancelled` | `{assistant_message_id}` | status `cancelled` (partial text kept) |
| `: ping` | comment, every 15 s | ignore |

Error codes: `provider_unavailable` (retryable), `rate_limited` (retryable), `provider_timeout` (retryable), `content_refused` (not), `provider_not_configured` (not), `internal_error` (retryable).

Behaviour:
- Exactly one terminal event (`done` | `error` | `cancelled`) per stream; stream then closes.
- Stream ends without a terminal event → client marks `failed` ("Connection lost", retryable).
- **Disconnect**: server checks `request.is_disconnected()` between chunks; cancels provider task; persists partial content with `cancelled`.
- **Explicit cancel**: `/generations/{id}/cancel` sets a flag (in-process `asyncio.Event`; Redis pub/sub later for multi-instance); generator emits `cancelled`.
- Tokens are buffered and flushed to the DB every ~1 s and at the end, not per token.
- Timeouts: provider connect 10 s, idle between chunks 60 s, total generation 180 s → `provider_timeout`.

---

## 5. Provider interface (no implementation in this phase)

```python
class VisionProvider(Protocol):
    name: str
    async def stream(self, req: GenerationRequest, cancel: asyncio.Event) -> AsyncIterator[ProviderChunk]: ...

@dataclass
class GenerationRequest:
    messages: list[ProviderMessage]   # text + image refs (signed URLs or bytes)
    max_output_tokens: int | None

ProviderChunk = TextDelta | Finish | ProviderError   # normalized
```
Selected via `VISION_PROVIDER` env. If unset, message endpoint returns error `provider_not_configured` — **no fake answers in production code**. A fake provider exists only under `tests/fakes`.

---

## 6. Database (PostgreSQL, async SQLAlchemy 2.x, Alembic)

```text
sessions        id uuid PK, token_hash bytea UNIQUE, created_at, expires_at, last_seen_at
conversations   id uuid PK, session_id FK->sessions ON DELETE CASCADE, title varchar(120),
                created_at, updated_at, deleted_at NULL
                INDEX (session_id, updated_at DESC)
messages        id uuid PK, conversation_id FK->conversations ON DELETE CASCADE,
                role enum(user,assistant), content text, status enum(streaming,completed,cancelled,failed),
                error_code varchar NULL, error_message text NULL, error_retryable bool NULL,
                client_message_id varchar(64) NULL, created_at
                UNIQUE (conversation_id, client_message_id)
                INDEX (conversation_id, created_at)
attachments     id uuid PK, session_id FK->sessions, message_id FK->messages NULL ON DELETE CASCADE,
                storage_key text, mime_type, size int, width int, height int, sha256 bytea, created_at
                INDEX (message_id), INDEX (session_id, created_at) WHERE message_id IS NULL
generations     id uuid PK, assistant_message_id FK->messages ON DELETE CASCADE,
                provider varchar, model varchar, status enum(running,completed,cancelled,failed),
                started_at, finished_at NULL, input_tokens int NULL, output_tokens int NULL
                PARTIAL UNIQUE INDEX one running generation per conversation (via message join → enforce in service + row lock)
```
Relationships: session 1–N conversations 1–N messages 1–N attachments; assistant message 1–N generations (regenerate creates a new row).
Ownership: every query filters by `session_id`; foreign rows return 404, never 403, to avoid ID probing.

---

## 7. Security & limits

- Secrets only in server env: `DATABASE_URL`, `SESSION_PEPPER`, `STORAGE_*`, provider key. `.env.example` holds names only. Frontend knows only `VITE_API_BASE_URL`.
- CORS allow-list: preview + published frontend origins; no `*` with credentials.
- Body limit middleware: 11 MB uploads, 64 KB JSON.
- Rate limits per session: 30 messages/min, 20 uploads/min, 3 concurrent generations total.
- Images: magic-byte sniffing (not extension/`Content-Type`), Pillow decompression-bomb guard, EXIF stripped, private bucket, signed GET URLs.
- Errors: never leak provider raw errors, stack traces or SQL; log with `request_id`.
- Session tokens stored hashed (SHA-256 + pepper).

---

## 8. Lowest-cost deployment (not purchased; verify current pricing before choosing)

| Piece | Option | Notes |
|-------|--------|-------|
| API | **Render** free web service, or **Fly.io** smallest machine | Render free sleeps (cold start ~30–60 s, bad for SSE demos); Fly shared-cpu ~ a few USD/month, stays warm |
| PostgreSQL | **Neon** free tier | Serverless, branches for previews; use pooled URL + `asyncpg` with `statement_cache_size=0` |
| Images | **Cloudflare R2** free tier | S3-compatible, no egress fees |
| Redis (later) | Upstash free tier | Only once multiple API instances or background workers exist |

Recommended starting point: Fly.io (or Render for $0) + Neon + R2.

---

## 9. Local setup

- Python 3.12, `uv`, Docker (Postgres 16 via `docker compose`), optional MinIO for S3-compatible storage (or local filesystem backend).
- `uv sync` → `alembic upgrade head` → `uvicorn app.main:app --reload`.
- Tests: `pytest` against a disposable Postgres (testcontainers or compose service).
- Frontend: set `VITE_API_BASE_URL=http://localhost:8000/api/v1`.

---

## 10. Implementation sequence

1. Frontend contract prep (this repo): update `ChatTransport` types (M1, M2, M7), add re-keying on `message.created`, Stop during upload — mock adapted to new types, tests kept green.
2. Backend skeleton: config, app factory, health, error envelope, middleware, CI (ruff, mypy, pytest).
3. DB models + first Alembic migration; sessions endpoint + ownership dependency.
4. Conversations CRUD + tests (including cross-session 404).
5. Uploads: validation, re-encode, storage interface (local + S3) + tests.
6. Messages + SSE pipeline with the **test-only** fake provider: events, disconnect, cancel, timeouts, idempotency.
7. Frontend HTTP transport (XHR uploads, fetch SSE parser), enabled by `VITE_API_BASE_URL`; mock remains fallback.
8. Real vision provider adapter (after D2) + key added server-side.
9. Deploy (after D6), cleanup job for orphan uploads.

---

## 11. Unresolved decisions

- **D1 Identity**: anonymous device sessions now, real accounts later? (proposed: anonymous)
- **D2 Vision provider/model**: which one, and budget per month.
- **D3 New chat flow**: separate `POST /conversations` vs. create on first message (proposed: separate call, simpler idempotency).
- **D4 Image storage**: R2 vs. Postgres bytea for the demo (proposed: R2; local FS in dev).
- **D5 HEIC**: client-side conversion vs. server `pillow-heif` (proposed: client-side, server rejects HEIC if not converted).
- **D6 Hosting**: Render free (cold starts) vs. Fly.io paid-minimal.
- **D7 Retention**: how long conversations/images are kept for anonymous sessions.

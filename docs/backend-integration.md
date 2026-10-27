# VisionChat AI — Backend integration contract (FastAPI + vision streaming)

Status: **not implemented**. The app currently uses `src/lib/chat/mock/mock-transport.ts`, which streams a fixed, labelled demo string. No AI model, upload storage or database is connected.

## Frontend integration points

| Point | File | What changes |
| --- | --- | --- |
| Transport contract | `src/lib/chat/types.ts` → `ChatTransport` | Add `conversationId`/`attachmentIds` to `streamReply` input; `uploadImage` returns `{ attachmentId }`. |
| Transport selection | `src/lib/chat/chat-store.ts` (`createMockTransport(...)`) | Swap for `createHttpTransport({ baseUrl: import.meta.env.VITE_API_BASE_URL })`, falling back to mock only when the env var is unset. |
| Upload preparation | `src/lib/image/validate.ts` → `prepareImageForUpload` | Canvas resize/compress in a Web Worker before upload. |
| Upload call | `chat-store.ts` → `send()` upload loop | Use XHR (fetch has no upload progress) and keep returned `attachmentId`s. |
| Server conversation IDs | `chat-store.ts` → `send()` | New chats are created server-side; replace local `uid()` with the returned id. |
| History | `Sidebar.tsx`, `ChatShell.tsx` | Load `GET /conversations` and `GET /conversations/{id}` with TanStack Query; skeleton already exists. |
| Demo labels | `Composer.tsx` footer, `mock/*` | Show the "simulated" footer only while `transport.isMock`. |

## REST shapes

```http
POST /api/v1/uploads            multipart/form-data: file
201 { "attachment_id": "att_…", "mime_type": "image/webp", "width": 1600, "height": 1200, "size": 182344 }

POST /api/v1/conversations      { "title"?: string }
201 { "id": "conv_…", "title": "…", "updated_at": "ISO-8601" }

GET  /api/v1/conversations?cursor=…   200 { "items": [ { id, title, updated_at } ], "next_cursor": string | null }
GET  /api/v1/conversations/{id}       200 { id, title, messages: [ { id, role, content, status, created_at, attachments: [ { id, url, mime_type, width, height } ], error?: string } ] }
```
Attachment `url`s are short-lived signed URLs to private storage.

## Streaming a reply (SSE)

```http
POST /api/v1/conversations/{id}/messages
Accept: text/event-stream
{ "content": "Read this chart", "attachment_ids": ["att_…"], "client_message_id": "local id for dedupe" }
```
Use `fetch` + `ReadableStream` parsing (EventSource cannot POST). Events:

```text
event: message.created   data: { "user_message_id": "msg_u", "assistant_message_id": "msg_a" }
event: token             data: { "delta": "text chunk" }
event: done              data: { "assistant_message_id": "msg_a", "finish_reason": "stop" }
event: error             data: { "code": "provider_error" | "rate_limited" | "content_refused" | "insufficient_credits", "message": "safe text", "retryable": boolean }
: ping                   (comment heartbeat every 15s)
```
Client mapping: `token` → append to the streaming message; `done` → `completed`; `error` → `failed` with `message`; body ending without `done`/`error` → `failed` ("Connection lost").

## Cancellation
- Stop button → `AbortController.abort()` (already wired in `stop()`); message becomes `cancelled`, partial text kept.
- Server detects client disconnect, cancels the provider stream, persists partial content with `status: "cancelled"`.
- Gap: Stop is not shown during the upload phase; add a cancel control there.

## Error handling
| HTTP / event | UI behaviour |
| --- | --- |
| 400 / 413 / 415 | Inline attachment or composer error, no retry |
| 401 / 403 | Terminal message; no automatic retry |
| 402 / `insufficient_credits` | Terminal message from server text |
| 429, 5xx, `retryable: true` | Show Retry; honour `Retry-After`; bounded backoff, no instant retry |
| `content_refused` | Terminal, no Retry button |
| Network drop mid-stream | `failed`, Retry re-sends the same user message |

Retry (`retry()` in the store) should call a regenerate endpoint (`POST /api/v1/messages/{assistant_id}/regenerate`, same SSE events) rather than create a duplicate user message.

## Security
Vision provider keys live only in the FastAPI service environment. The browser only knows `VITE_API_BASE_URL`. CORS allow-list the app origin.

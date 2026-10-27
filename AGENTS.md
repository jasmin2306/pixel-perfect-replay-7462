<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Chat replies flow through the `ChatTransport` interface (src/lib/chat/types.ts); demo code lives only in src/lib/chat/mock so the future FastAPI SSE client can replace it without touching UI.
- Transient chat UI state lives in one Zustand store (src/lib/chat/chat-store.ts); presentation components never call network code directly.
- Image validation/preparation lives in src/lib/image; `prepareImageForUpload` is the hook point for Canvas + Web Worker compression.

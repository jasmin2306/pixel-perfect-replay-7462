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
- Chat replies flow through the `ChatTransport` interface (src/lib/chat/types.ts), chosen in src/lib/chat/transport.ts: HTTP transport (src/lib/api) when VITE_API_BASE_URL is set, labelled demo (src/lib/chat/mock) otherwise. Why: UI never changes when the backend arrives.
- snake_case API shapes live only in src/lib/api/models.ts and are converted only in src/lib/api/serialize.ts. Why: one place to change when the contract moves.
- Transient chat UI state lives in one Zustand store (src/lib/chat/chat-store.ts); presentation components never call network code directly.
- Image validation/preparation lives in src/lib/image; `prepareImageForUpload` is the hook point for Canvas + Web Worker compression.

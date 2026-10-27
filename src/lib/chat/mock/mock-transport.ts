/**
 * DEMO ONLY — simulated upload + token stream for the Phase 1 UI.
 * No AI model, backend or storage is called. Replace with the FastAPI SSE
 * transport in Phase 2 (same ChatTransport interface).
 */
import type { ChatTransport } from "../types";

const DEMO_REPLY_IMAGE =
  "**Demo response — no AI model is connected yet.**\n\nOnce the backend is live, this space will describe what is in your image: objects, text, layout and anything you asked about. For now, this text is streamed locally to show how replies appear, how Stop works, and how errors are handled.";
const DEMO_REPLY_TEXT =
  "**Demo response — no AI model is connected yet.**\n\nAttach an image and ask a question to see the full flow. This reply is generated locally to preview streaming, cancellation and retry states.";

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });

export function createMockTransport(opts: { shouldFail: () => boolean }): ChatTransport {
  return {
    isMock: true,
    async uploadImage(_file, onProgress, signal) {
      for (let p = 0; p <= 100; p += 20) {
        onProgress(p);
        await wait(120, signal);
      }
    },
    async streamReply({ hasImages }, onToken, signal) {
      await wait(500, signal);
      const words = (hasImages ? DEMO_REPLY_IMAGE : DEMO_REPLY_TEXT).split(/(\s+)/);
      const failAt = opts.shouldFail() ? Math.floor(words.length * 0.35) : -1;
      for (let i = 0; i < words.length; i++) {
        if (i === failAt) throw new Error("Connection to the AI provider was lost (simulated).");
        onToken(words[i] ?? "");
        await wait(28, signal);
      }
    },
  };
}

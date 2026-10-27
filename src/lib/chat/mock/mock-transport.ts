/**
 * DEMO ONLY — simulated upload + token stream for the UI preview.
 * No AI model, backend or storage is called. Active when VITE_API_BASE_URL is unset.
 */
import type { ChatTransport, StreamHandlers, StreamOutcome } from "../types";

const DEMO_REPLY_IMAGE =
  "**Demo response — no AI model is connected yet.**\n\nThis text is simulated locally and is not an analysis of your image. Once the backend is live, a real vision model will answer here. For now it shows how replies stream, how Stop works, and how errors are handled.";
const DEMO_REPLY_TEXT =
  "**Demo response — no AI model is connected yet.**\n\nThis reply is simulated locally to preview streaming, cancellation and retry states.";

const mockId = (p: string) => `mock_${p}_${Math.random().toString(36).slice(2, 10)}`;

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });

export function createMockTransport(opts: { shouldFail: () => boolean }): ChatTransport {
  async function streamDemo(text: string, handlers: StreamHandlers, signal: AbortSignal, created?: Parameters<StreamHandlers["onCreated"]>[0]): Promise<StreamOutcome> {
    try {
      await wait(300, signal);
      if (created) handlers.onCreated(created);
      await wait(200, signal);
      const words = text.split(/(\s+)/);
      const failAt = opts.shouldFail() ? Math.floor(words.length * 0.35) : -1;
      for (let i = 0; i < words.length; i++) {
        if (i === failAt) return { type: "error", error: { code: "provider_unavailable", message: "Connection to the AI provider was lost (simulated).", retryable: true } };
        handlers.onToken(words[i] ?? "");
        await wait(28, signal);
      }
      return { type: "done", finishReason: "stop" };
    } catch {
      return { type: "cancelled" };
    }
  }

  return {
    isMock: true,
    async uploadImage(file, onProgress, signal) {
      for (let p = 0; p <= 100; p += 20) {
        onProgress(p);
        await wait(120, signal);
      }
      return { attachmentId: mockId("att"), mimeType: file.type, width: 0, height: 0, size: file.size };
    },
    sendMessage(input, handlers, signal) {
      return streamDemo(input.attachmentIds.length ? DEMO_REPLY_IMAGE : DEMO_REPLY_TEXT, handlers, signal, {
        conversationId: input.conversationId ?? mockId("conv"),
        userMessageId: mockId("msg"),
        assistantMessageId: mockId("msg"),
        generationId: mockId("gen"),
        title: input.content.trim().slice(0, 42) || "Image analysis",
      });
    },
    regenerate(_id, handlers, signal) {
      return streamDemo(DEMO_REPLY_TEXT, handlers, signal);
    },
    async cancel() { /* demo: abort alone stops the stream */ },
  };
}

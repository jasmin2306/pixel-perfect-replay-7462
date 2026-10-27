import { describe, expect, it, vi } from "vitest";
import { createSseParser } from "./sse";
import { consumeStream } from "./http-transport";
import { fromApiMessage, toApiSendMessage, fromSseMessageCreated } from "./serialize";
import { selectTransport } from "../chat/transport";

const streamOf = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) { const e = new TextEncoder(); chunks.forEach((x) => c.enqueue(e.encode(x))); c.close(); },
  });

describe("serialization", () => {
  it("maps send input to snake_case", () => {
    expect(toApiSendMessage({ conversationId: null, clientMessageId: "c1", content: "hi", attachmentIds: ["a1"] }))
      .toEqual({ conversation_id: null, client_message_id: "c1", content: "hi", attachment_ids: ["a1"] });
  });
  it("maps an API message with error to camelCase", () => {
    const m = fromApiMessage({ id: "m", role: "assistant", content: "", status: "failed", created_at: "t", attachments: [{ id: "a", url: "u", mime_type: "image/webp", width: 1, height: 2, size: 3 }], error: { code: "content_refused", message: "no", retryable: false } });
    expect(m.error).toEqual({ code: "content_refused", message: "no", retryable: false });
    expect(m.attachments?.[0]).toMatchObject({ id: "a", mimeType: "image/webp", previewUrl: "u" });
    expect(m.persisted).toBe(true);
  });
  it("maps message.created ids", () => {
    expect(fromSseMessageCreated({ conversation_id: "c", user_message_id: "u", assistant_message_id: "a", generation_id: "g", title: "t" }))
      .toEqual({ conversationId: "c", userMessageId: "u", assistantMessageId: "a", generationId: "g", title: "t" });
  });
});

describe("SSE parser", () => {
  it("handles events split across chunks and ignores heartbeats", () => {
    const p = createSseParser();
    expect(p.push(": ping\n\nevent: tok")).toEqual([]);
    expect(p.push('en\ndata: {"delta":"Hi"}\n\n')).toEqual([{ event: "token", data: { delta: "Hi" } }]);
  });
  it("ignores unknown events", () => {
    expect(createSseParser().push('event: other\ndata: {}\n\n')).toEqual([]);
  });
});

describe("consumeStream", () => {
  const handlers = () => ({ onCreated: vi.fn(), onToken: vi.fn() });

  it("returns done after tokens", async () => {
    const h = handlers();
    const out = await consumeStream(streamOf(
      'event: message.created\ndata: {"conversation_id":"c","user_message_id":"u","assistant_message_id":"a","generation_id":"g","title":"t"}\n\n',
      'event: token\ndata: {"delta":"A"}\n\n',
      'event: done\ndata: {"assistant_message_id":"a","finish_reason":"stop"}\n\n',
    ), h);
    expect(out).toEqual({ type: "done", finishReason: "stop" });
    expect(h.onCreated).toHaveBeenCalledOnce();
    expect(h.onToken).toHaveBeenCalledWith("A");
  });
  it("returns a non-retryable error from an error event", async () => {
    const out = await consumeStream(streamOf('event: error\ndata: {"code":"content_refused","message":"x","retryable":false}\n\n'), handlers());
    expect(out).toEqual({ type: "error", error: { code: "content_refused", message: "x", retryable: false } });
  });
  it("returns cancelled on a cancelled event", async () => {
    expect(await consumeStream(streamOf('event: cancelled\ndata: {"assistant_message_id":"a"}\n\n'), handlers())).toEqual({ type: "cancelled" });
  });
  it("treats a stream ending without a terminal event as a retryable connection loss", async () => {
    const out = await consumeStream(streamOf('event: token\ndata: {"delta":"A"}\n\n'), handlers());
    expect(out).toMatchObject({ type: "error", error: { code: "connection_lost", retryable: true } });
  });
});

describe("transport selection", () => {
  it("uses the demo when VITE_API_BASE_URL is absent", () => {
    expect(selectTransport(undefined, () => false).isMock).toBe(true);
    expect(selectTransport("  ", () => false).isMock).toBe(true);
  });
  it("uses the HTTP transport when a base URL is set", () => {
    expect(selectTransport("http://localhost:8000/api/v1", () => false).isMock).toBe(false);
  });
});

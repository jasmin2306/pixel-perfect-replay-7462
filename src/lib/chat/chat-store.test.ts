import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatTransport, StreamOutcome } from "./types";

let n = 0;
globalThis.URL.createObjectURL = vi.fn(() => `blob:test-${++n}`);
globalThis.URL.revokeObjectURL = vi.fn();

const { useChatStore, __setTransportForTests } = await import("./chat-store");
const { createMockTransport } = await import("./mock/mock-transport");

const png = (name: string) => new File([new Uint8Array(10)], name, { type: "image/png" });
const reset = () => useChatStore.setState({ conversations: [], activeId: null, pending: [], attachError: null, isSubmitting: false, isGenerating: false, isUploading: false });

/** Scripted fake transport: emits server ids, then the given outcome. */
function fakeTransport(outcome: StreamOutcome, created = true) {
  const sendMessage = vi.fn<ChatTransport["sendMessage"]>(async (input, h) => {
    if (created) h.onCreated({ conversationId: "srv_conv", userMessageId: "srv_user", assistantMessageId: "srv_asst", generationId: "srv_gen", title: "Server title" });
    h.onToken("partial");
    return outcome;
  });
  const t: ChatTransport = {
    isMock: false,
    uploadImage: vi.fn(async (f: File) => ({ attachmentId: `srv_att_${f.name}`, mimeType: "image/webp", width: 10, height: 10, size: 5 })),
    sendMessage,
    regenerate: vi.fn(async (_id, h) => { h.onToken("again"); return { type: "done", finishReason: "stop" } as const; }),
    cancel: vi.fn(async () => {}),
  };
  return Object.assign(t, { sendMessage }) as ChatTransport & { sendMessage: typeof sendMessage };
}

describe("chat store attachments (demo transport)", () => {
  beforeEach(() => { reset(); __setTransportForTests(createMockTransport({ shouldFail: () => false })); });

  it("rejects a non-image file and keeps it out of pending", () => {
    useChatStore.getState().addFiles([new File(["x"], "a.pdf", { type: "application/pdf" })]);
    expect(useChatStore.getState().pending).toHaveLength(0);
    expect(useChatStore.getState().attachError).toContain("a.pdf");
  });

  it("caps attachments at 4 per message", () => {
    useChatStore.getState().addFiles(["1", "2", "3", "4", "5"].map((i) => png(`${i}.png`)));
    expect(useChatStore.getState().pending).toHaveLength(4);
  });

  it("attaches images to the user message that sent them, not the next one", async () => {
    vi.useFakeTimers();
    useChatStore.getState().addFiles([png("chart.png")]);
    const p1 = useChatStore.getState().send("Read this chart");
    await vi.runAllTimersAsync(); await p1;
    const p2 = useChatStore.getState().send("Follow-up without image");
    await vi.runAllTimersAsync(); await p2;
    vi.useRealTimers();

    const msgs = useChatStore.getState().conversations[0]!.messages.filter((m) => m.role === "user");
    expect(msgs[0]!.attachments?.map((a) => a.name)).toEqual(["chart.png"]);
    expect(msgs[1]!.attachments).toEqual([]);
    expect(useChatStore.getState().pending).toHaveLength(0);
  });
});

describe("chat store backend contract", () => {
  beforeEach(reset);

  it("replaces local ids with server-issued ids and sends uploaded attachment ids", async () => {
    const t = fakeTransport({ type: "done", finishReason: "stop" });
    __setTransportForTests(t);
    useChatStore.getState().addFiles([png("a.png")]);
    await useChatStore.getState().send("What is this?");

    const s = useChatStore.getState();
    expect(s.activeId).toBe("srv_conv");
    const conv = s.conversations[0]!;
    expect(conv.persisted).toBe(true);
    expect(conv.title).toBe("Server title");
    expect(conv.messages.map((m) => m.id)).toEqual(["srv_user", "srv_asst"]);
    expect(conv.messages[1]).toMatchObject({ status: "completed", content: "partial", generationId: "srv_gen" });
    const input = t.sendMessage.mock.calls[0]![0];
    expect(input.conversationId).toBeNull();
    expect(input.attachmentIds).toEqual(["srv_att_a.png"]);
    expect(input.clientMessageId).toBeTruthy();
  });

  it("ignores a second send while the first is in flight", async () => {
    const t = fakeTransport({ type: "done", finishReason: "stop" });
    __setTransportForTests(t);
    const a = useChatStore.getState().send("one");
    const b = useChatStore.getState().send("two");
    await Promise.all([a, b]);
    expect(t.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("does not retry a non-retryable failure", async () => {
    const t = fakeTransport({ type: "error", error: { code: "content_refused", message: "Refused", retryable: false } });
    __setTransportForTests(t);
    await useChatStore.getState().send("hi");
    const asst = useChatStore.getState().conversations[0]!.messages[1]!;
    expect(asst.status).toBe("failed");
    await useChatStore.getState().retry(asst.id);
    expect(t.regenerate).not.toHaveBeenCalled();
    expect(t.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("regenerates a persisted reply after a retryable failure", async () => {
    const t = fakeTransport({ type: "error", error: { code: "provider_unavailable", message: "Down", retryable: true } });
    __setTransportForTests(t);
    await useChatStore.getState().send("hi");
    await useChatStore.getState().retry("srv_asst");
    expect(t.regenerate).toHaveBeenCalledWith("srv_asst", expect.anything(), expect.anything());
    expect(useChatStore.getState().conversations[0]!.messages[1]!.status).toBe("completed");
  });

  it("resends with the same client message id when the server never confirmed the message", async () => {
    const t = fakeTransport({ type: "error", error: { code: "connection_lost", message: "Lost", retryable: true } }, false);
    __setTransportForTests(t);
    await useChatStore.getState().send("hi");
    const asst = useChatStore.getState().conversations[0]!.messages[1]!;
    await useChatStore.getState().retry(asst.id);
    expect(t.sendMessage).toHaveBeenCalledTimes(2);
    expect(t.sendMessage.mock.calls[1]![0].clientMessageId).toBe(t.sendMessage.mock.calls[0]![0].clientMessageId);
  });

  it("stop calls server cancel with the generation id and marks the reply cancelled", async () => {
    let release!: (o: StreamOutcome) => void;
    const t = fakeTransport({ type: "done", finishReason: "stop" });
    t.sendMessage = vi.fn<ChatTransport["sendMessage"]>(async (_i, h, signal) => {
      h.onCreated({ conversationId: "c", userMessageId: "u", assistantMessageId: "a", generationId: "g1", title: "t" });
      signal.addEventListener("abort", () => release({ type: "cancelled" }));
      return new Promise<StreamOutcome>((r) => { release = r; });
    });
    __setTransportForTests(t);
    const p = useChatStore.getState().send("hi");
    await Promise.resolve(); await Promise.resolve();
    useChatStore.getState().stop();
    await p;
    expect(t.cancel).toHaveBeenCalledWith("g1");
    expect(useChatStore.getState().conversations[0]!.messages[1]!.status).toBe("cancelled");
  });

  it("marks a failed upload and does not send the message", async () => {
    const t = fakeTransport({ type: "done", finishReason: "stop" });
    t.uploadImage = vi.fn(async () => { throw new Error("Unsupported image"); });
    __setTransportForTests(t);
    useChatStore.getState().addFiles([png("bad.png")]);
    await useChatStore.getState().send("hi");
    const s = useChatStore.getState();
    expect(s.pending[0]!.state).toBe("error");
    expect(s.attachError).toBe("Unsupported image");
    expect(t.sendMessage).not.toHaveBeenCalled();
    expect(s.isSubmitting).toBe(false);
  });
});

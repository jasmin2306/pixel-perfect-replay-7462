import { beforeEach, describe, expect, it, vi } from "vitest";

let n = 0;
globalThis.URL.createObjectURL = vi.fn(() => `blob:test-${++n}`);
globalThis.URL.revokeObjectURL = vi.fn();

const { useChatStore } = await import("./chat-store");

const png = (name: string) => new File([new Uint8Array(10)], name, { type: "image/png" });

describe("chat store attachments", () => {
  beforeEach(() => useChatStore.setState({ conversations: [], activeId: null, pending: [], attachError: null }));

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
    const s = useChatStore.getState();
    s.addFiles([png("chart.png")]);
    const p1 = s.send("Read this chart");
    await vi.runAllTimersAsync();
    await p1;
    const p2 = useChatStore.getState().send("Follow-up without image");
    await vi.runAllTimersAsync();
    await p2;
    vi.useRealTimers();

    const msgs = useChatStore.getState().conversations[0]!.messages.filter((m) => m.role === "user");
    expect(msgs[0]!.content).toBe("Read this chart");
    expect(msgs[0]!.attachments?.map((a) => a.name)).toEqual(["chart.png"]);
    expect(msgs[1]!.attachments).toEqual([]);
    expect(useChatStore.getState().pending).toHaveLength(0);
  });
});

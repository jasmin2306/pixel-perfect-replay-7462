import { create } from "zustand";
import type { ChatMessage, ChatTransport, Conversation, ImageAttachment, PendingAttachment } from "./types";
import { sampleConversations } from "./mock/sample-conversations";
import { createMockTransport } from "./mock/mock-transport";
import { MAX_IMAGES_PER_MESSAGE, prepareImageForUpload, validateImageFile } from "../image/validate";

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();

interface ChatState {
  conversations: Conversation[];
  activeId: string | null;
  pending: PendingAttachment[];
  attachError: string | null;
  isGenerating: boolean;
  isUploading: boolean;
  isLoadingConversation: boolean;
  simulateFailure: boolean;
  mobileNavOpen: boolean;
  sidebarCollapsed: boolean;

  newChat: () => void;
  selectConversation: (id: string) => void;
  clearHistory: () => void;
  addFiles: (files: FileList | File[]) => void;
  removeAttachment: (id: string) => void;
  replaceAttachment: (id: string, file: File) => void;
  send: (prompt: string) => Promise<void>;
  stop: () => void;
  retry: (assistantId: string) => Promise<void>;
  setSimulateFailure: (v: boolean) => void;
  setMobileNavOpen: (v: boolean) => void;
  toggleSidebar: () => void;
}

let controller: AbortController | null = null;
let transport: ChatTransport;

export const useChatStore = create<ChatState>((set, get) => {
  transport = createMockTransport({ shouldFail: () => get().simulateFailure });

  const patchMessage = (convId: string, msgId: string, patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>)) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id !== convId ? c : {
          ...c,
          updatedAt: now(),
          messages: c.messages.map((m) => (m.id !== msgId ? m : { ...m, ...(typeof patch === "function" ? patch(m) : patch) })),
        },
      ),
    }));

  const runReply = async (convId: string, assistantId: string, prompt: string, hasImages: boolean) => {
    controller = new AbortController();
    set({ isGenerating: true });
    try {
      await transport.streamReply(
        { conversationId: convId, prompt, hasImages },
        (tok) => patchMessage(convId, assistantId, (m) => ({ content: m.content + tok })),
        controller.signal,
      );
      patchMessage(convId, assistantId, { status: "completed" });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        patchMessage(convId, assistantId, { status: "cancelled" });
      } else {
        patchMessage(convId, assistantId, { status: "failed", error: e instanceof Error ? e.message : "Something went wrong." });
      }
    } finally {
      controller = null;
      set({ isGenerating: false });
    }
  };

  const toPending = (file: File): PendingAttachment => ({ id: uid(), file, previewUrl: URL.createObjectURL(file), progress: 0, state: "ready" });

  return {
    conversations: sampleConversations,
    activeId: null,
    pending: [],
    attachError: null,
    isGenerating: false,
    isUploading: false,
    isLoadingConversation: false,
    simulateFailure: false,
    mobileNavOpen: false,
    sidebarCollapsed: false,

    newChat: () => {
      if (get().isGenerating) get().stop();
      set({ activeId: null, mobileNavOpen: false, attachError: null });
    },
    selectConversation: (id) => {
      if (get().isGenerating) get().stop();
      set({ activeId: id, mobileNavOpen: false, isLoadingConversation: true });
      // Simulated fetch latency so the skeleton state is visible (demo only).
      setTimeout(() => set({ isLoadingConversation: false }), 450);
    },
    clearHistory: () => set({ conversations: [], activeId: null }),

    addFiles: (files) => {
      const list = Array.from(files);
      const errors: string[] = [];
      const accepted: PendingAttachment[] = [];
      for (const f of list) {
        const r = validateImageFile(f);
        if (!r.ok) errors.push(`${f.name}: ${r.reason}`);
        else accepted.push(toPending(f));
      }
      const room = MAX_IMAGES_PER_MESSAGE - get().pending.length;
      if (accepted.length > room) errors.push(`You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message.`);
      set((s) => ({ pending: [...s.pending, ...accepted.slice(0, Math.max(room, 0))], attachError: errors[0] ?? null }));
    },
    removeAttachment: (id) =>
      set((s) => {
        const a = s.pending.find((p) => p.id === id);
        if (a) URL.revokeObjectURL(a.previewUrl);
        return { pending: s.pending.filter((p) => p.id !== id) };
      }),
    replaceAttachment: (id, file) => {
      const r = validateImageFile(file);
      if (!r.ok) return set({ attachError: `${file.name}: ${r.reason}` });
      set((s) => ({
        attachError: null,
        pending: s.pending.map((p) => {
          if (p.id !== id) return p;
          URL.revokeObjectURL(p.previewUrl);
          return toPending(file);
        }),
      }));
    },

    send: async (prompt) => {
      const text = prompt.trim();
      const { pending, isGenerating, isUploading } = get();
      if ((!text && pending.length === 0) || isGenerating || isUploading) return;

      // 1. Upload (simulated) with per-file progress
      if (pending.length) {
        set({ isUploading: true });
        controller = new AbortController();
        try {
          for (const p of pending) {
            const prepared = await prepareImageForUpload(p.file);
            set((s) => ({ pending: s.pending.map((x) => (x.id === p.id ? { ...x, state: "uploading" } : x)) }));
            await transport.uploadImage(prepared, (pct) =>
              set((s) => ({ pending: s.pending.map((x) => (x.id === p.id ? { ...x, progress: pct } : x)) })), controller.signal);
            set((s) => ({ pending: s.pending.map((x) => (x.id === p.id ? { ...x, state: "uploaded", progress: 100 } : x)) }));
          }
        } catch {
          set((s) => ({ isUploading: false, pending: s.pending.map((x) => (x.state === "uploading" ? { ...x, state: "ready", progress: 0 } : x)) }));
          controller = null;
          return;
        }
        controller = null;
        set({ isUploading: false });
      }

      const attachments: ImageAttachment[] = get().pending.map((p) => ({
        id: p.id, name: p.file.name, size: p.file.size, mimeType: p.file.type, previewUrl: p.previewUrl,
      }));
      const userMsg: ChatMessage = { id: uid(), role: "user", content: text, status: "completed", createdAt: now(), attachments };
      const assistant: ChatMessage = { id: uid(), role: "assistant", content: "", status: "streaming", createdAt: now() };

      let convId = get().activeId;
      if (!convId) {
        convId = uid();
        const conv: Conversation = {
          id: convId,
          title: text ? text.slice(0, 42) : "Image analysis",
          updatedAt: now(),
          messages: [userMsg, assistant],
        };
        set((s) => ({ conversations: [conv, ...s.conversations], activeId: convId, pending: [], attachError: null }));
      } else {
        const id = convId;
        set((s) => ({
          pending: [],
          attachError: null,
          conversations: s.conversations.map((c) => (c.id === id ? { ...c, updatedAt: now(), messages: [...c.messages, userMsg, assistant] } : c)),
        }));
      }
      await runReply(convId, assistant.id, text, attachments.length > 0);
    },

    stop: () => controller?.abort(),

    retry: async (assistantId) => {
      const convId = get().activeId;
      if (!convId || get().isGenerating) return;
      const conv = get().conversations.find((c) => c.id === convId);
      const idx = conv?.messages.findIndex((m) => m.id === assistantId) ?? -1;
      if (!conv || idx < 1) return;
      const userMsg = conv.messages[idx - 1];
      patchMessage(convId, assistantId, { status: "streaming", content: "", error: undefined });
      await runReply(convId, assistantId, userMsg.content, (userMsg.attachments?.length ?? 0) > 0);
    },

    setSimulateFailure: (v) => set({ simulateFailure: v }),
    setMobileNavOpen: (v) => set({ mobileNavOpen: v }),
    toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  };
});

export const isMockTransport = () => transport.isMock;

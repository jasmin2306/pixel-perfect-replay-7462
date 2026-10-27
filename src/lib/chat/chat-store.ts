import { create } from "zustand";
import type {
  ChatMessage,
  ChatTransport,
  Conversation,
  ImageAttachment,
  PendingAttachment,
  StreamHandlers,
  StreamOutcome,
} from "./types";
import { sampleConversations } from "./mock/sample-conversations";
import { selectTransport } from "./transport";
import {
  MAX_IMAGES_PER_MESSAGE,
  prepareImageForUpload,
  validateImageFile,
} from "../image/validate";

const uid = () => `local_${Math.random().toString(36).slice(2, 10)}`;
const newClientMessageId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const now = () => new Date().toISOString();

interface ChatState {
  conversations: Conversation[];
  activeId: string | null;
  pending: PendingAttachment[];
  attachError: string | null;
  /** True from the moment Send is pressed until the stream ends; blocks duplicate submits. */
  isSubmitting: boolean;
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
let activeGenerationId: string | null = null;
let transport: ChatTransport;

/** Exposed so the UI can label demo mode and tests can inject a transport. */
export const getTransport = () => transport;
export const __setTransportForTests = (t: ChatTransport) => {
  transport = t;
};

export const useChatStore = create<ChatState>((set, get) => {
  transport = selectTransport(
    import.meta.env["VITE_API_BASE_URL"] as string | undefined,
    () => get().simulateFailure,
  );

  const updateConv = (convId: string, fn: (c: Conversation) => Conversation) =>
    set((s) => ({ conversations: s.conversations.map((c) => (c.id === convId ? fn(c) : c)) }));

  const patchMessage = (
    convId: string,
    msgId: string,
    patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>),
  ) =>
    updateConv(convId, (c) => ({
      ...c,
      updatedAt: now(),
      messages: c.messages.map((m) =>
        m.id !== msgId ? m : { ...m, ...(typeof patch === "function" ? patch(m) : patch) },
      ),
    }));

  /**
   * Runs one stream and applies its events. Server ids from `message.created`
   * replace local ids; the closure tracks the current ids.
   */
  const runStream = async (
    ids: { convId: string; userId: string | null; assistantId: string },
    call: (h: StreamHandlers, signal: AbortSignal) => Promise<StreamOutcome>,
  ) => {
    controller = new AbortController();
    set({ isGenerating: true, isSubmitting: true });
    const cur = { ...ids };
    const handlers: StreamHandlers = {
      onCreated: (info) => {
        activeGenerationId = info.generationId;
        const oldConv = cur.convId;
        set((s) => ({
          activeId: s.activeId === oldConv ? info.conversationId : s.activeId,
          conversations: s.conversations.map((c) =>
            c.id !== oldConv
              ? c
              : {
                  ...c,
                  id: info.conversationId,
                  title: c.persisted ? c.title : info.title,
                  persisted: true,
                  messages: c.messages.map((m) =>
                    m.id === cur.userId
                      ? { ...m, id: info.userMessageId, persisted: true }
                      : m.id === cur.assistantId
                        ? {
                            ...m,
                            id: info.assistantMessageId,
                            persisted: true,
                            generationId: info.generationId,
                          }
                        : m,
                  ),
                },
          ),
        }));
        cur.convId = info.conversationId;
        cur.assistantId = info.assistantMessageId;
        cur.userId = info.userMessageId;
      },
      onToken: (delta) =>
        patchMessage(cur.convId, cur.assistantId, (m) => ({ content: m.content + delta })),
    };
    let outcome: StreamOutcome;
    try {
      outcome = await call(handlers, controller.signal);
    } catch {
      outcome = {
        type: "error",
        error: { code: "client_error", message: "Something went wrong.", retryable: true },
      };
    }
    if (outcome.type === "done") patchMessage(cur.convId, cur.assistantId, { status: "completed" });
    else if (outcome.type === "cancelled")
      patchMessage(cur.convId, cur.assistantId, { status: "cancelled" });
    else patchMessage(cur.convId, cur.assistantId, { status: "failed", error: outcome.error });
    controller = null;
    activeGenerationId = null;
    set({ isGenerating: false, isSubmitting: false });
  };

  const toPending = (file: File): PendingAttachment => ({
    id: uid(),
    file,
    previewUrl: URL.createObjectURL(file),
    progress: 0,
    state: "ready",
  });
  const setPending = (id: string, patch: Partial<PendingAttachment>) =>
    set((s) => ({ pending: s.pending.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  /** Uploads every pending image not yet uploaded. Returns false if cancelled or failed. */
  const uploadPending = async (): Promise<boolean> => {
    const todo = get().pending.filter((p) => !p.uploaded);
    if (!todo.length) return true;
    set({ isUploading: true, attachError: null });
    controller = new AbortController();
    try {
      for (const p of todo) {
        setPending(p.id, { state: "uploading", progress: 0, error: undefined });
        const prepared = await prepareImageForUpload(p.file);
        const uploaded = await transport.uploadImage(
          prepared,
          (pct) => setPending(p.id, { progress: pct }),
          controller.signal,
        );
        setPending(p.id, { state: "uploaded", progress: 100, uploaded });
      }
      return true;
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const message = aborted ? undefined : e instanceof Error ? e.message : "Upload failed.";
      set((s) => ({
        attachError: message ?? null,
        pending: s.pending.map((x) =>
          x.state === "uploading"
            ? { ...x, state: aborted ? "ready" : "error", progress: 0, error: message }
            : x,
        ),
      }));
      return false;
    } finally {
      controller = null;
      set({ isUploading: false });
    }
  };

  return {
    conversations: sampleConversations,
    activeId: null,
    pending: [],
    attachError: null,
    isSubmitting: false,
    isGenerating: false,
    isUploading: false,
    isLoadingConversation: false,
    simulateFailure: false,
    mobileNavOpen: false,
    sidebarCollapsed: false,

    newChat: () => {
      if (get().isSubmitting) get().stop();
      set({ activeId: null, mobileNavOpen: false, attachError: null });
    },
    selectConversation: (id) => {
      if (get().isSubmitting) get().stop();
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
      if (accepted.length > room)
        errors.push(`You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message.`);
      set((s) => ({
        pending: [...s.pending, ...accepted.slice(0, Math.max(room, 0))],
        attachError: errors[0] ?? null,
      }));
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
      const { pending, isSubmitting, isGenerating, isUploading } = get();
      if ((!text && pending.length === 0) || isSubmitting || isGenerating || isUploading) return;
      set({ isSubmitting: true });

      if (!(await uploadPending())) {
        set({ isSubmitting: false });
        return;
      }

      const sent = get().pending;
      const attachments: ImageAttachment[] = sent.map((p) => ({
        id: p.uploaded?.attachmentId ?? p.id,
        name: p.file.name,
        size: p.file.size,
        mimeType: p.uploaded?.mimeType ?? p.file.type,
        previewUrl: p.previewUrl,
        width: p.uploaded?.width,
        height: p.uploaded?.height,
      }));
      const clientMessageId = newClientMessageId();
      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: text,
        status: "completed",
        createdAt: now(),
        attachments,
        clientMessageId,
      };
      const assistant: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: "",
        status: "streaming",
        createdAt: now(),
      };

      const existing = get().conversations.find((c) => c.id === get().activeId);
      const convId = existing?.id ?? uid();
      if (!existing) {
        const conv: Conversation = {
          id: convId,
          title: text ? text.slice(0, 42) : "Image analysis",
          updatedAt: now(),
          messages: [userMsg, assistant],
          persisted: false,
        };
        set((s) => ({
          conversations: [conv, ...s.conversations],
          activeId: convId,
          pending: [],
          attachError: null,
        }));
      } else {
        set({ pending: [], attachError: null });
        updateConv(convId, (c) => ({
          ...c,
          updatedAt: now(),
          messages: [...c.messages, userMsg, assistant],
        }));
      }

      await runStream({ convId, userId: userMsg.id, assistantId: assistant.id }, (h, signal) =>
        transport.sendMessage(
          {
            conversationId: existing?.persisted ? convId : null,
            clientMessageId,
            content: text,
            attachmentIds: attachments.map((a) => a.id),
          },
          h,
          signal,
        ),
      );
    },

    stop: () => {
      if (activeGenerationId) void transport.cancel(activeGenerationId);
      controller?.abort();
    },

    retry: async (assistantId) => {
      const convId = get().activeId;
      if (!convId || get().isSubmitting) return;
      const conv = get().conversations.find((c) => c.id === convId);
      const idx = conv?.messages.findIndex((m) => m.id === assistantId) ?? -1;
      const assistant = conv?.messages[idx];
      const userMsg = conv?.messages[idx - 1];
      if (!conv || !assistant || !userMsg) return;
      if (assistant.status === "failed" && assistant.error && !assistant.error.retryable) return;

      patchMessage(convId, assistantId, { status: "streaming", content: "", error: undefined });
      if (assistant.persisted) {
        await runStream({ convId, userId: null, assistantId }, (h, signal) =>
          transport.regenerate(assistantId, h, signal),
        );
      } else {
        // Server never confirmed the message: resend with the same idempotency key.
        await runStream({ convId, userId: userMsg.id, assistantId }, (h, signal) =>
          transport.sendMessage(
            {
              conversationId: conv.persisted ? convId : null,
              clientMessageId: userMsg.clientMessageId ?? newClientMessageId(),
              content: userMsg.content,
              attachmentIds: (userMsg.attachments ?? []).map((a) => a.id),
            },
            h,
            signal,
          ),
        );
      }
    },

    setSimulateFailure: (v) => set({ simulateFailure: v }),
    setMobileNavOpen: (v) => set({ mobileNavOpen: v }),
    toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  };
});

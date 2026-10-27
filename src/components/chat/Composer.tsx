import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Camera, ImagePlus, RefreshCw, Square, X, AlertCircle } from "lucide-react";
import { getTransport, useChatStore } from "@/lib/chat/chat-store";
import { ACCEPTED_IMAGE_TYPES, formatBytes } from "@/lib/image/validate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ComposerHandle {
  setText: (t: string) => void;
  openFilePicker: () => void;
}

const ACCEPT = ACCEPTED_IMAGE_TYPES.join(",");

export const Composer = forwardRef<ComposerHandle>(function Composer(_, ref) {
  const { pending, attachError, isGenerating, isUploading, isSubmitting, addFiles, removeAttachment, replaceAttachment, send, stop } = useChatStore();
  const [text, setText] = useState("");
  const [hasCamera, setHasCamera] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);

  useEffect(() => {
    setHasCamera(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useImperativeHandle(ref, () => ({
    setText: (t) => {
      setText(t);
      textareaRef.current?.focus();
    },
    openFilePicker: () => fileRef.current?.click(),
  }));

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const busy = isSubmitting || isGenerating || isUploading;
  const [isMock, setIsMock] = useState(true);
  useEffect(() => setIsMock(getTransport().isMock), []);
  const canSend = !busy && (text.trim().length > 0 || pending.length > 0);

  const submit = () => {
    if (!canSend) return;
    const t = text;
    setText("");
    void send(t);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:px-4">
      <div className="rounded-2xl border border-border bg-panel shadow-soft transition-colors focus-within:border-primary/50">
        <AnimatePresence initial={false}>
          {pending.length > 0 && (
            <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="flex gap-2 overflow-x-auto px-3 pt-3" aria-label="Attached images">
              {pending.map((p) => (
                <li key={p.id} className="group relative shrink-0">
                  <img src={p.previewUrl} alt={p.file.name} className={cn("size-20 rounded-xl border border-border object-cover", p.state === "uploading" && "opacity-60")} />
                  {p.state === "uploading" || p.state === "uploaded" ? (
                    <div className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-background/70" role="progressbar" aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${p.file.name}`}>
                      <div className="h-full bg-gradient-brand transition-[width] duration-150" style={{ width: `${p.progress}%` }} />
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-start justify-between p-1 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => { replaceTarget.current = p.id; replaceRef.current?.click(); }}
                        className="grid size-6 place-items-center rounded-full bg-background/85 text-foreground"
                        aria-label={`Replace ${p.file.name}`}
                      ><RefreshCw className="size-3" /></button>
                      <button type="button" onClick={() => removeAttachment(p.id)} className="grid size-6 place-items-center rounded-full bg-background/85 text-foreground" aria-label={`Remove ${p.file.name}`}>
                        <X className="size-3.5" />
                      </button>
                    </div>
                  )}
                  <span className="mt-1 block w-20 truncate text-[10px] text-muted-foreground">{formatBytes(p.file.size)}</span>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        {attachError && (
          <p role="alert" className="flex items-center gap-1.5 px-4 pt-2.5 text-xs text-destructive"><AlertCircle className="size-3.5" />{attachError}</p>
        )}

        <label htmlFor="composer-input" className="sr-only">Message</label>
        <textarea
          id="composer-input"
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={pending.length ? "Ask something about your image…" : "Ask about an image, or attach one…"}
          className="block max-h-[200px] w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
        />

        <div className="flex items-center gap-1 px-2 pb-2">
          <Button type="button" variant="ghost" size="icon" className="size-9 text-muted-foreground hover:text-foreground" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Attach image">
            <ImagePlus className="size-[18px]" />
          </Button>
          {hasCamera && (
            <Button type="button" variant="ghost" size="icon" className="size-9 text-muted-foreground hover:text-foreground" onClick={() => cameraRef.current?.click()} disabled={busy} aria-label="Take photo">
              <Camera className="size-[18px]" />
            </Button>
          )}
          <span className="ml-1 hidden text-xs text-muted-foreground sm:inline">
            {isUploading ? "Uploading image…" : "JPG, PNG, WEBP, HEIC · up to 10 MB · max 4"}
          </span>
          <div className="ml-auto">
            {isGenerating || isUploading ? (
              <Button type="button" size="icon" variant="secondary" className="size-9 rounded-xl" onClick={stop} aria-label={isUploading ? "Cancel upload" : "Stop generating"}>
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button type="button" size="icon" onClick={submit} disabled={!canSend} className="size-9 rounded-xl bg-gradient-brand text-primary-foreground shadow-glow disabled:opacity-40 disabled:shadow-none" aria-label="Send message">
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
      {isMock && <p className="mt-2 text-center text-[11px] text-muted-foreground">Preview build · replies are simulated locally, no AI model is connected.</p>}

      <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
      <input ref={replaceRef} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f && replaceTarget.current) replaceAttachment(replaceTarget.current, f); e.target.value = ""; }} />
    </div>
  );
});

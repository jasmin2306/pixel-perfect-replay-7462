import { useEffect, useRef, useState, type DragEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ImageDown, Menu, PanelLeftOpen, SquarePen } from "lucide-react";
import { useChatStore } from "@/lib/chat/chat-store";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { SidebarContent } from "./Sidebar";
import { WelcomeScreen } from "./WelcomeScreen";
import { MessageBubble } from "./MessageBubble";
import { Composer, type ComposerHandle } from "./Composer";
import { cn } from "@/lib/utils";

function ConversationSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8" aria-label="Loading conversation">
      <div className="flex justify-end">
        <Skeleton className="h-10 w-2/5 rounded-2xl" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="size-7 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function ChatShell() {
  const {
    conversations,
    activeId,
    isLoadingConversation,
    isGenerating,
    isSubmitting,
    mobileNavOpen,
    setMobileNavOpen,
    sidebarCollapsed,
    toggleSidebar,
    retry,
    addFiles,
    newChat,
  } = useChatStore();
  const active = conversations.find((c) => c.id === activeId) ?? null;
  const composerRef = useRef<ComposerHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const lastContent = active?.messages.at(-1)?.content;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [active?.messages.length, lastContent, activeId]);

  const onDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    dragDepth.current++;
    setDragging(true);
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 border-r border-sidebar-border transition-[width] duration-300 md:block",
          sidebarCollapsed ? "w-0 overflow-hidden border-r-0" : "w-72",
        )}
      >
        <SidebarContent onCollapse={toggleSidebar} />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-80 border-sidebar-border p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent />
        </SheetContent>
      </Sheet>

      <main
        className="relative flex min-w-0 flex-1 flex-col"
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-glow" aria-hidden />

        <header className="relative z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 md:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>
          {sidebarCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="hidden size-9 md:inline-flex"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="size-4" />
            </Button>
          )}
          <h2 className="min-w-0 flex-1 truncate font-display text-sm font-medium sm:text-[15px]">
            {active ? active.title : "New conversation"}
          </h2>
          {active?.isSample && (
            <span className="hidden rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground sm:inline">
              Sample conversation
            </span>
          )}
          {isGenerating && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              Streaming
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={newChat}
            aria-label="New chat"
          >
            <SquarePen className="size-4" />
          </Button>
        </header>

        <div
          ref={scrollRef}
          className="relative z-0 flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto"
        >
          {isLoadingConversation ? (
            <ConversationSkeleton />
          ) : !active ? (
            <WelcomeScreen onPick={(p) => composerRef.current?.setText(p)} />
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-7 px-4 py-6 sm:py-8">
              {active.messages.map((m, i) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  canRetry={!isSubmitting && i === active.messages.length - 1}
                  onRetry={() => void retry(m.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="relative z-10 shrink-0 pt-2">
          <Composer ref={composerRef} />
        </div>

        <AnimatePresence>
          {dragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-primary/60 bg-background/85 backdrop-blur-sm"
            >
              <div className="text-center">
                <ImageDown className="mx-auto size-8 text-primary" />
                <p className="mt-3 font-display text-lg font-medium">Drop images to attach</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  JPG, PNG, WEBP or HEIC, up to 10 MB each
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

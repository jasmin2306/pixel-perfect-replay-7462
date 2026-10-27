import { useMemo, useState } from "react";
import { MessageSquare, PanelLeftClose, Plus, Search, Settings, Trash2 } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { useChatStore } from "@/lib/chat/chat-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BrandMark } from "./BrandMark";
import { cn } from "@/lib/utils";

export function SidebarContent({ onCollapse }: { onCollapse?: () => void }) {
  const { conversations, activeId, newChat, selectConversation, clearHistory, simulateFailure, setSimulateFailure } = useChatStore();
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => conversations.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase())),
    [conversations, query],
  );
  const hasSample = conversations.some((c) => c.isSample);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="font-display text-[15px] font-semibold tracking-tight">VisionChat <span className="text-gradient-brand">AI</span></span>
        </div>
        {onCollapse && (
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={onCollapse} aria-label="Collapse sidebar">
            <PanelLeftClose className="size-4" />
          </Button>
        )}
      </div>

      <div className="space-y-2 px-3">
        <Button onClick={newChat} className="w-full justify-start gap-2 bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90">
          <Plus className="size-4" /> New chat
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="h-9 border-sidebar-border bg-sidebar-accent/60 pl-9 text-sm"
          />
        </div>
      </div>

      <nav aria-label="Conversation history" className="mt-4 min-h-0 flex-1 overflow-y-auto px-2">
        <div className="flex items-center justify-between px-2 pb-1.5">
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">History</span>
          {hasSample && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">Sample data</span>}
        </div>
        {filtered.length === 0 ? (
          <div className="mx-2 mt-2 rounded-xl border border-dashed border-sidebar-border px-3 py-6 text-center">
            <MessageSquare className="mx-auto mb-2 size-5 text-muted-foreground" />
            <p className="text-sm font-medium">{query ? "No matches" : "No conversations yet"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{query ? "Try a different search." : "Start a new chat to see it here."}</p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => selectConversation(c.id)}
                  aria-current={c.id === activeId ? "page" : undefined}
                  className={cn(
                    "group flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors hover:bg-sidebar-accent",
                    c.id === activeId && "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                >
                  <span className="truncate text-sm font-medium">{c.title}</span>
                  <span className="text-xs text-muted-foreground">{formatDistanceToNowStrict(new Date(c.updatedAt), { addSuffix: true })}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <div className="space-y-3 border-t border-sidebar-border p-3">
        <div className="flex items-center justify-between rounded-lg bg-sidebar-accent/50 px-3 py-2">
          <Label htmlFor="sim-fail" className="text-xs text-muted-foreground">Demo: simulate failure</Label>
          <Switch id="sim-fail" checked={simulateFailure} onCheckedChange={setSimulateFailure} />
        </div>
        {conversations.length > 0 && (
          <button onClick={clearHistory} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
            <Trash2 className="size-3.5" /> Clear history
          </button>
        )}
        <div className="flex items-center gap-3 px-1">
          <div className="grid size-8 place-items-center rounded-full bg-accent text-xs font-semibold">G</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Guest</p>
            <p className="text-xs text-muted-foreground">Not signed in</p>
          </div>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Settings">
            <Settings className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

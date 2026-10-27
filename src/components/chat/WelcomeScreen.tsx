import { motion } from "framer-motion";
import { FileText, Leaf, ScanSearch, Table2 } from "lucide-react";
import { BrandMark } from "./BrandMark";

const SUGGESTIONS = [
  {
    icon: ScanSearch,
    title: "Describe this image",
    prompt: "Describe what you see in this image in detail.",
  },
  {
    icon: FileText,
    title: "Extract the text",
    prompt: "Extract all readable text from this image.",
  },
  { icon: Table2, title: "Read a chart", prompt: "Summarize the key numbers in this chart." },
  {
    icon: Leaf,
    title: "Identify an object",
    prompt: "What is this, and what should I know about it?",
  },
];

export function WelcomeScreen({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col items-center"
      >
        <BrandMark className="size-12 rounded-2xl" />
        <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          What should we look at?
        </h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          Upload or snap a photo, then ask anything about it.
        </p>
      </motion.div>
      <div className="mt-8 grid w-full gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => (
          <motion.button
            key={s.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.08 + i * 0.05 }}
            onClick={() => onPick(s.prompt)}
            className="group flex items-start gap-3 rounded-xl border border-border bg-card/50 p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-card"
          >
            <s.icon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <span className="block text-sm font-medium">{s.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{s.prompt}</span>
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

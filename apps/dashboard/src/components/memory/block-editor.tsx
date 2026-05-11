"use client";

import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useTheme } from "next-themes";
import type { PartialBlock } from "@blocknote/core";
import { useEffect, useState } from "react";

type Props = {
  initialContent?: PartialBlock[];
  onChange?: (blocks: PartialBlock[]) => void;
  editable?: boolean;
  placeholder?: string;
};

export function BlockEditor({ initialContent, onChange, editable = true }: Props) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const editor = useCreateBlockNote({
    initialContent: initialContent && initialContent.length > 0 ? initialContent : undefined,
  });

  if (!mounted) {
    return <div className="min-h-[24rem] animate-pulse rounded-lg bg-muted/40" aria-hidden />;
  }

  return (
    <div className="bn-host -mx-3">
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        onChange={() => onChange?.(editor.document as PartialBlock[])}
      />
    </div>
  );
}

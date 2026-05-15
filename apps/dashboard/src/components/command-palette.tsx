"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";

const ROUTES = [
  { label: "Dashboard", href: "/dashboard", group: "Navigate" },
  { label: "Queue", href: "/queue", group: "Navigate" },
  { label: "Memory", href: "/memory", group: "Navigate" },
  { label: "Marketing Studio", href: "/studio/marketing", group: "Navigate" },
  { label: "Team", href: "/settings/team", group: "Navigate" },
  { label: "Settings", href: "/settings", group: "Navigate" },
  { label: "Marketplace", href: "/marketplace", group: "Navigate" },
];

// The nav's fake search button dispatches this event to pop the palette open
// without us having to hoist palette state up to a layout-level context.
export const OPEN_COMMAND_PALETTE_EVENT = "bbc:open-command-palette";

export function openCommandPalette() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
  }
}

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    };
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search or jump to..." />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {ROUTES.map((r) => (
            <CommandItem
              key={r.href}
              onSelect={() => {
                router.push(r.href);
                setOpen(false);
              }}
            >
              {r.label}
              <CommandShortcut>→</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

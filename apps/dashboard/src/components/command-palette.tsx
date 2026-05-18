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
  { label: "Ops", href: "/ops", group: "Navigate" },
  { label: "Memory", href: "/memory", group: "Navigate" },
  { label: "Marketing Studio", href: "/studio/marketing", group: "Navigate" },
  { label: "Team", href: "/settings/team", group: "Navigate" },
  { label: "Settings", href: "/settings", group: "Navigate" },
  { label: "Marketplace", href: "/marketplace", group: "Navigate" },
];

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
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

"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Scratch() {
  return (
    <div className="space-y-4 p-8">
      <h2 className="text-2xl font-bold">Button</h2>
      <div className="flex flex-wrap gap-2">
        <Button variant="default">Default</Button>
        <Button variant="brain">Brain (lime)</Button>
        <Button variant="studio">Studio (coral)</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
        <Button disabled>Disabled</Button>
      </div>

      <h2 className="text-2xl font-bold mt-8">Input</h2>
      <div className="max-w-sm space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="brain-dump">Brain dump</Label>
          <Input id="brain-dump" placeholder="Tell us about your company..." />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="founder@startup.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="disabled-input">Disabled</Label>
          <Input id="disabled-input" disabled value="Can't edit this" readOnly />
        </div>
      </div>
    </div>
  );
}

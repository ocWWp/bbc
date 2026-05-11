import { Button } from "@/components/ui/button";

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
    </div>
  );
}

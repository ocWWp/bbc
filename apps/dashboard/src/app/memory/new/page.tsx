import { TypePicker } from "./type-picker";

export const metadata = { title: "New memory item — BBC" };

export default function NewMemoryPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16">
      <header className="space-y-2 pt-4">
        <h1 className="text-3xl font-semibold tracking-tight">What are you creating?</h1>
        <p className="text-sm text-muted-foreground">
          Pick a type — agents query by type, so this choice shapes how it gets used.
        </p>
      </header>
      <TypePicker />
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Supertag } from "@/lib/memory/types";

type FormProps = {
  type: Supertag;
  fields: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

export function TypedForm({ type, fields, onChange }: FormProps) {
  const stateRef = useRef<Record<string, unknown>>({ ...fields });
  const emit = (patch: Record<string, unknown>) => {
    stateRef.current = { ...stateRef.current, ...patch };
    onChange(stateRef.current);
  };

  useEffect(() => {
    stateRef.current = { ...fields };
  }, [fields]);

  switch (type) {
    case "voice":
      return <VoiceForm fields={fields} emit={emit} />;
    case "decision":
      return <DecisionForm fields={fields} emit={emit} />;
    case "glossary":
      return <GlossaryForm fields={fields} emit={emit} />;
    case "vendor":
      return <VendorForm fields={fields} emit={emit} />;
    case "product":
      return <ProductForm fields={fields} emit={emit} />;
    case "team":
      return <TeamForm fields={fields} emit={emit} />;
    case "skill":
      return <SkillForm fields={fields} emit={emit} />;
  }
}

type SubProps = { fields: Record<string, unknown>; emit: (p: Record<string, unknown>) => void };

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground/50",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        "min-h-[3rem] resize-y",
        props.className,
      )}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm shadow-sm transition-colors capitalize",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        props.className,
      )}
    />
  );
}

function ChipList({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="group inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="ml-0.5 opacity-50 transition-opacity hover:opacity-100"
              aria-label="Remove"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <Input
        placeholder={placeholder ?? "Add and press Enter"}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.currentTarget.value.trim()) {
            e.preventDefault();
            const v = e.currentTarget.value.trim();
            onChange([...values, v]);
            e.currentTarget.value = "";
          }
        }}
        className="text-xs"
      />
    </div>
  );
}

function VoiceForm({ fields, emit }: SubProps) {
  return (
    <div className="space-y-3">
      <Field label="Register">
        <Select
          defaultValue={(fields.register as string) ?? "neutral"}
          onChange={(e) => emit({ register: e.target.value })}
        >
          <option value="formal">Formal</option>
          <option value="neutral">Neutral</option>
          <option value="casual">Casual</option>
        </Select>
      </Field>
      <Field label="Audience" hint="Who is this voice for?">
        <Input
          defaultValue={(fields.audience as string) ?? ""}
          onChange={(e) => emit({ audience: e.target.value })}
          placeholder="e.g. busy founders"
        />
      </Field>
      <Field label="Do words" hint="Words this voice gravitates toward">
        <ChipList
          values={(fields.do_words as string[]) ?? []}
          onChange={(v) => emit({ do_words: v })}
          placeholder="ship, compound, durable"
        />
      </Field>
      <Field label="Don't words" hint="Words to avoid">
        <ChipList
          values={(fields.dont_words as string[]) ?? []}
          onChange={(v) => emit({ dont_words: v })}
          placeholder="leverage, synergy, seamless"
        />
      </Field>
      <Field label="Example phrases">
        <ChipList
          values={(fields.example_phrases as string[]) ?? []}
          onChange={(v) => emit({ example_phrases: v })}
        />
      </Field>
    </div>
  );
}

function DecisionForm({ fields, emit }: SubProps) {
  return (
    <div className="space-y-3">
      <Field label="ADR number">
        <Input
          type="number"
          defaultValue={(fields.number as number) ?? ""}
          onChange={(e) => emit({ number: e.target.value ? Number(e.target.value) : undefined })}
          placeholder="0001"
        />
      </Field>
      <Field label="Date">
        <Input
          type="date"
          defaultValue={(fields.date as string) ?? ""}
          onChange={(e) => emit({ date: e.target.value })}
        />
      </Field>
      <Field label="Status">
        <Select
          defaultValue={(fields.status as string) ?? "proposed"}
          onChange={(e) => emit({ status: e.target.value })}
        >
          <option value="proposed">Proposed</option>
          <option value="accepted">Accepted</option>
          <option value="superseded">Superseded</option>
        </Select>
      </Field>
      <Field label="Context">
        <Textarea
          defaultValue={(fields.context as string) ?? ""}
          onChange={(e) => emit({ context: e.target.value })}
          placeholder="What forces are at play?"
          rows={3}
        />
      </Field>
      <Field label="Decision">
        <Textarea
          defaultValue={(fields.decision as string) ?? ""}
          onChange={(e) => emit({ decision: e.target.value })}
          placeholder="What did we decide?"
          rows={3}
        />
      </Field>
      <Field label="Consequences">
        <Textarea
          defaultValue={(fields.consequences as string) ?? ""}
          onChange={(e) => emit({ consequences: e.target.value })}
          placeholder="What becomes easier or harder?"
          rows={3}
        />
      </Field>
    </div>
  );
}

function GlossaryForm({ fields, emit }: SubProps) {
  return (
    <div className="space-y-3">
      <Field label="Term">
        <Input
          defaultValue={(fields.term as string) ?? ""}
          onChange={(e) => emit({ term: e.target.value })}
          placeholder="e.g. supertag"
        />
      </Field>
      <Field label="Pronunciation" hint="Optional">
        <Input
          defaultValue={(fields.pronunciation as string) ?? ""}
          onChange={(e) => emit({ pronunciation: e.target.value })}
          placeholder="SOO-per-tag"
        />
      </Field>
      <Field label="Definition">
        <Textarea
          defaultValue={(fields.definition as string) ?? ""}
          onChange={(e) => emit({ definition: e.target.value })}
          rows={3}
        />
      </Field>
      <Field label="Aliases">
        <ChipList
          values={(fields.aliases as string[]) ?? []}
          onChange={(v) => emit({ aliases: v })}
        />
      </Field>
      <Field label="Domain" hint="Optional category">
        <Input
          defaultValue={(fields.domain as string) ?? ""}
          onChange={(e) => emit({ domain: e.target.value })}
        />
      </Field>
    </div>
  );
}

function VendorForm({ fields, emit }: SubProps) {
  return (
    <div className="space-y-3">
      <Field label="Vendor name">
        <Input
          defaultValue={(fields.vendor_name as string) ?? ""}
          onChange={(e) => emit({ vendor_name: e.target.value })}
          placeholder="e.g. Resend"
        />
      </Field>
      <Field label="Role" hint="What role does it fill?">
        <Input
          defaultValue={(fields.role as string) ?? ""}
          onChange={(e) => emit({ role: e.target.value })}
          placeholder="email-delivery"
        />
      </Field>
      <Field label="Status">
        <Select
          defaultValue={(fields.status as string) ?? "candidate"}
          onChange={(e) => emit({ status: e.target.value })}
        >
          <option value="candidate">Candidate</option>
          <option value="active">Active</option>
          <option value="deprecated">Deprecated</option>
        </Select>
      </Field>
      <Field label="Homepage">
        <Input
          type="url"
          defaultValue={(fields.homepage as string) ?? ""}
          onChange={(e) => emit({ homepage: e.target.value })}
          placeholder="https://"
        />
      </Field>
      <Field label="Pricing URL">
        <Input
          type="url"
          defaultValue={(fields.pricing_url as string) ?? ""}
          onChange={(e) => emit({ pricing_url: e.target.value })}
          placeholder="https://"
        />
      </Field>
      <Field label="Notes">
        <Textarea
          defaultValue={(fields.notes as string) ?? ""}
          onChange={(e) => emit({ notes: e.target.value })}
          rows={3}
        />
      </Field>
    </div>
  );
}

function ProductForm({ fields, emit }: SubProps) {
  return (
    <div className="space-y-3">
      <Field label="Positioning">
        <Textarea
          defaultValue={(fields.positioning as string) ?? ""}
          onChange={(e) => emit({ positioning: e.target.value })}
          rows={2}
        />
      </Field>
      <Field label="Target user">
        <Textarea
          defaultValue={(fields.target_user as string) ?? ""}
          onChange={(e) => emit({ target_user: e.target.value })}
          rows={2}
        />
      </Field>
      <Field label="Competitors">
        <ChipList
          values={(fields.competitors as string[]) ?? []}
          onChange={(v) => emit({ competitors: v })}
        />
      </Field>
      <Field label="Differentiators">
        <ChipList
          values={(fields.differentiators as string[]) ?? []}
          onChange={(v) => emit({ differentiators: v })}
        />
      </Field>
      <Field label="Launch date">
        <Input
          type="date"
          defaultValue={(fields.launch_date as string) ?? ""}
          onChange={(e) => emit({ launch_date: e.target.value })}
        />
      </Field>
    </div>
  );
}

function TeamForm({ fields, emit }: SubProps) {
  return (
    <div className="space-y-3">
      <Field label="Name">
        <Input
          defaultValue={(fields.name as string) ?? ""}
          onChange={(e) => emit({ name: e.target.value })}
        />
      </Field>
      <Field label="Role">
        <Input
          defaultValue={(fields.role as string) ?? ""}
          onChange={(e) => emit({ role: e.target.value })}
        />
      </Field>
      <Field label="Email">
        <Input
          type="email"
          defaultValue={(fields.email as string) ?? ""}
          onChange={(e) => emit({ email: e.target.value })}
        />
      </Field>
      <Field label="Slack handle">
        <Input
          defaultValue={(fields.slack as string) ?? ""}
          onChange={(e) => emit({ slack: e.target.value })}
        />
      </Field>
      <Field label="GitHub">
        <Input
          defaultValue={(fields.github as string) ?? ""}
          onChange={(e) => emit({ github: e.target.value })}
        />
      </Field>
      <Field label="Bio">
        <Textarea
          defaultValue={(fields.bio as string) ?? ""}
          onChange={(e) => emit({ bio: e.target.value })}
          rows={3}
        />
      </Field>
    </div>
  );
}

function SkillForm({ fields, emit }: SubProps) {
  return (
    <div className="space-y-3">
      <Field label="Invocation">
        <Input
          defaultValue={(fields.invocation as string) ?? ""}
          onChange={(e) => emit({ invocation: e.target.value })}
          placeholder="/skill:my-skill"
        />
      </Field>
      <Field label="Extends" hint="Base skill ID, if any">
        <Input
          defaultValue={(fields.extends as string) ?? ""}
          onChange={(e) => emit({ extends: e.target.value })}
        />
      </Field>
      <Field label="When to use">
        <Textarea
          defaultValue={(fields.when_to_use as string) ?? ""}
          onChange={(e) => emit({ when_to_use: e.target.value })}
          rows={3}
        />
      </Field>
      <Field label="Inputs">
        <Textarea
          defaultValue={(fields.inputs as string) ?? ""}
          onChange={(e) => emit({ inputs: e.target.value })}
          rows={2}
        />
      </Field>
      <Field label="Outputs">
        <Textarea
          defaultValue={(fields.outputs as string) ?? ""}
          onChange={(e) => emit({ outputs: e.target.value })}
          rows={2}
        />
      </Field>
      <Field label="Status">
        <Select
          defaultValue={(fields.status as string) ?? "draft"}
          onChange={(e) => emit({ status: e.target.value })}
        >
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="deprecated">Deprecated</option>
        </Select>
      </Field>
    </div>
  );
}

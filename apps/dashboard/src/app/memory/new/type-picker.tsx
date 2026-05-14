"use client";

import { useTransition } from "react";
import { SUPERTAGS, supertagMeta, type Supertag } from "@/lib/memory/types";
import { createBlankItem } from "../actions";

export function TypePicker() {
  const [pending, start] = useTransition();
  return (
    <div className="type-pick-grid">
      {SUPERTAGS.map((t) => {
        const meta = supertagMeta[t];
        return (
          <button
            key={t}
            type="button"
            disabled={pending}
            onClick={() => start(() => { void createBlankItem(t as Supertag); })}
            className="type-pick-card"
            style={{ ["--role-color" as string]: `var(--t-${t})` }}
          >
            <span className="role-glyph">{meta.label[0]}</span>
            <div className="type-pick-meta">
              <div className="type-pick-name">{meta.label}</div>
              <div className="type-pick-hint">{meta.hint}</div>
            </div>
            <span className="type-pick-arrow">→</span>
          </button>
        );
      })}
    </div>
  );
}

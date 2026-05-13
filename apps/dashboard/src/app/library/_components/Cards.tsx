// Card primitives for the Library surface — LibCard (skill/connector/provider)
// and RecCard (recommended band). Visual port of library-card.jsx from the
// Claude Design output bundle.

"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  ROLE_COLOR,
  type LibItem,
  type LibKind,
  type SkillItem,
  type ConnectorItem,
  type ProviderItem,
  type Supertag,
} from "../_data";
import { Icons } from "./Icons";
import { BrandIcon, hasBrandIcon } from "./BrandIcon";

function isSkill(item: LibItem): item is SkillItem {
  return item.kind === "skill";
}
function isConnector(item: LibItem): item is ConnectorItem {
  return item.kind === "connector";
}
function isProvider(item: LibItem): item is ProviderItem {
  return item.kind === "provider";
}

function roleColorFor(item: LibItem): string {
  if (isSkill(item)) return ROLE_COLOR[item.role] ?? "var(--ink)";
  if (isConnector(item)) return "var(--t-source_artifact)";
  return "var(--ink)";
}

function isInstalled(item: LibItem): boolean {
  if (isProvider(item)) return item.connected;
  return item.installed;
}

type TagColorStyle = CSSProperties & { "--tag-color"?: string };
type RoleColorStyle = CSSProperties & { "--role-color"?: string };

export function SchemaChip({
  name,
  direction,
}: {
  name: string;
  direction?: "reads" | "writes";
}) {
  const isMappedAny = name === "any (mapped)" || name === "any (frontmatter)";
  const tagColor = isMappedAny
    ? "var(--muted)"
    : `var(--t-${name})`;
  const style: TagColorStyle = { "--tag-color": tagColor };
  return (
    <span className="schema-chip" style={style}>
      <span className="dot" />
      {direction && <span className="direction">{direction}</span>}
      {name}
    </span>
  );
}

export type LibCardProps = {
  item: LibItem;
  focused?: boolean;
  installingId?: string | null;
  onOpen: (item: LibItem) => void;
  onInstall: (item: LibItem) => void;
};

export function LibCard({ item, focused, installingId, onOpen, onInstall }: LibCardProps) {
  const installed = isInstalled(item);
  const installing = installingId === item.id;
  const roleColor = roleColorFor(item);
  const style: RoleColorStyle = { "--role-color": roleColor };

  return (
    <div
      className={`lib-card ${focused ? "is-focused" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(item);
        }
      }}
      style={style}
    >
      {"badge" in item && item.badge ? (
        <span className={`corner ${item.badge}`}>{item.badge}</span>
      ) : null}
      <div className="glyph">
        {hasBrandIcon(item.name) ? (
          <BrandIcon name={item.name} size={20} />
        ) : (
          item.glyph
        )}
      </div>
      <div className="head">
        <div className="nm">{item.name}</div>
        <div className="by">
          <span className="bb">{item.author}</span>
          {isSkill(item) && <> · <span>{item.role}</span></>}
          {isConnector(item) && <> · <span>{item.source}</span></>}
          {isProvider(item) && <> · <span>{item.role}</span></>}
        </div>
      </div>

      <p className="desc">{item.desc}</p>

      <div className="schema">
        {isSkill(item) && (
          <>
            <span className="lab">reads:</span>
            {item.reads.map((r) => (
              <SchemaChip key={"r" + r} name={r} />
            ))}
            {item.writes.length > 0 && (
              <>
                <span className="lab" style={{ marginLeft: 4 }}>
                  writes:
                </span>
                {item.writes.map((w) => (
                  <SchemaChip key={"w" + w} name={w} />
                ))}
              </>
            )}
          </>
        )}
        {isConnector(item) && (
          <>
            <span className="lab">writes:</span>
            {item.writes.map((w) => (
              <SchemaChip key={w} name={w} />
            ))}
          </>
        )}
        {isProvider(item) && (
          <span className="schema-chip" style={{ "--tag-color": "var(--ink)" } as TagColorStyle}>
            <span className="dot" />
            role · {item.role}-provider
          </span>
        )}
      </div>

      <div className="foot">
        <div className="meta">
          {isSkill(item) && (
            <>
              <span>{item.license}</span>
              <span className="sep">·</span>
              <span>★ {item.stars}</span>
            </>
          )}
          {isConnector(item) && (
            <>
              <span>{item.license}</span>
              <span className="sep">·</span>
              <span>src · {item.source}</span>
            </>
          )}
          {isProvider(item) && <span>env · {item.env}</span>}
        </div>
        <button
          type="button"
          className={`install ${installed ? "is-installed" : ""} ${installing ? "is-installing" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onInstall(item);
          }}
          aria-label={`${installed ? "Open" : "Install"} ${item.name}`}
        >
          {installing ? (
            <>
              <span className="lib-spinner" /> installing…
            </>
          ) : installed ? (
            <>
              <Icons.check /> {isProvider(item) ? "connected" : "installed"}
            </>
          ) : (
            "install"
          )}
        </button>
      </div>
    </div>
  );
}

export type RecCardProps = {
  item: LibItem;
  why: ReactNode;
  onOpen: (item: LibItem) => void;
  onInstall: (item: LibItem) => void;
};

export function RecCard({ item, why, onOpen, onInstall }: RecCardProps) {
  const roleColor = roleColorFor(item);
  const style: RoleColorStyle = { "--role-color": roleColor };
  return (
    <div className="rec-card" style={style} onClick={() => onOpen(item)}>
      <div className="glyph">
        {hasBrandIcon(item.name) ? (
          <BrandIcon name={item.name} size={16} />
        ) : (
          item.glyph
        )}
      </div>
      <div>
        <div className="nm">
          {item.name}
          <span className="kind">· {item.kind}</span>
        </div>
      </div>
      <div className="why-line">
        <strong>Why this?</strong> {why}
      </div>
      <div className="foot">
        <span className="by mono" style={{ fontSize: 11, color: "var(--muted)" }}>
          by {item.author}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={(e) => {
            e.stopPropagation();
            onInstall(item);
          }}
        >
          install
        </button>
      </div>
    </div>
  );
}

export function readsFor(item: LibItem): Supertag[] {
  if (isSkill(item)) return item.reads;
  return [];
}

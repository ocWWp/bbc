import type { CSSProperties } from "react";
import type { SupertagKey } from "./data";

type Props = {
  name: SupertagKey;
  size?: "lg";
  active?: boolean;
  clickable?: boolean;
  onClick?: () => void;
};

export function Tag({ name, size, active, clickable, onClick }: Props) {
  return (
    <span
      className={`tag ${size === "lg" ? "lg" : ""} ${active ? "is-active" : ""} ${clickable ? "is-clickable" : ""}`}
      style={{ ["--tag-color" as string]: `var(--t-${name})` } as CSSProperties}
      onClick={onClick}
    >
      <span className="dot" />
      {name}
    </span>
  );
}

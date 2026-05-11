import { avatarGradient } from "./utils";

type Props = {
  seed: string;
  initial: string;
  size?: number;
  shape?: "circle" | "rounded" | "square";
};

export function Avatar({ seed, initial, size = 40, shape = "circle" }: Props) {
  const { from, to } = avatarGradient(seed);
  const radius =
    shape === "circle" ? "9999px" : shape === "rounded" ? "30%" : "12%";
  return (
    <div
      aria-hidden
      className="shrink-0 inline-flex items-center justify-center font-semibold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(135deg, ${from}, ${to})`,
        fontSize: size * 0.42,
        letterSpacing: "-0.02em",
        boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.06)",
      }}
    >
      {initial}
    </div>
  );
}

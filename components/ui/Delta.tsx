import { tone } from "@/lib/format";

const TONE_CLASS = {
  pos: "text-pos",
  neg: "text-neg",
  flat: "text-mute",
} as const;

export function Delta({
  value,
  format,
  className = "",
}: {
  value: number;
  format: (v: number) => string;
  className?: string;
}) {
  return (
    <span className={`font-mono tnum ${TONE_CLASS[tone(value)]} ${className}`}>
      {format(value)}
    </span>
  );
}

export function deltaToneClass(v: number): string {
  return TONE_CLASS[tone(v)];
}

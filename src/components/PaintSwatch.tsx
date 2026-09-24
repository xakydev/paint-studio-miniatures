import { readableTextOn } from "../lib/color";

interface PaintSwatchProps {
  hex: string;
  /** Texto corto sobre el color, normalmente la referencia. */
  label?: string;
  size?: "sm" | "md" | "lg";
  title?: string;
}

const SIZE_CLASS = {
  sm: "h-8 w-8 text-[9px]",
  md: "h-12 w-12 text-[10px]",
  lg: "h-20 w-full text-xs",
} as const;

export function PaintSwatch({ hex, label, size = "md", title }: PaintSwatchProps) {
  return (
    <div
      className={`${SIZE_CLASS[size]} flex shrink-0 items-end justify-start rounded-md border border-white/15 p-1 font-mono leading-none shadow-inner`}
      style={{ backgroundColor: hex, color: readableTextOn(hex) }}
      title={title ?? hex}
    >
      {label}
    </div>
  );
}

import { code128Widths } from "@/lib/barcode/code128";

const QUIET_ZONE = 10;

/**
 * Code 128 barcode as SVG. Always black bars on white with a quiet zone,
 * whatever the theme: scanners need that contrast, so these colors are
 * deliberately not theme tokens.
 */
export function Barcode({
  value,
  height = 48,
  className,
}: {
  value: string;
  height?: number;
  className?: string;
}) {
  const widths = code128Widths(value);
  const total = widths.reduce((sum, width) => sum + width, 0) + QUIET_ZONE * 2;
  const bars: { x: number; width: number }[] = [];
  let x = QUIET_ZONE;
  widths.forEach((width, index) => {
    if (index % 2 === 0) bars.push({ x, width });
    x += width;
  });

  return (
    <svg
      role="img"
      aria-label={`Barcode for ${value}`}
      viewBox={`0 0 ${total} ${height}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className={className}
      style={{ background: "#FFFFFF" }}
    >
      <rect width={total} height={height} fill="#FFFFFF" />
      {bars.map((bar) => (
        <rect key={bar.x} x={bar.x} y={0} width={bar.width} height={height} fill="#000000" />
      ))}
    </svg>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui";

const HEIGHT = 180;

/** Fills the whole canvas white, whatever transform is in effect. */
function paintWhite(canvas: HTMLCanvasElement | null) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/**
 * A box to sign in with a finger, stylus or mouse. The drawing goes into a
 * hidden PNG field. Like barcodes, the signature is always black on white
 * (it's part of the signed record, not themed). People who can't draw can
 * use their typed name as the signature instead.
 */
export function SignaturePad({
  id,
  printedNameInputId,
}: {
  id: string;
  /** The printed-name field, for "Use my typed name instead". */
  printedNameInputId: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  // Kept in state: React re-applies a hidden input's defaultValue on every
  // render, which would wipe a value set directly on the element.
  const [image, setImage] = useState("");
  const hasInk = image !== "";

  function context() {
    return canvasRef.current?.getContext("2d") ?? null;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * ratio);
    canvas.height = Math.round(HEIGHT * ratio);
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#000000";
    paintWhite(canvas);
  }, []);

  function save() {
    if (canvasRef.current) setImage(canvasRef.current.toDataURL("image/png"));
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function clear() {
    paintWhite(canvasRef.current);
    setImage("");
  }

  function useTypedName() {
    const name = (
      document.getElementById(printedNameInputId) as HTMLInputElement | null
    )?.value.trim();
    const canvas = canvasRef.current;
    const ctx = context();
    if (!name || !canvas || !ctx) return;
    paintWhite(canvasRef.current);
    const width = canvas.clientWidth;
    let size = 44;
    ctx.fillStyle = "#000000";
    do {
      ctx.font = `italic ${size}px Georgia, "Times New Roman", serif`;
      size -= 2;
    } while (ctx.measureText(name).width > width - 32 && size > 14);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, width / 2, HEIGHT / 2);
    save();
  }

  return (
    <div className="flex flex-col gap-2">
      <p id={`${id}-label`} className="font-semibold">
        Signature
      </p>
      <canvas
        ref={canvasRef}
        id={id}
        role="img"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-status`}
        className="border-border rounded-theme w-full touch-none border"
        style={{ height: HEIGHT, cursor: "crosshair" }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const ctx = context();
          const { x, y } = point(event);
          ctx?.beginPath();
          ctx?.moveTo(x, y);
          // A tap leaves a dot.
          ctx?.lineTo(x + 0.1, y + 0.1);
          ctx?.stroke();
          drawing.current = true;
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const ctx = context();
          const { x, y } = point(event);
          ctx?.lineTo(x, y);
          ctx?.stroke();
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          save();
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      <input type="hidden" name="signature" value={image} />
      <p id={`${id}-status`} className="text-muted" aria-live="polite">
        {hasInk
          ? "Signature ready."
          : "Sign in the box with a finger, stylus or mouse. The date is added when you sign."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass("secondary")} onClick={clear}>
          Clear signature
        </button>
        <button type="button" className={buttonClass("secondary")} onClick={useTypedName}>
          Use my typed name instead
        </button>
      </div>
    </div>
  );
}

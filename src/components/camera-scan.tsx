"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClass } from "./ui";

/** The parts of the browser's BarcodeDetector we use (not in TypeScript's DOM types yet). */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorClass {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

function detectorClass(): BarcodeDetectorClass | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector ?? null;
}

/** Item labels are Code 128. */
const FORMATS = ["code_128"];

/**
 * "Scan with camera": reads an item's barcode with the device camera using the
 * browser's BarcodeDetector. Shows nothing where the browser can't read Code
 * 128 (a USB scanner or typing still works there). The code goes to
 * `onCode`, or into the input `targetId` names, whose form is then submitted.
 */
export function CameraScanButton({
  targetId,
  onCode,
  label = "Scan with camera",
}: {
  targetId?: string;
  onCode?: (code: string) => void;
  label?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Kept in a ref so a parent re-rendering with a new function doesn't restart the camera.
  const deliver = useRef<(code: string) => void>(() => {});
  useEffect(() => {
    deliver.current = (code) => {
      if (onCode) {
        onCode(code);
        return;
      }
      const input = targetId
        ? (document.getElementById(targetId) as HTMLInputElement | null)
        : null;
      if (input) {
        input.value = code;
        input.form?.requestSubmit();
      }
    };
  }, [onCode, targetId]);

  useEffect(() => {
    const Detector = detectorClass();
    if (!Detector || !navigator.mediaDevices?.getUserMedia) return;
    let cancelled = false;
    Detector.getSupportedFormats()
      .then((formats) => {
        if (!cancelled) setSupported(FORMATS.every((format) => formats.includes(format)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    const Detector = detectorClass();
    if (!open || !dialog || !Detector) return;
    if (!dialog.open) dialog.showModal();

    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const detector = new Detector({ formats: FORMATS });

    const finish = (code: string | null) => {
      if (stopped) return;
      stopped = true;
      setOpen(false);
      if (code) deliver.current(code);
    };

    const look = async () => {
      if (stopped) return;
      const video = videoRef.current;
      try {
        if (video && video.readyState >= 2) {
          const [found] = await detector.detect(video);
          const code = found?.rawValue.trim().toUpperCase();
          if (code) return finish(code);
        }
      } catch {
        // A frame that can't be read yet; try the next one.
      }
      timer = setTimeout(look, 150);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(async (media) => {
        if (stopped) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        const video = videoRef.current;
        if (video) {
          video.srcObject = media;
          await video.play().catch(() => {});
        }
        void look();
      })
      .catch(() => {
        setError("The camera couldn't be opened. Allow camera access, or type the code instead.");
      });

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (dialog.open) dialog.close();
    };
  }, [open]);

  if (!supported) return null;

  return (
    <>
      <button
        type="button"
        className={buttonClass("secondary")}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open ? (
        <dialog
          ref={dialogRef}
          aria-label="Scan a barcode with the camera"
          onClose={() => setOpen(false)}
          className="rounded-theme border-border bg-surface text-text m-auto w-[min(32rem,calc(100vw-2rem))] border p-4 backdrop:bg-text/60"
        >
          <p className="mb-2 font-semibold">Point the camera at the item&apos;s barcode</p>
          <video
            ref={videoRef}
            muted
            playsInline
            className="rounded-theme bg-text w-full"
            aria-label="Camera view"
          />
          {error ? (
            <p role="alert" className="text-bad mt-2">
              {error}
            </p>
          ) : null}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className={buttonClass("secondary")}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </dialog>
      ) : null}
    </>
  );
}

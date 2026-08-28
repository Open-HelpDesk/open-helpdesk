"use client";

/**
 * ST-01 — Workspace logo and favicon.
 *
 * These two controls were drawn but inert: a square holding the workspace
 * initial and a dashed area that opened onto nothing. They now upload a real
 * file, read by `saveGeneral`.
 *
 * Two deliberate choices:
 *
 *  · The local preview is what separates a file input from a usable control.
 *    Without it, you pick an image, nothing moves, and you cannot tell whether
 *    the click registered until you have saved.
 *  · The dashed area takes a dropped file as well as a click. A dashed box
 *    that reads "drop a file" and only answers to clicks is what made this
 *    control look broken on the onboarding step, where it is now reused.
 *  · Remove does not trigger anything on its own. The screen has a single save
 *    bar, and everything done there applies when it is actioned: a button that
 *    submitted the form by itself would carry along the name or the
 *    language just changed without saving them. The removal is therefore a
 *    state, carried by a hidden field, and a second click cancels it.
 */
import { useRef, useState, type CSSProperties, type DragEvent } from "react";
import { useT } from "@/i18n/client";

type Props = {
  /** Field name, read by the server action: "logo" or "favicon". */
  name: "logo" | "favicon";
  /** The already saved URL, or null for the workspace initial. */
  current: string | null;
  /** Fallback initial, when no file is in place. */
  initial: string;
  /** Background of the preview square — the tenant accent for the logo. */
  background: string;
  /** Types accepted by the browser file picker. */
  accept: string;
  label: string;
  replaceLabel: string;
  removeLabel: string;
  hint: string;
  /**
   * What to say about a file refused here, when the shared wording does not fit.
   * The settings screen carries both fields, so its message names both; the
   * onboarding step has no favicon and would be talking about something absent.
   */
  rejectLabel?: string;
};

/**
 * The same ceiling as MAX_BRAND_BYTES, restated rather than imported: that
 * constant sits next to the S3 client, which has no business in a browser
 * bundle. The server stays the authority — this only spares a round trip.
 */
const MAX_BYTES = 2 * 1024 * 1024;

export function BrandAssetField({
  name,
  current,
  initial,
  background,
  accept,
  label,
  replaceLabel,
  removeLabel,
  hint,
  rejectLabel,
}: Props) {
  const t = useT();
  // The local object URL is not revoked: the component lives for as long as the
  // screen does, and revoking it would empty the preview on the next render.
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<"format" | "size" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const shown = preview ?? (removed ? null : current);
  const isFavicon = name === "favicon";

  function choose(file: File) {
    setRejected(null);
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
    // Picking a file cancels a requested removal: you replace, you do not
    // remove and then put back.
    setRemoved(false);
  }

  /**
   * Does `accept` cover this file?
   *
   * Entries are either a MIME type or an extension — the favicon field lists
   * `.ico` precisely because browsers disagree on the type they report for an
   * icon (`image/x-icon`, `image/vnd.microsoft.icon`, sometimes nothing). A
   * MIME-only comparison would refuse on the drop a file the click and the
   * server both take.
   */
  function accepted(file: File) {
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return accept
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .some((entry) => (entry.startsWith(".") ? name.endsWith(entry) : entry === type));
  }

  /**
   * A dropped file has to reach the input, not only the preview: the form
   * submits `input.files`, so a preview on its own would show a logo and upload
   * nothing. `accept` does not filter a programmatic assignment either, hence
   * the two checks — the ones the server applies.
   */
  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    const input = inputRef.current;
    if (!file || !input) return;
    if (!accepted(file)) return setRejected("format");
    if (file.size > MAX_BYTES) return setRejected("size");
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    choose(file);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-semibold" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
        {label}
      </span>
      <div className="flex items-center" style={{ gap: 11 }}>
        <span
          className="flex items-center justify-center overflow-hidden font-bold"
          style={{
            width: 46,
            height: 46,
            flex: "none",
            borderRadius: 10,
            fontSize: isFavicon ? 15 : 19,
            // A file in place fills the whole square: the accent background and
            // the initial no longer have to show behind it.
            background: shown ? "var(--sunk)" : background,
            color: isFavicon ? "var(--ink)" : "#fff",
            ...(shown || isFavicon ? { border: "1px solid var(--line)" } : {}),
          }}
        >
          {shown ? (
            /* eslint-disable-next-line @next/next/no-img-element --
               an SVG or an ICO uploaded by the tenant has no business in the
               image optimizer, which does not process them. */
            <img
              src={shown}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : (
            initial
          )}
        </span>

        {/* The mockup's dashed area IS the control: a `label` that wraps the
            input, rather than a button that would click it in JavaScript. The
            click is then native, the input is properly labeled, and the focus
            shows on the box — an `sr-only` input would take the focus
            off-screen.

            Hover and focus are the ones the mockup gives its dashed "+ add"
            boxes: rule and label at the accent color, 2px ring. The radius
            follows the neighboring preview square (10) and not Tailwind's
            `rounded-lg`, which is 8 and misaligned the two corners side by side. */}
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          className="ohd-hover-edge-ink ohd-focus flex flex-1 cursor-pointer items-center justify-center border border-dashed px-2"
          style={{
            height: 46,
            borderRadius: 10,
            // Dragging over the box answers on the box itself: without that, a
            // zone that takes a file looks exactly like one that will hand it to
            // the browser and navigate away from the form.
            borderColor: dragging ? "var(--acc)" : "var(--line)",
            background: dragging ? "var(--acc-t)" : undefined,
            fontSize: 12.5,
            // --ink-2 at rest, not --ink-3: at the palest tint the box read as
            // decoration, which is what made the onboarding step look like it
            // took nothing. It has to look like a control before it is hovered.
            color: rejected ? "var(--dang)" : "var(--ink-2)",
            gap: 6,
          }}
        >
          {/* The glyph the mockup puts on its dashed boxes — the shortest way to
              say "something goes in here". Hidden once a file is named: the name
              is then the message. */}
          {!fileName && (
            <span aria-hidden style={{ fontSize: 14, lineHeight: 1, color: "var(--ink-3)" }}>
              +
            </span>
          )}
          <span className="truncate">{fileName ?? replaceLabel}</span>
          <input
            ref={inputRef}
            type="file"
            name={name}
            accept={accept}
            aria-label={label}
            className="sr-only"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) choose(f);
            }}
          />
        </label>

        {removed && <input type="hidden" name={`remove-${name}`} value="1" />}

        {/* Remove only concerns a file that is ALREADY saved: a local preview is
            abandoned by not saving. */}
        {current && !preview && (
          <button
            type="button"
            onClick={() => setRemoved((v) => !v)}
            aria-pressed={removed}
            aria-label={removeLabel}
            title={removeLabel}
            className="ohd-row grid place-items-center border"
            style={{
              width: 30,
              height: 30,
              flex: "none",
              borderRadius: 6,
              borderColor: removed ? "var(--dang)" : "var(--line)",
              color: removed ? "var(--dang)" : "var(--ink-3)",
              // 30×30 icon button from the mockup: --sunk on hover. The
              // background of the "removal requested" state goes through
              // --row-bg so that hover stays perceptible — as an inline style it
              // would have masked it.
              "--row-bg": removed ? "var(--dang-t)" : "transparent",
              fontSize: 13,
            } as CSSProperties}
          >
            {removed ? "↺" : "✕"}
          </button>
        )}
      </div>
      <span
        // A refused drop says so where the hint already is, and stays until the
        // next pick: silence would read as "the file went through".
        role={rejected ? "alert" : undefined}
        style={{ fontSize: 12, color: removed || rejected ? "var(--dang)" : "var(--ink-3)" }}
      >
        {rejected === "format"
          ? (rejectLabel ?? t("app.settings.workspace.generalAssetFormatError"))
          : rejected === "size"
            ? (rejectLabel ?? t("app.settings.workspace.generalAssetSizeError"))
            : removed
              ? t("app.settings.workspace.generalAssetRemoved")
              : fileName
                ? t("app.settings.workspace.generalAssetPending")
                : hint}
      </span>
    </div>
  );
}

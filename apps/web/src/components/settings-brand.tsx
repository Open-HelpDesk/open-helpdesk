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
 *  · Remove does not trigger anything on its own. The screen has a single save
 *    bar, and everything done there applies when it is actioned: a button that
 *    submitted the form by itself would carry along the name or the
 *    language just changed without saving them. The removal is therefore a
 *    state, carried by a hidden field, and a second click cancels it.
 */
import { useState, type CSSProperties } from "react";
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
};

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
}: Props) {
  const t = useT();
  // The local object URL is not revoked: the component lives for as long as the
  // screen does, and revoking it would empty the preview on the next render.
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);

  const shown = preview ?? (removed ? null : current);
  const isFavicon = name === "favicon";

  function choose(file: File) {
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
    // Picking a file cancels a requested removal: you replace, you do not
    // remove and then put back.
    setRemoved(false);
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
          className="ohd-hover-edge-ink ohd-focus flex flex-1 cursor-pointer items-center justify-center border border-dashed px-2"
          style={{
            height: 46,
            borderRadius: 10,
            borderColor: "var(--line)",
            fontSize: 12.5,
            color: fileName ? "var(--ink-2)" : "var(--ink-3)",
          }}
        >
          <span className="truncate">{fileName ?? replaceLabel}</span>
          <input
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
      <span style={{ fontSize: 12, color: removed ? "var(--dang)" : "var(--ink-3)" }}>
        {removed
          ? t("app.settings.workspace.generalAssetRemoved")
          : fileName
            ? t("app.settings.workspace.generalAssetPending")
            : hint}
      </span>
    </div>
  );
}

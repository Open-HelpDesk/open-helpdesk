"use client";

/** AG-07 — Drawers and confirmations of the contact panel (creation, merge, GDPR). */
import { useState } from "react";
import { useT } from "@/i18n/client";
import { createContact, deleteContactRgpd, mergeContacts } from "./actions";

function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      style={{ background: "var(--scrim-drawer)" }}
      onClick={onClose}
    >
      <div
        className="ohd-rise-fast flex h-full w-full max-w-sm flex-col border-l p-5 shadow-xl"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[15px] font-semibold">{title}</p>
          <button type="button" onClick={onClose} style={{ color: "var(--ink-3)" }}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const fieldStyle = {
  height: 34,
  borderRadius: 6,
  border: "1px solid var(--line)",
  background: "var(--bg)",
  fontSize: 13,
  padding: "0 10px",
  width: "100%",
} as const;

export function NewContactButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center font-semibold"
        style={{
          color: "var(--on-brand)",
          height: 30,
          padding: "0 12px",
          borderRadius: 6,
          background: "var(--acc)",
          fontSize: 12.5,
        }}
      >
        {t("app.contacts.newContactButton")}
      </button>
      {open && (
        <Drawer title={t("app.contacts.newContactTitle")} onClose={() => setOpen(false)}>
          <form action={createContact} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[12.5px] font-medium">
              {t("app.contacts.fieldEmail")}
              <input name="email" type="email" required style={fieldStyle} />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px] font-medium">
              {t("app.contacts.name")}
              <input name="name" style={fieldStyle} />
            </label>
            <button
              type="submit"
              className="mt-1 rounded-md px-4 py-2 text-[13px] font-semibold"
              style={{ color: "var(--on-brand)", background: "var(--acc)" }}
            >
              {t("app.contacts.createSubmit")}
            </button>
          </form>
        </Drawer>
      )}
    </>
  );
}

/** Detail panel chip (design): padding 4px 9px, radius 5, 12px ink-2, no background. */
const chipStyle = {
  padding: "4px 9px",
  borderRadius: 5,
  border: "1px solid var(--line)",
  color: "var(--ink-2)",
  fontSize: 12,
} as const;

export function MergeContactButton({
  keepId,
  keepLabel,
  candidates,
}: {
  keepId: string;
  keepLabel: string;
  candidates: { id: string; label: string }[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [introBefore, introAfter] = t.parts("app.contacts.mergeIntro", "contact");
  return (
    <>
      <button type="button" style={chipStyle} onClick={() => setOpen(true)}>
        {t("app.contacts.mergeTitle")}
      </button>
      {open && (
        <Drawer title={t("app.contacts.mergeTitle")} onClose={() => setOpen(false)}>
          <p className="mb-3 text-[12.5px]" style={{ color: "var(--ink-2)" }}>
            {introBefore}
            <strong>{keepLabel}</strong>
            {introAfter}
          </p>
          <form action={mergeContacts} className="flex flex-col gap-3">
            <input type="hidden" name="keepId" value={keepId} />
            <label className="flex flex-col gap-1 text-[12.5px] font-medium">
              {t("app.contacts.mergeSourceLabel")}
              <select name="sourceId" required defaultValue="" style={fieldStyle}>
                <option value="" disabled>
                  {t("app.contacts.mergeChoosePlaceholder")}
                </option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="mt-1 rounded-md px-4 py-2 text-[13px] font-semibold"
              style={{ color: "var(--on-brand)", background: "var(--acc)" }}
            >
              {t("app.contacts.mergeSubmit")}
            </button>
          </form>
        </Drawer>
      )}
    </>
  );
}

export function DeleteRgpdButton({ contactId }: { contactId: string }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button
        type="button"
        style={{ ...chipStyle, borderColor: "var(--dang)", color: "var(--dang)" }}
        onClick={() => setConfirming(true)}
      >
        {t("app.contacts.deleteRgpd")}
      </button>
    );
  }
  return (
    <form action={deleteContactRgpd} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="contactId" value={contactId} />
      <button
        type="submit"
        style={{
          ...chipStyle,
          background: "var(--dang)",
          borderColor: "var(--dang)",
          color: "#fff",
        }}
      >
        {t("app.contacts.deleteConfirm")}
      </button>
      <button type="button" style={chipStyle} onClick={() => setConfirming(false)}>
        {t("app.contacts.cancel")}
      </button>
    </form>
  );
}

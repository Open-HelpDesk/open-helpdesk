"use client";

/**
 * AG-04 — Composer: Reply / Internal note tabs, timestamped localStorage draft,
 * markdown toolbar B I U S ≔ ⛓ ❝ ‹›, "/ Macros" menu, {{var}} variables,
 * "Send & {status} | ▾" split button (Resolved / Waiting / Open / no change).
 */
import { useEffect, useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { STATUS_KEYS } from "@/lib/format";
import { useT } from "@/i18n/client";
import { sendReply } from "../actions";

/**
 * The two ceilings this composer enforces. Restated rather than imported:
 * MAX_ATTACHMENT_BYTES lives next to the S3 client, which has no business in a
 * browser bundle, and the per-message one is the Server Action body limit set in
 * next.config.ts. Both are enforced again on the server.
 */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;

export type MacroOption = {
  id: string;
  name: string;
  category: string | null;
  insertText: string;
  insertKind: "public_reply" | "internal_note";
  setStatus: string;
  hasServerActions: boolean;
};

const SEND_STATUSES = ["resolved", "waiting", "open", ""] as const;

export function ReplyEditor({
  ticketId,
  ticketNumber,
  contactName,
  macros,
}: {
  ticketId: string;
  ticketNumber: number;
  contactName: string;
  macros: MacroOption[];
}) {
  const t = useT();
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"public_reply" | "internal_note">("public_reply");
  const [nextStatus, setNextStatus] = useState("resolved");
  const [appliedMacroId, setAppliedMacroId] = useState("");
  const [statusMenu, setStatusMenu] = useState(false);
  const [macroMenu, setMacroMenu] = useState(false);
  const [varMenu, setVarMenu] = useState(false);
  const [attachError, setAttachError] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftKey = `ohd-draft-${ticketId}`;

  function sendLabel(status: string): string {
    if (!status) return t("app.ticket.send");
    const key = STATUS_KEYS[status];
    return t("app.ticket.sendAndStatus", { status: key ? t(key) : status });
  }

  const VARIABLES = [
    { key: "{{contact.prenom}}", label: t("app.ticket.varContactFirstName") },
    { key: "{{contact.name}}", label: t("app.ticket.varContactName") },
    { key: "{{ticket.number}}", label: t("app.ticket.varTicketNumber") },
  ];

  // Draft: restored on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as { body: string; at: number };
        if (draft.body) {
          setBody(draft.body);
          setDraftSavedAt(draft.at);
        }
      }
    } catch {
      /* unreadable draft */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  // Draft: debounced save + clock for the label.
  useEffect(() => {
    if (!body) return;
    const timer = setTimeout(() => {
      const at = Date.now();
      try {
        localStorage.setItem(draftKey, JSON.stringify({ body, at }));
        setDraftSavedAt(at);
      } catch {
        /* storage full */
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

  useEffect(() => {
    const timer = setInterval(() => forceTick((x) => x + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  function draftLabel(): string | null {
    if (!draftSavedAt || !body) return null;
    const sec = Math.max(1, Math.round((Date.now() - draftSavedAt) / 1000));
    if (sec < 60) return t("app.ticket.draftSavedSeconds", { count: sec });
    return t("app.ticket.draftSavedMinutes", { count: Math.floor(sec / 60) });
  }

  /** Inserts markdown around the textarea selection. */
  function insertMd(before: string, after = "", placeholder = "") {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const selectedText = body.slice(start, end) || placeholder;
    const next = body.slice(0, start) + before + selectedText + after + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    });
  }

  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? body.length;
    setBody(body.slice(0, start) + text + body.slice(start));
    requestAnimationFrame(() => el?.focus());
  }

  function applyMacro(macroId: string) {
    const macro = macros.find((m) => m.id === macroId);
    if (!macro) return;
    const firstName = contactName.split(/\s+/)[0] ?? contactName;
    const rendered = macro.insertText
      .replaceAll("{{contact.name}}", contactName)
      .replaceAll("{{contact.nom}}", contactName)
      .replaceAll("{{contact.prenom}}", firstName)
      .replaceAll("{{ticket.number}}", String(ticketNumber));
    setBody((prev) => (prev ? `${prev}\n${rendered}` : rendered));
    setKind(macro.insertKind);
    if (macro.setStatus) setNextStatus(macro.setStatus);
    if (macro.hasServerActions || macro.setStatus) setAppliedMacroId(macro.id);
    setMacroMenu(false);
  }

  const isNote = kind === "internal_note";

  // Design: 26×26 buttons radius 5, h26 chips padding 0 8px, everything in 12px ink-2.
  const toolBtn = {
    width: 26,
    height: 26,
    borderRadius: 5,
    color: "var(--ink-2)",
    fontSize: 12,
  } as const;
  const toolChip = {
    height: 26,
    padding: "0 8px",
    borderRadius: 5,
    color: "var(--ink-2)",
    fontSize: 12,
  } as const;
  const editorLine = isNote ? "var(--note-line)" : "var(--line)";
  const editorBg = isNote ? "var(--note)" : "var(--bg)";
  const sendBg = isNote ? "var(--wait)" : "var(--acc)";
  const tabStyle = (active: boolean, note: boolean) =>
    ({
      padding: "6px 12px",
      borderRadius: "6px 6px 0 0",
      fontSize: 13,
      fontWeight: 600,
      color: active ? (note ? "var(--wait)" : "var(--ink)") : "var(--ink-3)",
      background: active ? (note ? "var(--note)" : "var(--bg)") : "transparent",
      border: `1px solid ${active ? (note ? "var(--note-line)" : "var(--line)") : "transparent"}`,
      borderBottom: "none",
    }) as const;

  const mdText = t("app.ticket.mdPlaceholderText");
  const TOOLBAR: { label: string; title: string; run: () => void }[] = [
    { label: "B", title: t("app.ticket.mdBold"), run: () => insertMd("**", "**", mdText) },
    { label: "I", title: t("app.ticket.mdItalic"), run: () => insertMd("*", "*", mdText) },
    { label: "U", title: t("app.ticket.mdUnderline"), run: () => insertMd("<u>", "</u>", mdText) },
    { label: "S", title: t("app.ticket.mdStrike"), run: () => insertMd("~~", "~~", mdText) },
    {
      label: "≔",
      title: t("app.ticket.mdList"),
      run: () => insertMd("\n- ", "", t("app.ticket.mdPlaceholderItem")),
    },
    { label: "⛓", title: t("app.ticket.mdLink"), run: () => insertMd("[", "](https://)", mdText) },
    {
      label: "❝",
      title: t("app.ticket.mdQuote"),
      run: () => insertMd("\n> ", "", t("app.ticket.mdPlaceholderQuote")),
    },
    {
      label: "‹›",
      title: t("app.ticket.mdCode"),
      run: () => insertMd("`", "`", t("app.ticket.mdPlaceholderCode")),
    },
  ];

  return (
    <form
      action={sendReply}
      onSubmit={() => {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* ignored */
        }
      }}
      className="shrink-0 border-t"
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="macroId" value={appliedMacroId} />
      <input type="hidden" name="nextStatus" value={isNote ? "" : nextStatus} />

      {/* Tabs + draft */}
      <div className="flex" style={{ gap: 2, padding: "8px 18px 0" }}>
        <button type="button" onClick={() => setKind("public_reply")} style={tabStyle(!isNote, false)}>
          {t("app.ticket.tabReply")}
        </button>
        <button
          type="button"
          onClick={() => setKind("internal_note")}
          className="flex items-center"
          style={{ ...tabStyle(isNote, true), gap: 5 }}
        >
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          {t("app.ticket.internalNote")}
        </button>
        <span className="flex-1" />
        {draftLabel() && (
          <span className="self-center" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            {draftLabel()}
          </span>
        )}
      </div>

      <div
        style={{
          margin: "0 18px 12px",
          border: `1px solid ${editorLine}`,
          borderRadius: "0 8px 8px 8px",
          background: editorBg,
        }}
      >
      {/* Toolbar */}
      <div
        className="flex items-center"
        style={{ gap: 1, padding: "6px 8px", borderBottom: `1px solid ${editorLine}` }}
      >
        {TOOLBAR.map((b) => (
          <button
            key={b.title}
            type="button"
            title={b.title}
            onClick={b.run}
            className="grid place-items-center ohd-hover"
            style={{
              ...toolBtn,
              fontWeight: b.label === "B" ? 700 : 400,
              fontStyle: b.label === "I" ? "italic" : undefined,
              textDecoration:
                b.label === "U" ? "underline" : b.label === "S" ? "line-through" : undefined,
            }}
          >
            {b.label}
          </button>
        ))}
        <span style={{ width: 1, height: 16, margin: "0 5px", background: "var(--line)" }} />

        {/* / Macros */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setMacroMenu((v) => !v);
              setVarMenu(false);
              setStatusMenu(false);
            }}
            className="flex items-center"
            style={toolChip}
          >
            {t("app.ticket.macrosButton")}
          </button>
          {macroMenu && (
            <div
              className="absolute bottom-full left-0 z-30 mb-1 flex max-h-64 min-w-64 flex-col overflow-y-auto rounded-md border py-1 shadow-lg"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              {macros.length === 0 && (
                <span className="px-3 py-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {t("app.ticket.noMacros")}
                </span>
              )}
              {macros.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => applyMacro(m.id)}
                  className="px-3 py-1.5 text-left text-[12.5px] ohd-hover"
                >
                  {m.category && (
                    <span style={{ color: "var(--ink-3)" }}>{m.category} · </span>
                  )}
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* KB article */}
        <a
          href="/app/kb"
          target="_blank"
          rel="noreferrer"
          title={t("app.ticket.kbArticleTitle")}
          className="flex items-center"
          style={toolChip}
        >
          {t("app.ticket.kbArticle")}
        </a>

        {/* Variables */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setVarMenu((v) => !v);
              setMacroMenu(false);
              setStatusMenu(false);
            }}
            className="flex items-center"
            style={{ ...toolChip, fontFamily: "var(--font-mono)" }}
          >
            {"{{var}}"}
          </button>
          {varMenu && (
            <div
              className="absolute bottom-full left-0 z-30 mb-1 flex min-w-56 flex-col rounded-md border py-1 shadow-lg"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              {VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => {
                    insertAtCursor(v.key);
                    setVarMenu(false);
                  }}
                  className="flex items-baseline justify-between gap-3 px-3 py-1.5 text-left text-[12.5px] ohd-hover"
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                    {v.key}
                  </span>
                  <span style={{ color: "var(--ink-3)", fontSize: 11.5 }}>{v.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <textarea
        ref={textareaRef}
        name="body"
        required
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          isNote
            ? t("app.ticket.notePlaceholder")
            : t("app.ticket.replyPlaceholder", { name: contactName })
        }
        className="w-full resize-y border-0 outline-none"
        style={{
          padding: 12,
          minHeight: 86,
          fontSize: 13.5,
          lineHeight: 1.55,
          background: "transparent",
          color: "var(--ink)",
        }}
      />

      <div
        className="flex items-center"
        style={{ gap: 8, padding: "8px 10px", borderTop: `1px solid ${editorLine}` }}
      >
        <label
          className="inline-flex cursor-pointer items-center gap-1.5"
          style={{ fontSize: 12, color: attachError ? "var(--dang)" : "var(--ink-2)" }}
          title={t("app.ticket.attachTitle")}
        >
          <Paperclip size={15} strokeWidth={1.8} />
          <input
            name="files"
            type="file"
            multiple
            className="max-w-44 text-[11px]"
            /**
             * Checked here, at pick time, because both ways of failing were
             * mute: a file over the per-file ceiling was dropped by
             * saveUploadedFiles without a word, and a selection over the request
             * ceiling made the Server Action answer 413 — an "Application error"
             * page that took the written reply with it. Saying no now is the only
             * version of this the agent can act on.
             */
            onChange={(e) => {
              const picked = [...(e.currentTarget.files ?? [])];
              const total = picked.reduce((n, f) => n + f.size, 0);
              const bad =
                picked.some((f) => f.size > MAX_FILE_BYTES) || total > MAX_MESSAGE_BYTES;
              setAttachError(bad);
              if (bad) e.currentTarget.value = "";
            }}
          />
        </label>
        {attachError && (
          <span role="alert" style={{ fontSize: 11.5, color: "var(--dang)" }}>
            {t("app.ticket.attachRejected")}
          </span>
        )}
        <span className="flex-1" />

        {isNote ? (
          <button
            type="submit"
            className="grid place-items-center font-semibold text-white"
            style={{ height: 32, padding: "0 14px", borderRadius: 6, background: sendBg, fontSize: 13 }}
          >
            {t("app.ticket.addNote")}
          </button>
        ) : (
          <div className="relative">
            <div className="flex overflow-hidden" style={{ borderRadius: 6 }}>
              <button
                type="submit"
                className="grid place-items-center whitespace-nowrap font-semibold text-white"
                style={{ height: 32, padding: "0 14px", background: sendBg, fontSize: 13 }}
              >
                {sendLabel(nextStatus)}
              </button>
              <span style={{ width: 1, background: "rgba(255,255,255,.28)" }} />
              <button
                type="button"
                aria-label={t("app.ticket.chooseStatus")}
                onClick={() => {
                  setStatusMenu((v) => !v);
                  setMacroMenu(false);
                  setVarMenu(false);
                }}
                className="grid place-items-center text-white"
                style={{ height: 32, padding: "0 9px", background: sendBg, fontSize: 10 }}
              >
                ▾
              </button>
            </div>
            {statusMenu && (
              <div
                className="absolute bottom-full right-0 z-30 mb-1 flex min-w-48 flex-col rounded-md border py-1 shadow-lg"
                style={{ background: "var(--panel)", borderColor: "var(--line)" }}
              >
                {SEND_STATUSES.map((s) => (
                  <button
                    key={s || "none"}
                    type="button"
                    onClick={() => {
                      setNextStatus(s);
                      setStatusMenu(false);
                    }}
                    className="px-3 py-1.5 text-left text-[12.5px] ohd-hover"
                    style={{
                      fontWeight: s === nextStatus ? 600 : 400,
                      color: s === nextStatus ? "var(--acc)" : "var(--ink)",
                    }}
                  >
                    {s ? sendLabel(s) : t("app.ticket.sendNoStatusChange")}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </form>
  );
}

"use client";

/**
 * AG-05 — Formulaire « Nouveau ticket » : combobox contact réelle (recherche
 * /api/search, « + Créer le contact »), grille Sujet/Formulaire, description avec
 * toolbar, 4 selects, encart email, pied sunk.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ticket-bits";
import { PRIORITY_LABELS_FR } from "@/lib/format";
import { createTicket } from "../actions";

type ContactHit = {
  id: string;
  name: string | null;
  email: string;
  organizationName?: string | null;
};

const inputStyle = {
  height: 34,
  borderRadius: 6,
  border: "1px solid var(--line)",
  background: "var(--bg)",
  color: "var(--ink)",
  fontSize: 13,
  padding: "0 10px",
  width: "100%",
} as const;

export function NewTicketForm({
  forms,
  agents,
  tags,
  meId,
}: {
  forms: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  tags: string[];
  meId: string;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<ContactHit | null>(null);
  const [createMode, setCreateMode] = useState(false);
  const [body, setBody] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (chosen || query.trim().length < 2) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { contacts: ContactHit[] };
          setHits(data.contacts ?? []);
          setOpen(true);
        }
      } catch {
        /* requête annulée */
      }
    }, 180);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, chosen]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function insertMd(before: string, after = "", placeholder = "") {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const sel = body.slice(start, end) || placeholder;
    setBody(body.slice(0, start) + before + sel + after + body.slice(end));
    requestAnimationFrame(() => el.focus());
  }

  const TOOLBAR: { label: string; title: string; run: () => void }[] = [
    { label: "B", title: "Gras", run: () => insertMd("**", "**", "texte") },
    { label: "I", title: "Italique", run: () => insertMd("*", "*", "texte") },
    { label: "U", title: "Souligné", run: () => insertMd("<u>", "</u>", "texte") },
    { label: "S", title: "Barré", run: () => insertMd("~~", "~~", "texte") },
    { label: "≔", title: "Liste", run: () => insertMd("\n- ", "", "élément") },
    { label: "⛓", title: "Lien", run: () => insertMd("[", "](https://)", "texte") },
    { label: "❝", title: "Citation", run: () => insertMd("\n> ", "", "citation") },
    { label: "‹›", title: "Code", run: () => insertMd("`", "`", "code") },
  ];

  const emailValue = chosen ? chosen.email : createMode ? query.trim() : "";

  return (
    <form action={createTicket} className="flex flex-col">
      <div className="flex flex-col gap-4 px-6 py-5">
        {/* Contact — combobox */}
        <div ref={boxRef} className="relative flex flex-col gap-1">
          <label className="text-[12.5px] font-medium">Contact *</label>
          {chosen ? (
            <div
              className="flex items-center gap-2 border px-2.5"
              style={{ ...inputStyle, display: "flex", padding: "0 10px" }}
            >
              <Avatar name={chosen.name ?? chosen.email} size={20} />
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {chosen.name ?? chosen.email}
                <span style={{ color: "var(--ink-3)" }}> · {chosen.email}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setChosen(null);
                  setQuery("");
                }}
                style={{ color: "var(--ink-3)" }}
                title="Changer de contact"
              >
                ✕
              </button>
            </div>
          ) : (
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCreateMode(false);
              }}
              onFocus={() => hits.length > 0 && setOpen(true)}
              placeholder="Rechercher un nom ou un email…"
              style={inputStyle}
              autoComplete="off"
            />
          )}
          {open && !chosen && query.trim().length >= 2 && (
            <div
              className="absolute left-0 right-0 top-full z-30 mt-1 flex flex-col overflow-hidden rounded-md border py-1 shadow-lg"
              style={{ background: "var(--panel)", borderColor: "var(--line)" }}
            >
              {hits.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setChosen(c);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-left hover:opacity-70"
                >
                  <Avatar name={c.name ?? c.email} size={22} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {c.name ?? c.email}
                    </span>
                    <span
                      className="block truncate"
                      style={{ fontSize: 11.5, color: "var(--ink-3)" }}
                    >
                      {c.email}
                      {c.organizationName ? ` · ${c.organizationName}` : ""}
                    </span>
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setCreateMode(true);
                  setOpen(false);
                }}
                className="px-3 py-2 text-left text-[13px] font-medium"
                style={{ color: "var(--acc)" }}
              >
                + Créer le contact « {query.trim()} »
              </button>
            </div>
          )}
          {createMode && !chosen && (
            <div className="mt-1 grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[12px]" style={{ color: "var(--ink-2)" }}>
                Email du nouveau contact *
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={query.includes("@") ? query.trim() : ""}
                  style={inputStyle}
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px]" style={{ color: "var(--ink-2)" }}>
                Nom
                <input
                  name="name"
                  defaultValue={query.includes("@") ? "" : query.trim()}
                  style={inputStyle}
                />
              </label>
            </div>
          )}
          {!createMode && <input type="hidden" name="email" value={emailValue} />}
        </div>

        {/* Sujet / Formulaire — grille 1fr 220px */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 220px" }}>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium">
            Sujet *
            <input name="subject" required style={inputStyle} />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium">
            Formulaire
            <select name="formId" defaultValue={forms[0]?.id ?? ""} style={inputStyle}>
              {forms.length === 0 && <option value="">—</option>}
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Description + toolbar */}
        <div className="flex flex-col gap-1">
          <label className="text-[12.5px] font-medium">Description</label>
          <div
            className="flex items-center gap-0.5 rounded-t-md border border-b-0 px-1.5 py-1"
            style={{ borderColor: "var(--line)", background: "var(--sunk)" }}
          >
            {TOOLBAR.map((b) => (
              <button
                key={b.title}
                type="button"
                title={b.title}
                onClick={b.run}
                className="flex items-center justify-center hover:opacity-70"
                style={{
                  width: 26,
                  height: 24,
                  borderRadius: 5,
                  color: "var(--ink-2)",
                  fontSize: 12.5,
                  fontWeight: b.label === "B" ? 700 : 500,
                  fontStyle: b.label === "I" ? "italic" : undefined,
                  textDecoration:
                    b.label === "U" ? "underline" : b.label === "S" ? "line-through" : undefined,
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
          <textarea
            ref={bodyRef}
            name="body"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full resize-y rounded-b-md border p-3 text-sm outline-none"
            style={{ borderColor: "var(--line)", background: "var(--bg)", marginTop: -4 }}
          />
        </div>

        {/* 4 selects */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-[12.5px] font-medium">
            Statut
            <select name="status" defaultValue="new" style={inputStyle}>
              <option value="new">Nouveau</option>
              <option value="open">Ouvert</option>
              <option value="waiting">En attente</option>
              <option value="on_hold">En pause</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium">
            Priorité
            <select name="priority" defaultValue="normal" style={inputStyle}>
              {Object.entries(PRIORITY_LABELS_FR).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium">
            Assigné
            <select name="assigneeId" defaultValue="me" style={inputStyle}>
              <option value="me">Moi</option>
              <option value="">Non assigné</option>
              {agents
                .filter((a) => a.id !== meId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium">
            Tags
            <select name="tag" defaultValue="" style={inputStyle}>
              <option value="">Aucun</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Encart email */}
        <label
          className="flex items-center gap-2.5 border px-3 py-2.5 text-[13px]"
          style={{
            borderRadius: 8,
            background: "var(--acc-t)",
            borderColor: "var(--acc-b)",
          }}
        >
          <input type="checkbox" name="sendEmail" defaultChecked style={{ width: 14, height: 14 }} />
          Envoyer la réponse par email au contact
        </label>
      </div>

      {/* Pied sunk */}
      <div
        className="flex items-center justify-end gap-2 border-t px-6 py-3"
        style={{
          background: "var(--sunk)",
          borderColor: "var(--line)",
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
        }}
      >
        <Link
          href="/app/tickets"
          className="rounded-md border px-3 py-1.5 text-[13px] font-medium"
          style={{ borderColor: "var(--line)", background: "var(--bg)" }}
        >
          Annuler
        </Link>
        <button
          type="submit"
          className="rounded-md px-4 py-1.5 text-[13px] font-semibold text-white"
          style={{ background: "var(--acc)" }}
        >
          Créer le ticket
        </button>
      </div>
    </form>
  );
}

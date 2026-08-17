"use client";

/**
 * Corps de l'éditeur d'article : barre d'outils réellement branchée sur le format
 * de la base de connaissances, raccourcis clavier, et aperçu rendu par le MÊME
 * composant que le portail — ce qui s'affiche ici est ce que le client verra.
 *
 * La barre ne propose que ce que le format sait rendre : proposer « souligné »
 * produirait des caractères bruts côté client.
 */
import { useRef, useState } from "react";
import { ArticleBody } from "@/components/article-body";
import { parseArticle, plainText } from "@/lib/article-format";

type Outil = {
  cle: string;
  libelle: string;
  titre: string;
  /** Encadre la sélection (gras, code…). */
  entoure?: [string, string];
  /** Préfixe chaque ligne sélectionnée (titres, listes, citations). */
  prefixe?: string;
  /** Numérote les lignes sélectionnées. */
  numerote?: boolean;
  /** Insère un bloc complet à la ligne. */
  bloc?: string;
  raccourci?: string;
  style?: React.CSSProperties;
};

const OUTILS: Outil[] = [
  { cle: "h2", libelle: "T", titre: "Titre de section (## )", prefixe: "## ", style: { fontWeight: 700 } },
  {
    cle: "h3",
    libelle: "t",
    titre: "Sous-titre (### )",
    prefixe: "### ",
    style: { fontWeight: 600, fontSize: 11.5 },
  },
  {
    cle: "gras",
    libelle: "B",
    titre: "Gras (⌘B)",
    entoure: ["**", "**"],
    raccourci: "b",
    style: { fontWeight: 700 },
  },
  {
    cle: "italique",
    libelle: "I",
    titre: "Italique (⌘I)",
    entoure: ["*", "*"],
    raccourci: "i",
    style: { fontStyle: "italic" },
  },
  { cle: "puces", libelle: "•", titre: "Liste à puces", prefixe: "- " },
  { cle: "etapes", libelle: "1.", titre: "Étapes numérotées", numerote: true, style: { fontSize: 11 } },
  {
    cle: "lien",
    libelle: "🔗",
    titre: "Lien (⌘K)",
    entoure: ["[", "](https://)"],
    raccourci: "k",
    style: { fontSize: 11 },
  },
  { cle: "encadre", libelle: "❝", titre: "Encadré (mise en garde)", prefixe: "> " },
  { cle: "code", libelle: "‹›", titre: "Code en ligne", entoure: ["`", "`"], style: { fontSize: 11 } },
  { cle: "bloc", libelle: "▤", titre: "Bloc de code", bloc: "```titre du bloc\n\n```" },
];

export function ArticleEditor({
  defaultTitle,
  defaultBody,
}: {
  defaultTitle: string;
  defaultBody: string;
}) {
  const zone = useRef<HTMLTextAreaElement>(null);
  const [corps, setCorps] = useState(defaultBody);
  const [apercu, setApercu] = useState(false);

  /** Applique un outil à la sélection courante, puis replace le curseur. */
  function appliquer(outil: Outil) {
    const el = zone.current;
    if (!el) return;
    const debut = el.selectionStart;
    const fin = el.selectionEnd;
    const avant = corps.slice(0, debut);
    const selection = corps.slice(debut, fin);
    const apres = corps.slice(fin);

    let insertion: string;
    let curseurDebut: number;
    let curseurFin: number;

    if (outil.entoure) {
      const [ouvre, ferme] = outil.entoure;
      insertion = `${ouvre}${selection}${ferme}`;
      // Sans sélection, on place le curseur entre les marqueurs.
      curseurDebut = selection ? debut : debut + ouvre.length;
      curseurFin = selection ? debut + insertion.length : curseurDebut;
    } else if (outil.bloc) {
      const saut = avant && !avant.endsWith("\n") ? "\n" : "";
      insertion = `${saut}${outil.bloc}`;
      // Curseur sur la ligne vide entre les deux fences.
      curseurDebut = debut + saut.length + outil.bloc.indexOf("\n") + 1;
      curseurFin = curseurDebut;
    } else {
      // Préfixes de ligne : on remonte au début de la première ligne touchée.
      const debutLigne = corps.lastIndexOf("\n", debut - 1) + 1;
      const zoneLignes = corps.slice(debutLigne, fin) || "";
      const lignes = zoneLignes.split("\n");
      const transformees = lignes.map((ligne, i) => {
        const nette = ligne.replace(/^(#{2,3}\s+|[-*]\s+|>\s+|\d+[.)]\s+)/, "");
        return outil.numerote ? `${i + 1}. ${nette}` : `${outil.prefixe}${nette}`;
      });
      insertion = transformees.join("\n");
      const nouveau = corps.slice(0, debutLigne) + insertion + corps.slice(fin);
      setCorps(nouveau);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(debutLigne + insertion.length, debutLigne + insertion.length);
      });
      return;
    }

    setCorps(avant + insertion + apres);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(curseurDebut, curseurFin);
    });
  }

  function surTouche(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.metaKey || e.ctrlKey)) return;
    const outil = OUTILS.find((o) => o.raccourci === e.key.toLowerCase());
    if (!outil) return;
    e.preventDefault();
    appliquer(outil);
  }

  const mots = plainText(corps).split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(mots / 200));

  return (
    <div className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
      <div className="mx-auto" style={{ maxWidth: apercu ? 1180 : "68ch" }}>
        <input
          name="title"
          required
          defaultValue={defaultTitle}
          placeholder="Titre de l'article"
          className="w-full border-0 outline-none"
          style={{ fontSize: 26, fontWeight: 600, background: "transparent", color: "var(--ink)" }}
        />

        <div
          className="mb-3 mt-4 flex flex-wrap items-center gap-0.5 border-b pb-2"
          style={{ borderColor: "var(--line-2)" }}
        >
          {OUTILS.map((outil) => (
            <button
              key={outil.cle}
              type="button"
              title={outil.titre}
              aria-label={outil.titre}
              onClick={() => appliquer(outil)}
              className="flex items-center justify-center hover:bg-[var(--sunk)]"
              style={{
                width: 26,
                height: 24,
                borderRadius: 5,
                color: "var(--ink-2)",
                fontSize: 12.5,
                ...outil.style,
              }}
            >
              {outil.libelle}
            </button>
          ))}

          <span className="flex-1" />
          <span className="tabular-nums" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            {mots} mot{mots > 1 ? "s" : ""} · {minutes} min de lecture
          </span>
          <button
            type="button"
            onClick={() => setApercu((v) => !v)}
            aria-pressed={apercu}
            className="ml-2 rounded-md border px-2.5 font-medium"
            style={{
              height: 26,
              fontSize: 12,
              borderColor: apercu ? "var(--acc)" : "var(--line)",
              background: apercu ? "var(--acc-t)" : "var(--panel)",
              color: apercu ? "var(--acc)" : "var(--ink-2)",
            }}
          >
            Aperçu
          </button>
        </div>

        <div
          className="grid gap-7"
          style={{ gridTemplateColumns: apercu ? "minmax(0,1fr) minmax(0,1fr)" : "1fr" }}
        >
          <textarea
            ref={zone}
            name="body"
            required
            rows={22}
            value={corps}
            onChange={(e) => setCorps(e.target.value)}
            onKeyDown={surTouche}
            placeholder="Corps de l'article — ## titre, - liste, 1. étapes, > encadré, **gras**…"
            className="w-full resize-y border-0 outline-none"
            style={{
              fontSize: 14.5,
              lineHeight: 1.65,
              background: "transparent",
              color: "var(--ink)",
              fontFamily: apercu ? "var(--font-mono)" : undefined,
            }}
          />

          {apercu && (
            <div className="min-w-0">
              <p
                className="mb-3 font-mono font-bold uppercase"
                style={{ fontSize: 10.5, letterSpacing: "0.07em", color: "var(--ink-3)" }}
              >
                Vu par le client
              </p>
              {corps.trim() ? (
                <ArticleBody blocks={parseArticle(corps)} />
              ) : (
                <p style={{ fontSize: 13.5, color: "var(--ink-3)" }}>
                  L'aperçu s'affiche dès les premières lignes.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

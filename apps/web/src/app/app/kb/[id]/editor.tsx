"use client";

/**
 * Éditeur d'article — édition visuelle (TipTap/ProseMirror).
 *
 * L'agent met en forme et voit le résultat : aucun balisage n'apparaît à l'écran.
 * La conversion vers le format stocké se fait à chaque frappe dans un champ caché,
 * ce qui laisse la server action existante inchangée et garde le portail compatible
 * avec les articles déjà publiés.
 *
 * Seules les mises en forme que le portail sait rendre sont proposées : barré et
 * souligné sont désactivés, ils seraient perdus à la publication.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { CodeBlock } from "@tiptap/extension-code-block";
import { docToMarkup, markupToHtml, type EditorNode } from "@/lib/article-convert";
import { plainText } from "@/lib/article-format";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/dictionaries/fr";

type Action = {
  cle: string;
  libelle: string;
  /** Clé de l'infobulle : la table est construite hors du composant. */
  titre: MessageKey;
  actif: (e: Editor) => boolean;
  lancer: (e: Editor) => void;
  style?: React.CSSProperties;
};

const ACTIONS: Action[] = [
  {
    cle: "h2",
    libelle: "T",
    titre: "app.kb.toolHeading",
    actif: (e) => e.isActive("heading", { level: 2 }),
    lancer: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    style: { fontWeight: 700 },
  },
  {
    cle: "h3",
    libelle: "t",
    titre: "app.kb.toolSubheading",
    actif: (e) => e.isActive("heading", { level: 3 }),
    lancer: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    style: { fontWeight: 600, fontSize: 11.5 },
  },
  {
    cle: "gras",
    libelle: "B",
    titre: "app.kb.toolBold",
    actif: (e) => e.isActive("bold"),
    lancer: (e) => e.chain().focus().toggleBold().run(),
    style: { fontWeight: 700 },
  },
  {
    cle: "italique",
    libelle: "I",
    titre: "app.kb.toolItalic",
    actif: (e) => e.isActive("italic"),
    lancer: (e) => e.chain().focus().toggleItalic().run(),
    style: { fontStyle: "italic" },
  },
  {
    cle: "puces",
    libelle: "•",
    titre: "app.kb.toolBulletList",
    actif: (e) => e.isActive("bulletList"),
    lancer: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    cle: "etapes",
    libelle: "1.",
    titre: "app.kb.toolOrderedList",
    actif: (e) => e.isActive("orderedList"),
    lancer: (e) => e.chain().focus().toggleOrderedList().run(),
    style: { fontSize: 11 },
  },
  {
    cle: "encadre",
    libelle: "❝",
    titre: "app.kb.toolQuote",
    actif: (e) => e.isActive("blockquote"),
    lancer: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    cle: "code",
    libelle: "‹›",
    titre: "app.kb.toolInlineCode",
    actif: (e) => e.isActive("code"),
    lancer: (e) => e.chain().focus().toggleCode().run(),
    style: { fontSize: 11 },
  },
  {
    cle: "bloc",
    libelle: "▤",
    titre: "app.kb.toolCodeBlock",
    actif: (e) => e.isActive("codeBlock"),
    lancer: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
];

/**
 * Bloc de code portant un titre (« Format du nom de fichier » dans le design).
 * L'attribut standard « language » ne convient pas : il est rendu en classe CSS,
 * donc tronqué au premier espace.
 */
const BlocCodeTitre = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      titre: {
        default: "",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-titre") ?? "",
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.titre ? { "data-titre": String(attributes.titre) } : {},
      },
    };
  },
});

export function ArticleEditor({
  defaultTitle,
  defaultBody,
}: {
  defaultTitle: string;
  defaultBody: string;
}) {
  const t = useT();
  const [markup, setMarkup] = useState(defaultBody);
  const [depot, setDepot] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pretPourRendu, setPretPourRendu] = useState(false);
  const fichier = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    // Le rendu initial doit être identique au serveur : TipTap monte après coup.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // Le format du portail ne rend ni le barré, ni le souligné, ni les filets.
        strike: false,
        underline: false,
        horizontalRule: false,
        codeBlock: false,
        link: { openOnClick: false, HTMLAttributes: { rel: "noopener" } },
      }),
      BlocCodeTitre,
      Image.configure({ HTMLAttributes: { class: "kb-image" } }),
    ],
    content: markupToHtml(defaultBody),
    editorProps: {
      attributes: {
        class: "kb-prose",
        "aria-label": t("app.kb.bodyLabel"),
      },
    },
    onUpdate: ({ editor: e }) => setMarkup(docToMarkup(e.getJSON() as EditorNode)),
  });

  useEffect(() => setPretPourRendu(true), []);

  /** Dépose les fichiers image reçus et les insère à la suite. */
  const televerser = useCallback(
    async (fichiers: File[]) => {
      const images = fichiers.filter((f) => f.type.startsWith("image/"));
      if (images.length === 0 || !editor) return;
      setErreur(null);
      for (const image of images) {
        const corps = new FormData();
        corps.append("file", image);
        try {
          const reponse = await fetch("/api/kb/images", { method: "POST", body: corps });
          const donnees = (await reponse.json()) as { url?: string; detail?: string };
          if (!reponse.ok || !donnees.url) {
            setErreur(donnees.detail ?? t("app.kb.imageRejected"));
            continue;
          }
          // Après le bloc courant : une image déposée dans une étape de liste
          // s'imbriquerait dans celle-ci.
          const apresBloc = editor.state.selection.$to.after(1);
          editor
            .chain()
            .focus()
            .insertContentAt(apresBloc, { type: "image", attrs: { src: donnees.url, alt: image.name } })
            .run();
        } catch {
          setErreur(t("app.kb.uploadFailed"));
        }
      }
    },
    [editor, t],
  );

  const mots = plainText(markup).split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(mots / 200));

  return (
    <div
      className="min-w-0 flex-1 overflow-y-auto px-8 py-6"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDepot(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDepot(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDepot(false);
        void televerser([...e.dataTransfer.files]);
      }}
    >
      {/* Le format stocké voyage ici : la server action ne change pas. */}
      <input type="hidden" name="body" value={markup} />

      <div className="mx-auto" style={{ maxWidth: "72ch" }}>
        <input
          name="title"
          required
          defaultValue={defaultTitle}
          placeholder={t("app.kb.articleTitlePlaceholder")}
          className="w-full border-0 outline-none"
          style={{ fontSize: 26, fontWeight: 600, background: "transparent", color: "var(--ink)" }}
        />

        <div
          className="sticky top-0 z-10 mb-4 mt-4 flex flex-wrap items-center gap-0.5 border-b pb-2"
          style={{ borderColor: "var(--line-2)", background: "var(--bg)" }}
        >
          {editor &&
            ACTIONS.map((action) => {
              const actif = action.actif(editor);
              return (
                <button
                  key={action.cle}
                  type="button"
                  title={t(action.titre)}
                  aria-label={t(action.titre)}
                  aria-pressed={actif}
                  onClick={() => action.lancer(editor)}
                  className="flex items-center justify-center hover:bg-[var(--sunk)]"
                  style={{
                    width: 26,
                    height: 24,
                    borderRadius: 5,
                    fontSize: 12.5,
                    background: actif ? "var(--acc-t)" : "transparent",
                    color: actif ? "var(--acc)" : "var(--ink-2)",
                    ...action.style,
                  }}
                >
                  {action.libelle}
                </button>
              );
            })}

          <button
            type="button"
            title={t("app.kb.insertLinkShortcut")}
            aria-label={t("app.kb.insertLink")}
            onClick={() => {
              if (!editor) return;
              const actuel = String(editor.getAttributes("link").href ?? "");
              const url = window.prompt(t("app.kb.linkPrompt"), actuel || "https://");
              if (url === null) return;
              if (!url.trim()) {
                editor.chain().focus().unsetLink().run();
                return;
              }
              editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
            }}
            className="flex items-center justify-center hover:bg-[var(--sunk)]"
            style={{
              width: 26,
              height: 24,
              borderRadius: 5,
              fontSize: 11,
              background: editor?.isActive("link") ? "var(--acc-t)" : "transparent",
              color: editor?.isActive("link") ? "var(--acc)" : "var(--ink-2)",
            }}
          >
            🔗
          </button>

          <button
            type="button"
            title={t("app.kb.insertImage")}
            aria-label={t("app.kb.insertImage")}
            onClick={() => fichier.current?.click()}
            className="flex items-center justify-center hover:bg-[var(--sunk)]"
            style={{ width: 26, height: 24, borderRadius: 5, fontSize: 11, color: "var(--ink-2)" }}
          >
            🖼
          </button>
          <input
            ref={fichier}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void televerser([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />

          <span className="flex-1" />
          <span className="tabular-nums" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            {t("app.kb.readingStats", { count: mots, minutes })}
          </span>
        </div>

        {erreur && (
          <p
            className="mb-3 rounded-md px-3 py-2"
            style={{ fontSize: 12.5, background: "var(--dang-t)", color: "var(--dang)" }}
          >
            {erreur}
          </p>
        )}

        <div
          style={{
            borderRadius: 10,
            outline: depot ? "2px dashed var(--acc)" : "none",
            outlineOffset: 8,
          }}
        >
          {pretPourRendu ? (
            <EditorContent editor={editor} />
          ) : (
            <p style={{ fontSize: 14.5, color: "var(--ink-3)" }}>{t("app.kb.loadingEditor")}</p>
          )}
        </div>

        <p className="mt-4" style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {t("app.kb.dropImageHint")}
        </p>
      </div>
    </div>
  );
}

"use client";

/**
 * Article editor — visual editing (TipTap/ProseMirror).
 *
 * The agent applies formatting and sees the result: no markup shows up on screen.
 * Conversion to the stored format happens on every keystroke in a hidden field,
 * which leaves the existing server action untouched and keeps the portal compatible
 * with the articles already published.
 *
 * Only the formatting the portal knows how to render is offered: strikethrough and
 * underline are disabled, they would be lost on publication.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { CodeBlock } from "@tiptap/extension-code-block";
import { docToMarkup, markupToHtml, type EditorNode } from "@/lib/article-convert";
import { plainText } from "@/lib/article-format";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/dictionaries/en";

type Action = {
  key: string;
  label: string;
  /** Tooltip key: the table is built outside the component. */
  title: MessageKey;
  isActive: (e: Editor) => boolean;
  run: (e: Editor) => void;
  style?: React.CSSProperties;
};

const ACTIONS: Action[] = [
  {
    key: "h2",
    label: "T",
    title: "app.kb.toolHeading",
    isActive: (e) => e.isActive("heading", { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    style: { fontWeight: 700 },
  },
  {
    key: "h3",
    label: "t",
    title: "app.kb.toolSubheading",
    isActive: (e) => e.isActive("heading", { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    style: { fontWeight: 600, fontSize: 11.5 },
  },
  {
    key: "bold",
    label: "B",
    title: "app.kb.toolBold",
    isActive: (e) => e.isActive("bold"),
    run: (e) => e.chain().focus().toggleBold().run(),
    style: { fontWeight: 700 },
  },
  {
    key: "italic",
    label: "I",
    title: "app.kb.toolItalic",
    isActive: (e) => e.isActive("italic"),
    run: (e) => e.chain().focus().toggleItalic().run(),
    style: { fontStyle: "italic" },
  },
  {
    key: "bullets",
    label: "•",
    title: "app.kb.toolBulletList",
    isActive: (e) => e.isActive("bulletList"),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    key: "steps",
    label: "1.",
    title: "app.kb.toolOrderedList",
    isActive: (e) => e.isActive("orderedList"),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    style: { fontSize: 11 },
  },
  {
    key: "quote",
    label: "❝",
    title: "app.kb.toolQuote",
    isActive: (e) => e.isActive("blockquote"),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    key: "code",
    label: "‹›",
    title: "app.kb.toolInlineCode",
    isActive: (e) => e.isActive("code"),
    run: (e) => e.chain().focus().toggleCode().run(),
    style: { fontSize: 11 },
  },
  {
    key: "bloc",
    label: "▤",
    title: "app.kb.toolCodeBlock",
    isActive: (e) => e.isActive("codeBlock"),
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
];

/**
 * Code block carrying a title ("File name format" in the design).
 * The standard "language" attribute does not fit: it is rendered as a CSS class,
 * hence truncated at the first space.
 */
const TitledCodeBlock = CodeBlock.extend({
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
  const [dropping, setDropping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readyToRender, setReadyToRender] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    // The initial render must be identical to the server one: TipTap mounts afterwards.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // The portal format renders neither strikethrough, nor underline, nor rules.
        strike: false,
        underline: false,
        horizontalRule: false,
        codeBlock: false,
        link: { openOnClick: false, HTMLAttributes: { rel: "noopener" } },
      }),
      TitledCodeBlock,
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

  useEffect(() => setReadyToRender(true), []);

  /** Uploads the image files received and inserts them one after the other. */
  const upload = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (images.length === 0 || !editor) return;
      setError(null);
      for (const image of images) {
        const payload = new FormData();
        payload.append("file", image);
        try {
          const response = await fetch("/api/kb/images", { method: "POST", body: payload });
          const data = (await response.json()) as { url?: string; detail?: string };
          if (!response.ok || !data.url) {
            setError(data.detail ?? t("app.kb.imageRejected"));
            continue;
          }
          // After the current block: an image dropped inside a list step
          // would end up nested inside it.
          const afterBlock = editor.state.selection.$to.after(1);
          editor
            .chain()
            .focus()
            .insertContentAt(afterBlock, { type: "image", attrs: { src: data.url, alt: image.name } })
            .run();
        } catch {
          setError(t("app.kb.uploadFailed"));
        }
      }
    },
    [editor, t],
  );

  const words = plainText(markup).split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));

  return (
    <div
      className="min-w-0 flex-1 overflow-y-auto px-8 py-6"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDropping(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDropping(false);
        void upload([...e.dataTransfer.files]);
      }}
    >
      {/* The stored format travels here: the server action does not change. */}
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
              const active = action.isActive(editor);
              return (
                <button
                  key={action.key}
                  type="button"
                  title={t(action.title)}
                  aria-label={t(action.title)}
                  aria-pressed={active}
                  onClick={() => action.run(editor)}
                  className="flex items-center justify-center ohd-hover"
                  style={{
                    width: 26,
                    height: 24,
                    borderRadius: 5,
                    fontSize: 12.5,
                    background: active ? "var(--acc-t)" : "transparent",
                    color: active ? "var(--acc)" : "var(--ink-2)",
                    ...action.style,
                  }}
                >
                  {action.label}
                </button>
              );
            })}

          <button
            type="button"
            title={t("app.kb.insertLinkShortcut")}
            aria-label={t("app.kb.insertLink")}
            onClick={() => {
              if (!editor) return;
              const current = String(editor.getAttributes("link").href ?? "");
              const url = window.prompt(t("app.kb.linkPrompt"), current || "https://");
              if (url === null) return;
              if (!url.trim()) {
                editor.chain().focus().unsetLink().run();
                return;
              }
              editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
            }}
            className="flex items-center justify-center ohd-hover"
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
            onClick={() => fileInput.current?.click()}
            className="flex items-center justify-center ohd-hover"
            style={{ width: 26, height: 24, borderRadius: 5, fontSize: 11, color: "var(--ink-2)" }}
          >
            🖼
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void upload([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />

          <span className="flex-1" />
          <span className="tabular-nums" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            {t("app.kb.readingStats", { count: words, minutes })}
          </span>
        </div>

        {error && (
          <p
            className="mb-3 rounded-md px-3 py-2"
            style={{ fontSize: 12.5, background: "var(--dang-t)", color: "var(--dang)" }}
          >
            {error}
          </p>
        )}

        <div
          style={{
            borderRadius: 10,
            outline: dropping ? "2px dashed var(--acc)" : "none",
            outlineOffset: 8,
          }}
        >
          {readyToRender ? (
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

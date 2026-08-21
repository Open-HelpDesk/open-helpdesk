"use client";

/**
 * ST-01 — Logo et favicon du workspace.
 *
 * Ces deux contrôles étaient dessinés mais inertes : un carré à l'initiale du
 * workspace et une zone en pointillés qui ne s'ouvrait sur rien. Ils déposent
 * désormais un vrai fichier, lu par `saveGeneral`.
 *
 * Deux partis pris :
 *
 *  · L'aperçu local est ce qui sépare un champ de fichier d'un contrôle
 *    utilisable. Sans lui, on choisit une image, rien ne bouge, et on ne sait
 *    pas si le clic a été pris avant d'avoir enregistré.
 *  · Retirer ne déclenche rien tout seul. L'écran n'a qu'une barre
 *    d'enregistrement, et tout ce qu'on y fait s'applique en l'actionnant : un
 *    bouton qui soumettrait le formulaire de son côté emporterait le nom ou la
 *    langue qu'on venait de changer sans les enregistrer. Le retrait est donc un
 *    état, porté par un champ caché, et il s'annule d'un second clic.
 */
import { useState, type CSSProperties } from "react";
import { useT } from "@/i18n/client";

type Props = {
  /** Nom du champ, lu par la server action : « logo » ou « favicon ». */
  name: "logo" | "favicon";
  /** L'URL déjà enregistrée, ou null pour l'initiale du workspace. */
  current: string | null;
  /** Initiale de repli, quand aucun fichier n'est posé. */
  initial: string;
  /** Fond du carré d'aperçu — l'accent du tenant pour le logo. */
  background: string;
  /** Types acceptés par le sélecteur de fichiers du navigateur. */
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
  // L'URL d'objet locale n'est pas révoquée : le composant vit le temps de
  // l'écran, et la révoquer viderait l'aperçu au rendu suivant.
  const [apercu, setApercu] = useState<string | null>(null);
  const [nomFichier, setNomFichier] = useState<string | null>(null);
  const [retire, setRetire] = useState(false);

  const affiche = apercu ?? (retire ? null : current);
  const estFavicon = name === "favicon";

  function choisir(fichier: File) {
    setApercu(URL.createObjectURL(fichier));
    setNomFichier(fichier.name);
    // Déposer un fichier annule un retrait demandé : on remplace, on ne retire
    // pas puis on repose.
    setRetire(false);
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
            fontSize: estFavicon ? 15 : 19,
            // Un fichier posé occupe tout le carré : le fond d'accent et
            // l'initiale n'ont plus à se voir derrière lui.
            background: affiche ? "var(--sunk)" : background,
            color: estFavicon ? "var(--ink)" : "#fff",
            ...(affiche || estFavicon ? { border: "1px solid var(--line)" } : {}),
          }}
        >
          {affiche ? (
            /* eslint-disable-next-line @next/next/no-img-element --
               un SVG ou un ICO déposé par le tenant n'a rien à faire dans
               l'optimiseur d'images, qui ne les traite pas. */
            <img
              src={affiche}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : (
            initial
          )}
        </span>

        {/* La zone en pointillés de la maquette EST le contrôle : un `label` qui
            enveloppe le champ, plutôt qu'un bouton qui le cliquerait en
            JavaScript. Le clic est alors natif, le champ est correctement
            étiqueté, et le focus se voit sur la boîte — un champ en `sr-only`
            recevrait le focus hors de l'écran.

            Survol et focus sont ceux que la maquette donne à ses boîtes en
            pointillés « + ajouter » : filet et libellé à l'accent, liseré 2px.
            Le rayon suit le carré d'aperçu voisin (10) et non le `rounded-lg` de
            Tailwind, qui vaut 8 et désalignait les deux angles côte à côte. */}
        <label
          className="ohd-hover-edge-ink ohd-focus flex flex-1 cursor-pointer items-center justify-center border border-dashed px-2"
          style={{
            height: 46,
            borderRadius: 10,
            borderColor: "var(--line)",
            fontSize: 12.5,
            color: nomFichier ? "var(--ink-2)" : "var(--ink-3)",
          }}
        >
          <span className="truncate">{nomFichier ?? replaceLabel}</span>
          <input
            type="file"
            name={name}
            accept={accept}
            aria-label={label}
            className="sr-only"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) choisir(f);
            }}
          />
        </label>

        {retire && <input type="hidden" name={`remove-${name}`} value="1" />}

        {/* Retirer ne concerne qu'un fichier DÉJÀ enregistré : un aperçu local
            s'abandonne en n'enregistrant pas. */}
        {current && !apercu && (
          <button
            type="button"
            onClick={() => setRetire((v) => !v)}
            aria-pressed={retire}
            aria-label={removeLabel}
            title={removeLabel}
            className="ohd-row grid place-items-center border"
            style={{
              width: 30,
              height: 30,
              flex: "none",
              borderRadius: 6,
              borderColor: retire ? "var(--dang)" : "var(--line)",
              color: retire ? "var(--dang)" : "var(--ink-3)",
              // Bouton d'icône 30×30 de la maquette : survol --sunk. Le fond de
              // l'état « retrait demandé » passe par --row-bg pour que le survol
              // reste perceptible — en style inline il l'aurait masqué.
              "--row-bg": retire ? "var(--dang-t)" : "transparent",
              fontSize: 13,
            } as CSSProperties}
          >
            {retire ? "↺" : "✕"}
          </button>
        )}
      </div>
      <span style={{ fontSize: 12, color: retire ? "var(--dang)" : "var(--ink-3)" }}>
        {retire
          ? t("app.settings.workspace.generalAssetRemoved")
          : nomFichier
            ? t("app.settings.workspace.generalAssetPending")
            : hint}
      </span>
    </div>
  );
}

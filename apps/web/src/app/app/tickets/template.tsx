/**
 * Transition d'écran — même montée que l'administration (.18s, 6 px).
 * Un template.tsx est remonté à chaque navigation : la zone de contenu rejoue
 * l'animation, la barre latérale et l'en-tête restent fixes.
 *
 * `h-full min-h-0` rend ce conteneur transparent : les pages de section s'appuient
 * sur la hauteur du parent (`h-full`) pour leurs colonnes et leur défilement interne.
 */
export default function SectionTemplate({ children }: { children: React.ReactNode }) {
  return <div className="screen-rise h-full min-h-0">{children}</div>;
}

/**
 * Transition d'écran de l'administration — classe commune à tout le produit
 * (.screen-rise, .18s). `.st-rise` reste réservée aux bascules d'onglets internes.
 */
export default function SettingsTemplate({ children }: { children: React.ReactNode }) {
  return <div className="screen-rise">{children}</div>;
}

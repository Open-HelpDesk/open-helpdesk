/** Transition d'écran st-rise .18s à chaque commutation de page (gabarit commun). */
export default function SettingsTemplate({ children }: { children: React.ReactNode }) {
  return <div className="st-rise">{children}</div>;
}

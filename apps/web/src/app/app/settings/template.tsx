/** st-rise .18s screen transition on every page switch (shared template). */
export default function SettingsTemplate({ children }: { children: React.ReactNode }) {
  return <div className="st-rise">{children}</div>;
}

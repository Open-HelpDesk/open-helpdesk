import { NewViewCard } from "./view-card";

/**
 * newview as a page — direct hit or refresh. Navigating from the inbox gets the
 * modal instead (@modal/(.)views/new), which floats over the list.
 */
export default async function NewViewPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div
      className="grid h-full overflow-auto"
      style={{
        padding: "6vh 24px 40px",
        placeItems: "start center",
        background: "var(--canvas)",
      }}
    >
      <NewViewCard nameError={error === "name"} />
    </div>
  );
}

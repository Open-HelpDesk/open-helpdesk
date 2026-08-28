/**
 * The inbox and the layer above it.
 *
 * `modal` is a parallel slot filled by the intercepting routes (@modal/(.)new,
 * @modal/(.)views/new). Its whole purpose is that `children` — the list — stays
 * mounted while a modal is open, so the modal's blur has something to frost and
 * closing it does not re-fetch the inbox.
 */
export default function TicketsLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}

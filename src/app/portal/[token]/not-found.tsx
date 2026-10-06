export default function PortalNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl">This link doesn&apos;t work</h1>
      <p className="text-muted max-w-md">
        It may have expired or been replaced by a newer link. Ask your staff contact to send you a
        new one.
      </p>
    </main>
  );
}

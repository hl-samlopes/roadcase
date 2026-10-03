import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
      <h1 className="text-2xl">Not found</h1>
      <p className="text-muted">
        This page doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link href="/" className="text-accent hover:underline">
        Go to Roadcase home
      </Link>
    </main>
  );
}

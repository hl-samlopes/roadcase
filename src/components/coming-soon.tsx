import { Card, PageHeader } from "./ui";

/** Placeholder for sections built in later steps. */
export function ComingSoon({
  title,
  when,
  children,
}: {
  title: string;
  when: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <p>
          <span className="font-semibold">Not available yet.</span> {when}
        </p>
        {children}
      </Card>
    </>
  );
}

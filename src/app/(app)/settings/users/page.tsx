import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass, PageHeader } from "@/components/ui";
import { describeScope, grantDetailSelect, toGrantScope } from "@/lib/admin/scopes";
import { canManageUser, isAnyAdmin, requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { levelLabels } from "@/lib/labels";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const actor = await requireUser();
  if (!isAnyAdmin(actor)) notFound();

  const users = await db.user.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      organizationId: true,
      username: true,
      displayName: true,
      email: true,
      role: true,
      isActive: true,
      grants: { select: grantDetailSelect },
    },
  });

  return (
    <>
      <PageHeader title="Users">
        <Link href="/settings/users/new" className={buttonClass("primary")}>
          New user
        </Link>
      </PageHeader>
      <div className="relative overflow-x-auto">
        <table className="rounded-theme border-border bg-surface w-full border-collapse border">
          <thead>
            <tr className="border-border text-muted border-b text-left">
              <th className="p-2">Name</th>
              <th className="p-2">Username</th>
              <th className="p-2">Email</th>
              <th className="p-2">Role</th>
              <th className="p-2">Access</th>
              <th className="p-2">Status</th>
              <th className="p-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const manageable = canManageUser(actor, {
                organizationId: user.organizationId,
                grants: user.grants.map(toGrantScope),
              });
              return (
                <tr key={user.id} className="border-border border-b align-top last:border-0">
                  <td className="p-2">{user.displayName}</td>
                  <td className="p-2 font-mono">{user.username}</td>
                  <td className="p-2">{user.email}</td>
                  <td className="p-2">{user.role ?? ""}</td>
                  <td className="p-2">
                    {user.grants.length === 0 ? (
                      "No access"
                    ) : (
                      <ul>
                        {user.grants.map((grant) => (
                          <li key={grant.id}>
                            {levelLabels[grant.level]}: {describeScope(grant)}
                            {grant.canSubmitTickets ? ", can submit tickets" : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="p-2">{user.isActive ? "Active" : "Deactivated"}</td>
                  <td className="p-2">
                    {manageable ? (
                      <Link
                        href={`/settings/users/${user.id}`}
                        className="text-accent hover:underline"
                      >
                        Manage<span className="sr-only"> {user.displayName}</span>
                      </Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

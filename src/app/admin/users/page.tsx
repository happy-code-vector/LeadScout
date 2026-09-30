import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { email: "asc" }],
    select: { id: true, email: true, role: true, status: true },
  });
  return (
    <>
      <PageHeader
        title="Users"
        description="Approve sign-up requests and manage account access."
      />
      <UsersClient
        users={users.map((u) => ({ ...u, email: u.email ?? "", createdAt: null }))}
      />
    </>
  );
}

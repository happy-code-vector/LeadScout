"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Row = { id: string; email: string; role: string; status: string; createdAt: string | null };

export function UsersClient({ users }: { users: Row[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const ordered = [...users].sort((a, b) => {
    const pending = (u: Row) => (u.status === "PENDING" ? 0 : 1);
    return pending(a) - pending(b) || a.email.localeCompare(b.email);
  });

  async function act(id: string, action: "approve" | "delete") {
    setBusyId(id);
    try {
      await fetch(`/api/admin/users/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } catch {
      toast.error("Could not reach the server — try again.");
    } finally {
      setBusyId(null);
      router.refresh();
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordered.map((u) => (
          <TableRow key={u.id}>
            <TableCell className="font-medium">{u.email}</TableCell>
            <TableCell>{u.role}</TableCell>
            <TableCell>
              <Badge variant={u.status === "ACTIVE" ? "default" : "secondary"}>{u.status}</Badge>
            </TableCell>
            <TableCell className="space-x-2 text-right">
              {u.status === "PENDING" ? (
                <Button size="sm" disabled={busyId === u.id} onClick={() => act(u.id, "approve")}>
                  Approve
                </Button>
              ) : null}
              {u.role !== "ROOT" ? (
                <Button size="sm" variant="destructive" disabled={busyId === u.id} onClick={() => act(u.id, "delete")}>
                  Delete
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

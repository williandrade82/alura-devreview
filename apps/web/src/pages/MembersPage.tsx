import { useEffect } from "react";
import { Check, X, Crown } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchMembers,
  updateMember,
  removeMember,
} from "@/store/slices/membersSlice";

const MAX_LEADERS = 2;

export function MembersPage() {
  const dispatch = useAppDispatch();
  const teamId = useAppSelector((s) => s.auth.teamId);
  const myEmail = useAppSelector((s) => s.auth.email);
  const { items, loading, busy, error } = useAppSelector((s) => s.members);

  useEffect(() => {
    if (teamId) dispatch(fetchMembers(teamId));
  }, [dispatch, teamId]);

  if (!teamId) return null;

  const pending = items.filter((m) => m.status === "pending");
  const approved = items.filter((m) => m.status === "approved");
  const leaderCount = approved.filter((m) => m.role === "leader").length;

  return (
    <div className="flex flex-col overflow-y-auto">
      <Header title="Membros do time" />

      <div className="flex-1 space-y-6 p-6">
        {error && (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-gray-300">
            Solicitações pendentes ({pending.length})
          </h2>
          <div className="rounded-lg border border-gray-800 bg-gray-900">
            <Table>
              <TableBody>
                {pending.map((m) => (
                  <TableRow key={m.user_id} className="border-gray-800">
                    <TableCell className="text-sm text-white">
                      {m.email ?? m.user_id}
                    </TableCell>
                    <TableCell className="w-56 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-green-400 hover:text-green-300"
                        disabled={busy}
                        onClick={() =>
                          dispatch(
                            updateMember({
                              teamId,
                              userId: m.user_id,
                              changes: { status: "approved" },
                            })
                          )
                        }
                      >
                        <Check className="h-3.5 w-3.5" /> Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-red-400 hover:text-red-300"
                        disabled={busy}
                        onClick={() =>
                          dispatch(removeMember({ teamId, userId: m.user_id }))
                        }
                      >
                        <X className="h-3.5 w-3.5" /> Recusar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {pending.length === 0 && (
                  <TableRow className="border-gray-800">
                    <TableCell className="py-6 text-center text-sm text-gray-500">
                      {loading
                        ? "Carregando..."
                        : "Nenhuma solicitação pendente."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-gray-300">
            Membros ({approved.length}) · Líderes {leaderCount}/{MAX_LEADERS}
          </h2>
          <div className="rounded-lg border border-gray-800 bg-gray-900">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800 hover:bg-transparent">
                  <TableHead className="text-gray-400">E-mail</TableHead>
                  <TableHead className="w-32 text-gray-400">Papel</TableHead>
                  <TableHead className="w-64 text-gray-400" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {approved.map((m) => {
                  const isMe = m.email === myEmail;
                  const isLeader = m.role === "leader";
                  const leaderSlotsFull = leaderCount >= MAX_LEADERS;
                  return (
                    <TableRow key={m.user_id} className="border-gray-800">
                      <TableCell className="text-sm text-white">
                        {m.email ?? m.user_id}
                        {isMe && (
                          <span className="ml-2 text-xs text-gray-500">
                            (você)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-300">
                        {isLeader ? "Líder" : "Membro"}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isMe && (
                          <>
                            {!isLeader && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1 text-indigo-400 hover:text-indigo-300"
                                disabled={busy || leaderSlotsFull}
                                title={
                                  leaderSlotsFull
                                    ? "O time já tem 2 líderes"
                                    : "Promover a líder"
                                }
                                onClick={() =>
                                  dispatch(
                                    updateMember({
                                      teamId,
                                      userId: m.user_id,
                                      changes: { role: "leader" },
                                    })
                                  )
                                }
                              >
                                <Crown className="h-3.5 w-3.5" /> Promover
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-400 hover:text-red-300"
                              disabled={busy}
                              onClick={() =>
                                dispatch(
                                  removeMember({ teamId, userId: m.user_id })
                                )
                              }
                            >
                              Remover
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}

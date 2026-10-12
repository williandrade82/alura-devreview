import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Pencil, Plus } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TEAM_NAME_MAX_LENGTH } from "@/lib/limits";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setActiveTeam } from "@/store/slices/authSlice";
import {
  clearTeamError,
  createTeam,
  renameTeam,
} from "@/store/slices/teamsSlice";

/** Gestão de times (só administradores): criar e renomear. */
export function TeamsPage() {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector((s) => s.auth.isAdmin);
  const teams = useAppSelector((s) => s.auth.teams);
  const activeTeamId = useAppSelector((s) => s.auth.teamId);
  const { saving, error } = useAppSelector((s) => s.teams);

  // `undefined` = modal fechado, `null` = novo time, string = renomeando.
  const [editingId, setEditingId] = useState<string | null | undefined>(
    undefined
  );
  const [name, setName] = useState("");

  if (!isAdmin) return <Navigate to="/" replace />;

  const isModalOpen = editingId !== undefined;
  const canSave = !saving && name.trim() !== "";

  function handleOpenNew() {
    dispatch(clearTeamError());
    setName("");
    setEditingId(null);
  }

  function handleOpenEdit(id: string, currentName: string) {
    dispatch(clearTeamError());
    setName(currentName);
    setEditingId(id);
  }

  function handleClose() {
    dispatch(clearTeamError());
    setEditingId(undefined);
  }

  async function handleSave() {
    if (!canSave) return;
    const trimmed = name.trim();
    const result = editingId
      ? await dispatch(renameTeam({ id: editingId, name: trimmed }))
      : await dispatch(createTeam(trimmed));
    if (result.meta.requestStatus === "fulfilled") setEditingId(undefined);
  }

  return (
    <div className="flex flex-col overflow-y-auto">
      <Header
        title="Times"
        action={
          <Button
            size="sm"
            className="gap-2 bg-indigo-600 hover:bg-indigo-500"
            onClick={handleOpenNew}
          >
            <Plus className="h-4 w-4" />
            Novo time
          </Button>
        }
      />

      <div className="flex-1 space-y-4 p-6">
        <div className="rounded-lg border border-gray-800 bg-gray-900">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-800 hover:bg-transparent">
                <TableHead className="text-gray-400">Time</TableHead>
                <TableHead className="w-48 text-gray-400" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team) => (
                <TableRow key={team.id} className="border-gray-800">
                  <TableCell className="text-sm text-white">
                    {team.name}
                    {team.id === activeTeamId && (
                      <span className="ml-2 text-xs text-gray-500">
                        (time ativo)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {team.id !== activeTeamId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-indigo-400 hover:text-indigo-300"
                        onClick={() => dispatch(setActiveTeam(team.id))}
                      >
                        Abrir
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-500 hover:text-white"
                      title="Renomear time"
                      aria-label="Renomear time"
                      onClick={() => handleOpenEdit(team.id, team.name)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {teams.length === 0 && (
                <TableRow className="border-gray-800">
                  <TableCell
                    colSpan={2}
                    className="py-10 text-center text-sm text-gray-500"
                  >
                    Nenhum time cadastrado. Crie o primeiro.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-gray-500">
          Depois de criar um time, use a tela de Membros para adicionar o
          primeiro líder.
        </p>
      </div>

      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => !open && handleClose()}
      >
        <DialogContent className="border-gray-800 bg-gray-900 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Renomear time" : "Novo time"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <Label htmlFor="team-name" className="text-gray-300">
              Nome do time
            </Label>
            <Input
              id="team-name"
              maxLength={TEAM_NAME_MAX_LENGTH}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Data Platform"
              className="border-gray-700 bg-gray-800 text-white placeholder:text-gray-600"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              className="text-gray-400 hover:text-white"
              onClick={handleClose}
            >
              Cancelar
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-500"
              disabled={!canSave}
              onClick={handleSave}
            >
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

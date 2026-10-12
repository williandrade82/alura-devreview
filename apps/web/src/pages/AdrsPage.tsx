import { useEffect, useState } from "react";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  selectAdrCountByStatus,
  selectFilteredAdrs,
} from "@/store/selectors";
import {
  clearAdrActionError,
  createAdr,
  deleteAdr,
  fetchAdrs,
  setStatusFilter,
  updateAdr,
} from "@/store/slices/adrsSlice";
import { AdrStatus } from "@/types";
import { ADR_TEXT_MAX_LENGTH, ADR_TITLE_MAX_LENGTH } from "@/lib/limits";
import { cn } from "@/lib/utils";

const statusConfig: Record<
  AdrStatus,
  { label: string; className: string }
> = {
  proposed: {
    label: "Proposta",
    className:
      "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  },
  accepted: {
    label: "Aceita",
    className:
      "bg-green-500/20 text-green-400 border border-green-500/30",
  },
  deprecated: {
    label: "Depreciada",
    className:
      "bg-gray-500/20 text-gray-400 border border-gray-500/30",
  },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const tabItems: { value: AdrStatus | "all"; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "proposed", label: "Propostas" },
  { value: "accepted", label: "Aceitas" },
  { value: "deprecated", label: "Depreciadas" },
];

export function AdrsPage() {
  const dispatch = useAppDispatch();
  const { items: adrs, statusFilter, saving, actionError } = useAppSelector(
    (s) => s.adrs
  );

  const filtered = useAppSelector(selectFilteredAdrs);
  const countByStatus = useAppSelector(selectAdrCountByStatus);
  const teamId = useAppSelector((s) => s.auth.teamId);
  const isLeader = useAppSelector((s) => s.auth.role === "leader");

  // `undefined` = modal fechado, `null` = nova ADR, string = editando.
  const [editingId, setEditingId] = useState<string | null | undefined>(
    undefined
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContext, setFormContext] = useState("");
  const [formDecision, setFormDecision] = useState("");
  const [formStatus, setFormStatus] = useState<AdrStatus>("proposed");

  useEffect(() => {
    if (teamId) dispatch(fetchAdrs(teamId));
  }, [dispatch, teamId]);

  const isModalOpen = editingId !== undefined;
  const deletingAdr = deletingId ? adrs.find((a) => a.id === deletingId) : null;
  const canSave =
    !saving &&
    formTitle.trim() !== "" &&
    formContext.trim() !== "" &&
    formDecision.trim() !== "";

  function handleOpenNew() {
    dispatch(clearAdrActionError());
    setFormTitle("");
    setFormContext("");
    setFormDecision("");
    setFormStatus("proposed");
    setEditingId(null);
  }

  function handleOpenEdit(id: string) {
    const adr = adrs.find((a) => a.id === id);
    if (!adr) return;
    dispatch(clearAdrActionError());
    setFormTitle(adr.title);
    setFormContext(adr.context);
    setFormDecision(adr.decision);
    setFormStatus(adr.status);
    setEditingId(id);
  }

  function handleCloseModal() {
    dispatch(clearAdrActionError());
    setEditingId(undefined);
  }

  async function handleSave() {
    if (!canSave || !teamId) return;
    const input = {
      title: formTitle.trim(),
      context: formContext.trim(),
      decision: formDecision.trim(),
      status: formStatus,
    };
    const result = editingId
      ? await dispatch(updateAdr({ id: editingId, changes: input }))
      : await dispatch(createAdr({ teamId, input }));
    if (result.meta.requestStatus === "fulfilled") setEditingId(undefined);
  }

  async function handleConfirmDelete() {
    if (!deletingId) return;
    const result = await dispatch(deleteAdr(deletingId));
    if (deleteAdr.fulfilled.match(result)) setDeletingId(null);
  }

  function handleCloseDelete() {
    dispatch(clearAdrActionError());
    setDeletingId(null);
  }

  return (
    <div className="flex flex-col overflow-y-auto">
      <Header
        title="ADRs — Decisões de Arquitetura"
        action={
          isLeader && (
            <Button
              size="sm"
              className="gap-2 bg-indigo-600 hover:bg-indigo-500"
              onClick={handleOpenNew}
            >
              <Plus className="h-4 w-4" />
              Nova ADR
            </Button>
          )
        }
      />

      <div className="flex-1 space-y-5 p-6">
        {actionError && !isModalOpen && !deletingId && (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {actionError}
          </p>
        )}

        {/* Tabs filter */}
        <Tabs
          value={statusFilter}
          onValueChange={(v) => dispatch(setStatusFilter(v as AdrStatus | "all"))}
        >
          <TabsList className="bg-gray-900 border border-gray-800">
            {tabItems.map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="data-[state=active]:bg-gray-800 data-[state=active]:text-white text-gray-400"
              >
                {label}
                {value !== "all" && (
                  <span className="ml-1.5 text-xs text-gray-600">
                    ({countByStatus[value as AdrStatus]})
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Cards grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((adr) => {
            const { label, className: statusClass } = statusConfig[adr.status];
            return (
              <div
                key={adr.id}
                className="flex flex-col rounded-lg border border-gray-800 bg-gray-900 p-5 transition-colors hover:border-gray-700"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold leading-snug text-white">
                    {adr.title}
                  </h3>
                  <span
                    className={cn(
                      "flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      statusClass
                    )}
                  >
                    {label}
                  </span>
                </div>

                {/* Date */}
                <p className="mt-1 text-xs text-gray-600">
                  {formatDate(adr.created_at)}
                </p>

                {/* Context */}
                <div className="mt-3 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Contexto
                  </p>
                  <p className="mt-1 text-sm text-gray-400 line-clamp-2">
                    {adr.context}
                  </p>
                </div>

                {/* Decision */}
                <div className="mt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Decisão
                  </p>
                  <p className="mt-1 text-sm italic text-gray-400 line-clamp-2">
                    {adr.decision}
                  </p>
                </div>

                {/* Footer */}
                <div className="mt-4 flex items-center justify-between text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3 w-3" />
                    <span className="text-xs">ADR-{adr.id.slice(0, 3).toUpperCase()}</span>
                  </div>
                  {isLeader && (
                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-500 hover:text-white"
                        title="Editar ADR"
                        aria-label="Editar ADR"
                        onClick={() => handleOpenEdit(adr.id)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-500 hover:text-red-400"
                        title="Excluir ADR"
                        aria-label="Excluir ADR"
                        onClick={() => setDeletingId(adr.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full py-16 text-center text-sm text-gray-500">
              Nenhuma ADR encontrada para este filtro.
            </div>
          )}
        </div>
      </div>

      {/* Criar / editar */}
      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => !open && handleCloseModal()}
      >
        <DialogContent className="border-gray-800 bg-gray-900 text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar ADR" : "Nova ADR"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="adr-title" className="text-gray-300">
                Título
              </Label>
              <Input
                id="adr-title"
                maxLength={ADR_TITLE_MAX_LENGTH}
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Ex: Adotar Redux Toolkit para estado global"
                className="border-gray-700 bg-gray-800 text-white placeholder:text-gray-600"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adr-context" className="text-gray-300">
                Contexto
              </Label>
              <textarea
                id="adr-context"
                maxLength={ADR_TEXT_MAX_LENGTH}
                rows={3}
                value={formContext}
                onChange={(e) => setFormContext(e.target.value)}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adr-decision" className="text-gray-300">
                Decisão
              </Label>
              <textarea
                id="adr-decision"
                maxLength={ADR_TEXT_MAX_LENGTH}
                rows={3}
                value={formDecision}
                onChange={(e) => setFormDecision(e.target.value)}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-gray-300">Status</Label>
              <Select
                value={formStatus}
                onValueChange={(v) => setFormStatus(v as AdrStatus)}
              >
                <SelectTrigger className="border-gray-700 bg-gray-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-gray-700 bg-gray-900">
                  <SelectItem value="proposed">Proposta</SelectItem>
                  <SelectItem value="accepted">Aceita</SelectItem>
                  <SelectItem value="deprecated">Depreciada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {actionError && (
              <p className="text-sm text-red-400">{actionError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              className="text-gray-400 hover:text-white"
              onClick={handleCloseModal}
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

      {/* Confirmação de exclusão */}
      <Dialog
        open={Boolean(deletingAdr)}
        onOpenChange={(open) => !open && handleCloseDelete()}
      >
        <DialogContent className="border-gray-800 bg-gray-900 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir ADR</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-300">
            Tem certeza que deseja excluir esta ADR? Esta ação não pode ser
            desfeita.
          </p>
          {deletingAdr && (
            <p className="rounded-md border border-gray-800 bg-gray-800/50 px-3 py-2 text-sm text-gray-200">
              {deletingAdr.title}
            </p>
          )}
          {actionError && (
            <p className="text-sm text-red-400">{actionError}</p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              className="text-gray-400 hover:text-white"
              onClick={handleCloseDelete}
            >
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-500"
              disabled={saving}
              onClick={handleConfirmDelete}
            >
              {saving ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

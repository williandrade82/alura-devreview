import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Power } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { CategoryBadge } from "@/components/shared/CategoryBadge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectFilteredRules } from "@/store/selectors";
import { RULE_MAX_LENGTH } from "@/lib/limits";
import {
  fetchRules,
  setCategoryFilter,
  setSeverityFilter,
  openModal,
  closeModal,
  clearActionError,
  createRule,
  updateRule,
  deleteRule,
} from "@/store/slices/rulesSlice";
import { RuleCategory, RuleSeverity } from "@/types";

export function RulesPage() {
  const dispatch = useAppDispatch();
  const {
    items: rules,
    categoryFilter,
    severityFilter,
    isModalOpen,
    editingRuleId,
    saving,
    actionError,
  } = useAppSelector((s) => s.rules);
  const teamId = useAppSelector((s) => s.auth.teamId);
  const isLeader = useAppSelector((s) => s.auth.role === "leader");
  const filtered = useAppSelector(selectFilteredRules);

  const [formRule, setFormRule] = useState("");
  const [formCategory, setFormCategory] = useState<RuleCategory>("style");
  const [formSeverity, setFormSeverity] = useState<RuleSeverity>("warning");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (teamId) dispatch(fetchRules(teamId));
  }, [dispatch, teamId]);

  const editingRule = editingRuleId
    ? rules.find((r) => r.id === editingRuleId)
    : null;

  function handleOpenNew() {
    setFormRule("");
    setFormCategory("style");
    setFormSeverity("warning");
    dispatch(openModal(null));
  }

  function handleOpenEdit(id: string) {
    const rule = rules.find((r) => r.id === id);
    if (rule) {
      setFormRule(rule.rule);
      setFormCategory(rule.category);
      setFormSeverity(rule.severity);
      dispatch(openModal(id));
    }
  }

  const deletingRule = deletingId
    ? rules.find((r) => r.id === deletingId)
    : null;
  const canSave = formRule.trim().length > 0 && !saving;

  function handleSave() {
    const input = {
      rule: formRule.trim(),
      category: formCategory,
      severity: formSeverity,
    };
    if (!input.rule || !teamId) return;
    if (editingRuleId) {
      dispatch(updateRule({ id: editingRuleId, changes: input }));
    } else {
      dispatch(createRule({ teamId, input }));
    }
  }

  function handleToggleActive(id: string, active: boolean) {
    dispatch(updateRule({ id, changes: { active: !active } }));
  }

  async function handleConfirmDelete() {
    if (!deletingId) return;
    const result = await dispatch(deleteRule(deletingId));
    if (deleteRule.fulfilled.match(result)) setDeletingId(null);
  }

  function handleCloseDelete() {
    setDeletingId(null);
    dispatch(clearActionError());
  }

  return (
    <div className="flex flex-col overflow-y-auto">
      <Header
        title="Regras de Review"
        action={
          isLeader && (
          <Button
            size="sm"
            className="gap-2 bg-indigo-600 hover:bg-indigo-500"
            onClick={handleOpenNew}
          >
            <Plus className="h-4 w-4" />
            Nova Regra
          </Button>
          )
        }
      />

      <div className="flex-1 space-y-4 p-6">
        {actionError && !isModalOpen && !deletingId && (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {actionError}
          </p>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3">
          <Select
            value={categoryFilter}
            onValueChange={(v) =>
              dispatch(setCategoryFilter(v as RuleCategory | "all"))
            }
          >
            <SelectTrigger className="w-44 border-gray-700 bg-gray-900 text-sm">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent className="border-gray-700 bg-gray-900">
              <SelectItem value="all">Todas categorias</SelectItem>
              <SelectItem value="style">Estilo</SelectItem>
              <SelectItem value="architecture">Arquitetura</SelectItem>
              <SelectItem value="security">Segurança</SelectItem>
              <SelectItem value="performance">Performance</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={severityFilter}
            onValueChange={(v) =>
              dispatch(setSeverityFilter(v as RuleSeverity | "all"))
            }
          >
            <SelectTrigger className="w-40 border-gray-700 bg-gray-900 text-sm">
              <SelectValue placeholder="Severidade" />
            </SelectTrigger>
            <SelectContent className="border-gray-700 bg-gray-900">
              <SelectItem value="all">Todas severidades</SelectItem>
              <SelectItem value="error">Erro</SelectItem>
              <SelectItem value="warning">Aviso</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>

          <span className="ml-auto text-xs text-gray-500">
            {filtered.length} regra{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-gray-800 bg-gray-900">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-800 hover:bg-transparent">
                <TableHead className="text-gray-400">Regra</TableHead>
                <TableHead className="w-36 text-gray-400">Categoria</TableHead>
                <TableHead className="w-28 text-gray-400">Severidade</TableHead>
                <TableHead className="w-24 text-gray-400">Status</TableHead>
                <TableHead className={isLeader ? "w-32 text-gray-400" : "w-0"} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((rule) => (
                <TableRow
                  key={rule.id}
                  className="border-gray-800 hover:bg-gray-800/50"
                >
                  <TableCell
                    className={
                      rule.active
                        ? "text-sm text-white"
                        : "text-sm text-gray-500"
                    }
                  >
                    {rule.rule}
                  </TableCell>
                  <TableCell>
                    <CategoryBadge category={rule.category} />
                  </TableCell>
                  <TableCell>
                    <SeverityBadge severity={rule.severity} />
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        rule.active
                          ? "inline-flex items-center rounded-full border border-green-500/30 bg-green-500/20 px-2.5 py-0.5 text-xs font-medium text-green-400"
                          : "inline-flex items-center rounded-full border border-gray-600/30 bg-gray-600/20 px-2.5 py-0.5 text-xs font-medium text-gray-400"
                      }
                    >
                      {rule.active ? "Ativa" : "Inativa"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {isLeader && (
                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-500 hover:text-white"
                        title={rule.active ? "Desativar regra" : "Ativar regra"}
                        aria-label={
                          rule.active ? "Desativar regra" : "Ativar regra"
                        }
                        disabled={saving}
                        onClick={() => handleToggleActive(rule.id, rule.active)}
                      >
                        <Power
                          className={
                            rule.active
                              ? "h-3.5 w-3.5 text-green-400"
                              : "h-3.5 w-3.5"
                          }
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-500 hover:text-white"
                        title="Editar regra"
                        aria-label="Editar regra"
                        onClick={() => handleOpenEdit(rule.id)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-500 hover:text-red-400"
                        title="Excluir regra"
                        aria-label="Excluir regra"
                        onClick={() => setDeletingId(rule.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow className="border-gray-800">
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-sm text-gray-500"
                  >
                    Nenhuma regra encontrada com os filtros selecionados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Modal */}
      <Dialog open={isModalOpen} onOpenChange={() => dispatch(closeModal())}>
        <DialogContent className="border-gray-800 bg-gray-900 text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? "Editar Regra" : "Nova Regra"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rule-text" className="text-gray-300">
                Descrição da regra
              </Label>
              <Input
                id="rule-text"
                maxLength={RULE_MAX_LENGTH}
                value={formRule}
                onChange={(e) => setFormRule(e.target.value)}
                placeholder="Ex: Nunca expor tokens em código-fonte"
                className="border-gray-700 bg-gray-800 text-white placeholder:text-gray-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-gray-300">Categoria</Label>
                <Select
                  value={formCategory}
                  onValueChange={(v) => setFormCategory(v as RuleCategory)}
                >
                  <SelectTrigger className="border-gray-700 bg-gray-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-gray-700 bg-gray-900">
                    <SelectItem value="style">Estilo</SelectItem>
                    <SelectItem value="architecture">Arquitetura</SelectItem>
                    <SelectItem value="security">Segurança</SelectItem>
                    <SelectItem value="performance">Performance</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-gray-300">Severidade</Label>
                <Select
                  value={formSeverity}
                  onValueChange={(v) => setFormSeverity(v as RuleSeverity)}
                >
                  <SelectTrigger className="border-gray-700 bg-gray-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-gray-700 bg-gray-900">
                    <SelectItem value="error">Erro</SelectItem>
                    <SelectItem value="warning">Aviso</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {actionError && (
              <p className="text-sm text-red-400">{actionError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              className="text-gray-400 hover:text-white"
              onClick={() => dispatch(closeModal())}
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
        open={Boolean(deletingRule)}
        onOpenChange={(open) => !open && handleCloseDelete()}
      >
        <DialogContent className="border-gray-800 bg-gray-900 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir regra</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-300">
            Tem certeza que deseja excluir esta regra? Esta ação não pode ser
            desfeita.
          </p>
          {deletingRule && (
            <p className="rounded-md border border-gray-800 bg-gray-800/50 px-3 py-2 text-sm text-gray-200">
              {deletingRule.rule}
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

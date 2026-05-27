import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { parseExcelFile } from "@/utils/importUtils";
import { isApiEnabled } from "@/config/api";
import * as api from "@/services/api";
import type { ExcelImportPreview } from "@/services/api";

const MAX_IMPORT_SIZE_MB = 25;
const MAX_IMPORT_SIZE_BYTES = MAX_IMPORT_SIZE_MB * 1024 * 1024;
const IMPORT_CONFIRMATION_PHRASES = {
  schedule: "SUBSTITUIR CRONOGRAMA",
  adminFull: "SUBSTITUIR TUDO",
  adminBackup: "CONFIRMO BACKUP",
  xml: "SUBSTITUIR CRONOGRAMA",
} as const;

type PendingImportKind = "excel" | "xml";
type ExcelImportMode = "schedule" | "adminFull";

export default function ExcelImport({ mode = "schedule" }: { mode?: ExcelImportMode }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [destructiveConfirmationText, setDestructiveConfirmationText] = useState("");
  const [replanJustification, setReplanJustification] = useState("");
  const [backupAcknowledged, setBackupAcknowledged] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingImportKind, setPendingImportKind] = useState<PendingImportKind | null>(null);
  const [preview, setPreview] = useState<ExcelImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { setProjetos, setTarefas, setRecursos, refreshAll } = useData();
  const isAdminFull = mode === "adminFull";
  const accept = isAdminFull ? ".xlsx,.xlsm" : ".xlsx,.xlsm,.xml";
  const buttonLabel = isAdminFull ? "Importação completa" : "Importar Cronograma";

  const resetSelection = () => {
    setPendingFile(null);
    setPendingImportKind(null);
    setConfirmationText("");
    setDestructiveConfirmationText("");
    setReplanJustification("");
    setBackupAcknowledged(false);
    setPreview(null);
    setPreviewLoading(false);
    setConfirmOpen(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const executeImport = async (file: File, ext: string) => {
    setLoading(true);
    try {
      if (isApiEnabled()) {
        if (ext === "xml") {
          const result = await api.importMsProject(file, { replanJustification });
          await refreshAll();
          toast({
            title: "Cronograma MS Project importado",
            description: `${result.imported.project}: ${result.imported.tarefas} tarefas e ${result.imported.recursos} recursos`,
          });
        } else {
          const result = await api.importExcel(file, {
            mode: isAdminFull ? "replace_all" : "replace_project",
            confirmationText,
            destructiveConfirmation: destructiveConfirmationText,
            backupAcknowledged,
            replanJustification,
          });
          await refreshAll();
          toast({
            title: isAdminFull ? "Importação administrativa concluída" : "Cronograma importado",
            description: `Importados: ${result.imported.projetos} projetos, ${result.imported.tarefas} tarefas, ${result.imported.recursos} recursos`,
          });
        }
        return;
      }

      if (ext === "xml") {
        throw new Error("A importação de MS Project XML exige backend ativo.");
      }

      const result = await parseExcelFile(file);

      if (result.projetos) setProjetos(result.projetos);
      if (result.tarefas) setTarefas(result.tarefas);
      if (result.recursos) setRecursos(result.recursos);

      const parts: string[] = [];
      if (result.counts.projetos) parts.push(`${result.counts.projetos} projetos`);
      if (result.counts.tarefas) parts.push(`${result.counts.tarefas} tarefas`);
      if (result.counts.recursos) parts.push(`${result.counts.recursos} recursos`);

      toast({
        title: "Importação concluída",
        description: parts.length ? `Importados: ${parts.join(", ")}` : "Nenhuma aba reconhecida encontrada",
      });
    } catch (err) {
      console.error("Import error:", err);
      toast({
        title: "Erro na importação",
        description: err instanceof Error ? err.message : "Verifique o arquivo selecionado",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      resetSelection();
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    const allowedExtensions = isAdminFull ? ["xlsx", "xlsm"] : ["xlsx", "xlsm", "xml"];
    if (!allowedExtensions.includes(ext || "")) {
      toast({
        title: "Formato inválido",
        description: isAdminFull ? "Selecione um arquivo .xlsx ou .xlsm" : "Selecione um arquivo .xlsx, .xlsm ou .xml",
        variant: "destructive",
      });
      resetSelection();
      return;
    }

    if (file.size > MAX_IMPORT_SIZE_BYTES) {
      toast({
        title: "Arquivo muito grande",
        description: `O limite é ${MAX_IMPORT_SIZE_MB} MB`,
        variant: "destructive",
      });
      resetSelection();
      return;
    }

    if (isAdminFull && isApiEnabled() && user?.role !== "admin") {
      toast({
        title: "Importação restrita",
        description: "A importação Excel com substituição total é permitida apenas para administradores.",
        variant: "destructive",
      });
      resetSelection();
      return;
    }

    setPendingFile(file);
    setPendingImportKind(ext === "xml" ? "xml" : "excel");
    setConfirmationText("");
    setDestructiveConfirmationText("");
    setReplanJustification("");
    setBackupAcknowledged(false);
    setPreview(null);
    setConfirmOpen(true);

    if (isApiEnabled()) {
      setPreviewLoading(true);
      try {
        const nextPreview = ext === "xml"
          ? await api.previewMsProjectImport(file)
          : await api.previewExcelImport(file);
        setPreview(nextPreview);
      } catch (err) {
        toast({
          title: "Prévia indisponível",
          description: err instanceof Error ? err.message : "Não foi possível calcular o impacto da importação.",
          variant: "destructive",
        });
        resetSelection();
      } finally {
        setPreviewLoading(false);
      }
    }
  };

  const expectedPhrase = pendingImportKind
    ? pendingImportKind === "xml"
      ? IMPORT_CONFIRMATION_PHRASES.xml
      : IMPORT_CONFIRMATION_PHRASES[mode]
    : "";
  const hasBackupConfirmation = !isAdminFull
    || (
      backupAcknowledged
      && destructiveConfirmationText.trim().toUpperCase() === IMPORT_CONFIRMATION_PHRASES.adminBackup
    );
  const hasReplanJustification = !preview?.requiresReplanJustification || replanJustification.trim().length >= 10;
  const canConfirm = !!pendingFile
    && !!pendingImportKind
    && confirmationText.trim().toUpperCase() === expectedPhrase
    && hasBackupConfirmation
    && hasReplanJustification;

  const handleConfirmImport = async () => {
    if (!pendingFile || !pendingImportKind) return;
    await executeImport(pendingFile, pendingImportKind === "xml" ? "xml" : "xlsx");
  };

  const impactLabel: Record<string, string> = {
    projectsToCreate: "Projetos a criar",
    projectsToUpdate: "Projetos a atualizar",
    projectsToPreserve: "Projetos preservados",
    projectsToDelete: "Projetos a apagar",
    tasksToCreate: "Tarefas a criar",
    tasksToReplace: "Tarefas a substituir",
    tasksToDelete: "Tarefas a apagar",
    dependenciesToReplace: "Dependências a substituir",
    dependenciesToDelete: "Dependências a apagar",
    assignmentsToReplace: "Alocações a substituir",
    assignmentsToDelete: "Alocações a apagar",
    resourcesToCreate: "Recursos a criar",
    resourcesToReuse: "Recursos reutilizados",
    resourcesToPreserve: "Recursos preservados",
    resourcesToDelete: "Recursos a apagar",
  };

  const impactEntries = preview
    ? Object.entries(preview.impact).filter(([, value]) => Number(value) > 0)
    : [];
  const baselineImpact = preview?.baselineImpact;
  const formatNumber = (value?: number) => Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const formatCurrency = (value?: number) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const formatDelta = (value?: number, suffix = "") => {
    const amount = Number(value || 0);
    const sign = amount > 0 ? "+" : "";
    return `${sign}${formatNumber(amount)}${suffix}`;
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFile}
        className="hidden"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="gap-1.5"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        {buttonLabel}
      </Button>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open && !loading) resetSelection();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isAdminFull ? "Confirmar importação administrativa" : "Confirmar importação de cronograma"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {pendingImportKind === "xml"
                ? "Esta importação substituirá o cronograma existente do projeto encontrado no XML, incluindo tarefas, vínculos e alocações relacionadas."
                : isAdminFull
                  ? "Esta importação substituirá em lote os dados importáveis do ambiente, incluindo projetos, tarefas, dependências, alocações e recursos."
                  : "Esta importação Excel substituirá apenas o cronograma do projeto encontrado no arquivo, preservando os demais projetos do ambiente."}
            </p>

            {pendingImportKind ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                {previewLoading ? (
                  <p className="text-sm text-muted-foreground">Calculando prévia de impacto...</p>
                ) : preview ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={preview.importType === "admin_full" ? "destructive" : "secondary"}>
                        {preview.importType === "admin_full"
                          ? "Substituição completa"
                          : preview.importType === "ms_project_xml"
                            ? "MS Project XML"
                            : "Cronograma por projeto"}
                      </Badge>
                      {preview.projectName ? (
                        <span className="text-sm font-medium text-foreground">{preview.projectName}</span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md border border-border bg-background p-2">
                        <p className="text-xs text-muted-foreground">Projetos no arquivo</p>
                        <p className="text-lg font-semibold text-foreground">{preview.incoming.projetos}</p>
                      </div>
                      <div className="rounded-md border border-border bg-background p-2">
                        <p className="text-xs text-muted-foreground">Tarefas no arquivo</p>
                        <p className="text-lg font-semibold text-foreground">{preview.incoming.tarefas}</p>
                      </div>
                      <div className="rounded-md border border-border bg-background p-2">
                        <p className="text-xs text-muted-foreground">Recursos no arquivo</p>
                        <p className="text-lg font-semibold text-foreground">{preview.incoming.recursos}</p>
                      </div>
                    </div>
                    {impactEntries.length ? (
                      <div className="grid gap-1.5 text-sm">
                        {impactEntries.map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">{impactLabel[key] || key}</span>
                            <span className="font-medium text-foreground">{value}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhuma alteração relevante encontrada na prévia.</p>
                    )}
                    {baselineImpact ? (
                      <div className="rounded-md border border-border bg-background p-3 text-sm">
                        {baselineImpact.hasOfficialBaseline ? (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium text-foreground">Comparação com baseline oficial</span>
                              <Badge variant="outline">
                                LB {baselineImpact.baselineNumber} · {baselineImpact.baselineName}
                              </Badge>
                            </div>
                            <div className="grid gap-1.5">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">Variação de tarefas</span>
                                <span className="font-medium text-foreground">{formatDelta(baselineImpact.taskCountDelta)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">Variação de esforço</span>
                                <span className="font-medium text-foreground">{formatDelta(baselineImpact.plannedEffortDelta, "h")}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">Variação de custo</span>
                                <span className="font-medium text-foreground">{formatCurrency(baselineImpact.plannedCostDelta)}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-muted-foreground">
                            Nenhuma baseline oficial encontrada para comparar este replanejamento.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">A prévia será exibida antes da confirmação.</p>
                )}
              </div>
            ) : null}

            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
              Digite <strong>{expectedPhrase}</strong> para confirmar.
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-confirmation">Confirmação</Label>
              <Input
                id="import-confirmation"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder={expectedPhrase}
                autoComplete="off"
              />
            </div>

            {preview?.requiresReplanJustification ? (
              <div className="space-y-2">
                <Label htmlFor="replan-justification">Justificativa do replanejamento</Label>
                <Input
                  id="replan-justification"
                  value={replanJustification}
                  onChange={(e) => setReplanJustification(e.target.value)}
                  placeholder="Explique o motivo da substituição do cronograma"
                  autoComplete="off"
                />
              </div>
            ) : null}

            {isAdminFull ? (
              <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <p className="text-sm text-foreground">
                  Esta ação só deve ser executada depois de salvar um backup recente e verificável do banco.
                </p>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="backup-acknowledged"
                    checked={backupAcknowledged}
                    onCheckedChange={(value) => setBackupAcknowledged(value === true)}
                  />
                  <Label htmlFor="backup-acknowledged" className="text-sm leading-5">
                    Confirmo que existe backup recente salvo fora do ambiente de produção.
                  </Label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="backup-confirmation">Confirmação de backup</Label>
                  <Input
                    id="backup-confirmation"
                    value={destructiveConfirmationText}
                    onChange={(e) => setDestructiveConfirmationText(e.target.value)}
                    placeholder={IMPORT_CONFIRMATION_PHRASES.adminBackup}
                    autoComplete="off"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => resetSelection()} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={() => void handleConfirmImport()} disabled={!canConfirm || loading || previewLoading}>
              {loading ? "Importando..." : "Confirmar importação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

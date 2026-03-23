import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { parseExcelFile } from "@/utils/importUtils";
import { isApiEnabled } from "@/config/api";
import * as api from "@/services/api";

const MAX_IMPORT_SIZE_MB = 25;
const MAX_IMPORT_SIZE_BYTES = MAX_IMPORT_SIZE_MB * 1024 * 1024;
const IMPORT_CONFIRMATION_PHRASES = {
  excel: "SUBSTITUIR TUDO",
  xml: "SUBSTITUIR CRONOGRAMA",
} as const;

type PendingImportKind = "excel" | "xml";

export default function ExcelImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingImportKind, setPendingImportKind] = useState<PendingImportKind | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { setProjetos, setTarefas, setRecursos, refreshAll } = useData();

  const resetSelection = () => {
    setPendingFile(null);
    setPendingImportKind(null);
    setConfirmationText("");
    setConfirmOpen(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const executeImport = async (file: File, ext: string) => {
    setLoading(true);
    try {
      if (isApiEnabled()) {
        if (ext === "xml") {
          const result = await api.importMsProject(file);
          await refreshAll();
          toast({
            title: "Cronograma MS Project importado",
            description: `${result.imported.project}: ${result.imported.tarefas} tarefas e ${result.imported.recursos} recursos`,
          });
        } else {
          const result = await api.importExcel(file);
          await refreshAll();
          toast({
            title: "Importação concluída",
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

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xlsm", "xml"].includes(ext || "")) {
      toast({
        title: "Formato inválido",
        description: "Selecione um arquivo .xlsx, .xlsm ou .xml",
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

    if (ext !== "xml" && isApiEnabled() && user?.role !== "admin") {
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
    setConfirmOpen(true);
  };

  const expectedPhrase = pendingImportKind ? IMPORT_CONFIRMATION_PHRASES[pendingImportKind] : "";
  const canConfirm = !!pendingFile && !!pendingImportKind && confirmationText.trim().toUpperCase() === expectedPhrase;

  const handleConfirmImport = async () => {
    if (!pendingFile || !pendingImportKind) return;
    await executeImport(pendingFile, pendingImportKind === "xml" ? "xml" : "xlsx");
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xlsm,.xml"
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
        Importar Cronograma
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
            <DialogTitle>Confirmar importação destrutiva</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {pendingImportKind === "xml"
                ? "Esta importação substituirá o cronograma existente do projeto encontrado no XML, incluindo tarefas, vínculos e alocações relacionadas."
                : "Esta importação Excel substituirá em lote os dados importáveis do ambiente, incluindo projetos, tarefas, dependências, alocações e recursos."}
            </p>

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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => resetSelection()} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={() => void handleConfirmImport()} disabled={!canConfirm || loading}>
              {loading ? "Importando..." : "Confirmar importação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/contexts/DataContext";
import { parseExcelFile } from "@/utils/importUtils";
import { isApiEnabled } from "@/config/api";
import * as api from "@/services/api";

const MAX_IMPORT_SIZE_MB = 25;
const MAX_IMPORT_SIZE_BYTES = MAX_IMPORT_SIZE_MB * 1024 * 1024;

export default function ExcelImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { setProjetos, setTarefas, setRecursos, refreshAll } = useData();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xlsm", "xml"].includes(ext || "")) {
      toast({ title: "Formato inválido", description: "Selecione um arquivo .xlsx, .xlsm ou .xml", variant: "destructive" });
      return;
    }

    if (file.size > MAX_IMPORT_SIZE_BYTES) {
      toast({
        title: "Arquivo muito grande",
        description: `O limite é ${MAX_IMPORT_SIZE_MB} MB`,
        variant: "destructive",
      });
      return;
    }

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
      toast({ title: "Erro na importação", description: err instanceof Error ? err.message : "Verifique o arquivo selecionado", variant: "destructive" });
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
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
    </>
  );
}

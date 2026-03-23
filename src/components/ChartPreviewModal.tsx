import { useState, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ChartPreviewModalProps {
  title: string;
  description?: string;
  expandedHeight?: number;
  renderChart: (height: number) => ReactNode;
}

export default function ChartPreviewModal({
  title,
  description,
  expandedHeight = 620,
  renderChart,
}: ChartPreviewModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 shrink-0 gap-2 rounded-full px-3"
        onClick={() => setOpen(true)}
        title={`Expandir gráfico: ${title}`}
      >
        <Maximize2 size={14} />
        <span className="text-xs font-medium">Expandir</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[92vh] max-h-[92vh] w-[94vw] max-w-[94vw] flex-col gap-4 overflow-hidden border-border/80 bg-card/98 p-6 shadow-2xl">
          <DialogHeader className="pr-8">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="min-h-0 flex-1 rounded-2xl border border-border/70 bg-background/55 p-4">
            {renderChart(expandedHeight)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

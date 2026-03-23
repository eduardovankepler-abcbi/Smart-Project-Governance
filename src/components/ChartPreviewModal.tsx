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
        size="icon"
        className="h-8 w-8 shrink-0 rounded-full"
        onClick={() => setOpen(true)}
        title={`Expandir gráfico: ${title}`}
      >
        <Maximize2 size={14} />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[92vh] max-h-[92vh] w-[94vw] max-w-[94vw] flex-col gap-4 overflow-hidden border-border/90 bg-card p-6 shadow-2xl">
          <DialogHeader className="pr-8">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="min-h-0 flex-1 rounded-2xl border border-border/80 bg-background p-4">
            {renderChart(expandedHeight)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

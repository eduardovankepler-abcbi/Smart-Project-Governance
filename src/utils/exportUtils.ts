import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

export type PdfColumnStyle = {
  cellWidth?: number | "auto" | "wrap";
  halign?: "left" | "center" | "right";
  overflow?: "linebreak" | "ellipsize" | "visible" | "hidden";
};

export type PdfExportOptions = {
  format?: "a4" | "a3";
  fontSize?: number;
  cellPadding?: number;
  columnStyles?: Record<number, PdfColumnStyle>;
};

export function exportToPdf(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string,
  options: PdfExportOptions = {}
) {
  const doc = new jsPDF({ orientation: "landscape", format: options.format || "a4" });
  doc.setFontSize(16);
  doc.text(title, 14, 18);
  doc.setFontSize(9);
  doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, 14, 25);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 30,
    margin: { left: 10, right: 10 },
    styles: {
      fontSize: options.fontSize || 8,
      cellPadding: options.cellPadding ?? 2,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: { fillColor: [180, 30, 30] },
    columnStyles: options.columnStyles,
  });

  doc.save(`${filename}.pdf`);
}

export async function exportToExcel(
  headers: string[],
  rows: (string | number)[][],
  filename: string,
  sheetName = "Dados"
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row);
  }

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

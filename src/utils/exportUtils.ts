import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

export function exportToPdf(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string
) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(16);
  doc.text(title, 14, 18);
  doc.setFontSize(9);
  doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, 14, 25);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 30,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [180, 30, 30] },
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

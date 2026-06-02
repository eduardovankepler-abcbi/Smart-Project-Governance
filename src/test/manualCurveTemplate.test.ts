import { describe, expect, it } from "vitest";
import {
  normalizeManualCurveTemplateDate,
  normalizeManualCurveTemplateHeader,
  normalizeManualCurveTemplatePercent,
} from "@/utils/manualCurveTemplate";

describe("manual curve template helpers", () => {
  it("normalizes template headers with accents and spacing", () => {
    expect(normalizeManualCurveTemplateHeader("  Observação  ")).toBe("observacao");
    expect(normalizeManualCurveTemplateHeader("Linha   Base  2")).toBe("linha base 2");
  });

  it("normalizes Excel percent values to 0-100 strings", () => {
    expect(normalizeManualCurveTemplatePercent(0.45)).toBe("45");
    expect(normalizeManualCurveTemplatePercent("12,5")).toBe("12.5");
    expect(normalizeManualCurveTemplatePercent(130)).toBe("100");
    expect(normalizeManualCurveTemplatePercent("texto")).toBe("");
  });

  it("normalizes Date, Excel serial and pt-BR date values", () => {
    expect(normalizeManualCurveTemplateDate(new Date(Date.UTC(2026, 5, 1)))).toBe("2026-06-01");
    expect(normalizeManualCurveTemplateDate(45444)).toBe("2024-06-01");
    expect(normalizeManualCurveTemplateDate("02/06/2026")).toBe("2026-06-02");
  });
});

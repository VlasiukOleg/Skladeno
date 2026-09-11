import { defineEventHandler, createError } from "h3";

interface SheetMaterial {
  id: string;
  label: string;
  price: number;
  measure: string;
  volume: number;
  weight: number;
  movingTypeCalculation: string;
}

// Функція перетворення масиву рядків Google Sheets у зручні об'єкти
function convertToObjects(data: string[][]): SheetMaterial[] {
  const keys = data[0].map((k) => k?.trim() || "");
  return data.slice(1).map((row, index) => {
    const obj: any = {
      id: `item-${index}`,
      label: "",
      price: 0,
      measure: "",
      volume: 0,
      weight: 0,
      movingTypeCalculation: "",
    };
    keys.forEach((key, colIndex) => {
      if (key) {
        const val = row[colIndex]?.trim() || "";
        if (key === "price") {
          const cleanVal = val.replace(/\s+/g, "").replace(",", ".");
          obj[key] = parseFloat(cleanVal) || 0;
        } else if (key === "volume" || key === "weight") {
          const cleanVal = val.replace(/\s+/g, "").replace(",", ".");
          obj[key] = parseFloat(cleanVal) || 0;
        } else {
          obj[key] = val;
        }
      }
    });
    return obj as SheetMaterial;
  });
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const sheetName = "TDSheet";
  const sheetId = "1mspPVAdnGfDqwEw_QB_rflYKNPenBiD1ZNubfznXtOw";
  const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetName}?key=${config.googleApiKey}`;

  try {
    const sheetsResponse = await $fetch<{ values: string[][] }>(sheetsUrl);

    if (!sheetsResponse || !sheetsResponse.values) {
      return [];
    }

    const allMaterials = convertToObjects(sheetsResponse.values);

    // Повертаємо всі товари
    return allMaterials;
  } catch (error: any) {
    console.error("Помилка завантаження прайсу з Google Sheets:", error);
    throw createError({
      statusCode: error.status || 500,
      message:
        "Не вдалося завантажити прайс: " + (error.message || "Unknown error"),
    });
  }
});

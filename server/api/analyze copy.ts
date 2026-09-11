import { GoogleGenAI, Type } from "@google/genai";
import { readMultipartFormData } from "h3";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const formData = await readMultipartFormData(event);

  // Увага: тут шукаємо 'file', бо на фронті у нас formData.append('file', ...)
  const file = formData?.find((item) => item.name === "file");

  if (!file) {
    throw createError({ statusCode: 400, message: "Файл не знайдено" });
  }

  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: [
        {
          inlineData: {
            data: file.data.toString("base64"),
            mimeType: file.type || "image/jpeg",
          },
        },
        {
          text: `Ти — висококваліфікований експерт-кошторисник у закупівлях будівельних матеріалів (ринок України).
  Користувач завантажив фото рукописного списку матеріалів для ремонту. Текст може бути написаний специфічним будівельним сленгом або скороченнями.

  Ось ТВОЯ ГОЛОВНА ПІДКАЗКА — будівельний словник скорочень, які найчастіше зустрічаються на таких аркушах:
  - Г.К. / ГК / ГКП / Влагост. = Гіпсокартон (вологостійкий або звичайний). Одиниця виміру завжди ЛИСТИ або ШТ.
  - пєшка / пешка / песчака = П-подібний прямий підвіс для профілю гіпсокартону.
  - блоха / блохи / плоха = маленькі саморізи для кріплення профілів (тексі, клопи) 9.5мм.
  - УД / UD = профіль напрямний (пристінний) для гіпсокартону (зазвичай 3 метри товщина 0.6 або 0.45).
  - СД / CD = профіль стельовий (каркасний) для гіпсокартону (зазвичай 3 метри).
  - ДВП / ВП = Деревоволокниста плита (листовий матеріал).
  - Полістирол 30мм (може виглядати як 'золи' або '30м') = екструдований пінополістирол товщиною 30 міліметрів.
  - 1 уп. (може виглядати як '19м') = одна упаковка.

  Завдання:
  1. Уважно проаналізуй фото, використовуючи цей словник контексту.
  2. Розділи текст на окремі позиції товарів.
  3. Для кожної позиції заповни JSON за схемою:
     - originalText: текст з паперу один в один.
     - normalizedName: повна правильна технічна назва українською мовою для пошуку в базі (наприклад, 'Гіпсокартон вологостійкий 12.5 мм', 'Профіль UD-27 3м 0.6мм', 'Підвіс прямий для профілю').
     - quantity: чисте число (якщо вказано '1 уп', то 1).
     - unit: нормалізована одиниця (шт, мішки, кг, уп, м3, лист).
     - needsClarification: true, якщо почерк взагалі неможливо розібрати.`,
        },
      ],
      config: {
        responseMimeType: "application/json",
        // Змінюємо схему: тепер це об'єкт, який містить масив 'items'
        responseJsonSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              description: "Список знайдених будівельних матеріалів",
              items: {
                type: Type.OBJECT,
                properties: {
                  originalText: {
                    type: Type.STRING,
                    description: "Оригінальний текст позиції з фото",
                  },
                  normalizedName: {
                    type: Type.STRING,
                    description:
                      "Нормалізована назва (без сленгу) для пошуку в базі",
                  },
                  quantity: {
                    type: Type.NUMBER,
                    description: "Кількість",
                  },
                  unit: {
                    type: Type.STRING,
                    description: "Одиниця виміру (шт, кг, літри, мішки)",
                  },
                  needsClarification: {
                    type: Type.BOOLEAN,
                    description:
                      "True, якщо текст на фото важко прочитати або є сумніви",
                  },
                },
                required: [
                  "originalText",
                  "normalizedName",
                  "quantity",
                  "unit",
                  "needsClarification",
                ],
              },
            },
          },
          required: ["items"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw createError({
        statusCode: 500,
        message: "ШІ повернув порожню відповідь",
      });
    }

    // Повертаємо готовий JSON (масив товарів) на фронт
    return JSON.parse(resultText);
  } catch (e: any) {
    console.error("Gemini API Error:", e);

    if (e.status === 429) {
      throw createError({
        statusCode: 429,
        message: "Ліміт запитів вичерпано. Спробуйте пізніше.",
      });
    }

    throw createError({
      statusCode: e.status || 500,
      message: "Помилка аналізу: " + (e.message || "Невідома помилка"),
    });
  }
});

// import { GoogleGenAI, Type } from "@google/genai";
// import { readMultipartFormData } from "h3";

// interface SheetMaterial {
//   id: string;
//   label: string;
//   price: number;
//   measure: string;
//   volume: number;
//   weight: number;
//   movingTypeCalculation: string;
// }

// // Нормалізуємо дані з Google Sheets у зручний масив об'єктів
// function convertToObjects(data: string[][]): SheetMaterial[] {
//   const keys = data[0].map((k) => k.trim());
//   return data.slice(1).map((row, index) => {
//     const obj: any = {
//       id: `sheet-${index}`,
//       label: "",
//       price: 0,
//       measure: "",
//       volume: 0,
//       weight: 0,
//       movingTypeCalculation: "",
//     };
//     keys.forEach((key, colIndex) => {
//       if (key) {
//         const val = row[colIndex]?.trim() || "";
//         if (key === "price") {
//           obj[key] = parseFloat(val.replace(",", ".")) || 0;
//         } else if (key === "volume" || key === "weight") {
//           obj[key] = parseFloat(val) || 0;
//         } else {
//           obj[key] = val;
//         }
//       }
//     });
//     return obj as SheetMaterial;
//   });
// }

// export default defineEventHandler(async (event) => {
//   const config = useRuntimeConfig(event);
//   const formData = await readMultipartFormData(event);
//   const file = formData?.find((item) => item.name === "file");

//   if (!file) {
//     throw createError({ statusCode: 400, message: "Файл не знайдено" });
//   }

//   // 1. Отримуємо весь прайс-лист з Google Sheets
//   let sheetMaterials: SheetMaterial[] = [];
//   try {
//     const sheetName = "TDSheet";
//     const sheetId = "1mspPVAdnGfDqwEw_QB_rflYKNPenBiD1ZNubfznXtOw";
//     const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetName}?key=${config.googleApiKey}`;
//     const sheetsResponse = await $fetch<{ values: string[][] }>(sheetsUrl);
//     if (sheetsResponse.values) {
//       sheetMaterials = convertToObjects(sheetsResponse.values);
//     }
//   } catch (error) {
//     console.error("Помилка завантаження прайсу з Google Sheets:", error);
//     throw createError({
//       statusCode: 500,
//       message: "Не вдалося завантажити прайс-лист",
//     });
//   }

//   // 2. Створюємо стислий каталог товарів для ШІ, щоб зекономити ліміти токенів.
//   // Передаємо ШІ тільки ID, назву та ціну — цього йому цілком достатньо для точного метчингу.
//   const compactCatalog = sheetMaterials.map((m) => ({
//     id: m.id,
//     label: m.label,
//     price: m.price,
//     measure: m.measure,
//   }));

//   // 3. Ініціалізуємо Gemini
//   const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

//   try {
//     // Надсилаємо запит до Gemini 2.5 Flash (у неї величезне вікно контексту — 1 млн токенів,
//     // тому туди легко поміститься весь твій прайс!)
//     const response = await ai.models.generateContent({
//       model: "gemini-3.1-flash-lite",
//       contents: [
//         {
//           inlineData: {
//             data: file.data.toString("base64"),
//             mimeType: file.type || "image/jpeg",
//           },
//         },
//         {
//           text: `Ти — висококласний ШІ-кошторисник та експерт із будівельних матеріалів.

//           Перед тобою фотографія рукописного списку будівельних матеріалів від прораба та ПОВНИЙ каталог нашого складу (прайс-лист).

//           Ось НАШ ПРАЙС-ЛИСТ (у форматі JSON):
//           ${JSON.stringify(compactCatalog)}

//           ТВОЄ ЗАВДАННЯ:
//           1. Уважно прочитай рукописний список на фото.
//           2. Для кожної позиції зі списку знайди ОДИН найкращий товар з нашого ПРАЙС-ЛИСТА.
//           3. При зіставленні використовуй логіку будівельних матеріалів (наприклад, "наливна підлога" має відповідати сумішам для підлоги Siltek, Kreisel або Wallmix; "пєшка" — це прямий підвіс; "блоха" — саморізи для профілю тощо).

//           Поверни результат строго у форматі JSON за такою схемою:`,
//         },
//       ],
//       config: {
//         responseMimeType: "application/json",
//         responseJsonSchema: {
//           type: Type.OBJECT,
//           properties: {
//             items: {
//               type: Type.ARRAY,
//               description: "Список зіставлених товарів",
//               items: {
//                 type: Type.OBJECT,
//                 properties: {
//                   originalText: {
//                     type: Type.STRING,
//                     description:
//                       "Текст позиції прямо з фото (наприклад: '3 наливна підлога 7шт')",
//                   },
//                   quantity: {
//                     type: Type.NUMBER,
//                     description: "Кількість, вказана користувачем на фото",
//                   },
//                   needsClarification: {
//                     type: Type.BOOLEAN,
//                     description:
//                       "True, якщо в прайсі взагалі немає схожого товару або текст на фото неможливо прочитати",
//                   },
//                   matchedItemId: {
//                     type: Type.STRING,
//                     description:
//                       "ID знайденого товару з нашого прайс-листа (наприклад: 'sheet-42'). Якщо товар не знайдено — null.",
//                   },
//                 },
//                 required: [
//                   "originalText",
//                   "quantity",
//                   "needsClarification",
//                   "matchedItemId",
//                 ],
//               },
//             },
//           },
//           required: ["items"],
//         },
//       },
//     });

//     const resultText = response.text;
//     if (!resultText) {
//       throw createError({
//         statusCode: 500,
//         message: "ШІ повернув порожню відповідь",
//       });
//     }

//     const parsedResult = JSON.parse(resultText);

//     // 4. Поєднуємо результати ШІ з повними характеристиками з нашого прайсу
//     // (вага, об'єм, тип розвантаження), щоб передати їх на фронтенд
//     const finalItems = parsedResult.items.map((item: any) => {
//       const dbProduct = sheetMaterials.find((m) => m.id === item.matchedItemId);

//       return {
//         id: `parsed-${Math.random().toString(36).substr(2, 9)}`,
//         originalText: item.originalText,
//         quantity: item.quantity,
//         needsClarification: item.needsClarification || !dbProduct,
//         matchedItem: dbProduct
//           ? {
//               id: dbProduct.id,
//               label: dbProduct.label,
//               price: dbProduct.price,
//               measure: dbProduct.measure,
//               volume: dbProduct.volume,
//               weight: dbProduct.weight,
//               movingTypeCalculation: dbProduct.movingTypeCalculation,
//             }
//           : null,
//       };
//     });

//     return {
//       success: true,
//       items: finalItems,
//     };
//   } catch (e: any) {
//     console.error("Помилка під час ШІ-аналізу:", e);
//     throw createError({
//       statusCode: e.status || 500,
//       message: "Помилка роботи ШІ: " + (e.message || "Unknown error"),
//     });
//   }
// });

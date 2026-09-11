import { GoogleGenAI, Type } from "@google/genai";
import { readMultipartFormData, defineEventHandler, createError } from "h3";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const formData = await readMultipartFormData(event);

  const fileItem = formData?.find((item) => item.name === "file");
  const textItem = formData?.find((item) => item.name === "text");

  if (!fileItem && !textItem) {
    throw createError({
      statusCode: 400,
      message: "Не надано ані файлу, ані тексту",
    });
  }

  // 1. Отримуємо товари (повний каталог)
  const data = await $fetch<any[]>("/api/materials");

  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const aiContents = [];

  if (fileItem) {
    aiContents.push({
      inlineData: {
        data: fileItem.data.toString("base64"),
        mimeType: fileItem.type || "image/jpeg",
      },
    });
  } else if (textItem) {
    aiContents.push({
      text: `Ось список матеріалів від клієнта:\n${textItem.data.toString("utf-8")}`,
    });
  }

  // =========================================================================
  // КРОК 1: AI ПЕРЕКЛАДАЧ ТА ГЕНЕРАТОР КЛЮЧОВИХ СЛІВ
  // =========================================================================
  aiContents.push({
    text: `Ти — експерт-кошторисник. 
Перед тобою список будівельних матеріалів (написаний клієнтом, можливо з помилками, російською чи англійською).
Твоя задача: для кожної позиції:
1. Перекласти назву на правильну українську термінологію (наприклад, "известковая" -> "вапняна"). Враховуй, що прайс на 100% українською.
2. Згенерувати 3-8 ключових слів (коріння слів без закінчень) для пошуку в прайсі. ОБОВ'ЯЗКОВО додавай синоніми, сленг!
   - УВАГА: Уникай занадто коротких загальних коренів (наприклад "шв", "уд", якщо це не абревіатура профілю), бо локальний пошук знайде сотні хибних збігів (наприклад "шв" знайде "швелер", "швидкий", "шва"). Корені (окрім абревіатур типу UD, CD, ПЦ) мають бути хоча б від 3-4 літер!
   - Наприклад, для 'Штукатурка цементна 25кг' -> ["штукатур", "цемент"]. 
   - РОЗМІРИ ТА ЦИФРИ: Якщо в назві є цифри, розміри (6х40, 45, 12.5), вага, об'єм — записуй їх ОКРЕМО в поле 'dimensions'. Не додавай цифри до searchKeywords!
   - Для 'Склополотно 45 г/м2' -> ["склополотно", "склохолст", "павутин", "флізелін"].
   - Для 'Серп'янка' -> ["серп'янк", "сітк", "бандаж", "стрічк"]. (НЕ пиши "шв"!)
   - Для 'Сітка в стяжку' -> ["сітк", "стяжк", "армопояс", "кладк", "метал"].
   - Для 'ДВП' -> ["двп", "hdf", "хдф"].
   - Для 'Грунтівка' -> ["грунт", "ґрунт", "праймер"].
3. Якщо клієнт вказав бренд (в окремій колонці "Бренд" або в назві, наприклад KNAUF, CERESIT, UNIT B), ОБОВ'ЯЗКОВО витягни його у поле brand!
4. ВАЖЛИВО: Опрацьовуй ТІЛЬКИ ті позиції, які передав клієнт. НІКОЛИ не повертай позиції з моїх прикладів вище. Якщо клієнт передав 1 рядок, поверни масив рівно з 1 елементом.
5. Якщо позиція не є будівельним матеріалом (наприклад "доставка", "розвантаження") або ти не знаєш що це, все одно поверни її: originalText збережи як є, а searchKeywords поверни як порожній масив [].`,
  });

  let step1Result;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: aiContents,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  originalText: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  translatedName: { type: Type.STRING, description: "Правильна українська назва матеріалу" },
                  brand: { type: Type.STRING, description: "Бренд (наприклад KNAUF, Ceresit), якщо вказано в тексті або в окремій колонці. Якщо немає - порожній рядок." },
                  dimensions: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Всі цифри, розміри, пропорції (наприклад '6x40', '45', '12.5', '25'). Якщо немає - порожній масив."
                  },
                  searchKeywords: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "2-4 ключових кореня слів українською для пошуку",
                  },
                },
                required: ["originalText", "quantity", "translatedName", "brand", "dimensions", "searchKeywords"],
              },
            },
          },
          required: ["items"],
        },
      },
    });

    if (!response.text) throw new Error("Empty response from Step 1");
    step1Result = JSON.parse(response.text);
  } catch (e: any) {
    throw createError({
      statusCode: e.status || 500,
      message: "Помилка на Кроці 1 (AI Переклад): " + e.message,
    });
  }

  // =========================================================================
  // КРОК 2: ЖОРСТКИЙ ЛОКАЛЬНИЙ ПОШУК 
  // =========================================================================
  // Функція для виправлення одруківок (коли латинські літери випадково написані замість кирилиці)
  const normalizeText = (text: string) => {
    return text.toLowerCase()
      .replace(/ґ/g, 'г')
      .replace(/c/g, 'с').replace(/o/g, 'о').replace(/a/g, 'а').replace(/e/g, 'е')
      .replace(/p/g, 'р').replace(/x/g, 'х').replace(/i/g, 'і').replace(/y/g, 'у')
      .replace(/k/g, 'к').replace(/m/g, 'м').replace(/t/g, 'т').replace(/b/g, 'в').replace(/h/g, 'н')
      // Нормалізація для розмірів, щоб 6х40, 6/40, 6-40 перетворювались на 6*40
      .replace(/(?<=\d)\s*[хx\/\\-]\s*(?=\d)/g, '*');
  };

  const step3Candidates = step1Result.items.map((item: any, index: number) => {
    // Нормалізуємо ключові слова
    const keywords = (item.searchKeywords || []).map((kw: string) => normalizeText(kw));
    const dimensions = (item.dimensions || []).map((dim: string) => normalizeText(dim));

    if (item.brand) {
      keywords.push(normalizeText(item.brand));
    }

    // Шукаємо товари, які містять хоча б одне ключове слово
    const scoredItems = data.map((dbItem) => {
      const labelNormalized = normalizeText(dbItem.label);
      let score = 0;
      
      keywords.forEach((kw: string) => {
        if (labelNormalized.includes(kw)) {
          score += 10; // Базові слова дають по 10 балів
        }
      });

      if (score > 0) {
        // Бонус за розміри (застосовується ТІЛЬКИ якщо є збіг по базі)
        dimensions.forEach((dim: string) => {
          if (labelNormalized.includes(dim)) {
            score += 50; // Точний збіг розміру дає величезний бонус!
          }
        });
      }

      return { ...dbItem, score };
    }).filter((x) => x.score > 0);

    // Сортуємо за кількістю знайдених ключових слів (найбільш релевантні спочатку)
    scoredItems.sort((a, b) => b.score - a.score);
    
    // Відбираємо Топ-40 найрелевантніших (цього достатньо для ШІ)
    const topCandidates = scoredItems.slice(0, 80);
    
    return {
      itemIndex: index,
      originalText: item.originalText,
      quantity: item.quantity,
      translatedName: item.translatedName,
      brand: item.brand,
      topCandidates: topCandidates.map((c) => ({ id: c.id, label: c.label }))
    };
  });


  // =========================================================================
  // КРОК 3: AI ФІЛЬТРАЦІЯ (RERANKING)
  // =========================================================================
  const step3Prompt = `
    Клієнт шукає список будівельних матеріалів. Для кожного матеріалу ми зробили попередній пошук і знайшли до 40 кандидатів з нашої бази.
    
    ДАНІ ПРО КАНДИДАТІВ (JSON формат):
    ${JSON.stringify(step3Candidates)}

    ЗАДАЧА:
    Для кожної позиції (за itemIndex) з масиву вище (зверни увагу на поле 'brand', якщо воно є):
    1. Проаналізуй масив 'topCandidates'. Дій як професійний будівельник: вибери ВСІ матеріали, які можуть підходити під запит 'translatedName'.
       - Обов'язково враховуй синоніми, професійний сленг та альтернативні назви (не чіпляйся до точного співпадіння букв, дивись на суть матеріалу).
       - Відкинь лише відверто нерелевантне сміття (наприклад, якщо шукали цементну штукатурку, відкинь просто "Цемент М500").
    2. Поверни масив 'matchedItemIds' (від 3 до 15 найкращих ID збігів, щоб надати клієнту багатий вибір).
    3. АЛЬТЕРНАТИВИ ТА БРЕНДИ: Надавай якомога більше релевантних альтернатив (різні бренди, фасування, цінові сегменти), щоб дати клієнту багатий вибір. Найточніший збіг ЗАВЖДИ став ПЕРШИМ у масиві matchedItemIds.
    4. УТОЧНЕННЯ (ВАЖЛИВО): 
       - Якщо клієнт вказав КОНКРЕТНИЙ БРЕНД або точну марку (наприклад "Rotband", "ST10") і ти знайшов його — встанови needsClarification: false, але можеш залишити аналоги в масиві.
       - Якщо запит ЗАГАЛЬНИЙ (наприклад "штукатурка стартова", "склополотно", "грунтівка") і клієнт НЕ вказав конкретний бренд — ОБОВ'ЯЗКОВО встанови needsClarification: true (навіть якщо ти знайшов товар з точними характеристиками, наприклад 45 г/м2) і задай clarificationQuestion.
    5. СУВОРО: Гіпсокартон тільки до гіпсокартону, профіль тільки до профілю. Якщо товарів немає — порожній масив.
  `;

  let finalResponse: any[] = [];
  try {
    const step3Response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: [{ text: step3Prompt }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  itemIndex: { type: Type.NUMBER },
                  matchedItemIds: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  needsClarification: { type: Type.BOOLEAN },
                  clarificationQuestion: { type: Type.STRING },
                  clarificationOptions: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ["itemIndex", "matchedItemIds", "needsClarification"],
              }
            }
          },
          required: ["items"]
        }
      }
    });
      
    const step3Result = JSON.parse(step3Response.text || "{}");
      
    // Об'єднуємо результати Кроку 1 та Кроку 3
    finalResponse = step1Result.items.map((item: any, index: number) => {
      const s3Data = step3Result.items?.find((i: any) => i.itemIndex === index) || {};
      const s2Data = step3Candidates.find((c: any) => c.itemIndex === index) || {};
        
      const matchedDbItems = (s3Data.matchedItemIds || [])
        .map((id: string) => data.find((m) => m.id === id))
        .filter(Boolean);

      let mainMatchedItem: any = undefined;
      let needsClarification = s3Data.needsClarification || matchedDbItems.length === 0;

      if (!needsClarification && matchedDbItems.length > 0) {
        mainMatchedItem = matchedDbItems[0];
      } else if (matchedDbItems.length === 1) {
        mainMatchedItem = matchedDbItems[0];
        needsClarification = false;
      }

      return {
        id: `parsed-${Date.now()}-${index}`,
        originalText: item.originalText,
        quantity: item.quantity,
        needsClarification: needsClarification,
        clarificationQuestion: s3Data.clarificationQuestion,
        clarificationOptions: s3Data.clarificationOptions,
        matchedItem: mainMatchedItem,
        matchedItems: matchedDbItems,
        searchKeywords: item.searchKeywords || [],
        topCandidates: s2Data.topCandidates || [],
      };
    });

  } catch (e: any) {
    throw createError({
      statusCode: e.status || 500,
      message: "Помилка на Кроці 3 (AI Reranking): " + e.message,
    });
  }

  return {
    success: true,
    items: finalResponse,
  };
});

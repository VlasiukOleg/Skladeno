import { GoogleGenAI, Type } from "@google/genai";
import { readMultipartFormData } from "h3";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const formData = await readMultipartFormData(event);

  // Шукаємо або файл, або текст у запиті
  const fileItem = formData?.find((item) => item.name === "file");
  const textItem = formData?.find((item) => item.name === "text");

  if (!fileItem && !textItem) {
    throw createError({
      statusCode: 400,
      message: "Не надано ані файлу, ані тексту",
    });
  }

  // 1. Отримуємо товари
  const data = await $fetch<any[]>("/api/materials");

  // 2. Стислий каталог для ШІ
  const catalogForAI = data.map((m) => ({
    id: m.id,
    label: m.label,
  }));

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
      text: `Ось текстовий список матеріалів від клієнта:\n${textItem.data.toString("utf-8")}`,
    });
  }

  // ОНОВЛЕНИЙ ПРОМПТ ДЛЯ КІЛЬКОХ ВАРІАНТІВ
  aiContents.push({
    text: `Ти — головний експерт-кошторисник у будівельному гіпермаркеті. 
          Перед тобою список будівельних матеріалів та ДОСТУПНИЙ КАТАЛОГ МАГАЗИНУ.
          
          КАТАЛОГ МАГАЗИНУ:
          ${JSON.stringify(catalogForAI)}
          
          БУДІВЕЛЬНИЙ СЛОВНИК СИНОНІМІВ ТА СЛЕНГУ:
          - Наливна підлога = Суміш самовирівнювальна для підлоги (SILTEK F-05, Kreisel, Ceresit).
          - ДВП / ВП = ДВП, HDF, ХДФ, МДФ (листовий матеріал).
          - Г.К. / ГК / Влагост. = Гіпсокартон вологостійкий (вологостійкий = влага = волого = водостійкий).
          - пєшка = Підвіс прямий для профілю.
          - блоха = Саморізи (блоха, тексі) для профілів.
          - УД / UD = Профіль UD (напрямний).
          - СД / CD = Профіль CD (стельовий).
          - Грунт = Ґрунтовка.
          - Бет. контакт = Бетоноконтакт.
          - Полістирол = Екструдований пінополістирол (XPS).
          - Стеродур = Екструдований пінополістирол (XPS).

          АЛГОРИТМ МЕТЧИНГУ З ВАРІАНТАМИ:
          1. Для кожної позиції зі списку визнач БАЗОВУ КАТЕГОРІЮ.
          2. Знайди в каталозі від 1 до 10 найкращих збігів. Враховуй синоніми та різні мови/скорочення (наприклад, "влага" = "вологостійкий").
             - Першим став найточніший збіг.
             - Наступними став схожі товари (наприклад, інший бренд, інша фасовка, але та сама категорія).
          3. АЛЬТЕРНАТИВИ ТА БРЕНДИ: Якщо клієнт просить загальне поняття (наприклад: "Стяжка", "Гіпсокартон вологостійкий") БЕЗ конкретного бренду, ти ПОВИНЕН знайти всі доступні бренди в базі (Knauf, Nida тощо). В matchedItemIds виводь не просто різні розміри одного бренду, а хоча б по одному представнику від КОЖНОГО знайденого бренду, щоб дати клієнту вибір по ціні.
          4. УТОЧНЕННЯ (needsClarification): Якщо знайдено кілька різних брендів або типів, встановлюй needsClarification: true, і ЗАПОВНЮЙ clarificationQuestion (наприклад: "Ми знайшли вологостійкий гіпсокартон від Knauf та Nida. Який бренд ви надаєте перевагу?") та clarificationOptions (наприклад: ["KNAUF", "NIDA", "Будь-який (найдешевший)"]).
          5. Якщо товару взагалі немає в каталозі — поверни порожній масив matchedItemIds і needsClarification: true.
          6. СУВОРО: Профіль тільки до профілю, гіпсокартон тільки до гіпсокартону.`,
  });

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
                  // ТЕПЕР ЦЕ МАСИВ ID
                  matchedItemIds: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description:
                      "Масив від 1 до 10 ID найкращих збігів з каталогу. Якщо нічого не знайдено - порожній масив.",
                  },
                  needsClarification: { type: Type.BOOLEAN },
                  clarificationQuestion: { 
                    type: Type.STRING,
                    description: "Якщо needsClarification = true, сформулюй питання до клієнта, щоб уточнити вибір (наприклад, між брендами)."
                  },
                  clarificationOptions: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Варіанти відповідей для клієнта (наприклад, ['KNAUF', 'NIDA', 'Будь-який (найдешевший)'])"
                  }
                },
                required: [
                  "originalText",
                  "quantity",
                  "matchedItemIds",
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
    if (!resultText)
      throw createError({
        statusCode: 500,
        message: "ШІ повернув порожню відповідь",
      });

    const parsedResult = JSON.parse(resultText);

    const finalItems = parsedResult.items.map((item: any) => {
      // Знаходимо всі об'єкти товарів за повернутими ID
      const matchedDbItems = (item.matchedItemIds || [])
        .map((id: string) => data.find((m) => m.id === id))
        .filter(Boolean); // Відфільтровуємо null, якщо раптом ШІ вигадав ID

      return {
        id: `parsed-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        originalText: item.originalText,
        quantity: item.quantity,
        needsClarification:
          item.needsClarification || matchedDbItems.length === 0,
        clarificationQuestion: item.clarificationQuestion || null,
        clarificationOptions: item.clarificationOptions || [],
        // Повертаємо масив можливих варіантів
        matchedItems: matchedDbItems,
        // Для сумісності зі старим кодом (поки що) беремо перший варіант як основний
        matchedItem: matchedDbItems.length > 0 ? matchedDbItems[0] : undefined,
      };
    });

    // Виводимо результат у консоль бекенда (термінал, де запущено npm run dev)
    console.log("\n=== РЕЗУЛЬТАТ МЕТЧИНГУ ШІ ===");
    console.dir(finalItems, { depth: null, colors: true });
    console.log("===============================\n");

    return {
      success: true,
      items: finalItems,
    };
  } catch (e: any) {
    console.error("Gemini API Error:", e);
    
    // Перевіряємо різні формати помилки від нового Google SDK
    const isRateLimit = 
      e.status === 429 || 
      e.status === "RESOURCE_EXHAUSTED" || 
      e.error?.code === 429 ||
      e.error?.status === "RESOURCE_EXHAUSTED" ||
      (e.message && e.message.includes("429"));

    if (isRateLimit) {
      throw createError({
        statusCode: 429,
        message: "Перевищено ліміт запитів. Зачекайте хвилинку.",
      });
    }

    throw createError({
      statusCode: typeof e.status === 'number' ? e.status : 500,
      message: "Помилка аналізу: " + (e.message || "Невідома помилка"),
    });
  }
});

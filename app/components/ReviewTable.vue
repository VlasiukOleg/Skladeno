<script setup lang="ts">
import { computed, ref } from "vue";
import type { TableColumn, DropdownMenuItem } from "@nuxt/ui";
import { useClipboard } from "@vueuse/core";

export interface MatchedProduct {
  id: string;
  label: string;
  price: number;
  measure: string;
  volume?: number;
  weight?: number;
  movingTypeCalculation?: string;
}

export interface MaterialItem {
  id: string;
  originalText: string;
  quantity: number;
  needsClarification: boolean;
  clarificationQuestion?: string;
  clarificationOptions?: string[];
  matchedItem: MatchedProduct | null;
  matchedItems: MatchedProduct[]; // НОВЕ ПОЛЕ: Масив усіх знайдених варіантів
  searchKeywords?: string[];
  topCandidates?: { id: string; label: string }[];
}

const { items = [], loadingStates = {} } = defineProps<{
  items: MaterialItem[];
  loadingStates?: Record<string, boolean>;
}>();

const emit = defineEmits(["remove-item", "reanalyze-item", "update-quantity"]);

// State for Text Edit
const isTextEditModalOpen = ref(false);
const textEditTarget = ref<MaterialItem | null>(null);
const textEditValue = ref("");

const openTextEdit = (item: MaterialItem) => {
  textEditTarget.value = item;
  textEditValue.value = item.originalText;
  isTextEditModalOpen.value = true;
};

const saveTextEdit = () => {
  if (textEditTarget.value && textEditValue.value.trim()) {
    emit("reanalyze-item", textEditTarget.value.id, textEditValue.value.trim());
    isTextEditModalOpen.value = false;
  }
};

// State for Quantity Edit
const isQuantityEditModalOpen = ref(false);
const quantityEditTarget = ref<MaterialItem | null>(null);
const quantityEditValue = ref(1);

const openQuantityEdit = (item: MaterialItem) => {
  quantityEditTarget.value = item;
  quantityEditValue.value = item.quantity;
  isQuantityEditModalOpen.value = true;
};

const saveQuantityEdit = () => {
  if (quantityEditTarget.value && quantityEditValue.value > 0) {
    emit(
      "update-quantity",
      quantityEditTarget.value.id,
      quantityEditValue.value,
    );
    isQuantityEditModalOpen.value = false;
  }
};

const toast = useToast();
const { copy } = useClipboard();

// --- 1. ОБЧИСЛЕННЯ ЗАГАЛЬНИХ ПОКАЗНИКІВ ---
const isDeliveryEnabled = ref(false);
const deliveryCity = ref("Київ");
const deliveryAddress = ref("");

const isUnloadingEnabled = ref(false);
const unloadingBuildingType = ref("Новобудова");
const unloadingElevatorType = ref("Відсутній");
const unloadingFloor = ref<number | "">("");
const unloadingCarryDistance = ref("До 15 м");

const buildingTypeOptions = ["Новобудова", "Старий фонд", "Приватний будинок"];
const elevatorTypeOptions = ["Відсутній", "Пасажирський", "Вантажний"];
const carryDistanceOptions = ["До 15 м", "15 - 30 м", "Більше 30 м"];

const totalWeight = computed(() => {
  return items.reduce((acc, item) => {
    if (item.matchedItem && item.matchedItem.weight) {
      return acc + item.quantity * item.matchedItem.weight;
    }
    return acc;
  }, 0);
});

const totalVolume = computed(() => {
  return items.reduce((acc, item) => {
    if (item.matchedItem && item.matchedItem.volume) {
      return acc + item.quantity * item.matchedItem.volume;
    }
    return acc;
  }, 0);
});

const deliveryPrice = computed(() => {
  if (!isDeliveryEnabled.value) return 0;
  if (deliveryCity.value !== "Київ") return 0; // Менеджер розрахує індивідуально

  const w = totalWeight.value;
  if (w <= 1500) return 800;
  if (w <= 2000) return 1200;
  if (w <= 3000) return 1800;
  if (w <= 5000) return 2500;
  return 3500;
});

const totalSum = computed(() => {
  const materialsSum = items.reduce((acc, item) => {
    if (item.matchedItem) {
      return acc + item.quantity * item.matchedItem.price;
    }
    return acc;
  }, 0);
  return materialsSum + deliveryPrice.value;
});

// --- 2. КОЛОНКИ ТАБЛИЦІ ---
const columns: TableColumn<MaterialItem>[] = [
  {
    accessorKey: "originalText",
    header: "Оригінал (з фото)",
    footer: "Разом:",
  },
  {
    id: "matchedItem",
    header: "Знайдено в базі (Вибір)", // Оновив заголовок
    footer: "logistics_info",
  },
  {
    accessorKey: "quantity",
    header: "К-ть",
  },
  {
    id: "price",
    header: "Ціна за од.",
  },
  {
    id: "sum",
    header: "Сума",
    footer: "total_sum",
  },
  {
    id: "action",
  },
];

function getDropdownActions(item: MaterialItem): DropdownMenuItem[][] {
  return [
    [
      {
        label: "Копіювати назву",
        icon: "i-lucide-copy",
        onSelect: () => {
          if (item.matchedItem) {
            copy(item.matchedItem.label);
            toast.add({
              title: "Назву скопійовано!",
              color: "success",
              icon: "i-lucide-circle-check",
            });
          } else {
            copy(item.originalText);
            toast.add({
              title: "Оригінальний текст скопійовано!",
              color: "success",
              icon: "i-lucide-circle-check",
            });
          }
        },
      },
    ],
    [
      {
        label: "Редагувати (в розробці)",
        icon: "i-lucide-edit",
      },
      {
        label: "Видалити",
        icon: "i-lucide-trash",
        color: "error",
        onSelect: () => emit("remove-item", item.id),
      },
    ],
  ];
}

function selectAlternative(item: MaterialItem, selectedAlt: MatchedProduct) {
  item.matchedItem = selectedAlt;
  item.needsClarification = false;
}

function selectCheapest(item: MaterialItem) {
  if (item.matchedItems.length > 0) {
    const cheapest = [...item.matchedItems].sort(
      (a, b) => a.price - b.price,
    )[0];
    item.matchedItem = cheapest || null;
  }
  item.needsClarification = false;
}
</script>

<template>
  <!-- ТАБЛИЦЯ (ДЛЯ ПК) -->
  <UTable :data="items" :columns="columns" class="hidden md:table flex-1 mt-6">
    <template #originalText-cell="{ row }">
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <UIcon
            v-if="loadingStates[row.original.id]"
            name="i-lucide-loader-2"
            class="text-primary w-5 h-5 shrink-0 animate-spin"
          />
          <UIcon
            v-else-if="row.original.needsClarification"
            name="i-lucide-alert-circle"
            class="text-red-500 w-5 h-5 shrink-0"
          />
          <UIcon
            v-else
            name="i-lucide-check-circle"
            class="text-green-500 w-5 h-5 shrink-0"
          />
          <span
            :class="
              row.original.needsClarification
                ? 'text-red-500 font-medium'
                : 'text-gray-700'
            "
            class="whitespace-normal wrap-break-word max-w-62.5 text-sm"
          >
            {{ row.original.originalText }}
          </span>
        </div>

        <!-- Inline Edit Action -->
        <div
          class="flex items-center gap-1 cursor-pointer text-gray-400 hover:text-primary transition-colors w-max group"
          @click="openTextEdit(row.original)"
        >
          <span class="text-[10px] uppercase font-semibold"
            >Погано розпізнано? Змінити</span
          >
          <UIcon
            name="i-lucide-pencil"
            class="w-3 h-3 group-hover:scale-110 transition-transform"
          />
        </div>

        <!-- Відображення тегів для пошуку (щоб бачити, як шукає ШІ) -->
        <!-- <div v-if="row.original.searchKeywords && row.original.searchKeywords.length" class="flex flex-wrap gap-1 max-w-[250px]">
          <UBadge 
            v-for="kw in row.original.searchKeywords" 
            :key="kw" 
            size="xs" 
            variant="soft" 
            class="lowercase text-[10px]"
          >
            #{{ kw }}
          </UBadge>
        </div> -->

        <!-- Попередньо знайдені в базі (до фільтрації ШІ) -->
        <!-- <details
          v-if="
            row.original.topCandidates && row.original.topCandidates.length > 0
          "
          class="mt-1 group"
        >
          <summary
            class="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer list-none flex items-center gap-1 w-max"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="w-3 h-3 group-open:rotate-90 transition-transform"
            />
            Усі знайдені в прайсі ({{ row.original.topCandidates.length }})
          </summary>
          <ul
            class="text-[9px] text-gray-500 mt-1 pl-4 list-disc max-h-24 overflow-y-auto w-[250px]"
          >
            <li
              v-for="c in row.original.topCandidates"
              :key="c.id"
              class="truncate"
              :title="c.label"
            >
              {{ c.label }}
            </li>
          </ul>
        </details> -->
      </div>
    </template>

    <!-- ОНОВЛЕНА КОЛОНКА МЕТЧІНГУ З ВАРІАНТАМИ ТА КНОПКАМИ -->
    <template #matchedItem-cell="{ row }">
      <!-- Якщо знайдено більше одного варіанту (є з чого вибирати) -->
      <div
        v-if="row.original.matchedItems && row.original.matchedItems.length > 1"
        class="flex flex-col gap-2 py-1"
      >
        <!-- СТАН 1: ЩЕ НЕ ВИБРАНО (потрібне уточнення) -->
        <template v-if="row.original.needsClarification">
          <!-- Жовте попередження (уточнення) -->
          <div
            v-if="row.original.clarificationQuestion"
            class="text-xs font-medium text-amber-700 bg-amber-50 p-2 rounded-md border border-amber-200 leading-tight whitespace-normal wrap-break-word max-w-100"
          >
            {{ row.original.clarificationQuestion }}
          </div>

          <!-- Селект меню для вибору -->
          <USelectMenu
            :model-value="row.original.matchedItem || undefined"
            :items="row.original.matchedItems"
            placeholder="Натисніть, щоб обрати варіант..."
            class="w-full"
            @update:model-value="
              (val: any) => selectAlternative(row.original, val)
            "
          >
            <template #default>
              <span v-if="row.original.matchedItem" class="truncate">{{
                row.original.matchedItem.label
              }}</span>
              <span v-else class="truncate text-gray-500"
                >Натисніть, щоб обрати варіант...</span
              >
            </template>

            <template #item-label="{ item }">
              <div class="flex justify-between w-full items-center gap-2">
                <span class="truncate text-xs">{{ item.label }}</span>
                <span class="text-primary font-bold text-xs whitespace-nowrap"
                  >{{ item.price.toFixed(2) }} ₴</span
                >
              </div>
            </template>
          </USelectMenu>

          <!-- Кнопка "Вибрати найдешевший" -->
          <UButton
            size="xs"
            color="primary"
            variant="soft"
            class="justify-center"
            @click="selectCheapest(row.original)"
          >
            Вибрати найдешевший
          </UButton>
        </template>

        <!-- СТАН 2: ВЖЕ ВИБРАНО (можна змінити вибір) -->
        <template v-else>
          <!-- Головний (вибраний) товар текстом -->
          <div
            class="font-medium text-gray-900 whitespace-normal wrap-break-word max-w-100 text-sm"
          >
            {{ row.original.matchedItem?.label }}
          </div>

          <!-- Селект для зміни вибору -->
          <div class="mt-1 pt-1 border-t border-gray-100">
            <p class="text-[10px] uppercase text-gray-400 font-semibold mb-1">
              Інші знайдені варіанти (не вибрані):
            </p>
            <USelectMenu
              :items="
                row.original.matchedItems.filter(
                  (m) => m.id !== row.original.matchedItem?.id,
                )
              "
              class="w-full"
              @update:model-value="
                (val: any) => selectAlternative(row.original, val)
              "
            >
              <template #default>
                <span class="truncate text-gray-500 text-xs"
                  >Натисніть, щоб змінити вибір...</span
                >
              </template>
              <template #item-label="{ item }">
                <div class="flex justify-between w-full items-center gap-2">
                  <span class="truncate text-xs">{{ item.label }}</span>
                  <span class="text-primary font-bold text-xs whitespace-nowrap"
                    >{{ item.price.toFixed(2) }} ₴</span
                  >
                </div>
              </template>
            </USelectMenu>
          </div>
        </template>
      </div>

      <!-- Якщо знайдено рівно 1 товар (або просто товар вже вибрано і немає інших варіантів) -->
      <div v-else-if="row.original.matchedItem" class="flex flex-col gap-1">
        <div
          class="font-medium text-gray-900 whitespace-normal wrap-break-word max-w-100 text-sm"
        >
          {{ row.original.matchedItem.label }}
        </div>
      </div>

      <!-- Якщо система не знайшла товар (з уточненням або без) -->
      <div v-else class="flex flex-col gap-2 py-1">
        <div
          class="max-w-100 text-xs font-medium text-red-600 flex items-start gap-2 p-2.5 bg-red-50 rounded-md border border-red-100 leading-tight whitespace-normal wrap-break-word"
        >
          <UIcon
            name="i-lucide-alert-triangle"
            class="w-5 h-5 shrink-0 mt-0.5"
          />
          <p>
            Система не змогла підібрати конкретні товари для цього запиту. Будь
            ласка, змініть запит, або менеджер вручну додасть потрібний товар
            при замовленні.
          </p>
        </div>
      </div>
    </template>

    <template #quantity-cell="{ row }">
      <div class="flex items-center gap-1 text-sm group">
        <span class="font-medium">{{ row.original.quantity }}</span>
        <span class="text-xs text-gray-500 mr-2">{{
          row.original.matchedItem?.measure || "шт."
        }}</span>
        <UIcon
          name="i-lucide-pencil"
          class="w-3 h-3 text-gray-400 cursor-pointer hover:text-primary transition-colors"
          @click="openQuantityEdit(row.original)"
          title="Змінити кількість"
        />
      </div>
    </template>

    <template #price-cell="{ row }">
      <span
        v-if="row.original.matchedItem"
        class="text-gray-600 whitespace-nowrap text-sm"
      >
        {{ row.original.matchedItem.price.toFixed(2) }} ₴
      </span>
      <span v-else class="text-gray-400">—</span>
    </template>

    <template #sum-cell="{ row }">
      <span
        v-if="row.original.matchedItem"
        class="font-bold text-primary whitespace-nowrap text-sm"
      >
        {{
          (row.original.quantity * row.original.matchedItem.price).toFixed(2)
        }}
        ₴
      </span>
      <span v-else class="text-gray-400">—</span>
    </template>

    <template #action-cell="{ row }">
      <UDropdownMenu :items="getDropdownActions(row.original)">
        <UButton
          icon="i-lucide-ellipsis-vertical"
          color="neutral"
          variant="ghost"
          aria-label="Actions"
        />
      </UDropdownMenu>
    </template>

    <!-- ИНТЕРАКТИВНЫЙ РЯДОК ДОСТАВКИ (Варіант 4) -->
    <template #body-bottom>
      <tr>
        <td colspan="6" class="p-0 border-b border-gray-200">
          <div
            v-if="!isDeliveryEnabled"
            class="px-4 py-3 cursor-pointer hover:bg-gray-50 flex items-center justify-center border-t border-dashed border-gray-300"
            @click="() => { isDeliveryEnabled = true }"
          >
            <span
              class="text-sm text-primary font-semibold flex items-center gap-2"
            >
              <UIcon name="i-lucide-plus" class="w-4 h-4" /> Додати доставку
            </span>
          </div>
          <div
            v-else
            class="px-4 py-4 bg-blue-50/30 flex flex-col gap-3 border-t border-blue-100"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-primary font-bold">
                <UIcon name="i-lucide-truck" class="w-5 h-5" />
                Оформлення доставки
              </div>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="() => { isDeliveryEnabled = false }"
                aria-label="Скасувати доставку"
              />
            </div>

            <div class="flex flex-col md:flex-row gap-4 items-end">
              <div class="w-full md:w-1/4">
                <label class="block text-xs font-semibold text-gray-500 mb-1"
                  >Місто</label
                >
                <USelectMenu
                  v-model="deliveryCity"
                  :items="['Київ', 'Інше місто / Область']"
                  class="w-full"
                />
              </div>
              <div class="w-full md:flex-1">
                <label class="block text-xs font-semibold text-gray-500 mb-1"
                  >Адреса</label
                >
                <UInput
                  v-model="deliveryAddress"
                  placeholder="Вулиця, номер будинку..."
                  class="w-full"
                />
              </div>
              <div class="w-full md:w-auto min-w-37.5 text-right md:mb-1">
                <p
                  class="text-[10px] uppercase font-semibold text-gray-400 mb-0.5"
                >
                  Вартість доставки
                </p>
                <div
                  v-if="deliveryCity === 'Київ'"
                  class="font-bold text-gray-900 text-lg"
                >
                  {{ deliveryPrice.toFixed(2) }} ₴
                </div>
                <div
                  v-else
                  class="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 inline-block"
                >
                  Розрахує менеджер
                </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
      <!-- ИНТЕРАКТИВНЫЙ РЯДОК РОЗВАНТАЖЕННЯ -->
      <tr>
        <td colspan="6" class="p-0 border-b border-gray-200">
          <div
            v-if="!isUnloadingEnabled"
            class="px-4 py-3 cursor-pointer hover:bg-gray-50 flex items-center justify-center border-t border-dashed border-gray-300"
            @click="() => { isUnloadingEnabled = true }"
          >
            <span
              class="text-sm text-primary font-semibold flex items-center gap-2"
            >
              <UIcon name="i-lucide-plus" class="w-4 h-4" /> Додати
              розвантаження
            </span>
          </div>
          <div
            v-else
            class="px-4 py-4 bg-blue-50/30 flex flex-col gap-3 border-t border-blue-100"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-primary font-bold">
                <UIcon name="i-lucide-package-open" class="w-5 h-5" />
                Розвантаження та занос
              </div>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="() => { isUnloadingEnabled = false }"
                aria-label="Скасувати розвантаження"
              />
            </div>

            <div class="flex flex-col md:flex-row gap-4 items-end">
              <div class="w-full md:w-1/5">
                <label class="block text-xs font-semibold text-gray-500 mb-1"
                  >Тип будівлі</label
                >
                <USelectMenu
                  v-model="unloadingBuildingType"
                  :items="buildingTypeOptions"
                  class="w-full"
                />
              </div>
              <div
                v-if="unloadingBuildingType !== 'Приватний будинок'"
                class="w-full md:w-1/6"
              >
                <label class="block text-xs font-semibold text-gray-500 mb-1"
                  >Ліфт</label
                >
                <USelectMenu
                  v-model="unloadingElevatorType"
                  :items="elevatorTypeOptions"
                  class="w-full"
                />
              </div>
              <div
                v-if="unloadingBuildingType !== 'Приватний будинок'"
                class="w-full md:w-1/6"
              >
                <label class="block text-xs font-semibold text-gray-500 mb-1"
                  >Поверх</label
                >
                <UInput
                  v-model="unloadingFloor"
                  type="number"
                  placeholder="Напр. 5"
                  class="w-full"
                />
              </div>
              <div class="w-full md:flex-1">
                <label class="block text-xs font-semibold text-gray-500 mb-1"
                  >Відстань заносу</label
                >
                <USelectMenu
                  v-model="unloadingCarryDistance"
                  :items="carryDistanceOptions"
                  class="w-full"
                />
              </div>
              <div class="w-full md:w-auto min-w-37.5 text-right md:mb-1">
                <p
                  class="text-[10px] uppercase font-semibold text-gray-400 mb-0.5"
                >
                  Вартість
                </p>
                <div
                  class="text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 inline-block whitespace-nowrap"
                >
                  Розрахує менеджер
                </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    </template>

    <!-- СЛОТИ ДЛЯ ФУТЕРА -->
    <template #originalText-footer>
      <span class="font-bold text-gray-900 text-sm">Разом:</span>
    </template>

    <template #matchedItem-footer>
      <div class="flex gap-4 text-xs font-semibold text-gray-600">
        <div>
          Загальна вага:
          <span class="font-bold text-gray-950 text-sm"
            >{{ totalWeight.toFixed(2) }} кг</span
          >
        </div>
        <div class="border-l border-gray-300 h-5"></div>
        <div>
          Загальний об'єм:
          <span class="font-bold text-gray-950 text-sm"
            >{{ totalVolume.toFixed(4) }} м³</span
          >
        </div>
      </div>
    </template>

    <template #sum-footer>
      <span class="font-extrabold text-primary text-base whitespace-nowrap"
        >{{ totalSum.toFixed(2) }} ₴</span
      >
    </template>
  </UTable>

  <!-- Модалка редагування тексту -->
  <UModal v-model:open="isTextEditModalOpen" title="Редагувати текст запиту">
    <template #body>
      <div class="flex flex-col gap-4">
        <UTextarea
          v-model="textEditValue"
          autofocus
          placeholder="Введіть правильну назву матеріалу..."
          :rows="3"
        />
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Скасувати"
            @click="() => { isTextEditModalOpen = false }"
          />
          <UButton
            color="primary"
            label="Переаналізувати"
            icon="i-lucide-refresh-cw"
            @click="saveTextEdit"
            :disabled="!textEditValue.trim()"
          />
        </div>
      </div>
    </template>
  </UModal>

  <!-- Модалка редагування кількості -->
  <UModal v-model:open="isQuantityEditModalOpen" title="Змінити кількість">
    <template #body>
      <div class="flex flex-col gap-4">
        <UInput
          v-model.number="quantityEditValue"
          type="number"
          min="0"
          step="0.01"
          autofocus
          class="w-full"
        />
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Скасувати"
            @click="() => { isQuantityEditModalOpen = false }"
          />
          <UButton
            color="primary"
            label="Зберегти"
            icon="i-lucide-check"
            @click="saveQuantityEdit"
            :disabled="quantityEditValue <= 0"
          />
        </div>
      </div>
    </template>
  </UModal>

  <!-- МОБІЛЬНА ВЕРСІЯ (КАРТКИ) -->
  <div class="block md:hidden space-y-4 mt-6">
    <UCard
      v-for="item in items"
      :key="item.id"
      class="shadow-sm overflow-hidden relative"
    >
      <!-- Завантаження (Оверлей) -->
      <div
        v-if="loadingStates[item.id]"
        class="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center"
      >
        <div class="flex flex-col items-center gap-2">
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 text-primary animate-spin"
          />
          <span
            class="text-xs font-semibold text-primary uppercase tracking-wider"
            >Аналізую...</span
          >
        </div>
      </div>

      <div
        v-if="item.needsClarification"
        class="absolute top-0 left-0 w-1 h-full bg-amber-400"
      ></div>

      <div :class="{ 'opacity-50': loadingStates[item.id] }">
        <!-- Оригінальний запит (Ваш запит) -->
        <div
          class="bg-gray-50 p-2.5 rounded-md mb-4 border border-gray-100 flex items-start justify-between"
        >
          <div>
            <p class="text-[10px] uppercase font-semibold text-gray-400 mb-0.5">
              Ваш запит
            </p>
            <p class="text-xs font-medium text-gray-700 italic">
              "{{ item.originalText }}"
            </p>
          </div>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-pencil"
            @click="openTextEdit(item)"
          />
        </div>

        <!-- Знайдений товар та статус -->
        <div class="flex items-start justify-between gap-2 mb-3">
          <div class="flex-1">
            <h4
              v-if="item.matchedItem"
              class="font-medium text-gray-900 text-sm leading-tight"
            >
              {{ item.matchedItem.label }}
            </h4>
            <h4
              v-else-if="item.needsClarification"
              class="font-bold text-amber-600 text-sm leading-tight"
            >
              Потребує уточнення
            </h4>
            <h4 v-else class="font-medium text-gray-500 text-sm leading-tight">
              Товар не знайдено
            </h4>
          </div>
          <UBadge
            v-if="!item.needsClarification && item.matchedItem"
            color="success"
            variant="subtle"
            size="sm"
            >Знайдено</UBadge
          >
          <UBadge
            v-else-if="item.needsClarification"
            color="warning"
            variant="subtle"
            size="sm"
            >Увага</UBadge
          >
        </div>

        <!-- Якщо потрібне уточнення (є варіанти) -->
        <div
          v-if="item.matchedItems && item.matchedItems.length > 1"
          class="mb-4"
        >
          <template v-if="item.needsClarification">
            <p class="text-[10px] uppercase font-semibold text-gray-400 mb-1.5">
              Оберіть варіант:
            </p>
            <USelectMenu
              :model-value="item.matchedItem ?? undefined"
              :items="item.matchedItems"
              placeholder="Натисніть, щоб обрати варіант..."
              class="w-full"
              @update:model-value="(val: any) => selectAlternative(item, val)"
            >
              <template #default>
                <span v-if="item.matchedItem" class="truncate">{{
                  item.matchedItem.label
                }}</span>
                <span v-else class="truncate text-gray-500"
                  >Натисніть, щоб обрати варіант...</span
                >
              </template>
              <template #item-label="{ item: option }">
                <div class="flex justify-between w-full items-center gap-2">
                  <span class="truncate text-xs">{{ option.label }}</span>
                  <span class="text-primary font-bold text-xs whitespace-nowrap"
                    >{{ option.price.toFixed(2) }} ₴</span
                  >
                </div>
              </template>
            </USelectMenu>
            <UButton
              size="xs"
              color="primary"
              variant="soft"
              class="w-full justify-center mt-2"
              @click="selectCheapest(item)"
            >
              Вибрати найдешевший
            </UButton>
          </template>

          <template v-else>
            <p
              class="text-[10px] uppercase font-semibold text-gray-400 mb-1.5 mt-2"
            >
              Інші знайдені варіанти:
            </p>
            <USelectMenu
              :items="
                item.matchedItems.filter((m) => m.id !== item.matchedItem?.id)
              "
              class="w-full"
              @update:model-value="(val: any) => selectAlternative(item, val)"
            >
              <template #default>
                <span class="truncate text-gray-500 text-xs"
                  >Натисніть, щоб змінити вибір...</span
                >
              </template>
              <template #item-label="{ item: option }">
                <div class="flex justify-between w-full items-center gap-2">
                  <span class="truncate text-xs">{{ option.label }}</span>
                  <span class="text-primary font-bold text-xs whitespace-nowrap"
                    >{{ option.price.toFixed(2) }} ₴</span
                  >
                </div>
              </template>
            </USelectMenu>
          </template>
        </div>

        <div v-else-if="!item.matchedItem" class="mb-4">
          <div
            class="text-xs text-red-600 flex items-start gap-2 p-2.5 bg-red-50 rounded-md border border-red-100"
          >
            <UIcon
              name="i-lucide-alert-triangle"
              class="w-5 h-5 shrink-0 mt-0.5"
            />
            <p>
              Система не змогла підібрати конкретні товари для цього запиту.
              Будь ласка, змініть запит, або менеджер вручну додасть потрібний
              товар при замовленні.
            </p>
          </div>
        </div>

        <!-- Кількість, Сума та Видалення -->
        <div
          class="flex items-end justify-between border-t border-gray-100 pt-3 mt-2"
        >
          <div class="flex items-center gap-6">
            <!-- Кількість -->
            <div>
              <p class="text-[10px] uppercase font-semibold text-gray-400 mb-1">
                Кількість
              </p>
              <div
                class="flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors"
                @click="openQuantityEdit(item)"
              >
                <span class="font-semibold text-gray-900">{{
                  item.quantity
                }}</span>
                <span class="text-xs text-gray-500">{{
                  item.matchedItem?.measure || "шт."
                }}</span>
                <UIcon name="i-lucide-pencil" class="w-3 h-3 text-gray-400" />
              </div>
            </div>

            <!-- Сума -->
            <div>
              <p class="text-[10px] uppercase font-semibold text-gray-400 mb-1">
                Сума
              </p>
              <div class="font-bold text-primary text-base">
                {{
                  item.matchedItem
                    ? (item.quantity * item.matchedItem.price).toFixed(2)
                    : "0.00"
                }}
                ₴
              </div>
            </div>
          </div>

          <!-- Кнопка видалення -->
          <UButton
            size="sm"
            color="error"
            variant="ghost"
            icon="i-lucide-trash"
            class="-mr-2 mb-0.5"
            @click="emit('remove-item', item.id)"
          />
        </div>
      </div>
    </UCard>

    <!-- МОБІЛЬНИЙ БЛОК ДОСТАВКИ -->
    <UCard
      class="shadow-sm mt-4 overflow-hidden"
      :ui="{ body: 'p-0' }"
    >
      <div
        v-if="!isDeliveryEnabled"
        class="px-4 py-4 cursor-pointer hover:bg-gray-50 flex items-center justify-center border border-dashed border-gray-300 m-2 rounded-lg"
        @click="() => { isDeliveryEnabled = true }"
      >
        <span
          class="text-sm text-primary font-semibold flex items-center gap-2"
        >
          <UIcon name="i-lucide-plus" class="w-4 h-4" /> Додати доставку
        </span>
      </div>
      <div v-else class="p-4 bg-blue-50/30 flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-primary font-bold">
            <UIcon name="i-lucide-truck" class="w-5 h-5" />
            Оформлення доставки
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="() => { isDeliveryEnabled = false }"
            aria-label="Скасувати доставку"
          />
        </div>

        <div class="flex flex-col gap-3">
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1"
              >Місто</label
            >
            <USelectMenu
              v-model="deliveryCity"
              :items="['Київ', 'Інше місто / Область']"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1"
              >Адреса</label
            >
            <UInput
              v-model="deliveryAddress"
              placeholder="Вулиця, номер будинку..."
              class="w-full"
            />
          </div>
          <div
            class="mt-1 pt-3 border-t border-blue-100 flex items-center justify-between"
          >
            <p class="text-xs uppercase font-semibold text-gray-400">
              Вартість
            </p>
            <div
              v-if="deliveryCity === 'Київ'"
              class="font-bold text-gray-900 text-lg"
            >
              {{ deliveryPrice.toFixed(2) }} ₴
            </div>
            <div
              v-else
              class="text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-200"
            >
              Розрахує менеджер
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- МОБІЛЬНИЙ БЛОК РОЗВАНТАЖЕННЯ -->
    <UCard
      class="shadow-sm mt-4 overflow-hidden"
      :ui="{ body: 'p-0' }"
    >
      <div
        v-if="!isUnloadingEnabled"
        class="px-4 py-4 cursor-pointer hover:bg-gray-50 flex items-center justify-center border border-dashed border-gray-300 m-2 rounded-lg"
        @click="() => { isUnloadingEnabled = true }"
      >
        <span
          class="text-sm text-primary font-semibold flex items-center gap-2"
        >
          <UIcon name="i-lucide-plus" class="w-4 h-4" /> Додати розвантаження
        </span>
      </div>
      <div v-else class="p-4 bg-blue-50/30 flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-primary font-bold">
            <UIcon name="i-lucide-package-open" class="w-5 h-5" />
            Розвантаження та занос
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="() => { isUnloadingEnabled = false }"
            aria-label="Скасувати розвантаження"
          />
        </div>

        <div class="flex flex-col gap-3">
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1"
              >Тип будівлі</label
            >
            <USelectMenu
              v-model="unloadingBuildingType"
              :items="buildingTypeOptions"
              class="w-full"
            />
          </div>
          <div v-if="unloadingBuildingType !== 'Приватний будинок'">
            <label class="block text-xs font-semibold text-gray-500 mb-1"
              >Ліфт</label
            >
            <USelectMenu
              v-model="unloadingElevatorType"
              :items="elevatorTypeOptions"
              class="w-full"
            />
          </div>
          <div v-if="unloadingBuildingType !== 'Приватний будинок'">
            <label class="block text-xs font-semibold text-gray-500 mb-1"
              >Поверх</label
            >
            <UInput
              v-model="unloadingFloor"
              type="number"
              placeholder="Напр. 5"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1"
              >Відстань заносу</label
            >
            <USelectMenu
              v-model="unloadingCarryDistance"
              :items="carryDistanceOptions"
              class="w-full"
            />
          </div>
          <div
            class="mt-1 pt-3 border-t border-blue-100 flex items-center justify-between"
          >
            <p class="text-xs uppercase font-semibold text-gray-400">
              Вартість
            </p>
            <div
              class="text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-200"
            >
              Розрахує менеджер
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- МОБІЛЬНИЙ ФУТЕР (ВАРТІСТЬ І ВАГА) -->
    <UCard class="shadow-sm mt-4 bg-gray-50 border-t-4 border-t-primary">
      <div class="flex flex-col gap-2">
        <div class="flex justify-between items-center text-sm">
          <span class="text-gray-500 font-medium">Загальна вага:</span>
          <span class="font-bold text-gray-900"
            >{{ totalWeight.toFixed(2) }} кг</span
          >
        </div>
        <div
          class="flex justify-between items-center text-sm border-b border-gray-200 pb-2"
        >
          <span class="text-gray-500 font-medium">Об'єм:</span>
          <span class="font-bold text-gray-900"
            >{{ totalVolume.toFixed(4) }} м³</span
          >
        </div>
        <div class="flex justify-between items-center pt-1 mt-1">
          <span class="text-gray-900 font-bold uppercase">Разом:</span>
          <span class="font-extrabold text-primary text-xl"
            >{{ totalSum.toFixed(2) }} ₴</span
          >
        </div>
      </div>
    </UCard>
  </div>
</template>

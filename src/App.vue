<template>
  <a-config-provider :locale="configLocale">
    <a-layout>
      <a-layout-header class="header">
        <div class="tab-title-box">
          <div
            class="tab-title"
            v-for="(notebookId, index) in selectNotebookIds"
            :key="notebookId"
            :class="{ active: notebookId === selectNotebookId }"
          >
            <span class="tab-title-text" @click="changeNotebook(notebookId)">{{ getNotebookName(notebookId) }}</span>
            <button v-if="selectNotebookIds.length > 1" class="tab-close-btn" @click.stop="removeNotebook(notebookId)">×</button>
          </div>
        </div>
        <div class="select-container">
          <transition name="slide">
            <select
              v-if="showSelect"
              v-model="selectNotebookId"
              class="custom-select"
              @click.stop
              @change="handleSelectChange"
            >
              <option v-for="notebook in cusNotebooks" :key="notebook.id" :value="notebook.id">
                {{ notebook.name }}
              </option>
            </select>
          </transition>
          <button
            v-if="selectNotebookIds.length < 3"
            class="toggle-btn"
            @click.stop="toggleSelect"
            :class="{ active: showSelect }"
          >
            <span v-if="!showSelect" class="icon">+</span>
            <span v-else class="icon">›</span>
          </button>
        </div>
      </a-layout-header>
      <a-layout-content>
        <CalendarView
          v-for="notebookId in selectNotebookIds"
          :key="notebookId"
          v-show="notebookId === selectNotebookId"
          :notebook="getNotebookById(notebookId)"
        />
      </a-layout-content>
    </a-layout>
  </a-config-provider>
</template>

<script lang="ts" setup>
import { computed, ref, watch, onUnmounted } from 'vue';
import CalendarView from '@/components/CalendarView.vue';
import { lsNotebooks, pushErrMsg } from '@/api/api';
import { useLocale, formatMsg } from '@/hooks/useLocale';
import { eventBus, i18n, pluginStorage, weekStart } from '@/hooks/useSiYuan';
import { CusNotebook } from '@/utils/notebook';
import { refreshSql } from './api/utils';

const STORAGE_KEY = 'arco-calendar-entry';
const SELECTED_NOTEBOOK_KEY = 'selectedNotebookId';
const SELECTED_NOTEBOOKS_KEY = 'selectedNotebookIds';

const { locale, localeType } = useLocale();

const configLocale = computed(() => {
  try {
    const base = locale.value || {};
    return Object.assign({}, base, { weekStart: Number(weekStart.value) });
  } catch (e) {
    return locale.value;
  }
});

// 获取笔记本列表
const cusNotebooks = ref<CusNotebook[]>([]);
const selectNotebookId = ref<NotebookId | undefined>(undefined);
const selectNotebookIds = ref<NotebookId[]>([]);
const isInit = ref(false);
const initError = ref<Error | null>(null);

// 控制 select 显示/隐藏
const showSelect = ref(false);
function toggleSelect() {
  showSelect.value = !showSelect.value;
}

// 处理 select 变化
function handleSelectChange() {
  if (selectNotebookId.value && !selectNotebookIds.value.includes(selectNotebookId.value)) {
    // 最多只能选3个
    if (selectNotebookIds.value.length < 3) {
      selectNotebookIds.value.push(selectNotebookId.value);
      saveSelectNotebookIds();
    }
  }
  // 选中后隐藏 select
  showSelect.value = false;
}

// 保存 selectNotebookIds 到 storage
async function saveSelectNotebookIds() {
  if (!pluginStorage.value) return;
  const data = (await pluginStorage.value.loadData<Record<string, unknown>>(STORAGE_KEY)) || {};
  data[SELECTED_NOTEBOOKS_KEY] = selectNotebookIds.value;
  await pluginStorage.value.saveData(STORAGE_KEY, data);
}

// 创建笔记本 Map，提升查找性能 O(1)
const notebookMap = computed(() => {
  const map = new Map<NotebookId, CusNotebook>();
  cusNotebooks.value.forEach(book => {
    map.set(book.id, book);
  });
  return map;
});

// 根据笔记本 ID 获取笔记本名称
function getNotebookName(notebookId: NotebookId): string {
  const notebook = notebookMap.value.get(notebookId);
  return notebook ? notebook.name : notebookId;
}

// 根据笔记本 ID 获取笔记本对象
function getNotebookById(notebookId: NotebookId): CusNotebook | undefined {
  return notebookMap.value.get(notebookId);
}

async function init() {
  if (isInit.value) {
    return;
  }
  try {
    isInit.value = true;
    initError.value = null;
    
    const { notebooks } = await lsNotebooks();
    const books = notebooks.filter((book: Notebook) => !book.closed);
    
    const builtNotebooks = await Promise.all(
      books.map(book => CusNotebook.build(book))
    );
    cusNotebooks.value = builtNotebooks;
    
    const storage = (await pluginStorage.value?.loadData<Record<string, unknown>>(STORAGE_KEY)) || {};
    
    const savedNotebookId = storage[SELECTED_NOTEBOOK_KEY];
    if (typeof savedNotebookId === 'string' && cusNotebooks.value.some(book => book.id === savedNotebookId)) {
      selectNotebookId.value = savedNotebookId;
    } else {
      selectNotebookId.value = cusNotebooks.value[0]?.id;
    }
    
    if (Array.isArray(storage[SELECTED_NOTEBOOKS_KEY])) {
      try {
        const savedIds = storage[SELECTED_NOTEBOOKS_KEY];
        selectNotebookIds.value = savedIds.filter(
          (id): id is string => typeof id === 'string' && cusNotebooks.value.some(book => book.id === id)
        );
      } catch {
        selectNotebookIds.value = [];
      }
    } else {
      selectNotebookIds.value = selectNotebookId.value ? [selectNotebookId.value] : [];
    }
    
    if (selectNotebookIds.value.length === 0 && selectNotebookId.value) {
      selectNotebookIds.value = [selectNotebookId.value];
      await saveSelectNotebookIds();
    }
  } catch (error) {
    initError.value = error as Error;
    console.error('Failed to initialize notebooks:', error);
    if (error instanceof Error) {
      await pushErrMsg(formatMsg('initFailed') || error.message);
    }
  } finally {
    isInit.value = false;
  }
}
init();

const handleWsMain = async ({ detail }: { detail: { cmd: string } }) => {
  const { cmd } = detail;
  if (['createnotebook', 'mount', 'unmount'].includes(cmd)) {
    await refreshSql();
    cusNotebooks.value = [];
    await init();
  }
};

eventBus.value?.on('ws-main', handleWsMain);

onUnmounted(() => {
  eventBus.value?.off('ws-main', handleWsMain);
});

watch(selectNotebookId, async bookId => {
  if (!bookId) {
    await pushErrMsg(formatMsg('notNoteBook'));
    return;
  }
  if (!selectNotebookIds.value.includes(bookId)) {
    selectNotebookIds.value.push(bookId);
    await saveSelectNotebookIds();
  }
});

// 移除笔记本
async function removeNotebook(notebookId: NotebookId) {
  const index = selectNotebookIds.value.indexOf(notebookId);
  if (index > -1) {
    selectNotebookIds.value.splice(index, 1);
    await saveSelectNotebookIds();
    // 如果删除的是当前选中的笔记本，默认显示剩下的最后一个
    if (selectNotebookId.value === notebookId && selectNotebookIds.value.length > 0) {
      selectNotebookId.value = selectNotebookIds.value[selectNotebookIds.value.length - 1];
    }
  }

}

// 切换笔记本
function changeNotebook(notebookId: NotebookId) {
  selectNotebookId.value = notebookId;
}

// weekStart is managed by plugin settings; no local storage writes here.
</script>

<style scoped lang="less">
.select-container {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  position: relative;

  .custom-select {
    width: 160px;
    padding: 4px 6px;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    background-color: var(--b3-theme-surface);
    color: var(--b3-theme-on-surface);
    font-size: 14px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    cursor: pointer;
    transition: all 0.2s ease;
    position: absolute;
    right: 36px;
    top: 0;
    z-index: 1000;

    &:hover {
      border-color: var(--b3-theme-primary);
    }

    &:focus {
      outline: none;
      border-color: var(--b3-theme-primary);
      box-shadow: 0 0 0 2px rgba(51, 97, 255, 0.2);
    }

    option {
      background-color: var(--b3-theme-surface);
      color: var(--b3-theme-on-surface);
      padding: 6px 12px;
    }

    option:hover {
      background-color: var(--b3-theme-surface-hover);
    }
  }

  .toggle-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--b3-border-color);
    border-radius: 4px;
    background-color: var(--b3-theme-surface);
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      border-color: var(--b3-theme-primary);
      color: var(--b3-theme-primary);
    }

    &.active {
      border-color: var(--b3-theme-primary);
      color: var(--b3-theme-primary);
    }

    .icon {
      font-size: 16px;
      font-weight: bold;
      transition: transform 0.2s ease;
    }
  }
}

// 滑动动画
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease;
}

.slide-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

// 标签页标题样式
.header{
  padding: 6px !important;
}
.tab-title-box {
  background-color: var(--b3-theme-surface);
  padding: 0px 4px;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  flex: 1;
  min-width: 0;
  flex-wrap: nowrap;
  border-radius: 4px;

  &::-webkit-scrollbar {
    height: 4px;
  }

  &::-webkit-scrollbar-track {
    background: var(--b3-theme-background);
  }

  &::-webkit-scrollbar-thumb {
    background: var(--b3-border-color);
    border-radius: 2px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: var(--b3-theme-primary);
  }
}

.tab-title {
  display: flex;
  align-items: center;
  padding: 6px 0px;
  border-radius: 4px;
  transition: all 0.2s ease;

  &:hover {
    background-color: var(--b3-theme-surface-hover);
  }

  .tab-title-text {
    cursor: pointer;
    color: var(--b3-theme-on-surface);
    font-size: 14px;
    transition: all 0.2s ease;
    padding: 0 2px;

    &:hover {
      color: var(--b3-theme-primary);
    }
  }

  .tab-close-btn {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background-color: transparent;
    color: var(--b3-theme-on-surface);
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    opacity: 0;
    transition: all 0.2s ease;

    &:hover {
      background-color: rgba(255, 0, 0, 0.1);
      color: #ff4d4f !important;
    }
  }

  &:hover .tab-close-btn {
    opacity: 1;
  }
}

// 选中的标签页样式
.tab-title.active {
  background-color: transparent;

  .tab-title-text {
    color: var(--b3-theme-primary);
    font-weight: 800;
    font-size: 16px;
  }

  .tab-close-btn {
    color: var(--b3-theme-on-surface);
  }
}

// 布局头部样式
:deep(.arco-layout-header) {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  gap: 12px;
}
</style>

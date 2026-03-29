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
        <template v-for="(notebookId, index) in selectNotebookIds" :key="notebookId">
          <CalendarView v-if="notebookId === selectNotebookId" :notebook="getNotebookById(notebookId)" />
        </template>
      </a-layout-content>
    </a-layout>
  </a-config-provider>
</template>

<script lang="ts" setup>
import CalendarView from '@/components/CalendarView.vue';
import { Constants } from 'siyuan';
import { lsNotebooks, request, pushErrMsg } from '@/api/api';
import { useLocale, formatMsg } from '@/hooks/useLocale';
import { eventBus, i18n, weekStart } from '@/hooks/useSiYuan';
import { CusNotebook } from '@/utils/notebook';
import { refreshSql } from './api/utils';

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
  await request('/api/storage/setLocalStorageVal', {
    app: Constants.SIYUAN_APPID,
    key: 'local-dailynoteids',
    val: JSON.stringify(selectNotebookIds.value),
  });
}

// 根据笔记本 ID 获取笔记本名称
function getNotebookName(notebookId: NotebookId): string {
  const notebook = cusNotebooks.value.find(book => book.id === notebookId);
  return notebook ? notebook.name : notebookId;
}

// 根据笔记本 ID 获取笔记本对象
function getNotebookById(notebookId: NotebookId): CusNotebook | undefined {
  return cusNotebooks.value.find(book => book.id === notebookId);
}

async function init() {
  const { notebooks } = await lsNotebooks();
  const books = notebooks.filter((book: Notebook) => !book.closed);
  for (const book of books) {
    const cusNotebook = await CusNotebook.build(book);
    cusNotebooks.value.push(cusNotebook);
  }
  const storage = await request('/api/storage/getLocalStorage');
  if (cusNotebooks.value.map(book => book.id).includes(storage['local-dailynoteid'])) {
    selectNotebookId.value = storage['local-dailynoteid'];
  } else {
    selectNotebookId.value = undefined;
  }
  // 读取 selectNotebookIds
  if (storage['local-dailynoteids']) {
    try {
      selectNotebookIds.value = JSON.parse(storage['local-dailynoteids']);
    } catch (e) {
      selectNotebookIds.value = [];
    }
  } else {
    selectNotebookIds.value = [];
  }
}
init();

eventBus.value?.on('ws-main', async ({ detail }) => {
  const { cmd } = detail;
  if (['createnotebook', 'mount', 'unmount'].includes(cmd)) {
    await refreshSql();
    cusNotebooks.value = [];
    await init();
  }
});

watch(selectNotebookId, async bookId => {
  if (!bookId) {
    await pushErrMsg(formatMsg('notNoteBook'));
    return;
  }
  const storage = await request('/api/storage/getLocalStorage');
  if (bookId !== storage['local-dailynoteid']) {
    await request('/api/storage/setLocalStorageVal', {
      app: Constants.SIYUAN_APPID,
      key: 'local-dailynoteid',
      val: bookId,
    });
  }
  // 更新 selectNotebookIds
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
  console.log(notebookId);
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
.tab-title-box {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  flex: 1;
  min-width: 0;
  flex-wrap: nowrap;

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
    color: var(--b3-theme-on-surface-light);
    font-size: 14px;
    transition: all 0.2s ease;
    padding: 0 2px;

    &:hover {
      color: var(--b3-theme-on-surface);
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
    color: var(--b3-theme-on-surface-light);
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    opacity: 0;
    transition: all 0.2s ease;

    &:hover {
      background-color: rgba(255, 0, 0, 0.1);
      color: #ff4d4f;
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
    color: var(--b3-theme-on-surface);
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

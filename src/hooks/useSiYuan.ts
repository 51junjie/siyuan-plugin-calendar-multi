import { ref, shallowRef } from 'vue';
import type { App, I18N, EventBus } from 'siyuan';

export interface PluginStorage {
  loadData<T = unknown>(key: string): Promise<T | null>;
  saveData<T>(key: string, data: T): Promise<void>;
}

export const app = ref<App>({ plugins: [], appId: '' });
export const pluginStorage = ref<PluginStorage>();

export const i18n = ref<I18N>({});

export const isMobile = ref<boolean>(false);

// EventBus contains private methods and must not be wrapped in a Vue reactive Proxy.
export const eventBus = shallowRef<EventBus>();

export const position = ref();
export const weekStart = ref<number>(1);
export const showWeekNum = ref<boolean>(false);
export const weeklyEnabled = ref<boolean>(false);
export const weeklyPath = ref<string>('');
export const weeklyTemplatePath = ref<string>('');

// 用于触发日历刷新的计数器，每次弹窗打开时递增
export const refreshTrigger = ref(0);

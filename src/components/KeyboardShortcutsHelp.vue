<script setup lang="ts">
import { computed } from 'vue'
import { DEFAULT_SHORTCUTS_P0 } from '@/composables/useKeyboardShortcuts'

const emit = defineEmits<{
  (e: 'close'): void
}>()

interface ShortcutItem {
  key: string
  description: string
  category: string
}

// 按类别分组快捷键
const shortcutsByCategory = computed(() => {
  const categories = {
    navigation: [] as ShortcutItem[],
    action: [] as ShortcutItem[],
    function: [] as ShortcutItem[]
  }

  Object.entries(DEFAULT_SHORTCUTS_P0).forEach(([key, config]) => {
    const category = config.category || 'function'
    categories[category].push({
      key,
      description: config.description,
      category
    })
  })

  return categories
})

const categoryNames = {
  navigation: '导航',
  action: '操作',
  function: '功能'
}

// 格式化快捷键显示
const formatKey = (key: string): string => {
  return key
    .replace('Ctrl+', 'Ctrl + ')
    .replace('Alt+', 'Alt + ')
    .replace('Shift+', 'Shift + ')
    .replace('ArrowUp', '↑')
    .replace('ArrowDown', '↓')
    .replace('ArrowLeft', '←')
    .replace('ArrowRight', '→')
}

const handleClose = () => {
  emit('close')
}

// 点击背景关闭
const handleOverlayClick = (event: MouseEvent) => {
  if (event.target === event.currentTarget) {
    handleClose()
  }
}
</script>

<template>
  <div class="shortcuts-help-overlay" @click="handleOverlayClick">
    <div class="shortcuts-help-dialog">
      <div class="dialog-header">
        <h2>快捷键帮助</h2>
        <button class="close-btn" @click="handleClose" aria-label="关闭">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="dialog-body">
        <!-- 导航类 -->
        <div class="category-section" v-if="shortcutsByCategory.navigation.length > 0">
          <h3 class="category-title">{{ categoryNames.navigation }}</h3>
          <div class="shortcuts-list">
            <div
              v-for="shortcut in shortcutsByCategory.navigation"
              :key="shortcut.key"
              class="shortcut-item"
            >
              <kbd class="shortcut-key">{{ formatKey(shortcut.key) }}</kbd>
              <span class="shortcut-description">{{ shortcut.description }}</span>
            </div>
          </div>
        </div>

        <!-- 操作类 -->
        <div class="category-section" v-if="shortcutsByCategory.action.length > 0">
          <h3 class="category-title">{{ categoryNames.action }}</h3>
          <div class="shortcuts-list">
            <div
              v-for="shortcut in shortcutsByCategory.action"
              :key="shortcut.key"
              class="shortcut-item"
            >
              <kbd class="shortcut-key">{{ formatKey(shortcut.key) }}</kbd>
              <span class="shortcut-description">{{ shortcut.description }}</span>
            </div>
          </div>
        </div>

        <!-- 功能类 -->
        <div class="category-section" v-if="shortcutsByCategory.function.length > 0">
          <h3 class="category-title">{{ categoryNames.function }}</h3>
          <div class="shortcuts-list">
            <div
              v-for="shortcut in shortcutsByCategory.function"
              :key="shortcut.key"
              class="shortcut-item"
            >
              <kbd class="shortcut-key">{{ formatKey(shortcut.key) }}</kbd>
              <span class="shortcut-description">{{ shortcut.description }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <p class="hint">按 <kbd>Esc</kbd> 或 <kbd>?</kbd> 关闭此面板</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 对话框遮罩层 ========== */
.shortcuts-help-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(2px);
}

/* ========== 对话框容器 ========== */
.shortcuts-help-dialog {
  background: var(--agent-secondary-bg, #FFFFFF);
  border-radius: var(--agent-border-radius-xl, 12px);
  width: 600px;
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--agent-shadow-xl, 0 12px 32px rgba(0, 0, 0, 0.12));
  animation: dialogSlideIn 0.25s ease-out;
  overflow: hidden;
}

@keyframes dialogSlideIn {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ========== 对话框头部 ========== */
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px;
  border-bottom: 1px solid var(--agent-border-color, #E8E8E8);
  background: var(--agent-body-bg, #F7F8FA);
}

.dialog-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--agent-text-color, #262626);
  display: flex;
  align-items: center;
  gap: 8px;
}

.dialog-header h2::before {
  content: '⌨️';
  font-size: 18px;
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--agent-text-tertiary, #8C8C8C);
  border-radius: var(--agent-border-radius, 6px);
  transition: all var(--transition-fast, 0.15s ease);
}

.close-btn:hover {
  background: var(--agent-hover-bg, #F3F4F6);
  color: var(--agent-text-color, #262626);
}

/* ========== 对话框主体 ========== */
.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

/* ========== 分类区域 ========== */
.category-section {
  margin-bottom: 20px;
  background: var(--agent-body-bg, #F7F8FA);
  padding: 16px;
  border-radius: var(--agent-border-radius-lg, 8px);
  border: 1px solid var(--agent-border-color, #E8E8E8);
}

.category-section:last-child {
  margin-bottom: 0;
}

.category-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--agent-primary-color, #1890FF);
  margin: 0 0 12px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.category-title::before {
  content: '•';
  font-size: 16px;
}

/* ========== 快捷键列表 ========== */
.shortcuts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--agent-secondary-bg, #FFFFFF);
  border-radius: var(--agent-border-radius, 6px);
  border: 1px solid var(--agent-border-color-light, #F0F0F0);
  transition: all var(--transition-fast, 0.15s ease);
}

.shortcut-item:hover {
  border-color: var(--agent-primary-color, #1890FF);
  background: var(--agent-primary-light, #E6F7FF);
}

.shortcut-key {
  font-family: 'SF Mono', 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 12px;
  padding: 5px 10px;
  background: linear-gradient(180deg, #FFFFFF 0%, #F5F5F5 100%);
  border: 1px solid var(--agent-border-color, #E8E8E8);
  border-radius: var(--agent-border-radius-sm, 4px);
  color: var(--agent-text-color, #262626);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06), inset 0 1px 0 #FFFFFF;
  min-width: 100px;
  text-align: center;
  font-weight: 500;
}

.shortcut-description {
  font-size: 14px;
  color: var(--agent-text-secondary, #595959);
  flex: 1;
  text-align: right;
  padding-left: 16px;
}

/* ========== 对话框底部 ========== */
.dialog-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--agent-border-color, #E8E8E8);
  background: var(--agent-body-bg, #F7F8FA);
}

.hint {
  margin: 0;
  font-size: 13px;
  color: var(--agent-text-tertiary, #8C8C8C);
  text-align: center;
}

.hint kbd {
  font-family: 'SF Mono', 'Monaco', 'Menlo', 'Courier New', monospace;
  font-size: 11px;
  padding: 2px 6px;
  background: linear-gradient(180deg, #FFFFFF 0%, #F5F5F5 100%);
  border: 1px solid var(--agent-border-color, #E8E8E8);
  border-radius: 3px;
  color: var(--agent-text-color, #262626);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  margin: 0 2px;
}
</style>

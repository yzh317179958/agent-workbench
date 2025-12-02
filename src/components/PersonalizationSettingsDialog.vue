<template>
  <div v-if="visible" class="dialog-overlay" @click.self="closeDialog">
    <div class="dialog-container">
      <div class="dialog-header">
        <h3>个性化设置</h3>
        <button class="close-btn" @click="closeDialog">&times;</button>
      </div>

      <div class="dialog-body">
        <section class="settings-section">
          <h4>界面设置</h4>

          <div class="setting-group">
            <span class="setting-label">主题风格</span>
            <div class="options-row">
              <label v-for="option in themeOptions" :key="option.value" class="option-pill">
                <input
                  type="radio"
                  name="theme"
                  :value="option.value"
                  v-model="localSettings.appearance.theme"
                  @change="handleImmediateChange"
                />
                <span>{{ option.label }}</span>
              </label>
            </div>
          </div>

          <div class="setting-group">
            <span class="setting-label">字体大小</span>
            <div class="options-row">
              <label v-for="option in fontSizeOptions" :key="option.value" class="option-pill">
                <input
                  type="radio"
                  name="fontSize"
                  :value="option.value"
                  v-model="localSettings.appearance.fontSize"
                  @change="handleImmediateChange"
                />
                <span>{{ option.label }}</span>
              </label>
            </div>
          </div>

          <div class="setting-group">
            <span class="setting-label">会话列表密度</span>
            <div class="options-row">
              <label v-for="option in densityOptions" :key="option.value" class="option-pill">
                <input
                  type="radio"
                  name="density"
                  :value="option.value"
                  v-model="localSettings.appearance.listDensity"
                />
                <span>{{ option.label }}</span>
              </label>
            </div>
          </div>

          <div class="setting-group">
            <span class="setting-label">消息气泡样式</span>
            <div class="options-row">
              <label v-for="option in bubbleStyleOptions" :key="option.value" class="option-pill">
                <input
                  type="radio"
                  name="bubble"
                  :value="option.value"
                  v-model="localSettings.appearance.bubbleStyle"
                />
                <span>{{ option.label }}</span>
              </label>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h4>行为设置</h4>

          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">发送快捷键</span>
              <p class="setting-description">选择按键组合以发送消息</p>
            </div>
            <select v-model="localSettings.behavior.sendShortcut">
              <option value="enter">Enter 发送（Shift+Enter 换行）</option>
              <option value="ctrlenter">Ctrl + Enter 发送</option>
            </select>
          </div>

          <div class="setting-item">
            <label>
              <input type="checkbox" v-model="localSettings.behavior.autoTakeover" />
              <span>自动接入等待中的会话</span>
            </label>
            <p class="setting-description">选中会话后自动发送接入请求</p>
          </div>

          <div class="setting-item">
            <label>
              <input type="checkbox" v-model="localSettings.behavior.showMessagePreview" />
              <span>显示会话消息预览</span>
            </label>
            <p class="setting-description">在列表中展示最后一条消息</p>
          </div>

          <div class="setting-item">
            <label>
              <input type="checkbox" v-model="localSettings.behavior.autoLoadHistory" />
              <span>自动加载历史消息</span>
            </label>
            <p class="setting-description">关闭后需要手动点击才能加载历史消息</p>
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">会话列表自动刷新</span>
              <p class="setting-description">定期刷新待接入/服务中列表</p>
            </div>
            <select v-model.number="localSettings.behavior.sessionRefreshInterval">
              <option v-for="option in refreshOptions" :key="option" :value="option">
                每 {{ option }} 秒
              </option>
            </select>
          </div>
        </section>
      </div>

      <div class="dialog-footer">
        <button class="secondary-btn" @click="closeDialog">取消</button>
        <button class="primary-btn" @click="handleSave">保存设置</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useSettingsStore, type PersonalSettings } from '@/stores/settingsStore'
import { deepClone } from '@/utils/deepClone'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
}>()

const settingsStore = useSettingsStore()

const localSettings = reactive<PersonalSettings>(deepClone(settingsStore.settings))

const themeOptions = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' }
]

const fontSizeOptions = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' }
]

const densityOptions = [
  { value: 'compact', label: '紧凑' },
  { value: 'standard', label: '标准' },
  { value: 'comfortable', label: '宽松' }
]

const bubbleStyleOptions = [
  { value: 'rounded', label: '圆角' },
  { value: 'flat', label: '直角' }
]

const refreshOptions: Array<10 | 30 | 60> = [10, 30, 60]

function syncSettings() {
  Object.assign(localSettings.appearance, settingsStore.settings.appearance)
  Object.assign(localSettings.behavior, settingsStore.settings.behavior)
}

function closeDialog() {
  emit('close')
}

function handleImmediateChange() {
  // 主题和字体大小需要即时生效，直接写回 store
  settingsStore.settings.appearance.theme = localSettings.appearance.theme
  settingsStore.settings.appearance.fontSize = localSettings.appearance.fontSize
}

function handleSave() {
  settingsStore.settings.appearance.listDensity = localSettings.appearance.listDensity
  settingsStore.settings.appearance.bubbleStyle = localSettings.appearance.bubbleStyle

  settingsStore.settings.behavior.sendShortcut = localSettings.behavior.sendShortcut
  settingsStore.settings.behavior.autoTakeover = localSettings.behavior.autoTakeover
  settingsStore.settings.behavior.showMessagePreview = localSettings.behavior.showMessagePreview
  settingsStore.settings.behavior.autoLoadHistory = localSettings.behavior.autoLoadHistory
  settingsStore.settings.behavior.sessionRefreshInterval = localSettings.behavior.sessionRefreshInterval

  emit('close')
}

watch(() => props.visible, (visible) => {
  if (visible) {
    syncSettings()
  }
})
</script>

<style scoped>
/* ========== 对话框遮罩层 ========== */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

/* ========== 对话框容器 ========== */
.dialog-container {
  background: var(--agent-secondary-bg, #FFFFFF);
  border-radius: var(--agent-border-radius-xl, 12px);
  width: 640px;
  max-width: 90vw;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--agent-shadow-xl, 0 12px 32px rgba(0, 0, 0, 0.12));
  animation: dialogSlideIn 0.25s ease-out;
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

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--agent-text-color, #262626);
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--agent-text-tertiary, #8C8C8C);
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--agent-border-radius, 6px);
  transition: all var(--transition-fast, 0.15s ease);
  line-height: 1;
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

/* ========== 设置分组 ========== */
.settings-section {
  background: var(--agent-body-bg, #F7F8FA);
  padding: 16px;
  border-radius: var(--agent-border-radius-lg, 8px);
  margin-bottom: 16px;
  border: 1px solid var(--agent-border-color, #E8E8E8);
}

.settings-section:last-child {
  margin-bottom: 0;
}

.settings-section h4 {
  margin: 0 0 14px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--agent-text-color, #262626);
  display: flex;
  align-items: center;
  gap: 6px;
}

.settings-section h4::before {
  content: '⚙️';
  font-size: 14px;
}

/* ========== 设置组 ========== */
.setting-group {
  margin-bottom: 16px;
}

.setting-group:last-child {
  margin-bottom: 0;
}

.setting-label {
  display: block;
  font-weight: 500;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--agent-text-color, #262626);
}

/* ========== 选项按钮组 ========== */
.options-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.option-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 20px;
  border: 1px solid var(--agent-border-color, #E8E8E8);
  cursor: pointer;
  font-size: 13px;
  background: var(--agent-secondary-bg, #FFFFFF);
  color: var(--agent-text-color, #262626);
  transition: all var(--transition-fast, 0.15s ease);
}

.option-pill:hover {
  border-color: var(--agent-primary-color, #1890FF);
  background: var(--agent-primary-light, #E6F7FF);
}

.option-pill:has(input:checked) {
  border-color: var(--agent-primary-color, #1890FF);
  background: var(--agent-primary-light, #E6F7FF);
  color: var(--agent-primary-color, #1890FF);
}

.option-pill input {
  margin: 0;
  accent-color: var(--agent-primary-color, #1890FF);
}

/* ========== 设置项 ========== */
.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--agent-border-color-light, #F0F0F0);
}

.setting-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.setting-item:first-child {
  padding-top: 0;
}

.setting-item label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--agent-text-color, #262626);
}

.setting-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--agent-primary-color, #1890FF);
}

.setting-info {
  flex: 1;
}

.setting-description {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--agent-text-tertiary, #8C8C8C);
}

/* ========== 下拉选择框 ========== */
select {
  padding: 8px 12px;
  border-radius: var(--agent-border-radius, 6px);
  border: 1px solid var(--agent-border-color, #E8E8E8);
  background: var(--agent-secondary-bg, #FFFFFF);
  font-size: 13px;
  color: var(--agent-text-color, #262626);
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

select:hover {
  border-color: var(--agent-primary-color, #1890FF);
}

select:focus {
  outline: none;
  border-color: var(--agent-primary-color, #1890FF);
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
}

/* ========== 对话框底部 ========== */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--agent-border-color, #E8E8E8);
  background: var(--agent-body-bg, #F7F8FA);
}

/* ========== 按钮样式 ========== */
button {
  border: none;
  border-radius: var(--agent-border-radius, 6px);
  padding: 8px 18px;
  font-weight: 500;
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.primary-btn {
  background: linear-gradient(135deg, var(--agent-primary-color, #1890FF) 0%, var(--agent-primary-hover, #40A9FF) 100%);
  color: white;
  box-shadow: 0 2px 6px rgba(24, 144, 255, 0.25);
}

.primary-btn:hover {
  box-shadow: 0 4px 10px rgba(24, 144, 255, 0.35);
  transform: translateY(-1px);
}

.secondary-btn {
  background: var(--agent-secondary-bg, #FFFFFF);
  color: var(--agent-text-color, #262626);
  border: 1px solid var(--agent-border-color, #E8E8E8);
}

.secondary-btn:hover {
  border-color: var(--agent-primary-color, #1890FF);
  color: var(--agent-primary-color, #1890FF);
}
</style>

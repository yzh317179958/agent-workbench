<template>
  <div v-if="visible" class="dialog-overlay" @click.self="closeDialog">
    <!-- Debug: 对话框已渲染 -->
    <div class="dialog-container">
      <div class="dialog-header">
        <h3>提醒设置</h3>
        <button class="close-btn" @click="closeDialog">&times;</button>
      </div>

      <div class="dialog-body">
        <!-- 通知权限状态 -->
        <div class="permission-section">
          <div class="permission-status">
            <span class="status-label">浏览器通知权限:</span>
            <span :class="['status-badge', permissionClass]">
              {{ permissionText }}
            </span>
          </div>

          <div class="permission-actions">
            <p v-if="!supportsNotification" class="permission-help">
              ⚠️ 当前浏览器不支持 Notification API，请使用最新的 Chrome、Edge 或 Safari。
            </p>
            <p v-else-if="!isSecureContext" class="permission-help">
              ⚠️ 需要在 HTTPS 或 http://localhost 环境下才能申请通知权限。
            </p>
            <template v-else>
              <button
                v-if="notificationPermission !== 'granted'"
                @click="handleRequestPermission"
                class="primary-btn"
                :disabled="!canRequestPermission"
              >
                {{ permissionButtonText }}
              </button>
              <p v-else class="permission-help success">✅ 已获得通知权限</p>
            </template>
          </div>

          <div
            v-if="supportsNotification && isSecureContext && notificationPermission === 'denied'"
            class="permission-help"
          >
            <p>⚠️ 通知权限已被浏览器拒绝。请按以下步骤手动开启：</p>
            <ol>
              <li>点击地址栏左侧的 🔒/ⓘ 图标</li>
              <li>找到「通知」或「Notifications」设置，选择「允许」</li>
              <li>刷新页面，再次点击上方按钮验证权限状态</li>
            </ol>
          </div>
        </div>

        <!-- 会话提醒 -->
        <div class="settings-section">
          <h4>会话提醒</h4>

          <div class="setting-item">
            <label>
              <input
                type="checkbox"
                v-model="localSettings.new_session"
                @change="handleSettingsChange"
              />
              <span>新会话提醒（声音 + 通知）</span>
            </label>
            <p class="setting-description">有新会话进入队列时提醒</p>
          </div>

          <div class="setting-item">
            <label>
              <input
                type="checkbox"
                v-model="localSettings.vip_session"
                @change="handleSettingsChange"
              />
              <span>VIP会话提醒（声音 + 通知）</span>
            </label>
            <p class="setting-description">VIP客户请求服务时提醒</p>
          </div>

          <div class="setting-item">
            <label>
              <input
                type="checkbox"
                v-model="localSettings.customer_reply"
                @change="handleSettingsChange"
              />
              <span>客户回复提醒（仅通知）</span>
            </label>
            <p class="setting-description">客户发送新消息时提醒</p>
          </div>
        </div>

        <!-- 协作提醒 -->
        <div class="settings-section">
          <h4>协作提醒</h4>

          <div class="setting-item">
            <label>
              <input
                type="checkbox"
                v-model="localSettings.mention"
                @change="handleSettingsChange"
              />
              <span>@提醒（通知 + 红点）</span>
            </label>
            <p class="setting-description">被其他坐席@时提醒</p>
          </div>

          <div class="setting-item">
            <label>
              <input
                type="checkbox"
                v-model="localSettings.assist_request"
                @change="handleSettingsChange"
              />
              <span>协助请求（通知 + 红点）</span>
            </label>
            <p class="setting-description">收到协助请求时提醒</p>
          </div>

          <div class="setting-item">
            <label>
              <input
                type="checkbox"
                v-model="localSettings.transfer_request"
                @change="handleSettingsChange"
              />
              <span>转接请求（通知 + 声音）</span>
            </label>
            <p class="setting-description">收到转接请求时提醒</p>
          </div>
        </div>

        <!-- 声音设置 -->
        <div class="settings-section">
          <h4>声音设置</h4>

          <div class="setting-item">
            <label>
              <input
                type="checkbox"
                v-model="localSettings.sound_enabled"
                @change="handleSettingsChange"
              />
              <span>启用声音提醒</span>
            </label>
          </div>

          <div v-if="localSettings.sound_enabled" class="setting-item">
            <label>
              <span>音量: {{ localSettings.sound_volume }}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              v-model.number="localSettings.sound_volume"
              @change="handleSettingsChange"
              class="volume-slider"
            />
            <button @click="testSound" class="test-sound-btn">🔊 测试声音</button>
          </div>

          <div class="setting-item">
            <label>
              <input
                type="checkbox"
                v-model="localSettings.quiet_mode_enabled"
                @change="handleSettingsChange"
              />
              <span>静音模式</span>
            </label>
            <p class="setting-description">在指定时段内不播放声音</p>
          </div>

          <div v-if="localSettings.quiet_mode_enabled" class="quiet-mode-time">
            <label>
              <span>静音时段:</span>
              <input
                type="time"
                v-model="localSettings.quiet_mode_start"
                @change="handleSettingsChange"
              />
              <span>至</span>
              <input
                type="time"
                v-model="localSettings.quiet_mode_end"
                @change="handleSettingsChange"
              />
            </label>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <button @click="closeDialog" class="secondary-btn">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useNotification, type NotificationSettings } from '../composables/useNotification'

// Props
const { visible } = defineProps<{
  visible: boolean
}>()

// Emits
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

// 使用通知系统
const {
  notificationPermission,
  settings,
  requestPermission,
  updateSettings
} = useNotification()

const supportsNotification = typeof window !== 'undefined' && 'Notification' in window
const isSecureContext = typeof window !== 'undefined' ? window.isSecureContext : true

// 本地设置副本（用于编辑）
const localSettings = ref<NotificationSettings>({ ...settings.value })

// 监听 settings 变化，同步到本地副本
watch(() => settings.value, (newSettings) => {
  localSettings.value = { ...newSettings }
}, { deep: true })

// 是否可主动申请权限
const canRequestPermission = computed(() => {
  return supportsNotification &&
    isSecureContext &&
    notificationPermission.value === 'default'
})

const permissionButtonText = computed(() => {
  if (!supportsNotification) {
    return '浏览器不支持通知'
  }
  if (!isSecureContext) {
    return '仅HTTPS/localhost可用'
  }
  if (notificationPermission.value === 'denied') {
    return '❌ 权限已拒绝'
  }
  if (notificationPermission.value === 'granted') {
    return '✅ 已授权'
  }
  return '申请通知权限'
})

// 权限状态样式
const permissionClass = computed(() => {
  switch (notificationPermission.value) {
    case 'granted':
      return 'status-granted'
    case 'denied':
      return 'status-denied'
    default:
      return 'status-default'
  }
})

// 权限状态文本
const permissionText = computed(() => {
  switch (notificationPermission.value) {
    case 'granted':
      return '✅ 已授权'
    case 'denied':
      return '❌ 已拒绝'
    default:
      return '⚠️ 未授权'
  }
})

// 请求通知权限
async function handleRequestPermission() {
  if (!supportsNotification) {
    alert('当前浏览器不支持通知，请使用最新版本的 Chrome / Edge 等现代浏览器。')
    return
  }
  if (!isSecureContext) {
    alert('通知权限需要在 HTTPS 或 http://localhost 环境下申请，请切换到安全连接后重试。')
    return
  }

  const permission = await requestPermission()
  if (permission === 'granted') {
    alert('通知权限已授权！您将收到实时提醒。')
  } else if (permission === 'denied') {
    alert('浏览器已拒绝通知权限，请在地址栏左侧的站点设置中手动开启通知权限后重载页面。')
  }
}

// 设置变更处理
function handleSettingsChange() {
  updateSettings(localSettings.value)
}

// 测试声音
function testSound() {
  const audio = new Audio('/sounds/notification.mp3')
  audio.volume = localSettings.value.sound_volume / 100
  audio.play().catch(err => {
    alert('播放失败：' + err.message)
  })
}

// 关闭对话框
function closeDialog() {
  emit('update:visible', false)
}
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
  width: 560px;
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

/* ========== 权限区域 ========== */
.permission-section {
  background: var(--agent-body-bg, #F7F8FA);
  padding: 16px;
  border-radius: var(--agent-border-radius-lg, 8px);
  margin-bottom: 20px;
  border: 1px solid var(--agent-border-color, #E8E8E8);
}

.permission-status {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.status-label {
  font-weight: 500;
  color: var(--agent-text-color, #262626);
  font-size: 14px;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
}

.status-granted {
  background: var(--agent-success-light, #F6FFED);
  color: var(--agent-success, #52C41A);
  border: 1px solid var(--agent-success-border, #B7EB8F);
}

.status-denied {
  background: var(--agent-danger-light, #FFF2F0);
  color: var(--agent-danger, #FF4D4F);
  border: 1px solid var(--agent-danger-border, #FFCCC7);
}

.status-default {
  background: var(--agent-warning-light, #FFFBE6);
  color: var(--agent-warning, #FAAD14);
  border: 1px solid var(--agent-warning-border, #FFE58F);
}

.permission-help {
  margin-top: 14px;
  padding: 12px 14px;
  background: var(--agent-warning-light, #FFFBE6);
  border-left: 3px solid var(--agent-warning, #FAAD14);
  border-radius: var(--agent-border-radius-sm, 4px);
  font-size: 13px;
}

.permission-help.success {
  background: var(--agent-success-light, #F6FFED);
  border-left-color: var(--agent-success, #52C41A);
  color: var(--agent-success, #52C41A);
}

.permission-help p {
  margin: 0 0 8px 0;
  font-weight: 500;
  color: #92400e;
}

.permission-help ol {
  margin: 0;
  padding-left: 18px;
  color: #78350f;
}

.permission-help li {
  margin: 4px 0;
  font-size: 13px;
}

/* ========== 设置分组 ========== */
.settings-section {
  margin-bottom: 20px;
}

.settings-section h4 {
  margin: 0 0 14px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--agent-text-color, #262626);
  border-bottom: 1px solid var(--agent-border-color, #E8E8E8);
  padding-bottom: 8px;
}

.setting-item {
  margin-bottom: 14px;
}

.setting-item label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 500;
  color: var(--agent-text-color, #262626);
  font-size: 14px;
}

.setting-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--agent-primary-color, #1890FF);
}

.setting-description {
  margin: 4px 0 0 24px;
  font-size: 12px;
  color: var(--agent-text-tertiary, #8C8C8C);
}

.volume-slider {
  width: 100%;
  margin: 8px 0;
  accent-color: var(--agent-primary-color, #1890FF);
}

.test-sound-btn {
  margin-top: 8px;
  padding: 6px 14px;
  background: var(--agent-secondary-bg, #FFFFFF);
  border: 1px solid var(--agent-border-color, #E8E8E8);
  border-radius: var(--agent-border-radius-sm, 4px);
  cursor: pointer;
  font-size: 13px;
  transition: all var(--transition-fast, 0.15s ease);
  color: var(--agent-text-color, #262626);
}

.test-sound-btn:hover {
  border-color: var(--agent-primary-color, #1890FF);
  color: var(--agent-primary-color, #1890FF);
}

.quiet-mode-time {
  margin-left: 24px;
  margin-top: 8px;
}

.quiet-mode-time label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.quiet-mode-time input[type="time"] {
  padding: 5px 10px;
  border: 1px solid var(--agent-border-color, #E8E8E8);
  border-radius: var(--agent-border-radius-sm, 4px);
  font-size: 13px;
  color: var(--agent-text-color, #262626);
}

.quiet-mode-time input[type="time"]:focus {
  outline: none;
  border-color: var(--agent-primary-color, #1890FF);
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

.primary-btn,
.secondary-btn {
  padding: 8px 18px;
  border-radius: var(--agent-border-radius, 6px);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
  border: none;
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

.primary-btn:disabled {
  background: var(--agent-text-placeholder, #BFBFBF);
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
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

<template>
  <div v-if="visible" class="dialog-overlay" @click.self="closeDialog">
    <div class="dialog-container">
      <div class="dialog-header">
        <h3>请求协助</h3>
        <button class="close-btn" @click="closeDialog">&times;</button>
      </div>

      <div class="dialog-body">
        <div class="form-group">
          <label>协助坐席 <span class="required">*</span></label>
          <select v-model="selectedAgent" class="select-input">
            <option value="">请选择坐席</option>
            <option
              v-for="agent in availableAgents"
              :key="agent.agent_id"
              :value="agent.username"
            >
              {{ agent.name }} ({{ agent.username }}) - {{ statusLabel(agent.status) }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>请求内容 <span class="required">*</span></label>
          <textarea
            v-model="question"
            class="textarea-input"
            placeholder="请描述需要协助的问题..."
            rows="5"
          ></textarea>
          <div class="char-count">{{ question.length }}/500</div>
        </div>
      </div>

      <div class="dialog-footer">
        <button @click="closeDialog" class="secondary-btn">取消</button>
        <button
          @click="handleSubmit"
          class="primary-btn"
          :disabled="!canSubmit || isSubmitting"
        >
          {{ isSubmitting ? '发送中...' : '发送请求' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

// Props
defineProps<{
  visible: boolean
  sessionName: string
  availableAgents: Array<{
    agent_id: string
    username: string
    name: string
    status: string
  }>
}>()

// Emits
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', data: { assistant: string; question: string }): void
}>()

// 状态
const selectedAgent = ref('')
const question = ref('')
const isSubmitting = ref(false)

const statusMap: Record<string, string> = {
  online: '在线',
  busy: '忙碌',
  break: '小休',
  lunch: '午休',
  training: '培训',
  offline: '离线'
}

// 计算属性
const canSubmit = computed(() => {
  return selectedAgent.value && question.value.trim().length > 0 && question.value.length <= 500
})

const statusLabel = (status: string) => statusMap[status] || status

// 方法
function closeDialog() {
  selectedAgent.value = ''
  question.value = ''
  isSubmitting.value = false
  emit('close')
}

async function handleSubmit() {
  if (!canSubmit.value || isSubmitting.value) return

  isSubmitting.value = true

  try {
    emit('submit', {
      assistant: selectedAgent.value,
      question: question.value.trim()
    })
    closeDialog()
  } catch (error) {
    console.error('发送协助请求失败:', error)
    isSubmitting.value = false
  }
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
  width: 500px;
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

/* ========== 表单组 ========== */
.form-group {
  margin-bottom: 18px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--agent-text-color, #262626);
  font-size: 13px;
}

.required {
  color: var(--agent-danger, #FF4D4F);
  margin-left: 2px;
}

/* ========== 下拉选择框 ========== */
.select-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--agent-border-color, #E8E8E8);
  border-radius: var(--agent-border-radius, 6px);
  font-size: 14px;
  color: var(--agent-text-color, #262626);
  background: var(--agent-secondary-bg, #FFFFFF);
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.select-input:hover {
  border-color: var(--agent-primary-color, #1890FF);
}

.select-input:focus {
  outline: none;
  border-color: var(--agent-primary-color, #1890FF);
  box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
}

/* ========== 文本域 ========== */
.textarea-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--agent-border-color, #E8E8E8);
  border-radius: var(--agent-border-radius, 6px);
  font-size: 14px;
  color: var(--agent-text-color, #262626);
  font-family: inherit;
  resize: vertical;
  min-height: 100px;
  transition: all var(--transition-fast, 0.15s ease);
  background: var(--agent-secondary-bg, #FFFFFF);
}

.textarea-input::placeholder {
  color: var(--agent-text-placeholder, #BFBFBF);
}

.textarea-input:hover {
  border-color: var(--agent-border-color-dark, #D9D9D9);
}

.textarea-input:focus {
  outline: none;
  border-color: var(--agent-primary-color, #1890FF);
  box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
}

/* ========== 字符计数 ========== */
.char-count {
  text-align: right;
  font-size: 11px;
  color: var(--agent-text-tertiary, #8C8C8C);
  margin-top: 6px;
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

.primary-btn:hover:not(:disabled) {
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

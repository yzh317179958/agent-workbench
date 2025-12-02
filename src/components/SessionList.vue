<script setup lang="ts">
import type { SessionSummary } from '@/types'

const props = withDefaults(defineProps<{
  sessions: SessionSummary[]
  isLoading: boolean
  selectedSession?: string
  density?: 'compact' | 'standard' | 'comfortable'
  showPreview?: boolean
}>(), {
  density: 'standard',
  showPreview: true
})
const emit = defineEmits<{
  (e: 'select', sessionName: string): void
  (e: 'takeover', sessionName: string): void
}>()

// 格式化等待时间
const formatWaitingTime = (seconds: number) => {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`
  } else if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`
  } else {
    return `${Math.floor(seconds / 3600)}h`
  }
}

// 格式化时间戳
const formatTime = (timestamp: number) => {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) {
    return '刚刚'
  } else if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}m`
  } else if (diff < 86400000) {
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  } else {
    return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  }
}

// 截断消息内容
const truncateMessage = (content: string, maxLength: number = 20) => {
  if (content.length <= maxLength) return content
  return content.slice(0, maxLength) + '...'
}
</script>

<template>
  <div class="session-list-wrapper">
    <div v-if="props.isLoading" class="loading-state">
      <div class="spinner"></div>
    </div>

    <div v-else-if="props.sessions.length === 0" class="empty-state">
      <div class="empty-icon">📭</div>
      <p>暂无会话</p>
    </div>

    <div v-else class="sessions-container">
      <div
        v-for="session in props.sessions"
        :key="session.session_name"
        class="session-card"
        :class="{
          active: props.selectedSession === session.session_name,
          'status-pending': session.status === 'pending_manual'
        }"
        @click="emit('select', session.session_name)"
      >
        <div class="card-left">
          <div class="avatar">
            {{ session.user_profile?.nickname?.charAt(0) || session.session_name.slice(-2) }}
          </div>
          <div v-if="session.status === 'pending_manual'" class="status-badge pending"></div>
        </div>

        <div class="card-main">
          <div class="card-row top">
            <span class="nickname" :title="session.user_profile?.nickname">
              {{ session.user_profile?.nickname || '访客 ' + session.session_name.slice(-4) }}
            </span>
            <span class="time">{{ formatTime(session.updated_at) }}</span>
          </div>
          
          <div class="card-row bottom">
            <span class="msg-preview">
              <span v-if="session.status === 'pending_manual'" class="wait-tag">
                等待 {{ formatWaitingTime(session.escalation?.waiting_seconds || 0) }}
              </span>
              <span v-else>
                {{ session.last_message_preview ? truncateMessage(session.last_message_preview.content) : '[新会话]' }}
              </span>
            </span>
            
            <div class="icons">
              <span v-if="session.user_profile?.vip" class="vip-tag">VIP</span>
            </div>
          </div>
        </div>
        
        <div class="card-actions" v-if="session.status === 'pending_manual'">
           <button class="mini-btn" @click.stop="emit('takeover', session.session_name)">接入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 会话列表容器 ========== */
/* 参考拼多多商家工作台、千牛等专业客服系统 */
.session-list-wrapper {
  height: 100%;
  background: var(--agent-body-bg, #F7F8FA);
  overflow-y: auto;
  padding: 8px 0;
}

/* ========== 加载与空状态 ========== */
.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  color: var(--agent-text-tertiary, #8C8C8C);
  font-size: 13px;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 2px solid var(--agent-border-color-light, #F0F0F0);
  border-top: 2px solid var(--agent-primary-color, #1890FF);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

.empty-icon {
  font-size: 36px;
  margin-bottom: 12px;
  opacity: 0.6;
}

/* ========== 会话卡片 ========== */
/* 采用卡片式设计，清晰的视觉层次 */
.session-card {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
  position: relative;
  background: var(--agent-secondary-bg, #FFFFFF);
  margin: 0 10px 6px 10px;
  border-radius: var(--agent-border-radius, 6px);
  border: 1px solid transparent;
  box-shadow: var(--agent-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
}

.session-card:last-child {
  margin-bottom: 10px;
}

.session-card:hover {
  background-color: var(--agent-hover-bg, #F3F4F6);
  border-color: var(--agent-border-color, #E8E8E8);
  box-shadow: var(--agent-shadow, 0 2px 8px rgba(0, 0, 0, 0.06));
}

/* 选中态 - 左侧强调色条 + 浅蓝背景 */
.session-card.active {
  background-color: var(--agent-active-bg, #EBF5FF);
  border-color: var(--agent-primary-color, #1890FF);
  border-left-width: 3px;
  box-shadow: var(--agent-shadow-hover, 0 4px 16px rgba(24, 144, 255, 0.12));
}

/* 待接入状态特殊高亮 */
.session-card.status-pending {
  border-left: 3px solid var(--agent-warning, #FAAD14);
  background: linear-gradient(90deg, #FFFBE6 0%, var(--agent-secondary-bg, #FFFFFF) 20%);
}

.session-card.status-pending:hover {
  background: linear-gradient(90deg, #FFF7D6 0%, var(--agent-hover-bg, #F3F4F6) 20%);
}

/* ========== 头像区域 ========== */
.card-left {
  position: relative;
  margin-right: 12px;
  flex-shrink: 0;
}

.avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: linear-gradient(135deg, #E6F7FF 0%, #BAE7FF 100%);
  color: var(--agent-primary-color, #1890FF);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  border: 2px solid var(--agent-secondary-bg, #FFFFFF);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  transition: transform var(--transition-fast, 0.15s ease);
}

.session-card:hover .avatar {
  transform: scale(1.03);
}

/* 状态指示点 */
.status-badge {
  position: absolute;
  top: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--agent-secondary-bg, #FFFFFF);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.status-badge.pending {
  background-color: var(--agent-danger, #FF4D4F);
  animation: pulse-dot 1.5s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.15); opacity: 0.85; }
}

/* ========== 主体内容区 ========== */
.card-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  gap: 4px;
}

.card-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-row.top {
  margin-bottom: 2px;
}

/* 昵称样式 */
.nickname {
  font-size: 14px;
  font-weight: 600;
  color: var(--agent-text-color, #262626);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
  line-height: 1.4;
}

/* 时间戳 */
.time {
  font-size: 11px;
  color: var(--agent-text-tertiary, #8C8C8C);
  font-weight: 400;
  flex-shrink: 0;
}

/* 消息预览 */
.msg-preview {
  font-size: 13px;
  color: var(--agent-text-secondary, #595959);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
  line-height: 1.4;
}

/* 等待标签 - 醒目的红色 */
.wait-tag {
  color: var(--agent-danger, #FF4D4F);
  font-weight: 600;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.wait-tag::before {
  content: '⏱';
  font-size: 11px;
}

/* VIP标签 - 金色渐变 */
.vip-tag {
  font-size: 10px;
  background: linear-gradient(135deg, #FFF7E6 0%, #FFE7BA 100%);
  color: #D48806;
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid #FFE58F;
  font-weight: 600;
  letter-spacing: 0.5px;
  box-shadow: 0 1px 2px rgba(212, 136, 6, 0.1);
}

/* ========== 操作按钮 ========== */
.card-actions {
  position: absolute;
  right: 12px;
  bottom: 10px;
  opacity: 0;
  transform: translateX(4px);
  transition: all var(--transition-fast, 0.15s ease);
}

.session-card:hover .card-actions {
  opacity: 1;
  transform: translateX(0);
}

.mini-btn {
  font-size: 12px;
  padding: 5px 14px;
  background: var(--agent-primary-color, #1890FF);
  color: #FFFFFF;
  border-radius: var(--agent-border-radius-sm, 4px);
  border: none;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
  box-shadow: 0 2px 4px rgba(24, 144, 255, 0.25);
}

.mini-btn:hover {
  background: var(--agent-primary-hover, #40A9FF);
  box-shadow: 0 4px 8px rgba(24, 144, 255, 0.35);
  transform: translateY(-1px);
}

.mini-btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(24, 144, 255, 0.25);
}

/* ========== 动画 ========== */
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ========== 紧凑模式 ========== */
.sessions-container.density-compact .session-card {
  padding: 10px 12px;
  margin-bottom: 4px;
}

.sessions-container.density-compact .avatar {
  width: 36px;
  height: 36px;
  font-size: 13px;
}

.sessions-container.density-compact .nickname {
  font-size: 13px;
}

.sessions-container.density-compact .msg-preview {
  font-size: 12px;
}

/* ========== 舒适模式 ========== */
.sessions-container.density-comfortable .session-card {
  padding: 14px 16px;
  margin-bottom: 8px;
}

.sessions-container.density-comfortable .avatar {
  width: 48px;
  height: 48px;
  font-size: 17px;
}

.sessions-container.density-comfortable .card-main {
  gap: 6px;
}
</style>

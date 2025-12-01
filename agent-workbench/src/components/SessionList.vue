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
.session-list-wrapper {
  height: 100%;
  background: #fff;
  overflow-y: auto;
}

.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: #9ca3af;
  font-size: 13px;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #f3f3f3;
  border-top: 2px solid #ccc;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 10px;
}

.empty-icon {
  font-size: 32px;
  margin-bottom: 8px;
  opacity: 0.5;
}

.session-card {
  display: flex;
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid #f3f4f6;
  transition: all 0.2s;
  position: relative;
}

.session-card:hover {
  background-color: #f9fafb;
}

.session-card.active {
  background-color: var(--agent-primary-light);
  border-right: 3px solid var(--agent-primary-color);
}

.card-left {
  position: relative;
  margin-right: 12px;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
  color: #4338ca;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.status-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid #fff;
}

.status-badge.pending {
  background-color: var(--agent-danger);
}

.card-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
}

.card-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.nickname {
  font-size: 14px;
  font-weight: 500;
  color: var(--agent-text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.time {
  font-size: 11px;
  color: #9ca3af;
}

.msg-preview {
  font-size: 12px;
  color: var(--agent-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.wait-tag {
  color: var(--agent-danger);
  font-weight: 500;
}

.vip-tag {
  font-size: 10px;
  background: #fff7ed;
  color: #c2410c;
  padding: 1px 4px;
  border-radius: 2px;
  border: 1px solid #ffedd5;
  font-weight: 600;
}

.card-actions {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: none;
}

.session-card:hover .card-actions {
  display: block;
}

.mini-btn {
  font-size: 11px;
  padding: 2px 8px;
  background: var(--agent-primary-color);
  color: #fff;
  border-radius: 10px;
  border: none;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

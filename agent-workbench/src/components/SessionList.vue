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
  background: #FAFAFA;
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
  padding: 14px 16px;
  cursor: pointer;
  border-bottom: 1px solid #E8EAED;
  transition: all 0.2s ease;
  position: relative;
  background: #FFFFFF;
  margin: 0 12px 8px 12px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.session-card:hover {
  background-color: #F9FAFB;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.session-card.active {
  background-color: #EBF5FF;
  border-left: 3px solid #1890FF;
  box-shadow: 0 2px 6px rgba(24, 144, 255, 0.15);
}

.card-left {
  position: relative;
  margin-right: 12px;
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%);
  color: #1565C0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 0;
  border: 2px solid #FFFFFF;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
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
  font-size: 15px;
  font-weight: 600;
  color: #1F2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
  letter-spacing: -0.2px;
}

.time {
  font-size: 12px;
  color: #9CA3AF;
  font-weight: 500;
}

.msg-preview {
  font-size: 13px;
  color: #6B7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
  line-height: 1.5;
}

.wait-tag {
  color: #EF4444;
  font-weight: 600;
  font-size: 13px;
}

.vip-tag {
  font-size: 11px;
  background: #FFF7ED;
  color: #EA580C;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #FFEDD5;
  font-weight: 600;
  letter-spacing: 0.3px;
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
  font-size: 12px;
  padding: 4px 12px;
  background: #1890FF;
  color: #FFFFFF;
  border-radius: 6px;
  border: none;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(24, 144, 255, 0.2);
}

.mini-btn:hover {
  background: #40A9FF;
  box-shadow: 0 3px 6px rgba(24, 144, 255, 0.3);
  transform: translateY(-1px);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

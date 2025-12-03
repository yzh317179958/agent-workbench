<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { getAccessToken } from '@/utils/authStorage'

/**
 * SLA 状态展示组件
 *
 * 显示工单的首次响应时效(FRT)和解决时效(RT)状态
 * 每30秒自动刷新一次
 *
 * 增量3-2: v3.7.1
 */

const props = defineProps<{
  ticketId: string
}>()

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

interface SLAData {
  frt_target_seconds: number
  frt_elapsed_seconds: number
  frt_remaining_seconds: number
  frt_remaining_minutes: number
  frt_status: 'normal' | 'warning' | 'urgent' | 'violated' | 'completed'
  frt_completed: boolean
  rt_target_seconds: number
  rt_elapsed_seconds: number
  rt_remaining_seconds: number
  rt_remaining_hours: number
  rt_status: 'normal' | 'warning' | 'urgent' | 'violated' | 'completed'
  rt_completed: boolean
  is_paused: boolean
  paused_duration_seconds: number
}

interface SLAResponse {
  success: boolean
  data: {
    ticket_id: string
    priority: string
    ticket_type: string
    status: string
    sla: SLAData
  }
}

const loading = ref(false)
const error = ref<string | null>(null)
const slaData = ref<SLAData | null>(null)
let refreshTimer: ReturnType<typeof setInterval> | null = null

// SLA状态对应的颜色和标签
const statusConfig = {
  normal: { color: '#10b981', bgColor: '#d1fae5', label: '正常' },
  warning: { color: '#f59e0b', bgColor: '#fef3c7', label: '预警' },
  urgent: { color: '#f97316', bgColor: '#ffedd5', label: '紧急' },
  violated: { color: '#ef4444', bgColor: '#fee2e2', label: '超时' },
  completed: { color: '#6b7280', bgColor: '#f3f4f6', label: '已完成' }
}

// 格式化剩余时间
const formatFrtRemaining = computed(() => {
  if (!slaData.value) return '-'
  if (slaData.value.frt_completed) return '已响应'
  const minutes = slaData.value.frt_remaining_minutes
  if (minutes <= 0) return '已超时'
  if (minutes < 60) return `${Math.ceil(minutes)} 分钟`
  return `${Math.floor(minutes / 60)} 小时 ${Math.ceil(minutes % 60)} 分钟`
})

const formatRtRemaining = computed(() => {
  if (!slaData.value) return '-'
  if (slaData.value.rt_completed) return '已解决'
  const hours = slaData.value.rt_remaining_hours
  if (hours <= 0) return '已超时'
  if (hours < 1) return `${Math.ceil(hours * 60)} 分钟`
  if (hours < 24) return `${Math.floor(hours)} 小时`
  return `${Math.floor(hours / 24)} 天 ${Math.floor(hours % 24)} 小时`
})

// 计算进度百分比
const frtProgress = computed(() => {
  if (!slaData.value || slaData.value.frt_target_seconds === 0) return 0
  const ratio = slaData.value.frt_remaining_seconds / slaData.value.frt_target_seconds
  return Math.max(0, Math.min(100, ratio * 100))
})

const rtProgress = computed(() => {
  if (!slaData.value || slaData.value.rt_target_seconds === 0) return 0
  const ratio = slaData.value.rt_remaining_seconds / slaData.value.rt_target_seconds
  return Math.max(0, Math.min(100, ratio * 100))
})

// 获取状态样式
const getFrtStatusStyle = computed(() => {
  if (!slaData.value) return statusConfig.normal
  return statusConfig[slaData.value.frt_status] || statusConfig.normal
})

const getRtStatusStyle = computed(() => {
  if (!slaData.value) return statusConfig.normal
  return statusConfig[slaData.value.rt_status] || statusConfig.normal
})

// 获取进度条颜色
const getProgressColor = (status: string) => {
  return statusConfig[status as keyof typeof statusConfig]?.color || '#10b981'
}

// 加载SLA数据
const loadSLA = async () => {
  if (!props.ticketId) return

  loading.value = true
  error.value = null

  try {
    const token = getAccessToken()
    if (!token) {
      throw new Error('认证信息已失效')
    }

    const response = await fetch(`${API_BASE}/api/tickets/${props.ticketId}/sla`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('工单不存在')
      }
      throw new Error(`请求失败: ${response.status}`)
    }

    const data: SLAResponse = await response.json()
    if (data.success && data.data?.sla) {
      slaData.value = data.data.sla
    }
  } catch (err: any) {
    error.value = err.message || '加载SLA数据失败'
    console.warn('加载SLA数据失败:', err)
  } finally {
    loading.value = false
  }
}

// 启动自动刷新
const startAutoRefresh = () => {
  stopAutoRefresh()
  // 每30秒刷新一次
  refreshTimer = setInterval(loadSLA, 30000)
}

const stopAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

// 监听ticketId变化
watch(() => props.ticketId, (newId) => {
  if (newId) {
    loadSLA()
  }
})

onMounted(() => {
  loadSLA()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<template>
  <div class="sla-status-card" v-loading="loading">
    <div class="sla-header">
      <h4>SLA 时效监控</h4>
      <el-tag v-if="slaData?.is_paused" type="info" size="small">计时暂停</el-tag>
    </div>

    <div v-if="error" class="sla-error">
      <el-alert :title="error" type="warning" :closable="false" />
    </div>

    <div v-else-if="slaData" class="sla-content">
      <!-- 首次响应时效 -->
      <div class="sla-item">
        <div class="sla-label">
          <span>首次响应 (FRT)</span>
          <el-tag
            :style="{
              backgroundColor: getFrtStatusStyle.bgColor,
              color: getFrtStatusStyle.color,
              borderColor: getFrtStatusStyle.color
            }"
            size="small"
          >
            {{ getFrtStatusStyle.label }}
          </el-tag>
        </div>
        <div class="sla-value">
          <span class="remaining">{{ formatFrtRemaining }}</span>
          <span class="target">目标: {{ Math.round(slaData.frt_target_seconds / 60) }} 分钟</span>
        </div>
        <el-progress
          :percentage="frtProgress"
          :color="getProgressColor(slaData.frt_status)"
          :stroke-width="8"
          :show-text="false"
        />
      </div>

      <!-- 解决时效 -->
      <div class="sla-item">
        <div class="sla-label">
          <span>解决时效 (RT)</span>
          <el-tag
            :style="{
              backgroundColor: getRtStatusStyle.bgColor,
              color: getRtStatusStyle.color,
              borderColor: getRtStatusStyle.color
            }"
            size="small"
          >
            {{ getRtStatusStyle.label }}
          </el-tag>
        </div>
        <div class="sla-value">
          <span class="remaining">{{ formatRtRemaining }}</span>
          <span class="target">目标: {{ Math.round(slaData.rt_target_seconds / 3600) }} 小时</span>
        </div>
        <el-progress
          :percentage="rtProgress"
          :color="getProgressColor(slaData.rt_status)"
          :stroke-width="8"
          :show-text="false"
        />
      </div>

      <!-- 暂停信息 -->
      <div v-if="slaData.is_paused" class="sla-paused-info">
        <el-icon><el-icon-timer /></el-icon>
        <span>已暂停计时 {{ Math.round(slaData.paused_duration_seconds / 60) }} 分钟</span>
      </div>
    </div>

    <div v-else class="sla-empty">
      <span>暂无SLA数据</span>
    </div>
  </div>
</template>

<style scoped>
.sla-status-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
}

.sla-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.sla-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.sla-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sla-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sla-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #475569;
}

.sla-value {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.sla-value .remaining {
  font-size: 18px;
  font-weight: 600;
  color: #0f172a;
}

.sla-value .target {
  font-size: 12px;
  color: #94a3b8;
}

.sla-paused-info {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #f1f5f9;
  border-radius: 8px;
  font-size: 13px;
  color: #64748b;
}

.sla-error {
  margin-top: 8px;
}

.sla-empty {
  text-align: center;
  color: #94a3b8;
  padding: 20px 0;
  font-size: 13px;
}
</style>

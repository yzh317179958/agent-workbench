<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getAccessToken } from '@/utils/authStorage'

/**
 * SLA 监控仪表盘
 *
 * 显示所有工单的SLA状态统计、告警列表
 * 每60秒自动刷新
 *
 * 增量3-3: v3.7.1
 */

const router = useRouter()
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

interface SLAAlert {
  ticket_id: string
  title: string
  priority: string
  status: string
  frt_alert: boolean
  frt_remaining_minutes: number
  frt_status: string
  rt_alert: boolean
  rt_remaining_hours: number
  rt_status: string
  assigned_agent_name: string | null
}

interface SLAStats {
  normal: number
  warning: number
  urgent: number
  violated: number
  completed: number
}

interface SLASummary {
  total_tickets: number
  open_tickets: number
  pending_tickets: number
  first_response_count: number
  avg_first_response_seconds: number | null
  resolution_count: number
  avg_resolution_seconds: number | null
}

interface DashboardData {
  total_open_tickets: number
  frt_stats: SLAStats
  rt_stats: SLAStats
  alerts: SLAAlert[]
  alerts_count: number
  summary: SLASummary
}

const loading = ref(false)
const error = ref<string | null>(null)
const data = ref<DashboardData | null>(null)
let refreshTimer: ReturnType<typeof setInterval> | null = null

// 状态配置
const statusConfig = {
  normal: { color: '#10b981', bgColor: '#d1fae5', label: '正常' },
  warning: { color: '#f59e0b', bgColor: '#fef3c7', label: '预警' },
  urgent: { color: '#f97316', bgColor: '#ffedd5', label: '紧急' },
  violated: { color: '#ef4444', bgColor: '#fee2e2', label: '超时' },
  completed: { color: '#6b7280', bgColor: '#f3f4f6', label: '已完成' }
}

const priorityConfig: Record<string, { color: string; label: string }> = {
  low: { color: '#94a3b8', label: '低' },
  medium: { color: '#3b82f6', label: '中' },
  high: { color: '#f59e0b', label: '高' },
  urgent: { color: '#ef4444', label: '紧急' }
}

// 加载仪表盘数据
const loadDashboard = async () => {
  loading.value = true
  error.value = null

  try {
    const token = getAccessToken()
    if (!token) {
      throw new Error('认证信息已失效，请重新登录')
    }

    const response = await fetch(`${API_BASE}/api/tickets/sla-dashboard`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`)
    }

    const result = await response.json()
    if (result.success) {
      data.value = result.data
    }
  } catch (err: any) {
    error.value = err.message || '加载失败'
    ElMessage.error(error.value)
  } finally {
    loading.value = false
  }
}

// 跳转到工单详情
const goToTicket = (ticketId: string) => {
  router.push({ name: 'TicketDetail', params: { ticketId } })
}

// 格式化时间
const formatMinutes = (minutes: number) => {
  if (minutes <= 0) return '已超时'
  if (minutes < 60) return `${Math.ceil(minutes)} 分钟`
  return `${Math.floor(minutes / 60)} 小时 ${Math.ceil(minutes % 60)} 分钟`
}

const formatHours = (hours: number) => {
  if (hours <= 0) return '已超时'
  if (hours < 1) return `${Math.ceil(hours * 60)} 分钟`
  if (hours < 24) return `${hours.toFixed(1)} 小时`
  return `${Math.floor(hours / 24)} 天 ${Math.floor(hours % 24)} 小时`
}

const formatSeconds = (seconds: number | null) => {
  if (seconds === null) return '-'
  if (seconds < 60) return `${Math.round(seconds)} 秒`
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`
  return `${(seconds / 3600).toFixed(1)} 小时`
}

// 计算FRT和RT的状态分布数据（用于图表）
const frtChartData = computed(() => {
  if (!data.value) return []
  const stats = data.value.frt_stats
  return [
    { name: '正常', value: stats.normal, color: statusConfig.normal.color },
    { name: '预警', value: stats.warning, color: statusConfig.warning.color },
    { name: '紧急', value: stats.urgent, color: statusConfig.urgent.color },
    { name: '超时', value: stats.violated, color: statusConfig.violated.color },
    { name: '已完成', value: stats.completed, color: statusConfig.completed.color }
  ].filter(item => item.value > 0)
})

const rtChartData = computed(() => {
  if (!data.value) return []
  const stats = data.value.rt_stats
  return [
    { name: '正常', value: stats.normal, color: statusConfig.normal.color },
    { name: '预警', value: stats.warning, color: statusConfig.warning.color },
    { name: '紧急', value: stats.urgent, color: statusConfig.urgent.color },
    { name: '超时', value: stats.violated, color: statusConfig.violated.color },
    { name: '已完成', value: stats.completed, color: statusConfig.completed.color }
  ].filter(item => item.value > 0)
})

// 获取紧急告警数（urgent + violated）
const criticalCount = computed(() => {
  if (!data.value) return 0
  const frt = data.value.frt_stats.urgent + data.value.frt_stats.violated
  const rt = data.value.rt_stats.urgent + data.value.rt_stats.violated
  return Math.max(frt, rt)
})

// 启动自动刷新
const startAutoRefresh = () => {
  stopAutoRefresh()
  refreshTimer = setInterval(loadDashboard, 60000)
}

const stopAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

onMounted(() => {
  loadDashboard()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<template>
  <div class="sla-dashboard" v-loading="loading">
    <div class="page-header">
      <div>
        <h1>SLA 监控仪表盘</h1>
        <p>实时监控工单服务时效</p>
      </div>
      <el-button @click="loadDashboard" :loading="loading">刷新</el-button>
    </div>

    <div v-if="error" class="error-state">
      <el-alert :title="error" type="error" />
    </div>

    <template v-else-if="data">
      <!-- 概览卡片 -->
      <div class="overview-cards">
        <div class="stat-card">
          <div class="stat-value">{{ data.total_open_tickets }}</div>
          <div class="stat-label">待处理工单</div>
        </div>
        <div class="stat-card warning" v-if="criticalCount > 0">
          <div class="stat-value">{{ criticalCount }}</div>
          <div class="stat-label">需紧急处理</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ formatSeconds(data.summary.avg_first_response_seconds) }}</div>
          <div class="stat-label">平均首次响应</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ formatSeconds(data.summary.avg_resolution_seconds) }}</div>
          <div class="stat-label">平均解决时间</div>
        </div>
      </div>

      <!-- SLA 状态分布 -->
      <div class="charts-section">
        <div class="chart-card">
          <h3>首次响应时效 (FRT)</h3>
          <div class="status-bars">
            <div
              v-for="item in frtChartData"
              :key="item.name"
              class="status-bar-item"
            >
              <div class="bar-label">
                <span
                  class="status-dot"
                  :style="{ backgroundColor: item.color }"
                ></span>
                <span>{{ item.name }}</span>
              </div>
              <div class="bar-value">{{ item.value }}</div>
              <div class="bar-track">
                <div
                  class="bar-fill"
                  :style="{
                    width: `${(item.value / data.total_open_tickets) * 100}%`,
                    backgroundColor: item.color
                  }"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <div class="chart-card">
          <h3>解决时效 (RT)</h3>
          <div class="status-bars">
            <div
              v-for="item in rtChartData"
              :key="item.name"
              class="status-bar-item"
            >
              <div class="bar-label">
                <span
                  class="status-dot"
                  :style="{ backgroundColor: item.color }"
                ></span>
                <span>{{ item.name }}</span>
              </div>
              <div class="bar-value">{{ item.value }}</div>
              <div class="bar-track">
                <div
                  class="bar-fill"
                  :style="{
                    width: `${(item.value / data.total_open_tickets) * 100}%`,
                    backgroundColor: item.color
                  }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 告警列表 -->
      <div class="alerts-section" v-if="data.alerts.length > 0">
        <h3>
          SLA 告警
          <el-tag type="danger" size="small">{{ data.alerts_count }}</el-tag>
        </h3>
        <el-table :data="data.alerts" stripe border>
          <el-table-column label="工单" min-width="200">
            <template #default="{ row }">
              <div class="ticket-cell">
                <a class="ticket-link" @click="goToTicket(row.ticket_id)">
                  {{ row.title }}
                </a>
                <span class="ticket-id">{{ row.ticket_id }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="优先级" width="100" align="center">
            <template #default="{ row }">
              <el-tag
                :style="{
                  color: priorityConfig[row.priority]?.color || '#666',
                  borderColor: priorityConfig[row.priority]?.color || '#666'
                }"
                effect="plain"
                size="small"
              >
                {{ priorityConfig[row.priority]?.label || row.priority }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="首次响应" width="150">
            <template #default="{ row }">
              <div v-if="row.frt_alert" class="alert-cell">
                <el-tag
                  :style="{
                    backgroundColor: statusConfig[row.frt_status as keyof typeof statusConfig]?.bgColor,
                    color: statusConfig[row.frt_status as keyof typeof statusConfig]?.color,
                    borderColor: statusConfig[row.frt_status as keyof typeof statusConfig]?.color
                  }"
                  size="small"
                >
                  {{ formatMinutes(row.frt_remaining_minutes) }}
                </el-tag>
              </div>
              <span v-else class="no-alert">-</span>
            </template>
          </el-table-column>
          <el-table-column label="解决时效" width="150">
            <template #default="{ row }">
              <div v-if="row.rt_alert" class="alert-cell">
                <el-tag
                  :style="{
                    backgroundColor: statusConfig[row.rt_status as keyof typeof statusConfig]?.bgColor,
                    color: statusConfig[row.rt_status as keyof typeof statusConfig]?.color,
                    borderColor: statusConfig[row.rt_status as keyof typeof statusConfig]?.color
                  }"
                  size="small"
                >
                  {{ formatHours(row.rt_remaining_hours) }}
                </el-tag>
              </div>
              <span v-else class="no-alert">-</span>
            </template>
          </el-table-column>
          <el-table-column label="负责人" width="120">
            <template #default="{ row }">
              {{ row.assigned_agent_name || '未分配' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" align="center">
            <template #default="{ row }">
              <el-button type="primary" link @click="goToTicket(row.ticket_id)">
                处理
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-else class="no-alerts">
        <el-empty description="暂无SLA告警，工单时效状态良好" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.sla-dashboard {
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #0f172a;
}

.page-header p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 14px;
}

.overview-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
}

.stat-card.warning {
  background: linear-gradient(135deg, #fef3c7 0%, #fee2e2 100%);
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
}

.stat-label {
  margin-top: 4px;
  font-size: 13px;
  color: #64748b;
}

.charts-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.chart-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
}

.chart-card h3 {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

.status-bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-bar-item {
  display: grid;
  grid-template-columns: 80px 40px 1fr;
  align-items: center;
  gap: 12px;
}

.bar-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #475569;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.bar-value {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  text-align: right;
}

.bar-track {
  height: 8px;
  background: #f1f5f9;
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.alerts-section {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
}

.alerts-section h3 {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ticket-cell {
  display: flex;
  flex-direction: column;
}

.ticket-link {
  color: #3b82f6;
  cursor: pointer;
  font-weight: 500;
}

.ticket-link:hover {
  text-decoration: underline;
}

.ticket-id {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
}

.alert-cell {
  display: flex;
  align-items: center;
}

.no-alert {
  color: #94a3b8;
}

.no-alerts {
  background: #fff;
  border-radius: 12px;
  padding: 40px 20px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
}

.error-state {
  margin-top: 20px;
}
</style>

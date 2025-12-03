<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type ElTable } from 'element-plus'
import { useTicketStore } from '@/stores/ticketStore'
import { useAgentStore } from '@/stores/agentStore'
import CreateTicketDialog from '@/components/tickets/CreateTicketDialog.vue'
import type {
  TicketPriority,
  TicketStatus,
  TicketType,
  TicketFilterPayload,
  TicketSortField,
  TicketExportFormat,
  Ticket
} from '@/types'

const router = useRouter()
const ticketStore = useTicketStore()
const agentStore = useAgentStore()

const statusFilter = ref<TicketStatus | 'all'>('all')
const priorityFilter = ref<TicketPriority | 'all'>('all')
const assignedFilter = ref<'all' | 'mine' | 'unassigned'>('all')
const activeTab = ref<'active' | 'archived'>('active')
const searchKeyword = ref('')
const showCreateDialog = ref(false)
const pageSize = ref(20)
const currentPage = ref(1)
const localSearchFallback = ref(false)

const statusDict: Record<TicketStatus, { label: string; type: string }> = {
  pending: { label: '待处理', type: 'warning' },
  in_progress: { label: '处理中', type: 'primary' },
  waiting_customer: { label: '等客户', type: 'info' },
  waiting_vendor: { label: '等第三方', type: 'info' },
  resolved: { label: '已解决', type: 'success' },
  closed: { label: '已关闭', type: 'default' },
  archived: { label: '已归档', type: 'info' }
}

const priorityDict: Record<TicketPriority, { label: string; type: string }> = {
  low: { label: '低', type: 'info' },
  medium: { label: '中', type: 'primary' },
  high: { label: '高', type: 'warning' },
  urgent: { label: '紧急', type: 'danger' }
}

const getStatusMeta = (status: string | TicketStatus) => {
  return statusDict[status as TicketStatus] || { label: status || '-', type: 'info' }
}

const getPriorityMeta = (priority: string | TicketPriority) => {
  return priorityDict[priority as TicketPriority] || { label: priority || '-', type: 'info' }
}

const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '待处理', value: 'pending' },
  { label: '处理中', value: 'in_progress' },
  { label: '等待客户', value: 'waiting_customer' },
  { label: '等待第三方', value: 'waiting_vendor' },
  { label: '已解决', value: 'resolved' },
  { label: '已关闭', value: 'closed' }
]

const priorityOptions = [
  { label: '全部优先级', value: 'all' },
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
  { label: '紧急', value: 'urgent' }
]

const assignmentOptions = [
  { label: '所有工单', value: 'all' },
  { label: '我的工单', value: 'mine' },
  { label: '未分配', value: 'unassigned' }
]
const statusFilterOptions = statusOptions.filter(option => option.value !== 'all')
const priorityFilterOptions = priorityOptions.filter(option => option.value !== 'all')

type AdvancedAssignmentMode = 'all' | 'mine' | 'unassigned' | 'custom'
type AdvancedTimeRange = 'all' | 'today' | 'last3days' | 'last7days' | 'thisMonth' | 'custom'

const showAdvancedFilters = ref(false)
const appliedAdvancedFilters = ref<TicketFilterPayload | null>(null)
const advancedFilters = ref({
  statuses: [] as TicketStatus[],
  priorities: [] as TicketPriority[],
  ticketTypes: [] as TicketType[],
  assignedMode: 'all' as AdvancedAssignmentMode,
  tags: [] as string[],
  categories: [] as string[],
  assignedAgentIds: [] as string[]
})
const customAssignedAgent = ref('')
const advancedTimeRange = ref<AdvancedTimeRange>('all')
const customDateRange = ref<[Date | null, Date | null]>([null, null])
const sortByField = ref<TicketSortField>('updated_at')
const sortDesc = ref(true)
const isAdvancedFiltering = computed(() => !!appliedAdvancedFilters.value)

const ticketTypeOptions = [
  { label: '售前咨询', value: 'pre_sale' },
  { label: '售后问题', value: 'after_sale' },
  { label: '投诉建议', value: 'complaint' }
]

const advancedSortOptions: Array<{ label: string; value: TicketSortField }> = [
  { label: '更新时间', value: 'updated_at' },
  { label: '创建时间', value: 'created_at' },
  { label: '优先级', value: 'priority' },
  { label: '状态', value: 'status' },
  { label: '首次响应', value: 'first_response_at' },
  { label: '解决时间', value: 'resolved_at' },
  { label: '重开时间', value: 'reopened_at' }
]

const timeRangeRadioOptions = [
  { label: '全部时间', value: 'all' },
  { label: '今天', value: 'today' },
  { label: '近3天', value: 'last3days' },
  { label: '近7天', value: 'last7days' },
  { label: '本月', value: 'thisMonth' },
  { label: '自定义', value: 'custom' }
]

const showExportDialog = ref(false)
const exportScope = ref<'current_page' | 'filtered' | 'all'>('current_page')
const exportFormat = ref<TicketExportFormat>('csv')
const exporting = ref(false)
const ticketTableRef = ref<InstanceType<typeof ElTable> | null>(null)
const selectedTicketIds = ref<string[]>([])
const batchAssignDialogVisible = ref(false)
const batchAssignLoading = ref(false)
const batchAssignForm = ref({
  target_agent_id: '',
  target_agent_name: '',
  note: ''
})
const batchCloseDialogVisible = ref(false)
const batchCloseLoading = ref(false)
const batchCloseForm = ref({
  close_reason: '',
  comment: ''
})
const batchPriorityDialogVisible = ref(false)
const batchPriorityLoading = ref(false)
const batchPriorityForm = ref({
  priority: 'medium' as TicketPriority,
  reason: ''
})

const displayedTickets = computed(() => {
  if (appliedAdvancedFilters.value) {
    return ticketStore.tickets
  }

  let list = ticketStore.tickets

  if (assignedFilter.value === 'unassigned') {
    list = list.filter(ticket => !ticket.assigned_agent_id)
  } else if (assignedFilter.value === 'mine' && agentStore.agentId) {
    list = list.filter(ticket => ticket.assigned_agent_id === agentStore.agentId)
  }

  if (priorityFilter.value !== 'all') {
    list = list.filter(ticket => ticket.priority === priorityFilter.value)
  }

  if (statusFilter.value !== 'all') {
    list = list.filter(ticket => ticket.status === statusFilter.value)
  }

  return list
})

const filteredTicketsWithFallback = computed(() => {
  if (!localSearchFallback.value || !searchKeyword.value.trim()) {
    return displayedTickets.value
  }
  const keyword = searchKeyword.value.trim().toLowerCase()
  return displayedTickets.value.filter(ticket => {
    return (
      ticket.ticket_id.toLowerCase().includes(keyword) ||
      ticket.title.toLowerCase().includes(keyword) ||
      ticket.description.toLowerCase().includes(keyword) ||
      (ticket.customer?.email?.toLowerCase().includes(keyword) ?? false) ||
      (ticket.customer?.name?.toLowerCase().includes(keyword) ?? false)
    )
  })
})

const totalCount = computed(() => {
  if (searchKeyword.value.trim()) {
    return filteredTicketsWithFallback.value.length
  }
  return ticketStore.total
})

const hasMentionForTicket = (ticket: Ticket) => {
  if (!ticket || !agentStore.agentId) return false
  if (!ticket.comments || !ticket.comments.length) return false
  return ticket.comments.some(comment => {
    if (!comment.mentions || !comment.mentions.length) return false
    return comment.mentions.includes(agentStore.agentId as string)
  })
}

const ticketRowClass = ({ row }: { row: Ticket }) => {
  return hasMentionForTicket(row) ? 'row-has-mention' : ''
}

const hasTickets = computed(() => filteredTicketsWithFallback.value.length > 0)
const hasSelectedTickets = computed(() => selectedTicketIds.value.length > 0)
const selectedTickets = computed((): Ticket[] => {
  return ticketStore.tickets.filter(ticket => selectedTicketIds.value.includes(ticket.ticket_id))
})
const hasNonResolvedSelected = computed(() =>
  selectedTickets.value.some(ticket => ticket.status !== 'resolved')
)
const dominantPriority = computed<TicketPriority | null>(() => {
  if (!hasSelectedTickets.value) {
    return null
  }
  const first = selectedTickets.value[0]?.priority
  if (selectedTickets.value.every(ticket => ticket.priority === first)) {
    return first ?? null
  }
  return null
})
const canExportAll = computed(() => agentStore.agentRole === 'admin')
const currentPageCount = computed(() => filteredTicketsWithFallback.value.length)
const filteredTotalCount = computed(() => ticketStore.total || filteredTicketsWithFallback.value.length)

const formatDuration = (seconds?: number | null) => {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) {
    return '--'
  }
  const sec = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(sec / 60)
  if (minutes < 1) return '<1分钟'
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const remain = minutes % 60
    return remain ? `${hours}小时${remain}分钟` : `${hours}小时`
  }
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return remainHours ? `${days}天${remainHours}小时` : `${days}天`
}

const loadSlaMetrics = async () => {
  try {
    await Promise.all([ticketStore.fetchSlaSummary(), ticketStore.fetchSlaAlerts()])
  } catch (error: any) {
    ElMessage.error(error.message || '加载 SLA 数据失败')
  }
}

const resetAdvancedFilters = () => {
  advancedFilters.value = {
    statuses: [],
    priorities: [],
    ticketTypes: [],
    assignedMode: 'all',
    tags: [],
    categories: [],
    assignedAgentIds: []
  }
  customAssignedAgent.value = ''
  advancedTimeRange.value = 'all'
  customDateRange.value = [null, null]
  sortByField.value = 'updated_at'
  sortDesc.value = true
}

const computeTimeRangeFilters = () => {
  const result: { start?: number; end?: number } = {}
  const now = new Date()
  const nowTs = Math.floor(now.getTime() / 1000)

  switch (advancedTimeRange.value) {
    case 'today': {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      result.start = Math.floor(start.getTime() / 1000)
      break
    }
    case 'last3days':
      result.start = nowTs - 3 * 24 * 3600
      break
    case 'last7days':
      result.start = nowTs - 7 * 24 * 3600
      break
    case 'thisMonth': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      result.start = Math.floor(firstDay.getTime() / 1000)
      break
    }
    case 'custom': {
      const [start, end] = customDateRange.value
      if (start) {
        result.start = Math.floor(start.getTime() / 1000)
      }
      if (end) {
        const endDate = new Date(end)
        endDate.setHours(23, 59, 59, 999)
        result.end = Math.floor(endDate.getTime() / 1000)
      }
      break
    }
    default:
      break
  }

  return result
}

const buildSimpleFilterPayload = (): TicketFilterPayload => {
  const payload: TicketFilterPayload = {}
  if (statusFilter.value !== 'all') {
    payload.statuses = [statusFilter.value]
  }
  if (priorityFilter.value !== 'all') {
    payload.priorities = [priorityFilter.value]
  }
  if (assignedFilter.value !== 'all') {
    payload.assigned = assignedFilter.value
  }
  const keyword = searchKeyword.value.trim()
  if (keyword) {
    payload.keyword = keyword
  }
  return payload
}

const buildAdvancedFilterPayload = (): TicketFilterPayload => {
  const payload: TicketFilterPayload = {
    sort_by: sortByField.value,
    sort_desc: sortDesc.value
  }

  if (advancedFilters.value.statuses.length) {
    payload.statuses = [...advancedFilters.value.statuses]
  }
  if (advancedFilters.value.priorities.length) {
    payload.priorities = [...advancedFilters.value.priorities]
  }
  if (advancedFilters.value.ticketTypes.length) {
    payload.ticket_types = [...advancedFilters.value.ticketTypes]
  }
  if (advancedFilters.value.tags.length) {
    payload.tags = advancedFilters.value.tags.map(tag => tag.trim()).filter(Boolean)
  }
  if (advancedFilters.value.categories.length) {
    payload.categories = advancedFilters.value.categories.map(cat => cat.trim()).filter(Boolean)
  }
  if (advancedFilters.value.assignedAgentIds.length) {
    payload.assigned_agent_ids = advancedFilters.value.assignedAgentIds.map(id => id.trim()).filter(Boolean)
  }

  const assignedMode = advancedFilters.value.assignedMode
  if (assignedMode === 'mine') {
    payload.assigned = 'mine'
  } else if (assignedMode === 'unassigned') {
    payload.assigned = 'unassigned'
  } else if (assignedMode === 'custom' && customAssignedAgent.value.trim()) {
    payload.assigned = customAssignedAgent.value.trim()
  }

  const { start, end } = computeTimeRangeFilters()
  if (start) payload.created_start = start
  if (end) payload.created_end = end

  const keyword = searchKeyword.value.trim()
  if (keyword) {
    payload.keyword = keyword
  }

  return payload
}

const buildExportFilters = (scope: 'current_page' | 'filtered' | 'all'): TicketFilterPayload | undefined => {
  if (scope === 'all') {
    return undefined
  }
  const payload = appliedAdvancedFilters.value
    ? { ...appliedAdvancedFilters.value }
    : buildSimpleFilterPayload()

  if (scope === 'current_page') {
    payload.limit = pageSize.value
    payload.offset = (currentPage.value - 1) * pageSize.value
  } else {
    if (payload.limit) delete payload.limit
    if (payload.offset) delete payload.offset
  }
  return payload
}

const applyAdvancedFilters = async () => {
  appliedAdvancedFilters.value = buildAdvancedFilterPayload()
  showAdvancedFilters.value = false
  localSearchFallback.value = false
  currentPage.value = 1
  await loadTickets()
}

const clearAdvancedFilters = async () => {
  appliedAdvancedFilters.value = null
  resetAdvancedFilters()
  currentPage.value = 1
  await loadTickets()
}

const loadTickets = async () => {
  try {
    const common = {
      limit: pageSize.value,
      offset: (currentPage.value - 1) * pageSize.value
    }

    if (activeTab.value === 'archived') {
      await ticketStore.fetchArchivedTickets(common)
    } else if (appliedAdvancedFilters.value) {
      const keyword = searchKeyword.value.trim()
      const payload: TicketFilterPayload = {
        ...appliedAdvancedFilters.value,
        ...common
      }
      if (keyword) {
        payload.keyword = keyword
      } else if (payload.keyword) {
        delete payload.keyword
      }
      await ticketStore.filterTickets(payload)
    } else {
      await ticketStore.fetchTickets({
        status: statusFilter.value === 'all' ? undefined : statusFilter.value,
        priority: priorityFilter.value === 'all' ? undefined : priorityFilter.value,
        assigned_agent_id:
          assignedFilter.value === 'mine' && agentStore.agentId ? agentStore.agentId : undefined,
        ...common
      })
    }

    localSearchFallback.value = false
  } catch (error: any) {
    ElMessage.error(error.message || '加载工单失败')
  }
}

const handleSearch = async () => {
  const keyword = searchKeyword.value.trim()
  if (appliedAdvancedFilters.value) {
    const nextFilters: TicketFilterPayload = { ...appliedAdvancedFilters.value }
    if (keyword) {
      nextFilters.keyword = keyword
    } else if (nextFilters.keyword) {
      delete nextFilters.keyword
    }
    appliedAdvancedFilters.value = nextFilters
    currentPage.value = 1
    await loadTickets()
    return
  }

  if (!keyword) {
    await loadTickets()
    return
  }

  try {
    await ticketStore.searchTickets(keyword)
    localSearchFallback.value = false
  } catch (error: any) {
    if (/404|Not Found|501/.test(error.message || '')) {
      localSearchFallback.value = true
      if (!ticketStore.tickets.length) {
        await loadTickets()
      }
    } else {
      ElMessage.error(error.message || '搜索失败')
    }
  }
}

const handleCreateSuccess = async () => {
  showCreateDialog.value = false
  await loadTickets()
}

const handleRefresh = async () => {
  searchKeyword.value = ''
  currentPage.value = 1
  await loadTickets()
  await loadSlaMetrics()
}

const handleSelectionChange = (rows: Ticket[]) => {
  selectedTicketIds.value = rows.map(row => row.ticket_id)
}

const resetBatchAssignForm = () => {
  batchAssignForm.value = {
    target_agent_id: agentStore.agentId || '',
    target_agent_name: agentStore.agentName || '',
    note: ''
  }
}

const openBatchAssignDialog = () => {
  if (!hasSelectedTickets.value) {
    ElMessage.warning('请先勾选需要分配的工单')
    return
  }
  resetBatchAssignForm()
  batchAssignDialogVisible.value = true
}

const assignBatchToMe = () => {
  if (!agentStore.agentId) return
  batchAssignForm.value.target_agent_id = agentStore.agentId
  batchAssignForm.value.target_agent_name = agentStore.agentName
}

const submitBatchAssign = async () => {
  if (batchAssignLoading.value) return
  const agentId = batchAssignForm.value.target_agent_id.trim()
  if (!agentId) {
    ElMessage.warning('请填写坐席ID')
    return
  }
  batchAssignLoading.value = true
  try {
    const result = await ticketStore.batchAssignTickets({
      ticket_ids: selectedTicketIds.value,
      target_agent_id: agentId,
      target_agent_name: batchAssignForm.value.target_agent_name.trim() || undefined,
      note: batchAssignForm.value.note.trim() || undefined
    })
    ElMessage.success(`成功分配 ${result.succeeded} 个工单`)
    batchAssignDialogVisible.value = false
    selectedTicketIds.value = []
    ticketTableRef.value?.clearSelection()
    await loadTickets()
  } catch (error: any) {
    ElMessage.error(error.message || '批量分配失败')
  } finally {
    batchAssignLoading.value = false
  }
}

const resetBatchCloseForm = () => {
  batchCloseForm.value = {
    close_reason: '',
    comment: ''
  }
}

const openBatchCloseDialog = () => {
  if (!hasSelectedTickets.value) {
    ElMessage.warning('请先勾选需要关闭的工单')
    return
  }
  if (hasNonResolvedSelected.value) {
    ElMessage.warning('仅已解决的工单可以批量关闭')
    return
  }
  resetBatchCloseForm()
  batchCloseDialogVisible.value = true
}

const submitBatchClose = async () => {
  if (batchCloseLoading.value) return
  batchCloseLoading.value = true
  try {
    const result = await ticketStore.batchCloseTickets({
      ticket_ids: selectedTicketIds.value,
      close_reason: batchCloseForm.value.close_reason.trim() || undefined,
      comment: batchCloseForm.value.comment.trim() || undefined
    })
    ElMessage.success(`成功关闭 ${result.succeeded} 个工单`)
    batchCloseDialogVisible.value = false
    selectedTicketIds.value = []
    ticketTableRef.value?.clearSelection()
    await loadTickets()
  } catch (error: any) {
    ElMessage.error(error.message || '批量关闭失败')
  } finally {
    batchCloseLoading.value = false
  }
}

const resetBatchPriorityForm = () => {
  batchPriorityForm.value = {
    priority: dominantPriority.value || 'medium',
    reason: ''
  }
}

const openBatchPriorityDialog = () => {
  if (!hasSelectedTickets.value) {
    ElMessage.warning('请先勾选需要调整的工单')
    return
  }
  resetBatchPriorityForm()
  batchPriorityDialogVisible.value = true
}

const submitBatchPriority = async () => {
  if (batchPriorityLoading.value) return
  batchPriorityLoading.value = true
  try {
    const result = await ticketStore.batchUpdatePriority({
      ticket_ids: selectedTicketIds.value,
      priority: batchPriorityForm.value.priority,
      reason: batchPriorityForm.value.reason.trim() || undefined
    })
    ElMessage.success(`已调整 ${result.succeeded} 个工单优先级`)
    batchPriorityDialogVisible.value = false
    selectedTicketIds.value = []
    ticketTableRef.value?.clearSelection()
    await loadTickets()
  } catch (error: any) {
    ElMessage.error(error.message || '批量调整失败')
  } finally {
    batchPriorityLoading.value = false
  }
}

const openExportDialog = () => {
  showExportDialog.value = true
  if (!canExportAll.value && exportScope.value === 'all') {
    exportScope.value = 'filtered'
  }
}

const handleExport = async () => {
  exporting.value = true
  try {
    const filters = buildExportFilters(exportScope.value)
    const { blob, filename } = await ticketStore.exportTickets({
      format: exportFormat.value,
      filters
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    showExportDialog.value = false
    ElMessage.success('导出文件已开始下载')
  } catch (error: any) {
    ElMessage.error(error.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

const handleTabChange = async (tab: 'active' | 'archived') => {
  activeTab.value = tab
  statusFilter.value = tab === 'archived' ? 'archived' : 'all'
  searchKeyword.value = ''
  if (tab === 'archived') {
    appliedAdvancedFilters.value = null
    showAdvancedFilters.value = false
    resetAdvancedFilters()
  }
  currentPage.value = 1
  await loadTickets()
}

const handlePageChange = async (page: number) => {
  currentPage.value = page
  await loadTickets()
}

const handlePageSizeChange = async (size: number) => {
  pageSize.value = size
  currentPage.value = 1
  await loadTickets()
}

const goToDetail = (ticketId: string) => {
  router.push({ name: 'TicketDetail', params: { ticketId } })
}

watch(
  () => [statusFilter.value, priorityFilter.value, assignedFilter.value],
  async () => {
    if (searchKeyword.value.trim()) return
    if (appliedAdvancedFilters.value) return
    currentPage.value = 1
    await loadTickets()
  }
)

onMounted(async () => {
  await loadTickets()
  await loadSlaMetrics()
})
</script>

<template>
  <div class="ticket-page">
    <header class="page-header">
      <div class="header-left">
        <el-button link @click="router.push('/dashboard')">
          ← 返回工作台
        </el-button>
        <div>
          <h1>工单管理</h1>
          <p class="subtitle">查看、筛选并处理 L1-2 工单流转</p>
        </div>
      </div>
      <div class="header-actions">
        <el-button @click="router.push('/templates')">
          模板管理
        </el-button>
        <el-button @click="openExportDialog" :disabled="!hasTickets && !ticketStore.listLoading">
          导出
        </el-button>
        <el-button @click="handleRefresh">刷新</el-button>
        <el-button type="primary" @click="showCreateDialog = true">
          + 创建工单
        </el-button>
      </div>
    </header>

    <div class="tab-switcher">
      <el-radio-group v-model="activeTab" @change="handleTabChange">
        <el-radio-button label="active">进行中</el-radio-button>
        <el-radio-button label="archived">已归档</el-radio-button>
      </el-radio-group>
    </div>

    <section class="sla-section">
      <div class="sla-card" v-loading="ticketStore.slaSummaryLoading">
        <div class="sla-card-header">
          <div>
            <h3>SLA 概览</h3>
            <p>实时监测响应与解决表现</p>
          </div>
          <el-button link type="primary" @click="loadSlaMetrics">刷新</el-button>
        </div>
        <div class="sla-metrics">
          <div class="metric">
            <span class="metric-label">总工单</span>
            <span class="metric-value">{{ ticketStore.slaSummary?.total_tickets ?? '--' }}</span>
          </div>
          <div class="metric">
            <span class="metric-label">进行中</span>
            <span class="metric-value">{{ ticketStore.slaSummary?.open_tickets ?? '--' }}</span>
          </div>
          <div class="metric">
            <span class="metric-label">待处理</span>
            <span class="metric-value">{{ ticketStore.slaSummary?.pending_tickets ?? '--' }}</span>
          </div>
          <div class="metric">
            <span class="metric-label">平均首响</span>
            <span class="metric-value">{{ formatDuration(ticketStore.slaSummary?.avg_first_response_seconds) }}</span>
            <small v-if="ticketStore.slaSummary?.first_response_count">({{ ticketStore.slaSummary?.first_response_count }} 单)</small>
          </div>
          <div class="metric">
            <span class="metric-label">平均解决</span>
            <span class="metric-value">{{ formatDuration(ticketStore.slaSummary?.avg_resolution_seconds) }}</span>
            <small v-if="ticketStore.slaSummary?.resolution_count">({{ ticketStore.slaSummary?.resolution_count }} 单)</small>
          </div>
        </div>
      </div>

      <div class="sla-card alerts" v-loading="ticketStore.slaAlertsLoading">
        <div class="sla-card-header">
          <div>
            <h3>超时预警</h3>
            <p>首响/解决 SLA 超时工单</p>
          </div>
        </div>
        <div v-if="ticketStore.slaAlerts?.first_response_alerts.length || ticketStore.slaAlerts?.resolution_alerts.length" class="alert-list">
          <div class="alert-group" v-if="ticketStore.slaAlerts?.first_response_alerts.length">
            <h4>等待首响</h4>
            <ul>
              <li v-for="item in ticketStore.slaAlerts.first_response_alerts" :key="`first-${item.ticket_id}`">
                <span class="alert-ticket">{{ item.ticket_id }}</span>
                <span class="alert-priority" :class="`priority-${item.priority}`">{{ getPriorityMeta(item.priority).label }}</span>
                <span class="alert-time">已等待 {{ formatDuration(item.elapsed_seconds) }}</span>
              </li>
            </ul>
          </div>
          <div class="alert-group" v-if="ticketStore.slaAlerts?.resolution_alerts.length">
            <h4>解决超时</h4>
            <ul>
              <li v-for="item in ticketStore.slaAlerts.resolution_alerts" :key="`resolve-${item.ticket_id}`">
                <span class="alert-ticket">{{ item.ticket_id }}</span>
                <span class="alert-priority" :class="`priority-${item.priority}`">{{ getPriorityMeta(item.priority).label }}</span>
                <span class="alert-time">已处理 {{ formatDuration(item.elapsed_seconds) }}</span>
              </li>
            </ul>
          </div>
        </div>
        <div v-else class="sla-empty">暂无 SLA 超时预警</div>
      </div>
    </section>

    <section class="filters">
      <el-select
        v-model="statusFilter"
        :disabled="activeTab === 'archived'"
        style="width: 180px"
      >
        <el-option
          v-for="item in statusOptions"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>

      <el-select v-model="priorityFilter" style="width: 150px">
        <el-option
          v-for="item in priorityOptions"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>

      <el-select v-model="assignedFilter" style="width: 150px">
        <el-option
          v-for="item in assignmentOptions"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>

      <el-input
        v-model="searchKeyword"
        placeholder="搜索工单ID/客户/标题/订单号"
        clearable
        @keyup.enter="handleSearch"
      >
        <template #append>
          <el-button @click="handleSearch">搜索</el-button>
        </template>
      </el-input>

      <el-button
        type="primary"
        plain
        @click="openBatchAssignDialog"
        :disabled="!hasSelectedTickets"
      >
        批量分配
      </el-button>
      <el-button
        type="danger"
        plain
        @click="openBatchCloseDialog"
        :disabled="!hasSelectedTickets"
      >
        批量关闭
      </el-button>
      <el-button
        type="warning"
        plain
        @click="openBatchPriorityDialog"
        :disabled="!hasSelectedTickets"
      >
        批量调优先级
      </el-button>

      <el-button
        type="info"
        plain
        @click="showAdvancedFilters = true"
        :disabled="activeTab === 'archived'"
      >
        高级筛选
      </el-button>

      <el-tag
        v-if="isAdvancedFiltering"
        type="success"
        closable
        class="advanced-filter-tag"
        @close="clearAdvancedFilters"
      >
        已应用高级筛选
      </el-tag>
    </section>

    <section class="ticket-table">
      <el-table
        ref="ticketTableRef"
        :data="filteredTicketsWithFallback"
        border
        stripe
        v-loading="ticketStore.listLoading"
        :empty-text="ticketStore.listLoading ? '加载中...' : '暂无数据'"
        @selection-change="handleSelectionChange"
        row-key="ticket_id"
        :row-class-name="ticketRowClass"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column prop="ticket_id" label="工单号" width="210" />
        <el-table-column label="主题 / 描述" min-width="260">
          <template #default="{ row }">
            <div class="ticket-title">
              <span>{{ row.title }}</span>
              <el-tag
                v-if="hasMentionForTicket(row)"
                size="small"
                type="danger"
                effect="dark"
                class="mention-flag"
              >
                @提醒
              </el-tag>
            </div>
            <div class="ticket-description">{{ row.description }}</div>
          </template>
        </el-table-column>
        <el-table-column label="客户" min-width="160">
          <template #default="{ row }">
            <div>{{ row.customer?.name || '未知客户' }}</div>
            <small>{{ row.customer?.email || '-' }}</small>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusMeta(row.status).type">
              {{ getStatusMeta(row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="优先级" width="120">
          <template #default="{ row }">
            <el-tag :type="getPriorityMeta(row.priority).type">
              {{ getPriorityMeta(row.priority).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="处理人" width="160">
          <template #default="{ row }">
            <div>
              {{ row.assigned_agent_name || '未分配' }}
            </div>
            <small>{{ row.assigned_agent_id || '-' }}</small>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="180">
          <template #default="{ row }">
            {{ new Date(row.updated_at * 1000).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="goToDetail(row.ticket_id)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!ticketStore.listLoading && !hasTickets" class="empty-state">
        没有符合条件的工单
      </div>

      <div class="pagination-wrapper" v-if="activeTab === 'active'">
        <el-pagination
          layout="total, sizes, prev, pager, next"
          :total="totalCount"
          :page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          :current-page="currentPage"
          @current-change="handlePageChange"
          @size-change="handlePageSizeChange"
        />
      </div>
    </section>

    <el-dialog
      v-model="batchAssignDialogVisible"
      title="批量分配工单"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form label-width="110px">
        <el-form-item label="目标坐席ID">
          <el-input v-model="batchAssignForm.target_agent_id" placeholder="请输入坐席ID" />
        </el-form-item>
        <el-form-item label="坐席姓名">
          <el-input v-model="batchAssignForm.target_agent_name" placeholder="可选" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="batchAssignForm.note"
            type="textarea"
            placeholder="可选"
            :rows="2"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchAssignDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchAssignLoading" @click="submitBatchAssign">
          确认分配
        </el-button>
        <el-button text @click="assignBatchToMe" :disabled="!agentStore.agentId">
          指派给我
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="batchPriorityDialogVisible"
      title="批量调整优先级"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form label-width="100px">
        <el-form-item label="目标优先级">
          <el-select v-model="batchPriorityForm.priority" placeholder="选择优先级">
            <el-option label="低" value="low" />
            <el-option label="中" value="medium" />
            <el-option label="高" value="high" />
            <el-option label="紧急" value="urgent" />
          </el-select>
        </el-form-item>
        <el-form-item label="调整原因">
          <el-input
            v-model="batchPriorityForm.reason"
            placeholder="可选"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchPriorityDialogVisible = false">取消</el-button>
        <el-button type="warning" :loading="batchPriorityLoading" @click="submitBatchPriority">
          确认调整
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="batchCloseDialogVisible"
      title="批量关闭工单"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form label-width="100px">
        <el-form-item label="关闭原因">
          <el-input v-model="batchCloseForm.close_reason" placeholder="可选" maxlength="200" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="batchCloseForm.comment"
            type="textarea"
            placeholder="可选"
            :rows="3"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchCloseDialogVisible = false">取消</el-button>
        <el-button type="danger" :loading="batchCloseLoading" @click="submitBatchClose">
          确认关闭
        </el-button>
      </template>
    </el-dialog>

    <create-ticket-dialog
      v-model="showCreateDialog"
      @created="handleCreateSuccess"
    />

    <el-dialog
      v-model="showExportDialog"
      title="导出工单"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-alert
        v-if="localSearchFallback"
        type="warning"
        :closable="false"
        show-icon
        class="mb-12"
        description="当前处于本地搜索回退模式，导出将尝试调用服务端筛选，可能与屏幕数据不同。"
      />
      <div class="advanced-section">
        <label>导出范围</label>
        <el-radio-group v-model="exportScope">
          <el-radio label="current_page">
            当前页 ({{ currentPageCount }} 条)
          </el-radio>
          <el-radio label="filtered">
            筛选结果 (约 {{ filteredTotalCount }} 条)
          </el-radio>
          <el-radio label="all" :disabled="!canExportAll">
            全部工单 (管理员)
          </el-radio>
        </el-radio-group>
        <small v-if="!canExportAll">仅管理员可导出全部工单</small>
      </div>
      <div class="advanced-section">
        <label>文件格式</label>
        <el-radio-group v-model="exportFormat">
          <el-radio label="csv">CSV (.csv)</el-radio>
          <el-radio label="xlsx">Excel (.xlsx)</el-radio>
          <el-radio label="pdf">PDF 报告 (.pdf)</el-radio>
        </el-radio-group>
      </div>
      <template #footer>
        <el-button @click="showExportDialog = false">取消</el-button>
        <el-button type="primary" :loading="exporting" @click="handleExport">
          开始导出
        </el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-model="showAdvancedFilters"
      title="高级筛选"
      size="480px"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <div class="advanced-section">
        <label>工单状态</label>
        <el-checkbox-group v-model="advancedFilters.statuses">
          <el-checkbox
            v-for="item in statusFilterOptions"
            :key="item.value"
            :label="item.value"
          >
            {{ item.label }}
          </el-checkbox>
        </el-checkbox-group>
      </div>

      <div class="advanced-section">
        <label>优先级</label>
        <el-checkbox-group v-model="advancedFilters.priorities">
          <el-checkbox
            v-for="item in priorityFilterOptions"
            :key="item.value"
            :label="item.value"
          >
            {{ item.label }}
          </el-checkbox>
        </el-checkbox-group>
      </div>

      <div class="advanced-section">
        <label>工单类型</label>
        <el-checkbox-group v-model="advancedFilters.ticketTypes">
          <el-checkbox
            v-for="item in ticketTypeOptions"
            :key="item.value"
            :label="item.value"
          >
            {{ item.label }}
          </el-checkbox>
        </el-checkbox-group>
      </div>

      <div class="advanced-section">
        <label>指派筛选</label>
        <el-radio-group v-model="advancedFilters.assignedMode">
          <el-radio-button label="all">全部</el-radio-button>
          <el-radio-button label="mine">我的工单</el-radio-button>
          <el-radio-button label="unassigned">未分配</el-radio-button>
          <el-radio-button label="custom">指定坐席</el-radio-button>
        </el-radio-group>
        <el-input
          v-if="advancedFilters.assignedMode === 'custom'"
          v-model="customAssignedAgent"
          placeholder="输入坐席ID"
          class="mt-8"
        />
      </div>

      <div class="advanced-section">
        <label>指定坐席ID（多选）</label>
        <el-select
          v-model="advancedFilters.assignedAgentIds"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="输入坐席ID"
        />
      </div>

      <div class="advanced-section">
        <label>标签</label>
        <el-select
          v-model="advancedFilters.tags"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="输入标签"
        />
      </div>

      <div class="advanced-section">
        <label>问题分类</label>
        <el-select
          v-model="advancedFilters.categories"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="输入分类"
        />
      </div>

      <div class="advanced-section">
        <label>创建时间</label>
        <el-radio-group v-model="advancedTimeRange">
          <el-radio-button
            v-for="item in timeRangeRadioOptions"
            :key="item.value"
            :label="item.value"
          >
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
        <el-date-picker
          v-if="advancedTimeRange === 'custom'"
          v-model="customDateRange"
          type="daterange"
          unlink-panels
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          style="width: 100%"
        />
      </div>

      <div class="advanced-section sort-section">
        <label>排序</label>
        <div class="sort-controls">
          <el-select v-model="sortByField" style="flex: 1">
            <el-option
              v-for="item in advancedSortOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <el-switch
            v-model="sortDesc"
            inline-prompt
            active-text="降序"
            inactive-text="升序"
          />
        </div>
      </div>

      <div class="drawer-actions">
        <el-button @click="resetAdvancedFilters">重置</el-button>
        <el-button type="primary" @click="applyAdvancedFilters">应用筛选</el-button>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.ticket-page {
  padding: 24px 32px 48px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  gap: 16px;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.page-header h1 {
  font-size: 24px;
  font-weight: 600;
}

.subtitle {
  color: #666;
  font-size: 14px;
}

.tab-switcher {
  display: flex;
  justify-content: flex-start;
}

.filters {
  display: flex;
  gap: 12px;
  align-items: center;
}

.filters .el-input {
  flex: 1;
}

.ticket-table {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06);
}

.ticket-title {
  font-weight: 600;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.mention-flag {
  letter-spacing: 1px;
}

:deep(.el-table .row-has-mention) {
  background: #fff7ed !important;
}

:deep(.el-table .row-has-mention .cell) {
  border-bottom-color: #fde68a !important;
}

.ticket-description {
  color: #666;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.empty-state {
  text-align: center;
  color: #888;
  padding: 32px 0;
}

.sla-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.sla-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px 20px;
  box-shadow: 0 4px 18px rgba(15, 23, 42, 0.08);
  min-height: 180px;
}

.sla-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.sla-card-header h3 {
  margin: 0;
  font-size: 16px;
}

.sla-card-header p {
  margin: 2px 0 0;
  color: #7a7a7a;
  font-size: 12px;
}

.sla-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-label {
  font-size: 12px;
  color: #748094;
}

.metric-value {
  font-size: 20px;
  font-weight: 600;
  color: #1f2933;
}

.alerts .alert-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.alert-group h4 {
  margin: 0 0 6px;
  font-size: 14px;
  color: #111826;
}

.alert-group ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.alert-group li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  padding: 8px 10px;
  background: #f6f8fb;
  border-radius: 8px;
}

.alert-ticket {
  font-weight: 600;
}

.alert-priority {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e5e7eb;
  color: #374151;
}

.alert-priority.priority-high,
.alert-priority.priority-urgent {
  background: #fef3c7;
  color: #b45309;
}

.alert-priority.priority-urgent {
  background: #fee2e2;
  color: #b91c1c;
}

.alert-time {
  font-size: 12px;
  color: #6b7280;
}

.sla-empty {
  text-align: center;
  color: #8b95a7;
  padding: 24px 0;
}

.advanced-filter-tag {
  margin-left: 8px;
}

.advanced-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.advanced-section label {
  font-size: 13px;
  color: #555;
  font-weight: 600;
}

.mt-8 {
  margin-top: 8px;
}

.mb-12 {
  margin-bottom: 12px;
}

.sort-section .sort-controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}
</style>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, nextTick, computed, watch, reactive } from 'vue'
import { useAgentStore } from '@/stores/agentStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useRouter, useRoute } from 'vue-router'
import SessionList from '@/components/SessionList.vue'
import QuickReplies from '@/components/QuickReplies.vue'
import CustomerProfile from '@/components/customer/CustomerProfile.vue'
import KeyboardShortcutsHelp from '@/components/KeyboardShortcutsHelp.vue'
import NotificationSettingsDialog from '@/components/NotificationSettingsDialog.vue'
import AssistRequestDialog from '@/components/AssistRequestDialog.vue'
import PersonalizationSettingsDialog from '@/components/PersonalizationSettingsDialog.vue'
import type {
  SessionStatus,
  CustomerProfile as CustomerProfileType,
  SmartAssignRecommendation,
  SmartAssignPayload,
  TicketPriority,
  TicketType,
  Message,
  SessionDetail
} from '@/types'
import { useAgentWorkbenchSSE } from '@/composables/useAgentWorkbenchSSE'
import { useKeyboardShortcuts, type KeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { getAccessToken } from '@/utils/authStorage'
import axios from 'axios'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAgentStatusStore } from '@/stores/agentStatusStore'
import { useTransferStore } from '@/stores/transferStore'
import { useAssistRequestStore } from '@/stores/assistRequestStore'
import { requestSmartAssignment } from '@/api/tickets'

const agentStore = useAgentStore()
const sessionStore = useSessionStore()
const router = useRouter()
const route = useRoute()
const settingsStore = useSettingsStore()
settingsStore.init()
const transferStore = useTransferStore()
const assistRequestStore = useAssistRequestStore()
const statusStore = useAgentStatusStore()

let authWarningShown = false
const requireAuthToken = (): string | null => {
  const token = getAccessToken()
  if (!token) {
    if (!authWarningShown) {
      authWarningShown = true
      alert('认证信息已失效，请重新登录')
      router.push('/login')
    }
    return null
  }
  return token
}

// 客户信息相关状态
const customerProfile = ref<CustomerProfileType | null>(null)
const loadingCustomer = ref(false)
const currentTab = ref<'chat' | 'customer' | 'history' | 'notes'>('chat')  // 右侧 Tab 切换

// 【模块5】内部备注相关状态
const internalNotes = ref<any[]>([])
const loadingNotes = ref(false)
const newNoteContent = ref('')
const newNoteMentions = ref<string[]>([])
const addingNote = ref(false)
const editingNoteId = ref<string | null>(null)
const editingNoteContent = ref('')
const editingNoteMentions = ref<string[]>([])
const showMentionSelector = ref(false)
const mentionSearchKeyword = ref('')
const showEditingMentionSelector = ref(false)
const editingMentionSearchKeyword = ref('')

// 【模块6】快捷键帮助面板
const showShortcutsHelp = ref(false)

// 【模块6.2.2】消息提醒系统
const showNotificationSettings = ref(false)
const showPersonalizationSettings = ref(false)

// 【模块6.2.4】个性化设置状态
const manualHistoryPending = ref<string | null>(null)
const manualHistoryLoading = ref(false)
const skipWatcherSession = ref<string | null>(null)

const dashboardClasses = computed(() => [
  `theme-${settingsStore.resolvedTheme}`,
  `font-${settingsStore.settings.appearance.fontSize}`,
  `bubble-${settingsStore.settings.appearance.bubbleStyle}`
])
const sessionListDensity = computed(() => settingsStore.settings.appearance.listDensity)
const showMessagePreview = computed(() => settingsStore.settings.behavior.showMessagePreview)

// 【模块6.2.3】坐席状态管理
const agentStatus = computed(() => statusStore.status)

// 【模块6】搜索框引用
const searchInputRef = ref<HTMLInputElement | null>(null)

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

// 【阶段2】使用 SSE 实时推送替代轮询
const { startMonitoring, stopMonitoring } = useAgentWorkbenchSSE()

// 【L1-1-Part1-模块1】高级筛选状态
const currentFilter = ref<SessionStatus | 'all'>('pending_manual')
const timeRange = ref<'today' | 'last3days' | 'last7days' | 'thisMonth' | 'custom'>('today')
const customTimeStart = ref<Date | null>(null)
const customTimeEnd = ref<Date | null>(null)
const customerType = ref<'all' | 'vip' | 'old' | 'new'>('all')
const sortBy = ref<'default' | 'newest' | 'oldest' | 'vip' | 'waitTime'>('default')
// 🔴 修复: 默认只显示"未分配"的会话，避免显示已分配给其他坐席的会话
const agentFilterMode = ref<'all' | 'mine' | 'unassigned' | 'custom'>('unassigned')
const customAgentValue = ref('')

// 搜索关键词
const searchKeyword = ref('')

// 【L1-1-Part1-模块1】应用高级筛选
const applyAdvancedFilter = async () => {
  // 计算时间范围
  let timeStart: number | undefined = undefined
  let timeEnd: number | undefined = undefined

  const now = Date.now() / 1000  // 转为秒级时间戳
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (timeRange.value === 'today') {
    timeStart = today.getTime() / 1000
  } else if (timeRange.value === 'last3days') {
    timeStart = now - (3 * 24 * 3600)
  } else if (timeRange.value === 'last7days') {
    timeStart = now - (7 * 24 * 3600)
  } else if (timeRange.value === 'thisMonth') {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
    timeStart = firstDay.getTime() / 1000
  } else if (timeRange.value === 'custom') {
    if (customTimeStart.value) {
      timeStart = customTimeStart.value.getTime() / 1000
    }
    if (customTimeEnd.value) {
      timeEnd = customTimeEnd.value.getTime() / 1000
    }
  }

  let agentParam: string | undefined
  if (agentFilterMode.value === 'mine' && agentStore.agentId) {
    agentParam = agentStore.agentId
  } else if (agentFilterMode.value === 'unassigned') {
    agentParam = 'unassigned'
  } else if (agentFilterMode.value === 'custom' && customAgentValue.value.trim()) {
    agentParam = customAgentValue.value.trim()
  }

  // 调用高级筛选API
  await sessionStore.fetchSessionsAdvanced({
    status: currentFilter.value,
    timeStart,
    timeEnd,
    agent: agentParam,
    customerType: customerType.value,
    keyword: searchKeyword.value,
    sort: sortBy.value
  })
}

// 监听筛选条件变化
watch([currentFilter, timeRange, customerType, sortBy, agentFilterMode], () => {
  applyAdvancedFilter()
})

watch(customAgentValue, (value) => {
  if (agentFilterMode.value === 'custom' && value !== undefined) {
    applyAdvancedFilter()
  }
})

watch([customTimeStart, customTimeEnd], () => {
  if (hasCustomTime.value) {
    applyAdvancedFilter()
  }
})


// 监听搜索关键词变化（防抖500ms）
let searchDebounce: ReturnType<typeof setTimeout> | null = null
let sessionRefreshTimer: ReturnType<typeof setInterval> | null = null
let queueRefreshTimer: ReturnType<typeof setInterval> | null = null
let transferRequestPoller: ReturnType<typeof setInterval> | null = null
watch(searchKeyword, () => {
  if (searchDebounce) {
    clearTimeout(searchDebounce)
  }
  searchDebounce = setTimeout(() => {
    applyAdvancedFilter()
  }, 500)
})

const hasCustomTime = computed(() => timeRange.value === 'custom')

const timeRangeLabel = (value: string) => {
  const map: Record<string, string> = {
    today: '今天',
    last3days: '最近3天',
    last7days: '最近7天',
    thisMonth: '本月',
    custom: '自定义时间'
  }
  return map[value] || value
}

const customerTypeLabel = (value: string) => {
  const map: Record<string, string> = {
    all: '全部客户',
    vip: 'VIP客户',
    old: '老客户',
    new: '新客户'
  }
  return map[value] || value
}

const sortLabel = (value: string) => {
  const map: Record<string, string> = {
    default: '默认排序',
    newest: '最新优先',
    oldest: '最早优先',
    vip: 'VIP优先',
    waitTime: '等待时长'
  }
  return map[value] || value
}

const agentFilterModeLabel = (value: string) => {
  const map: Record<string, string> = {
    mine: '我的会话',
    unassigned: '未分配',
    custom: '指定坐席'
  }
  return map[value] || value
}

const activeFilters = computed(() => {
  const chips: string[] = []
  if (currentFilter.value !== 'all') {
    chips.push(`状态：${currentFilter.value}`)
  }
  if (timeRange.value !== 'today') {
    chips.push(timeRangeLabel(timeRange.value))
  }
  if (hasCustomTime.value && (customTimeStart.value || customTimeEnd.value)) {
    chips.push('已选择自定义时间')
  }
  if (customerType.value !== 'all') {
    chips.push(customerTypeLabel(customerType.value))
  }
  if (sortBy.value !== 'default') {
    chips.push(sortLabel(sortBy.value))
  }
  if (agentFilterMode.value !== 'all') {
    if (agentFilterMode.value === 'custom') {
      chips.push(`坐席：${customAgentValue.value || '未填写'}`)
    } else {
      chips.push(agentFilterModeLabel(agentFilterMode.value))
    }
  }
  if (searchKeyword.value.trim()) {
    chips.push(`搜索：${searchKeyword.value.trim()}`)
  }
  return chips
})

const hasActiveFilters = computed(() => activeFilters.value.length > 0)

const clearAllFilters = () => {
  currentFilter.value = 'pending_manual'
  timeRange.value = 'today'
  customTimeStart.value = null
  customTimeEnd.value = null
  customerType.value = 'all'
  sortBy.value = 'default'
  agentFilterMode.value = 'unassigned'  // 🔴 修复: 清除筛选时恢复为"未分配"
  customAgentValue.value = ''
  searchKeyword.value = ''
}

const customTimeStartInput = computed<string>({
  get() {
    if (!customTimeStart.value) return ''
    return new Date(customTimeStart.value).toISOString().slice(0, 16)
  },
  set(value: string) {
    customTimeStart.value = value ? new Date(value) : null
  }
})

const customTimeEndInput = computed<string>({
  get() {
    if (!customTimeEnd.value) return ''
    return new Date(customTimeEnd.value).toISOString().slice(0, 16)
  },
  set(value: string) {
    customTimeEnd.value = value ? new Date(value) : null
  }
})

watch(() => settingsStore.settings.behavior.autoLoadHistory, (auto) => {
  if (auto && manualHistoryPending.value) {
    handleManualHistoryLoad()
  }
})

watch(() => settingsStore.settings.behavior.sessionRefreshInterval, () => {
  setupAutoRefreshTimers()
})

// 过滤后的会话列表（已由store返回，直接使用）
const filteredSessions = computed(() => sessionStore.sessions)

// 聊天输入
const messageInput = ref('')
const chatHistoryRef = ref<HTMLElement | null>(null)
const isSending = ref(false)
const showQuickReplies = ref(false)

// 转接对话框
const showTransferDialog = ref(false)
const transferSubmitting = ref(false)
const transferTargetId = ref('')
const transferNote = ref('')
const transferReasonPresets = [
  {
    id: 'skill',
    label: '专业技能',
    description: '需要更专业的坐席处理技术类或复杂问题',
    template: '需要技术支持坐席处理电池故障问题'
  },
  {
    id: 'language',
    label: '语言要求',
    description: '客户需要特定语言服务',
    template: '客户要求使用英语沟通'
  },
  {
    id: 'workload',
    label: '工作负载',
    description: '当前会话较多，转给空闲坐席',
    template: '当前会话数已满，请求空闲坐席接手'
  },
  {
    id: 'customer',
    label: '客户要求',
    description: '客户指定历史坐席或特定人员',
    template: '客户希望继续由上次服务的坐席跟进'
  },
  {
    id: 'custom',
    label: '其他',
    description: '自定义转接原因',
    template: ''
  }
]
const selectedTransferReasonPreset = ref(transferReasonPresets[0]?.id || 'custom')
const transferReason = ref(transferReasonPresets[0]?.template || '')
const isCustomTransferReason = computed(() => selectedTransferReasonPreset.value === 'custom')
const selectedTransferReasonPresetInfo = computed(() =>
  transferReasonPresets.find(item => item.id === selectedTransferReasonPreset.value)
)

watch(selectedTransferReasonPreset, (presetId) => {
  const preset = transferReasonPresets.find(item => item.id === presetId)
  if (preset && !isCustomTransferReason.value) {
    transferReason.value = preset.template
  }
})

watch(showTransferDialog, (visible) => {
  if (!visible) {
    resetTransferRecommendation()
  }
})

watch(
  () => sessionStore.currentSession?.session_name,
  () => {
    if (showTransferDialog.value) {
      resetTransferRecommendation()
      fetchTransferRecommendation().catch((error) => {
        console.warn('⚠️ 获取转接推荐失败:', error)
      })
    } else {
      resetTransferRecommendation()
    }
  }
)

const transferRecommendation = ref<SmartAssignRecommendation | null>(null)
const transferRecommendationLoading = ref(false)
const transferRecommendationError = ref<string | null>(null)
const recommendedAgentInfo = computed(() => {
  if (!transferRecommendation.value) return null
  return availableAgents.value.find(agent => agent.id === transferRecommendation.value?.agent_id) || null
})

const showTransferRequestsPanel = ref(false)
const respondingTransferRequestId = ref<string | null>(null)
const transferResponseNotes = reactive<Record<string, string>>({})
const pendingTransferRequests = computed(() => transferStore.pendingRequests)
const pendingTransferCount = computed(() => transferStore.pendingRequests.length)
const loadingPendingTransfers = computed(() => transferStore.loadingPending)
const transferHistory = computed(() => transferStore.history)
const loadingTransferHistory = computed(() => transferStore.loadingHistory)

const showAssistCenter = ref(false)
const assistTab = ref<'received' | 'sent'>('received')
const assistFilter = ref<'pending' | 'answered' | 'all'>('pending')
const assistResponseNotes = reactive<Record<string, string>>({})
const replyingAssistRequestId = ref<string | null>(null)
const assistPollTimer = ref<ReturnType<typeof setInterval> | null>(null)
const receivedAssistRequests = computed(() => assistRequestStore.received)
const sentAssistRequests = computed(() => assistRequestStore.sent)
const assistLoading = computed(() => assistRequestStore.loading)
const visibleAssistRequests = computed(() =>
  assistTab.value === 'received' ? receivedAssistRequests.value : sentAssistRequests.value
)

watch(() => sessionStore.currentSessionName, (sessionName) => {
  if (sessionName) {
    transferStore.fetchTransferHistory(sessionName).catch((error) => {
      console.warn('⚠️ 获取转接历史失败:', error)
    })
  } else {
    transferStore.clearHistory()
  }
})

watch(assistFilter, (value) => {
  assistRequestStore.fetchRequests(value).catch((error) => {
    console.warn('⚠️ 切换协助请求筛选失败:', error)
  })
})

// 【模块5】协助请求对话框
const showAssistRequestDialog = ref(false)

// 可转接的坐席列表（从API获取真实数据）
interface AvailableAgent {
  id: string
  username: string
  name: string
  status: string
  role: string
  max_sessions: number
}

const availableAgents = ref<AvailableAgent[]>([])
const loadingAgents = ref(false)

// 仅保留在线且非当前坐席的协助候选
const assistAvailableAgents = computed(() =>
  availableAgents.value.filter(agent =>
    agent.id !== agentStore.agentId && agent.status === 'online'
  )
)

// 协助请求对话框所需字段
const assistRequestOptions = computed(() =>
  assistAvailableAgents.value.map(agent => ({
    agent_id: agent.id,
    username: agent.username,
    name: agent.name,
    status: agent.status
  }))
)

const mentionCandidates = computed(() => {
  const map = new Map<string, { username: string; name: string; status: string }>()
  availableAgents.value.forEach(agent => {
    map.set(agent.username, {
      username: agent.username,
      name: agent.name || agent.username,
      status: agent.status
    })
  })
  if (agentStore.agentId) {
    map.set(agentStore.agentId, {
      username: agentStore.agentId,
      name: agentStore.agentName || agentStore.agentId,
      status: 'online'
    })
  }
  return Array.from(map.values())
})

const mentionLabelMap = computed(() => {
  const map: Record<string, string> = {}
  mentionCandidates.value.forEach(candidate => {
    map[candidate.username] = candidate.name
  })
  return map
})

const filteredMentionCandidates = computed(() => {
  const keyword = mentionSearchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    return mentionCandidates.value
  }
  return mentionCandidates.value.filter(candidate =>
    candidate.name.toLowerCase().includes(keyword) ||
    candidate.username.toLowerCase().includes(keyword)
  )
})

const filteredEditingMentionCandidates = computed(() => {
  const keyword = editingMentionSearchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    return mentionCandidates.value
  }
  return mentionCandidates.value.filter(candidate =>
    candidate.name.toLowerCase().includes(keyword) ||
    candidate.username.toLowerCase().includes(keyword)
  )
})

const getMentionLabel = (username: string) => mentionLabelMap.value[username] || username

const removeNewMention = (username: string) => {
  newNoteMentions.value = newNoteMentions.value.filter(item => item !== username)
}

const removeEditingMention = (username: string) => {
  editingNoteMentions.value = editingNoteMentions.value.filter(item => item !== username)
}

const resetTransferRecommendation = () => {
  transferRecommendation.value = null
  transferRecommendationError.value = null
  transferRecommendationLoading.value = false
}

const deriveTicketTypeFromReason = (reason?: string | null): TicketType => {
  if (!reason) return 'after_sale'
  const normalized = reason.toLowerCase()
  if (normalized.includes('售前') || normalized.includes('预售') || normalized.includes('pre')) {
    return 'pre_sale'
  }
  if (normalized.includes('投诉') || normalized.includes('质量') || normalized.includes('refund')) {
    return 'complaint'
  }
  return 'after_sale'
}

const derivePriorityFromSession = (session: SessionDetail | null): TicketPriority => {
  if (!session) return 'medium'
  const severity = session.escalation?.severity?.toLowerCase()
  if (severity === 'critical' || severity === 'urgent') return 'urgent'
  if (severity === 'high') return 'high'
  if (session.user_profile?.vip) return 'high'
  return 'medium'
}

const extractSessionKeywords = (session: SessionDetail | null, limit = 8): string[] => {
  if (!session) return []
  const historyTexts = session.history
    .filter((msg: Message) => msg.role === 'user')
    .slice(-5)
    .map(msg => msg.content || '')
  const combined = `${session.escalation?.reason || ''} ${historyTexts.join(' ')}`
  const tokens = combined
    .toLowerCase()
    .split(/[\s,.;，。\\/!?？]+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2)
  return Array.from(new Set(tokens)).slice(0, limit)
}

const buildTransferSmartPayload = (session: SessionDetail | null): SmartAssignPayload | null => {
  if (!session) return null
  const reason = session.escalation?.reason?.trim()
  return {
    ticket_type: deriveTicketTypeFromReason(reason),
    priority: derivePriorityFromSession(session),
    category: reason || undefined,
    keywords: extractSessionKeywords(session)
  }
}

const fetchTransferRecommendation = async () => {
  const payload = buildTransferSmartPayload(sessionStore.currentSession)
  if (!payload) {
    transferRecommendation.value = null
    transferRecommendationError.value = '当前会话缺少必要信息，无法推荐坐席'
    return
  }
  transferRecommendationLoading.value = true
  transferRecommendationError.value = null
  try {
    transferRecommendation.value = await requestSmartAssignment(payload)
  } catch (error: any) {
    transferRecommendation.value = null
    transferRecommendationError.value = error?.message || '暂时无法获取推荐坐席'
  } finally {
    transferRecommendationLoading.value = false
  }
}

const applyTransferRecommendation = () => {
  if (!transferRecommendation.value) return
  transferTargetId.value = transferRecommendation.value.agent_id
  const match = recommendedAgentInfo.value
  if (!match) {
    alert('推荐坐席当前不在在线列表，仍可继续提交转接请求')
  }
}

// 处理快捷短语选择
const handleQuickReplySelect = (content: string) => {
  messageInput.value = content
  showQuickReplies.value = false
}

// 格式化时间（秒转为易读格式）
const formatTime = (seconds: number): string => {
  if (seconds < 60) {
    return `${Math.round(seconds)}秒`
  } else if (seconds < 3600) {
    return `${Math.round(seconds / 60)}分`
  } else {
    return `${Math.round(seconds / 3600)}时`
  }
}

// 格式化坐席状态标签
const getStatusLabel = (status: string): string => {
  const statusMap: Record<string, string> = {
    'online': '在线',
    'offline': '离线',
    'busy': '忙碌',
    'break': '小休',
    'lunch': '午休',
    'training': '培训'
  }
  return statusMap[status] || status
}

// 格式化坐席角色标签
const getRoleLabel = (role: string): string => {
  const roleMap: Record<string, string> = {
    'admin': '管理员',
    'agent': '客服'
  }
  return roleMap[role] || role
}

const getTransferDecisionLabel = (decision: string): string => {
  if (decision === 'accepted') return '已接受'
  if (decision === 'declined') return '已拒绝'
  if (decision === 'expired') return '已失效'
  return '待确认'
}

const getTransferDecisionClass = (decision: string): string => {
  if (decision === 'accepted') return 'history-accepted'
  if (decision === 'declined') return 'history-declined'
  if (decision === 'expired') return 'history-expired'
  return 'history-pending'
}

const loadSessionData = async (sessionName: string) => {
  skipWatcherSession.value = sessionName
  manualHistoryLoading.value = true
  manualHistoryPending.value = null
  try {
    await applyAdvancedFilter()
    await sessionStore.fetchSessionDetail(sessionName)
    await fetchCustomerProfile(sessionName)
    await fetchInternalNotes(sessionName)
    await maybeAutoTakeover()
  } finally {
    manualHistoryLoading.value = false
    skipWatcherSession.value = null
  }
}

const handleManualHistoryLoad = async () => {
  if (!manualHistoryPending.value) return
  await loadSessionData(manualHistoryPending.value)
}

async function maybeAutoTakeover() {
  if (!settingsStore.settings.behavior.autoTakeover) return
  const activeSession = sessionStore.currentSession
  if (!activeSession || activeSession.status !== 'pending_manual') return
  if (!agentStore.agentId) return
  try {
    await handleTakeover(activeSession.session_name, { silent: true })
  } catch (error) {
    console.warn('自动接入失败:', error)
  }
}

const setupAutoRefreshTimers = () => {
  if (sessionRefreshTimer) {
    clearInterval(sessionRefreshTimer)
    sessionRefreshTimer = null
  }
  if (queueRefreshTimer) {
    clearInterval(queueRefreshTimer)
    queueRefreshTimer = null
  }

  const interval = (settingsStore.settings.behavior.sessionRefreshInterval || 30) * 1000
  sessionRefreshTimer = setInterval(() => {
    applyAdvancedFilter()
  }, interval)

  queueRefreshTimer = setInterval(async () => {
    await sessionStore.fetchQueue()
  }, interval)
}

// 处理会话选择
const handleSelectSession = async (sessionName: string) => {
  if (!settingsStore.settings.behavior.autoLoadHistory) {
    sessionStore.currentSessionName = sessionName
    sessionStore.currentSession = null
    manualHistoryPending.value = sessionName
    manualHistoryLoading.value = false
    customerProfile.value = null
    internalNotes.value = []
    return
  }
  await loadSessionData(sessionName)
}

// 获取客户画像
const fetchCustomerProfile = async (customerId: string) => {
  try {
    loadingCustomer.value = true
    const token = requireAuthToken()
    if (!token) {
      loadingCustomer.value = false
      return
    }

    const response = await axios.get(
      `${API_BASE}/api/customers/${customerId}/profile`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    if (response.data.success) {
      customerProfile.value = response.data.data
    }
  } catch (error: any) {
    console.error('获取客户信息失败:', error)
    customerProfile.value = null
  } finally {
    loadingCustomer.value = false
  }
}

// 监听当前会话变化
watch(() => sessionStore.currentSessionName, (newSession) => {
  if (newSession) {
    if (manualHistoryPending.value === newSession || skipWatcherSession.value === newSession) {
      customerProfile.value = null
      internalNotes.value = []
      return
    }
    fetchCustomerProfile(newSession)
    fetchInternalNotes(newSession)
  } else {
    customerProfile.value = null
    internalNotes.value = []
  }
})

// 【模块5】获取内部备注列表
const fetchInternalNotes = async (sessionName: string) => {
  try {
    loadingNotes.value = true
    const token = requireAuthToken()
    if (!token) {
      loadingNotes.value = false
      return
    }

    const response = await axios.get(
      `${API_BASE}/api/sessions/${sessionName}/notes`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    if (response.data.success) {
      internalNotes.value = response.data.data || []
    }
  } catch (error: any) {
    console.error('获取内部备注失败:', error)
    internalNotes.value = []
  } finally {
    loadingNotes.value = false
  }
}

// 【模块5】添加内部备注
const handleAddNote = async () => {
  if (!newNoteContent.value.trim() || !sessionStore.currentSession) return

  try {
    addingNote.value = true
    const token = requireAuthToken()
    if (!token) {
      addingNote.value = false
      return
    }

    const response = await axios.post(
      `${API_BASE}/api/sessions/${sessionStore.currentSession.session_name}/notes`,
      {
        content: newNoteContent.value.trim(),
        mentions: newNoteMentions.value
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    if (response.data.success) {
      newNoteContent.value = ''
      newNoteMentions.value = []
      showMentionSelector.value = false
      mentionSearchKeyword.value = ''
      // 重新加载备注列表
      await fetchInternalNotes(sessionStore.currentSession.session_name)
    }
  } catch (error: any) {
    console.error('添加内部备注失败:', error)
    alert(`添加备注失败: ${error.response?.data?.detail || error.message}`)
  } finally {
    addingNote.value = false
  }
}

// 【模块5】编辑内部备注
const handleEditNote = (noteId: string, content: string, noteMentions: string[] = []) => {
  editingNoteId.value = noteId
  editingNoteContent.value = content
  editingNoteMentions.value = [...noteMentions]
  showEditingMentionSelector.value = false
  editingMentionSearchKeyword.value = ''
}

// 【模块5】保存编辑的备注
const handleSaveEditNote = async (noteId: string) => {
  if (!editingNoteContent.value.trim() || !sessionStore.currentSession) return

  try {
    const token = requireAuthToken()
    if (!token) return

    const response = await axios.put(
      `${API_BASE}/api/sessions/${sessionStore.currentSession.session_name}/notes/${noteId}`,
      {
        content: editingNoteContent.value.trim(),
        mentions: editingNoteMentions.value
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    if (response.data.success) {
      editingNoteId.value = null
      editingNoteContent.value = ''
      editingNoteMentions.value = []
      showEditingMentionSelector.value = false
      editingMentionSearchKeyword.value = ''
      // 重新加载备注列表
      await fetchInternalNotes(sessionStore.currentSession.session_name)
    }
  } catch (error: any) {
    console.error('更新内部备注失败:', error)
    alert(`更新备注失败: ${error.response?.data?.detail || error.message}`)
  }
}

// 【模块5】取消编辑
const handleCancelEdit = () => {
  editingNoteId.value = null
  editingNoteContent.value = ''
  editingNoteMentions.value = []
  showEditingMentionSelector.value = false
  editingMentionSearchKeyword.value = ''
}

// 【模块5】删除内部备注
const handleDeleteNote = async (noteId: string) => {
  if (!confirm('确定要删除这条备注吗？')) return

  if (!sessionStore.currentSession) return

  try {
    const token = requireAuthToken()
    if (!token) return

    await axios.delete(
      `${API_BASE}/api/sessions/${sessionStore.currentSession.session_name}/notes/${noteId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    // 重新加载备注列表
    await fetchInternalNotes(sessionStore.currentSession.session_name)
  } catch (error: any) {
    console.error('删除内部备注失败:', error)
    alert(`删除备注失败: ${error.response?.data?.detail || error.message}`)
  }
}

// 【模块6】格式化时间
const formatNoteTime = (timestamp: number) => {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // 1分钟内
  if (diff < 60000) {
    return '刚刚'
  }
  // 1小时内
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000)
    return `${minutes}分钟前`
  }
  // 今天
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  // 其他
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const formatQueuePriority = (level?: string) => {
  if (!level) {
    return { label: '普通', className: 'priority-normal' }
  }
  const map: Record<string, { label: string; className: string }> = {
    urgent: { label: '紧急', className: 'priority-urgent' },
    high: { label: '重要', className: 'priority-high' },
    normal: { label: '普通', className: 'priority-normal' }
  }
  return map[level] || { label: level, className: 'priority-normal' }
}

// 【模块6】快捷键处理函数
const focusSearchInput = () => {
  if (searchInputRef.value) {
    searchInputRef.value.focus()
  }
}

const selectPreviousSession = () => {
  const sessions = filteredSessions.value
  if (sessions.length === 0) return

  const currentIndex = sessions.findIndex(s => s.session_name === sessionStore.currentSessionName)
  const previousIndex = currentIndex > 0 ? currentIndex - 1 : sessions.length - 1
  const target = sessions[previousIndex]
  if (target) {
    handleSelectSession(target.session_name)
  }
}

const selectNextSession = () => {
  const sessions = filteredSessions.value
  if (sessions.length === 0) return

  const currentIndex = sessions.findIndex(s => s.session_name === sessionStore.currentSessionName)
  const nextIndex = currentIndex >= 0 && currentIndex < sessions.length - 1 ? currentIndex + 1 : 0
  const target = sessions[nextIndex]
  if (target) {
    handleSelectSession(target.session_name)
  }
}

const closeCurrentPanel = () => {
  // 关闭快捷键帮助面板
  if (showShortcutsHelp.value) {
    showShortcutsHelp.value = false
    return
  }

  // 关闭转接对话框
  if (showTransferDialog.value) {
    showTransferDialog.value = false
    return
  }

  // 关闭快捷回复面板
  if (showQuickReplies.value) {
    showQuickReplies.value = false
    return
  }
}

const toggleShortcutsHelp = () => {
  showShortcutsHelp.value = !showShortcutsHelp.value
}

const focusNotesTab = () => {
  if (sessionStore.currentSession) {
    currentTab.value = 'notes'
  }
}

// 【模块6】注册快捷键（使用 Ctrl+Shift 双修饰键避免浏览器冲突）
const shortcuts: KeyboardShortcuts = {
  // 导航类 - 使用 Ctrl+Shift 或 Ctrl+Arrow 避免冲突
  'Ctrl+Shift+f': {
    handler: focusSearchInput,
    description: '搜索会话',
    category: 'navigation',
    allowInInput: false
  },
  'Ctrl+ArrowUp': {
    handler: selectPreviousSession,
    description: '上一个会话',
    category: 'navigation',
    allowInInput: false
  },
  'Ctrl+ArrowDown': {
    handler: selectNextSession,
    description: '下一个会话',
    category: 'navigation',
    allowInInput: false
  },
  'Escape': {
    handler: closeCurrentPanel,
    description: '关闭面板',
    category: 'navigation',
    allowInInput: true
  },

  // 操作类 - 使用 Ctrl+Shift 双修饰键避免冲突
  'Ctrl+Shift+t': {
    handler: () => {
      if (sessionStore.currentSession?.status === 'manual_live') {
        openTransferDialog()
      }
    },
    description: '转接会话',
    category: 'action',
    allowInInput: false
  },
  'Ctrl+Shift+r': {
    handler: () => {
      if (sessionStore.currentSession?.status === 'manual_live') {
        handleRelease()
      }
    },
    description: '释放会话',
    category: 'action',
    allowInInput: false
  },

  // 功能类
  'Ctrl+Shift+b': {
    handler: focusNotesTab,
    description: '内部备注',
    category: 'function',
    allowInInput: false
  },
  'Ctrl+Shift+/': {
    handler: toggleShortcutsHelp,
    description: '快捷命令面板',
    category: 'function',
    allowInInput: false
  },
  'Ctrl+Shift+?': {
    handler: toggleShortcutsHelp,
    description: '快捷键帮助',
    category: 'function',
    allowInInput: false
  }
}

// 初始化快捷键系统
useKeyboardShortcuts(shortcuts)

// 处理接入会话
async function handleTakeover(sessionName: string, options: { silent?: boolean } = {}) {
  try {
    const success = await sessionStore.takeoverSession(
      sessionName,
      agentStore.agentId,
      agentStore.agentName
    )
    if (success) {
      if (!options.silent) {
        alert(`✅ 已成功接入会话`)
      }
      await sessionStore.fetchSessionDetail(sessionName)
      await fetchCustomerProfile(sessionName)
      await fetchInternalNotes(sessionName)
    }
  } catch (err: any) {
    if (options.silent) {
      console.warn('接入失败:', err.message || err)
    } else {
      alert(`❌ 接入失败: ${err.message}`)
    }
  }
}

// 切换筛选
const handleFilterChange = (filter: SessionStatus | 'all') => {
  currentFilter.value = filter
  // watch会自动触发applyAdvancedFilter()
}

// 滚动到底部
const scrollToBottom = async () => {
  await nextTick()
  if (chatHistoryRef.value) {
    chatHistoryRef.value.scrollTop = chatHistoryRef.value.scrollHeight
  }
}

// 发送消息
const handleSendMessage = async () => {
  if (!messageInput.value.trim() || isSending.value) return
  if (!sessionStore.currentSession) return

  const content = messageInput.value.trim()
  messageInput.value = ''
  isSending.value = true

  try {
    await sessionStore.sendMessage(
      sessionStore.currentSession.session_name,
      content,
      agentStore.agentId,
      agentStore.agentName
    )
    await scrollToBottom()
  } catch (err: any) {
    alert(`❌ 发送失败: ${err.message}`)
  } finally {
    isSending.value = false
  }
}

// 释放会话
const handleRelease = async () => {
  if (!sessionStore.currentSession) return

  if (!confirm('确定要结束本次服务吗？会话将恢复为AI服务。')) {
    return
  }

  try {
    await sessionStore.releaseSession(
      sessionStore.currentSession.session_name,
      agentStore.agentId,
      'resolved'
    )
    alert('✅ 会话已释放，恢复AI服务')
    sessionStore.clearCurrentSession()
  } catch (err: any) {
    alert(`❌ 释放失败: ${err.message}`)
  }
}

// 处理回车发送
const handleKeyPress = (event: KeyboardEvent) => {
  const shortcut = settingsStore.settings.behavior.sendShortcut
  if (shortcut === 'enter') {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSendMessage()
    }
  } else if (shortcut === 'ctrlenter') {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault()
      handleSendMessage()
    }
  }
}

// 获取可转接的坐席列表
const fetchAvailableAgents = async () => {
  try {
    loadingAgents.value = true
    const token = requireAuthToken()
    if (!token) {
      loadingAgents.value = false
      return
    }
    const response = await fetch(`${API_BASE}/api/agents/available`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error('获取坐席列表失败')
    }

    const data = await response.json()
    if (data.success) {
      availableAgents.value = data.data.items
      console.log('✅ 获取到可转接坐席:', availableAgents.value.length, '个')
    }
  } catch (error) {
    console.error('❌ 获取坐席列表失败:', error)
    alert('获取坐席列表失败，请稍后重试')
  } finally {
    loadingAgents.value = false
  }
}

watch(currentTab, (tab) => {
  if (tab === 'notes' && availableAgents.value.length === 0) {
    fetchAvailableAgents().catch((error) => {
      console.warn('⚠️ 加载坐席列表失败:', error)
    })
  }
})

// 打开转接对话框
const openTransferDialog = async () => {
  resetTransferRecommendation()
  // 先获取最新的坐席列表
  await fetchAvailableAgents()

  // 过滤掉当前坐席
  const filtered = availableAgents.value.filter(a => a.id !== agentStore.agentId)
  if (filtered.length === 0) {
    alert('暂无可转接的坐席')
    return
  }
  transferTargetId.value = ''
  transferReason.value = transferReasonPresets[0]?.template || ''
  selectedTransferReasonPreset.value = transferReasonPresets[0]?.id || 'custom'
  transferNote.value = ''
  showTransferDialog.value = true
  if (sessionStore.currentSession) {
    fetchTransferRecommendation().catch((error) => {
      console.warn('⚠️ 获取智能推荐失败:', error)
    })
  }
}

// 打开协助请求对话框
const openAssistRequestDialog = async () => {
  await fetchAvailableAgents()
  if (assistAvailableAgents.value.length === 0) {
    alert('暂无在线可协助坐席')
    return
  }
  showAssistRequestDialog.value = true
}

// 处理转接
const handleTransfer = async () => {
  if (transferSubmitting.value) return
  if (!transferTargetId.value || !sessionStore.currentSession) {
    alert('请选择要转接的坐席')
    return
  }

  if (!transferReason.value.trim()) {
    alert('请填写转接原因')
    return
  }

  const targetAgent = availableAgents.value.find(a => a.id === transferTargetId.value)
  if (!targetAgent) {
    alert('坐席信息无效')
    return
  }

  try {
    transferSubmitting.value = true
    await sessionStore.transferSession(
      sessionStore.currentSession.session_name,
      agentStore.agentId,
      targetAgent.id,
      targetAgent.name,
      transferReason.value.trim(),
      transferNote.value.trim() || undefined
    )
    alert(`✅ 已向【${targetAgent.name}】发送转接请求，等待对方确认`)
    showTransferDialog.value = false
  } catch (err: any) {
    alert(`❌ 转接失败: ${err.message}`)
  } finally {
    transferSubmitting.value = false
  }
}

// 【模块5】处理协助请求
const handleAssistRequest = async (data: { assistant: string; question: string }) => {
  if (!sessionStore.currentSession) {
    alert('请先选择会话')
    return
  }

  const token = requireAuthToken()
  if (!token) return

  try {
    const response = await axios.post(
      `${API_BASE}/api/assist-requests`,
      {
        session_name: sessionStore.currentSession.session_name,
        assistant: data.assistant,
        question: data.question
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    if (response.data.success) {
      alert(`✅ 协助请求已发送至【${data.assistant}】`)
      showAssistRequestDialog.value = false
      assistRequestStore.fetchRequests(assistFilter.value)
    } else {
      alert('❌ 发送失败')
    }
  } catch (err: any) {
    alert(`❌ 发送失败: ${err.response?.data?.detail || err.message}`)
  }
}

const openAssistCenter = async () => {
  showAssistCenter.value = true
  try {
    await assistRequestStore.fetchRequests(assistFilter.value)
  } catch (error) {
    console.warn('⚠️ 获取协助请求失败:', error)
  }
}

const closeAssistCenter = () => {
  showAssistCenter.value = false
}

const handleAssistFilterChange = (value: 'pending' | 'answered' | 'all') => {
  assistFilter.value = value
}

const handleAssistAnswer = async (requestId: string) => {
  const note = assistResponseNotes[requestId]?.trim()
  if (!note) {
    alert('请输入回复内容')
    return
  }
  if (replyingAssistRequestId.value) return
  replyingAssistRequestId.value = requestId
  try {
    await assistRequestStore.answerRequest(requestId, note)
    assistResponseNotes[requestId] = ''
    await assistRequestStore.fetchRequests(assistFilter.value)
    alert('✅ 已回复协助请求')
  } catch (error: any) {
    alert(error?.message || '回复失败')
  } finally {
    replyingAssistRequestId.value = null
  }
}

const openTransferRequestsPanel = async () => {
  showTransferRequestsPanel.value = true
  try {
    await transferStore.fetchPendingRequests()
  } catch (error) {
    console.warn('⚠️ 获取待处理转接请求失败:', error)
  }
}

const closeTransferRequestsPanel = () => {
  showTransferRequestsPanel.value = false
}

const handleTransferRequestResponse = async (requestId: string, action: 'accept' | 'decline') => {
  if (respondingTransferRequestId.value) return
  const targetRequest = pendingTransferRequests.value.find((req) => req.id === requestId)
  const sessionName = targetRequest?.session_name
  respondingTransferRequestId.value = requestId
  try {
    const note = transferResponseNotes[requestId] || ''
    await transferStore.respondTransferRequest(requestId, action, note)
    transferResponseNotes[requestId] = ''
    if (action === 'accept') {
      currentFilter.value = 'manual_live'
      await sessionStore.fetchSessions('manual_live')
    } else {
      await applyAdvancedFilter()
    }
    await sessionStore.fetchStats()
    if (action === 'accept' && sessionName) {
      await handleSelectSession(sessionName)
    }
    alert(action === 'accept' ? '✅ 已接受转接请求' : '✅ 已拒绝转接请求')
    if (transferStore.pendingRequests.length === 0) {
      showTransferRequestsPanel.value = false
    }
  } catch (error: any) {
    alert(error?.message || '处理转接请求失败')
  } finally {
    respondingTransferRequestId.value = null
  }
}

onMounted(async () => {
  // 【阶段2】使用 SSE 实时监听替代轮询
  await startMonitoring()
  
  // 【L1-1-Part1-模块1】初始加载：应用高级筛选
  await applyAdvancedFilter()

  // 【模块2】加载队列数据
  await sessionStore.fetchQueue()

  setupAutoRefreshTimers()
  
  // Listen for query params to open panels
  if (route.query.tab === 'requests') openTransferRequestsPanel()
  if (route.query.tab === 'assist') openAssistCenter()
})

onUnmounted(() => {
  // 【阶段2】停止 SSE 监听
  stopMonitoring()
  if (sessionRefreshTimer) {
    clearInterval(sessionRefreshTimer)
    sessionRefreshTimer = null
  }
  if (transferRequestPoller) {
    clearInterval(transferRequestPoller)
    transferRequestPoller = null
  }
  if (assistPollTimer.value) {
    clearInterval(assistPollTimer.value)
    assistPollTimer.value = null
  }
  if (queueRefreshTimer) {
    clearInterval(queueRefreshTimer)
    queueRefreshTimer = null
  }
})
</script>

<template>
  <div class="dashboard-container" :class="dashboardClasses">
    <!-- 头部已移至 MainLayout -->

    <!-- 主体内容 -->
    <div class="dashboard-body">
      <!-- 左侧：会话列表 -->
      <div class="sessions-panel">
        <!-- 统计信息 -->
        <div class="stats-bar">
          <div class="stat-item pending" @click="handleFilterChange('pending_manual')">
            <span class="stat-value">{{ sessionStore.pendingCount }}</span>
            <span class="stat-label">待接入</span>
          </div>
          <div class="stat-item live" @click="handleFilterChange('manual_live')">
            <span class="stat-value">{{ sessionStore.manualLiveCount }}</span>
            <span class="stat-label">服务中</span>
          </div>
          <div class="stat-item all" @click="handleFilterChange('all')">
            <span class="stat-value">{{ sessionStore.stats.total_sessions }}</span>
            <span class="stat-label">全部</span>
          </div>
        </div>

        <!-- 详细统计 -->
        <div class="detailed-stats">
          <div class="detail-stat">
            <span class="detail-label">平均等待</span>
            <span class="detail-value">{{ formatTime(sessionStore.stats.avg_waiting_time) }}</span>
          </div>
          <div class="detail-stat">
            <span class="detail-label">在线坐席</span>
            <span class="detail-value">{{ sessionStore.stats.active_agents }}</span>
          </div>
        </div>

        <!-- 今日工作统计 -->
        <div class="work-summary-card" v-if="agentStatus">
          <div class="work-summary-header">
            <span>📊 今日工作统计</span>
            <button type="button" class="work-summary-refresh" @click="statusStore.fetchStatus">
              刷新
            </button>
          </div>
          <div class="work-summary-grid">
            <div class="summary-item">
              <span class="summary-label">已处理会话</span>
              <span class="summary-value">{{ agentStatus.today_stats.processed_count }} 个</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">平均响应时间</span>
              <span class="summary-value">{{ formatTime(agentStatus.today_stats.avg_response_time) }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">平均处理时长</span>
              <span class="summary-value">{{ formatTime(agentStatus.today_stats.avg_duration) }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">客户满意度</span>
              <span class="summary-value">
                {{ (agentStatus.today_stats.satisfaction_score || 0).toFixed(1) }} ⭐
              </span>
            </div>
          </div>
        </div>

        <!-- 【模块2】队列统计信息 -->
        <div v-if="sessionStore.queueStats.total_count > 0" class="queue-stats">
          <div class="queue-header">
            <span class="queue-icon">📋</span>
            <span class="queue-title">等待队列</span>
            <span class="queue-count">{{ sessionStore.queueStats.total_count }}人</span>
            <span class="queue-count vip">VIP {{ sessionStore.queueStats.vip_count }}</span>
          </div>
          <div class="queue-metrics">
            <div class="queue-metric">
              <span class="metric-icon">🔴</span>
              <span class="metric-label">VIP客户</span>
              <span class="metric-value">{{ sessionStore.queueStats.vip_count }}</span>
            </div>
            <div class="queue-metric">
              <span class="metric-icon">⏱️</span>
              <span class="metric-label">平均等待</span>
              <span class="metric-value">{{ formatTime(sessionStore.queueStats.avg_wait_time) }}</span>
            </div>
            <div class="queue-metric">
              <span class="metric-icon">⚠️</span>
              <span class="metric-label">最长等待</span>
              <span class="metric-value">{{ formatTime(sessionStore.queueStats.max_wait_time) }}</span>
            </div>
          </div>
          <div v-if="sessionStore.queueData.length" class="queue-list">
            <div
              v-for="item in sessionStore.queueData"
              :key="item.session_name"
              class="queue-item"
            >
              <div class="queue-item-header">
                <div class="queue-item-info">
                  <span class="queue-name">{{ item.user_profile?.nickname || item.session_name }}</span>
                  <span
                    class="queue-priority"
                    :class="formatQueuePriority(item.priority_level).className"
                  >
                    {{ formatQueuePriority(item.priority_level).label }}
                  </span>
                  <span v-if="item.is_vip" class="queue-vip">VIP</span>
                </div>
                <span class="queue-position">#{{ item.position }}</span>
              </div>
              <div class="queue-item-body">
                <span>等待 {{ formatTime(item.wait_time_seconds) }}</span>
                <span v-if="item.urgent_keywords?.length">
                  关键词：{{ item.urgent_keywords.join(' / ') }}
                </span>
                <span v-if="item.last_message">
                  最近：{{ item.last_message }}
                </span>
              </div>
            </div>
          </div>
          <div v-else class="queue-empty">暂无详细队列数据</div>
        </div>

        <!-- 筛选标签 -->
        <div class="filter-tabs">
          <button
            class="filter-tab"
            :class="{ active: currentFilter === 'pending_manual' }"
            @click="currentFilter = 'pending_manual'"
          >
            待接入
          </button>
          <button
            class="filter-tab"
            :class="{ active: currentFilter === 'manual_live' }"
            @click="currentFilter = 'manual_live'"
          >
            服务中
          </button>
          <button
            class="filter-tab"
            :class="{ active: currentFilter === 'all' }"
            @click="currentFilter = 'all'"
          >
            全部
          </button>
        </div>

        <!-- 【L1-1-Part1-模块1】高级筛选栏 -->
        <div class="advanced-filters">
          <div class="filter-group">
            <label>时间范围</label>
            <select v-model="timeRange" class="filter-select">
              <option value="today">今天</option>
              <option value="last3days">最近3天</option>
              <option value="last7days">最近7天</option>
              <option value="thisMonth">本月</option>
              <option value="custom">自定义</option>
            </select>
          </div>
          <div v-if="hasCustomTime" class="filter-group custom-time-inputs">
            <label>开始</label>
            <input type="datetime-local" v-model="customTimeStartInput" />
            <label>结束</label>
            <input type="datetime-local" v-model="customTimeEndInput" />
          </div>

          <div class="filter-group">
            <label>客户类型</label>
            <select v-model="customerType" class="filter-select">
              <option value="all">全部客户</option>
              <option value="vip">VIP客户</option>
              <option value="old">老客户</option>
              <option value="new">新客户</option>
            </select>
          </div>

          <div class="filter-group">
            <label>排序</label>
            <select v-model="sortBy" class="filter-select">
              <option value="default">默认排序</option>
              <option value="newest">最新优先</option>
              <option value="oldest">最早优先</option>
              <option value="vip">VIP优先</option>
              <option value="waitTime">等待时长</option>
            </select>
          </div>

          <div class="filter-group agent-filter">
            <label>坐席</label>
            <select v-model="agentFilterMode" class="filter-select">
              <option value="all">全部坐席</option>
              <option value="mine">我的会话</option>
              <option value="unassigned">未分配</option>
              <option value="custom">指定坐席</option>
            </select>
            <input
              v-if="agentFilterMode === 'custom'"
              type="text"
              class="filter-input"
              placeholder="输入坐席ID或用户名"
              v-model.trim="customAgentValue"
            />
          </div>

          <button
            v-if="hasActiveFilters"
            class="clear-filters-btn"
            type="button"
            @click="clearAllFilters"
          >
            重置筛选
          </button>
        </div>
        <div v-if="hasActiveFilters" class="filter-chips">
          <span v-for="chip in activeFilters" :key="chip" class="filter-chip">
            {{ chip }}
          </span>
        </div>

        <!-- 搜索框 -->
        <div class="search-box">
          <input
            ref="searchInputRef"
            v-model="searchKeyword"
            type="text"
            class="search-input"
            placeholder="搜索用户、会话ID、消息内容..."
          >
          <span v-if="searchKeyword" class="search-clear" @click="searchKeyword = ''">
            &times;
          </span>
        </div>

        <!-- 会话列表 -->
        <SessionList
          :sessions="filteredSessions"
          :is-loading="sessionStore.isLoading"
          :selected-session="sessionStore.currentSessionName"
          :density="sessionListDensity"
          :show-preview="showMessagePreview"
          @select="handleSelectSession"
          @takeover="handleTakeover"
          class="session-list-component"
        />
      </div>

      <!-- 右侧：会话详情/聊天区域 -->
      <div class="chat-panel">
        <div v-if="!sessionStore.currentSession" class="no-session">
          <div class="no-session-icon">💬</div>
          <p>选择一个会话开始服务</p>
          <p class="hint">点击左侧会话列表中的会话查看详情</p>
        </div>
        <div
          v-else-if="manualHistoryPending === sessionStore.currentSessionName"
          class="manual-history-placeholder"
        >
          <div class="placeholder-card">
            <div class="placeholder-icon">🗂️</div>
            <p class="placeholder-title">未加载历史消息</p>
            <p class="placeholder-desc">当前设置为“手动加载历史消息”，点击下方按钮开始加载</p>
            <button
              class="primary-btn"
              :disabled="manualHistoryLoading"
              @click="handleManualHistoryLoad"
            >
              {{ manualHistoryLoading ? '加载中...' : '加载历史消息' }}
            </button>
          </div>
        </div>

        <div v-else class="session-detail">
          <!-- 会话头部信息 -->
          <div class="detail-header">
            <div class="detail-user">
              <span class="user-avatar">
                {{ sessionStore.currentSession.user_profile?.nickname?.charAt(0) || '访' }}
              </span>
              <div class="user-info">
                <span class="user-name">
                  {{ sessionStore.currentSession.user_profile?.nickname || sessionStore.currentSession.session_name }}
                </span>
                <span class="session-status" :class="`status-${sessionStore.currentSession.status}`">
                  {{ sessionStore.currentSession.status }}
                </span>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="detail-actions">
              <button
                v-if="sessionStore.currentSession.status === 'pending_manual'"
                class="action-btn primary"
                @click="handleTakeover(sessionStore.currentSession.session_name)"
              >
                接入会话
              </button>
              <button
                v-if="sessionStore.currentSession.status === 'manual_live'"
                class="action-btn secondary"
                @click="openTransferDialog"
              >
                转接
              </button>
              <button
                v-if="sessionStore.currentSession.status === 'manual_live'"
                class="action-btn info"
                @click="openAssistRequestDialog"
                title="请求其他坐席协助"
              >
                请求协助
              </button>
              <button
                v-if="sessionStore.currentSession.status === 'manual_live'"
                class="action-btn danger"
                @click="handleRelease"
              >
                结束服务
              </button>
            </div>
          </div>

          <!-- 聊天历史 -->
          <div ref="chatHistoryRef" class="chat-history">
            <div
              v-for="message in sessionStore.currentSession.history"
              :key="message.id"
              class="message"
              :class="message.role"
            >
              <div v-if="message.role === 'system'" class="system-message">
                {{ message.content }}
              </div>
              <template v-else>
                <div class="message-avatar">
                  {{ message.role === 'user' ? '用' : message.role === 'agent' ? '客' : 'AI' }}
                </div>
                <div class="message-body">
                  <div class="message-header">
                    <span class="message-sender">
                      {{ message.role === 'user' ? '用户' : message.role === 'agent' ? message.agent_name || '客服' : 'AI' }}
                    </span>
                    <span class="message-time">
                      {{ new Date(message.timestamp * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}
                    </span>
                  </div>
                  <div class="message-content">{{ message.content }}</div>
                </div>
              </template>
            </div>
          </div>

          <!-- 聊天输入区域 -->
          <div v-if="sessionStore.currentSession.status === 'manual_live'" class="chat-input-area">
            <!-- 快捷短语面板 -->
            <div v-if="showQuickReplies" class="quick-replies-panel">
              <QuickReplies @select="handleQuickReplySelect" />
            </div>

            <div class="input-wrapper">
              <button
                class="quick-reply-btn"
                @click="showQuickReplies = !showQuickReplies"
                :class="{ active: showQuickReplies }"
                title="快捷短语"
              >
                <span class="btn-icon">📝</span>
              </button>
              <textarea
                v-model="messageInput"
                class="message-input"
                placeholder="输入消息..."
                rows="1"
                @keydown="handleKeyPress"
              ></textarea>
              <button
                class="send-btn"
                :disabled="!messageInput.trim() || isSending"
                @click="handleSendMessage"
              >
                {{ isSending ? '发送中...' : '发送' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：客户信息侧边栏 (v3.2.0+) -->
      <div v-if="sessionStore.currentSession" class="customer-sidebar">
        <div class="sidebar-tabs">
          <button
            :class="['tab-button', { active: currentTab === 'customer' }]"
            @click="currentTab = 'customer'"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            客户信息
          </button>
          <button
            :class="['tab-button', { active: currentTab === 'notes' }]"
            @click="currentTab = 'notes'"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
            </svg>
            内部备注
          </button>
          <button
            :class="['tab-button', { active: currentTab === 'history' }]"
            @click="currentTab = 'history'"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            对话历史
          </button>
        </div>

        <div class="sidebar-content">
          <CustomerProfile
            v-if="currentTab === 'customer'"
            :customer="customerProfile"
            :loading="loadingCustomer"
          />
          <!-- 【模块5】内部备注面板 -->
          <div v-else-if="currentTab === 'notes'" class="notes-panel">
            <div v-if="loadingNotes" class="notes-loading">
              <div class="spinner"></div>
              <p>加载中...</p>
            </div>
            <div v-else class="notes-content">
              <!-- 备注列表 -->
              <div class="notes-list">
                <div v-if="internalNotes.length === 0" class="no-notes">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e0" stroke-width="1.5">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
                  </svg>
                  <p>暂无内部备注</p>
                  <p class="hint">记录客户问题关键点和处理过程</p>
                </div>
                <div v-else>
                  <div
                    v-for="note in internalNotes"
                    :key="note.id"
                    class="note-item"
                  >
                    <div class="note-header">
                      <div class="note-author">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                          <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        {{ note.created_by_name }}
                      </div>
                      <div class="note-time">{{ formatNoteTime(note.created_at) }}</div>
                    </div>
                      <div class="note-content" v-if="editingNoteId !== note.id">
                        {{ note.content }}
                        <div v-if="note.mentions && note.mentions.length" class="note-mentions">
                          <span
                            v-for="mention in note.mentions"
                            :key="mention"
                            class="mention-chip"
                          >
                            @{{ getMentionLabel(mention) }}
                          </span>
                        </div>
                      </div>
                    <div class="note-edit" v-else>
                      <textarea
                        v-model="editingNoteContent"
                        class="note-textarea"
                        rows="3"
                        placeholder="编辑备注内容..."
                      ></textarea>
                      <div class="mention-selector">
                        <div class="selector-header">
                          <span>提醒同事</span>
                          <button
                            type="button"
                            class="btn-text"
                            @click="showEditingMentionSelector = !showEditingMentionSelector"
                          >
                            {{ showEditingMentionSelector ? '收起列表' : '选择@对象' }}
                          </button>
                        </div>
                        <div class="selected-mentions" v-if="editingNoteMentions.length">
                          <span
                            v-for="mention in editingNoteMentions"
                            :key="mention"
                            class="mention-chip removable"
                          >
                            @{{ getMentionLabel(mention) }}
                            <button type="button" class="remove-chip" @click="removeEditingMention(mention)">
                              ×
                            </button>
                          </span>
                        </div>
                        <div v-if="showEditingMentionSelector" class="mention-options">
                          <input
                            v-model="editingMentionSearchKeyword"
                            class="mention-search"
                            type="text"
                            placeholder="搜索坐席姓名或ID"
                          />
                          <div
                            v-for="candidate in filteredEditingMentionCandidates"
                            :key="candidate.username"
                            class="mention-option"
                          >
                            <label>
                              <input
                                type="checkbox"
                                :value="candidate.username"
                                v-model="editingNoteMentions"
                              />
                              <span class="name">{{ candidate.name }}</span>
                              <span class="id">@{{ candidate.username }}</span>
                            </label>
                          </div>
                          <div v-if="!filteredEditingMentionCandidates.length" class="no-mention-result">
                            暂无匹配坐席
                          </div>
                        </div>
                      </div>
                      <div class="note-edit-actions">
                        <button @click="handleCancelEdit" class="btn btn-cancel">取消</button>
                        <button @click="handleSaveEditNote(note.id)" class="btn btn-confirm">保存</button>
                      </div>
                    </div>
                    <div class="note-actions" v-if="editingNoteId !== note.id">
                      <button @click="handleEditNote(note.id, note.content, note.mentions)" class="btn-text">编辑</button>
                      <button @click="handleDeleteNote(note.id)" class="btn-text text-danger">删除</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 添加备注 -->
              <div class="add-note">
                <textarea
                  v-model="newNoteContent"
                  class="note-textarea"
                  rows="3"
                  placeholder="添加内部备注（仅坐席可见）..."
                  :disabled="addingNote"
                ></textarea>
                <div class="mention-selector">
                  <div class="selector-header">
                    <span>提醒同事</span>
                    <button
                      type="button"
                      class="btn-text"
                      @click="showMentionSelector = !showMentionSelector"
                    >
                      {{ showMentionSelector ? '收起列表' : '选择@对象' }}
                    </button>
                  </div>
                  <div class="selected-mentions" v-if="newNoteMentions.length">
                    <span
                      v-for="mention in newNoteMentions"
                      :key="mention"
                      class="mention-chip removable"
                    >
                      @{{ getMentionLabel(mention) }}
                      <button type="button" class="remove-chip" @click="removeNewMention(mention)">×</button>
                    </span>
                  </div>
                  <div v-if="showMentionSelector" class="mention-options">
                    <input
                      v-model="mentionSearchKeyword"
                      class="mention-search"
                      type="text"
                      placeholder="搜索坐席姓名或ID"
                    />
                    <div
                      v-for="candidate in filteredMentionCandidates"
                      :key="candidate.username"
                      class="mention-option"
                    >
                      <label>
                        <input
                          type="checkbox"
                          :value="candidate.username"
                          v-model="newNoteMentions"
                        />
                        <span class="name">{{ candidate.name }}</span>
                        <span class="id">@{{ candidate.username }}</span>
                      </label>
                    </div>
                    <div v-if="!filteredMentionCandidates.length" class="no-mention-result">
                      暂无匹配坐席
                    </div>
                  </div>
                </div>
                <div class="add-note-actions">
                  <button
                    @click="handleAddNote"
                    :disabled="!newNoteContent.trim() || addingNote"
                    class="btn btn-primary"
                  >
                    {{ addingNote ? '添加中...' : '添加备注' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-else-if="currentTab === 'history'" class="history-panel">
            <div v-if="loadingTransferHistory" class="history-loading">
              <div class="spinner"></div>
              <p>正在加载转接历史...</p>
            </div>
            <div v-else-if="transferHistory.length === 0" class="no-history">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e0" stroke-width="1.5">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"></path>
              </svg>
              <p>暂无转接记录</p>
              <p class="hint">转接申请及处理结果将显示在这里</p>
            </div>
            <div v-else class="history-list">
              <div
                v-for="record in transferHistory"
                :key="record.id"
                class="history-item"
                :class="getTransferDecisionClass(record.decision)"
              >
                <div class="history-header">
                  <span class="history-status">{{ getTransferDecisionLabel(record.decision) }}</span>
                  <span class="history-time">{{ formatNoteTime(record.responded_at || record.transferred_at) }}</span>
                </div>
                <div class="history-body">
                  <p class="history-line">
                    <strong>发起：</strong>
                    {{ record.from_agent_name || record.from_agent }} → {{ record.to_agent_name || record.to_agent }}
                  </p>
                  <p class="history-line">
                    <strong>原因：</strong>
                    {{ record.reason }}
                  </p>
                  <p v-if="record.note" class="history-line">
                    <strong>备注：</strong>
                    {{ record.note }}
                  </p>
                  <p v-if="record.response_note" class="history-line">
                    <strong>处理说明：</strong>
                    {{ record.response_note }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 协助中心 -->
    <div v-if="showAssistCenter" class="dialog-overlay">
      <div class="dialog assist-center-dialog">
        <div class="dialog-header">
          <h3>协助中心</h3>
          <button class="dialog-close" @click="closeAssistCenter">&times;</button>
        </div>
        <div class="assist-toolbar">
          <div class="assist-tabs">
            <button
              :class="['assist-tab', { active: assistTab === 'received' }]"
              @click="assistTab = 'received'"
            >
              收到的
            </button>
            <button
              :class="['assist-tab', { active: assistTab === 'sent' }]"
              @click="assistTab = 'sent'"
            >
              我发出的
            </button>
          </div>
          <div class="assist-filter">
            <label>状态</label>
            <select :value="assistFilter" @change="handleAssistFilterChange(($event.target as HTMLSelectElement).value as any)">
              <option value="pending">待处理</option>
              <option value="answered">已回复</option>
              <option value="all">全部</option>
            </select>
          </div>
        </div>
        <div class="assist-content">
          <div v-if="assistLoading" class="loading-hint">
            正在加载协助请求...
          </div>
          <div v-else-if="visibleAssistRequests.length === 0" class="empty-transfer-requests">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e0" stroke-width="1.5">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
            </svg>
            <p>暂无协助请求</p>
          </div>
          <div v-else class="assist-request-list">
            <div
              v-for="request in visibleAssistRequests"
              :key="request.id"
              class="assist-request-item"
            >
              <div class="assist-meta">
                <div class="assist-line">
                  <strong>会话：</strong>{{ request.session_name }}
                </div>
                <div class="assist-line">
                  <strong>{{ assistTab === 'received' ? '来自' : '协助坐席' }}：</strong>
                  {{ assistTab === 'received' ? request.requester : request.assistant }}
                </div>
                <div class="assist-line">
                  <strong>内容：</strong>{{ request.question }}
                </div>
                <div class="assist-time">
                  {{ formatNoteTime(request.created_at) }}
                </div>
                <div class="assist-status">
                  {{ request.status === 'pending' ? '待处理' : '已回复' }}
                </div>
              </div>
              <div v-if="assistTab === 'sent' && request.answer" class="assist-answer">
                <strong>协助回复：</strong>
                <p>{{ request.answer }}</p>
              </div>
              <div v-else-if="assistTab === 'received' && request.status === 'pending'" class="assist-reply">
                <textarea
                  v-model="assistResponseNotes[request.id]"
                  class="form-textarea"
                  rows="2"
                  placeholder="回复协助请求..."
                ></textarea>
                <div class="request-actions">
                  <button
                    class="btn-confirm"
                    :disabled="replyingAssistRequestId === request.id"
                    @click="handleAssistAnswer(request.id)"
                  >
                    {{ replyingAssistRequestId === request.id ? '发送中...' : '发送回复' }}
                  </button>
                </div>
              </div>
              <div v-else-if="assistTab === 'received' && request.status === 'answered'" class="assist-answer">
                <strong>我的回复：</strong>
                <p>{{ request.answer }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 转接对话框 -->
    <div v-if="showTransferDialog" class="dialog-overlay">
      <div class="dialog">
        <div class="dialog-header">
          <h3>转接会话</h3>
          <button class="dialog-close" @click="showTransferDialog = false">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>选择坐席</label>
            <div v-if="loadingAgents" class="loading-hint">
              正在加载坐席列表...
            </div>
            <select v-else v-model="transferTargetId" class="form-select">
              <option value="">请选择...</option>
              <option
                v-for="agent in availableAgents.filter(a => a.id !== agentStore.agentId)"
                :key="agent.id"
                :value="agent.id"
              >
                {{ agent.name }} - {{ getStatusLabel(agent.status) }} ({{ getRoleLabel(agent.role) }})
              </option>
            </select>
          </div>
          <div
            v-if="transferRecommendationLoading || transferRecommendation || transferRecommendationError"
            class="smart-recommendation"
          >
            <div v-if="transferRecommendationLoading" class="smart-recommendation__loading">
              <div class="spinner"></div>
              <span>智能分析中，正在为您匹配最合适的坐席...</span>
            </div>
            <div v-else-if="transferRecommendation" class="smart-recommendation__card">
              <div class="smart-recommendation__header">
                <div>
                  <div class="smart-recommendation__title">
                    推荐坐席：<strong>{{ transferRecommendation.agent_name }}</strong>
                  </div>
                  <p class="smart-recommendation__sub">
                    当前状态：
                    <span v-if="recommendedAgentInfo">
                      {{ getStatusLabel(recommendedAgentInfo.status) }}
                    </span>
                    <span v-else>暂未在线，仍可发送转接请求</span>
                  </p>
                </div>
                <button type="button" class="btn-text" @click="fetchTransferRecommendation">
                  重新计算
                </button>
              </div>
              <p class="smart-recommendation__reason">
                {{ transferRecommendation.reason }}
              </p>
              <div
                v-if="transferRecommendation.matched_tags && transferRecommendation.matched_tags.length"
                class="recommendation-tags"
              >
                <span v-for="tag in transferRecommendation.matched_tags" :key="tag" class="tag-chip">
                  #{{ tag }}
                </span>
              </div>
              <button
                type="button"
                class="btn-link"
                @click="applyTransferRecommendation"
              >
                {{ recommendedAgentInfo ? '一键选择该坐席' : '仍然使用推荐坐席' }}
              </button>
            </div>
            <div v-else class="smart-recommendation__error">
              <div>
                <strong>智能推荐暂不可用</strong>
                <p>{{ transferRecommendationError }}</p>
              </div>
              <button type="button" class="btn-text" @click="fetchTransferRecommendation">
                重试
              </button>
            </div>
          </div>
          <div class="form-group">
            <label>转接类型</label>
            <select v-model="selectedTransferReasonPreset" class="form-select">
              <option v-for="preset in transferReasonPresets" :key="preset.id" :value="preset.id">
                {{ preset.label }}
              </option>
            </select>
            <p class="field-hint">
              {{ selectedTransferReasonPresetInfo?.description || '选择合适的转接类型，目标坐席将看到具体原因' }}
            </p>
          </div>
          <div class="form-group">
            <label>转接原因 <span class="required">*</span></label>
            <textarea
              v-model="transferReason"
              class="form-textarea"
              rows="3"
              placeholder="请详细说明转接原因"
            ></textarea>
          </div>
          <div class="form-group">
            <label>转接备注（可选）</label>
            <textarea
              v-model="transferNote"
              class="form-textarea"
              rows="2"
              placeholder="给目标坐席的补充说明，客户不可见"
            ></textarea>
            <p class="field-hint">补充信息仅目标坐席可见，用于说明当前处理进度或注意事项</p>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-cancel" @click="showTransferDialog = false">取消</button>
          <button
            class="btn-confirm"
            @click="handleTransfer"
            :disabled="!transferTargetId || !transferReason.trim() || transferSubmitting"
          >
            {{ transferSubmitting ? '发送中…' : '确认转接' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 待处理转接请求 -->
    <div v-if="showTransferRequestsPanel" class="dialog-overlay">
      <div class="dialog transfer-requests-dialog">
        <div class="dialog-header">
          <h3>待处理转接请求 ({{ pendingTransferCount }})</h3>
          <button class="dialog-close" @click="closeTransferRequestsPanel">&times;</button>
        </div>
        <div class="dialog-body transfer-requests-body">
          <div v-if="loadingPendingTransfers" class="loading-hint">
            正在获取转接请求...
          </div>
          <div v-else-if="pendingTransferRequests.length === 0" class="empty-transfer-requests">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e0" stroke-width="1.5">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
            </svg>
            <p>暂无待处理的转接请求</p>
          </div>
          <div v-else class="transfer-requests-list">
            <div
              v-for="request in pendingTransferRequests"
              :key="request.id"
              class="transfer-request-item"
            >
              <div class="request-meta">
                <div class="request-session">
                  会话：<span>{{ request.session_name }}</span>
                </div>
                <div class="request-from">
                  来自：<strong>{{ request.from_agent_name || request.from_agent_id }}</strong>
                </div>
                <div class="request-reason">
                  原因：{{ request.reason }}
                </div>
                <div v-if="request.note" class="request-note">
                  备注：{{ request.note }}
                </div>
                <div class="request-time">
                  {{ formatNoteTime(request.created_at) }}
                </div>
              </div>
              <textarea
                v-model="transferResponseNotes[request.id]"
                class="form-textarea"
                rows="2"
                placeholder="回复备注（可选）"
              ></textarea>
              <div class="request-actions">
                <button
                  class="btn-cancel"
                  :disabled="respondingTransferRequestId === request.id"
                  @click="handleTransferRequestResponse(request.id, 'decline')"
                >
                  {{ respondingTransferRequestId === request.id ? '处理中...' : '拒绝' }}
                </button>
                <button
                  class="btn-confirm"
                  :disabled="respondingTransferRequestId === request.id"
                  @click="handleTransferRequestResponse(request.id, 'accept')"
                >
                  {{ respondingTransferRequestId === request.id ? '处理中...' : '接受' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 【模块6】快捷键帮助面板 -->
    <KeyboardShortcutsHelp v-if="showShortcutsHelp" @close="showShortcutsHelp = false" />

    <!-- 【模块5】协助请求对话框 -->
    <AssistRequestDialog
      :visible="showAssistRequestDialog"
      :session-name="sessionStore.currentSession?.session_name || ''"
      :available-agents="assistRequestOptions"
      @close="showAssistRequestDialog = false"
      @submit="handleAssistRequest"
    />

    <!-- 【模块6.2.2】消息提醒设置对话框 -->
    <NotificationSettingsDialog :visible="showNotificationSettings" @close="showNotificationSettings = false" />

    <!-- 【模块6.2.4】个性化设置对话框 -->
    <PersonalizationSettingsDialog
      :visible="showPersonalizationSettings"
      @close="showPersonalizationSettings = false"
    />
  </div>
</template>

<style scoped>
/* ========== 整体布局 ========== */
/* 参考拼多多商家工作台、千牛等专业客服系统 */
.dashboard-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--agent-body-bg, #F7F8FA);
  font-size: calc(14px * var(--agent-font-scale, 1));
  color: var(--agent-text-color, #262626);
}

/* ========== 头部样式 - 专业简约风格 ========== */
.dashboard-header {
  background: var(--agent-secondary-bg, #FFFFFF);
  padding: 14px 28px;
  border-bottom: 1px solid var(--agent-border-color, #E8E8E8);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  box-shadow: var(--agent-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
  position: relative;
  z-index: 10;
  height: var(--header-height, 60px);
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 200px;
}

.brand-logo-img {
  height: 32px;
  width: auto;
  filter: var(--agent-logo-filter, none);
}

.dashboard-container.theme-dark .brand-logo-img {
  filter: var(--agent-logo-filter-dark, brightness(0) invert(1));
}

.brand-text h1 {
  font-size: 18px;
  font-weight: 600;
  color: var(--agent-text-color, #262626);
  margin: 0;
  line-height: 1.3;
  letter-spacing: -0.3px;
}

.brand-subtitle {
  font-size: 11px;
  color: var(--agent-text-tertiary, #8C8C8C);
  display: block;
  margin-top: 3px;
  font-weight: 400;
}

.agent-info {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-grow: 1; /* Allow agent info to take up available space */
  justify-content: flex-end;
}

.agent-meta {
  display: flex;
  align-items: center;
  gap: 20px;
}

.agent-status-card {
  background: #FFFFFF;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  padding: 10px 16px;
  min-width: 200px;
  position: relative;
  color: #1F2937;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.status-trigger {
  width: 100%;
  background: transparent;
  border: none;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  cursor: pointer;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
}

.status-trigger svg {
  width: 14px;
  height: 14px;
  transition: transform 0.2s ease;
}

.status-trigger[aria-expanded="true"] svg {
  transform: rotate(180deg);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.online {
  background: #28a745; /* Green */
}

.status-dot.busy {
  background: #ffc107; /* Yellow */
}

.status-dot.break,
.status-dot.lunch {
  background: #fd7e14; /* Orange */
}

.status-dot.training {
  background: #007bff; /* Blue */
}

.status-dot.offline {
  background: #6c757d; /* Gray */
}

.status-text {
  font-size: 14px;
  font-weight: 600;
}

.status-updated {
  font-size: 11px;
  color: var(--agent-text-light);
}

.status-note-text {
  margin-top: 6px;
  font-size: 12px;
  color: var(--agent-text-light);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 280px;
  background: var(--agent-secondary-bg);
  border: 1px solid var(--agent-border-color);
  border-radius: var(--agent-border-radius);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 10px;
  z-index: 20;
}

.status-option {
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 4px;
  cursor: pointer;
  transition: background 0.2s;
  color: var(--agent-text-color);
}

.status-option:hover {
  background: rgba(var(--agent-primary-color-rgb), 0.1);
}

.status-option.active {
  background: rgba(var(--agent-primary-color-rgb), 0.15);
  color: var(--agent-primary-color);
  font-weight: 600;
}

.option-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}

.option-desc {
  font-size: 11px;
  color: var(--agent-text-light);
  margin-top: 2px;
}

.status-note-editor {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--agent-border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-note-editor textarea {
  width: 100%;
  border-radius: 6px;
  border: 1px solid var(--agent-border-color);
  background: var(--agent-body-bg);
  color: var(--agent-text-color);
  padding: 8px;
  font-size: 13px;
  resize: vertical;
  min-height: 50px;
}

.status-note-editor textarea:focus {
  outline: none;
  border-color: var(--agent-primary-color);
}

.status-save-button {
  align-self: flex-end;
  padding: 4px 12px;
  border-radius: 4px;
  border: none;
  background: var(--agent-primary-color);
  color: white;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  font-size: 12px;
}

.status-save-button:hover:not(:disabled) {
  background: var(--agent-primary-hover);
}

.status-save-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.agent-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--agent-text-color);
}

.agent-name {
  font-size: 15px;
  font-weight: 600;
}

.agent-id {
  font-size: 12px;
  color: var(--agent-text-light);
}

.agent-work-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  color: var(--agent-text-color, #262626);
}

.work-stat {
  background: var(--agent-body-bg, #F7F8FA);
  border: 1px solid var(--agent-border-color, #E8E8E8);
  border-radius: var(--agent-border-radius, 6px);
  padding: 10px 12px;
  text-align: center;
  box-shadow: none;
  transition: all var(--transition-fast, 0.15s ease);
}

.work-stat:hover {
  background: var(--agent-hover-bg, #F3F4F6);
  border-color: var(--agent-primary-color, #1890FF);
  box-shadow: var(--agent-shadow-hover, 0 4px 16px rgba(24, 144, 255, 0.12));
}

.work-stat-label {
  font-size: 11px;
  color: var(--agent-text-tertiary, #8C8C8C);
  margin-bottom: 4px;
  display: block;
  font-weight: 500;
}

.work-stat-value {
  font-size: 16px;
  font-weight: 600;
  display: block;
  color: var(--agent-text-color, #262626);
}

.agent-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-actions button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--agent-border-radius, 6px);
  font-size: 13px;
  font-weight: 500;
  transition: all var(--transition-fast, 0.15s ease);
  border: 1px solid var(--agent-border-color, #E8E8E8);
  background: var(--agent-secondary-bg, #FFFFFF);
  color: var(--agent-text-color, #262626);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  position: relative;
  white-space: nowrap;
}

.agent-actions button:hover {
  background: var(--agent-primary-light, #E6F7FF);
  border-color: var(--agent-primary-color, #1890FF);
  color: var(--agent-primary-color, #1890FF);
  box-shadow: 0 2px 6px rgba(24, 144, 255, 0.12);
}

.agent-actions button:active {
  transform: translateY(1px);
  box-shadow: 0 1px 2px rgba(24, 144, 255, 0.1);
}

.agent-actions button svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  flex-shrink: 0;
}

/* 退出登录按钮特殊样式 */
.agent-actions button:last-child {
  background: transparent;
  border-color: transparent;
  color: var(--agent-text-tertiary, #8C8C8C);
  box-shadow: none;
}

.agent-actions button:last-child:hover {
  background: var(--agent-danger-light, #FFF2F0);
  border-color: var(--agent-danger, #FF4D4F);
  color: var(--agent-danger, #FF4D4F);
  box-shadow: none;
}

.admin-dropdown .admin-menu-button {
  background: linear-gradient(135deg, var(--agent-primary-color, #1890FF) 0%, var(--agent-primary-hover, #40A9FF) 100%);
  color: white;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(24, 144, 255, 0.25);
}

.admin-dropdown .admin-menu-button:hover {
  box-shadow: 0 4px 10px rgba(24, 144, 255, 0.35);
  transform: translateY(-1px);
}

.pending-badge,
.unread-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: linear-gradient(135deg, #FF4D4F 0%, #FF7875 100%);
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
  box-shadow: 0 2px 4px rgba(255, 77, 79, 0.3);
  border: 2px solid var(--agent-secondary-bg, #FFFFFF);
}

.pending-badge {
  background: #f97316; /* Orange for pending items */
}

/* Main Content Area */
.dashboard-body {
  flex-grow: 1;
  display: flex;
  overflow: hidden;
}

/* Sessions Panel */
.sessions-panel {
  flex-shrink: 0;
  width: 320px; /* Adjusted width */
  border-right: 1px solid var(--agent-border-color);
  background: var(--agent-secondary-bg);
  display: flex;
  flex-direction: column;
  overflow: hidden; /* Important: content inside will scroll */
}

.session-list-component {
  flex-grow: 1; /* Allow the list to take remaining space */
  overflow-y: auto; /* Make the list itself scrollable */
  border-top: 1px solid var(--agent-border-color);
}

/* ========== 统计面板 ========== */
.stats-bar {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 10px 14px;
  gap: 8px;
  border-bottom: 1px solid var(--agent-border-color, #E8E8E8);
  background: var(--agent-body-bg, #F7F8FA);
}

.stat-item {
  text-align: center;
  padding: 10px 6px;
  border-radius: var(--agent-border-radius, 6px);
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
  border: 1px solid var(--agent-border-color, #E8E8E8);
  background: var(--agent-secondary-bg, #FFFFFF);
  box-shadow: var(--agent-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
}

.stat-item:hover {
  border-color: var(--agent-primary-color, #1890FF);
  box-shadow: var(--agent-shadow-hover, 0 4px 16px rgba(24, 144, 255, 0.12));
  transform: translateY(-1px);
}

.stat-item.pending {
  background: var(--agent-warning-light, #FFFBE6);
  border-color: var(--agent-warning-border, #FFE58F);
}

.stat-item.live {
  background: var(--agent-success-light, #F6FFED);
  border-color: var(--agent-success-border, #B7EB8F);
}

.stat-item.all {
  background: var(--agent-body-bg, #F7F8FA);
  border-color: var(--agent-border-color, #E8E8E8);
}

.stat-value {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: var(--agent-text-color, #262626);
  margin-bottom: 2px;
}

.stat-label {
  font-size: 10px;
  color: var(--agent-text-tertiary, #8C8C8C);
  font-weight: 500;
}

.detailed-stats {
  display: flex;
  padding: 10px 16px;
  gap: 16px;
  border-bottom: 1px solid var(--agent-border-color, #E8E8E8);
  background: var(--agent-secondary-bg, #FFFFFF);
}

.detail-stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.detail-label {
  font-size: 11px;
  color: var(--agent-text-tertiary, #8C8C8C);
  font-weight: 500;
}

.detail-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--agent-primary-color, #1890FF);
}

.work-summary-card {
  margin: 14px;
  background: var(--agent-secondary-bg, #FFFFFF);
  border: 1px solid var(--agent-border-color, #E8E8E8);
  border-radius: var(--agent-border-radius-lg, 8px);
  padding: 14px;
  box-shadow: var(--agent-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
}

.work-summary-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  font-size: 13px;
  color: var(--agent-text-color, #262626);
  margin-bottom: 12px;
}

.work-summary-refresh {
  border: none;
  background: var(--agent-primary-light, #E6F7FF);
  color: var(--agent-primary-color, #1890FF);
  font-size: 11px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 12px;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.work-summary-refresh:hover {
  background: var(--agent-primary-color, #1890FF);
  color: white;
}

.work-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.summary-item {
  padding: 12px 14px;
  border-radius: var(--agent-border-radius, 6px);
  border: 1px solid var(--agent-border-color, #E8E8E8);
  background: var(--agent-body-bg, #F7F8FA);
  transition: all var(--transition-fast, 0.15s ease);
}

.summary-item:hover {
  border-color: var(--agent-primary-color, #1890FF);
  background: var(--agent-primary-light, #E6F7FF);
}

.summary-label {
  font-size: 11px;
  color: var(--agent-text-tertiary, #8C8C8C);
  margin-bottom: 4px;
  display: block;
}

.summary-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--agent-text-color);
}

.queue-stats {
  padding: 10px 16px;
  border-bottom: 1px solid var(--agent-border-color);
  background: linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%);
  color: #92400e;
}

.dashboard-container.theme-dark .queue-stats {
  background: linear-gradient(135deg, #3d2e00 0%, #4a3800 100%);
  color: #fcd34d;
}

.queue-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.queue-icon {
  font-size: 15px;
}

.queue-title {
  font-size: 13px;
  font-weight: 600;
}

.queue-count {
  margin-left: auto;
  padding: 1px 7px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  color: #d97706;
}

.dashboard-container.theme-dark .queue-count {
  background: rgba(0, 0, 0, 0.4);
  color: #fcd34d;
}

.queue-metrics {
  display: flex;
  gap: 10px;
}

.queue-metric {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 5px;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 5px;
}

.dashboard-container.theme-dark .queue-metric {
  background: rgba(0, 0, 0, 0.3);
}

.metric-icon {
  font-size: 15px;
  margin-bottom: 1px;
}

.metric-label {
  font-size: 9px;
  margin-bottom: 1px;
}

.metric-value {
  font-size: 13px;
  font-weight: 700;
}

.filter-tabs {
  display: flex;
  padding: 8px 16px;
  gap: 6px;
  border-bottom: 1px solid var(--agent-border-color);
  background: var(--agent-secondary-bg);
}

.filter-tab {
  flex: 1;
  padding: 6px 0;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 13px;
  color: var(--agent-text-light);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-tab.active {
  color: var(--agent-primary-color);
  border-bottom-color: var(--agent-primary-color);
}

.filter-tab:hover:not(.active) {
  color: var(--agent-primary-color);
}

.advanced-filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--agent-border-color);
  background: var(--agent-secondary-bg);
  align-items: end;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-group label {
  font-size: 12px;
  color: var(--agent-text-light);
}

.filter-select {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--agent-border-color);
  border-radius: var(--agent-border-radius-sm, 4px);
  font-size: 12px;
  color: var(--agent-text-color);
  background: var(--agent-body-bg);
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-select:hover {
  border-color: var(--agent-primary-color);
}

.filter-select:focus {
  outline: none;
  border-color: var(--agent-primary-color);
  background: var(--agent-secondary-bg);
}

.filter-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--agent-border-color);
  border-radius: 4px;
  font-size: 12px;
  color: var(--agent-text-color);
  background: var(--agent-body-bg);
}

.custom-time-inputs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 6px;
}

.clear-filters-btn {
  align-self: flex-start;
  padding: 6px 12px;
  border: 1px solid var(--agent-border-color);
  background: transparent;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-filters-btn:hover {
  border-color: var(--agent-primary-color);
  color: var(--agent-primary-color);
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 16px;
  background: var(--agent-secondary-bg);
  border-bottom: 1px solid var(--agent-border-color);
}

.filter-chip {
  background: rgba(59, 130, 246, 0.1);
  color: var(--agent-primary-color);
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
}

.queue-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.queue-item {
  padding: 10px 12px;
  border: 1px solid var(--agent-border-color);
  border-radius: 8px;
  background: var(--agent-body-bg);
}

.queue-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.queue-item-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--agent-text-color);
}

.queue-position {
  font-size: 12px;
  color: var(--agent-text-light);
}

.queue-item-body {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--agent-text-light);
}

.queue-priority {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}

.priority-urgent {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}

.priority-high {
  background: rgba(249, 115, 22, 0.15);
  color: #ea580c;
}

.priority-normal {
  background: rgba(148, 163, 184, 0.2);
  color: var(--agent-text-light);
}

.queue-vip {
  font-size: 12px;
  color: #f59e0b;
}

.queue-empty {
  margin-top: 8px;
  font-size: 12px;
  color: var(--agent-text-light);
}

.search-box {
  padding: 10px 16px;
  position: relative;
  background: var(--agent-secondary-bg);
  border-bottom: 1px solid var(--agent-border-color);
}

.search-box .search-input {
  width: 100%;
  padding: 8px 32px 8px 12px; /* Adjust padding for clear button */
  border: 1px solid var(--agent-border-color);
  border-radius: var(--agent-border-radius-sm, 4px);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s ease;
  background: var(--agent-body-bg);
  color: var(--agent-text-color);
}

.search-box .search-input:focus {
  border-color: var(--agent-primary-color);
  background: var(--agent-secondary-bg);
}

.search-clear {
  position: absolute;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--agent-text-light);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.search-clear:hover {
  color: var(--agent-text-color);
}

/* Chat Panel */
.chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--agent-secondary-bg);
  overflow: hidden;
}

.no-session {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--agent-text-light);
}

.no-session-icon {
  font-size: 56px;
  margin-bottom: 12px;
}

.no-session p {
  font-size: 15px;
  margin-bottom: 6px;
}

.no-session .hint {
  font-size: 12px;
  color: var(--agent-text-light);
}

.manual-history-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.placeholder-card {
  background: var(--agent-body-bg);
  border: 1px dashed var(--agent-border-color);
  border-radius: var(--agent-border-radius);
  padding: 24px;
  text-align: center;
  max-width: 380px;
  box-shadow: var(--agent-shadow);
  color: var(--agent-text-color);
}

.placeholder-icon {
  font-size: 40px;
  margin-bottom: 10px;
}

.placeholder-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 6px;
}

.placeholder-desc {
  font-size: 13px;
  color: var(--agent-text-light);
  margin-bottom: 14px;
}

.manual-history-placeholder .primary-btn {
  padding: 8px 14px;
  background: var(--agent-primary-color);
  color: white;
  border-radius: 6px;
  font-weight: 500;
}

.manual-history-placeholder .primary-btn:hover:not(:disabled) {
  background: var(--agent-primary-hover);
}

.session-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-header {
  padding: 12px 20px;
  border-bottom: 1px solid var(--agent-border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--agent-secondary-bg);
  flex-shrink: 0;
  min-height: 60px;
  position: relative;
  z-index: 10;
}

.detail-user {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  max-width: 50%;
  overflow: hidden;
}

.detail-user .user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #a78bfa; /* Light purple */
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-info .user-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--agent-text-color);
}

.session-status {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  font-weight: 500;
}

.status-pending_manual {
  background: #fef3c7;
  color: #d97706;
}

.status-manual_live {
  background: #dbeafe;
  color: #2563eb;
}

.status-bot_active {
  background: #d1fae5;
  color: #059669;
}

.detail-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  position: relative;
  z-index: 5;
}

.action-btn {
  padding: 8px 14px;
  border: 1px solid var(--agent-border-color);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--agent-body-bg);
  color: var(--agent-text-color);
  line-height: 1.2;
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover {
  background: rgba(var(--agent-primary-color-rgb), 0.1);
  border-color: var(--agent-primary-color);
  color: var(--agent-primary-color);
}

.action-btn.primary {
  background: var(--agent-primary-color);
  color: white;
  border-color: var(--agent-primary-color);
}

.action-btn.primary:hover {
  background: var(--agent-primary-hover);
  border-color: var(--agent-primary-hover);
  color: white;
}

.action-btn.danger {
  background: #ef4444; /* Red */
  color: white;
  border-color: #ef4444;
}

.action-btn.danger:hover {
  background: #dc2626;
  border-color: #dc2626;
  color: white;
}

.action-btn.secondary {
  background: #e5e7eb; /* Gray */
  color: #374151;
  border-color: #e5e7eb;
}

.action-btn.secondary:hover {
  background: #d1d5db;
  border-color: #d1d5db;
  color: #1f2937;
}

.action-btn.info {
  background: #bfdbfe; /* Light blue */
  color: #1e40af;
  border-color: #bfdbfe;
}

.action-btn.info:hover {
  background: #93c5fd;
  border-color: #93c5fd;
  color: #1e40af;
}

/* ========== 聊天历史区域 ========== */
.chat-history {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  background: var(--agent-body-bg, #F7F8FA);
  position: relative;
  z-index: 1;
}

/* ========== 消息样式 ========== */
.message {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  align-items: flex-start;
}

.message.user {
  flex-direction: row-reverse;
}

.message.system {
  justify-content: center;
  text-align: center;
}

.system-message {
  padding: 6px 14px;
  background: var(--agent-border-color-light, #F0F0F0);
  border-radius: 14px;
  font-size: 11px;
  color: var(--agent-text-tertiary, #8C8C8C);
  max-width: 70%;
}

/* 消息头像 */
.message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
  color: white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.message.user .message-avatar {
  background: linear-gradient(135deg, #B37FEB 0%, #9254DE 100%);
}

.message.assistant .message-avatar {
  background: linear-gradient(135deg, #95DE64 0%, #52C41A 100%);
}

.message.agent .message-avatar {
  background: linear-gradient(135deg, var(--agent-primary-hover, #40A9FF) 0%, var(--agent-primary-color, #1890FF) 100%);
}

/* 消息主体 */
.message-body {
  max-width: 65%;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.message.user .message-body {
  align-items: flex-end;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.message.user .message-header {
  flex-direction: row-reverse;
}

.message-sender {
  font-size: 12px;
  font-weight: 600;
  color: var(--agent-text-color, #262626);
}

.message-time {
  font-size: 10px;
  color: var(--agent-text-tertiary, #8C8C8C);
}

/* 消息气泡 */
.message-content {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
  box-shadow: var(--agent-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
}

.dashboard-container.bubble-flat .message .message-content {
  border-radius: 6px;
}

.dashboard-container.bubble-rounded .message .message-content {
  border-radius: 18px;
}

/* 用户消息 - 蓝色渐变 */
.message.user .message-content {
  background: linear-gradient(135deg, var(--agent-primary-color, #1890FF) 0%, var(--agent-primary-hover, #40A9FF) 100%);
  color: white;
  border-bottom-right-radius: 4px;
}

/* AI助手消息 - 白色卡片 */
.message.assistant .message-content {
  background: var(--agent-secondary-bg, #FFFFFF);
  color: var(--agent-text-color, #262626);
  border: 1px solid var(--agent-border-color, #E8E8E8);
  border-bottom-left-radius: 4px;
}

/* 坐席消息 - 淡蓝卡片 */
.message.agent .message-content {
  background: var(--agent-primary-light, #E6F7FF);
  color: var(--agent-primary-dark, #0050B3);
  border-bottom-left-radius: 4px;
  border: 1px solid rgba(24, 144, 255, 0.2);
}

/* 深色模式适配 */
.dashboard-container.theme-dark .message.user .message-content {
  background: linear-gradient(135deg, var(--agent-primary-hover, #40A9FF) 0%, var(--agent-primary-color, #1890FF) 100%);
}

.dashboard-container.theme-dark .message.assistant .message-content {
  background: var(--agent-secondary-bg);
  border-color: var(--agent-border-color);
  color: var(--agent-text-color);
}

.dashboard-container.theme-dark .message.agent .message-content {
  background: #1e3a5f;
  color: #bfdbfe;
  border-color: #3b82f6;
}

/* ========== 聊天输入区域 ========== */
.chat-input-area {
  padding: 14px 20px;
  border-top: 1px solid var(--agent-border-color, #E8E8E8);
  background: var(--agent-secondary-bg, #FFFFFF);
  position: relative;
  flex-shrink: 0;
}

.quick-replies-panel {
  position: absolute;
  bottom: 100%;
  left: 20px;
  right: 20px;
  margin-bottom: 8px;
  z-index: 10;
  box-shadow: var(--agent-shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.10));
  border-radius: var(--agent-border-radius-lg, 8px);
  overflow: hidden;
  max-height: 300px;
  display: flex;
  flex-direction: column;
}

.input-wrapper {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

/* 快捷回复按钮 */
.quick-reply-btn {
  width: 40px;
  height: 40px;
  border: 1px solid var(--agent-border-color, #E8E8E8);
  border-radius: var(--agent-border-radius, 6px);
  background: var(--agent-body-bg, #F7F8FA);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast, 0.15s ease);
  flex-shrink: 0;
  color: var(--agent-text-secondary, #595959);
}

.quick-reply-btn:hover {
  border-color: var(--agent-primary-color, #1890FF);
  background: var(--agent-primary-light, #E6F7FF);
  color: var(--agent-primary-color, #1890FF);
}

.quick-reply-btn.active {
  border-color: var(--agent-primary-color, #1890FF);
  background: var(--agent-primary-color, #1890FF);
  color: white;
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.3);
}

.quick-reply-btn.active .btn-icon {
  filter: brightness(0) invert(1);
}

.btn-icon {
  font-size: 16px;
}

/* 消息输入框 */
.message-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--agent-border-color, #E8E8E8);
  border-radius: var(--agent-border-radius, 6px);
  font-size: 14px;
  resize: none;
  min-height: 40px;
  max-height: 100px;
  font-family: inherit;
  background: var(--agent-secondary-bg, #FFFFFF);
  color: var(--agent-text-color, #262626);
  transition: all var(--transition-fast, 0.15s ease);
}

.message-input::placeholder {
  color: var(--agent-text-placeholder, #BFBFBF);
}

.message-input:hover {
  border-color: var(--agent-border-color-dark, #D9D9D9);
}

.message-input:focus {
  outline: none;
  border-color: var(--agent-primary-color, #1890FF);
  box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
}

/* 发送按钮 */
.send-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, var(--agent-primary-color, #1890FF) 0%, var(--agent-primary-hover, #40A9FF) 100%);
  color: white;
  border: none;
  border-radius: var(--agent-border-radius, 6px);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.25);
}

.send-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.35);
}

.send-btn:active:not(:disabled) {
  transform: translateY(0);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

/* ========== 右侧客户边栏 ========== */
.customer-sidebar {
  width: var(--details-width, 340px);
  background: var(--agent-secondary-bg, #FFFFFF);
  border-left: 1px solid var(--agent-border-color, #E8E8E8);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow-y: auto;
  position: relative;
  z-index: 5;
}

/* 标签页导航 */
.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid var(--agent-border-color, #E8E8E8);
  background: var(--agent-body-bg, #F7F8FA);
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}

.tab-button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 12px 12px;
  border: none;
  background: transparent;
  color: var(--agent-text-tertiary, #8C8C8C);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
  position: relative;
}

.tab-button svg {
  width: 15px;
  height: 15px;
  transition: all var(--transition-fast, 0.15s ease);
  stroke: currentColor;
}

.tab-button:hover {
  background: rgba(24, 144, 255, 0.05);
  color: var(--agent-text-color, #262626);
}

.tab-button.active {
  color: var(--agent-primary-color, #1890FF);
  background: var(--agent-secondary-bg, #FFFFFF);
}

.tab-button.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--agent-primary-color, #1890FF);
}

/* 边栏内容区 */
.sidebar-content {
  flex: 1;
  overflow-y: auto;
  background: var(--agent-body-bg, #F7F8FA);
  padding: 14px;
  position: relative;
  z-index: 1;
}

.history-panel,
.notes-panel {
  height: 100%; /* Ensure panels take full height */
  display: flex;
  flex-direction: column;
}

.history-loading,
.no-history,
.notes-loading,
.no-notes {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--agent-text-light);
  text-align: center;
  gap: 8px;
  padding: 20px;
}

.history-loading .spinner,
.notes-loading .spinner {
  margin-bottom: 12px;
}

.history-list,
.notes-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 16px; /* Add some padding at the bottom */
}

.note-mentions {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mention-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: #eef2ff;
  color: #4338ca;
  border-radius: 999px;
  font-size: 12px;
}

.mention-chip.removable {
  background: #dbeafe;
  color: #1d4ed8;
}

.mention-chip .remove-chip {
  margin-left: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
  font-size: 12px;
}

.mention-selector {
  margin-top: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mention-selector .selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #475569;
}

.mention-selector .selected-mentions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mention-options {
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mention-option label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #334155;
}

.mention-option .id {
  font-size: 12px;
  color: #94a3b8;
}

.mention-search {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #cbd5f5;
  border-radius: 6px;
  font-size: 13px;
}

.no-mention-result {
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
  padding: 8px 0;
}

.no-history svg,
.no-notes svg {
  width: 40px;
  height: 40px;
  stroke: var(--agent-border-color);
  margin-bottom: 12px;
}

.no-history p,
.no-notes p {
  margin: 0;
  font-size: 14px;
}

.no-history .hint,
.no-notes .hint {
  font-size: 12px;
  color: var(--agent-text-light);
}

.history-item,
.note-item {
  background: var(--agent-secondary-bg);
  border: 1px solid var(--agent-border-color);
  border-radius: var(--agent-border-radius-lg, 8px);
  padding: 14px;
  box-shadow: var(--agent-shadow-sm, 0 1px 2px 0 rgba(0,0,0,0.05));
  transition: all var(--transition-fast, 0.15s ease);
}

.history-item:hover,
.note-item:hover {
  border-color: var(--agent-primary-color, #1890FF);
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.1);
  transform: translateY(-1px);
}

.history-header,
.note-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.history-status,
.note-author {
  font-size: 13px;
  font-weight: 600;
  color: var(--agent-text-color);
  display: flex;
  align-items: center;
  gap: 6px;
}

.note-author svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
}

.history-time,
.note-time {
  font-size: 11px;
  color: var(--agent-text-light);
}

.history-body,
.note-content {
  font-size: 13px;
  color: var(--agent-text-color);
  line-height: 1.5;
}

.history-line strong {
  color: var(--agent-text-color);
}

.history-accepted {
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.history-accepted .history-status {
  color: #16a34a;
}

.history-declined {
  border-color: #fecaca;
  background: #fff1f2;
}

.history-declined .history-status {
  color: #dc2626;
}

.history-expired {
  border-color: #fde68a;
  background: #fffbeb;
}

.history-expired .history-status {
  color: #d97706;
}

.note-edit {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--agent-border-color, #E8E8E8);
}

.note-edit-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  justify-content: flex-end;
}

.note-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--agent-border-color-light, #F0F0F0);
}

.add-note {
  border-top: 1px solid var(--agent-border-color);
  padding: 16px;
  background: var(--agent-secondary-bg);
  flex-shrink: 0;
  border-radius: 0 0 var(--agent-border-radius-lg, 8px) var(--agent-border-radius-lg, 8px);
}

.notes-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.notes-content .notes-list {
  flex: 1;
  overflow-y: auto;
}

.note-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--agent-border-color);
  border-radius: var(--agent-border-radius, 6px);
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  min-height: 70px;
  font-family: inherit;
  background: var(--agent-body-bg);
  color: var(--agent-text-color);
  transition: all var(--transition-fast, 0.15s ease);
}

.note-textarea::placeholder {
  color: var(--agent-text-placeholder, #BFBFBF);
}

.note-textarea:hover {
  border-color: var(--agent-border-color-dark, #D9D9D9);
}

.note-textarea:focus {
  outline: none;
  border-color: var(--agent-primary-color);
  box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
}

.note-textarea:disabled {
  background: var(--agent-body-bg);
  cursor: not-allowed;
  opacity: 0.7;
}

.add-note-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.add-note-actions .btn-primary {
  padding: 8px 16px;
  background: linear-gradient(135deg, var(--agent-primary-color, #1890FF) 0%, var(--agent-primary-hover, #40A9FF) 100%);
  color: white;
  border: none;
  border-radius: var(--agent-border-radius, 6px);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
  box-shadow: 0 2px 6px rgba(24, 144, 255, 0.25);
}

.add-note-actions .btn-primary:hover:not(:disabled) {
  box-shadow: 0 4px 10px rgba(24, 144, 255, 0.35);
  transform: translateY(-1px);
}

.add-note-actions .btn-primary:disabled {
  background: var(--agent-text-placeholder, #BFBFBF);
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

.btn-text {
  background: none;
  border: none;
  padding: 5px 10px;
  font-size: 12px;
  color: var(--agent-primary-color);
  cursor: pointer;
  border-radius: var(--agent-border-radius-sm, 4px);
  transition: all var(--transition-fast, 0.15s ease);
  font-weight: 500;
}

.btn-text:hover {
  background: var(--agent-primary-light, #E6F7FF);
}

.btn-text.text-danger {
  color: var(--agent-danger, #FF4D4F);
}

.btn-text.text-danger:hover {
  background: var(--agent-danger-light, #FFF2F0);
}

.btn-cancel {
  padding: 6px 14px;
  font-size: 13px;
  border: 1px solid var(--agent-border-color);
  background: var(--agent-body-bg);
  color: var(--agent-text-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: var(--agent-border-color);
}

.btn-confirm {
  padding: 6px 14px;
  background: var(--agent-primary-color);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-confirm:hover:not(:disabled) {
  background: var(--agent-primary-hover);
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ========== 对话框样式 ========== */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.dialog {
  background: var(--agent-secondary-bg, #FFFFFF);
  border-radius: var(--agent-border-radius-xl, 12px);
  width: 480px;
  max-width: 90vw;
  max-height: 85vh;
  box-shadow: var(--agent-shadow-xl, 0 12px 32px rgba(0, 0, 0, 0.12));
  color: var(--agent-text-color);
  display: flex;
  flex-direction: column;
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

.dialog-header {
  padding: 18px 20px;
  border-bottom: 1px solid var(--agent-border-color, #E8E8E8);
  background: var(--agent-body-bg, #F7F8FA);
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 12px 12px 0 0;
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--agent-text-color, #262626);
}

.dialog-close {
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

.dialog-close:hover {
  background: var(--agent-hover-bg, #F3F4F6);
  color: var(--agent-text-color, #262626);
}

.dialog-body {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
}

.form-group {
  margin-bottom: 18px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--agent-text-color, #262626);
  margin-bottom: 8px;
}

.form-group label .required {
  color: var(--agent-danger, #FF4D4F);
  margin-left: 2px;
}

.form-select,
.form-input,
.form-textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--agent-border-color, #E8E8E8);
  border-radius: var(--agent-border-radius, 6px);
  font-size: 14px;
  outline: none;
  transition: all var(--transition-fast, 0.15s ease);
  background: var(--agent-secondary-bg, #FFFFFF);
  color: var(--agent-text-color, #262626);
}

.form-select:hover,
.form-input:hover,
.form-textarea:hover {
  border-color: var(--agent-border-color-dark, #D9D9D9);
}

.form-select:focus,
.form-input:focus,
.form-textarea:focus {
  border-color: var(--agent-primary-color, #1890FF);
  box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
}

.field-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--agent-text-tertiary, #8C8C8C);
}

.dialog-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--agent-border-color, #E8E8E8);
  background: var(--agent-body-bg, #F7F8FA);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-radius: 0 0 12px 12px;
}

/* 对话框按钮样式 */
.btn-cancel,
.btn-confirm {
  padding: 8px 18px;
  border-radius: var(--agent-border-radius, 6px);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
  border: none;
}

.btn-cancel {
  background: var(--agent-secondary-bg, #FFFFFF);
  color: var(--agent-text-color, #262626);
  border: 1px solid var(--agent-border-color, #E8E8E8);
}

.btn-cancel:hover {
  border-color: var(--agent-primary-color, #1890FF);
  color: var(--agent-primary-color, #1890FF);
}

.btn-confirm {
  background: linear-gradient(135deg, var(--agent-primary-color, #1890FF) 0%, var(--agent-primary-hover, #40A9FF) 100%);
  color: white;
  box-shadow: 0 2px 6px rgba(24, 144, 255, 0.25);
}

.btn-confirm:hover:not(:disabled) {
  box-shadow: 0 4px 10px rgba(24, 144, 255, 0.35);
  transform: translateY(-1px);
}

.btn-confirm:disabled {
  background: var(--agent-text-placeholder, #BFBFBF);
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

.transfer-requests-dialog,
.assist-center-dialog {
  width: 640px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.transfer-requests-body,
.assist-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: var(--agent-body-bg, #F7F8FA);
}

.loading-hint {
  text-align: center;
  color: var(--agent-text-tertiary, #8C8C8C);
  padding: 40px 20px;
  font-size: 14px;
}

.empty-transfer-requests {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--agent-text-tertiary, #8C8C8C);
}

.empty-transfer-requests svg {
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-transfer-requests p {
  font-size: 14px;
  margin: 0;
}

.transfer-requests-list,
.assist-request-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.transfer-request-item,
.assist-request-item {
  border: 1px solid var(--agent-border-color, #E8E8E8);
  border-radius: var(--agent-border-radius-lg, 8px);
  padding: 16px;
  background: var(--agent-secondary-bg, #FFFFFF);
  box-shadow: var(--agent-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
  transition: all var(--transition-fast, 0.15s ease);
}

.transfer-request-item:hover,
.assist-request-item:hover {
  border-color: var(--agent-primary-color, #1890FF);
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.1);
}

.request-meta,
.assist-meta {
  font-size: 13px;
  color: var(--agent-text-color, #262626);
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.request-time,
.assist-time {
  font-size: 11px;
  color: var(--agent-text-light);
  align-self: flex-end;
}

.request-actions,
.assist-reply .request-actions {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.smart-recommendation {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  background: #f8fafc;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.smart-recommendation__loading,
.smart-recommendation__error {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: #475569;
}

.smart-recommendation__card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.smart-recommendation__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.smart-recommendation__title {
  font-size: 14px;
  color: #0f172a;
}

.smart-recommendation__sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: #64748b;
}

.smart-recommendation__reason {
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
}

.recommendation-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-chip {
  background: #e0f2fe;
  color: #0369a1;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
}

.empty-transfer-requests,
.empty-assist-requests {
  text-align: center;
  color: var(--agent-text-light);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 20px;
}

.empty-transfer-requests svg,
.empty-assist-requests svg {
  width: 40px;
  height: 40px;
  stroke: var(--agent-border-color);
  margin-bottom: 12px;
}

.assist-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px 0;
  flex-shrink: 0;
}

.assist-tabs {
  display: flex;
  gap: 6px;
}

.assist-tab {
  padding: 5px 12px;
  border-radius: 9999px;
  border: 1px solid var(--agent-border-color);
  background: var(--agent-body-bg);
  cursor: pointer;
  font-size: 12px;
  color: var(--agent-text-color);
  transition: all 0.2s ease;
}

.assist-tab.active {
  background: var(--agent-primary-color);
  color: white;
  border-color: var(--agent-primary-color);
}

.assist-tab:hover:not(.active) {
  border-color: var(--agent-primary-color);
  color: var(--agent-primary-color);
  background: rgba(var(--agent-primary-color-rgb), 0.1);
}

.assist-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--agent-text-color);
}

.assist-filter select {
  padding: 4px 8px;
  border: 1px solid var(--agent-border-color);
  border-radius: 4px;
  background: var(--agent-body-bg);
  color: var(--agent-text-color);
  font-size: 12px;
}

.assist-answer {
  margin-top: 8px;
  font-size: 13px;
  color: var(--agent-text-color);
  background: var(--agent-body-bg);
  border-radius: var(--agent-border-radius-sm, 6px);
  padding: 10px 12px;
  border: 1px dashed var(--agent-border-color);
}

.assist-reply {
  margin-top: 8px;
}

/* General utility classes / overrides */
.required {
  color: #ef4444;
  margin-left: 4px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--agent-border-color);
  border-top-color: var(--agent-primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Dark theme specific adjustments if not covered by general variables */
.dashboard-container.theme-dark {
  --agent-logo-filter: brightness(0) invert(1);
}

.dashboard-container.font-small {
  font-size: 13px;
}

.dashboard-container.font-large {
  font-size: 15px;
}
</style>

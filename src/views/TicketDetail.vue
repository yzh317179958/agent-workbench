<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useTicketStore } from '@/stores/ticketStore'
import { useAgentStore } from '@/stores/agentStore'
import type { TicketPriority, TicketStatus, TicketCommentType } from '@/types'
import { getAccessToken } from '@/utils/authStorage'
import SLAStatusCard from '@/components/tickets/SLAStatusCard.vue'

const route = useRoute()
const router = useRouter()
const ticketStore = useTicketStore()
const agentStore = useAgentStore()
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

const ticketId = computed(() => route.params.ticketId as string)
const selectedStatus = ref<TicketStatus | ''>('')
const selectedPriority = ref<TicketPriority | ''>('')
const updateNote = ref('')
const isUpdating = ref(false)
const assigning = ref(false)
const manualAssignId = ref('')
const manualAssignName = ref('')
const manualAssignNote = ref('')
const commentContent = ref('')
const commentType = ref<TicketCommentType>('internal')
const commentSubmitting = ref(false)
const commentMentions = ref<string[]>([])
const showCommentMentionSelector = ref(false)
const commentMentionSearch = ref('')
const mentionAgentsLoading = ref(false)
const mentionCandidatesRaw = ref<Array<{
  id: string
  username: string
  name: string
  status: string
}>>([])

const statusDict: Record<TicketStatus, { label: string; type: string }> = {
  pending: { label: '待处理', type: 'warning' },
  in_progress: { label: '处理中', type: 'primary' },
  waiting_customer: { label: '等待客户', type: 'info' },
  waiting_vendor: { label: '等待第三方', type: 'info' },
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

const statusOptions: Array<{ value: TicketStatus; label: string }> = [
  { value: 'pending', label: '待处理' },
  { value: 'in_progress', label: '处理中' },
  { value: 'waiting_customer', label: '等待客户' },
  { value: 'waiting_vendor', label: '等待第三方' },
  { value: 'resolved', label: '已解决' },
  { value: 'closed', label: '已关闭' }
]

const priorityOptions: Array<{ value: TicketPriority; label: string }> = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'urgent', label: '紧急' }
]

const ticket = computed(() => ticketStore.currentTicket)

const loadTicket = async () => {
  if (!ticketId.value) return
  try {
    const detail = await ticketStore.fetchTicketById(ticketId.value)
    selectedStatus.value = detail.status
    selectedPriority.value = detail.priority
    manualAssignId.value = detail.assigned_agent_id || ''
    manualAssignName.value = detail.assigned_agent_name || ''
  } catch (error: any) {
    ElMessage.error(error.message || '加载工单失败')
  }
}

const handleStatusUpdate = async () => {
  if (!ticket.value || (!selectedStatus.value && !selectedPriority.value)) return
  isUpdating.value = true
  try {
    await ticketStore.updateTicket(ticket.value.ticket_id, {
      status: selectedStatus.value || undefined,
      priority: selectedPriority.value || undefined,
      note: updateNote.value || undefined,
      change_reason: 'manual_update'
    })
    ElMessage.success('工单已更新')
    updateNote.value = ''
  } catch (error: any) {
    ElMessage.error(error.message || '更新失败')
  } finally {
    isUpdating.value = false
  }
}

const handleAssignToMe = async () => {
  if (!ticket.value) return
  if (!agentStore.agentId) {
    ElMessage.warning('当前坐席信息缺失，无法指派')
    return
  }
  assigning.value = true
  try {
    await ticketStore.assignTicket(ticket.value.ticket_id, {
      agent_id: agentStore.agentId,
      agent_name: agentStore.agentName
    })
    ElMessage.success('已指派给当前坐席')
  } catch (error: any) {
    ElMessage.error(error.message || '指派失败')
  } finally {
    assigning.value = false
  }
}

const handleManualAssign = async () => {
  if (!ticket.value) return
  if (!manualAssignId.value.trim()) {
    ElMessage.warning('请输入坐席ID')
    return
  }
  assigning.value = true
  try {
    await ticketStore.assignTicket(ticket.value.ticket_id, {
      agent_id: manualAssignId.value.trim(),
      agent_name: manualAssignName.value.trim() || undefined,
      note: manualAssignNote.value.trim() || undefined
    })
    ElMessage.success('工单已指派')
    manualAssignNote.value = ''
  } catch (error: any) {
    ElMessage.error(error.message || '指派失败')
  } finally {
    assigning.value = false
  }
}

const handleReopen = async () => {
  if (!ticket.value) return
  try {
    const { value } = await ElMessageBox.prompt('请输入重开原因', '重开工单', {
      confirmButtonText: '重开',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：客户反馈问题未解决'
    })
    await ticketStore.reopenTicket(ticket.value.ticket_id, {
      reason: value,
      comment: updateNote.value || undefined
    })
    ElMessage.success('工单已重新打开')
  } catch (error: any) {
    if (error === 'cancel') return
    ElMessage.error(error.message || '重开失败')
  }
}

const handleArchive = async () => {
  if (!ticket.value) return
  try {
    await ElMessageBox.confirm(
      '确认要归档该工单吗？归档后只能在归档列表中查看，无法继续编辑。',
      '归档确认',
      { type: 'warning' }
    )
    await ticketStore.archiveTicket(ticket.value.ticket_id, {
      reason: updateNote.value || undefined
    })
    ElMessage.success('工单已归档')
  } catch (error: any) {
    if (error === 'cancel') return
    ElMessage.error(error.message || '归档失败')
  }
}

const handleAddComment = async () => {
  if (!ticket.value) return
  if (!commentContent.value.trim()) {
    ElMessage.warning('请输入备注内容')
    return
  }
  commentSubmitting.value = true
  try {
    await ticketStore.addTicketComment(ticket.value.ticket_id, {
      content: commentContent.value.trim(),
      comment_type: commentType.value,
      mentions: commentMentions.value
    })
    commentContent.value = ''
    commentMentions.value = []
    showCommentMentionSelector.value = false
    commentMentionSearch.value = ''
    ElMessage.success('备注已添加')
  } catch (error: any) {
    ElMessage.error(error.message || '添加备注失败')
  } finally {
    commentSubmitting.value = false
  }
}

const goBack = () => {
  router.push({ name: 'TicketManagement' })
}

const timeline = computed(() => {
  if (!ticket.value) return []
  const history = ticket.value.history
    .slice()
    .sort((a, b) => b.changed_at - a.changed_at)
    .map(item => ({
      ...item,
      timestamp: new Date(item.changed_at * 1000).toLocaleString()
    }))
  return history
})

watch(ticket, (detail) => {
  if (!detail) return
  selectedStatus.value = detail.status
  selectedPriority.value = detail.priority
  manualAssignId.value = detail.assigned_agent_id || ''
  manualAssignName.value = detail.assigned_agent_name || ''
})

watch(
  () => route.params.ticketId,
  async () => {
    await loadTicket()
  }
)

const fetchMentionAgents = async () => {
  try {
    mentionAgentsLoading.value = true
    const token = getAccessToken()
    if (!token) {
      throw new Error('认证信息已失效，请重新登录')
    }
    const response = await fetch(`${API_BASE}/api/agents/available`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const data = await response.json()
    mentionCandidatesRaw.value = data.data?.items || []
  } catch (error) {
    console.warn('⚠️ 加载可用坐席失败:', error)
  } finally {
    mentionAgentsLoading.value = false
  }
}

watch(showCommentMentionSelector, (visible) => {
  if (visible && mentionCandidatesRaw.value.length === 0 && !mentionAgentsLoading.value) {
    fetchMentionAgents()
  }
})

const mentionCandidates = computed(() => {
  const map = new Map<string, { username: string; name: string; status: string }>()
  mentionCandidatesRaw.value.forEach(agent => {
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
  mentionCandidates.value.forEach(item => {
    map[item.username] = item.name
  })
  return map
})

const filteredCommentMentionCandidates = computed(() => {
  const keyword = commentMentionSearch.value.trim().toLowerCase()
  if (!keyword) {
    return mentionCandidates.value
  }
  return mentionCandidates.value.filter(candidate =>
    candidate.name.toLowerCase().includes(keyword) ||
    candidate.username.toLowerCase().includes(keyword)
  )
})

const getMentionLabel = (username: string) => mentionLabelMap.value[username] || username
const removeCommentMention = (username: string) => {
  commentMentions.value = commentMentions.value.filter(item => item !== username)
}

onMounted(async () => {
  await loadTicket()
  fetchMentionAgents()
})
</script>

<template>
  <div class="ticket-detail" v-loading="ticketStore.detailLoading">
    <div class="detail-header">
      <div>
        <el-button link @click="goBack">← 返回列表</el-button>
        <h1>{{ ticket?.title || '工单详情' }}</h1>
        <p class="ticket-id">{{ ticket?.ticket_id }}</p>
      </div>
      <div class="header-tags" v-if="ticket">
        <el-tag :type="statusDict[ticket.status]?.type">
          {{ statusDict[ticket.status]?.label || ticket.status }}
        </el-tag>
        <el-tag :type="priorityDict[ticket.priority]?.type">
          {{ priorityDict[ticket.priority]?.label || ticket.priority }}
        </el-tag>
      </div>
    </div>

    <section class="ticket-summary" v-if="ticket">
      <div>
        <h3>基本信息</h3>
        <p>{{ ticket.description }}</p>
      </div>
      <div class="summary-grid">
        <div>
          <label>工单类型</label>
          <p>{{ ticket.ticket_type }}</p>
        </div>
        <div>
          <label>创建人</label>
          <p>{{ ticket.created_by_name || ticket.created_by }}</p>
        </div>
        <div>
          <label>关联会话</label>
          <p>{{ ticket.session_name || '无' }}</p>
        </div>
        <div>
          <label>分配坐席</label>
          <p>{{ ticket.assigned_agent_name || '未分配' }}</p>
        </div>
      </div>
    </section>

    <!-- SLA 状态监控 -->
    <SLAStatusCard v-if="ticket && ticket.status !== 'archived'" :ticket-id="ticketId" />

    <section class="ticket-columns" v-if="ticket">
      <div class="panel">
        <h3>工单状态与优先级</h3>
        <el-form label-width="90px">
          <el-form-item label="状态">
            <el-select v-model="selectedStatus">
              <el-option
                v-for="item in statusOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="优先级">
            <el-select v-model="selectedPriority">
              <el-option
                v-for="item in priorityOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="备注">
            <el-input
              v-model="updateNote"
              type="textarea"
              :rows="3"
              placeholder="可选，变更说明"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="isUpdating" @click="handleStatusUpdate">
              保存变更
            </el-button>
            <el-button
              v-if="ticket.status === 'closed'"
              @click="handleReopen"
            >
              重新打开
            </el-button>
            <el-button
              v-if="ticket.status === 'closed'"
              type="warning"
              plain
              @click="handleArchive"
            >
              归档
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <div class="panel">
        <h3>指派管理</h3>
        <div class="assign-section">
          <div class="assign-row">
            <el-input v-model="manualAssignId" placeholder="坐席ID" />
            <el-input v-model="manualAssignName" placeholder="坐席姓名 (可选)" />
          </div>
          <el-input
            v-model="manualAssignNote"
            placeholder="指派备注，可选"
            class="assign-note"
          />
          <div class="assign-actions">
            <el-button @click="handleAssignToMe" :loading="assigning">
              指派给我
            </el-button>
            <el-button type="primary" @click="handleManualAssign" :loading="assigning">
              保存指派
            </el-button>
          </div>
        </div>
        <div class="assignment-history" v-if="ticket.assignments.length">
          <h4>指派历史</h4>
          <ul>
            <li v-for="record in ticket.assignments" :key="record.assigned_at" class="assignment-item">
              <div>
                <strong>{{ record.agent_name || record.agent_id || '未分配' }}</strong>
                <span> ← {{ record.assigned_by || '系统' }}</span>
              </div>
              <div class="assignment-meta">
                {{ new Date(record.assigned_at * 1000).toLocaleString() }}
                <template v-if="record.note"> · {{ record.note }}</template>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section class="panel" v-if="ticket">
      <h3>客户信息</h3>
      <div class="summary-grid">
        <div>
          <label>客户姓名</label>
          <p>{{ ticket.customer?.name || '未知' }}</p>
        </div>
        <div>
          <label>客户邮箱</label>
          <p>{{ ticket.customer?.email || '-' }}</p>
        </div>
        <div>
          <label>客户电话</label>
          <p>{{ ticket.customer?.phone || '-' }}</p>
        </div>
        <div>
          <label>国家/地区</label>
          <p>{{ ticket.customer?.country || '-' }}</p>
        </div>
      </div>
    </section>

    <section class="panel" v-if="ticket">
      <div class="panel-header">
        <h3>内部备注 / 评论</h3>
      </div>
      <el-input
        v-model="commentContent"
        type="textarea"
        :rows="3"
        placeholder="记录关键沟通、下一步行动或客户反馈"
      />
      <div class="mention-selector">
        <div class="selector-header">
          <span>提醒同事</span>
          <button
            type="button"
            class="btn-text"
            @click="showCommentMentionSelector = !showCommentMentionSelector"
          >
            {{ showCommentMentionSelector ? '收起列表' : '选择@对象' }}
          </button>
        </div>
        <div class="selected-mentions" v-if="commentMentions.length">
          <span
            v-for="mention in commentMentions"
            :key="mention"
            class="mention-chip removable"
          >
            @{{ getMentionLabel(mention) }}
            <button type="button" class="remove-chip" @click="removeCommentMention(mention)">×</button>
          </span>
        </div>
        <div v-if="showCommentMentionSelector" class="mention-options">
          <input
            v-model="commentMentionSearch"
            class="mention-search"
            type="text"
            placeholder="搜索坐席姓名或ID"
          />
          <div
            v-for="candidate in filteredCommentMentionCandidates"
            :key="candidate.username"
            class="mention-option"
          >
            <label>
              <input
                type="checkbox"
                :value="candidate.username"
                v-model="commentMentions"
              />
              <span class="name">{{ candidate.name }}</span>
              <span class="id">@{{ candidate.username }}</span>
            </label>
          </div>
          <div v-if="!filteredCommentMentionCandidates.length" class="no-mention-result">
            暂无匹配坐席
          </div>
        </div>
      </div>
      <div class="comment-actions">
        <el-select v-model="commentType" style="width: 140px">
          <el-option label="内部备注" value="internal" />
          <el-option label="公开回复" value="public" />
        </el-select>
        <el-button type="primary" :loading="commentSubmitting" @click="handleAddComment">
          添加备注
        </el-button>
      </div>
      <div v-if="ticket.comments.length" class="comment-list">
        <div
          v-for="comment in ticket.comments.slice().sort((a, b) => b.created_at - a.created_at)"
          :key="comment.comment_id"
          class="comment-item"
        >
          <div class="comment-meta">
            <strong>{{ comment.author_name || comment.author_id }}</strong>
            <span>{{ new Date(comment.created_at * 1000).toLocaleString() }}</span>
            <el-tag size="small" v-if="comment.comment_type === 'internal'">内部</el-tag>
            <el-tag size="small" type="success" v-else>公开</el-tag>
          </div>
          <p>{{ comment.content }}</p>
          <div v-if="comment.mentions && comment.mentions.length" class="note-mentions">
            <span
              v-for="mention in comment.mentions"
              :key="mention"
              class="mention-chip"
            >
              @{{ getMentionLabel(mention) }}
            </span>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">暂无备注</div>
    </section>

    <section class="panel" v-if="ticket">
      <h3>状态流转</h3>
      <el-timeline>
        <el-timeline-item
          v-for="item in timeline"
          :key="item.history_id"
          :timestamp="item.timestamp"
          :type="statusDict[item.to_status]?.type"
        >
          <p>
            {{ statusDict[item.to_status]?.label || item.to_status }}
            <span>（{{ item.changed_by }}）</span>
          </p>
          <p v-if="item.comment">说明: {{ item.comment }}</p>
        </el-timeline-item>
      </el-timeline>
    </section>
  </div>
</template>

<style scoped>
.ticket-detail {
  padding: 24px 32px 48px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.ticket-id {
  color: #888;
  font-size: 13px;
  margin-top: 4px;
}

.header-tags {
  display: flex;
  gap: 8px;
}

.ticket-summary,
.panel {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.07);
}

.summary-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}

.summary-grid label {
  font-size: 12px;
  color: #666;
}

.ticket-columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.assign-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.assign-row {
  display: flex;
  gap: 12px;
}

.assign-note {
  width: 100%;
}

.assign-actions {
  display: flex;
  gap: 12px;
}

.assignment-history {
  margin-top: 16px;
}

.assignment-item {
  list-style: none;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.assignment-meta {
  color: #666;
  font-size: 12px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.comment-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 12px;
}

.comment-list {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.comment-item {
  background: #f8fafc;
  border-radius: 10px;
  padding: 12px 16px;
}

.comment-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 13px;
  color: #555;
}

.mention-selector {
  margin-top: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #475569;
}

.selected-mentions {
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

.note-mentions {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.empty-state {
  text-align: center;
  color: #888;
  padding: 16px 0;
}
</style>

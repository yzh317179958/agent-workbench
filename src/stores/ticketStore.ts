import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  Ticket,
  TicketListFilters,
  TicketListResponse,
  CreateManualTicketPayload,
  UpdateTicketPayload,
  AssignTicketPayload,
  TicketComment,
  TicketCommentPayload,
  ReopenTicketPayload,
  ArchiveTicketPayload,
  TicketFilterPayload,
  TicketSlaSummary,
  TicketSlaAlerts,
  TicketExportRequest,
  BatchAssignRequest,
  BatchAssignResult,
  BatchCloseRequest,
  BatchCloseResult,
  BatchPriorityRequest,
  BatchPriorityResult
} from '@/types'
import { getAccessToken } from '@/utils/authStorage'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

const buildAuthHeaders = (withJson: boolean = true): HeadersInit => {
  const token = getAccessToken()
  if (!token) {
    throw new Error('认证信息已失效，请重新登录')
  }
  const headers: HeadersInit = {}
  if (withJson) {
    headers['Content-Type'] = 'application/json'
  }
  headers['Authorization'] = `Bearer ${token}`
  return headers
}

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const text = await response.text()
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
    const message = parsed?.detail || parsed?.error || `HTTP ${response.status}`
    throw new Error(message)
  }
  return response.json()
}

export const useTicketStore = defineStore('ticket', () => {
  const tickets = ref<Ticket[]>([])
  const total = ref(0)
  const limit = ref(20)
  const offset = ref(0)
  const hasMore = ref(false)
  const listLoading = ref(false)
  const detailLoading = ref(false)
  const listError = ref<string | null>(null)
  const detailError = ref<string | null>(null)
  const currentTicket = ref<Ticket | null>(null)
  const slaSummary = ref<TicketSlaSummary | null>(null)
  const slaAlerts = ref<TicketSlaAlerts | null>(null)
  const slaSummaryLoading = ref(false)
  const slaAlertsLoading = ref(false)
  const slaError = ref<string | null>(null)

  const upsertTicket = (ticket: Ticket) => {
    const index = tickets.value.findIndex(t => t.ticket_id === ticket.ticket_id)
    if (index >= 0) {
      tickets.value[index] = ticket
    } else {
      tickets.value.unshift(ticket)
    }
    if (currentTicket.value && currentTicket.value.ticket_id === ticket.ticket_id) {
      currentTicket.value = ticket
    }
  }

  const removeTicketFromList = (ticketId: string) => {
    const index = tickets.value.findIndex(t => t.ticket_id === ticketId)
    if (index >= 0) {
      tickets.value.splice(index, 1)
    }
    if (currentTicket.value && currentTicket.value.ticket_id === ticketId) {
      currentTicket.value = null
    }
  }

  const fetchTickets = async (filters: TicketListFilters = {}) => {
    listLoading.value = true
    listError.value = null

    try {
      const params = new URLSearchParams()
      if (filters.status) {
        params.append('status', filters.status)
      }
      if (filters.priority) {
        params.append('priority', filters.priority)
      }
      if (filters.assigned_agent_id) {
        params.append('assigned_agent_id', filters.assigned_agent_id)
      }
      if (filters.limit) {
        params.append('limit', filters.limit.toString())
      }
      if (filters.offset) {
        params.append('offset', filters.offset.toString())
      }

      const url = `${API_BASE}/api/tickets${params.toString() ? `?${params.toString()}` : ''}`
      const response = await fetch(url, {
        headers: buildAuthHeaders(false)
      })
      const data: TicketListResponse = await handleResponse(response)

      tickets.value = data.data.tickets
      total.value = data.data.total
      limit.value = data.data.limit
      offset.value = data.data.offset
      hasMore.value = data.data.has_more
      return data.data
    } catch (error: any) {
      listError.value = error.message || '加载工单失败'
      throw error
    } finally {
      listLoading.value = false
    }
  }

  const searchTickets = async (query: string) => {
    const keyword = query.trim()
    if (!keyword) {
      return fetchTickets()
    }

    listLoading.value = true
    listError.value = null

    try {
      const params = new URLSearchParams({ query: keyword })
      const response = await fetch(`${API_BASE}/api/tickets/search?${params.toString()}`, {
        headers: buildAuthHeaders(false)
      })
      const data = await handleResponse(response)
      const resultList: Ticket[] = data.data?.tickets || data.tickets || []
      tickets.value = resultList
      total.value = resultList.length
      limit.value = resultList.length
      offset.value = 0
      hasMore.value = false
      return resultList
    } catch (error: any) {
      listError.value = error.message || '搜索工单失败'
      throw error
    } finally {
      listLoading.value = false
    }
  }

  const filterTickets = async (payload: TicketFilterPayload = {}) => {
    listLoading.value = true
    listError.value = null

    try {
      const response = await fetch(`${API_BASE}/api/tickets/filter`, {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify(payload)
      })
      const data = await handleResponse(response)
      tickets.value = data.data.tickets
      total.value = data.data.total
      limit.value = data.data.limit
      offset.value = data.data.offset
      hasMore.value = data.data.has_more
      return data.data
    } catch (error: any) {
      listError.value = error.message || "高级筛选失败"
      throw error
    } finally {
      listLoading.value = false
    }
  }

  const fetchSlaSummary = async () => {
    slaSummaryLoading.value = true
    slaError.value = null

    try {
      const response = await fetch(`${API_BASE}/api/tickets/sla-summary`, {
        headers: buildAuthHeaders(false)
      })
      const data = await handleResponse(response)
      slaSummary.value = data.data || data
      return slaSummary.value
    } catch (error: any) {
      slaError.value = error.message || '获取 SLA 概览失败'
      throw error
    } finally {
      slaSummaryLoading.value = false
    }
  }

  const fetchSlaAlerts = async () => {
    slaAlertsLoading.value = true
    slaError.value = null

    try {
      const response = await fetch(`${API_BASE}/api/tickets/sla-alerts`, {
        headers: buildAuthHeaders(false)
      })
      const data = await handleResponse(response)
      slaAlerts.value = data.data || data
      return slaAlerts.value
    } catch (error: any) {
      slaError.value = error.message || '获取 SLA 告警失败'
      throw error
    } finally {
      slaAlertsLoading.value = false
    }
  }

  const exportTickets = async (options: TicketExportRequest) => {
    try {
      const response = await fetch(`${API_BASE}/api/tickets/export`, {
        method: 'POST',
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          format: options.format,
          filters: options.filters || {}
        })
      })

      if (!response.ok) {
        const text = await response.text()
        let parsed: any
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = null
        }
        const message = parsed?.detail || parsed?.error || `HTTP ${response.status}`
        throw new Error(message)
      }

      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') || ''
      let filename = `tickets_${Date.now()}.${options.format === 'xlsx' ? 'xlsx' : options.format === 'pdf' ? 'pdf' : 'csv'}`
      const match = disposition.match(/filename\\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i)
      const matchedName = match?.[1] || match?.[2]
      if (matchedName) {
        filename = decodeURIComponent(matchedName)
      }
      return { blob, filename }
    } catch (error) {
      throw error
    }
  }

  const fetchArchivedTickets = async (params: { customer_email?: string; start_date?: string; end_date?: string; limit?: number; offset?: number } = {}) => {
    listLoading.value = true
    listError.value = null
    try {
      const searchParams = new URLSearchParams()
      if (params.customer_email) searchParams.append('customer_email', params.customer_email)
      if (params.start_date) searchParams.append('start_date', params.start_date)
      if (params.end_date) searchParams.append('end_date', params.end_date)
      if (params.limit) searchParams.append('limit', params.limit.toString())
      if (params.offset) searchParams.append('offset', params.offset.toString())

      const url = `${API_BASE}/api/tickets/archived${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
      const response = await fetch(url, { headers: buildAuthHeaders(false) })
      const data: TicketListResponse = await handleResponse(response)

      tickets.value = data.data.tickets
      total.value = data.data.total
      limit.value = data.data.limit
      offset.value = data.data.offset
      hasMore.value = data.data.has_more
      return data.data
    } catch (error: any) {
      listError.value = error.message || '加载归档工单失败'
      throw error
    } finally {
      listLoading.value = false
    }
  }

  const fetchTicketById = async (ticketId: string, { silent = false } = {}) => {
    if (!silent) {
      detailLoading.value = true
      detailError.value = null
    }
    try {
      const response = await fetch(`${API_BASE}/api/tickets/${ticketId}`, {
        headers: buildAuthHeaders(false)
      })
      const data = await handleResponse(response)
      currentTicket.value = data.data as Ticket
      upsertTicket(data.data as Ticket)
      return data.data as Ticket
    } catch (error: any) {
      detailError.value = error.message || '获取工单详情失败'
      throw error
    } finally {
      if (!silent) {
        detailLoading.value = false
      }
    }
  }

  const createManualTicket = async (payload: CreateManualTicketPayload) => {
    const response = await fetch(`${API_BASE}/api/tickets/manual`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload)
    })
    const data = await handleResponse(response)
    const created: Ticket = data.data
    upsertTicket(created)
    return created
  }

  const updateTicket = async (ticketId: string, payload: UpdateTicketPayload) => {
    const response = await fetch(`${API_BASE}/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload)
    })
    const data = await handleResponse(response)
    const updated: Ticket = data.data
    upsertTicket(updated)
    return updated
  }

  const assignTicket = async (ticketId: string, payload: AssignTicketPayload) => {
    const response = await fetch(`${API_BASE}/api/tickets/${ticketId}/assign`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload)
    })
    const data = await handleResponse(response)
    const updated: Ticket = data.data
    upsertTicket(updated)
    return updated
  }

  const batchAssignTickets = async (payload: BatchAssignRequest) => {
    const response = await fetch(`${API_BASE}/api/tickets/batch/assign`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload)
    })
    const data = await handleResponse(response)
    const result: BatchAssignResult = data.data
    result.tickets?.forEach((ticket: Ticket) => upsertTicket(ticket))
    return result
  }

  const batchCloseTickets = async (payload: BatchCloseRequest) => {
    const response = await fetch(`${API_BASE}/api/tickets/batch/close`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload)
    })
    const data = await handleResponse(response)
    const result: BatchCloseResult = data.data
    result.tickets?.forEach((ticket: Ticket) => upsertTicket(ticket))
    return result
  }

  const batchUpdatePriority = async (payload: BatchPriorityRequest) => {
    const response = await fetch(`${API_BASE}/api/tickets/batch/priority`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload)
    })
    const data = await handleResponse(response)
    const result: BatchPriorityResult = data.data
    result.tickets?.forEach((ticket: Ticket) => upsertTicket(ticket))
    return result
  }

  const addTicketComment = async (ticketId: string, payload: TicketCommentPayload) => {
    const response = await fetch(`${API_BASE}/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload)
    })
    const data = await handleResponse(response)
    const comment: TicketComment = data.data
    if (currentTicket.value && currentTicket.value.ticket_id === ticketId) {
      currentTicket.value = {
        ...currentTicket.value,
        comments: [...currentTicket.value.comments, comment]
      }
    }
    await fetchTicketById(ticketId, { silent: true })
    return comment
  }

  const deleteTicketComment = async (ticketId: string, commentId: string) => {
    const response = await fetch(`${API_BASE}/api/tickets/${ticketId}/comments/${commentId}`, {
      method: 'DELETE',
      headers: buildAuthHeaders(false)
    })
    await handleResponse(response)
    if (currentTicket.value && currentTicket.value.ticket_id === ticketId) {
      currentTicket.value = {
        ...currentTicket.value,
        comments: currentTicket.value.comments.filter(comment => comment.comment_id !== commentId)
      }
    }
  }

  const reopenTicket = async (ticketId: string, payload: ReopenTicketPayload) => {
    const response = await fetch(`${API_BASE}/api/tickets/${ticketId}/reopen`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload)
    })
    const data = await handleResponse(response)
    const reopened: Ticket = data.data
    upsertTicket(reopened)
    return reopened
  }

  const archiveTicket = async (ticketId: string, payload: ArchiveTicketPayload = {}) => {
    const response = await fetch(`${API_BASE}/api/tickets/${ticketId}/archive`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload)
    })
    const data = await handleResponse(response)
    const archived: Ticket = data.data
    upsertTicket(archived)
    return archived
  }

  return {
    tickets,
    total,
    limit,
    offset,
    hasMore,
    listLoading,
    detailLoading,
    listError,
    detailError,
    currentTicket,
    slaSummary,
    slaAlerts,
    slaSummaryLoading,
    slaAlertsLoading,
    slaError,
    fetchTickets,
    searchTickets,
    filterTickets,
    fetchArchivedTickets,
    fetchTicketById,
    createManualTicket,
    updateTicket,
    assignTicket,
    addTicketComment,
    batchAssignTickets,
    batchCloseTickets,
    batchUpdatePriority,
    deleteTicketComment,
    reopenTicket,
    archiveTicket,
    removeTicketFromList,
    fetchSlaSummary,
    fetchSlaAlerts,
    exportTickets
  }
})

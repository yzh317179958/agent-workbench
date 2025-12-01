import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AssistRequest, AssistStatus } from '@/types'
import { getAccessToken } from '@/utils/authStorage'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

const requireAuth = () => {
  const token = getAccessToken()
  if (!token) {
    throw new Error('UNAUTHORIZED')
  }
  return token
}

export const useAssistRequestStore = defineStore('assistRequests', () => {
  const received = ref<AssistRequest[]>([])
  const sent = ref<AssistRequest[]>([])
  const loading = ref(false)

  const pendingCount = computed(() => received.value.filter((item) => item.status === 'pending').length)

  async function fetchRequests(status: AssistStatus | 'all' = 'pending') {
    loading.value = true
    try {
      const params = new URLSearchParams()
      if (status && status !== 'all') {
        params.append('status', status)
      }
      const token = requireAuth()
      const headers: HeadersInit = {
        Authorization: `Bearer ${token}`
      }

      const response = await fetch(`${API_BASE}/api/assist-requests?${params.toString()}`, { headers })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.detail || '获取协助请求失败')
      }

      received.value = data.data.received || []
      sent.value = data.data.sent || []
      return data.data
    } finally {
      loading.value = false
    }
  }

  async function answerRequest(requestId: string, answer: string) {
    const token = requireAuth()
    const response = await fetch(`${API_BASE}/api/assist-requests/${requestId}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ answer })
    })

    const data = await response.json()
    if (!response.ok || !data.success) {
      throw new Error(data.detail || '回复协助请求失败')
    }

    return data.data
  }

  function clear() {
    received.value = []
    sent.value = []
  }

  return {
    received,
    sent,
    loading,
    pendingCount,
    fetchRequests,
    answerRequest,
    clear
  }
})

import type { SmartAssignPayload, SmartAssignRecommendation } from '@/types'
import { getAccessToken } from '@/utils/authStorage'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

const buildHeaders = (): HeadersInit => {
  const token = getAccessToken()
  if (!token) {
    throw new Error('认证信息已过期，请重新登录')
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  }
}

const handleResponse = async (response: Response) => {
  const text = await response.text()
  let data: any = {}
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = {}
    }
  }
  if (!response.ok) {
    const detail = data.detail || data.message || `HTTP ${response.status}`
    throw new Error(detail)
  }
  return data
}

export const requestSmartAssignment = async (
  payload: SmartAssignPayload
): Promise<SmartAssignRecommendation> => {
  const response = await fetch(`${API_BASE}/api/tickets/assign/recommend`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload)
  })
  const data = await handleResponse(response)
  if (!data.success || !data.data) {
    throw new Error(data.message || '暂无可用坐席')
  }
  return data.data as SmartAssignRecommendation
}

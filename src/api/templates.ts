import axios from 'axios'
import { getAccessToken } from '@/utils/authStorage'
import type {
  TicketTemplate,
  TicketTemplatePayload,
  RenderTemplateRequest,
  RenderTemplateResponse
} from '@/types'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

const authHeaders = () => {
  const token = getAccessToken()
  if (!token) {
    throw new Error('认证信息已过期，请重新登录')
  }
  return {
    Authorization: `Bearer ${token}`
  }
}

export async function fetchTemplates(): Promise<TicketTemplate[]> {
  const response = await axios.get(`${API_BASE}/api/templates`, {
    headers: authHeaders()
  })
  return response.data.data || []
}

export async function createTemplate(payload: TicketTemplatePayload): Promise<TicketTemplate> {
  const response = await axios.post(`${API_BASE}/api/templates`, payload, {
    headers: authHeaders()
  })
  return response.data.data
}

export async function updateTemplate(
  templateId: string,
  payload: TicketTemplatePayload
): Promise<TicketTemplate> {
  const response = await axios.put(`${API_BASE}/api/templates/${templateId}`, payload, {
    headers: authHeaders()
  })
  return response.data.data
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await axios.delete(`${API_BASE}/api/templates/${templateId}`, {
    headers: authHeaders()
  })
}

export async function renderTemplate(
  templateId: string,
  payload: RenderTemplateRequest
): Promise<RenderTemplateResponse> {
  const response = await axios.post(`${API_BASE}/api/templates/${templateId}/render`, payload, {
    headers: authHeaders()
  })
  return response.data.data
}

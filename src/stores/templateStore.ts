import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  TicketTemplate,
  TicketTemplatePayload,
  RenderTemplateRequest,
  RenderTemplateResponse
} from '@/types'
import {
  fetchTemplates,
  createTemplate as apiCreateTemplate,
  updateTemplate as apiUpdateTemplate,
  deleteTemplate as apiDeleteTemplate,
  renderTemplate as apiRenderTemplate
} from '@/api/templates'

export const useTemplateStore = defineStore('ticketTemplates', () => {
  const templates = ref<TicketTemplate[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const loadTemplates = async () => {
    loading.value = true
    error.value = null
    try {
      templates.value = await fetchTemplates()
    } catch (err: any) {
      error.value = err.message || '加载模板失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  const createTemplate = async (payload: TicketTemplatePayload) => {
    const template = await apiCreateTemplate(payload)
    templates.value = [template, ...templates.value]
    return template
  }

  const updateTemplate = async (templateId: string, payload: TicketTemplatePayload) => {
    const updated = await apiUpdateTemplate(templateId, payload)
    templates.value = templates.value.map((tmpl) => (tmpl.id === templateId ? updated : tmpl))
    return updated
  }

  const deleteTemplate = async (templateId: string) => {
    await apiDeleteTemplate(templateId)
    templates.value = templates.value.filter((tmpl) => tmpl.id !== templateId)
  }

  const renderTemplate = async (
    templateId: string,
    payload: RenderTemplateRequest
  ): Promise<RenderTemplateResponse> => {
    return apiRenderTemplate(templateId, payload)
  }

  return {
    templates,
    loading,
    error,
    loadTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    renderTemplate
  }
})

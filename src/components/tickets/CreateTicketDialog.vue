<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useTicketStore } from '@/stores/ticketStore'
import { useAgentStore } from '@/stores/agentStore'
import type {
  TicketPriority,
  TicketType,
  Ticket,
  SmartAssignRecommendation,
  SmartAssignPayload
} from '@/types'
import { requestSmartAssignment } from '@/api/tickets'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'created', ticket: Ticket): void
}>()

const ticketStore = useTicketStore()
const agentStore = useAgentStore()

const formRef = ref<FormInstance>()
const submitting = ref(false)
const assignmentMode = ref<'smart' | 'manual'>('smart')
const smartRecommendation = ref<SmartAssignRecommendation | null>(null)
const smartAssignLoading = ref(false)
const smartAssignError = ref<string | null>(null)
let smartTimer: number | null = null

const form = ref({
  title: '',
  description: '',
  ticket_type: 'after_sale' as TicketType,
  priority: 'medium' as TicketPriority,
  customer_name: '',
  customer_email: '',
  customer_phone: '',
  customer_country: '',
  assigned_agent_id: '',
  assigned_agent_name: ''
})

const rules: FormRules = {
  title: [
    { required: true, message: '请输入工单标题', trigger: 'blur' },
    { min: 4, message: '标题至少4个字符', trigger: 'blur' }
  ],
  description: [
    { required: true, message: '请输入问题描述', trigger: 'blur' },
    { min: 10, message: '描述至少10个字符', trigger: 'blur' }
  ],
  customer_name: [{ required: true, message: '请输入客户姓名', trigger: 'blur' }],
  customer_email: [
    { required: true, message: '请输入客户邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: ['blur', 'change'] }
  ]
}

const innerVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const isSmartMode = computed(() => assignmentMode.value === 'smart')

const resetSmartState = () => {
  smartRecommendation.value = null
  smartAssignError.value = null
  smartAssignLoading.value = false
  if (smartTimer !== null) {
    clearTimeout(smartTimer)
    smartTimer = null
  }
}

const resetForm = () => {
  assignmentMode.value = 'smart'
  form.value = {
    title: '',
    description: '',
    ticket_type: 'after_sale',
    priority: 'medium',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_country: '',
    assigned_agent_id: '',
    assigned_agent_name: ''
  }
  formRef.value?.clearValidate()
  resetSmartState()
}

watch(
  () => props.modelValue,
  (visible) => {
    if (!visible) {
      resetForm()
    } else if (assignmentMode.value === 'smart') {
      scheduleSmartRecommendation()
    }
  }
)

const assignToCurrentAgent = () => {
  if (!agentStore.agentId || assignmentMode.value !== 'manual') {
    return
  }
  form.value.assigned_agent_id = agentStore.agentId
  form.value.assigned_agent_name = agentStore.agentName
}

const extractKeywords = () => {
  const text = `${form.value.title} ${form.value.description}`.toLowerCase()
  const parts = text.split(/[\s,.;，。/\\]+/).filter(part => part && part.length >= 2)
  const unique = Array.from(new Set(parts))
  return unique.slice(0, 6)
}

const buildSmartPayload = (): SmartAssignPayload => {
  return {
    ticket_type: form.value.ticket_type,
    priority: form.value.priority,
    customer_email: form.value.customer_email.trim() || undefined,
    customer_country: form.value.customer_country.trim() || undefined,
    category: form.value.ticket_type,
    keywords: extractKeywords()
  }
}

const fetchSmartRecommendation = async () => {
  if (!props.modelValue || assignmentMode.value !== 'smart') {
    resetSmartState()
    return
  }
  smartAssignLoading.value = true
  smartAssignError.value = null
  try {
    const payload = buildSmartPayload()
    smartRecommendation.value = await requestSmartAssignment(payload)
  } catch (error: any) {
    smartRecommendation.value = null
    smartAssignError.value = error.message || '暂时无法获取推荐坐席'
  } finally {
    smartAssignLoading.value = false
  }
}

const scheduleSmartRecommendation = () => {
  if (smartTimer !== null) {
    clearTimeout(smartTimer)
  }
  if (!props.modelValue || assignmentMode.value !== 'smart') {
    resetSmartState()
    return
  }
  smartTimer = window.setTimeout(() => {
    fetchSmartRecommendation()
  }, 500)
}

watch(
  () => [assignmentMode.value, form.value.ticket_type, form.value.priority],
  () => scheduleSmartRecommendation()
)

watch(
  () => [form.value.title, form.value.description, form.value.customer_email, form.value.customer_country],
  () => scheduleSmartRecommendation()
)

const handleSubmit = async () => {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    let assignedAgentId = form.value.assigned_agent_id.trim() || undefined
    let assignedAgentName = form.value.assigned_agent_name.trim() || undefined

    if (assignmentMode.value === 'smart') {
      if (!smartRecommendation.value) {
        await fetchSmartRecommendation()
      }
      if (!smartRecommendation.value) {
        ElMessage.error('暂时没有可用坐席，请改为指定坐席')
        submitting.value = false
        return
      }
      assignedAgentId = smartRecommendation.value.agent_id
      assignedAgentName = smartRecommendation.value.agent_name
    }

    const payload = {
      title: form.value.title.trim(),
      description: form.value.description.trim(),
      ticket_type: form.value.ticket_type,
      priority: form.value.priority,
      customer: {
        name: form.value.customer_name.trim(),
        email: form.value.customer_email.trim(),
        phone: form.value.customer_phone.trim() || undefined,
        country: form.value.customer_country.trim() || undefined
      },
      assigned_agent_id: assignedAgentId,
      assigned_agent_name: assignedAgentName
    }
    const ticket = await ticketStore.createManualTicket(payload)
    ElMessage.success('工单创建成功')
    emit('created', ticket)
    innerVisible.value = false
  } catch (error: any) {
    ElMessage.error(error.message || '创建工单失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="innerVisible"
    title="创建工单"
    width="720px"
    :close-on-click-modal="false"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
      <el-form-item label="工单标题" prop="title">
        <el-input
          v-model="form.title"
          placeholder="请输入工单标题"
          maxlength="200"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="问题描述" prop="description">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="4"
          placeholder="请详细描述客户遇到的问题"
          maxlength="5000"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="工单类型">
        <el-select v-model="form.ticket_type" placeholder="请选择">
          <el-option label="售前咨询" value="pre_sale" />
          <el-option label="售后问题" value="after_sale" />
          <el-option label="投诉建议" value="complaint" />
        </el-select>
      </el-form-item>

      <el-form-item label="优先级">
        <el-radio-group v-model="form.priority">
          <el-radio-button label="low">低</el-radio-button>
          <el-radio-button label="medium">中</el-radio-button>
          <el-radio-button label="high">高</el-radio-button>
          <el-radio-button label="urgent">紧急</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-divider>客户信息</el-divider>

      <el-form-item label="客户姓名" prop="customer_name">
        <el-input v-model="form.customer_name" placeholder="请输入客户姓名" maxlength="50" />
      </el-form-item>

      <el-form-item label="客户邮箱" prop="customer_email">
        <el-input v-model="form.customer_email" placeholder="name@example.com" maxlength="120" />
      </el-form-item>

      <el-form-item label="联系电话">
        <el-input v-model="form.customer_phone" placeholder="可选" maxlength="30" />
      </el-form-item>

      <el-form-item label="所在国家">
        <el-input v-model="form.customer_country" placeholder="可选" maxlength="60" />
      </el-form-item>

      <el-divider>指派信息</el-divider>

      <el-form-item label="分配方式">
        <div class="assign-mode">
          <el-radio-group v-model="assignmentMode">
            <el-radio label="smart">智能分配</el-radio>
            <el-radio label="manual">指定坐席</el-radio>
          </el-radio-group>

          <div v-if="assignmentMode === 'smart'" class="smart-hint">
            <el-skeleton v-if="smartAssignLoading" animated :rows="1" />
            <el-alert
              v-else-if="smartRecommendation"
              type="success"
              :closable="false"
              show-icon
              title="推荐坐席"
            >
              <template #default>
                <div class="smart-recommendation">
                  <strong>{{ smartRecommendation.agent_name }}</strong>
                  <span class="smart-extra">
                    {{ smartRecommendation.reason }}
                  </span>
                </div>
              </template>
            </el-alert>
            <el-alert
              v-else
              type="warning"
              :closable="false"
              show-icon
              :title="smartAssignError || '正在分析合适的坐席...'"
            />
          </div>
        </div>
      </el-form-item>

      <el-form-item v-if="!isSmartMode" label="处理坐席">
        <div class="assign-row">
          <el-input
            v-model="form.assigned_agent_id"
            placeholder="坐席ID，可留空"
            clearable
          />
          <el-input
            v-model="form.assigned_agent_name"
            placeholder="坐席姓名"
            clearable
          />
          <el-button @click="assignToCurrentAgent" :disabled="!agentStore.agentId">
            指派给我
          </el-button>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="innerVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">
        创建工单
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.assign-row {
  display: flex;
  gap: 12px;
  width: 100%;
}

.assign-row .el-input {
  flex: 1;
}

.assign-mode {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.smart-hint {
  border: 1px dashed var(--el-color-primary-light-7);
  padding: 12px;
  border-radius: 6px;
}

.smart-recommendation {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.smart-extra {
  color: var(--el-text-color-regular);
  font-size: 13px;
}
</style>

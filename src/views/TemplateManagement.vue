<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { useTemplateStore } from '@/stores/templateStore'
import type { TicketTemplatePayload, TicketTemplate } from '@/types'

const templateStore = useTemplateStore()
const dialogVisible = ref(false)
const editingTemplate = ref<TicketTemplate | null>(null)
const formRef = ref<FormInstance>()
const submitting = ref(false)

const form = reactive<TicketTemplatePayload>({
  name: '',
  ticket_type: 'after_sale',
  category: '',
  priority: 'medium',
  title_template: '',
  description_template: ''
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
  category: [{ required: true, message: '请输入分类', trigger: 'blur' }],
  title_template: [{ required: true, message: '请填写标题模板', trigger: 'blur' }],
  description_template: [{ required: true, message: '请填写描述模板', trigger: 'blur' }]
}

const openCreateDialog = () => {
  editingTemplate.value = null
  Object.assign(form, {
    name: '',
    ticket_type: 'after_sale',
    category: '',
    priority: 'medium',
    title_template: '您好，{customer_name}',
    description_template: ''
  })
  dialogVisible.value = true
}

const openEditDialog = (template: TicketTemplate) => {
  editingTemplate.value = template
  Object.assign(form, {
    name: template.name,
    ticket_type: template.ticket_type,
    category: template.category,
    priority: template.priority,
    title_template: template.title_template,
    description_template: template.description_template
  })
  dialogVisible.value = true
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate()
  submitting.value = true
  try {
    if (editingTemplate.value) {
      await templateStore.updateTemplate(editingTemplate.value.id, form)
      ElMessage.success('模板已更新')
    } else {
      await templateStore.createTemplate(form)
      ElMessage.success('模板已创建')
    }
    dialogVisible.value = false
  } catch (error: any) {
    ElMessage.error(error?.message || '保存模板失败')
  } finally {
    submitting.value = false
  }
}

const handleDelete = async (template: TicketTemplate) => {
  try {
    await ElMessageBox.confirm(`确认删除模板「${template.name}」吗？`, '删除模板', {
      type: 'warning'
    })
    await templateStore.deleteTemplate(template.id)
    ElMessage.success('模板已删除')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

onMounted(() => {
  templateStore.loadTemplates().catch((err) => {
    ElMessage.error(err?.message || '加载模板失败')
  })
})
</script>

<template>
  <div class="template-page">
    <div class="page-header">
      <div>
        <h1>工单模板管理</h1>
        <p>维护常用场景模板，创建工单时可快速套用</p>
      </div>
      <el-button type="primary" @click="openCreateDialog">新建模板</el-button>
    </div>

    <el-table
      :data="templateStore.templates"
      v-loading="templateStore.loading"
      border
      stripe
      empty-text="暂无模板"
    >
      <el-table-column prop="name" label="模板名称" width="180" />
      <el-table-column prop="category" label="分类" width="160" />
      <el-table-column prop="ticket_type" label="工单类型" width="140" />
      <el-table-column prop="priority" label="优先级" width="120" />
      <el-table-column label="标题模板">
        <template #default="{ row }">
          <div class="ellipsis">{{ row.title_template }}</div>
        </template>
      </el-table-column>
      <el-table-column label="描述模板">
        <template #default="{ row }">
          <div class="ellipsis">{{ row.description_template }}</div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="openEditDialog(row)">编辑</el-button>
          <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingTemplate ? '编辑模板' : '新建模板'" width="600px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="模板名称" prop="name">
          <el-input v-model="form.name" placeholder="如：电池续航模板" />
        </el-form-item>
        <el-form-item label="分类" prop="category">
          <el-input v-model="form.category" placeholder="如：售后/物流" />
        </el-form-item>
        <el-form-item label="工单类型">
          <el-select v-model="form.ticket_type">
            <el-option label="售前" value="pre_sale" />
            <el-option label="售后" value="after_sale" />
            <el-option label="投诉" value="complaint" />
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
        <el-form-item label="标题模板" prop="title_template">
          <el-input v-model="form.title_template" placeholder="例如：{customer_name} 的问题" />
          <small class="hint">支持变量：{customer_name}</small>
        </el-form-item>
        <el-form-item label="描述模板" prop="description_template">
          <el-input
            v-model="form.description_template"
            type="textarea"
            :rows="6"
            placeholder="模板内容"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.template-page {
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header p {
  margin: 6px 0 0;
  color: var(--el-text-color-secondary);
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-word;
}

.hint {
  display: block;
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>

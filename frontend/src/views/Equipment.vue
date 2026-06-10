<template>
  <div class="page-wrap">
    <div class="page-card">
      <div class="page-title"><el-icon><Goods /></el-icon>器材台账管理</div>
      <div class="toolbar">
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <el-input v-model="kw" placeholder="搜索名称/编号/品牌" clearable style="width:240px" :prefix-icon="Search" @clear="load" @keyup.enter="load" />
          <el-select v-model="categoryFilter" placeholder="选择分类" clearable style="width:150px" @change="load">
            <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
          </el-select>
          <el-select v-model="statusFilter" placeholder="状态" clearable style="width:130px" @change="load">
            <el-option label="正常" value="NORMAL" />
            <el-option label="借出中" value="BORROWED" />
            <el-option label="损坏" value="DAMAGED" />
            <el-option label="维修中" value="REPAIRING" />
            <el-option label="已报废" value="SCRAPPED" />
          </el-select>
          <el-button type="primary" :icon="Search" @click="load">查询</el-button>
        </div>
        <div>
          <el-button v-if="isAdmin" type="primary" :icon="Plus" @click="openForm()">新增器材</el-button>
        </div>
      </div>
      <el-table :data="list" stripe border v-loading="loading">
        <el-table-column prop="code" label="器材编号" width="140" />
        <el-table-column prop="name" label="名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="category" label="分类" width="100" />
        <el-table-column prop="brand" label="品牌" width="100" />
        <el-table-column prop="model" label="型号" width="120" show-overflow-tooltip />
        <el-table-column label="库存" width="140">
          <template #default="{row}">
            <el-tag type="success">{{ row.available_quantity }}</el-tag> / {{ row.total_quantity }}
          </template>
        </el-table-column>
        <el-table-column prop="location" label="位置" width="140" show-overflow-tooltip />
        <el-table-column prop="original_price" label="原价(元)" width="100" align="right" />
        <el-table-column label="状态" width="100">
          <template #default="{row}"><el-tag :type="statusTag(row.status)" size="small">{{ statusText(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{row}">
            <el-button link type="primary" @click="showTimeline(row)">时间线</el-button>
            <el-button v-if="isAdmin" link type="primary" @click="openForm(row)">编辑</el-button>
            <el-button v-if="isAdmin" link type="warning" @click="adjust(row)">调整库存</el-button>
            <el-button v-if="isAdmin" link type="danger" @click="del(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="formVisible" :title="form.id ? '编辑器材' : '新增器材'" width="620px">
      <el-form :model="form" label-width="100px">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="器材编号" required><el-input v-model="form.code" :disabled="!!form.id" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="分类" required><el-input v-model="form.category" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="存放位置" required><el-input v-model="form.location" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="品牌"><el-input v-model="form.brand" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="型号"><el-input v-model="form.model" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="原价(元)"><el-input-number v-model="form.original_price" :min="0" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="采购日期"><el-date-picker v-model="form.purchase_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="入库数量" required><el-input-number v-model="form.total_quantity" :min="1" style="width:100%" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="formVisible=false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="adjustVisible" title="调整库存" width="400px">
      <el-form label-width="100px">
        <el-form-item label="器材">{{ cur.name }}</el-form-item>
        <el-form-item label="当前总数">{{ cur.total_quantity }}</el-form-item>
        <el-form-item label="目标总数" required><el-input-number v-model="adjustQty" :min="0" style="width:100%" /></el-form-item>
        <el-form-item label="调整原因"><el-input v-model="adjustRemark" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustVisible=false">取消</el-button>
        <el-button type="primary" @click="doAdjust">确认调整</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="timelineVisible" :title="`${cur?.name} 时间线`" width="560px">
      <div class="timeline" v-if="timeline.length">
        <div class="timeline-item" v-for="(t,i) in timeline" :key="i">
          <div class="time">{{ t.time }}</div>
          <div class="title">{{ t.title }}</div>
          <div class="content">{{ t.content }}</div>
        </div>
      </div>
      <el-empty v-else description="暂无数据" />
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../utils/request'
import { useUserStore } from '../stores/user'
import { Search, Plus } from '@element-plus/icons-vue'

const userStore = useUserStore()
const isAdmin = computed(() => userStore.hasRole(['ADMIN']))
const list = ref([]); const loading = ref(false)
const kw = ref(''); const categoryFilter = ref(''); const statusFilter = ref('')
const categories = ref([])
const formVisible = ref(false); const adjustVisible = ref(false); const timelineVisible = ref(false)
const form = reactive({}); const cur = ref({})
const adjustQty = ref(0); const adjustRemark = ref('')
const timeline = ref([])

const statusText = (s) => ({ NORMAL:'正常', BORROWED:'借出中', DAMAGED:'损坏', REPAIRING:'维修中', SCRAPPED:'已报废' }[s]||s)
const statusTag = (s) => ({ NORMAL:'success', BORROWED:'warning', DAMAGED:'danger', REPAIRING:'warning', SCRAPPED:'info' }[s]||'')

const load = async () => {
  loading.value = true
  try {
    const r = await request.get('/equipments', { params: { keyword: kw.value, category: categoryFilter.value, status: statusFilter.value } })
    list.value = r.data
  } finally { loading.value = false }
}
const loadCategories = async () => { try { const r = await request.get('/equipments/categories'); categories.value = r.data } catch (e) {} }
const openForm = (row) => { Object.assign(form, row ? { ...row } : { code: '', name: '', category: '', brand: '', model: '', location: '', purchase_date: '', original_price: 0, total_quantity: 1, description: '' }); formVisible.value = true }
const save = async () => {
  if (!form.code || !form.name || !form.category || !form.location) { ElMessage.warning('必填项不能为空'); return }
  try {
    if (form.id) await request.put(`/equipments/${form.id}`, form)
    else await request.post('/equipments', form)
    ElMessage.success('保存成功'); formVisible.value = false; load()
  } catch (e) {}
}
const adjust = (row) => { cur.value = row; adjustQty.value = row.total_quantity; adjustRemark.value = ''; adjustVisible.value = true }
const doAdjust = async () => {
  try { await request.post(`/equipments/${cur.value.id}/adjust`, { quantity: adjustQty.value, remark: adjustRemark.value }); ElMessage.success('调整成功'); adjustVisible.value = false; load() } catch (e) {}
}
const del = (row) => {
  ElMessageBox.confirm(`确认删除器材 ${row.name}？删除后不可恢复`, '警告', { type: 'error' }).then(async () => {
    try { await request.delete(`/equipments/${row.id}`); ElMessage.success('删除成功'); load() } catch (e) {}
  }).catch(() => {})
}
const showTimeline = async (row) => {
  cur.value = row; timelineVisible.value = true; timeline.value = []
  try { const r = await request.get(`/equipments/${row.id}/timeline`); timeline.value = r.data } catch (e) {}
}
onMounted(() => { load(); loadCategories() })
</script>

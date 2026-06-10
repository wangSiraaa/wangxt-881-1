<template>
  <div class="page-wrap">
    <div class="page-card">
      <div class="page-title"><el-icon><Promotion /></el-icon>借用归还管理</div>
      <div class="toolbar">
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <el-select v-model="statusFilter" placeholder="状态" clearable style="width:140px" @change="load">
            <el-option label="借用中" value="BORROWED" />
            <el-option label="已归还" value="RETURNED" />
            <el-option label="逾期" value="OVERDUE" />
          </el-select>
          <el-button type="primary" :icon="Refresh" @click="load">刷新</el-button>
        </div>
        <div>
          <el-button v-if="canBorrow" type="primary" :icon="Plus" @click="openBorrow()">借用登记</el-button>
        </div>
      </div>
      <el-table :data="list" stripe border v-loading="loading">
        <el-table-column prop="equipment_code" label="器材编号" width="130" />
        <el-table-column prop="equipment_name" label="器材名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="borrower_name" label="借用人" width="90" />
        <el-table-column label="数量" width="70" prop="quantity" align="center" />
        <el-table-column prop="borrow_date" label="借用日期" width="110" />
        <el-table-column prop="expected_return_date" label="预计归还" width="110" />
        <el-table-column prop="actual_return_date" label="实际归还" width="110" />
        <el-table-column prop="purpose" label="用途" min-width="120" show-overflow-tooltip />
        <el-table-column label="状态" width="100">
          <template #default="{row}"><el-tag :type="row.status==='BORROWED'?'warning':(row.status==='RETURNED'?'success':'danger')" size="small">{{ row.status==='BORROWED'?'借用中':(row.status==='RETURNED'?'已归还':'逾期') }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{row}">
            <el-button v-if="isAdmin && row.status==='BORROWED'" link type="success" @click="doReturn(row)">归还确认</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="borrowVisible" title="借用登记" width="520px">
      <el-form :model="bf" label-width="100px">
        <el-form-item label="选择器材" required>
          <el-select v-model="bf.equipment_id" filterable placeholder="搜索并选择器材" style="width:100%" @change="onEqChange">
            <el-option v-for="e in eqList" :key="e.id" :label="`${e.code} - ${e.name} (可用:${e.available_quantity}/${e.total_quantity})`" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="curEq" label="位置">{{ curEq.location }} | 状态: {{ statusText(curEq.status) }}</el-form-item>
        <el-form-item label="借用数量" required>
          <el-input-number v-model="bf.quantity" :min="1" :max="curEq?.available_quantity || 1" />
        </el-form-item>
        <el-form-item label="借用日期" required><el-date-picker v-model="bf.borrow_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        <el-form-item label="预计归还"><el-date-picker v-model="bf.expected_return_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        <el-form-item label="用途"><el-input v-model="bf.purpose" type="textarea" :rows="2" placeholder="如：高二篮球联赛" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="borrowVisible=false">取消</el-button>
        <el-button type="primary" @click="submitBorrow">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '../utils/request'
import { useUserStore } from '../stores/user'
import { Refresh, Plus } from '@element-plus/icons-vue'

const userStore = useUserStore()
const isAdmin = computed(() => userStore.hasRole(['ADMIN']))
const canBorrow = computed(() => userStore.hasRole(['ADMIN', 'TEACHER']))
const list = ref([]); const loading = ref(false); const statusFilter = ref('')
const borrowVisible = ref(false); const eqList = ref([]); const curEq = ref(null)
const bf = reactive({ equipment_id: null, quantity: 1, borrow_date: new Date().toISOString().split('T')[0], expected_return_date: '', purpose: '' })
const statusText = (s) => ({ NORMAL:'正常', BORROWED:'借出中', DAMAGED:'损坏', REPAIRING:'维修中', SCRAPPED:'已报废' }[s]||s)

const load = async () => {
  loading.value = true
  try { const r = await request.get('/borrows', { params: { status: statusFilter.value } }); list.value = r.data } finally { loading.value = false }
}
const loadEqs = async () => { try { const r = await request.get('/equipments', { params: { status: 'NORMAL' } }); eqList.value = r.data.filter(e => e.status !== 'SCRAPPED' && e.available_quantity > 0) } catch (e) {} }
const onEqChange = (id) => { curEq.value = eqList.value.find(e => e.id === id); bf.quantity = 1 }
const openBorrow = () => { Object.assign(bf, { equipment_id: null, quantity: 1, borrow_date: new Date().toISOString().split('T')[0], expected_return_date: '', purpose: '' }); curEq.value = null; loadEqs(); borrowVisible.value = true }
const submitBorrow = async () => {
  if (!bf.equipment_id || !bf.quantity || !bf.borrow_date) { ElMessage.warning('请完善必填信息'); return }
  try { await request.post('/borrows', bf); ElMessage.success('借用登记成功'); borrowVisible.value = false; load() } catch (e) {}
}
const doReturn = (row) => {
  ElMessageBox.confirm(`确认 ${row.borrower_name} 借用的 ${row.equipment_name} × ${row.quantity} 已归还？`, '归还确认', { type: 'success' }).then(async () => {
    try { await request.post(`/borrows/${row.id}/return`, { remark: '归还入库' }); ElMessage.success('归还确认成功'); load() } catch (e) {}
  }).catch(() => {})
}
onMounted(load)
</script>

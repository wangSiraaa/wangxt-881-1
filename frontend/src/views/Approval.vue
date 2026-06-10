<template>
  <div class="page-wrap">
    <div class="page-card">
      <div class="page-title"><el-icon><DocumentChecked /></el-icon>审批中心</div>
      <el-tabs v-model="tab">
        <el-tab-pane label="待我审批" name="todo">
          <el-alert type="info" :closable="false" style="margin-bottom:12px">
            报价超过 <b>¥{{threshold}}</b> 的报损单仅 <b>总务审批人</b> 有权审批通过
          </el-alert>
          <el-table :data="todoList" stripe border v-loading="loading">
            <el-table-column prop="code" label="单号" width="170" />
            <el-table-column prop="equipment_name" label="器材" min-width="130" show-overflow-tooltip />
            <el-table-column label="数量" width="60" align="center" prop="quantity" />
            <el-table-column label="报价" width="100" align="right">
              <template #default="{row}"><b style="color:#f56c6c">¥{{row.quote_amount}}</b></template>
            </el-table-column>
            <el-table-column label="超限" width="70" align="center">
              <template #default="{row}"><el-tag v-if="row.needs_general_approval" type="danger" size="small">是</el-tag><span v-else>否</span></template>
            </el-table-column>
            <el-table-column prop="reporter_name" label="报损人" width="80" />
            <el-table-column prop="created_at" label="报损时间" width="150" />
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{row}">
                <el-button link type="success" @click="openApproval(row, true)">通过</el-button>
                <el-button link type="danger" @click="openApproval(row, false)">驳回</el-button>
                <el-button link type="primary" @click="showDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="我已审批" name="done">
          <el-table :data="doneList" stripe border v-loading="loading">
            <el-table-column prop="code" label="单号" width="170" />
            <el-table-column prop="equipment_name" label="器材" min-width="130" show-overflow-tooltip />
            <el-table-column label="决策" width="80">
              <template #default="{row}">
                <el-tag v-if="row.status==='REJECTED'" type="info">驳回</el-tag>
                <el-tag v-else-if="row.decision==='REPAIR'" type="primary">维修</el-tag>
                <el-tag v-else-if="row.decision==='SCRAP'" type="danger">报废</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="报价" width="100" align="right">
              <template #default="{row}">{{row.quote_amount?'¥'+row.quote_amount:'-'}}</template>
            </el-table-column>
            <el-table-column prop="approval_remark" label="审批备注" show-overflow-tooltip />
            <el-table-column prop="approval_time" label="审批时间" width="160" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="approvalVisible" :title="af.approved ? '审批通过' : '审批驳回'" width="520px">
      <el-descriptions v-if="cur" :column="2" border size="small" style="margin-bottom:16px">
        <el-descriptions-item label="单号" :span="2">{{ cur.code }}</el-descriptions-item>
        <el-descriptions-item label="器材">{{ cur.equipment_name }}</el-descriptions-item>
        <el-descriptions-item label="数量">{{ cur.quantity }}</el-descriptions-item>
        <el-descriptions-item label="报价" :span="2"><b style="color:#f56c6c">¥{{cur.quote_amount}}</b> (阈值: ¥{{threshold}})</el-descriptions-item>
        <el-descriptions-item label="超限" :span="2">{{ cur.needs_general_approval ? '是 - 需要总务审批' : '否' }}</el-descriptions-item>
        <el-descriptions-item label="损坏说明" :span="2">{{ cur.description }}</el-descriptions-item>
      </el-descriptions>
      <el-form label-width="100px">
        <el-form-item v-if="af.approved" label="处理决策" required>
          <el-radio-group v-model="af.decision">
            <el-radio value="REPAIR">维修</el-radio>
            <el-radio value="SCRAP">报废 <el-tag size="small" type="danger">有未归还借用则失败</el-tag></el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="审批备注"><el-input v-model="af.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approvalVisible=false">取消</el-button>
        <el-button :type="af.approved ? 'success' : 'danger'" @click="submitApproval">确认</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" title="报损单详情" width="600px">
      <el-descriptions v-if="cur" :column="2" border size="small">
        <el-descriptions-item label="单号" :span="2">{{ cur.code }}</el-descriptions-item>
        <el-descriptions-item label="器材">{{ cur.equipment_name }} ({{cur.equipment_code}})</el-descriptions-item>
        <el-descriptions-item label="数量">{{ cur.quantity }}</el-descriptions-item>
        <el-descriptions-item label="损坏等级">{{ levelText(cur.damage_level) }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag :type="statusTag(cur.status)">{{ statusText(cur.status) }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="报价金额">{{ cur.quote_amount ? '¥'+cur.quote_amount : '-' }}</el-descriptions-item>
        <el-descriptions-item label="决策">{{ cur.decision ? (cur.decision==='REPAIR'?'维修':'报废') : '-' }}</el-descriptions-item>
        <el-descriptions-item label="报损人">{{ cur.reporter_name }}</el-descriptions-item>
        <el-descriptions-item label="审批人">{{ cur.approver_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="损坏说明" :span="2">{{ cur.description }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../utils/request'
import { useUserStore } from '../stores/user'
import { DocumentChecked } from '@element-plus/icons-vue'

const userStore = useUserStore()
const tab = ref('todo'); const loading = ref(false); const threshold = ref(1000)
const todoList = ref([]); const doneList = ref([])
const approvalVisible = ref(false); const detailVisible = ref(false)
const cur = ref(null)
const af = reactive({ approved: true, decision: 'REPAIR', remark: '' })
const statusText = (s) => ({ PENDING_QUOTE:'待报价', PENDING_APPROVAL:'待审批', APPROVED:'已通过', REJECTED:'已驳回', REPAIRING:'维修中', REPAIRED:'已修复', SCRAPPED:'已报废' }[s]||s)
const statusTag = (s) => ({ PENDING_QUOTE:'warning', PENDING_APPROVAL:'danger', APPROVED:'success', REJECTED:'info', REPAIRING:'warning', REPAIRED:'success', SCRAPPED:'danger' }[s]||'')
const levelText = (l) => ({ MINOR:'轻微', MODERATE:'中度', SEVERE:'重度', TOTAL:'完全损坏' }[l]||l)

const load = async () => {
  loading.value = true
  try {
    const all = (await request.get('/damage-reports')).data
    todoList.value = all.filter(r => r.status === 'PENDING_APPROVAL')
    doneList.value = all.filter(r => ['REJECTED','REPAIRING','REPAIRED','SCRAPPED'].includes(r.status))
  } finally { loading.value = false }
}
const loadThreshold = async () => { try { const r = await request.get('/damage-reports/threshold'); threshold.value = r.data.threshold } catch (e) {} }
const openApproval = (row, approved) => {
  cur.value = row
  af.approved = approved
  af.decision = 'REPAIR'
  af.remark = ''
  if (!approved && row.quote_amount > threshold.value && !userStore.hasRole(['GENERAL_AFFAIRS','ADMIN'])) {
    ElMessage.warning(`该单报价超限，仅总务审批人可处理`)
    return
  }
  approvalVisible.value = true
}
const submitApproval = async () => {
  if (af.approved && !af.decision) { ElMessage.warning('请选择决策'); return }
  try { await request.post(`/damage-reports/${cur.value.id}/approve`, af); ElMessage.success(af.approved ? '审批通过' : '已驳回'); approvalVisible.value = false; load() } catch (e) {}
}
const showDetail = async (row) => { try { const r = await request.get(`/damage-reports/${row.id}`); cur.value = r.data; detailVisible.value = true } catch (e) {} }
onMounted(() => { load(); loadThreshold() })
</script>

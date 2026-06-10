<template>
  <div class="page-wrap">
    <div class="page-card">
      <div class="page-title"><el-icon><Warning /></el-icon>报损管理 <el-tag size="small" type="info" style="margin-left:8px">阈值: ¥{{threshold}}</el-tag></div>
      <div class="toolbar">
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <el-select v-model="statusFilter" placeholder="状态" clearable style="width:140px" @change="load">
            <el-option v-for="(v,k) in statusMap" :key="k" :label="v" :value="k" />
          </el-select>
          <el-select v-model="decisionFilter" placeholder="决策" clearable style="width:120px" @change="load">
            <el-option label="维修" value="REPAIR" /><el-option label="报废" value="SCRAP" />
          </el-select>
          <el-button type="primary" :icon="Refresh" @click="load">刷新</el-button>
        </div>
        <div>
          <el-button v-if="canReport" type="warning" :icon="DocumentAdd" @click="openSupplement">补录申请</el-button>
          <el-button v-if="canReport" type="primary" :icon="Plus" @click="openReport()">新建报损</el-button>
        </div>
      </div>
      <el-table :data="list" stripe border v-loading="loading">
        <el-table-column prop="code" label="报损单号" width="170" />
        <el-table-column prop="equipment_code" label="器材编号" width="120" />
        <el-table-column prop="equipment_name" label="器材名称" min-width="120" show-overflow-tooltip />
        <el-table-column label="数量" prop="quantity" width="60" align="center" />
        <el-table-column label="损坏等级" width="90">
          <template #default="{row}"><el-tag :type="levelTag(row.damage_level)" size="small">{{ levelText(row.damage_level) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="报价" width="90" align="right">
          <template #default="{row}"><span v-if="row.quote_amount" style="color:#f56c6c;font-weight:600">¥{{row.quote_amount}}</span><span v-else>-</span></template>
        </el-table-column>
        <el-table-column label="超限" width="60" align="center">
          <template #default="{row}"><el-tag v-if="row.needs_general_approval" type="danger" size="small">是</el-tag><span v-else>否</span></template>
        </el-table-column>
        <el-table-column label="决策" width="70">
          <template #default="{row}">
            <el-tag v-if="row.decision==='REPAIR'" type="primary" size="small">维修</el-tag>
            <el-tag v-else-if="row.decision==='SCRAP'" type="danger" size="small">报废</el-tag><span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{row}"><el-tag :type="statusTag(row.status)" size="small">{{ statusText(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="reporter_name" label="报损人" width="80" />
        <el-table-column prop="created_at" label="创建时间" width="150" />
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{row}">
            <el-button link type="primary" @click="showDetail(row)">详情</el-button>
            <el-button link type="primary" @click="showTimeline(row)">时间线</el-button>
            <el-button v-if="canQuote && row.status==='PENDING_QUOTE'" link type="warning" @click="openQuote(row)">录入报价</el-button>
            <el-button v-if="canApproval && row.status==='PENDING_APPROVAL'" link type="success" @click="openApproval(row)">审批</el-button>
            <el-button v-if="canComplete && row.status==='REPAIRING'" link type="primary" @click="completeRepair(row)">维修完成</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="reportVisible" title="新建报损申请" width="560px">
      <el-form :model="rf" label-width="110px">
        <el-form-item label="选择器材" required>
          <el-select v-model="rf.equipment_id" filterable placeholder="搜索器材名称/编号" style="width:100%">
            <el-option v-for="e in eqList" :key="e.id" :label="`${e.code} - ${e.name} (位置:${e.location}, 可用:${e.available_quantity})`" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="幂等键(防重)" tip="用于防止重复提交，留空将自动生成"><el-input v-model="rf.idempotent_key" placeholder="如: BS-20250610-001" /></el-form-item>
        <el-form-item label="损坏数量" required><el-input-number v-model="rf.quantity" :min="1" style="width:180px" /></el-form-item>
        <el-form-item label="损坏等级" required>
          <el-radio-group v-model="rf.damage_level">
            <el-radio value="MINOR">轻微</el-radio>
            <el-radio value="MODERATE">中度</el-radio>
            <el-radio value="SEVERE">重度</el-radio>
            <el-radio value="TOTAL">完全损坏</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="发现日期" required><el-date-picker v-model="rf.discovery_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        <el-form-item label="损坏地点"><el-input v-model="rf.location" /></el-form-item>
        <el-form-item label="损坏说明" required><el-input v-model="rf.description" type="textarea" :rows="3" placeholder="请详细描述损坏情况" /></el-form-item>
        <el-form-item label="附件(照片/说明)">
          <el-upload action="/api/damage-reports/0/upload" :headers="{Authorization:'Bearer '+token}" :auto-upload="false" :on-change="onFileChange" multiple :limit="5">
            <el-button :icon="Upload">选择文件</el-button>
            <template #tip><div style="color:#909399;font-size:12px;margin-top:4px">保存报损单后可在详情页上传附件</div></template>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reportVisible=false">取消</el-button>
        <el-button type="primary" @click="submitReport">提交报损</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="quoteVisible" title="录入维修报价" width="480px">
      <el-form :model="qf" label-width="100px">
        <el-form-item label="报损单号">{{ cur?.code }}</el-form-item>
        <el-form-item label="器材">{{ cur?.equipment_name }} × {{cur?.quantity}}</el-form-item>
        <el-form-item label="报价金额(元)" required><el-input-number v-model="qf.amount" :min="0" :precision="2" style="width:100%" /></el-form-item>
        <el-form-item label="供应商"><el-input v-model="qf.vendor" placeholder="维修商名称" /></el-form-item>
        <el-form-item label="预计天数"><el-input-number v-model="qf.estimate_days" :min="0" /></el-form-item>
        <el-form-item label="报价说明"><el-input v-model="qf.quote_detail" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="qf.remark" /></el-form-item>
        <el-alert v-if="qf.amount > threshold" type="warning" :closable="false" show-icon>
          报价 ¥{{qf.amount}} 超过阈值 ¥{{threshold}}，将自动提交总务审批
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="quoteVisible=false">取消</el-button>
        <el-button type="primary" @click="submitQuote">提交报价</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="approvalVisible" title="审批报损单" width="560px">
      <el-descriptions :column="2" border size="small" style="margin-bottom:16px">
        <el-descriptions-item label="单号">{{ cur?.code }}</el-descriptions-item>
        <el-descriptions-item label="状态" :span="2">{{ statusText(cur?.status) }} ({{cur?.needs_general_approval ? '需总务审批' : '普通审批'}})</el-descriptions-item>
        <el-descriptions-item label="器材">{{ cur?.equipment_name }}</el-descriptions-item>
        <el-descriptions-item label="数量">{{ cur?.quantity }}</el-descriptions-item>
        <el-descriptions-item label="报价金额" :span="2"><b style="color:#f56c6c;font-size:16px">¥{{ cur?.quote_amount }}</b> (阈值: ¥{{threshold}})</el-descriptions-item>
        <el-descriptions-item label="损坏说明" :span="2">{{ cur?.description }}</el-descriptions-item>
      </el-descriptions>
      <el-form label-width="100px">
        <el-form-item label="审批结果" required>
          <el-radio-group v-model="af.approved">
            <el-radio :value="true">通过</el-radio>
            <el-radio :value="false">驳回</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="af.approved" label="处理决策" required>
          <el-radio-group v-model="af.decision">
            <el-radio value="REPAIR">维修</el-radio>
            <el-radio value="SCRAP">报废<el-tag size="small" type="danger" style="margin-left:4px">注意：存在未归还借用时无法报废</el-tag></el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="审批备注"><el-input v-model="af.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approvalVisible=false">取消</el-button>
        <el-button type="primary" @click="submitApproval">确认审批</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" :title="`报损单详情 - ${cur?.code}`" width="640px">
      <el-descriptions :column="2" border size="small" v-if="cur">
        <el-descriptions-item label="单号" :span="2">{{ cur.code }}</el-descriptions-item>
        <el-descriptions-item label="器材">{{ cur.equipment_name }} ({{cur.equipment_code}})</el-descriptions-item>
        <el-descriptions-item label="数量">{{ cur.quantity }}</el-descriptions-item>
        <el-descriptions-item label="状态"><el-tag :type="statusTag(cur.status)">{{ statusText(cur.status) }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="损坏等级">{{ levelText(cur.damage_level) }}</el-descriptions-item>
        <el-descriptions-item label="报价">{{ cur.quote_amount ? '¥'+cur.quote_amount : '-' }}</el-descriptions-item>
        <el-descriptions-item label="决策">{{ cur.decision ? (cur.decision==='REPAIR'?'维修':'报废') : '-' }}</el-descriptions-item>
        <el-descriptions-item label="报损人">{{ cur.reporter_name }}</el-descriptions-item>
        <el-descriptions-item label="审批人">{{ cur.approver_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="损坏说明" :span="2">{{ cur.description }}</el-descriptions-item>
        <el-descriptions-item label="审批备注" :span="2">{{ cur.approval_remark || '-' }}</el-descriptions-item>
      </el-descriptions>
      <el-divider v-if="cur?.quotes?.length">报价记录</el-divider>
      <el-table v-if="cur?.quotes?.length" :data="cur.quotes" size="small" border>
        <el-table-column prop="amount" label="金额" width="90" />
        <el-table-column prop="vendor" label="供应商" width="120" />
        <el-table-column prop="quoter_name" label="录入人" width="80" />
        <el-table-column label="是否超限" width="80">
          <template #default="{row}"><el-tag v-if="row.is_exceed_threshold" type="danger" size="small">是</el-tag><span v-else>否</span></template>
        </el-table-column>
        <el-table-column prop="quote_detail" label="说明" show-overflow-tooltip />
        <el-table-column prop="created_at" label="时间" width="150" />
      </el-table>
      <el-divider v-if="cur?.attachments?.length">附件</el-divider>
      <div v-if="cur?.attachments?.length" style="display:flex;gap:8px;flex-wrap:wrap">
        <el-tag v-for="f in cur.attachments" :key="f.id" type="info" size="large"><el-icon style="margin-right:4px"><Paperclip /></el-icon>{{ f.original_name }}</el-tag>
      </div>
    </el-dialog>

    <el-dialog v-model="timelineVisible" :title="`${cur?.code} 时间线`" width="500px">
      <div class="timeline">
        <div class="timeline-item" v-for="(t,i) in timeline" :key="i">
          <div class="time">{{ t.time }}</div>
          <div class="title">{{ t.title }}</div>
          <div class="content">{{ t.content }}</div>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="supplementVisible" title="补录申请 - 按台账筛选批量报损" width="600px">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom:16px">
        按器材台账当前筛选条件批量创建报损单。借出未归还的器材将被自动跳过。
      </el-alert>
      <el-form :model="sf" label-width="110px">
        <el-divider content-position="left">台账筛选条件（与器材台账页一致）</el-divider>
        <el-form-item label="关键词"><el-input v-model="sf.keyword" placeholder="名称/编号/品牌" clearable /></el-form-item>
        <el-form-item label="分类">
          <el-select v-model="sf.category" placeholder="选择分类" clearable style="width:100%">
            <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="器材状态">
          <el-select v-model="sf.status" placeholder="状态" clearable style="width:100%">
            <el-option label="正常" value="NORMAL" /><el-option label="借出中" value="BORROWED" /><el-option label="损坏" value="DAMAGED" /><el-option label="维修中" value="REPAIRING" /><el-option label="已报废" value="SCRAPPED" />
          </el-select>
        </el-form-item>
        <el-divider content-position="left">报损信息（统一填写）</el-divider>
        <el-form-item label="损坏数量" required><el-input-number v-model="sf.quantity" :min="1" style="width:180px" /></el-form-item>
        <el-form-item label="损坏等级" required>
          <el-radio-group v-model="sf.damage_level">
            <el-radio value="MINOR">轻微</el-radio>
            <el-radio value="MODERATE">中度</el-radio>
            <el-radio value="SEVERE">重度</el-radio>
            <el-radio value="TOTAL">完全损坏</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="发现日期" required><el-date-picker v-model="sf.discovery_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        <el-form-item label="损坏地点"><el-input v-model="sf.location" /></el-form-item>
        <el-form-item label="损坏说明" required><el-input v-model="sf.description" type="textarea" :rows="3" placeholder="统一描述损坏情况" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="supplementVisible=false">取消</el-button>
        <el-button type="primary" @click="submitSupplement" :loading="supplementLoading">提交补录</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="suppResultVisible" title="补录申请结果" width="680px">
      <el-descriptions :column="3" border size="small" style="margin-bottom:16px">
        <el-descriptions-item label="匹配器材">{{ suppResult.total }}</el-descriptions-item>
        <el-descriptions-item label="成功"><span style="color:#67c23a;font-weight:600">{{ suppResult.succeeded }}</span></el-descriptions-item>
        <el-descriptions-item label="跳过/失败"><span style="color:#f56c6c;font-weight:600">{{ suppResult.failed }}</span></el-descriptions-item>
      </el-descriptions>
      <el-table :data="suppResult.results" size="small" border max-height="320">
        <el-table-column prop="code" label="器材编号" width="130" />
        <el-table-column prop="name" label="器材名称" min-width="120" show-overflow-tooltip />
        <el-table-column label="结果" width="80" align="center">
          <template #default="{row}">
            <el-tag :type="row.success ? 'success' : 'danger'" size="small">{{ row.success ? '成功' : '拒绝' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="报损单号" width="160">
          <template #default="{row}">{{ row.report_code || '-' }}</template>
        </el-table-column>
        <el-table-column prop="message" label="说明" min-width="160" show-overflow-tooltip>
          <template #default="{row}">
            <span :style="{color: row.borrowed ? '#e6a23c' : row.success ? '#67c23a' : '#f56c6c'}">{{ row.message }}</span>
          </template>
        </el-table-column>
      </el-table>
      <template #footer><el-button type="primary" @click="suppResultVisible=false;load()">关闭并刷新</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../utils/request'
import { useUserStore } from '../stores/user'
import { Warning, Refresh, Plus, Upload, Paperclip, DocumentAdd } from '@element-plus/icons-vue'

const userStore = useUserStore()
const token = computed(() => userStore.token)
const canReport = computed(() => userStore.hasRole(['TEACHER', 'ADMIN']))
const canQuote = computed(() => userStore.hasRole(['QUOTATION', 'ADMIN']))
const canApproval = computed(() => userStore.hasRole(['GENERAL_AFFAIRS', 'ADMIN']))
const canComplete = computed(() => userStore.hasRole(['ADMIN', 'QUOTATION']))

const list = ref([]); const loading = ref(false)
const statusFilter = ref(''); const decisionFilter = ref(''); const threshold = ref(1000)
const statusMap = { PENDING_QUOTE:'待报价', PENDING_APPROVAL:'待审批', REJECTED:'已驳回', REPAIRING:'维修中', REPAIRED:'已修复', SCRAPPED:'已报废' }
const statusText = (s) => statusMap[s] || s
const statusTag = (s) => ({ PENDING_QUOTE:'warning', PENDING_APPROVAL:'danger', APPROVED:'success', REJECTED:'info', REPAIRING:'warning', REPAIRED:'success', SCRAPPED:'danger' }[s] || '')
const levelText = (l) => ({ MINOR:'轻微', MODERATE:'中度', SEVERE:'重度', TOTAL:'完全损坏' }[l] || l)
const levelTag = (l) => ({ MINOR:'success', MODERATE:'warning', SEVERE:'danger', TOTAL:'danger' }[l] || '')

const reportVisible = ref(false); const quoteVisible = ref(false); const approvalVisible = ref(false); const detailVisible = ref(false); const timelineVisible = ref(false)
const eqList = ref([]); const cur = ref(null); const timeline = ref([])
const rf = reactive({ equipment_id: null, idempotent_key: '', quantity: 1, damage_level: 'MODERATE', discovery_date: new Date().toISOString().split('T')[0], location: '', description: '' })
const qf = reactive({ amount: 0, vendor: '', estimate_days: null, quote_detail: '', remark: '' })
const af = reactive({ approved: true, decision: 'REPAIR', remark: '' })

const supplementVisible = ref(false); const supplementLoading = ref(false); const suppResultVisible = ref(false)
const categories = ref([])
const sf = reactive({ keyword: '', category: '', status: '', quantity: 1, damage_level: 'MODERATE', discovery_date: new Date().toISOString().split('T')[0], location: '', description: '' })
const suppResult = reactive({ total: 0, succeeded: 0, failed: 0, results: [] })

const onFileChange = () => {}
const load = async () => {
  loading.value = true
  try { const r = await request.get('/damage-reports', { params: { status: statusFilter.value, decision: decisionFilter.value } }); list.value = r.data } finally { loading.value = false }
}
const loadThreshold = async () => { try { const r = await request.get('/damage-reports/threshold'); threshold.value = r.data.threshold } catch (e) {} }
const loadCategories = async () => { try { const r = await request.get('/equipments/categories'); categories.value = r.data } catch (e) {} }
const openSupplement = async () => {
  Object.assign(sf, { keyword: '', category: '', status: '', quantity: 1, damage_level: 'MODERATE', discovery_date: new Date().toISOString().split('T')[0], location: '', description: '' })
  await loadCategories()
  supplementVisible.value = true
}
const submitSupplement = async () => {
  if (!sf.damage_level || !sf.description) { ElMessage.warning('请完善损坏等级和说明'); return }
  supplementLoading.value = true
  try {
    const r = await request.post('/damage-reports/supplement', sf)
    Object.assign(suppResult, r.data)
    supplementVisible.value = false
    suppResultVisible.value = true
    const borrowed = r.data.results.filter(x => x.borrowed).length
    if (borrowed > 0) ElMessage.warning(`${borrowed} 件借出未归还器材已跳过`)
  } catch (e) {} finally { supplementLoading.value = false }
}
const openReport = async () => {
  Object.assign(rf, { equipment_id: null, idempotent_key: '', quantity: 1, damage_level: 'MODERATE', discovery_date: new Date().toISOString().split('T')[0], location: '', description: '' })
  rf.idempotent_key = `report-${userStore.user.id}-${Date.now()}`
  eqList.value = (await request.get('/equipments')).data.filter(e => e.status !== 'SCRAPPED' && e.total_quantity > 0)
  reportVisible.value = true
}
const submitReport = async () => {
  if (!rf.equipment_id || !rf.description || !rf.damage_level) { ElMessage.warning('请完善必填信息'); return }
  try {
    const r = await request.post('/damage-reports', rf)
    if (r.idempotent) ElMessage.info('已命中幂等，该报损单已存在')
    else ElMessage.success(`报损单创建成功: ${r.data.code}`)
    reportVisible.value = false; load()
  } catch (e) {}
}
const openQuote = (row) => { cur.value = row; Object.assign(qf, { amount: 0, vendor: '', estimate_days: null, quote_detail: '', remark: '' }); quoteVisible.value = true }
const submitQuote = async () => {
  if (!qf.amount || qf.amount <= 0) { ElMessage.warning('请输入报价金额'); return }
  try { const r = await request.post(`/damage-reports/${cur.value.id}/quote`, qf); ElMessage.success(r.data?.message || '报价录入成功'); quoteVisible.value = false; load() } catch (e) {}
}
const openApproval = (row) => { cur.value = row; Object.assign(af, { approved: true, decision: 'REPAIR', remark: '' }); approvalVisible.value = true }
const submitApproval = async () => {
  if (af.approved && !af.decision) { ElMessage.warning('请选择处理决策'); return }
  try { await request.post(`/damage-reports/${cur.value.id}/approve`, af); ElMessage.success(af.approved ? '审批通过' : '已驳回'); approvalVisible.value = false; load() } catch (e) {}
}
const completeRepair = async (row) => {
  try { await request.post(`/damage-reports/${row.id}/complete-repair`, { repair_note: '维修完成' }); ElMessage.success('维修完成，库存已恢复'); load() } catch (e) {}
}
const showDetail = async (row) => {
  try { const r = await request.get(`/damage-reports/${row.id}`); cur.value = r.data; detailVisible.value = true } catch (e) {}
}
const showTimeline = async (row) => {
  cur.value = row; timeline.value = []; timelineVisible.value = true
  try { const r = await request.get(`/damage-reports/${row.id}/timeline`); timeline.value = r.data } catch (e) {}
}
onMounted(() => { load(); loadThreshold(); loadCategories() })
</script>

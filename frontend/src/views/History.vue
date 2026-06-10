<template>
  <div class="page-wrap">
    <div class="page-card">
      <div class="page-title"><el-icon><Clock /></el-icon>历史查询</div>
      <el-tabs v-model="tab" @tab-change="onTabChange">
        <el-tab-pane label="库存变更记录" name="inventory">
          <div class="toolbar">
            <el-select v-model="invType" placeholder="变更类型" clearable style="width:160px" @change="loadInv">
              <el-option v-for="(v,k) in invTypeMap" :key="k" :label="v" :value="k" />
            </el-select>
            <el-input v-model="invKw" placeholder="器材编号/名称" clearable style="width:220px" @keyup.enter="loadInv" />
            <el-button type="primary" @click="loadInv">查询</el-button>
          </div>
          <el-table :data="invList" stripe border v-loading="invLoading">
            <el-table-column label="时间" prop="created_at" width="160" />
            <el-table-column prop="equipment_code" label="器材编号" width="130" />
            <el-table-column prop="equipment_name" label="器材名称" min-width="140" show-overflow-tooltip />
            <el-table-column label="变更类型" width="100">
              <template #default="{row}"><el-tag size="small">{{row.change_type_text}}</el-tag></template>
            </el-table-column>
            <el-table-column label="变化量" width="90" align="center">
              <template #default="{row}">
                <b :style="{color: row.quantity_change>0?'#67c23a':'#f56c6c'}">{{row.quantity_change>0?'+':''}}{{row.quantity_change}}</b>
              </template>
            </el-table-column>
            <el-table-column label="可用库存" width="130">
              <template #default="{row}">{{row.available_before}} → {{row.available_after}}</template>
            </el-table-column>
            <el-table-column prop="operator_name" label="操作人" width="90" />
            <el-table-column prop="remark" label="备注" min-width="140" show-overflow-tooltip />
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="借用历史" name="borrow">
          <el-table :data="borrowList" stripe border v-loading="borrowLoading">
            <el-table-column prop="equipment_code" label="器材编号" width="130" />
            <el-table-column prop="equipment_name" label="器材名称" min-width="140" show-overflow-tooltip />
            <el-table-column prop="borrower_name" label="借用人" width="90" />
            <el-table-column prop="quantity" label="数量" width="60" align="center" />
            <el-table-column prop="borrow_date" label="借用" width="110" />
            <el-table-column prop="expected_return_date" label="预计归还" width="110" />
            <el-table-column prop="actual_return_date" label="实际归还" width="110" />
            <el-table-column label="状态" width="90">
              <template #default="{row}"><el-tag :type="row.status==='BORROWED'?'warning':(row.status==='RETURNED'?'success':'danger')" size="small">{{ row.status==='BORROWED'?'借用中':(row.status==='RETURNED'?'已归还':'逾期') }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="purpose" label="用途" min-width="140" show-overflow-tooltip />
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="报损历史" name="damage">
          <el-table :data="damageList" stripe border v-loading="damageLoading">
            <el-table-column prop="code" label="单号" width="170" />
            <el-table-column prop="equipment_code" label="器材编号" width="120" />
            <el-table-column prop="equipment_name" label="器材名称" min-width="130" show-overflow-tooltip />
            <el-table-column prop="quantity" label="数量" width="60" align="center" />
            <el-table-column label="等级" width="80">
              <template #default="{row}"><el-tag :type="({MINOR:'success',MODERATE:'warning',SEVERE:'danger',TOTAL:'danger'}[row.damage_level])" size="small">{{({MINOR:'轻微',MODERATE:'中度',SEVERE:'重度',TOTAL:'完全'}[row.damage_level])}}</el-tag></template>
            </el-table-column>
            <el-table-column label="报价" width="90" align="right">
              <template #default="{row}">{{row.quote_amount?'¥'+row.quote_amount:'-'}}</template>
            </el-table-column>
            <el-table-column label="决策" width="70">
              <template #default="{row}">
                <el-tag v-if="row.decision==='REPAIR'" type="primary" size="small">维修</el-tag>
                <el-tag v-else-if="row.decision==='SCRAP'" type="danger" size="small">报废</el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{row}"><el-tag :type="({PENDING_QUOTE:'warning',PENDING_APPROVAL:'danger',REJECTED:'info',REPAIRING:'warning',REPAIRED:'success',SCRAPPED:'danger'}[row.status])" size="small">{{({PENDING_QUOTE:'待报价',PENDING_APPROVAL:'待审批',REJECTED:'驳回',REPAIRING:'维修中',REPAIRED:'已修复',SCRAPPED:'已报废'}[row.status])}}</el-tag></template>
            </el-table-column>
            <el-table-column prop="reporter_name" label="报损人" width="80" />
            <el-table-column prop="approver_name" label="审批人" width="80" />
            <el-table-column prop="created_at" label="创建时间" width="160" />
            <el-table-column prop="completed_time" label="完成时间" width="160" />
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="审计日志" name="audit">
          <el-alert type="info" :closable="false" style="margin-bottom:12px">仅 器材管理员 / 总务审批人 可查看审计日志</el-alert>
          <el-table :data="auditList" stripe border v-loading="auditLoading">
            <el-table-column label="时间" prop="created_at" width="160" />
            <el-table-column prop="username" label="账号" width="110" />
            <el-table-column label="角色" width="100">
              <template #default="{row}">{{({TEACHER:'体育老师',ADMIN:'器材管理员',GENERAL_AFFAIRS:'总务审批',QUOTATION:'报价录入'})[row.role] || row.role}}</template>
            </el-table-column>
            <el-table-column prop="action" label="操作" width="180" />
            <el-table-column prop="target_type" label="对象类型" width="110" />
            <el-table-column prop="target_id" label="对象ID" width="80" align="right" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import request from '../utils/request'
import { useUserStore } from '../stores/user'
import { Clock } from '@element-plus/icons-vue'

const userStore = useUserStore()
const tab = ref('inventory')
const invList = ref([]); const invLoading = ref(false); const invType = ref(''); const invKw = ref('')
const invTypeMap = { PURCHASE:'采购入库', BORROW_OUT:'借用出库', RETURN:'归还入库', DAMAGE:'报损', REPAIR_COMPLETE:'维修完成', SCRAP:'报废', ADJUST:'库存调整' }
const borrowList = ref([]); const borrowLoading = ref(false)
const damageList = ref([]); const damageLoading = ref(false)
const auditList = ref([]); const auditLoading = ref(false)

const LOADERS = {
  inventory: () => loadInv(),
  borrow: () => loadBorrow(),
  damage: () => loadDamage(),
  audit: () => loadAudit(),
}

const loadInv = async () => {
  invLoading.value = true
  try {
    let all = (await request.get('/audit/inventory-changes', { params: { changeType: invType.value, limit: 1000 } })).data
    if (invKw.value) all = all.filter(x => (x.equipment_code||'').includes(invKw.value) || (x.equipment_name||'').includes(invKw.value))
    invList.value = all
  } finally { invLoading.value = false }
}
const loadBorrow = async () => {
  borrowLoading.value = true
  try { borrowList.value = (await request.get('/borrows')).data } finally { borrowLoading.value = false }
}
const loadDamage = async () => {
  damageLoading.value = true
  try { damageList.value = (await request.get('/damage-reports')).data } finally { damageLoading.value = false }
}
const loadAudit = async () => {
  if (!userStore.hasRole(['ADMIN', 'GENERAL_AFFAIRS'])) return
  auditLoading.value = true
  try { auditList.value = (await request.get('/audit/logs')).data?.list || [] } catch (e) { console.warn('[audit] 加载审计日志失败:', e) } finally { auditLoading.value = false }
}
const onTabChange = (t) => {
  const loader = LOADERS[t]
  if (loader) loader()
}
watch(tab, onTabChange)
onMounted(() => {
  onTabChange(tab.value)
})
</script>

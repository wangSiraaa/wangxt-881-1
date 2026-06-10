<template>
  <div class="page-wrap">
    <el-row :gutter="16">
      <el-col :span="6" v-for="(s, i) in stats" :key="i">
        <div class="stat-card" :style="{ background: s.color }">
          <div class="label">{{ s.label }}</div>
          <div class="num">{{ s.value }}</div>
          <div style="font-size:12px;opacity:.8;margin-top:4px">{{ s.sub }}</div>
        </div>
      </el-col>
    </el-row>
    <el-row :gutter="16" style="margin-top:20px">
      <el-col :span="14">
        <div class="page-card">
          <div class="page-title"><el-icon><Document /></el-icon>最近报损单</div>
          <el-table :data="recentReports" size="small" stripe>
            <el-table-column prop="code" label="单号" width="170" />
            <el-table-column prop="equipment_name" label="器材" show-overflow-tooltip />
            <el-table-column label="数量" prop="quantity" width="60" align="center" />
            <el-table-column label="状态" width="110">
              <template #default="{ row }"><el-tag :type="statusTag(row.status)">{{ statusText(row.status) }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="reporter_name" label="报损人" width="90" />
            <el-table-column prop="created_at" label="时间" width="160" />
          </el-table>
        </div>
      </el-col>
      <el-col :span="10">
        <div class="page-card">
          <div class="page-title"><el-icon><CircleCheck /></el-icon>待办事项</div>
          <el-timeline>
            <el-timeline-item v-for="(t, i) in todos" :key="i" :timestamp="t.time" :type="t.type" :hollow="true">
              <b>{{ t.title }}</b>
              <div style="font-size:13px;color:#606266;margin-top:4px">{{ t.desc }}</div>
            </el-timeline-item>
            <el-timeline-item v-if="todos.length === 0" type="info" hollow>暂无待办</el-timeline-item>
          </el-timeline>
        </div>
      </el-col>
    </el-row>
    <div class="page-card" style="margin-top:20px">
      <div class="page-title"><el-icon><PieChart /></el-icon>器材分类分布</div>
      <el-row :gutter="20">
        <el-col :span="8" v-for="c in byCategory" :key="c.category" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;padding:12px 16px;background:#f5f7fa;border-radius:6px">
            <span style="color:#606266">{{ c.category || '未分类' }}</span>
            <span><b>{{ c.cnt }}</b> 种 / 共 <b>{{ c.qty }}</b> 件</span>
          </div>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../utils/request'
import { Document, CircleCheck, PieChart } from '@element-plus/icons-vue'

const stats = ref([])
const recentReports = ref([])
const todos = ref([])
const byCategory = ref([])

const statusText = (s) => ({ PENDING_QUOTE:'待报价', PENDING_APPROVAL:'待审批', APPROVED:'已通过', REJECTED:'已驳回', REPAIRING:'维修中', REPAIRED:'已修复', SCRAPPED:'已报废' }[s] || s)
const statusTag = (s) => ({ PENDING_QUOTE:'warning', PENDING_APPROVAL:'danger', APPROVED:'success', REJECTED:'info', REPAIRING:'warning', REPAIRED:'success', SCRAPPED:'danger' }[s] || '')

const load = async () => {
  try {
    const r = await request.get('/audit/stats')
    const d = r.data
    stats.value = [
      { label: '器材种类', value: d.totalEquipments, sub: `共 ${d.totalQuantity} 件`, color: 'linear-gradient(135deg,#667eea,#764ba2)' },
      { label: '借用中', value: d.borrowing, sub: '未归还单据', color: 'linear-gradient(135deg,#f093fb,#f5576c)' },
      { label: '待处理报损', value: d.pendingReports, sub: '含报价/审批/维修中', color: 'linear-gradient(135deg,#4facfe,#00f2fe)' },
      { label: '已报废', value: d.scrapped, sub: '累计报废器材', color: 'linear-gradient(135deg,#43e97b,#38f9d7)' }
    ]
    byCategory.value = d.byCategory || []
    const r2 = await request.get('/damage-reports', { params: { limit: 8 } })
    recentReports.value = r2.data.slice(0, 8)
    const arr = []
    recentReports.value.forEach(x => {
      if (x.status === 'PENDING_QUOTE') arr.push({ title: `报损单 ${x.code} 待录入报价`, desc: `${x.equipment_name} × ${x.quantity}，损坏等级：${x.damage_level}`, time: x.created_at, type: 'warning' })
      else if (x.status === 'PENDING_APPROVAL') arr.push({ title: `报损单 ${x.code} 待审批`, desc: `报价 ¥${x.quote_amount}，${x.needs_general_approval ? '需总务审批' : '待器材管理员确认'}`, time: x.created_at, type: 'danger' })
      else if (x.status === 'REPAIRING') arr.push({ title: `报损单 ${x.code} 维修中`, desc: `${x.equipment_name} 维修中，完成后请及时回写`, time: x.created_at, type: 'primary' })
    })
    todos.value = arr
  } catch (e) {}
}
onMounted(load)
</script>

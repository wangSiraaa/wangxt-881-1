<template>
  <el-container class="layout" style="height:100vh">
    <el-aside width="230px" class="sidebar">
      <div class="logo">
        <el-icon :size="22" color="#fff"><Trophy /></el-icon>
        <span>体育器材系统</span>
      </div>
      <el-menu :default-active="route.path" router background-color="#001529" text-color="#cfd8dc" active-text-color="#409eff" style="border:0">
        <el-menu-item index="/dashboard"><el-icon><DataAnalysis /></el-icon><span>工作台</span></el-menu-item>
        <el-menu-item index="/equipment"><el-icon><Goods /></el-icon><span>器材台账</span></el-menu-item>
        <el-menu-item index="/borrow"><el-icon><Promotion /></el-icon><span>借用归还</span></el-menu-item>
        <el-menu-item index="/damage"><el-icon><Warning /></el-icon><span>报损管理</span></el-menu-item>
        <el-menu-item v-if="showApproval" index="/approval"><el-icon><DocumentChecked /></el-icon><span>审批中心</span></el-menu-item>
        <el-menu-item index="/history"><el-icon><Clock /></el-icon><span>历史查询</span></el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <div class="crumb">
          <el-icon :size="18"><Location /></el-icon>
          <span>{{ route.meta.title || '' }}</span>
        </div>
        <div class="user-info">
          <el-tag :type="roleTagType">{{ user.roleName }}</el-tag>
          <el-dropdown @command="onCmd">
            <span class="user-name">
              <el-avatar :size="30" style="background:#409eff;margin-right:8px">{{ user.name?.charAt(0) }}</el-avatar>
              {{ user.name }}<el-icon><CaretBottom /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile"><el-icon><User /></el-icon>个人信息</el-dropdown-item>
                <el-dropdown-item command="logout" divided><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main><router-view v-slot="{ Component }"><transition name="fade" mode="out-in"><component :is="Component" /></transition></router-view></el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import { ElMessageBox } from 'element-plus'
import { Trophy, DataAnalysis, Goods, Promotion, Warning, DocumentChecked, Clock, Location, User, SwitchButton, CaretBottom } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const user = computed(() => userStore.user || {})
const showApproval = computed(() => ['ADMIN', 'GENERAL_AFFAIRS', 'QUOTATION'].includes(user.value.role))
const roleTagType = computed(() => ({ TEACHER: '', ADMIN: 'success', GENERAL_AFFAIRS: 'warning', QUOTATION: 'info' }[user.value.role] || ''))
const onCmd = (c) => {
  if (c === 'logout') {
    ElMessageBox.confirm('确认退出登录？', '提示', { type: 'warning' }).then(() => {
      userStore.logout(); router.push('/login')
    }).catch(() => {})
  }
}
</script>

<style scoped>
.sidebar { background: #001529; color: #fff; }
.logo { height: 56px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 16px; font-weight: 600; border-bottom: 1px solid #1f2d3d; }
.header { background: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; border-bottom: 1px solid #ebeef5; }
.crumb { display: flex; align-items: center; gap: 6px; font-size: 15px; color: #303133; font-weight: 500; }
.user-info { display: flex; align-items: center; gap: 12px; }
.user-name { display: flex; align-items: center; cursor: pointer; color: #606266; }
.fade-enter-active, .fade-leave-active { transition: opacity .15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>

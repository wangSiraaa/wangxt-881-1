<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <el-icon :size="48" color="#409eff"><School /></el-icon>
        <h1>校园体育器材管理系统</h1>
        <p>Sports Equipment Damage Reporting System</p>
      </div>
      <el-form :model="form" :rules="rules" ref="formRef" label-width="0" @submit.prevent="handleLogin">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="请输入账号" size="large" :prefix-icon="User" clearable />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" placeholder="请输入密码" size="large" :prefix-icon="Lock" show-password @keyup.enter="handleLogin" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" style="width:100%" :loading="loading" @click="handleLogin">登 录</el-button>
        </el-form-item>
      </el-form>
      <el-divider>默认账号 (密码: 123456)</el-divider>
      <div class="quick-login">
        <el-button size="small" v-for="acc in accounts" :key="acc.user" @click="quickLogin(acc.user)">
          {{ acc.label }} <span style="opacity:.6">/{{acc.user}}</span>
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock, School } from '@element-plus/icons-vue'
import { useUserStore } from '../stores/user'

const userStore = useUserStore()
const router = useRouter()
const formRef = ref()
const loading = ref(false)
const form = reactive({ username: '', password: '' })
const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}
const accounts = [
  { user: 'teacher1', label: '体育老师' },
  { user: 'admin1', label: '器材管理员' },
  { user: 'general1', label: '总务审批' },
  { user: 'quotation1', label: '报价录入' }
]
const quickLogin = (u) => { form.username = u; form.password = '123456'; handleLogin() }
const handleLogin = async () => {
  await formRef.value.validate()
  loading.value = true
  try {
    await userStore.login(form.username, form.password)
    ElMessage.success('登录成功')
    router.push('/dashboard')
  } finally { loading.value = false }
}
</script>

<style scoped>
.login-page { height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.login-card { width: 420px; background: #fff; padding: 40px 36px; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
.login-header { text-align: center; margin-bottom: 32px; }
.login-header h1 { font-size: 22px; margin: 12px 0 4px; color: #303133; }
.login-header p { color: #909399; font-size: 13px; }
.quick-login { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
</style>

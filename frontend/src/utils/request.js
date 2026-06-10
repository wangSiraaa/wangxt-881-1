import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'

const request = axios.create({ baseURL: '/api', timeout: 30000 })

request.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

request.interceptors.response.use(
  res => {
    if (res.config.responseType === 'blob') return res
    const data = res.data
    if (data && data.success === false) {
      ElMessage.error(data.message || '操作失败')
      return Promise.reject(data)
    }
    return data
  },
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      ElMessage.warning('登录已过期，请重新登录')
      router.push('/login')
    } else if (err.response?.status === 403) {
      ElMessage.error(err.response?.data?.message || '权限不足')
    } else if (!err.__handled) {
      ElMessage.error(err.message || '网络错误')
    }
    return Promise.reject(err)
  }
)

export default request

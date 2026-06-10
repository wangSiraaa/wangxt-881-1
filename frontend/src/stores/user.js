import { defineStore } from 'pinia'
import request from '../utils/request'

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    user: JSON.parse(localStorage.getItem('user') || 'null')
  }),
  getters: {
    isLogin: s => !!s.token,
    role: s => s.user?.role,
    roleName: s => s.user?.roleName,
    hasRole: s => roles => roles.includes(s.user?.role)
  },
  actions: {
    async login(username, password) {
      const res = await request.post('/auth/login', { username, password })
      this.token = res.data.token
      this.user = res.data.user
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      return res.data
    },
    logout() {
      this.token = ''
      this.user = null
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    },
    async fetchMe() {
      try {
        const res = await request.get('/auth/me')
        this.user = res.data
        localStorage.setItem('user', JSON.stringify(res.data))
      } catch (e) {}
    }
  }
})

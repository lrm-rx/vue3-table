import axios from 'axios'
import { ElMessage } from 'element-plus'

// 环境配置：是否启用 mock
// Vite 使用 import.meta.env 获取环境变量
// VITE_USE_MOCK 可在 .env.development / .env.production 中配置
const useMock = import.meta.env.VITE_USE_MOCK === 'true'

// 基础配置
const config = {
  baseURL: useMock ? '/mock-api' : (import.meta.env.VITE_API_BASE_URL || '/api'),
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json;charset=UTF-8',
  },
}

// 创建 axios 实例
const service = axios.create(config)

// 请求拦截器
service.interceptors.request.use(
  (requestConfig) => {
    // 在请求发送之前做一些处理
    // 例如：从 localStorage 中获取 token 并添加到请求头
    const token = localStorage.getItem('token')
    if (token) {
      requestConfig.headers.Authorization = `Bearer ${token}`
    }
    return requestConfig
  },
  (error) => {
    // 请求错误处理
    console.error('[Request Error]', error)
    return Promise.reject(error)
  }
)

// 响应拦截器
service.interceptors.response.use(
  (response) => {
    const res = response.data

    // 如果响应是 Blob 类型（下载文件），直接返回
    if (response.config.responseType === 'blob') {
      return res
    }

    // 业务状态码判断（根据后端约定调整）
    // code === 0 或 200 表示成功，其余为业务错误
    const { code, message, data } = res
    const successCodes = [0, 200, 20000]

    if (successCodes.includes(code)) {
      return data !== undefined ? data : res
    }

    // 业务错误处理
    const errorMsg = message || '请求失败，请稍后重试'
    ElMessage.error(errorMsg)

    // 401: 未授权 / token 过期
    if (code === 401) {
      localStorage.removeItem('token')
      // 如需跳转登录页，可使用 router.push('/login')
      // 这里仅做示例，实际项目可接入路由
      window.location.reload()
    }

    return Promise.reject(new Error(errorMsg))
  },
  (error) => {
    // HTTP 错误处理
    console.error('[Response Error]', error)

    let errorMsg = '网络异常，请检查网络连接'

    if (error.response) {
      const { status, data } = error.response
      switch (status) {
        case 400:
          errorMsg = data?.message || '请求参数错误'
          break
        case 401:
          errorMsg = '未授权，请重新登录'
          localStorage.removeItem('token')
          window.location.reload()
          break
        case 403:
          errorMsg = '拒绝访问，权限不足'
          break
        case 404:
          errorMsg = '请求资源不存在'
          break
        case 500:
          errorMsg = data?.message || '服务器内部错误'
          break
        case 502:
          errorMsg = '网关错误'
          break
        case 503:
          errorMsg = '服务不可用'
          break
        case 504:
          errorMsg = '网关超时'
          break
        default:
          errorMsg = data?.message || `请求失败 (${status})`
      }
    } else if (error.code === 'ECONNABORTED') {
      errorMsg = '请求超时，请稍后重试'
    }

    ElMessage.error(errorMsg)
    return Promise.reject(error)
  }
)

// 导出常用请求方法
export const request = {
  get(url, params, options = {}) {
    return service.get(url, { params, ...options })
  },
  post(url, data, options = {}) {
    return service.post(url, data, options)
  },
  put(url, data, options = {}) {
    return service.put(url, data, options)
  },
  delete(url, params, options = {}) {
    return service.delete(url, { params, ...options })
  },
  patch(url, data, options = {}) {
    return service.patch(url, data, options)
  },
  // 文件下载
  download(url, params, options = {}) {
    return service.get(url, {
      params,
      responseType: 'blob',
      ...options,
    })
  },
  // 文件上传
  upload(url, formData, options = {}) {
    return service.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      ...options,
    })
  },
}

// 同时导出原始 axios 实例，供特殊场景使用
export default service

import { request } from '@/utils/request'

/**
 * 用户登录
 * @param {Object} data - 登录参数 { username, password }
 * @returns {Promise}
 */
export function loginApi(data) {
  return request.post('/user/login', data)
}

/**
 * 用户登出
 * @returns {Promise}
 */
export function logoutApi() {
  return request.post('/user/logout')
}

/**
 * 获取当前用户信息
 * @returns {Promise}
 */
export function getUserInfoApi() {
  return request.get('/user/info')
}

/**
 * 分页获取用户列表
 * 使用 POST 请求，请求体（body）包含分页参数 + 列过滤/排序条件：
 *   - 分页：pageNum / pageSize
 *   - 过滤条件：与 tablePro 过滤时（filterStateToParams 约定）的扁平参数格式一致，
 *     多选值以数组传递（如 roleList: ['admin', 'developer']），
 *     参数 key 默认取列 field，可通过列配置 defParamKey 自定义
 *   - 排序：sortField / sortOrder
 * @param {Object} params - 请求体 { pageNum, pageSize, ...过滤条件, sortField, sortOrder }
 * @returns {Promise}
 */
export function getUserListApi(params) {
  return request.post('/user/list', params)
}

/**
 * 新增用户
 * @param {Object} data - 用户信息
 * @returns {Promise}
 */
export function addUserApi(data) {
  return request.post('/user/add', data)
}

/**
 * 编辑用户
 * @param {Number|String} id - 用户ID
 * @param {Object} data - 用户信息
 * @returns {Promise}
 */
export function updateUserApi(id, data) {
  return request.put(`/user/update/${id}`, data)
}

/**
 * 删除用户
 * @param {Number|String} id - 用户ID
 * @returns {Promise}
 */
export function deleteUserApi(id) {
  return request.delete(`/user/delete/${id}`)
}

/**
 * 批量删除用户
 * @param {Array} ids - 用户ID数组
 * @returns {Promise}
 */
export function batchDeleteUserApi(ids) {
  return request.post('/user/batch-delete', { ids })
}

/**
 * 获取列过滤选项（用于 tablePro 的 requestFilterAPI）
 * 使用 POST 请求，支持组合参数（多列级联过滤场景）：
 *   - field: 当前要拉取选项的列 field
 *   - filters: 所有 FilterCheckbox 列的当前过滤值，形如 { role: ['admin'], department: [] }
 *     参数 key 可通过列配置 defParamKey 自定义（如 roleList）
 * 注意：返回数据的键名为 name / code，需配合 tablePro 的
 * filterOptionKeys={ label: 'name', value: 'code' } 使用。
 * @param {Object} params - { field, filters }
 * @returns {Promise}
 */
export function getFilterOptionsApi(params) {
  return request.post('/user/filter-options', params)
}

import { request } from '@/utils/request'

/**
 * 分页获取订单列表
 * @param {Object} params - 查询参数
 * @param {Number} params.page - 页码
 * @param {Number} params.pageSize - 每页条数
 * @param {String} params.orderNo - 订单号
 * @param {String} params.customerName - 客户名称
 * @param {String} params.status - 订单状态
 * @param {String} params.orderType - 订单类型
 * @param {String} params.region - 地区
 * @param {String} params.salesman - 业务员
 * @param {String} params.startDate - 开始日期
 * @param {String} params.endDate - 结束日期
 * @returns {Promise}
 */
export function getOrderListApi(params) {
  return request.get('/order/list', params)
}

/**
 * 获取订单详情
 * @param {Number|String} id - 订单ID
 * @returns {Promise}
 */
export function getOrderDetailApi(id) {
  return request.get(`/order/detail/${id}`)
}

/**
 * 获取订单统计数据
 * @returns {Promise}
 */
export function getOrderStatisticsApi() {
  return request.get('/order/statistics')
}

/**
 * 获取订单相关字典数据
 * @returns {Promise}
 */
export function getOrderDictionariesApi() {
  return request.get('/order/dictionaries')
}

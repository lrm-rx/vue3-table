import { request } from '@/utils/request'

/**
 * 全量获取评论列表（虚拟滚动场景：一次拉取后由客户端承载）
 * @param {Object} params - { count: 条数(默认500), seed: 数据批次(变化即重新生成) }
 * @returns {Promise<{ list: Array, total: number }>}
 */
export const getCommentListApi = (params) => request.get('/comment/list', params)

/**
 * 分页获取评论列表（远程无限滚动模式：触底后请求下一页）
 * @param {Object} params - { pageSize: 每页条数, pageNum: 页码(从1开始), seed: 数据批次 }
 * @returns {Promise<{ list: Array, total: number, pageNum: number, pageSize: number, hasMore: boolean }>}
 */
export const getCommentPageApi = (params) => request.get('/comment/page', params)

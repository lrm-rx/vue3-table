import { request } from '@/utils/request'

/**
 * 全量获取评论列表（虚拟滚动场景：一次拉取后由客户端承载）
 * @param {Object} params - { count: 条数(默认500), seed: 数据批次(变化即重新生成) }
 * @returns {Promise<{ list: Array, total: number }>}
 */
export const getCommentListApi = (params) => request.get('/comment/list', params)

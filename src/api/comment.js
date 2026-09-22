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

/**
 * 写操作（乐观更新的服务端调用，统一走 /comment/write）
 * 组件已先做本地乐观更新；失败时业务侧 catch 后调用组件 rollback(opId) 还原
 * @param {Object} data - { action: send|reply|like|delete, simulateFail, ...payload }
 */
export const writeCommentApi = (data) => request.post('/comment/write', data)

/** 发布一级评论 @param {{ content: string, simulateFail?: boolean }} */
export const sendCommentApi = (data) =>
  writeCommentApi({ action: 'send', ...data })

/** 发表回复 @param {{ commentId: string, content: string, replyTo?: Object, simulateFail?: boolean }} */
export const replyCommentApi = (data) =>
  writeCommentApi({ action: 'reply', ...data })

/** 点赞 / 取消点赞 @param {{ targetId: string, liked: boolean, simulateFail?: boolean }} */
export const likeCommentApi = (data) =>
  writeCommentApi({ action: 'like', ...data })

/** 删除评论 / 回复 @param {{ targetId: string, isReply: boolean, simulateFail?: boolean }} */
export const deleteCommentApi = (data) =>
  writeCommentApi({ action: 'delete', ...data })

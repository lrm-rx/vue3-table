import userMock from './modules/user.js'
import orderMock from './modules/order.js'
import commentMock from './modules/comment.js'

// 汇总所有 mock 模块
const mockModules = [...userMock, ...orderMock, ...commentMock]

export default mockModules

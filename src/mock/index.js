import userMock from './modules/user.js'
import orderMock from './modules/order.js'

// 汇总所有 mock 模块
const mockModules = [...userMock, ...orderMock]

export default mockModules

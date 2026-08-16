import Mock from 'mockjs'

const Random = Mock.Random

// 生成模拟表格行数据
const generateTableData = (count = 50) => {
  const list = []
  const statusOptions = ['进行中', '已完成', '待审核', '已取消', '已拒绝']
  const typeOptions = ['普通订单', '紧急订单', '预约订单', '批量订单']
  const paymentOptions = ['微信支付', '支付宝', '银行卡', '现金']
  const regions = ['北京', '上海', '广州', '深圳', '杭州', '成都', '南京', '武汉', '西安', '重庆']
  const departments = ['销售一部', '销售二部', '销售三部', '电商部', '渠道部']

  for (let i = 0; i < count; i++) {
    const quantity = Random.integer(1, 500)
    const price = Random.float(10, 10000, 2, 2)
    list.push({
      id: i + 1,
      orderNo: 'SO' + Random.date('yyyyMMdd') + String(i + 1).padStart(5, '0'),
      customerName: Random.cname() + Random.pick(['有限公司', '科技公司', '商贸公司', '集团']),
      productName: Random.pick(['笔记本电脑', '台式机', '显示器', '键盘', '鼠标', '打印机', '服务器', '路由器', '交换机', '摄像头']),
      specification: Random.pick(['标准版', '专业版', '旗舰版', '定制版', '入门版']) + ' ' + Random.integer(8, 64) + 'G',
      quantity,
      price,
      amount: Number((quantity * price).toFixed(2)),
      status: Random.pick(statusOptions),
      orderType: Random.pick(typeOptions),
      payment: Random.pick(paymentOptions),
      region: Random.pick(regions),
      department: Random.pick(departments),
      salesman: Random.cname(),
      contractNo: 'HT' + Random.date('yyyyMMdd') + Random.string('numeric', 6),
      remark: Random.sentence(5, 12),
      orderDate: Random.date('yyyy-MM-dd'),
      deliverDate: Random.date('yyyy-MM-dd'),
      createTime: Random.datetime('yyyy-MM-dd HH:mm:ss'),
    })
  }
  return list
}

let tableList = generateTableData(80)

export default [
  // 分页获取订单列表
  {
    url: '/mock-api/order/list',
    method: 'get',
    response: ({ query }) => {
      const {
        page = 1,
        pageSize = 10,
        orderNo = '',
        customerName = '',
        status = '',
        orderType = '',
        region = '',
        salesman = '',
        startDate = '',
        endDate = '',
      } = query || {}
      const current = Number(page)
      const size = Number(pageSize)

      // 过滤
      let filtered = [...tableList]
      if (orderNo) {
        filtered = filtered.filter((item) => item.orderNo.includes(orderNo))
      }
      if (customerName) {
        filtered = filtered.filter((item) => item.customerName.includes(customerName))
      }
      if (status) {
        filtered = filtered.filter((item) => item.status === status)
      }
      if (orderType) {
        filtered = filtered.filter((item) => item.orderType === orderType)
      }
      if (region) {
        filtered = filtered.filter((item) => item.region === region)
      }
      if (salesman) {
        filtered = filtered.filter((item) => item.salesman.includes(salesman))
      }
      if (startDate) {
        filtered = filtered.filter((item) => item.orderDate >= startDate)
      }
      if (endDate) {
        filtered = filtered.filter((item) => item.orderDate <= endDate)
      }

      // 分页
      const start = (current - 1) * size
      const end = start + size
      const list = filtered.slice(start, end)

      // 计算汇总
      const totalAmount = filtered.reduce((sum, item) => sum + item.amount, 0)
      const totalQuantity = filtered.reduce((sum, item) => sum + item.quantity, 0)

      return {
        code: 200,
        message: 'success',
        data: {
          list,
          total: filtered.length,
          page: current,
          pageSize: size,
          summary: {
            totalAmount: Number(totalAmount.toFixed(2)),
            totalQuantity,
          },
        },
      }
    },
  },

  // 获取订单详情
  {
    url: /\/mock-api\/order\/detail\/\d+/,
    method: 'get',
    response: ({ url }) => {
      const idMatch = url.match(/\/mock-api\/order\/detail\/(\d+)/)
      const id = idMatch ? Number(idMatch[1]) : null
      const data = tableList.find((item) => item.id === id)
      if (data) {
        return {
          code: 200,
          message: 'success',
          data,
        }
      }
      return {
        code: 404,
        message: '订单不存在',
        data: null,
      }
    },
  },

  // 获取统计数据（供图表使用）
  {
    url: '/mock-api/order/statistics',
    method: 'get',
    response: () => {
      const months = []
      const currentYear = new Date().getFullYear()
      for (let i = 0; i < 12; i++) {
        months.push(`${currentYear}-${String(i + 1).padStart(2, '0')}`)
      }
      return {
        code: 200,
        message: 'success',
        data: {
          totalOrders: tableList.length,
          totalAmount: Number(tableList.reduce((sum, item) => sum + item.amount, 0).toFixed(2)),
          pendingCount: tableList.filter((i) => i.status === '待审核').length,
          completedCount: tableList.filter((i) => i.status === '已完成').length,
          // 月度订单数据
          monthlyData: months.map((month) => ({
            month,
            count: Random.integer(10, 80),
            amount: Random.float(10000, 500000, 2, 2),
          })),
          // 按地区统计
          regionData: ['北京', '上海', '广州', '深圳', '杭州', '成都'].map((region) => ({
            region,
            count: tableList.filter((i) => i.region === region).length,
            amount: Number(
              tableList
                .filter((i) => i.region === region)
                .reduce((sum, item) => sum + item.amount, 0)
                .toFixed(2)
            ),
          })),
          // 按状态统计
          statusData: ['进行中', '已完成', '待审核', '已取消', '已拒绝'].map((status) => ({
            status,
            count: tableList.filter((i) => i.status === status).length,
          })),
        },
      }
    },
  },

  // 获取地区、部门、支付方式、订单类型等字典
  {
    url: '/mock-api/order/dictionaries',
    method: 'get',
    response: () => {
      return {
        code: 200,
        message: 'success',
        data: {
          statusList: [
            { label: '进行中', value: '进行中', type: 'warning' },
            { label: '已完成', value: '已完成', type: 'success' },
            { label: '待审核', value: '待审核', type: 'info' },
            { label: '已取消', value: '已取消', type: 'info' },
            { label: '已拒绝', value: '已拒绝', type: 'danger' },
          ],
          orderTypeList: [
            { label: '普通订单', value: '普通订单' },
            { label: '紧急订单', value: '紧急订单' },
            { label: '预约订单', value: '预约订单' },
            { label: '批量订单', value: '批量订单' },
          ],
          paymentList: [
            { label: '微信支付', value: '微信支付' },
            { label: '支付宝', value: '支付宝' },
            { label: '银行卡', value: '银行卡' },
            { label: '现金', value: '现金' },
          ],
          regionList: ['北京', '上海', '广州', '深圳', '杭州', '成都', '南京', '武汉', '西安', '重庆'].map(
            (r) => ({ label: r, value: r })
          ),
          departmentList: ['销售一部', '销售二部', '销售三部', '电商部', '渠道部'].map((d) => ({
            label: d,
            value: d,
          })),
        },
      }
    },
  },
]

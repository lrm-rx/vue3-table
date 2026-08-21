import Mock from 'mockjs'

const Random = Mock.Random

// 生成模拟用户列表数据
const generateUserList = (count = 20) => {
  const list = []
  for (let i = 0; i < count; i++) {
    list.push({
      id: i + 1,
      username: Random.cname(),
      account: Random.word(5, 10),
      email: Random.email(),
      phone: /^1[3-9]\d{9}$/,
      avatar: Random.image('100x100', Random.color(), '#FFF', Random.word(1, 2)),
      role: Random.pick(['admin', 'editor', 'viewer', 'developer']),
      status: Random.pick([0, 1]), // 0 禁用, 1 启用
      department: Random.pick(['技术部', '产品部', '设计部', '运营部', '市场部']),
      remark: Random.csentence(5, 30),
      createTime: Random.datetime('yyyy-MM-dd HH:mm:ss'),
      updateTime: Random.datetime('yyyy-MM-dd HH:mm:ss'),
    })
  }
  return list
}

let userList = generateUserList(35)

export default [
  // 登录接口
  {
    url: '/mock-api/user/login',
    method: 'post',
    response: ({ body }) => {
      const { username, password } = body || {}
      // 模拟账号密码校验
      if (username === 'admin' && password === '123456') {
        return {
          code: 200,
          message: '登录成功',
          data: {
            token: 'mock-token-' + Random.string(32),
            userInfo: {
              id: 1,
              username: '管理员',
              account: 'admin',
              role: 'admin',
              avatar: Random.image('100x100', '#409EFF', '#FFF', 'AD'),
            },
          },
        }
      }
      return {
        code: 401,
        message: '账号或密码错误',
        data: null,
      }
    },
  },

  // 登出接口
  {
    url: '/mock-api/user/logout',
    method: 'post',
    response: () => {
      return {
        code: 200,
        message: '退出成功',
        data: null,
      }
    },
  },

  // 获取当前用户信息
  {
    url: '/mock-api/user/info',
    method: 'get',
    response: () => {
      return {
        code: 200,
        message: 'success',
        data: {
          id: 1,
          username: '管理员',
          account: 'admin',
          email: 'admin@example.com',
          phone: '13800138000',
          role: 'admin',
          avatar: Random.image('100x100', '#409EFF', '#FFF', 'AD'),
          department: '技术部',
          permissions: ['user:add', 'user:edit', 'user:delete', 'user:view'],
        },
      }
    },
  },

  // 分页获取用户列表（POST：请求体包含分页参数 + 列过滤/排序条件）
  {
    url: '/mock-api/user/list',
    method: 'post',
    response: ({ body }) => {
      // 兼容 page / pageNum 两种参数名（useTable hook 默认使用 pageNum）
      const {
        page,
        pageNum,
        pageSize = 10,
        keyword = '',
        status,
        // FilterCheckbox 多选值以数组传递（如 ['admin', 'developer']）
        // 参数 key 可通过列配置 defParamKey 自定义：role→roleList, department→departmentList
        roleList,
        role,
        departmentList,
        department,
        // 列过滤使用的单独字段（FilterInput / FilterCheckbox）
        username,
        account,
        email,
        phone,
        // 区间类过滤：同时兼容三种参数呈现方式
        //   1) paramMode='array'（默认）：createTime: [start, end], age: [min, max]
        //   2) paramMode='split'：        startCreateTime / endCreateTime, ageMin / ageMax
        //   3) paramMode='both'：         以上两者都会发送（array + split 任一存在即生效）
        createTime,
        age,
        startCreateTime,
        endCreateTime,
        ageMin,
        ageMax,
        // 列排序参数（sortField / sortOrder，支持单字段或多字段逗号分隔）
        sortField,
        sortOrder,
      } = body || {}
      const current = Number(page || pageNum || 1)
      const size = Number(pageSize)

      // 辅助：将过滤值统一转为数组（支持数组 / 逗号分隔字符串 / 单值）
      const toArray = (v) => {
        if (v == null || v === '') return []
        if (Array.isArray(v)) return v.filter((x) => x != null && x !== '')
        return String(v).split(',').map((s) => s.trim()).filter(Boolean)
      }

      // 过滤
      let filtered = [...userList]

      // 通用 keyword：多字段模糊匹配
      if (keyword) {
        const kw = String(keyword).toLowerCase()
        filtered = filtered.filter(
          (item) =>
            item.username.toLowerCase().includes(kw) ||
            item.account.toLowerCase().includes(kw) ||
            item.email.toLowerCase().includes(kw)
        )
      }

      // 单字段 FilterInput：精确/包含匹配（以下做包含匹配，体验更符合表头过滤）
      if (username) {
        const kw = String(username).toLowerCase()
        filtered = filtered.filter((item) => item.username.toLowerCase().includes(kw))
      }
      if (account) {
        const kw = String(account).toLowerCase()
        filtered = filtered.filter((item) => item.account.toLowerCase().includes(kw))
      }
      if (email) {
        const kw = String(email).toLowerCase()
        filtered = filtered.filter((item) => item.email.toLowerCase().includes(kw))
      }
      if (phone) {
        const kw = String(phone)
        filtered = filtered.filter((item) => String(item.phone).includes(kw))
      }
      // 部门过滤：兼容 departmentList（defParamKey 自定义）与 department（默认 field）
      const deptVal = departmentList != null ? departmentList : department
      if (deptVal) {
        const allow = toArray(deptVal)
        if (allow.length) filtered = filtered.filter((item) => allow.includes(item.department))
      }

      // FilterCheckbox：多选以数组传递，任一匹配即可
      if (status !== undefined && status !== '') {
        const allow = toArray(status).map((s) => Number(s))
        if (allow.length) filtered = filtered.filter((item) => allow.includes(item.status))
      }
      // 角色过滤：兼容 roleList（defParamKey 自定义）与 role（默认 field）
      const roleVal = roleList != null ? roleList : role
      if (roleVal) {
        const allow = toArray(roleVal)
        if (allow.length) filtered = filtered.filter((item) => allow.includes(item.role))
      }

      // FilterDateRange：按 createTime 做区间过滤，同时兼容两种参数格式
      //   array 格式：createTime: [start, end]
      //   split 格式：startCreateTime + endCreateTime
      {
        const startT = Array.isArray(createTime) ? createTime[0] : startCreateTime
        const endT = Array.isArray(createTime) ? createTime[1] : endCreateTime
        if (startT) {
          filtered = filtered.filter((item) => item.createTime >= String(startT))
        }
        if (endT) {
          filtered = filtered.filter((item) => item.createTime <= String(endT) + ' 23:59:59')
        }
      }

      // FilterNumberRange：按 age 做区间过滤，同时兼容两种参数格式
      //   array 格式：age: [min, max]
      //   split 格式：ageMin + ageMax
      {
        const minAge = Array.isArray(age) ? age[0] : ageMin
        const maxAge = Array.isArray(age) ? age[1] : ageMax
        if (minAge != null && minAge !== '') {
          filtered = filtered.filter((item) => Number(item.age) >= Number(minAge))
        }
        if (maxAge != null && maxAge !== '') {
          filtered = filtered.filter((item) => Number(item.age) <= Number(maxAge))
        }
      }

      // ====== 列排序（远程排序模拟）======
      // 约定：sortField / sortOrder 同时存在才生效；逗号分隔表示多字段优先级排序
      // 数字类字段（status, age 之类）按数值排序；字符串按 localeCompare；createTime 按时间字符串字典序（含补足）
      const sortFields = toArray(sortField)
      const sortOrders = toArray(sortOrder)
      if (sortFields.length) {
        // 数字型字段集合（用于决定比较器）
        const numericFields = new Set(['status', 'phone'])
        filtered = [...filtered].sort((a, b) => {
          for (let i = 0; i < sortFields.length; i++) {
            const f = sortFields[i]
            const dir = (sortOrders[i] || 'asc').toLowerCase() === 'desc' ? -1 : 1
            const av = a[f]
            const bv = b[f]
            if (av == null && bv == null) continue
            if (av == null) return 1 * dir
            if (bv == null) return -1 * dir
            let cmp = 0
            if (numericFields.has(f)) {
              cmp = Number(av) - Number(bv)
            } else if (f === 'createTime') {
              cmp = String(av).localeCompare(String(bv))
            } else {
              cmp = String(av).localeCompare(String(bv), 'zh-Hans-CN')
            }
            if (cmp !== 0) return cmp * dir
          }
          return 0
        })
      }

      // 分页
      const start = (current - 1) * size
      const end = start + size
      const list = filtered.slice(start, end)

      return {
        code: 200,
        message: 'success',
        data: {
          list,
          total: filtered.length,
          page: current,
          pageNum: current,
          pageSize: size,
        },
      }
    },
  },

  // 新增用户
  {
    url: '/mock-api/user/add',
    method: 'post',
    response: ({ body }) => {
      const newUser = {
        id: userList.length + 1,
        ...body,
        avatar: body?.avatar || Random.image('100x100', Random.color(), '#FFF', Random.word(1, 2)),
        status: body?.status ?? 1,
        createTime: Random.datetime('yyyy-MM-dd HH:mm:ss'),
        updateTime: Random.datetime('yyyy-MM-dd HH:mm:ss'),
      }
      userList.unshift(newUser)
      return {
        code: 200,
        message: '新增成功',
        data: newUser,
      }
    },
  },

  // 编辑用户
  {
    url: /\/mock-api\/user\/update\/\d+/,
    method: 'put',
    response: ({ url, body }) => {
      const idMatch = url.match(/\/mock-api\/user\/update\/(\d+)/)
      const id = idMatch ? Number(idMatch[1]) : null
      const index = userList.findIndex((item) => item.id === id)
      if (index !== -1) {
        userList[index] = {
          ...userList[index],
          ...body,
          updateTime: Random.datetime('yyyy-MM-dd HH:mm:ss'),
        }
        return {
          code: 200,
          message: '更新成功',
          data: userList[index],
        }
      }
      return {
        code: 404,
        message: '用户不存在',
        data: null,
      }
    },
  },

  // 删除用户
  {
    url: /\/mock-api\/user\/delete\/\d+/,
    method: 'delete',
    response: ({ url }) => {
      const idMatch = url.match(/\/mock-api\/user\/delete\/(\d+)/)
      const id = idMatch ? Number(idMatch[1]) : null
      const index = userList.findIndex((item) => item.id === id)
      if (index !== -1) {
        userList.splice(index, 1)
        return {
          code: 200,
          message: '删除成功',
          data: null,
        }
      }
      return {
        code: 404,
        message: '用户不存在',
        data: null,
      }
    },
  },

  // 批量删除用户
  {
    url: '/mock-api/user/batch-delete',
    method: 'post',
    response: ({ body }) => {
      const { ids = [] } = body || {}
      userList = userList.filter((item) => !ids.includes(item.id))
      return {
        code: 200,
        message: `批量删除成功，共删除 ${ids.length} 条`,
        data: null,
      }
    },
  },

  // 获取列过滤选项（用于测试 tablePro 的 requestFilterAPI）
  // 使用 POST 请求，接收组合参数 { field, filters }：
  //   - field: 当前要拉取选项的列 field
  //   - filters: 所有 FilterCheckbox 列的当前过滤值，形如 { roleList: ['admin'], departmentList: [], status: [] }
  //     参数 key 可通过列配置 defParamKey 自定义（如 roleList / departmentList），默认取 field
  // 注意：返回数据使用 name / code 键名，配合 tablePro 的
  // filterOptionKeys={ label: 'name', value: 'code' } 使用。
  // 演示级联过滤：当拉取 department 选项时，若已选角色包含 admin，则只返回 tech / product
  {
    url: '/mock-api/user/filter-options',
    method: 'post',
    response: ({ body }) => {
      const { field, filters = {} } = body || {}
      // 兼容自定义 defParamKey（roleList）与默认 field（role）两种 key
      const roleValues = filters.roleList || filters.role || []
      let data = []
      if (field === 'role') {
        data = [
          { name: '管理员', code: 'admin' },
          { name: '编辑', code: 'editor' },
          { name: '访客', code: 'viewer' },
          { name: '开发者', code: 'developer' },
          { name: '测试员', code: 'tester' },
        ]
      } else if (field === 'status') {
        data = [
          { name: '启用', code: 1 },
          { name: '禁用', code: 0 },
        ]
      } else if (field === 'department') {
        // 级联过滤演示：已选角色 admin 时，部门只返回 tech / product
        if (roleValues.includes('admin')) {
          data = [
            { name: '技术部', code: 'tech' },
            { name: '产品部', code: 'product' },
          ]
        } else {
          data = [
            { name: '技术部', code: 'tech' },
            { name: '产品部', code: 'product' },
            { name: '设计部', code: 'design' },
            { name: '运营部', code: 'operation' },
            { name: '市场部', code: 'market' },
          ]
        }
      }
      return {
        code: 200,
        message: 'success',
        data,
      }
    },
  },
]

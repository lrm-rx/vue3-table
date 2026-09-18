// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { reactive, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import TablePro from "../../src/components/tablePro/index.vue";
import Pagination from "../../src/components/tablePro/pagination/Pagination.vue";
import { createVxeGridStub, ElPaginationStub } from "../helpers/stubs.js";

// vxe-grid / vxe-button 在真实环境由 main.js 全局注册，测试中注册桩
const mountTablePro = async (props = {}, grid = {}) => {
  const g = createVxeGridStub();
  if (grid.columns !== undefined) g.mock.columns = grid.columns;
  if (grid.sorts !== undefined) g.mock.sorts = grid.sorts;
  if (grid.fullData !== undefined) g.mock.fullData = grid.fullData;
  if (grid.recordset !== undefined) g.mock.recordset = grid.recordset;
  const wrapper = mount(TablePro, {
    props,
    global: {
      stubs: {
        "vxe-grid": g.stub,
        // 工具栏 toolSuffix 内使用；hasColumnFilter 为 true 时会渲染，注册占位避免警告
        "vxe-button": true,
        "el-pagination": ElPaginationStub,
      },
    },
  });
  await flushPromises();
  return { wrapper, grid: g };
};

const gridAttrs = (wrapper) => wrapper.findComponent({ name: "VxeGridStub" }).vm.$attrs;

const makeRows = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `name-${i}`,
    age: i,
    dept: "dev",
  }));

const STATIC_COLUMNS = [
  { type: "seq", width: 60, title: "序号" },
  { field: "name", title: "姓名", sortable: true, filterType: "FilterInput" },
  { field: "age", title: "年龄", sortable: true },
  { field: "dept", title: "部门", editRender: { name: "ElSelect" } },
  { field: "secret", title: "隐藏", params: { hideColumn: true } },
];

describe("TablePro 静态模式（本地数据 + 分页 + 列转换）", () => {
  it("列转换结果传入 vxe-grid：简写注入、hideColumn 过滤、排序分页切片", async () => {
    const rows = makeRows(25);
    const { wrapper } = await mountTablePro({
      columns: STATIC_COLUMNS,
      data: rows,
      pagination: true,
    });
    const attrs = gridAttrs(wrapper);

    // 1) hideColumn 的列被移除，共 4 列
    expect(attrs.columns).toHaveLength(4);
    expect(attrs.columns.map((c) => c.field || c.type)).toEqual([
      "seq",
      "name",
      "age",
      "dept",
    ]);
    // 2) filterType 简写被注入 filterRender + filters
    const nameCol = attrs.columns.find((c) => c.field === "name");
    expect(nameCol.filterRender).toEqual({ name: "FilterInput" });
    expect(nameCol.filters).toEqual([{ data: { value: "" } }]);
    // 3) 特殊列 seq 不套公共列配置
    const seqCol = attrs.columns[0];
    expect(seqCol.minWidth).toBeUndefined();

    // 4) data 按默认 pageSize=10 切片
    expect(attrs.data).toHaveLength(10);
    expect(attrs.data.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // 5) 分页组件拿到当前分页信息（total = 本地过滤后总数）
    const pager = wrapper.findComponent(Pagination);
    expect(pager.props("pagerConfig")).toMatchObject({
      currentPage: 1,
      pageSize: 10,
      total: 25,
    });

    // 原始 props.columns 不被污染
    expect(propsNotMutated(wrapper.props("columns"))).toBe(true);
  });

  it("翻页后 data 切片更新并抛出 page-change / update:pagerConfig", async () => {
    const rows = makeRows(25);
    const { wrapper } = await mountTablePro({
      columns: STATIC_COLUMNS,
      data: rows,
      pagination: true,
    });
    const elPager = wrapper.findComponent(ElPaginationStub);
    elPager.vm.$emit("current-change", 2);
    await flushPromises();

    const attrs = gridAttrs(wrapper);
    expect(attrs.data.map((r) => r.id)).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
    expect(wrapper.emitted("update:pagerConfig")).toHaveLength(1);
    expect(wrapper.emitted("update:pagerConfig")[0][0]).toMatchObject({
      currentPage: 2,
      pageSize: 10,
    });
    expect(wrapper.emitted("page-change")[0][0]).toMatchObject({
      currentPage: 2,
      pageSize: 10,
      total: 25,
    });
  });

  it("数据长度变化时 currentPage 被夹紧（最后一页越界回退）", async () => {
    const rows = makeRows(25);
    const { wrapper } = await mountTablePro({
      columns: STATIC_COLUMNS,
      data: rows,
      pagination: true,
    });
    // 跳到最后一页（第 3 页）
    wrapper.findComponent(ElPaginationStub).vm.$emit("current-change", 3);
    await flushPromises();
    // 数据收缩到 5 条 → 最大页 1，currentPage 应回退
    await wrapper.setProps({ data: makeRows(5) });
    await flushPromises();
    const pager = wrapper.findComponent(Pagination);
    expect(pager.props("pagerConfig").currentPage).toBe(1);
    expect(gridAttrs(wrapper).data).toHaveLength(5);
  });

  it("静态排序：vxe sort-change 触发本地排序并切片", async () => {
    const rows = makeRows(25);
    // 本地排序由 localFilterSort 显式开关控制（默认 false：静态模式交给 vxe 原生排序）
    const { wrapper, grid } = await mountTablePro({
      columns: STATIC_COLUMNS,
      data: rows,
      pagination: true,
      localFilterSort: true,
    });
    // 模拟 vxe 已按 age desc 排序
    grid.mock.sorts = [{ field: "age", order: "desc" }];
    const attrs = gridAttrs(wrapper);
    attrs.onSortChange({});
    await flushPromises();

    const data = gridAttrs(wrapper).data;
    expect(data).toHaveLength(10);
    expect(data[0].id).toBe(25); // 25,24,...16
    expect(data[9].id).toBe(16);
    // 事件转发给外部
    expect(wrapper.emitted("sort-change")).toHaveLength(1);
  });

  it("localFilterSort 默认 false：静态模式 sort-change 不做本地排序（交由 vxe 原生）", async () => {
    const rows = makeRows(25);
    const { wrapper, grid } = await mountTablePro({
      columns: STATIC_COLUMNS,
      data: rows,
      pagination: true,
    });
    grid.mock.sorts = [{ field: "age", order: "desc" }];
    const attrs = gridAttrs(wrapper);
    attrs.onSortChange({});
    await flushPromises();

    // 组件层不重排：当前页切片保持原顺序（真实环境由 vxe 对当前页原生排序）
    const data = gridAttrs(wrapper).data;
    expect(data.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // sort-change 事件照常转发
    expect(wrapper.emitted("sort-change")).toHaveLength(1);
  });

  it("透传事件：调用 grid 的 onCellClick 会 emit cell-click", async () => {
    const { wrapper } = await mountTablePro({
      columns: STATIC_COLUMNS,
      data: makeRows(3),
    });
    const attrs = gridAttrs(wrapper);
    expect(typeof attrs.onCellClick).toBe("function");
    attrs.onCellClick({ row: { id: 1 } });
    expect(wrapper.emitted("cell-click")).toHaveLength(1);
    expect(wrapper.emitted("cell-click")[0][0]).toEqual({ row: { id: 1 } });
  });

  it("未开启分页时 data 不切片", async () => {
    const rows = makeRows(3);
    const { wrapper } = await mountTablePro({
      columns: STATIC_COLUMNS,
      data: rows,
      pagination: false,
    });
    expect(gridAttrs(wrapper).data).toHaveLength(3);
    expect(wrapper.findComponent(Pagination).exists()).toBe(false);
  });

  it("数据刷新（data 变化）时清除 vxe 校验态，避免旧错误残留在新数据上", async () => {
    const rows = makeRows(5);
    const { wrapper, grid } = await mountTablePro({
      columns: STATIC_COLUMNS,
      data: rows,
      pagination: false,
    });
    const before = grid.mock.calls.clearValidate;
    await wrapper.setProps({ data: makeRows(3) });
    await flushPromises();
    expect(grid.mock.calls.clearValidate).toBeGreaterThan(before);
  });
});

describe("TablePro 远程模式（requestApi）", () => {
  const makeColumns = () => [
    {
      field: "role",
      title: "角色",
      filterType: "FilterCheckbox",
      params: { defParamKey: "roleList" },
    },
    { field: "age", title: "年龄", sortable: true },
  ];

  it("initParam.filters 对 filterType 简写列生效：首屏请求携带默认过滤参数", async () => {
    const api = vi.fn(async (params) => ({
      list: [
        { id: 1, role: "admin", age: 30 },
        { id: 2, role: "admin", age: 20 },
      ],
      total: 2,
    }));
    const { wrapper } = await mountTablePro({
      columns: makeColumns(),
      requestApi: api,
      requestAuto: true,
      pagination: true,
      initParam: { filters: { role: ["admin"] } },
    });

    // 首屏请求参数包含默认过滤 roleList=['admin']（回归：filterType 简写列默认值丢失问题）
    const first = api.mock.calls[0][0];
    expect(first.roleList).toEqual(["admin"]);
    expect(first.pageNum).toBe(1);
    expect(first.pageSize).toBe(10);

    // 表格数据渲染（pageable.total=2 透传分页组件）
    expect(gridAttrs(wrapper).data).toHaveLength(2);
    expect(wrapper.findComponent(Pagination).props("pagerConfig")).toMatchObject({
      currentPage: 1,
      pageSize: 10,
      total: 2,
    });
  });

  it("远程排序：sort-change 后重新请求并携带排序 + 保留过滤参数", async () => {
    const api = vi.fn(async () => ({
      list: [{ id: 1, role: "admin", age: 30 }],
      total: 1,
    }));
    const { wrapper, grid } = await mountTablePro({
      columns: makeColumns(),
      requestApi: api,
      requestAuto: true,
      pagination: true,
      initParam: { filters: { role: ["admin"] } },
    });

    grid.mock.sorts = [{ field: "age", order: "desc" }];
    const attrs = gridAttrs(wrapper);
    attrs.onSortChange({});
    await flushPromises();

    expect(api).toHaveBeenCalledTimes(2);
    const second = api.mock.calls[1][0];
    expect(second).toMatchObject({
      roleList: ["admin"], // 过滤参数保留
      sortField: "age",
      sortOrder: "desc",
      pageNum: 1, // 排序后回到第一页
    });
  });

  it("暴露常用方法 / 状态（defineExpose）", async () => {
    const api = vi.fn(async () => ({ list: [{ id: 1, role: "admin", age: 1 }], total: 1 }));
    const { wrapper } = await mountTablePro({
      columns: makeColumns(),
      requestApi: api,
      requestAuto: false,
      pagination: true,
    });
    const vm = wrapper.vm;
    expect(typeof vm.getTableList).toBe("function");
    expect(typeof vm.search).toBe("function");
    expect(typeof vm.reset).toBe("function");
    expect(typeof vm.getFilterParams).toBe("function");
    expect(typeof vm.validate).toBe("function");
    expect(Array.isArray(vm.tableData)).toBe(true);
  });

  it("远程重新请求（getTableList）后清除 vxe 校验态，避免旧错误残留", async () => {
    const api = vi.fn(async () => ({
      list: [{ id: 1, role: "admin", age: 30 }],
      total: 1,
    }));
    const { wrapper, grid } = await mountTablePro({
      columns: makeColumns(),
      requestApi: api,
      requestAuto: true,
      pagination: true,
    });
    const before = grid.mock.calls.clearValidate;
    await wrapper.vm.getTableList();
    await flushPromises();
    expect(grid.mock.calls.clearValidate).toBeGreaterThan(before);
  });
});

// ========== 变更跟踪（v-model:cellChanged）==========
describe("TablePro 变更跟踪（v-model:cellChanged）", () => {
  // 挂载并模拟 v-model 双向同步（监听 update:cellChanged 并回写 prop）
  const mountTracking = async (rows) => {
    let changed = false;
    const { wrapper, grid } = await mountTablePro(
      {
        columns: STATIC_COLUMNS,
        data: rows,
        editable: true,
        cellChanged: false,
        "onUpdate:cellChanged": (v) => {
          changed = v;
          wrapper.setProps({ cellChanged: v });
        },
      },
      { fullData: rows },
    );
    return { wrapper, grid, getChanged: () => changed };
  };

  it("insertRow/removeRows 后同步 update:cellChanged（新增后再移除自动归净）", async () => {
    const rows = makeRows(3);
    const { wrapper, grid, getChanged } = await mountTracking(rows);

    // 桩不自动维护 recordset，测试手动驱动（真实环境由 vxe getRecordset 计算）
    grid.mock.recordset = {
      insertRecords: [{ id: "new-1" }],
      removeRecords: [],
      updateRecords: [],
    };
    wrapper.vm.insertRow({ id: "new-1" });
    await flushPromises();
    expect(grid.mock.calls.insert).toHaveLength(1);
    expect(getChanged()).toBe(true);
    expect(wrapper.emitted("update:cellChanged").at(-1)[0]).toBe(true);

    // 新增行再被移除 → 变更归净（脏→净时重新快照基线）
    grid.mock.recordset = {
      insertRecords: [],
      removeRecords: [],
      updateRecords: [],
    };
    wrapper.vm.removeRows([grid.mock.fullData[0]]);
    await flushPromises();
    expect(getChanged()).toBe(false);
    expect(wrapper.emitted("update:cellChanged").at(-1)[0]).toBe(false);
  });

  it("edit-closed 提交后重算变更状态", async () => {
    const rows = makeRows(3);
    const { wrapper, grid, getChanged } = await mountTracking(rows);
    const attrs = gridAttrs(wrapper);
    // 内部 handler 与转发 handler 被 Vue 合并为数组，逐个调用
    const callHandler = (name, params) => {
      const fn = attrs[name];
      if (Array.isArray(fn)) fn.forEach((f) => f(params));
      else fn?.(params);
    };
    const row = rows[0];
    callHandler("onEditActivated", { row, column: { field: "name" } });
    grid.mock.recordset = {
      insertRecords: [],
      removeRecords: [],
      updateRecords: [row],
    };
    callHandler("onEditClosed", { row, column: { field: "name" } });
    await flushPromises();
    expect(getChanged()).toBe(true);
    expect(wrapper.emitted("update:cellChanged").at(-1)[0]).toBe(true);
  });

  it("revertChanges：loadData 还原基线快照并复位变更状态", async () => {
    const rows = makeRows(3);
    const { wrapper, grid, getChanged } = await mountTracking(rows);
    grid.mock.recordset = {
      insertRecords: [{ id: "new-1" }],
      removeRecords: [],
      updateRecords: [],
    };
    wrapper.vm.insertRow({ id: "new-1" });
    await flushPromises();
    expect(getChanged()).toBe(true);

    const ok = await wrapper.vm.revertChanges();
    await flushPromises();
    expect(ok).toBe(true);
    expect(getChanged()).toBe(false);
    // loadData 收到基线深拷贝：内容为挂载时的干净数据，且不是原数组引用
    expect(grid.mock.calls.loadData).toHaveLength(1);
    const restored = grid.mock.calls.loadData[0];
    expect(restored.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(restored).not.toBe(rows);
  });

  it("markSaved：以当前数据为新基线并复位变更状态", async () => {
    const rows = makeRows(3);
    const { wrapper, grid, getChanged } = await mountTracking(rows);
    grid.mock.recordset = {
      insertRecords: [],
      removeRecords: [rows[0]],
      updateRecords: [],
    };
    wrapper.vm.removeRows([rows[0]]);
    await flushPromises();
    expect(getChanged()).toBe(true);

    // 保存：vxe loadData 重建源数据后 recordset 归净
    grid.mock.recordset = {
      insertRecords: [],
      removeRecords: [],
      updateRecords: [],
    };
    await wrapper.vm.markSaved();
    await flushPromises();
    expect(getChanged()).toBe(false);
    expect(grid.mock.calls.loadData).toHaveLength(1);
    // loadData 收到当前行数据副本（同内容、不同数组引用，行对象引用保持）；
    // rows[0] 已被移除，当前数据只剩后两行
    expect(grid.mock.calls.loadData[0]).toEqual([rows[1], rows[2]]);
    expect(grid.mock.calls.loadData[0]).not.toBe(rows);
  });

  // 内部 handler 与转发 handler 被 Vue 合并为数组，逐个调用
  const callAttrsHandler = (attrs, name, params) => {
    const fn = attrs[name];
    if (Array.isArray(fn)) fn.forEach((f) => f(params));
    else fn?.(params);
  };

  it("对象式编辑器：输入当下立即标记脏，改回原值当下归净（无需 edit-closed/失焦）", async () => {
    const rows = makeRows(3);
    const { wrapper, grid, getChanged } = await mountTracking(rows);
    const attrs = gridAttrs(wrapper);
    const row = rows[0];
    const deptCol = attrs.columns.find((c) => c.field === "dept");
    expect(deptCol.slots.edit).toEqual(expect.any(Function));

    // 激活 dept（ElSelect 对象式编辑）
    callAttrsHandler(attrs, "onEditActivated", { row, column: { field: "dept" } });
    // 渲染编辑 vnode（等价 vxe 编辑态渲染），直接取 v-model 回调模拟下拉选择
    const vnode = deptCol.slots.edit({
      row,
      cellValue: "dev",
      column: deptCol,
      $table: {},
      $rowIndex: 0,
      $columnIndex: 3,
    });
    const setModelValue = vnode.props["onUpdate:modelValue"];
    expect(setModelValue).toEqual(expect.any(Function));

    // 选择新值：同步翻转 true（未调 onEditClosed、未失焦、面板未关闭）
    setModelValue("hr");
    expect(getChanged()).toBe(true);
    expect(wrapper.emitted("update:cellChanged").at(-1)[0]).toBe(true);

    // 改回原值：同步归净 false（编辑中即可取消按钮隐藏）
    setModelValue("dev");
    expect(getChanged()).toBe(false);
    expect(wrapper.emitted("update:cellChanged").at(-1)[0]).toBe(false);

    // 再次改值后关闭编辑态：交由 recordset 接管（updateRecords 命中 → 保持脏）
    setModelValue("hr");
    expect(getChanged()).toBe(true);
    grid.mock.recordset = {
      insertRecords: [],
      removeRecords: [],
      updateRecords: [row],
    };
    callAttrsHandler(attrs, "onEditClosed", { row, column: { field: "dept" } });
    await flushPromises();
    expect(getChanged()).toBe(true);
    // 对象式在 edit-closed 统一写回 row
    expect(row.dept).toBe("hr");
  });

  it("对象式编辑器：数组值改回相同内容（不同引用）即归净（深度比对，非引用比对）", async () => {
    const rows = [{ id: 1, tags: ["a"] }, { id: 2, tags: [] }];
    let changed = false;
    const { wrapper, grid } = await mountTablePro(
      {
        columns: [
          { field: "id", title: "ID" },
          {
            field: "tags",
            title: "标签",
            editRender: {
              name: "ElCheckbox",
              options: [
                { label: "A", value: "a" },
                { label: "B", value: "b" },
              ],
            },
          },
        ],
        data: rows,
        pagination: false,
        editable: true,
        cellChanged: false,
        "onUpdate:cellChanged": (v) => {
          changed = v;
          wrapper.setProps({ cellChanged: v });
        },
      },
      { fullData: rows },
    );
    const attrs = gridAttrs(wrapper);
    const row = rows[0];
    const tagsCol = attrs.columns.find((c) => c.field === "tags");
    callAttrsHandler(attrs, "onEditActivated", { row, column: { field: "tags" } });
    const vnode = tagsCol.slots.edit({
      row,
      cellValue: ["a"],
      column: tagsCol,
      $table: {},
      $rowIndex: 0,
      $columnIndex: 1,
    });
    const setModelValue = vnode.props["onUpdate:modelValue"];

    setModelValue(["b"]);
    expect(changed).toBe(true);
    // 新数组引用但内容与原值深度一致 → 归净
    setModelValue(["a"]);
    expect(changed).toBe(false);
  });

  it("函数式编辑器：用户插槽直接改 row[field] 也即时标记/归净", async () => {
    const rows = reactive([
      { id: 1, name: "name-0" },
      { id: 2, name: "name-1" },
    ]);
    let changed = false;
    const { wrapper, grid } = await mountTablePro(
      {
        columns: [
          { field: "id", title: "ID" },
          {
            field: "name",
            title: "姓名",
            // 函数式 editRender：用户自行把 v-model 绑到 row[field]
            editRender: (params) => h("input", { value: params.cellValue }),
          },
        ],
        data: rows,
        pagination: false,
        editable: true,
        cellChanged: false,
        "onUpdate:cellChanged": (v) => {
          changed = v;
          wrapper.setProps({ cellChanged: v });
        },
      },
      { fullData: rows },
    );
    const attrs = gridAttrs(wrapper);
    callAttrsHandler(attrs, "onEditActivated", {
      row: rows[0],
      column: { field: "name" },
    });

    // 直接修改行数据（模拟用户输入）：同步翻转，无需 edit-closed
    rows[0].name = "changed";
    expect(changed).toBe(true);
    expect(wrapper.emitted("update:cellChanged").at(-1)[0]).toBe(true);

    // 改回原值：同步归净
    rows[0].name = "name-0";
    expect(changed).toBe(false);
    expect(wrapper.emitted("update:cellChanged").at(-1)[0]).toBe(false);

    // 关闭后由 recordset 接管：改动 + 关闭（无 recordset 差异）→ 仍为净
    rows[0].name = "changed";
    expect(changed).toBe(true);
    grid.mock.recordset = {
      insertRecords: [],
      removeRecords: [],
      updateRecords: [],
    };
    callAttrsHandler(attrs, "onEditClosed", {
      row: rows[0],
      column: { field: "name" },
    });
    await flushPromises();
    expect(changed).toBe(false);
  });

  // 渲染某可编辑列的编辑 vnode 并返回 v-model 写值函数（等价 vxe 编辑态渲染 + 用户输入）
  const renderEditSetter = (wrapper, field, scope = {}) => {
    const attrs0 = gridAttrs(wrapper);
    const col = attrs0.columns.find((c) => c.field === field);
    const vnode = col.slots.edit({
      row: scope.row,
      cellValue: scope.cellValue,
      column: col,
      $table: {},
      $rowIndex: scope.$rowIndex ?? 0,
      $columnIndex: scope.$columnIndex ?? 0,
    });
    return vnode.props["onUpdate:modelValue"];
  };

  const emptyRecordset = () => ({
    insertRecords: [],
    removeRecords: [],
    updateRecords: [],
  });

  it("连续接力编辑两个单元格：旧会话 watcher 已拆除，互不串扰", async () => {
    const rows = makeRows(3);
    const { wrapper, grid, getChanged } = await mountTracking(rows);
    const attrs = gridAttrs(wrapper);

    // 单元格 A：编辑 → 脏 → 关闭（recordset 无差异）→ 净
    callAttrsHandler(attrs, "onEditActivated", {
      row: rows[0],
      column: { field: "dept" },
    });
    renderEditSetter(wrapper, "dept", {
      row: rows[0],
      cellValue: "dev",
    })("hr");
    expect(getChanged()).toBe(true);
    grid.mock.recordset = emptyRecordset();
    callAttrsHandler(attrs, "onEditClosed", {
      row: rows[0],
      column: { field: "dept" },
    });
    await flushPromises();
    expect(getChanged()).toBe(false);

    // 单元格 B（第二行 dept，不同 stateKey）：新会话独立工作；
    // A 的 watcher 已停（其 editLocalState key 已删除，残留 watcher 会读到 undefined 误报，
    // 整个序列保持预期翻转即证明旧 watcher 已拆除）
    callAttrsHandler(attrs, "onEditActivated", {
      row: rows[1],
      column: { field: "dept" },
    });
    const setB = renderEditSetter(wrapper, "dept", {
      row: rows[1],
      cellValue: "dev",
    });
    setB("hr");
    expect(getChanged()).toBe(true);
    setB("dev");
    expect(getChanged()).toBe(false);

    grid.mock.recordset = emptyRecordset();
    callAttrsHandler(attrs, "onEditClosed", {
      row: rows[1],
      column: { field: "dept" },
    });
    await flushPromises();
    expect(getChanged()).toBe(false);
  });

  it("OR 语义：编辑中插入行保持脏；编辑值还原但插入未撤销仍脏；插入撤销后归净", async () => {
    const rows = makeRows(3);
    const { wrapper, grid, getChanged } = await mountTracking(rows);
    const attrs = gridAttrs(wrapper);

    // 编辑中 → 脏
    callAttrsHandler(attrs, "onEditActivated", {
      row: rows[0],
      column: { field: "dept" },
    });
    renderEditSetter(wrapper, "dept", {
      row: rows[0],
      cellValue: "dev",
    })("hr");
    expect(getChanged()).toBe(true);

    // 编辑未提交时插入行（recordset 出现 insertRecords）→ 仍为脏（不产生额外翻转事件）
    grid.mock.recordset = {
      insertRecords: [{ id: "new-1" }],
      removeRecords: [],
      updateRecords: [],
    };
    wrapper.vm.insertRow({ id: "new-1" });
    await flushPromises();
    expect(getChanged()).toBe(true);

    // 编辑值改回原值（编辑源归净），但插入行仍在 → 合并脏态保持 true
    renderEditSetter(wrapper, "dept", {
      row: rows[0],
      cellValue: "dev",
    })("dev");
    expect(getChanged()).toBe(true);

    // 插入撤销（recordset 清空）后关闭编辑态走 recompute 通道 → 归净
    grid.mock.recordset = emptyRecordset();
    callAttrsHandler(attrs, "onEditClosed", {
      row: rows[0],
      column: { field: "dept" },
    });
    await flushPromises();
    expect(getChanged()).toBe(false);
  });

  it("编辑中 markSaved：拆除会话并复位；之后再次编辑以当前值为新基线", async () => {
    const rows = makeRows(3);
    const { wrapper, grid, getChanged } = await mountTracking(rows);
    const attrs = gridAttrs(wrapper);

    callAttrsHandler(attrs, "onEditActivated", {
      row: rows[0],
      column: { field: "dept" },
    });
    renderEditSetter(wrapper, "dept", {
      row: rows[0],
      cellValue: "dev",
    })("hr");
    expect(getChanged()).toBe(true);

    // 编辑未关闭直接保存：会话被拆除、cellChanged 复位（编辑控件的本地草稿随之失效，
    // 行数据保持原值 dev）
    grid.mock.recordset = emptyRecordset();
    await wrapper.vm.markSaved();
    await flushPromises();
    expect(getChanged()).toBe(false);
    expect(grid.mock.calls.loadData.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].dept).toBe("dev");

    // 再次激活同一单元格：新会话以当前值 dev 为原值，改成 hr 才脏，dev→dev 不脏
    callAttrsHandler(attrs, "onEditActivated", {
      row: rows[0],
      column: { field: "dept" },
    });
    const setAgain = renderEditSetter(wrapper, "dept", {
      row: rows[0],
      cellValue: "dev",
    });
    setAgain("dev");
    expect(getChanged()).toBe(false);
    setAgain("hr");
    expect(getChanged()).toBe(true);
  });

  it("编辑中 revertChanges：会话拆除、状态复位，残留本地草稿变化不再产生事件", async () => {
    const rows = makeRows(3);
    const { wrapper, grid, getChanged } = await mountTracking(rows);
    const attrs = gridAttrs(wrapper);

    callAttrsHandler(attrs, "onEditActivated", {
      row: rows[0],
      column: { field: "dept" },
    });
    const setVal = renderEditSetter(wrapper, "dept", {
      row: rows[0],
      cellValue: "dev",
    });
    setVal("hr");
    expect(getChanged()).toBe(true);

    // 即将还原：记录此刻事件数
    const lenBeforeRevert =
      wrapper.emitted("update:cellChanged")?.length ?? 0;
    const ok = await wrapper.vm.revertChanges();
    await flushPromises();
    expect(ok).toBe(true);
    expect(getChanged()).toBe(false);
    // revert 仅产生一次 false 沿
    const afterRevert = wrapper.emitted("update:cellChanged") || [];
    expect(afterRevert.length).toBe(lenBeforeRevert + 1);
    expect(afterRevert.at(-1)[0]).toBe(false);

    // watcher 已停：再写草稿值不翻转状态、不发事件
    setVal("hr-again");
    expect(getChanged()).toBe(false);
    const emitsAfter = wrapper.emitted("update:cellChanged") || [];
    expect(emitsAfter.length).toBe(lenBeforeRevert + 1);
  });

  it("编辑中数据被外部替换（data prop 变化）：会话自动拆除，脏态复位", async () => {
    const rows = makeRows(3);
    let changed = false;
    const { wrapper } = await mountTablePro(
      {
        columns: STATIC_COLUMNS,
        data: rows,
        pagination: false,
        editable: true,
        cellChanged: false,
        "onUpdate:cellChanged": (v) => {
          changed = v;
          wrapper.setProps({ cellChanged: v });
        },
      },
      { fullData: rows },
    );
    const attrs = gridAttrs(wrapper);

    callAttrsHandler(attrs, "onEditActivated", {
      row: rows[0],
      column: { field: "dept" },
    });
    renderEditSetter(wrapper, "dept", {
      row: rows[0],
      cellValue: "dev",
    })("hr");
    expect(changed).toBe(true);

    // 外部替换数据（翻页/刷新场景）：renderData watcher 在 nextTick 清会话 + 重算
    const nextRows = makeRows(2).map((r, i) => ({
      ...r,
      id: 100 + i,
      dept: "finance",
    }));
    wrapper.setProps({ data: nextRows });
    await flushPromises();
    expect(changed).toBe(false);
  });

  it("同一单元格重复激活（漏收 closed 安全网）：不残留脏标记、不重复计数", async () => {
    const rows = makeRows(3);
    const { wrapper, getChanged } = await mountTracking(rows);
    const attrs = gridAttrs(wrapper);

    // 第一次激活并改脏
    callAttrsHandler(attrs, "onEditActivated", {
      row: rows[0],
      column: { field: "dept" },
    });
    renderEditSetter(wrapper, "dept", {
      row: rows[0],
      cellValue: "dev",
    })("hr");
    expect(getChanged()).toBe(true);

    // 未收到 closed 又激活同一单元格：旧会话被拆（行尚未提交，原值仍为 dev）→ 归净，
    // 新会话以 dev 为原值
    callAttrsHandler(attrs, "onEditActivated", {
      row: rows[0],
      column: { field: "dept" },
    });
    await flushPromises();
    expect(getChanged()).toBe(false);

    // 新会话：等于原值不脏，不同才脏
    const setVal = renderEditSetter(wrapper, "dept", {
      row: rows[0],
      cellValue: "dev",
    });
    setVal("dev");
    expect(getChanged()).toBe(false);
    setVal("finance");
    expect(getChanged()).toBe(true);
    // 每次翻转只发一次事件（无 watcher 重复触发）
    const trueEmits = (wrapper.emitted("update:cellChanged") || []).filter(
      (e) => e[0] === true,
    );
    const falseEmits = (wrapper.emitted("update:cellChanged") || []).filter(
      (e) => e[0] === false,
    );
    expect(trueEmits.length).toBe(2);
    expect(falseEmits.length).toBe(1);
  });

  it("嵌套对象值：按内容深度比对，快照隔离不受原对象后续突变影响", async () => {
    const rows = reactive([{ id: 1, profile: { role: "dev", level: 2 } }]);
    let changed = false;
    const { wrapper } = await mountTablePro(
      {
        columns: [
          {
            field: "profile",
            title: "档案",
            editRender: { name: "ElInput" }, // 仅借用对象式 v-model 通道
          },
        ],
        data: rows,
        pagination: false,
        editable: true,
        cellChanged: false,
        "onUpdate:cellChanged": (v) => {
          changed = v;
          wrapper.setProps({ cellChanged: v });
        },
      },
      { fullData: rows },
    );
    const attrs = gridAttrs(wrapper);
    callAttrsHandler(attrs, "onEditActivated", {
      row: rows[0],
      column: { field: "profile" },
    });
    const setVal = renderEditSetter(wrapper, "profile", {
      row: rows[0],
      cellValue: rows[0].profile,
    });

    // 内容相同、引用不同 → 不脏
    setVal({ role: "dev", level: 2 });
    expect(changed).toBe(false);
    // 嵌套字段变化 → 脏
    setVal({ role: "dev", level: 3 });
    expect(changed).toBe(true);
    // 恢复内容 → 净
    setVal({ role: "dev", level: 2 });
    expect(changed).toBe(false);
  });

  it("数字类型严格比较：0→1 脏；字符串 '0' 不等于数字 0", async () => {
    const rows = [{ id: 1, age: 0 }];
    let changed = false;
    const { wrapper } = await mountTablePro(
      {
        columns: [
          { field: "id", title: "ID" },
          { field: "age", title: "年龄", editRender: { name: "ElInputNumber" } },
        ],
        data: rows,
        pagination: false,
        editable: true,
        cellChanged: false,
        "onUpdate:cellChanged": (v) => {
          changed = v;
          wrapper.setProps({ cellChanged: v });
        },
      },
      { fullData: rows },
    );
    const attrs = gridAttrs(wrapper);
    callAttrsHandler(attrs, "onEditActivated", {
      row: rows[0],
      column: { field: "age" },
    });
    const setAge = renderEditSetter(wrapper, "age", {
      row: rows[0],
      cellValue: 0,
    });
    setAge(1);
    expect(changed).toBe(true);
    setAge(0);
    expect(changed).toBe(false);
    // 类型不同视为变更（避免数字/字符串误归净导致漏提交）
    setAge("0");
    expect(changed).toBe(true);
  });

  it("edit-closed 无对应激活态（异常序列）：不抛错并重算", async () => {
    const rows = makeRows(3);
    const { wrapper, grid, getChanged } = await mountTracking(rows);
    const attrs = gridAttrs(wrapper);

    grid.mock.recordset = emptyRecordset();
    expect(() =>
      callAttrsHandler(attrs, "onEditClosed", {
        row: rows[0],
        column: { field: "age" },
      }),
    ).not.toThrow();
    await flushPromises();
    expect(getChanged()).toBe(false);
  });

  it("改回原值后关闭：不产生 cell-edit-change 事件（值未变化）", async () => {
    const rows = makeRows(3);
    const { wrapper, grid, getChanged } = await mountTracking(rows);
    const attrs = gridAttrs(wrapper);

    callAttrsHandler(attrs, "onEditActivated", {
      row: rows[0],
      column: { field: "dept" },
    });
    const setVal = renderEditSetter(wrapper, "dept", {
      row: rows[0],
      cellValue: "dev",
    });
    setVal("hr");
    expect(getChanged()).toBe(true);
    setVal("dev");
    expect(getChanged()).toBe(false);

    const before = wrapper.emitted("cell-edit-change")?.length ?? 0;
    grid.mock.recordset = emptyRecordset();
    callAttrsHandler(attrs, "onEditClosed", {
      row: rows[0],
      column: { field: "dept" },
    });
    await flushPromises();
    const after = wrapper.emitted("cell-edit-change")?.length ?? 0;
    expect(after).toBe(before);
    expect(rows[0].dept).toBe("dev");
  });
});

function propsNotMutated(cols) {
  return cols.every((c) => {
    if (c.slots !== undefined) return false;
    if (c.children && Array.isArray(c.children)) return propsNotMutated(c.children);
    return true;
  });
}

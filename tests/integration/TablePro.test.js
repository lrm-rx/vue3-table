// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
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
});

function propsNotMutated(cols) {
  return cols.every((c) => {
    if (c.slots !== undefined) return false;
    if (c.children && Array.isArray(c.children)) return propsNotMutated(c.children);
    return true;
  });
}

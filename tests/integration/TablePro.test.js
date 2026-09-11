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
});

function propsNotMutated(cols) {
  return cols.every((c) => {
    if (c.slots !== undefined) return false;
    if (c.children && Array.isArray(c.children)) return propsNotMutated(c.children);
    return true;
  });
}

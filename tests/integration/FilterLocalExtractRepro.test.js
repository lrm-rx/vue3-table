// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import TablePro from "../../src/components/tablePro/index.vue";
import { createVxeGridStub, ElPaginationStub } from "../helpers/stubs.js";

// 复现用户反馈：localFilterSort=true，FilterCheckbox 本地提取模式，
// 确认过滤 A 后重新打开面板，选项不应只剩 A，应为完整 A..F（A 勾选）。
const makeRows = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `name-${i}`,
    role: String.fromCharCode(65 + (i % 6)), // A..F 循环
  }));

const COLUMNS = [
  { type: "seq", width: 60, title: "序号" },
  { field: "name", title: "姓名", sortable: true, filterType: "FilterInput" },
  { field: "role", title: "角色", filterType: "FilterCheckbox" },
];

const mountTablePro = async (props = {}) => {
  const g = createVxeGridStub();
  const wrapper = mount(TablePro, {
    props,
    global: {
      stubs: {
        "vxe-grid": g.stub,
        "vxe-button": true,
        "el-pagination": ElPaginationStub,
      },
    },
  });
  await flushPromises();
  // 取 TablePro provide 的过滤上下文
  const tp = wrapper.findComponent({ name: "VxeGridStub" });
  const tableProVm = tp.vm.$.parent;
  const ctx = tableProVm.provides.tableProFilterContext;
  return { wrapper, grid: g, ctx };
};

describe("localFilterSort 本地提取：确认过滤后重开面板选项完整性", () => {
  it("确认 role=[A] 后，getLocalCheckboxOptions('role') 仍返回完整 A..F（排除自身列过滤）", async () => {
    const rows = makeRows(18);
    const { grid, ctx } = await mountTablePro({
      columns: COLUMNS,
      data: rows,
      pagination: true,
      localFilterSort: true,
    });

    // 1) 首次提取：无过滤 → A..F 共 6 项
    const first = ctx.getLocalCheckboxOptions("role");
    expect(first.map((o) => o.value)).toEqual(["A", "B", "C", "D", "E", "F"]);

    // 2) 模拟确认过滤 role=[A]：vxe 内部列状态 checked=true + data.values=['A']
    grid.mock.columns = [
      {
        field: "role",
        filterRender: { name: "FilterCheckbox" },
        filters: [{ data: { values: ["A"], search: "" }, checked: true }],
      },
      { field: "name", filterRender: { name: "FilterInput" }, filters: [{ data: { value: "" } }] },
    ];

    // 3) 重新打开面板时组件会再次提取：必须仍是 A..F
    const second = ctx.getLocalCheckboxOptions("role");
    expect(second.map((o) => o.value)).toEqual(["A", "B", "C", "D", "E", "F"]);

    // 4) 其他列过滤仍级联：确认 role=[A]（自身）+ name 含 'name-1'（他列，
    //    FilterInput 为包含匹配 → 命中 name-1 与 name-10~18，对应 id 2,11,12,...,18）
    grid.mock.columns[0].filters[0].data = { values: ["A"], search: "" };
    grid.mock.columns[1].filters[0].data = { value: "name-1" };
    grid.mock.columns[1].filters[0].checked = true;
    const third = ctx.getLocalCheckboxOptions("role");
    expect(third.map((o) => o.value)).toEqual(["B", "E", "F", "A", "C", "D"]);

    // 5) 取消他列过滤后恢复完整
    grid.mock.columns[1].filters[0].checked = false;
    const fourth = ctx.getLocalCheckboxOptions("role");
    expect(fourth.map((o) => o.value)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("远程选项：fetchFilterOptions 传给 requestFilterAPI 的 filters 不含当前列自身（facet 语义）", async () => {
    const rows = makeRows(18);
    // requestFilterAPI 捕获入参：后端按 filters 级联返回选项
    const captured = [];
    const requestFilterAPI = vi.fn(async (params) => {
      captured.push(params);
      return [];
    });
    const { grid, ctx } = await mountTablePro({
      columns: [
        { type: "seq", width: 60, title: "序号" },
        { field: "role", title: "角色", filterType: "FilterCheckbox" },
        { field: "dept", title: "部门", filterType: "FilterCheckbox" },
      ],
      data: rows,
      pagination: true,
      requestFilterAPI,
    });

    // 模拟已确认状态：role=[A]（当前列自身）、dept=[D1]（他列）
    grid.mock.columns = [
      {
        field: "role",
        filterRender: { name: "FilterCheckbox" },
        filters: [{ data: { values: ["A"], search: "" }, checked: true }],
      },
      {
        field: "dept",
        filterRender: { name: "FilterCheckbox" },
        filters: [{ data: { values: ["D1"], search: "" }, checked: true }],
      },
    ];

    // 拉取 role 列选项：filters 只含他列 dept，不含自身 role
    await ctx.fetchFilterOptions("role");
    expect(captured[0].field).toBe("role");
    expect(captured[0].filters).toEqual({ dept: ["D1"] });

    // 拉取 dept 列选项：filters 只含他列 role，不含自身 dept
    await ctx.fetchFilterOptions("dept");
    expect(captured[1].field).toBe("dept");
    expect(captured[1].filters).toEqual({ role: ["A"] });
  });
});

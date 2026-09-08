import { describe, it, expect } from "vitest";
import { h } from "vue";
import {
  buildColumns,
  findColumnByField,
  forEachLeafColumn,
  resolveParamKey,
} from "../../src/components/tablePro/utils/columns.js";

// 与 index.vue 中 mergedColumns computed 传参一致
const makeCtx = (over = {}) => {
  const editLocalState = {};
  return {
    columns: [],
    defaultColumnConfig: { showOverflow: "tooltip", minWidth: 120 },
    initParam: {},
    slots: {},
    editable: true,
    editOptions: {},
    cellEditProps: {},
    editLocalState,
    resolveEditStateKey: (row, field) =>
      `id:${row && row.id}:${String(field)}`,
    emit: () => {},
    ...over,
  };
};
const run = (columns, over = {}) => {
  const ctx = makeCtx({ columns, ...over });
  return { result: buildColumns(ctx), ctx };
};

describe("基础拷贝与公共列配置", () => {
  it("不修改原始列对象；返回新对象并补齐 slots", () => {
    const raw = { field: "a", title: "A" };
    const { result } = run([raw]);
    expect(result[0]).not.toBe(raw);
    expect(raw.slots).toBeUndefined();
    expect(result[0].slots).toEqual({});
  });

  it("普通数据列合并公共配置（列自身优先级更高）", () => {
    const { result } = run([
      { field: "a", title: "A" },
      { field: "b", title: "B", showOverflow: false, minWidth: 200 },
    ]);
    expect(result[0]).toMatchObject({ showOverflow: "tooltip", minWidth: 120 });
    expect(result[1]).toMatchObject({ showOverflow: false, minWidth: 200 });
  });

  it("特殊列（checkbox/seq）不套公共列配置", () => {
    const { result } = run([
      { type: "checkbox", width: 50 },
      { type: "seq", width: 60 },
    ]);
    expect(result[0].minWidth).toBeUndefined();
    expect(result[0].showOverflow).toBeUndefined();
    expect(result[1].minWidth).toBeUndefined();
  });
});

describe("对齐默认值", () => {
  it("checkbox/seq 默认居中对齐", () => {
    const { result } = run([{ type: "checkbox", width: 50 }]);
    expect(result[0]).toMatchObject({ align: "center", headerAlign: "center" });
  });

  it("数据列：无配置默认 left/left", () => {
    const { result } = run([{ field: "a" }]);
    expect(result[0]).toMatchObject({ align: "left", headerAlign: "left" });
  });

  it("仅配 headerAlign 时对齐同步；仅配 align 时 headerAlign 不强制覆盖", () => {
    const onlyHeader = run([{ field: "a", headerAlign: "right" }]).result[0];
    expect(onlyHeader.align).toBe("right");

    const onlyAlign = run([{ field: "a", align: "center" }]).result[0];
    expect(onlyAlign.align).toBe("center");
    expect(onlyAlign.headerAlign).toBeUndefined();
  });
});

describe("filterType / filterRender 自动注入", () => {
  it("filterType 简写注入 filters + filterRender", () => {
    const { result } = run([{ field: "name", title: "姓名", filterType: "FilterInput" }]);
    const col = result[0];
    expect(col.filterRender).toEqual({ name: "FilterInput" });
    expect(col.filters).toEqual([{ data: { value: "" } }]);
  });

  it("已有 filterRender.name 时省略 filterType 同样注入 filters，且保留用户 filterRender", () => {
    const { result } = run([
      {
        field: "role",
        filterRender: { name: "FilterCheckbox", props: { options: [] } },
      },
    ]);
    expect(result[0].filterRender).toEqual({
      name: "FilterCheckbox",
      props: { options: [] },
    });
    expect(result[0].filters).toEqual([{ data: { values: [], search: "" } }]);
  });

  it("回归：同类型多列的默认 data（含 values 数组）互不共享", () => {
    const { result } = run([
      { field: "a", filterType: "FilterCheckbox" },
      { field: "b", filterType: "FilterCheckbox" },
      { field: "c", filterType: "FilterDateRange" },
      { field: "d", filterType: "FilterDateRange" },
    ]);
    const [ca, cb, cc, cd] = result;
    expect(ca.filters[0].data.values).not.toBe(cb.filters[0].data.values);
    expect(cc.filters[0].data.values).not.toBe(cd.filters[0].data.values);
    // 修改一列不影响其他列
    ca.filters[0].data.values.push("x");
    cc.filters[0].data.values[0] = "2024-01-01";
    expect(cb.filters[0].data.values).toEqual([]);
    expect(cd.filters[0].data.values).toEqual([null, null]);
  });

  it("initParam.filters 默认值注入 data 并标记 checked", () => {
    const { result } = run(
      [
        { field: "name", filterType: "FilterInput" },
        { field: "role", filterType: "FilterCheckbox" },
        { field: "age", filterType: "FilterNumberRange" },
      ],
      { initParam: { filters: { name: "张", role: ["admin"], age: [1, 9] } } },
    );
    const [name, role, age] = result;
    expect(name.filters[0].data).toEqual({ value: "张" });
    expect(name.filters[0].checked).toBe(true);
    expect(role.filters[0].data.values).toEqual(["admin"]);
    expect(role.filters[0].checked).toBe(true);
    expect(age.filters[0].data.values).toEqual([1, 9]);
    expect(age.filters[0].checked).toBe(true);
  });

  it("defaultColumnConfig.filterDefaults 允许覆盖注入的默认 data", () => {
    const { result } = run([{ field: "x", filterType: "FilterInput" }], {
      defaultColumnConfig: {
        showOverflow: "tooltip",
        minWidth: 120,
        filterDefaults: {
          FilterInput: {
            filters: [{ data: { value: "pre" } }],
            filterRender: { name: "FilterInput" },
          },
        },
      },
    });
    expect(result[0].filters[0].data).toEqual({ value: "pre" });
  });
});

describe("render / headerRender → slots", () => {
  it("函数式 render → slots.default（参数含 row/cellValue/$table 等）", () => {
    const spy = (params) => h("span", null, String(params.cellValue));
    const { result } = run([
      { field: "a", title: "A", render: spy },
    ]);
    const scope = {
      row: { a: "hello" },
      cellValue: "hello",
      $rowIndex: 2,
      $columnIndex: 3,
      $table: { name: "t" },
    };
    const vnode = result[0].slots.default(scope);
    expect(vnode.type).toBe("span");
    expect(vnode.children).toBe("hello");
  });

  it("render 抛错时兜底为红色错误 span（不向上抛）", () => {
    const { result } = run([{ field: "a", render: () => { throw new Error("boom"); } }]);
    const vnode = result[0].slots.default({ row: {}, cellValue: 1 });
    expect(vnode.type).toBe("span");
    expect(vnode.children).toBe("boom");
  });

  it("字符串 render 命中外部具名插槽 → slots.default 引用插槽名", () => {
    const slotFn = () => null;
    const { result } = run([{ field: "phone", render: "cell_phone" }], {
      slots: { cell_phone: slotFn },
    });
    expect(result[0].slots.default).toBe("cell_phone");
  });

  it("字符串 render 未命中插槽时不引用", () => {
    const { result } = run([{ field: "phone", render: "cell_phone" }], { slots: {} });
    expect(result[0].slots.default).toBeUndefined();
  });

  it("headerRender 函数式/字符串式分别注入 slots.header", () => {
    const headerFn = (params) => h("b", null, params.title);
    const slotFn = () => null;
    const { result } = run(
      [
        { field: "a", title: "A", headerRender: headerFn },
        { field: "b", title: "B", headerRender: "header_b" },
      ],
      { slots: { header_b: slotFn } },
    );
    const scope = { $table: {}, $rowIndex: 0, $columnIndex: 1 };
    const vnode = result[0].slots.header(scope);
    expect(vnode.type).toBe("b");
    expect(vnode.children).toBe("A");
    expect(result[1].slots.header).toBe("header_b");
  });
});

describe("editRender 分流", () => {
  const scopeFor = (field, row, cellValue, table = {}) => ({
    row,
    column: { field },
    cellValue,
    $rowIndex: 0,
    $columnIndex: 0,
    $table: table,
  });

  it("函数式 editRender：editable 开启则注入 slots.edit 并删除 editRender", () => {
    const userEdit = (params) => h("input", { value: params.cellValue });
    const { result } = run([{ field: "a", title: "A", editRender: userEdit }]);
    const col = result[0];
    expect(col.editable).toBe(true);
    expect(col.editRender).toBeUndefined();
    const vnode = col.slots.edit(scopeFor("a", { a: "x" }, "x"));
    expect(vnode.type).toBe("input");
  });

  it("editable=false（权限控制）：函数式 editRender 不设 editable、不建 slots.edit", () => {
    const { result } = run([{ field: "a", editRender: () => h("input") }], {
      editable: false,
    });
    expect(result[0].editable).toBeUndefined();
    expect(result[0].slots.edit).toBeUndefined();
  });

  it("字符串式 editRender 命中插槽 → slots.edit 引用；未命中则仅删除配置", () => {
    const slotFn = () => null;
    const hit = run([{ field: "e", editRender: "edit_e" }], { slots: { edit_e: slotFn } });
    expect(hit.result[0].slots.edit).toBe("edit_e");
    expect(hit.result[0].editRender).toBeUndefined();

    const miss = run([{ field: "e", editRender: "edit_e" }], { slots: {} });
    expect(miss.result[0].slots.edit).toBeUndefined();
  });

  it("对象式 editRender（ElInput）：slots.edit 渲染受控组件并同步编辑本地态", () => {
    const { result, ctx } = run([
      { field: "name", title: "姓名", editRender: { name: "ElInput" } },
    ]);
    const col = result[0];
    expect(col.editable).toBe(true);
    // 未提供 render/slots.default 时自动补 label 回退
    expect(typeof col.slots.default).toBe("function");

    const row = { id: 1, name: "v1" };
    const vnode = col.slots.edit(scopeFor("name", row, "v1"));
    expect(vnode.type.name || vnode.type.__name).toBe("ElInput");
    expect(vnode.props.modelValue).toBe("v1");
    expect(vnode.props.title).toBe("姓名");

    // v-model 更新写入 editLocalState
    vnode.props["onUpdate:modelValue"]("v2");
    expect(ctx.editLocalState["id:1:name"]).toBe("v2");
    // 二次渲染不再覆盖已修改的本地值
    const again = col.slots.edit(scopeFor("name", row, "v1"));
    expect(again.props.modelValue).toBe("v2");
  });

  it("对象式 editRender（ElSelect）：options 来源优先级 + 默认插槽子项", () => {
    const options = [
      { label: "开发", value: "dev" },
      { label: "测试", value: "qa" },
    ];
    const { result } = run(
      [{ field: "dept", title: "部门", editRender: { name: "ElSelect" } }],
      { editOptions: { dept: options } },
    );
    const col = result[0];
    const row = { id: 2, dept: "dev" };
    const vnode = col.slots.edit(scopeFor("dept", row, "dev"));
    expect(vnode.type.name || vnode.type.__name).toBe("ElSelect");
    // 编辑态组件需要挂载后自动弹出（ElSelect 在自动弹出集合内）
    expect(typeof vnode.props.onVnodeMounted).toBe("function");

    // 非编辑态 label 回退：编辑态未注入时通过 slots.default 渲染 label
    const fallback = col.slots.default(scopeFor("dept", { id: 2, dept: "dev" }, "dev"));
    expect(fallback.type).toBe("span");
    expect(fallback.children).toBe("开发");
  });

  it("editRender.options（顶层）优先于 editOptions", () => {
    const { result } = run(
      [
        {
          field: "role",
          editRender: {
            name: "ElRadio",
            options: [{ label: "A", value: 1 }],
          },
        },
      ],
      { editOptions: { role: [{ label: "B", value: 2 }] } },
    );
    const col = result[0];
    const row = { id: 3, role: 1 };
    const vnode = col.slots.edit(scopeFor("role", row, 1));
    expect(vnode.type.name || vnode.type.__name).toBe("ElRadioGroup");
    // label 回退同样优先使用 editRender.options
    const fallback = col.slots.default(scopeFor("role", row, 1));
    expect(fallback.children).toBe("A");
  });

  it("数组字段 label 回退渲染多个 span", () => {
    const { result } = run(
      [{ field: "tags", editRender: { name: "ElCheckbox" } }],
      { editOptions: { tags: [{ label: "一", value: 1 }, { label: "二", value: 2 }] } },
    );
    const fallback = result[0].slots.default(
      scopeFor("tags", { id: 4, tags: [1, 3] }, [1, 3]),
    );
    expect(fallback.type).toBe("span");
    expect(Array.isArray(fallback.children)).toBe(true);
    expect(fallback.children).toHaveLength(2);
  });

  it("TextareaPopoverEdit：透传三按钮事件 payload {row,column,field,value}", () => {
    const emitted = [];
    const { result } = run(
      [{ field: "remark", title: "备注", editRender: { name: "TextareaPopoverEdit" } }],
      { emit: (...args) => emitted.push(args) },
    );
    const col = result[0];
    const row = { id: 5, remark: "old" };
    const vnode = col.slots.edit(scopeFor("remark", row, "old"));
    expect(vnode.type.name || vnode.type.__name).toBe("TextareaPopoverEdit");
    expect(typeof vnode.props.onClear).toBe("function");
    expect(typeof vnode.props.onCancel).toBe("function");
    expect(typeof vnode.props.onConfirm).toBe("function");

    vnode.props.onClear({ value: "" });
    vnode.props.onCancel({ value: "cancel" });
    vnode.props.onConfirm({ value: "new" });
    expect(emitted.map((e) => e[0])).toEqual([
      "textarea-clear",
      "textarea-cancel",
      "textarea-confirm",
    ]);
    const [, payload] = emitted[2];
    expect(payload).toMatchObject({ row, field: "remark", value: "new" });
    expect(payload.column.field).toBe("remark");
  });

  it("弹出面板类（ElSelect）自动追加 ignore-clear popperClass", () => {
    const { result } = run([
      {
        field: "a",
        editRender: {
          name: "ElSelect",
          props: { popperClass: "my-popper" },
        },
      },
    ]);
    const row = { id: 6, a: 1 };
    const vnode = result[0].slots.edit(scopeFor("a", row, 1));
    expect(vnode.props.popperClass).toBe("vxe-table--ignore-clear my-popper");
  });
});

describe("hideColumn / 分组列", () => {
  it("hideColumn 叶子列被过滤", () => {
    const { result } = run([
      { field: "a", params: { hideColumn: true } },
      { field: "b" },
    ]);
    expect(result.map((c) => c.field)).toEqual(["b"]);
  });

  it("分组列递归：子列 hideColumn 过滤；全隐藏时父列一并过滤；父列支持 headerRender", () => {
    const headerFn = (p) => h("span", p.title);
    const { result } = run([
      {
        title: "组1",
        headerRender: headerFn,
        children: [
          { field: "a", params: { hideColumn: true } },
          { field: "b" },
        ],
      },
      { title: "组2", children: [{ field: "c", params: { hideColumn: true } }] },
    ]);
    expect(result).toHaveLength(1);
    const group = result[0];
    expect(group.title).toBe("组1");
    expect(group.children.map((c) => c.field)).toEqual(["b"]);
    expect(typeof group.slots.header).toBe("function");
  });

  it("hideColumn 配置不影响传入的原始列", () => {
    const raw = { field: "a", params: { hideColumn: true } };
    run([raw]);
    expect(raw.params.hideColumn).toBe(true);
  });
});

describe("导出的列工具函数", () => {
  const cols = [
    { field: "top", children: [{ field: "a" }, { field: "b" }] },
    { field: "c", params: { defParamKey: "ck" } },
  ];

  it("findColumnByField 递归 children 查找", () => {
    expect(findColumnByField(cols, "a").field).toBe("a");
    expect(findColumnByField(cols, "nope")).toBeUndefined();
    expect(findColumnByField(cols, "")).toBeUndefined();
    expect(findColumnByField(null, "a")).toBeUndefined();
  });

  it("forEachLeafColumn 仅遍历叶子列且保持顺序", () => {
    const got = [];
    forEachLeafColumn(cols, (c) => got.push(c.field));
    expect(got).toEqual(["a", "b", "c"]);
  });

  it("resolveParamKey：defParamKey > field > fallback", () => {
    expect(resolveParamKey({ field: "x", params: { defParamKey: "xx" } })).toBe("xx");
    expect(resolveParamKey({ field: "x" })).toBe("x");
    expect(resolveParamKey(null, "fb")).toBe("fb");
  });
});

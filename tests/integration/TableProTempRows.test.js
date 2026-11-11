// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { VxeGrid } from "vxe-table";
import TablePro from "../../src/components/tablePro/index.vue";

// jsdom 缺失的浏览器 API（vxe 依赖）
if (!global.ResizeObserver) {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  });
}

const nextFrame = () => new Promise((r) => setTimeout(r, 30));

const columns = [
  { field: "id", title: "ID", width: 80 },
  { field: "name", title: "名称", width: 120 },
];

const makeData = (ids) => ids.map((id) => ({ id, name: `n${id}` }));

/**
 * 静态数据模式挂载（数据替换 = 翻页/切页大小/刷新 时的 loadData 路径），
 * 通过替换 data 模拟分页重载，验证临时新增行是否被重插。
 */
const mountTable = async (data) => {
  const state = { changed: false };
  const wrapper = mount(TablePro, {
    attachTo: document.body,
    props: {
      columns,
      data,
      showToolbar: false,
      pagination: false,
      editable: true,
      cellChanged: false,
      "onUpdate:cellChanged": (v) => {
        state.changed = v;
        wrapper.setProps({ cellChanged: v });
      },
    },
    global: { plugins: [VxeGrid] },
  });
  await flushPromises();
  await nextFrame();

  const grid = () => wrapper.findComponent({ name: "VxeGrid" }).vm;
  const fullData = () => grid().getTableData().fullData;
  const reload = async (nextData) => {
    await wrapper.setProps({ data: nextData });
    await flushPromises();
    await nextFrame();
    await flushPromises();
  };

  return {
    wrapper,
    grid,
    fullData,
    reload,
    changed: () => state.changed,
  };
};

describe("TablePro 临时新增行在数据重载后的保留", () => {
  it("数据替换后本页临时行按原位置重插，且 cellChanged 保持 true", async () => {
    const t = await mountTable(makeData([1, 2]));
    t.wrapper.vm.insertRow();
    t.wrapper.vm.insertRow();
    await flushPromises();
    await nextFrame();
    expect(t.fullData()).toHaveLength(4);
    expect(t.changed()).toBe(true);

    const tempNames = t.fullData()
      .filter((r) => String(r.id).startsWith("row_"))
      .map((r) => r.id);
    expect(tempNames).toHaveLength(2);

    // 新数据保留原锚点行（id=1），临时行应重插到它之前
    await t.reload(makeData([1, 5, 6]));
    // 3 条基础数据 + 2 条临时新增行
    expect(t.fullData()).toHaveLength(5);
    const ids = t.fullData().map((r) => r.id);
    // 新增行仍在新数据的首行之前，且相互顺序不变
    expect(ids.slice(0, 2)).toEqual(tempNames);
    expect(ids.slice(2)).toEqual([1, 5, 6]);
    expect(t.changed()).toBe(true);
  });

  it("insertRowAt 指定锚点：重载后仍插在锚点行之前", async () => {
    const t = await mountTable(makeData([1, 2, 3]));
    const anchor = t.fullData()[2]; // id=3
    t.wrapper.vm.insertRowAt([{ name: "x" }], anchor);
    await flushPromises();
    await nextFrame();
    const tempId = t.fullData()[2].id;
    expect(String(tempId).startsWith("row_")).toBe(true);

    await t.reload(makeData([1, 2, 3]));
    const ids = t.fullData().map((r) => r.id);
    expect(ids).toEqual([1, 2, tempId, 3]);
  });

  it("锚点行不在新数据中时追加到末尾，不丢失", async () => {
    const t = await mountTable(makeData([1, 2]));
    t.wrapper.vm.insertRow({ name: "tail" });
    await flushPromises();
    await nextFrame();
    const tempId = t.fullData()[0].id;

    // 新数据不含原锚点（id=1）
    await t.reload(makeData([8, 9]));
    const ids = t.fullData().map((r) => r.id);
    expect(ids).toContain(tempId);
    expect(ids.indexOf(tempId)).toBe(ids.length - 1);
  });

  it("removeRows 移除的临时行不会在重载后复活", async () => {
    const t = await mountTable(makeData([1]));
    t.wrapper.vm.insertRow({ name: "keep" });
    t.wrapper.vm.insertRow({ name: "drop" });
    await flushPromises();
    await nextFrame();
    expect(t.fullData()).toHaveLength(3);

    const dropRow = t.fullData().find((r) => r.name === "drop");
    t.wrapper.vm.removeRows([dropRow]);
    await flushPromises();
    await nextFrame();

    await t.reload(makeData([2]));
    const names = t.fullData().map((r) => r.name);
    expect(names).toContain("keep");
    expect(names).not.toContain("drop");
  });

  it("markSaved 后临时行落地，重载不再重插", async () => {
    const t = await mountTable(makeData([1]));
    t.wrapper.vm.insertRow({ name: "saved" });
    await flushPromises();
    await nextFrame();
    expect(t.changed()).toBe(true);

    await t.wrapper.vm.markSaved();
    await flushPromises();
    await nextFrame();
    expect(t.changed()).toBe(false);

    await t.reload(makeData([1, 2]));
    expect(t.fullData()).toHaveLength(2);
  });
});

// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { VxeGrid } from "vxe-table";
import TablePro from "../../src/components/tablePro/index.vue";
import Pagination from "../../src/components/tablePro/pagination/Pagination.vue";

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
const mountTable = async (data, extraProps = {}) => {
  const state = { changed: false };
  const wrapper = mount(TablePro, {
    attachTo: document.body,
    props: {
      columns,
      data,
      showToolbar: false,
      pagination: false,
      ...extraProps,
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

  it("远程先刷新再完成保存，旧临时行不与服务端新行重复", async () => {
    let serverData = makeData([1]);
    const state = { changed: false };
    const wrapper = mount(TablePro, {
      attachTo: document.body,
      props: {
        columns,
        requestApi: async () => ({ list: serverData, total: serverData.length }),
        showToolbar: false,
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
    const grid = wrapper.findComponent({ name: "VxeGrid" }).vm;

    wrapper.vm.insertRow({ name: "saved" });
    await flushPromises();
    await nextFrame();
    expect(state.changed).toBe(true);

    // 模拟保存接口已落库：服务端返回带正式 id 的新行
    serverData = [{ id: 1, name: "n1" }, { id: 2, name: "saved" }];
    // 模拟父组件保存流程：先重新请求，再回写 cellChanged=false 触发保存收尾
    await wrapper.vm.getTableList();
    await wrapper.setProps({ cellChanged: false });
    await flushPromises();
    await nextFrame();
    await flushPromises();

    expect(grid.getTableData().fullData.map((r) => r.id)).toEqual([1, 2]);
    expect(grid.getTableData().fullData.filter((r) => r.name === "saved")).toHaveLength(1);
    expect(wrapper.vm.currentPager.total).toBe(2);
    expect(state.changed).toBe(false);
    wrapper.unmount();
  });

  it("静态空白页提示临时行所属页，点击按钮后返回", async () => {
    const data = makeData(Array.from({ length: 36 }, (_, i) => i + 1));
    const t = await mountTable(data, { pagination: true });
    const records = Array.from({ length: 22 }, (_, i) => ({ name: `batch-${i}` }));
    t.wrapper.vm.insertRowAt(records, -1);
    await flushPromises();
    await nextFrame();
    expect(t.wrapper.vm.currentPager.total).toBe(58);

    t.wrapper.findComponent(Pagination).vm.$emit("change", {
      ...t.wrapper.vm.currentPager,
      currentPage: 6,
    });
    await flushPromises();
    await nextFrame();
    await flushPromises();

    expect(t.wrapper.vm.currentPager.currentPage).toBe(6);
    expect(t.wrapper.find(".table-pro__empty").text()).toContain(
      "当前页暂无数据，未保存新增行在第 1 页",
    );
    const backButton = t.wrapper.find(".table-pro__empty-action");
    expect(backButton.text()).toBe("返回第 1 页");

    await backButton.trigger("click");
    await flushPromises();
    await nextFrame();
    expect(t.wrapper.vm.currentPager.currentPage).toBe(1);
    expect(t.fullData()).toHaveLength(32);
    expect(t.fullData().filter((r) => String(r.id).startsWith("row_"))).toHaveLength(22);
    expect(t.wrapper.vm.currentPager.total).toBe(58);
    t.wrapper.unmount();
  });

  it("远程空白页提示临时行所属页，点击按钮后重新请求该页", async () => {
    const serverData = makeData(Array.from({ length: 36 }, (_, i) => i + 1));
    const requestedPages = [];
    const wrapper = mount(TablePro, {
      attachTo: document.body,
      props: {
        columns,
        requestApi: async ({ pageNum = 1, pageSize = 10 }) => {
          requestedPages.push(pageNum);
          const start = (pageNum - 1) * pageSize;
          return {
            list: serverData.slice(start, start + pageSize),
            total: serverData.length,
          };
        },
        showToolbar: false,
        editable: true,
      },
      global: { plugins: [VxeGrid] },
    });
    await flushPromises();
    await nextFrame();
    const grid = wrapper.findComponent({ name: "VxeGrid" }).vm;
    const records = Array.from({ length: 22 }, (_, i) => ({ name: `remote-${i}` }));
    wrapper.vm.insertRowAt(records, -1);
    await flushPromises();
    await nextFrame();
    expect(wrapper.vm.currentPager.total).toBe(58);

    wrapper.findComponent(Pagination).vm.$emit("change", {
      ...wrapper.vm.currentPager,
      currentPage: 6,
    });
    await flushPromises();
    await nextFrame();
    await flushPromises();

    expect(wrapper.vm.currentPager.currentPage).toBe(6);
    expect(requestedPages.at(-1)).toBe(6);
    expect(wrapper.find(".table-pro__empty").text()).toContain(
      "当前页暂无数据，未保存新增行在第 1 页",
    );

    await wrapper.find(".table-pro__empty-action").trigger("click");
    await flushPromises();
    await nextFrame();
    await flushPromises();

    expect(wrapper.vm.currentPager.currentPage).toBe(1);
    expect(requestedPages.at(-1)).toBe(1);
    expect(grid.getTableData().fullData).toHaveLength(32);
    expect(
      grid.getTableData().fullData.filter((r) => String(r.id).startsWith("row_")),
    ).toHaveLength(22);
    wrapper.unmount();
  });

  it("普通空数据没有临时行时，仅显示暂无数据且不显示返回按钮", async () => {
    const data = makeData(Array.from({ length: 36 }, (_, i) => i + 1));
    const t = await mountTable(data, { pagination: true });

    t.wrapper.findComponent(Pagination).vm.$emit("change", {
      ...t.wrapper.vm.currentPager,
      currentPage: 6,
    });
    await flushPromises();
    await nextFrame();
    await flushPromises();

    expect(t.wrapper.vm.currentPager.currentPage).toBe(6);
    expect(t.wrapper.find(".table-pro__empty").text()).toBe("暂无数据");
    expect(t.wrapper.find(".table-pro__empty-action").exists()).toBe(false);
    t.wrapper.unmount();
  });

  it("静态分页 getAllData 返回全量正式数据及所有页临时行", async () => {
    const data = makeData(Array.from({ length: 25 }, (_, i) => i + 1));
    const t = await mountTable(data, { pagination: true });

    t.wrapper.vm.insertRow({ name: "page-1-temp" });
    await flushPromises();
    await nextFrame();

    t.wrapper.findComponent(Pagination).vm.$emit("change", {
      ...t.wrapper.vm.currentPager,
      currentPage: 2,
    });
    await flushPromises();
    await nextFrame();
    await flushPromises();

    // 当前页没有临时行时，其他页新增仍应保持脏状态并纳入变更摘要
    expect(t.changed()).toBe(true);
    expect(
      t.wrapper.vm.getChangeState().insertRecords.map((row) => row.name),
    ).toEqual(["page-1-temp"]);

    t.wrapper.vm.insertRow({ name: "page-2-temp" });
    await flushPromises();
    await nextFrame();

    expect(t.wrapper.vm.getChangeState().insertRecords).toHaveLength(2);
    expect(t.wrapper.vm.getFullData()).toHaveLength(11);
    const allData = t.wrapper.vm.getAllData();
    expect(allData).toHaveLength(27);
    expect(allData.slice(0, 25).map((row) => row.id)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1),
    );
    expect(
      allData
        .filter((row) => String(row.id).startsWith("row_"))
        .map((row) => row.name)
        .sort(),
    ).toEqual(["page-1-temp", "page-2-temp"]);

    // 返回新数组，调用方修改数组本身不会影响组件数据
    allData.pop();
    expect(t.wrapper.vm.getAllData()).toHaveLength(27);

    // 模拟演示页保存：合并后的全量数据写回 data，翻页重载后仍不丢行
    const savedData = t.wrapper.vm.getAllData().map((row) => ({ ...row }));
    await t.wrapper.vm.markSaved();
    await t.reload(savedData);
    expect(t.wrapper.vm.getAllData()).toHaveLength(27);
    expect(t.wrapper.vm.currentPager.total).toBe(27);
    expect(t.changed()).toBe(false);
    t.wrapper.unmount();
  });

  it("静态 getAllData 排除当前删除的正式行，取消后恢复原始全量", async () => {
    const t = await mountTable(makeData([1, 2, 3]));
    await t.wrapper.vm.removeRows(t.fullData()[0]);
    t.wrapper.vm.insertRow({ name: "temp" });
    await flushPromises();
    await nextFrame();

    const allData = t.wrapper.vm.getAllData();
    expect(allData.map((row) => row.id)).not.toContain(1);
    expect(allData).toHaveLength(3);
    expect(allData.filter((row) => row.name === "temp")).toHaveLength(1);

    await t.wrapper.vm.revertChanges();
    await flushPromises();
    await nextFrame();
    expect(t.wrapper.vm.getAllData().map((row) => row.id)).toEqual([1, 2, 3]);
    t.wrapper.unmount();
  });
});

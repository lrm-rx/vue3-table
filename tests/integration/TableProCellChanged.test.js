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

const getCells = () =>
  Array.from(document.querySelectorAll(".vxe-table--body tbody tr")).map((tr) =>
    Array.from(tr.querySelectorAll("td")),
  );

/**
 * 挂载「alwaysEdit + TextareaPopoverEdit」的 look 回退列（与 TableDemo 备注列一致），
 * 返回操作句柄：点击单元格 / 在 popover 中输入并确定 / 读取外部状态。
 */
const mountTable = async (initialRemark) => {
  let rows = [];
  const state = { changed: false };
  const requestApi = async () => {
    rows = [{ id: 1, remark: initialRemark, username: "u1" }];
    return { list: rows, total: rows.length };
  };
  const wrapper = mount(TablePro, {
    attachTo: document.body,
    props: {
      columns: [
        { field: "id", title: "ID", width: 80 },
        {
          field: "remark",
          title: "备注",
          minWidth: 200,
          alwaysEdit: true,
          editRender: { name: "TextareaPopoverEdit" },
          params: { hideColumn: false },
        },
      ],
      editable: true,
      showToolbar: false,
      pagination: true,
      requestApi,
      requestAuto: true,
      editRules: {
        remark: [{ required: true, message: "请输入备注", trigger: "change" }],
      },
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

  const clickCell = async () => {
    const td = getCells()[0][1];
    td.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
    await nextFrame();
  };
  const typeAndConfirm = async (text) => {
    const textarea = document.querySelector(".textarea-popover-edit textarea");
    textarea.value = text;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();
    const btn = Array.from(
      document.querySelectorAll(".textarea-popover-edit button"),
    ).find((b) => b.textContent.trim() === "确定");
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
    await nextFrame();
  };

  return {
    wrapper,
    rows: () => rows,
    changed: () => state.changed,
    dirtyCount: () => document.querySelectorAll(".col--dirty").length,
    edit: async (text) => {
      await clickCell();
      await typeAndConfirm(text);
    },
  };
};

describe("TablePro cellChanged 与 vxe 修改标记一致性", () => {
  it("原值为空：修改后为 true，清空回到原值后应为 false（无修改标记）", async () => {
    const t = await mountTable("");
    await t.edit("abc");
    expect(t.changed()).toBe(true);
    expect(t.dirtyCount()).toBeGreaterThan(0);

    await t.edit("");
    expect(t.rows()[0].remark).toBe("");
    expect(t.changed()).toBe(false);
    expect(t.dirtyCount()).toBe(0);
    t.wrapper.unmount();
  });

  it("原值非空：清空不等于原值，cellChanged 应与修改标记一致保持 true", async () => {
    const t = await mountTable("orig");
    await t.edit("abc");
    expect(t.changed()).toBe(true);

    await t.edit("");
    expect(t.rows()[0].remark).toBe("");
    // 清空 ≠ 原值：vxe 仍显示修改标记，cellChanged 必须同步为 true
    expect(t.dirtyCount()).toBeGreaterThan(0);
    expect(t.changed()).toBe(true);
    t.wrapper.unmount();
  });

  it("原值非空：改回原值后应归净（cellChanged=false、无修改标记）", async () => {
    const t = await mountTable("orig");
    await t.edit("xyz");
    expect(t.changed()).toBe(true);

    await t.edit("orig");
    expect(t.rows()[0].remark).toBe("orig");
    expect(t.changed()).toBe(false);
    expect(t.dirtyCount()).toBe(0);
    t.wrapper.unmount();
  });

  it("保存为新基线后再次编辑并清空：应归净（cellChanged=false、无修改标记）", async () => {
    const t = await mountTable("orig");
    // 先清空并保存，使空值成为新基线
    await t.edit("");
    expect(t.changed()).toBe(true);
    await t.wrapper.vm.markSaved();
    await flushPromises();
    await nextFrame();
    expect(t.changed()).toBe(false);
    expect(t.dirtyCount()).toBe(0);

    // 再次修改 → 清空回基线
    await t.edit("abc");
    expect(t.changed()).toBe(true);
    expect(t.dirtyCount()).toBeGreaterThan(0);

    await t.edit("");
    expect(t.changed()).toBe(false);
    expect(t.dirtyCount()).toBe(0);
    t.wrapper.unmount();
  });
});

describe("TablePro 临时行与分页 total 联动", () => {
  // insertAt/insert/remove 写入的是 vxe 内部临时存储，后端 total 不含它们；
  // TablePro 应把临时行净增量叠加到分页 total 上
  const mountPagerTable = async (rowCount) => {
    let rows = [];
    const requestApi = async () => {
      rows = Array.from({ length: rowCount }, (_, i) => ({
        id: i + 1,
        username: `u${i + 1}`,
      }));
      return { list: rows, total: rows.length };
    };
    const wrapper = mount(TablePro, {
      attachTo: document.body,
      props: {
        columns: [
          { field: "id", title: "ID", width: 80 },
          { field: "username", title: "姓名" },
        ],
        showToolbar: false,
        pagination: true,
        requestApi,
        requestAuto: true,
      },
      global: { plugins: [VxeGrid] },
    });
    await flushPromises();
    await nextFrame();
    const pagerTotal = () =>
      wrapper.findComponent(Pagination).props("pagerConfig").total;
    return { wrapper, pagerTotal };
  };

  it("insertRowAt 添加 22 条临时数据后，分页 total 同步 +22；removeRows 后回落", async () => {
    const t = await mountPagerTable(10);
    expect(t.pagerTotal()).toBe(10);

    const temps = Array.from({ length: 22 }, (_, i) => ({
      username: `tmp${i + 1}`,
    }));
    await t.wrapper.vm.insertRowAt(temps, -1);
    await flushPromises();
    await nextFrame();
    expect(t.pagerTotal()).toBe(32);

    const inserted = t.wrapper.vm.getChangeState().insertRecords;
    await t.wrapper.vm.removeRows(inserted.slice(0, 2));
    await flushPromises();
    await nextFrame();
    expect(t.pagerTotal()).toBe(30);
    t.wrapper.unmount();
  });

  it("数据重载（markSaved）后临时行增量归零，total 以新数据为准", async () => {
    const t = await mountPagerTable(10);
    await t.wrapper.vm.insertRowAt([{ username: "a" }, { username: "b" }], -1);
    await flushPromises();
    await nextFrame();
    expect(t.pagerTotal()).toBe(12);

    await t.wrapper.vm.markSaved();
    await flushPromises();
    await nextFrame();
    // markSaved 触发远程重载，requestApi 返回的 total 仍为 10（临时行未持久化到后端）
    expect(t.pagerTotal()).toBe(10);
    t.wrapper.unmount();
  });
});

// @vitest-environment jsdom
/**
 * tablePro 临时添加行的单选/多选获取 —— jsdom 端到端验证
 *
 * 场景：通过实例方法（insertRow / insertRowAt）临时添加的行数据（不带 id），
 * 也需要能通过单选（radio）/ 多选（checkbox）正常勾选，并取回行数据：
 *   · vxe 实例方法：getCheckboxRecords / getRadioRecord
 *   · useSelection 收集：selectedList / selectedListIds / selectedRow / selectedId
 *   · 变更跟踪：getChangeState().insertRecords
 */
import { describe, it, expect, beforeAll } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ElementPlus from "element-plus";
// vxe-table / vxe-pc-ui 按需注册（与 src/plugins/vxe-ui.js 保持一致）
import { VxeTable, VxeColumn, VxeColgroup, VxeGrid, VxeToolbar } from "vxe-table";
import {
  VxeButton,
  VxeButtonGroup,
  VxeTooltip,
  VxeModal,
  VxeInput,
  VxeCheckbox,
  VxeIcon,
} from "vxe-pc-ui";
import TablePro from "@/components/tablePro/index.vue";

// ========== jsdom 环境补桩（vxe-table 布局相关 API）==========
beforeAll(() => {
  if (!global.ResizeObserver) {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!global.IntersectionObserver) {
    global.IntersectionObserver = class {
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
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

const mountTablePro = (extraProps = {}) =>
  mount(TablePro, {
    props: {
      data: [
        { id: 1, name: "张三", age: 28 },
        { id: 2, name: "李四", age: 32 },
        { id: 3, name: "王五", age: 25 },
      ],
      columns: [
        { type: "checkbox", width: 50 },
        { type: "radio", width: 50 },
        { field: "name", title: "姓名" },
        { field: "age", title: "年龄" },
      ],
      pagination: false,
      showToolbar: false,
      ...extraProps,
    },
    global: {
      plugins: [
        ElementPlus,
        VxeTable,
        VxeColumn,
        VxeColgroup,
        VxeGrid,
        VxeToolbar,
        VxeButton,
        VxeButtonGroup,
        VxeTooltip,
        VxeModal,
        VxeInput,
        VxeCheckbox,
        VxeIcon,
      ],
    },
  });

/** 点击某行的多选框（真实点击路径，触发 vxe checkbox-change） */
const clickRowCheckbox = async (wrapper, rowIndex) => {
  const row = wrapper.findAll(".vxe-body--row")[rowIndex];
  expect(row, `行 ${rowIndex} 存在`).toBeTruthy();
  const icon = row.find(".vxe-checkbox--icon");
  expect(icon.exists(), "多选框图标存在").toBe(true);
  await icon.trigger("click");
  await flushPromises();
};

/** 点击某行的单选框（真实点击路径，触发 vxe radio-change） */
const clickRowRadio = async (wrapper, rowIndex) => {
  const row = wrapper.findAll(".vxe-body--row")[rowIndex];
  expect(row, `行 ${rowIndex} 存在`).toBeTruthy();
  const icon = row.find(".vxe-radio--icon");
  expect(icon.exists(), "单选框图标存在").toBe(true);
  await icon.trigger("click");
  await flushPromises();
};

describe("tablePro 临时添加行的单选/多选获取", () => {
  it("insertRow 无 id 时自动补组件内唯一的临时 id", async () => {
    const wrapper = mountTablePro();
    await flushPromises();

    const vm = wrapper.vm;
    vm.insertRow({ name: "临时用户", age: 20 });
    await flushPromises();

    const fullData = vm.getData();
    const inserted = fullData.find((r) => r.name === "临时用户");
    expect(inserted, "临时行已插入").toBeTruthy();
    expect(String(inserted.id).startsWith("row_")).toBe(true);
    // 多次插入 id 唯一
    vm.insertRow({ name: "临时用户2", age: 21 });
    await flushPromises();
    const ids = vm.getData()
      .filter((r) => String(r.id).startsWith("row_"))
      .map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);

    wrapper.unmount();
  });

  it("insertRowAt（数组形式）缺主键时也自动补临时 id", async () => {
    const wrapper = mountTablePro();
    await flushPromises();

    const vm = wrapper.vm;
    vm.insertRowAt(
      [
        { name: "批量临时1" },
        { id: 99, name: "自带id" },
      ],
      -1,
    );
    await flushPromises();

    const fullData = vm.getData();
    const row1 = fullData.find((r) => r.name === "批量临时1");
    const row2 = fullData.find((r) => r.name === "自带id");
    expect(String(row1.id).startsWith("row_")).toBe(true);
    expect(row2.id).toBe(99); // 已有 id 不覆盖

    wrapper.unmount();
  });

  it("多选：临时添加行可通过 checkbox 勾选并取回行数据", async () => {
    const wrapper = mountTablePro();
    await flushPromises();

    const vm = wrapper.vm;
    vm.insertRow({ name: "临时用户", age: 20 });
    await flushPromises();

    // 临时行插入在顶部（第 0 行）
    await clickRowCheckbox(wrapper, 0);

    // vxe 实例方法可取回
    const records = vm.getCheckboxRecords();
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe("临时用户");
    expect(String(records[0].id).startsWith("row_")).toBe(true);

    // useSelection 收集同步
    expect(vm.isSelected).toBe(true);
    expect(vm.selectedList).toHaveLength(1);
    expect(vm.selectedList[0].name).toBe("临时用户");
    expect(vm.selectedListIds).toEqual([records[0].id]);

    // 变更跟踪：新增行纳入 insertRecords
    const changeState = vm.getChangeState();
    expect(changeState.insertRecords).toHaveLength(1);
    expect(changeState.changed).toBe(true);

    wrapper.unmount();
  });

  it("多选：原始行与临时行混合勾选均可取回", async () => {
    const wrapper = mountTablePro();
    await flushPromises();

    const vm = wrapper.vm;
    vm.insertRow({ name: "临时用户", age: 20 });
    await flushPromises();

    // 勾选临时行（顶部第 0 行）与原始行「李四」（现位于第 2 行：临时 + 张三 + 李四）
    await clickRowCheckbox(wrapper, 0);
    await clickRowCheckbox(wrapper, 2);

    const records = vm.getCheckboxRecords();
    expect(records).toHaveLength(2);
    const names = records.map((r) => r.name).sort();
    expect(names).toEqual(["临时用户", "李四"]);
    expect(vm.selectedListIds).toHaveLength(2);
    expect(vm.selectedListIds).toContain(2); // 原始行 id
    expect(String(vm.selectedListIds.find((v) => String(v).startsWith("row_"))).startsWith("row_")).toBe(true);

    wrapper.unmount();
  });

  it("单选：临时添加行可通过 radio 选中并取回行数据", async () => {
    const wrapper = mountTablePro();
    await flushPromises();

    const vm = wrapper.vm;
    vm.insertRow({ name: "临时单选", age: 22 });
    await flushPromises();

    // 临时行在顶部，点击其 radio
    await clickRowRadio(wrapper, 0);

    const radioRecord = vm.getRadioRecord();
    expect(radioRecord, "getRadioRecord 取回临时行").toBeTruthy();
    expect(radioRecord.name).toBe("临时单选");

    expect(vm.isRadioSelected).toBe(true);
    expect(vm.selectedRow).toBeTruthy();
    expect(vm.selectedRow.name).toBe("临时单选");
    expect(String(vm.selectedId).startsWith("row_")).toBe(true);

    // 切换回原始行（临时行下移一位：临时 + 张三）
    await clickRowRadio(wrapper, 1);
    expect(vm.getRadioRecord().name).toBe("张三");
    expect(vm.selectedId).toBe(1);

    wrapper.unmount();
  });
});

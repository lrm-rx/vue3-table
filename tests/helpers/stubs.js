import { defineComponent, h, ref } from "vue";

/**
 * vxe-grid 桩：捕获 TablePro 通过 v-bind 传入的全部 props/attrs，
 * 并提供 vxe 表格实例常用方法（由测试通过 api.mock 控制返回内容）。
 */
export const createVxeGridStub = () => {
  const mock = {
    // 模拟 vxe 内部列状态 / 排序状态 / 表格数据 / 变更记录集（getRecordset 返回值）
    columns: [],
    sorts: [],
    fullData: [],
    recordset: { insertRecords: [], removeRecords: [], updateRecords: [] },
    calls: {
      sort: [],
      clearSort: 0,
      clearFilter: 0,
      exportData: 0,
      clearValidate: 0,
      insert: [],
      remove: [],
      loadData: [],
    },
  };

  const stub = defineComponent({
    name: "VxeGridStub",
    inheritAttrs: false,
    setup(_props, { attrs, slots, expose }) {
      const captured = ref({});
      // 简单节流：仅在挂载/更新后记录，便于测试读取最新值
      captured.value = { ...attrs };

      expose({
        $el: null, // 占位：composable 通过 $el 查 body wrapper 时为 null 安全
        getColumns: () => mock.columns,
        getSortColumns: () => mock.sorts,
        getTableData: () => ({ fullData: mock.fullData }),
        getCheckboxRecords: () => mock.fullData,
        sort: (...args) => mock.calls.sort.push(args),
        clearSort: () => {
          mock.calls.clearSort += 1;
        },
        clearFilter: () => {
          mock.calls.clearFilter += 1;
        },
        closeFilter: () => {},
        exportData: () => {
          mock.calls.exportData += 1;
        },
        setCheckboxRow: () => {},
        toggleCheckboxRow: () => {},
        clearCheckboxRow: () => {},
        scrollToRow: () => {},
        validate: () => null,
        fullValidate: () => null,
        clearValidate: () => {
          mock.calls.clearValidate += 1;
        },
        // ========== 变更跟踪相关（vxe insert/remove/getRecordset/loadData）==========
        getRecordset: () => mock.recordset,
        insert: (record) => {
          mock.calls.insert.push(record);
          mock.fullData = [{ ...record }, ...mock.fullData];
          return Promise.resolve({ status: true });
        },
        insertAt: (records, target) => {
          mock.calls.insert.push({ records, target });
          const list = Array.isArray(records) ? [...records] : [records];
          const idx = target ? mock.fullData.indexOf(target) : -1;
          if (idx < 0) mock.fullData = [...mock.fullData, ...list];
          else mock.fullData.splice(idx, 0, ...list);
          return Promise.resolve({ status: true });
        },
        remove: (rows) => {
          mock.calls.remove.push(rows);
          const del = Array.isArray(rows) ? rows : [rows];
          mock.fullData = mock.fullData.filter((r) => !del.includes(r));
          return Promise.resolve({ status: true });
        },
        loadData: (data) => {
          mock.calls.loadData.push(data);
          mock.fullData = data;
          return Promise.resolve();
        },
      });

      return () => h("div", { class: "vxe-grid-stub" }, slots.default ? slots.default() : null);
    },
  });

  return { stub, mock };
};

/** el-pagination 桩：声明常用 props 并转发两个事件 */
export const ElPaginationStub = defineComponent({
  name: "ElPaginationStub",
  props: {
    currentPage: { type: Number, default: 1 },
    pageSize: { type: Number, default: 10 },
    total: { type: Number, default: 0 },
    pageSizes: { type: Array, default: () => [10, 20, 50, 100] },
    layout: { type: String, default: "" },
    background: { type: Boolean, default: false },
  },
  emits: ["size-change", "current-change"],
  setup(_props, { emit }) {
    return () =>
      h("div", { class: "el-pagination-stub" }, [
        h("button", {
          class: "stub-size-20",
          onClick: () => emit("size-change", 20),
        }),
        h("button", {
          class: "stub-next-page",
          onClick: () => emit("current-change", _props.currentPage + 1),
        }),
      ]);
  },
});

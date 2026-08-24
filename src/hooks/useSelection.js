import { computed, ref, unref } from "vue";

/**
 * @description 表格单选/多选数据操作
 * @param {String|import('vue').Ref<String>|import('vue').ComputedRef<String>} keyField
 *   当表格可以选择时，所指定的唯一标识字段名（对应 vxe-grid 的 rowConfig.keyField）。
 *   支持传入字符串或 ref/computed，传入响应式引用时 selectedListIds / selectedId 会随其变化而更新。
 * */
export const useSelection = (keyField) => {
  // 统一取值：兼容字符串与 ref/computed
  const getKey = () => unref(keyField) || "id";

  // ========== 多选（checkbox）==========
  // 当前是否有选中行
  const isSelected = ref(false);
  // 当前选中的所有行数据
  const selectedList = ref([]);

  // 当前选中的所有 ids 数组
  const selectedListIds = computed(() => {
    let ids = [];
    const key = getKey();
    selectedList.value.forEach((item) => ids.push(item[key]));
    return ids;
  });

  /**
   * @description 多选操作
   * @param {Array} rowArr 当前选择的所有数据
   * @return void
   */
  const selectionChange = (rowArr) => {
    if (rowArr.length) {
      isSelected.value = true;
    } else {
      isSelected.value = false;
    }
    selectedList.value = rowArr;
  };

  // ========== 单选（radio）==========
  // 当前选中的行数据
  const selectedRow = ref(null);
  // 当前选中行的 id
  const selectedId = computed(() => {
    const key = getKey();
    return selectedRow.value ? selectedRow.value[key] : null;
  });
  // 当前单选是否有选中
  const isRadioSelected = computed(() => selectedRow.value !== null);

  /**
   * @description 单选操作
   * @param {Object} row 当前选中行的数据
   * @return void
   */
  const radioChange = (row) => {
    selectedRow.value = row || null;
  };

  // ========== 通用 ==========
  /**
   * @description 清空所有选择（单选 + 多选）
   * @return void
   */
  const clearSelection = () => {
    selectedList.value = [];
    selectedRow.value = null;
    isSelected.value = false;
  };

  return {
    // 多选
    isSelected,
    selectedList,
    selectedListIds,
    selectionChange,
    // 单选
    selectedRow,
    selectedId,
    isRadioSelected,
    radioChange,
    // 通用
    clearSelection,
  };
};

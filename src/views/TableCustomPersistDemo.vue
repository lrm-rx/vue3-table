<script setup lang="jsx">
/**
 * 列个性化设置 · 接口落库与恢复示例
 * 保存：TablePro 的 customSaveMethod 接收 vxe updateStore 参数（{ $table, id, type, storeData }），
 *      组件内部默认 500ms 防抖，面板关闭 / 卸载时立即 flush；本页写入 localStorage 模拟接口。
 * 恢复：接口返回 storeData 后，等 vxe-grid ready，调用 gridRef.setCustomStoreData(storeData)，
 *      即可恢复列顺序、显隐、固定、列宽等（分组子列顺序同样恢复）。
 */
import { onMounted, ref } from "vue";
import { ElTag, ElMessage } from "element-plus";
import TablePro from "@/components/tablePro/index.vue";

const STORAGE_KEY = "tablePro-custom-persist-demo";
const proRef = ref(null);
const gridReady = ref(false);
const savedStore = ref(null);
const loading = ref(false);

// ========== 模拟接口：读取 ==========
const fetchCustomConfigApi = () =>
  new Promise((resolve) => {
    setTimeout(() => {
      const raw = localStorage.getItem(STORAGE_KEY);
      resolve(raw ? JSON.parse(raw) : null);
    }, 300);
  });

// ========== 模拟接口：保存（TablePro 已做防抖，这里只模拟网络延迟）==========
const saveCustomConfigApi = async ({ id, type, storeData }) => {
  await new Promise((resolve) => setTimeout(resolve, 200));
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ tableId: id, type, storeData, savedAt: Date.now() }),
  );
  savedStore.value = storeData;
  ElMessage.success("列配置已保存到模拟接口");
};

// ========== 恢复：必须等表格 ready 后调用 ==========
const applyStoreData = async (storeData) => {
  if (!storeData || !gridReady.value) return;
  // vxe-grid 原生方法：先重置自定义状态，再按 storeData 恢复列顺序 / 显隐 / 固定 / 列宽
  await proRef.value?.gridRef?.setCustomStoreData(storeData);
  savedStore.value = storeData;
};

const loadFromApi = async () => {
  loading.value = true;
  try {
    const data = await fetchCustomConfigApi();
    if (data?.storeData) {
      await applyStoreData(data.storeData);
      ElMessage.success("已从模拟接口恢复列配置");
    } else {
      savedStore.value = null;
      ElMessage.info("模拟接口暂无已保存配置，当前为默认列");
    }
  } finally {
    loading.value = false;
  }
};

const onGridReady = () => {
  gridReady.value = true;
  // 首次进入时接口数据可能已返回，ready 后统一恢复一次
  if (savedStore.value) applyStoreData(savedStore.value);
};

const resetAndSaveDefault = async () => {
  // resetCustom(true) 会恢复默认列，并通过 customSaveMethod 把默认配置同步保存
  await proRef.value?.gridRef?.resetCustom(true);
  ElMessage.info("已重置为默认列，默认配置将同步保存");
};

onMounted(() => {
  // 只预取数据，不做恢复；ready 后由 onGridReady 或此处兜底应用
  fetchCustomConfigApi().then((data) => {
    savedStore.value = data?.storeData || null;
    if (gridReady.value && savedStore.value) applyStoreData(savedStore.value);
  });
});

// ========== 静态数据 ==========
const genData = (count = 28) => {
  const list = [];
  for (let i = 1; i <= count; i++) {
    list.push({
      id: i,
      name: `用户${String(i).padStart(3, "0")}`,
      age: 20 + (i % 30),
      gender: i % 2,
      department: i % 3 === 0 ? "研发部" : i % 3 === 1 ? "产品部" : "设计部",
      phone: `138${String(10000000 + i).slice(-8)}`,
      salary: 8000 + i * 100,
      status: i % 2,
      address: `北京市朝阳区某某街道${i}号`,
    });
  }
  return list;
};
const tableData = ref(genData());

// ========== 列配置（含分组列，用于验证子列顺序也能恢复）==========
const columns = [
  { type: "seq", width: 60, title: "序号" },
  { field: "name", title: "姓名", width: 120, sortable: true },
  {
    // 分组列需设置唯一 field：开启 storage / updateStore 时 vxe 以 field 作为列状态键
    field: "basicInfo",
    title: "基本信息",
    children: [
      { field: "age", title: "年龄", width: 100, sortable: true },
      {
        field: "gender",
        title: "性别",
        width: 90,
        render: (params, h) => (
          <ElTag type={params.cellValue ? "success" : "primary"} size="small" effect="light">
            {params.cellValue ? "女" : "男"}
          </ElTag>
        ),
      },
    ],
  },
  { field: "department", title: "部门", width: 120, sortable: true },
  {
    field: "contactInfo",
    title: "联系方式",
    children: [
      { field: "phone", title: "手机号", width: 140 },
      { field: "address", title: "地址", minWidth: 200 },
    ],
  },
  { field: "salary", title: "薪资", width: 110, sortable: true },
  {
    field: "status",
    title: "状态",
    width: 90,
    render: (params, h) => (
      <ElTag type={params.cellValue ? "success" : "info"} size="small" effect="light">
        {params.cellValue ? "在职" : "离职"}
      </ElTag>
    ),
  },
];
</script>

<template>
  <div style="padding: 0 20px 20px">
    <el-card style="margin-bottom: 16px">
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between">
          <span style="font-weight: 600; font-size: 15px">列个性化 · 接口落库与恢复</span>
          <div style="display: flex; gap: 12px; align-items: center">
            <el-tag :type="savedStore ? 'success' : 'info'" size="small">
              {{ savedStore ? "模拟接口已保存配置" : "暂无配置" }}
            </el-tag>
            <el-button size="small" :loading="loading" @click="loadFromApi">
              从接口加载
            </el-button>
            <el-button size="small" @click="resetAndSaveDefault">重置并保存默认</el-button>
          </div>
        </div>
      </template>
      <div style="font-size: 13px; color: #606266; line-height: 1.8">
        <p style="margin: 0 0 4px">
          <b>保存：</b>打开工具栏「列个性化设置」，拖拽排序 / 勾选显隐 / 固定列 / 调整列宽后，
          组件内部会防抖合并连续变更，再调用 <code>customSaveMethod</code> 写入模拟接口。
        </p>
        <p style="margin: 0 0 4px">
          <b>恢复：</b>点击「从接口加载」，接口返回 <code>storeData</code> 后调用
          <code>gridRef.setCustomStoreData(storeData)</code>，列顺序、显隐、固定、列宽以及分组子列顺序都会恢复。
        </p>
        <p style="margin: 0">
          <b>刷新验证：</b>保存后刷新页面，首次进入会自动从模拟接口读取并恢复配置。
        </p>
      </div>
    </el-card>

    <TablePro
      ref="proRef"
      table-id="customPersistDemo"
      :columns="columns"
      :data="tableData"
      :custom-save-method="saveCustomConfigApi"
      :custom-save-debounce="500"
      :pager-config="{ pageSizes: [10, 20, 50] }"
      height="auto"
      style="height: 560px"
      @ready="onGridReady"
    />
  </div>
</template>

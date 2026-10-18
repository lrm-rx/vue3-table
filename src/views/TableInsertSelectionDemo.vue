<script setup>
/**
 * 表格临时行选中演示：通过实例方法（insertRow / insertRowAt）临时添加的行数据，
 * 也能通过单选（radio）/ 多选（checkbox）正常勾选并获取到行数据。
 *
 * 展示三种获取途径：
 *   1. useSelection 收集的响应式数据：selectedList / selectedListIds / selectedRow / selectedId
 *   2. 事件参数：checkbox-change / radio-change 携带的选中记录
 *   3. 实例方法：getCheckboxRecords() / getRadioRecord()
 */
import { ref } from "vue";
import { ElMessage } from "element-plus";
import TablePro from "@/components/tablePro/index.vue";

// ========== 静态基础数据（无 requestApi，纯本地模式）==========
const multiData = ref([
  { id: 1, name: "张三", age: 28, role: "admin" },
  { id: 2, name: "李四", age: 32, role: "editor" },
  { id: 3, name: "王五", age: 25, role: "viewer" },
  { id: 4, name: "赵六", age: 40, role: "dev" },
  { id: 5, name: "钱七", age: 36, role: "editor" },
]);
const radioData = ref([
  { id: 101, name: "甲", age: 21, role: "viewer" },
  { id: 102, name: "乙", age: 30, role: "dev" },
  { id: 103, name: "丙", age: 27, role: "admin" },
]);

const roleOptions = [
  { label: "管理员", value: "admin" },
  { label: "编辑", value: "editor" },
  { label: "访客", value: "viewer" },
  { label: "开发者", value: "dev" },
];
const roleTextMap = { admin: "管理员", editor: "编辑", viewer: "访客", dev: "开发者" };

const multiColumns = ref([
  { type: "checkbox", width: 50 },
  { type: "seq", width: 60, title: "序号" },
  { field: "name", title: "姓名", editRender: { name: "ElInput" } },
  { field: "age", title: "年龄", editRender: { name: "ElInputNumber" } },
  { field: "role", title: "角色", editRender: { name: "ElSelect", options: roleOptions } },
]);
const radioColumns = ref([
  { type: "radio", width: 60 },
  { type: "seq", width: 60, title: "序号" },
  { field: "name", title: "姓名", editRender: { name: "ElInput" } },
  { field: "age", title: "年龄", editRender: { name: "ElInputNumber" } },
  { field: "role", title: "角色", editRender: { name: "ElSelect", options: roleOptions } },
]);

const multiRef = ref();
const radioRef = ref();

// 临时行序号（不与静态数据 id 冲突）
let tempSeq = 0;

// ========== 选中数据实时展示（useSelection 收集 + 实例方法获取）==========
const multiSelected = ref([]);
const multiSelectedIds = ref([]);
const multiRecords = ref([]);
const radioSelectedRow = ref(null);
const radioSelectedId = ref(null);
const radioRecord = ref(null);

// 事件回调：同步 useSelection 收集数据 + 实例方法获取结果
const syncMultiSelection = () => {
  multiSelected.value = multiRef.value?.selectedList || [];
  multiSelectedIds.value = multiRef.value?.selectedListIds || [];
  multiRecords.value = multiRef.value?.getCheckboxRecords?.() || [];
};
const syncRadioSelection = () => {
  radioSelectedRow.value = radioRef.value?.selectedRow || null;
  radioSelectedId.value = radioRef.value?.selectedId ?? null;
  radioRecord.value = radioRef.value?.getRadioRecord?.() || null;
};

// ========== 临时添加行（实例方法）==========
// 顶部插入一行（不带 id，模拟最常见的新增场景）
const onMultiInsertTop = () => {
  tempSeq += 1;
  multiRef.value?.insertRow?.({
    name: `临时用户${tempSeq}`,
    age: 18 + tempSeq,
    role: tempSeq % 2 ? "dev" : "editor",
  });
};
// 末尾插入一行（insertAt target=-1）
const onMultiInsertBottom = () => {
  tempSeq += 1;
  multiRef.value?.insertRowAt?.(
    { name: `末尾临时${tempSeq}`, age: 40 + tempSeq, role: "viewer" },
    -1,
  );
};
// 顶部插入一行（单选表）
const onRadioInsertTop = () => {
  tempSeq += 1;
  radioRef.value?.insertRow?.({
    name: `临时单选${tempSeq}`,
    age: 20 + tempSeq,
    role: "dev",
  });
};

// ========== 移除 / 清空 ==========
const onMultiRemoveSelected = () => {
  const rows = multiRef.value?.getCheckboxRecords?.() || [];
  if (!rows.length) {
    ElMessage.warning("请先勾选要删除的行");
    return;
  }
  multiRef.value?.removeRows?.(rows);
  ElMessage.success(`已移除 ${rows.length} 行`);
};
const onMultiClearSelection = () => {
  multiRef.value?.clearSelection?.();
  multiRef.value?.clearCheckboxRow?.();
  syncMultiSelection();
};
const onRadioClearSelection = () => {
  radioRef.value?.clearSelection?.();
  radioRef.value?.clearRadioRow?.();
  syncRadioSelection();
};

// ========== 实例方法获取选中（不依赖事件）==========
const onFetchMultiByMethod = () => {
  const rows = multiRef.value?.getCheckboxRecords?.() || [];
  multiRecords.value = rows;
  ElMessage.success(`getCheckboxRecords 实时获取到 ${rows.length} 行`);
};
const onFetchRadioByMethod = () => {
  const row = radioRef.value?.getRadioRecord?.() || null;
  radioRecord.value = row;
  ElMessage[row ? "success" : "info"](
    row ? `getRadioRecord 获取到：${row.name}` : "当前无单选行",
  );
};

const formatRows = (rows) =>
  (rows || []).map((r) => ({ id: r.id, name: r.name, age: r.age, role: r.role }));
</script>

<template>
  <div style="padding: 0 20px 20px">
    <el-alert
      type="info"
      :closable="false"
      style="margin-bottom: 12px"
      title="临时行选中演示：点击工具栏「新增临时行」添加的行（不含 id），同样可以被单选/多选勾选，并通过 useSelection 数据或实例方法获取到该行数据"
    />

    <el-row :gutter="16">
      <!-- ========== 多选（checkbox）========== -->
      <el-col :span="12">
        <el-card shadow="never" header="多选：临时添加行也可勾选获取">
          <TablePro
            ref="multiRef"
            :columns="multiColumns"
            :data="multiData"
            :pagination="false"
            :show-search="false"
            :show-density="false"
            :show-export="false"
            height="300px"
            @checkbox-change="syncMultiSelection"
            @checkbox-all="syncMultiSelection"
          >
            <template #toolbarButtons>
              <el-button type="primary" @click="onMultiInsertTop">新增临时行（顶部）</el-button>
              <el-button type="primary" plain @click="onMultiInsertBottom">新增临时行（末尾）</el-button>
              <el-button type="warning" plain @click="onMultiRemoveSelected">移除选中</el-button>
              <el-button @click="onMultiClearSelection">清空勾选</el-button>
            </template>
            <template #cell_role="{ row }">
              <el-tag size="small" effect="plain">
                {{ roleTextMap[row.role] || row.role || "—" }}
              </el-tag>
            </template>
          </TablePro>

          <div class="demo-panel">
            <div class="demo-panel__title">选中数据（useSelection）</div>
            <div class="demo-panel__item">
              <span class="demo-panel__label">selectedListIds：</span>
              <span>{{ JSON.stringify(multiSelectedIds) }}</span>
            </div>
            <div class="demo-panel__item">
              <span class="demo-panel__label">selectedList（{{ multiSelected.length }} 行）：</span>
              <pre>{{ JSON.stringify(formatRows(multiSelected), null, 2) }}</pre>
            </div>
          </div>

          <div class="demo-panel">
            <div class="demo-panel__title">
              实例方法获取
              <el-button size="small" link type="primary" @click="onFetchMultiByMethod">
                获取 getCheckboxRecords()
              </el-button>
            </div>
            <div class="demo-panel__item">
              <span class="demo-panel__label">getCheckboxRecords（{{ multiRecords.length }} 行）：</span>
              <pre>{{ JSON.stringify(formatRows(multiRecords), null, 2) }}</pre>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- ========== 单选（radio）========== -->
      <el-col :span="12">
        <el-card shadow="never" header="单选：临时添加行也可选中获取">
          <TablePro
            ref="radioRef"
            :columns="radioColumns"
            :data="radioData"
            :pagination="false"
            :show-search="false"
            :show-density="false"
            :show-export="false"
            height="300px"
            @radio-change="syncRadioSelection"
          >
            <template #toolbarButtons>
              <el-button type="primary" @click="onRadioInsertTop">新增临时行</el-button>
              <el-button @click="onRadioClearSelection">清空单选</el-button>
            </template>
            <template #cell_role="{ row }">
              <el-tag size="small" effect="plain">
                {{ roleTextMap[row.role] || row.role || "—" }}
              </el-tag>
            </template>
          </TablePro>

          <div class="demo-panel">
            <div class="demo-panel__title">选中数据（useSelection）</div>
            <div class="demo-panel__item">
              <span class="demo-panel__label">selectedId：</span>
              <span>{{ JSON.stringify(radioSelectedId) }}</span>
            </div>
            <div class="demo-panel__item">
              <span class="demo-panel__label">selectedRow：</span>
              <pre>{{ JSON.stringify(radioSelectedRow ? formatRows([radioSelectedRow])[0] : null, null, 2) }}</pre>
            </div>
          </div>

          <div class="demo-panel">
            <div class="demo-panel__title">
              实例方法获取
              <el-button size="small" link type="primary" @click="onFetchRadioByMethod">
                获取 getRadioRecord()
              </el-button>
            </div>
            <div class="demo-panel__item">
              <span class="demo-panel__label">getRadioRecord：</span>
              <pre>{{ JSON.stringify(radioRecord ? formatRows([radioRecord])[0] : null, null, 2) }}</pre>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped lang="scss">
.demo-panel {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 4px;
  background: var(--el-fill-color-lighter, #fafafa);

  &__title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary, #303133);
  }

  &__item {
    font-size: 12px;
    line-height: 1.8;
    color: var(--el-text-color-regular, #606266);
  }

  &__label {
    color: var(--el-text-color-secondary, #909399);
  }

  pre {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--el-color-primary, #409eff);
    white-space: pre-wrap;
    word-break: break-all;
  }
}
</style>

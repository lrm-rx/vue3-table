<script setup>
/**
 * 表格临时行跨页保留演示
 *
 * 两个表格分别演示：
 *   1. 直接传 data（静态数据 + 本地分页）
 *   2. 通过 requestApi 接口获取数据（远程分页）
 *
 * 两者都通过 insertRow / insertRowAt 添加临时行（vxe 内部临时存储，不入 data / 后端），
 * 组件会把临时行归属的页码与锚点记下来，切换页码 / 切换页大小后再次装入数据时
 * 按锚点原位置重插，因此未保存的临时行不会被清空；分页 total 也会叠加临时行净增量。
 *
 * 注意：只有通过组件暴露的 insertRow / insertRowAt / removeRows 才纳入跟踪，
 * 直接调用 gridRef 的 insert / insertAt / remove 不会登记归属页。
 */
import { nextTick, ref } from "vue";
import { ElMessage } from "element-plus";
import TablePro from "@/components/tablePro/index.vue";
import { getUserListApi, addUserApi, updateUserApi } from "@/api";

const departments = ["技术部", "产品部", "设计部", "运营部"];
const deptOptions = departments.map((d) => ({ label: d, value: d }));

// ========== 表格一：直接传 data（静态本地分页）==========
const staticData = ref(
  Array.from({ length: 36 }, (_, i) => ({
    id: i + 1,
    name: `用户${i + 1}`,
    age: 20 + (i % 20),
    department: departments[i % departments.length],
  })),
);
const staticColumns = [
  { type: "checkbox", width: 50 },
  { field: "id", title: "ID", width: 80 },
  { field: "name", title: "姓名", editRender: { name: "ElInput" } },
  { field: "age", title: "年龄", width: 110, editRender: { name: "ElInputNumber" } },
  {
    field: "department",
    title: "部门",
    editRender: { name: "ElSelect", options: deptOptions },
  },
];

const staticRef = ref();
const staticChanged = ref(false);
const staticTotal = ref(0);
let staticSeq = 0;

// 稳定引用（避免模板内联对象在每次渲染时重建，触发 pagerConfig 深度 watch 把页大小重置）
const staticPager = { pageSize: 10, pageSizes: [10, 20, 50] };
const remotePager = { pageSizes: [10, 20, 50] };
const remoteInitParam = { pageNum: 1, pageSize: 10 };

const syncStatic = async () => {
  await nextTick();
  await nextTick();
  staticTotal.value = staticRef.value?.currentPager?.total ?? 0;
};

const onStaticInsert = () => {
  staticSeq += 1;
  staticRef.value?.insertRow?.({
    name: `临时用户${staticSeq}`,
    age: 18 + staticSeq,
    department: "技术部",
  });
  syncStatic();
};
const onStaticAppend = () => {
  staticSeq += 1;
  staticRef.value?.insertRowAt?.(
    { name: `末尾临时${staticSeq}`, age: 30 + staticSeq, department: "产品部" },
    -1,
  );
  syncStatic();
};
// 批量新增：一次 insertRowAt 传入数组，模拟「10 条/页 一次添加 22 条」的场景
const onStaticBatchInsert = () => {
  const records = Array.from({ length: 22 }, () => {
    staticSeq += 1;
    return {
      name: `批量临时${staticSeq}`,
      age: 22 + (staticSeq % 20),
      department: departments[staticSeq % departments.length],
    };
  });
  staticRef.value?.insertRowAt?.(records, -1);
  syncStatic();
};
const onStaticRemove = () => {
  const rows = staticRef.value?.getCheckboxRecords?.() || [];
  if (!rows.length) {
    ElMessage.warning("请先勾选要删除的行");
    return;
  }
  staticRef.value?.removeRows?.(rows);
  staticRef.value?.clearCheckboxRow?.();
  syncStatic();
};
// 保存：把临时行合并进 data 作为新基线（真实项目替换为保存接口调用后再 markSaved）
const onStaticSave = async () => {
  const full = staticRef.value?.getFullData?.() || [];
  await staticRef.value?.markSaved?.();
  staticData.value = full.map((row) => ({ ...row }));
  staticSeq = 0;
  ElMessage.success("已保存：临时行已合并进 data");
  syncStatic();
};
const onStaticCancel = async () => {
  const ok = await staticRef.value?.revertChanges?.();
  ElMessage[ok ? "success" : "info"](ok ? "已取消变更，临时行已丢弃" : "当前没有可取消的变更");
  syncStatic();
};

// ========== 表格二：通过 requestApi 接口获取数据（远程分页）==========
const remoteColumns = [
  { type: "checkbox", width: 50 },
  { field: "id", title: "ID", width: 80 },
  { field: "username", title: "姓名" },
  { field: "department", title: "部门" },
  { field: "createTime", title: "创建时间", width: 170 },
];

const remoteRef = ref();
const remoteChanged = ref(false);
const remoteTotal = ref(0);
let remoteSeq = 0;

const syncRemote = async () => {
  await nextTick();
  await nextTick();
  remoteTotal.value = remoteRef.value?.currentPager?.total ?? 0;
};

const onRemoteInsert = () => {
  remoteSeq += 1;
  remoteRef.value?.insertRow?.({
    username: `临时用户${remoteSeq}`,
    department: "技术部",
    createTime: "—",
  });
  syncRemote();
};
const onRemoteAppend = () => {
  remoteSeq += 1;
  remoteRef.value?.insertRowAt?.(
    { username: `末尾临时${remoteSeq}`, department: "产品部", createTime: "—" },
    -1,
  );
  syncRemote();
};
// 批量新增：一次 insertRowAt 传入数组，模拟「10 条/页 一次添加 22 条」的场景
const onRemoteBatchInsert = () => {
  const records = Array.from({ length: 22 }, () => {
    remoteSeq += 1;
    return {
      username: `批量临时${remoteSeq}`,
      department: departments[remoteSeq % departments.length],
      createTime: "—",
    };
  });
  remoteRef.value?.insertRowAt?.(records, -1);
  syncRemote();
};
const onRemoteRemove = () => {
  const rows = remoteRef.value?.getCheckboxRecords?.() || [];
  if (!rows.length) {
    ElMessage.warning("请先勾选要删除的行");
    return;
  }
  remoteRef.value?.removeRows?.(rows);
  remoteRef.value?.clearCheckboxRow?.();
  syncRemote();
};
// 保存：先调真实新增/更新接口，成功后再 markSaved + 重新请求（临时行落地为服务端数据）
const onRemoteSave = async () => {
  const { insertRecords = [], updateRecords = [] } =
    remoteRef.value?.getChangeState?.() || {};
  if (!insertRecords.length && !updateRecords.length) {
    await remoteRef.value?.markSaved?.();
    syncRemote();
    return;
  }
  try {
    for (const row of insertRecords) {
      await addUserApi({ username: row.username, department: row.department });
    }
    for (const row of updateRecords) {
      await updateUserApi(row.id, row);
    }
    await remoteRef.value?.markSaved?.();
    await remoteRef.value?.getTableList?.();
    remoteSeq = 0;
    ElMessage.success(`已保存 ${insertRecords.length} 条新增`);
  } catch (error) {
    ElMessage.error(`保存失败：${error?.message || error}`);
  }
  syncRemote();
};
const onRemoteCancel = async () => {
  const ok = await remoteRef.value?.revertChanges?.();
  ElMessage[ok ? "success" : "info"](ok ? "已取消变更，临时行已丢弃" : "当前没有可取消的变更");
  syncRemote();
};

const onRequestError = (error) => {
  ElMessage.error(`表格请求失败：${error?.message || error}`);
};
</script>

<template>
  <div style="padding: 0 20px 20px">
    <el-alert
      type="info"
      :closable="false"
      style="margin-bottom: 12px"
      title="临时行跨页保留演示：点击「新增临时行」添加数据后切换页码 / 每页条数，临时行会按原位置重新出现，分页 total 同步包含它们"
    />

    <el-row :gutter="16">
      <!-- ========== 表格一：直接传 data ========== -->
      <el-col :span="24" style="margin-bottom: 16px">
        <el-card shadow="never" header="方式一：直接传 data（静态数据 + 本地分页）">
          <TablePro
            ref="staticRef"
            v-model:cellChanged="staticChanged"
            :columns="staticColumns"
            :data="staticData"
            :pager-config="staticPager"
            :show-search="false"
            :show-density="false"
            :show-export="false"
            editable
            height="420px"
            @page-change="syncStatic"
          >
            <template #toolbarButtons>
              <el-button type="primary" @click="onStaticInsert">新增临时行（首行）</el-button>
              <el-button type="primary" plain @click="onStaticAppend">追加临时行（末行）</el-button>
              <el-button type="primary" plain @click="onStaticBatchInsert">批量新增 22 条</el-button>
              <el-button type="warning" plain @click="onStaticRemove">删除勾选行</el-button>
              <el-button v-if="staticChanged" type="success" @click="onStaticSave">
                保存
              </el-button>
              <el-button v-if="staticChanged" @click="onStaticCancel">取消</el-button>
            </template>
          </TablePro>

          <div class="demo-panel">
            <div class="demo-panel__item">
              <span class="demo-panel__label">cellChanged：</span>
              <el-tag size="small" :type="staticChanged ? 'warning' : 'info'" effect="plain">
                {{ staticChanged }}
              </el-tag>
            </div>
            <div class="demo-panel__item">
              <span class="demo-panel__label">分页 total（含临时行增量）：</span>
              <span>{{ staticTotal }}</span>
            </div>
            <div class="demo-panel__item">
              <span class="demo-panel__label">保存后：</span>
              <span>临时行合并进 data，切换分页不再丢失</span>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- ========== 表格二：通过 requestApi 获取数据 ========== -->
      <el-col :span="24">
        <el-card shadow="never" header="方式二：requestApi 接口获取数据（远程分页）">
          <TablePro
            ref="remoteRef"
            v-model:cellChanged="remoteChanged"
            :columns="remoteColumns"
            :request-api="getUserListApi"
            :request-error="onRequestError"
            :init-param="remoteInitParam"
            :pager-config="remotePager"
            :show-search="false"
            :show-density="false"
            :show-export="false"
            editable
            height="420px"
            @page-change="syncRemote"
          >
            <template #toolbarButtons>
              <el-button type="primary" @click="onRemoteInsert">新增临时行（首行）</el-button>
              <el-button type="primary" plain @click="onRemoteAppend">追加临时行（末行）</el-button>
              <el-button type="primary" plain @click="onRemoteBatchInsert">批量新增 22 条</el-button>
              <el-button type="warning" plain @click="onRemoteRemove">删除勾选行</el-button>
              <el-button v-if="remoteChanged" type="success" @click="onRemoteSave">
                保存
              </el-button>
              <el-button v-if="remoteChanged" @click="onRemoteCancel">取消</el-button>
            </template>
          </TablePro>

          <div class="demo-panel">
            <div class="demo-panel__item">
              <span class="demo-panel__label">cellChanged：</span>
              <el-tag size="small" :type="remoteChanged ? 'warning' : 'info'" effect="plain">
                {{ remoteChanged }}
              </el-tag>
            </div>
            <div class="demo-panel__item">
              <span class="demo-panel__label">分页 total（服务端 total + 临时行增量）：</span>
              <span>{{ remoteTotal }}</span>
            </div>
            <div class="demo-panel__item">
              <span class="demo-panel__label">切换页码后：</span>
              <span>回到新增时所在页，临时行按原位置重插；其他页不显示</span>
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

  &__item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    line-height: 1.8;
    color: var(--el-text-color-regular, #606266);
  }

  &__label {
    color: var(--el-text-color-secondary, #909399);
  }
}
</style>

<script setup lang="jsx">
/**
 * FormPro 双向绑定模式对比：ref（v-model） vs reactive（mutable-model）
 *
 * 观察点：
 *  1. ref + v-model：每次字段编辑都会 emit update:modelValue（新快照整体替换），计数 +1
 *  2. reactive + :model-value + mutable-model：组件原地合并写入父级对象，编辑同步生效，
 *     但全程不 emit（计数恒 0）——v-model 编译的 formData = $event 赋值对 reactive 代理
 *     会抛错（const）/ 丢响应式（let），故该模式必须显式声明 mutable-model 且勿写 v-model
 *  3. 组件无法自动区分 ref(obj).value 与 reactive(obj)（同为 reactive 代理），
 *     两种模式需按上方写法各自配对，不能混用
 *  4. 两种模式下「父级直写」均能同步进表单控件（既有深 watch 路径）
 *  5. 同款兼容已覆盖其余对象/数组值组件（下方第二行）：
 *     UploadPro（mutable-model）、TablePro 分页（mutable-pager-config）、
 *     评论区（mutable-comments）
 */
import { ref, reactive } from "vue";
import FormPro from "@/components/formPro/index.vue";
import UploadPro from "@/components/formPro/UploadPro.vue";
import TablePro from "@/components/tablePro/index.vue";
import CommentSimple from "@/components/commentSimple/index.vue";

// 两侧共用同一套 items 配置，保证行为可对比
const baseItems = [
  {
    prop: "name",
    label: "姓名",
    span: 12,
    itemRender: { name: "ElInput", props: { placeholder: "请输入姓名" } },
  },
  {
    prop: "age",
    label: "年龄",
    span: 12,
    itemRender: {
      name: "ElInputNumber",
      props: { min: 0, max: 150, controlsPosition: "right", style: "width: 100%" },
    },
  },
  {
    prop: "gender",
    label: "性别",
    span: 12,
    itemRender: {
      name: "ElSelect",
      options: [
        { label: "男", value: "male" },
        { label: "女", value: "female" },
      ],
    },
  },
  {
    prop: "enabled",
    label: "启用",
    span: 12,
    itemRender: { name: "ElSwitch" },
  },
  {
    prop: "hobbies",
    label: "爱好",
    span: 24,
    itemRender: {
      name: "ElCheckboxGroup",
      options: [
        { label: "阅读", value: "read" },
        { label: "运动", value: "sport" },
        { label: "音乐", value: "music" },
      ],
    },
  },
];

const initialData = () => ({
  name: "张三",
  age: 28,
  gender: "male",
  enabled: true,
  hobbies: ["read"],
});

// —— 左侧：ref + v-model（推荐用法）——
// 模板中用 :model-value + @update:modelValue 展开写法（等价 v-model），以便统计 emit 次数
const refData = ref(initialData());
const refEmitCount = ref(0);
const onRefModelUpdate = (val) => {
  refData.value = val; // 等价 v-model 的整体替换语义
  refEmitCount.value++;
};
// 父级直写：ref 模式推荐整体替换
const parentWriteRef = () => {
  refData.value = { ...refData.value, name: `父级写入${Date.now() % 1000}` };
};
const resetRef = () => {
  refData.value = initialData();
};

// —— 右侧：reactive + :model-value + mutable-model ——
const reactiveData = reactive({ ...initialData(), name: "李四" });
const reactiveEmitCount = ref(0);
// mutable-model 模式下组件不会 emit，该计数应恒为 0
const onReactiveModelUpdate = () => {
  reactiveEmitCount.value++;
};
// 父级直写：reactive 只能原地改字段（不可整体替换）
const parentWriteReactive = () => {
  reactiveData.name = `父级写入${Date.now() % 1000}`;
};
const resetReactive = () => {
  for (const k of Object.keys(reactiveData)) delete reactiveData[k];
  Object.assign(reactiveData, initialData(), { name: "李四" });
};

// —— 第二行：其余组件的 reactive 兼容模式 ——
// UploadPro：:model-value + mutable-model（原地 splice，不 emit update:modelValue）
const upFiles = reactive([{ name: "已上传合同.pdf", url: "https://example.com/contract.pdf" }]);
const mockUpload = (option) =>
  new Promise((resolve) =>
    setTimeout(
      () =>
        resolve({
          code: 200,
          data: { url: URL.createObjectURL(option.file), name: option.file.name },
        }),
      300,
    ),
  );

// TablePro：:pager-config + mutable-pager-config（原地合并，不 emit update:pagerConfig）
const tablePager = reactive({ currentPage: 1, pageSize: 5, total: 0 });
const tableColumns = [
  { field: "name", title: "姓名" },
  { field: "dept", title: "部门" },
];
const tableRows = Array.from({ length: 18 }, (_, i) => ({
  id: i + 1,
  name: `成员-${i + 1}`,
  dept: ["研发", "产品", "设计"][i % 3],
}));

// CommentSimple：:comments + mutable-comments（原地 splice，不 emit update:comments）
const commentList = reactive([
  {
    id: "c1",
    floor: 1,
    author: { id: "u1", name: "张三", avatar: "" },
    content: " reactive 承载的评论列表，直接 push 也会同步 ",
    createTime: Date.now() - 3600000,
    likeCount: 3,
    liked: false,
    replies: [],
  },
]);
const me = { id: "me", name: "我", avatar: "" };
</script>

<template>
  <div style="max-width: 1280px; padding: 16px">
    <el-alert
      type="warning"
      :closable="false"
      style="margin-bottom: 16px"
      title="反例勿试：reactive + v-model（不写 mutable-model）会在首次编辑时抛 Assignment to constant variable——v-model 编译结果是 formData = $event 的变量赋值，reactive 代理不可被替换。"
    />

    <el-row :gutter="16">
      <!-- ref + v-model -->
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span>ref + v-model（推荐）</span>
              <el-tag type="success" effect="plain">
                update:modelValue 触发 {{ refEmitCount }} 次
              </el-tag>
            </div>
          </template>

          <FormPro
            :model-value="refData"
            :items="baseItems"
            :columns="2"
            label-width="60px"
            @update:modelValue="onRefModelUpdate"
          />

          <div style="margin: 12px 0; display: flex; gap: 8px">
            <el-button size="small" @click="parentWriteRef">父级直写姓名（整体替换）</el-button>
            <el-button size="small" @click="resetRef">重置</el-button>
          </div>

          <el-divider style="margin: 8px 0">实时数据</el-divider>
          <pre style="background: #f5f7fa; padding: 12px; border-radius: 4px; max-height: 220px; overflow: auto">{{ JSON.stringify(refData, null, 2) }}</pre>
        </el-card>
      </el-col>

      <!-- reactive + mutable-model -->
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span>reactive + :model-value + mutable-model</span>
              <el-tag type="info" effect="plain">
                update:modelValue 触发 {{ reactiveEmitCount }} 次（恒 0）
              </el-tag>
            </div>
          </template>

          <FormPro
            :model-value="reactiveData"
            mutable-model
            :items="baseItems"
            :columns="2"
            label-width="60px"
            @update:modelValue="onReactiveModelUpdate"
          />

          <div style="margin: 12px 0; display: flex; gap: 8px">
            <el-button size="small" @click="parentWriteReactive">父级直写姓名（原地改字段）</el-button>
            <el-button size="small" @click="resetReactive">重置</el-button>
          </div>

          <el-divider style="margin: 8px 0">实时数据</el-divider>
          <pre style="background: #f5f7fa; padding: 12px; border-radius: 4px; max-height: 220px; overflow: auto">{{ JSON.stringify(reactiveData, null, 2) }}</pre>
        </el-card>
      </el-col>
    </el-row>

    <el-divider>其余组件的 reactive 兼容模式</el-divider>
    <el-row :gutter="16">
      <el-col :span="8">
        <el-card shadow="never">
          <template #header>UploadPro：:model-value + mutable-model</template>
          <UploadPro
            :model-value="upFiles"
            mutable-model
            list-type="text"
            button-size="small"
            :http-request="mockUpload"
          />
          <pre style="background: #f5f7fa; padding: 8px; border-radius: 4px; margin-top: 8px; max-height: 140px; overflow: auto">{{ JSON.stringify(upFiles, null, 2) }}</pre>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never">
          <template #header>TablePro：:pager-config + mutable-pager-config</template>
          <TablePro
            :columns="tableColumns"
            :data="tableRows"
            :pager-config="tablePager"
            mutable-pager-config
            :show-toolbar="false"
            height="260"
          />
          <pre style="background: #f5f7fa; padding: 8px; border-radius: 4px; margin-top: 8px">{{ JSON.stringify(tablePager) }}</pre>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never">
          <template #header>CommentSimple：:comments + mutable-comments</template>
          <CommentSimple
            :comments="commentList"
            mutable-comments
            :current-user="me"
            :remote-has-more="false"
          />
          <div style="margin-top: 8px; font-size: 12px; color: #909399">
            父级数组长度：{{ commentList.length }}（发送评论后原地 +1，引用不变）
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

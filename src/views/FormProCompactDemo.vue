<script setup>
/**
 * FormPro compact（紧凑型表单）演示：
 *  1. 垂直间隔收紧：无 tip 行 18px→6px；行内任一项配置 tip 则整行保持默认（水平对齐）
 *  2. label 与控件距离减半（left/right：右内边距 12px→6px；top：下外边距 8px→4px）
 *  3. 校验错误改由 el-tooltip 在 item 右上角展示（top-end / error 主色调 / 白字 / 2px 内边距）
 *  4. tooltip z-index 固定为 32 位整型最大值：el-dialog 内（含嵌套 dialog）也不被遮挡
 *  5. errorTipDuration 秒后自动隐藏；隐藏后控件错误样式（红色边框）保持不变
 */
import { ref } from "vue";
import { ElMessage } from "element-plus";
import FormPro from "@/components/formPro/index.vue";

const compact = ref(true);
const labelPosition = ref("right");
const errorTipDuration = ref(3);

const formData = ref({
  name: "",
  age: null,
  gender: "",
  phone: "",
  email: "",
  wechat: "",
  province: "",
  city: "",
  remark: "",
});

const rules = {
  name: [{ required: true, message: "请输入姓名", trigger: "blur" }],
  gender: [{ required: true, message: "请选择性别", trigger: "change" }],
  phone: [{ required: true, message: "请输入手机号", trigger: "blur" }],
  email: [
    { required: true, message: "请输入邮箱", trigger: "blur" },
    { type: "email", message: "邮箱格式不正确", trigger: ["blur", "change"] },
  ],
};

const cityMap = {
  广东: [
    { label: "广州", value: "gz" },
    { label: "深圳", value: "sz" },
  ],
  浙江: [
    { label: "杭州", value: "hz" },
    { label: "宁波", value: "nb" },
  ],
};

const items = ref([
  { group: true, title: "基本信息（本行均无 tip → 间隔收紧 6px）" },
  {
    prop: "name",
    label: "姓名",
    required: true,
    itemRender: { name: "ElInput", props: { placeholder: "请输入姓名", clearable: true } },
  },
  {
    prop: "age",
    label: "年龄",
    itemRender: { name: "ElInputNumber", props: { min: 0, max: 150, controlsPosition: "right" } },
  },
  {
    prop: "gender",
    label: "性别",
    required: true,
    itemRender: {
      name: "ElSelect",
      props: { placeholder: "请选择性别" },
      options: [
        { label: "男", value: "male" },
        { label: "女", value: "female" },
      ],
    },
  },

  { group: true, title: "联系方式（手机号配置 tip → 整行保持默认间隔）" },
  {
    prop: "phone",
    label: "手机号",
    required: true,
    tip: "仅用于账号安全验证，不会对外展示",
    itemRender: { name: "ElInput", props: { placeholder: "请输入手机号" } },
  },
  {
    prop: "email",
    label: "邮箱",
    required: true,
    itemRender: { name: "ElInput", props: { placeholder: "请输入邮箱" } },
  },
  {
    prop: "wechat",
    label: "微信号",
    itemRender: { name: "ElInput", props: { placeholder: "选填" } },
  },
  {
    prop: "province",
    label: "省份",
    itemRender: {
      name: "ElSelect",
      props: { placeholder: "请选择省份" },
      options: [
        { label: "广东", value: "广东" },
        { label: "浙江", value: "浙江" },
      ],
      events: { change: () => (formData.value.city = "") },
    },
  },
  {
    prop: "city",
    label: "城市",
    itemRender: {
      name: "ElSelect",
      props: { placeholder: "请选择城市" },
      options: (ctx) => cityMap[ctx.data.province] || [],
    },
  },
  {
    prop: "remark",
    label: "备注",
    span: 8,
    itemRender: { name: "ElInput", props: { placeholder: "选填" } },
  },
]);

// —— 页面内表单 ——
const formRef = ref();
const onSubmit = async () => {
  try {
    await formRef.value?.validate();
    ElMessage.success("校验通过");
  } catch {
    ElMessage.error("校验未通过，错误提示 3s 后自动隐藏（红色边框保留）");
  }
};

// —— el-dialog 内表单（验证 tooltip 不被遮挡；嵌套 dialog 复验） ——
const dialogVisible = ref(false);
const nestedVisible = ref(false);
const dialogFormRef = ref();
const onDialogSubmit = async () => {
  try {
    await dialogFormRef.value?.validate();
    ElMessage.success("弹窗表单校验通过");
  } catch {
    // 校验失败：错误 tooltip 出现在各 item 右上角——应浮在 dialog（含遮罩）之上
  }
};
</script>

<template>
  <div style="max-width: 960px; padding: 16px">
    <div
      style="
        margin-bottom: 12px;
        display: flex;
        gap: 16px;
        align-items: center;
        flex-wrap: wrap;
      "
    >
      <div style="display: flex; gap: 6px; align-items: center">
        <span style="font-size: 13px; color: #606266">紧凑模式（compact）：</span>
        <el-switch v-model="compact" />
      </div>
      <div style="display: flex; gap: 6px; align-items: center">
        <span style="font-size: 13px; color: #606266">label 位置：</span>
        <el-radio-group v-model="labelPosition" size="small">
          <el-radio-button value="left">left</el-radio-button>
          <el-radio-button value="right">right</el-radio-button>
          <el-radio-button value="top">top</el-radio-button>
        </el-radio-group>
      </div>
      <div style="display: flex; gap: 6px; align-items: center">
        <span style="font-size: 13px; color: #606266">错误提示时长（秒）：</span>
        <el-input-number v-model="errorTipDuration" :min="0" :max="30" size="small" />
      </div>
      <el-button type="primary" @click="onSubmit">提交校验</el-button>
      <el-button @click="dialogVisible = true">在 el-dialog 中打开</el-button>
    </div>

    <FormPro
      ref="formRef"
      v-model="formData"
      :items="items"
      :columns="3"
      :compact="compact"
      :error-tip-duration="errorTipDuration"
      :label-position="labelPosition"
      :rules="rules"
      label-width="80px"
    />

    <el-divider>实时数据</el-divider>
    <pre style="background: #f5f7fa; padding: 12px; border-radius: 4px">{{
      formData
    }}</pre>

    <!-- 场景验证：compact 表单放进 el-dialog，触发校验后错误 tooltip 应浮在 dialog 之上 -->
    <el-dialog v-model="dialogVisible" title="紧凑表单（el-dialog 内）" width="720px">
      <FormPro
        ref="dialogFormRef"
        v-model="formData"
        :items="items"
        :columns="3"
        compact
        :error-tip-duration="errorTipDuration"
        :label-position="labelPosition"
        :rules="rules"
        label-width="80px"
      />
      <template #footer>
        <el-button @click="nestedVisible = true">打开嵌套 dialog</el-button>
        <el-button type="primary" @click="onDialogSubmit">提交校验</el-button>
      </template>
    </el-dialog>

    <!-- 嵌套 dialog：z-index 更高；本层打开后，上一层表单的错误 tooltip 应被本层遮挡
         （tooltip 只需浮在「表单所在 dialog 层」之上，不越层覆盖嵌套层） -->
    <el-dialog v-model="nestedVisible" title="嵌套 dialog" width="480px" append-to-body>
      <span style="font-size: 13px; color: #606266">
        本层 z-index 更高：上一层 dialog 中的红色错误气泡应被本层遮挡（只覆盖表单所在层即可）。
      </span>
    </el-dialog>
  </div>
</template>

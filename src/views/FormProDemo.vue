<script setup lang="jsx">
/**
 * FormPro 配置式表单演示：覆盖全部 7 项特性。
 */
import { ref } from "vue";
import { ElMessage, ElButton, ElTag, ElDivider } from "element-plus";
import FormPro from "@/components/formPro/index.vue";

const formData = ref({
  name: "张三",
  age: 28,
  type: "personal",
  company: "",
  email: "",
  remark: "",
  role: "admin",
});

// 「只显示必填」开关
const onlyRequired = ref(false);

// 校验规则（el-form 统一 rules，也可在 item.rules 单独配置）
const rules = {
  name: [{ required: true, message: "请输入姓名", trigger: "blur" }],
  email: [
    { required: true, message: "请输入邮箱", trigger: "blur" },
    { type: "email", message: "邮箱格式不正确", trigger: ["blur", "change"] },
  ],
};

const roleOptions = [
  { label: "管理员", value: "admin" },
  { label: "编辑", value: "editor" },
  { label: "访客", value: "viewer" },
];

// 表单配置：覆盖分组 / span / 条件显隐 / 插入项 / JSX / itemRender
const items = ref([
  // —— 分组 1：基本信息（默认展开）——
  { group: true, title: "基本信息" },
  {
    field: "name",
    label: "姓名",
    span: 12,
    required: true,
    itemRender: { name: "ElInput", props: { placeholder: "请输入姓名", clearable: true } },
  },
  {
    field: "age",
    label: "年龄",
    span: 12,
    itemRender: { name: "ElInputNumber", props: { min: 0, max: 150 } },
  },
  // 插入项：在表单项之间插入自定义内容（render = JSX）
  {
    span: 24,
    render: (h) => (
      <ElDivider contentPosition="left">
        <ElTag type="info" size="small">
          以下为动态字段：当「类型=企业」时显示公司名称
        </ElTag>
      </ElDivider>
    ),
  },
  {
    field: "type",
    label: "类型",
    span: 12,
    itemRender: {
      name: "ElSelect",
      props: { placeholder: "请选择类型" },
      options: [
        { label: "个人", value: "personal" },
        { label: "企业", value: "company" },
      ],
    },
  },
  // 条件显隐：仅 type==='company' 时显示，隐藏时后续「邮箱」自动前移回流
  {
    field: "company",
    label: "公司名称",
    span: 12,
    visibleMethod: (data) => data.type === "company",
    itemRender: { name: "ElInput", props: { placeholder: "请输入公司名称" } },
  },
  {
    field: "email",
    label: "邮箱",
    span: 12,
    itemRender: { name: "ElInput", props: { placeholder: "请输入邮箱" } },
  },

  // —— 分组 2：更多信息（默认折叠）——
  { group: true, title: "更多信息", fold: true },
  // JSX 渲染控件：用 render 函数自定义展示
  {
    field: "role",
    label: "角色",
    span: 12,
    render: (h, ctx) => (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <ElTag type={ctx.value === "admin" ? "danger" : "success"}>
          当前：{ctx.value}
        </ElTag>
        <ElButton
          size="small"
          onClick={() => {
            ctx.data.role = ctx.value === "admin" ? "viewer" : "admin";
          }}
        >
          切换
        </ElButton>
      </div>
    ),
  },
  // 插槽式控件：引用外部 #remark 具名插槽
  { field: "remark", label: "备注", span: 24, slot: "remark" },
]);

const formRef = ref();
const onSubmit = async () => {
  try {
    await formRef.value?.validate();
    ElMessage.success("校验通过，提交数据：" + JSON.stringify(formData.value));
  } catch (err) {
    ElMessage.error("校验未通过");
  }
};
const onReset = () => {
  formRef.value?.resetFields();
  ElMessage.info("已重置");
};
</script>

<template>
  <div style="max-width: 960px; padding: 16px">
    <div style="margin-bottom: 12px; display: flex; gap: 12px; align-items: center">
      <el-switch v-model="onlyRequired" />
      <span style="font-size: 13px; color: #606266">
        仅显示必填项（onlyRequired）：当前 <b>{{ onlyRequired }}</b>
      </span>
      <el-button type="primary" @click="onSubmit">提交校验</el-button>
      <el-button @click="onReset">重置</el-button>
    </div>

    <FormPro
      ref="formRef"
      v-model="formData"
      :items="items"
      :span="24"
      :only-required="onlyRequired"
      :rules="rules"
      label-width="100px"
      @validate="(prop, valid) => console.log('[validate]', prop, valid)"
    >
      <!-- 插槽式控件：对应 item.slot = 'remark' -->
      <template #remark="{ value }">
        <el-input
          :model-value="value"
          type="textarea"
          :rows="3"
          placeholder="插槽渲染的备注输入框"
          @update:model-value="(v) => (formData.remark = v)"
        />
      </template>
    </FormPro>

    <el-divider>实时数据</el-divider>
    <pre style="background: #f5f7fa; padding: 12px; border-radius: 4px">{{
      formData
    }}</pre>
  </div>
</template>

<script setup lang="jsx">
/**
 * FormPro 配置式表单演示：覆盖分组 / 列数 / 条件显隐 / 插入项 / JSX / itemRender / 插槽 等特性。
 */
import { ref } from "vue";
import {
  ElMessage,
  ElButton,
  ElTag,
  ElDivider,
  ElTooltip,
  ElIcon,
} from "element-plus";
import { InfoFilled, QuestionFilled } from "@element-plus/icons-vue";
import FormPro from "@/components/formPro/index.vue";

// 表格示例数据（插入到表单项之间）
const tableData = ref([
  { name: "李四", dept: "研发部", role: "前端", status: "在职" },
  { name: "王五", dept: "产品部", role: "产品经理", status: "在职" },
  { name: "赵六", dept: "设计部", role: "UI 设计师", status: "离职" },
]);

// 表单数据：只需声明「有意义的非空默认值」；
// 其余字段（空字符串等）由 FormPro 按 items 配置自动补全（autoFillDefaults，默认开启）。
// 控件类型推导：Switch→false、CheckboxGroup→[]、其余→""；也可在 item.defaultValue 指定固定默认值。
const formData = ref({
  name: "张三",
  age: 28,
  gender: "male",
  enabled: true,
  type: "personal",
  role: "admin",
  hobbies: ["read"],
  level: "p6",
});

// 运行时可切换的列数（演示 columns 动态生效）
const columns = ref(3);
// 「只显示必填」开关
const onlyRequired = ref(false);
// 「提交时移除隐藏字段值」开关（removeHiddenValues）
const removeHiddenValues = ref(false);

// 校验规则（el-form 统一 rules，也可在 item.rules 单独配置）
const rules = {
  name: [{ required: true, message: "请输入姓名", trigger: "blur" }],
  email: [
    { required: true, message: "请输入邮箱", trigger: "blur" },
    { type: "email", message: "邮箱格式不正确", trigger: ["blur", "change"] },
  ],
};

// 表单配置：覆盖分组 / span / 条件显隐 / 插入项 / JSX / itemRender
const items = ref([
  // —— 分组 1：基本信息（默认展开，allToggle 显示「折叠全部 / 展开全部」按钮）——
  // 标题与按钮之间的扩展区用 render（JSX）渲染一个提示图标
  {
    group: true,
    title: "基本信息",
    allToggle: true,
    render: (h) => (
      <>
        <ElTooltip
          content="带 * 号为必填项，请确保填写完整后再提交"
          placement="top"
        >
          <ElIcon
            style={{
              color: "var(--el-color-info)",
              cursor: "help",
              fontSize: "14px",
            }}
          >
            <InfoFilled />
          </ElIcon>
        </ElTooltip>
        <span>111</span>
      </>
    ),
  },
  {
    prop: "name",
    label: "姓名",
    required: true,
    titleBold: true,
    titlePrefix: InfoFilled,
    titlePrefixTip: "请输入真实姓名",
    itemRender: {
      name: "ElInput",
      props: { placeholder: "请输入姓名", clearable: true },
    },
  },
  {
    prop: "age",
    label: "年龄",
    titleSuffix: InfoFilled,
    titleSuffixTip: "请输入真实年龄",
    itemRender: {
      name: "ElInputNumber",
      props: { min: 0, max: 150, controlsPosition: "right" },
    },
  },
  {
    prop: "gender",
    label: "性别",
    itemRender: {
      name: "ElRadioGroup",
      options: [
        { label: "男", value: "male" },
        { label: "女", value: "female" },
      ],
    },
  },
  // 插入项：在表单项之间插入一个 el-table（slot 方式，引用外部 #userTable 具名插槽）
  {
    span: 24,
    slot: "userTable",
  },
  {
    prop: "birthday",
    label: "出生日期",
    itemRender: {
      name: "ElDatePicker",
      props: {
        type: "date",
        placeholder: "选择日期",
        valueFormat: "YYYY-MM-DD",
      },
    },
  },
  {
    prop: "enabled",
    label: "是否启用",
    itemRender: { name: "ElSwitch" },
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
    prop: "type",
    label: "类型",
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
    prop: "company",
    label: "公司名称",
    visibleMethod: (data) => data.type === "company",
    itemRender: { name: "ElInput", props: { placeholder: "请输入公司名称" } },
  },
  {
    prop: "email",
    label: "邮箱",
    itemRender: { name: "ElInput", props: { placeholder: "请输入邮箱" } },
  },
  // 折叠表单：folding 项默认收起，由 collapseNode 控制展开/收起
  {
    prop: "address",
    label: "地址",
    folding: true,
    itemRender: { name: "ElInput", props: { placeholder: "请输入地址" } },
  },
  {
    prop: "zip",
    label: "邮编",
    folding: true,
    itemRender: { name: "ElInput", props: { placeholder: "请输入邮编" } },
  },
  // 折叠触发节点：span 控制占位宽度，不设置时默认 24（整行）
  { collapseNode: true, span: 2 },

  // —— 分组 2：更多信息（默认折叠）——
  // 标题与按钮之间的扩展区用具名插槽渲染提示（slot: 'moreInfoTip'）
  { group: true, title: "更多信息", fold: true, slot: "moreInfoTip" },
  // JSX 渲染控件：用 render 函数自定义展示
  {
    prop: "role",
    label: "角色",
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
  {
    prop: "hobbies",
    label: "爱好",
    itemRender: {
      name: "ElCheckboxGroup",
      options: [
        { label: "阅读", value: "read" },
        { label: "运动", value: "sport" },
        { label: "音乐", value: "music" },
        { label: "旅行", value: "travel" },
      ],
    },
  },
  {
    prop: "level",
    label: "职级",
    itemRender: {
      name: "ElSelect",
      props: { placeholder: "请选择职级" },
      options: [
        { label: "P5", value: "p5" },
        { label: "P6", value: "p6" },
        { label: "P7", value: "p7" },
        { label: "P8", value: "p8" },
      ],
    },
  },
  // 插槽式控件：引用外部 #remark 具名插槽
  { prop: "remark", label: "备注", span: 24, slot: "remark" },
]);

const formRef = ref();
const onSubmit = async () => {
  try {
    await formRef.value?.validate();
    // 提交时取 getSubmitData()：已按 removeHiddenValues 规则移除隐藏字段值
    const submitData = formRef.value?.getSubmitData?.() ?? formData.value;
    ElMessage.success("校验通过，提交数据：" + JSON.stringify(submitData));
  } catch (err) {
    ElMessage.error("校验未通过");
  }
};
const onReset = () => {
  formRef.value?.resetFields();
  ElMessage.info("已重置");
};
// 调用 FormPro 暴露的分组动态折叠方法
const expandAllGroups = () => formRef.value?.expandAllGroups?.();
const collapseAllGroups = () => formRef.value?.collapseAllGroups?.();
const toggleBasicGroup = () => formRef.value?.toggleGroup?.("基本信息");
</script>

<template>
  <div style="max-width: 1080px; padding: 16px">
    <!-- 顶部控制区：运行时切换列数 / 只显示必填 / 操作按钮 -->
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
        <span style="font-size: 13px; color: #606266">表单列数：</span>
        <el-radio-group v-model="columns" size="small">
          <el-radio-button :value="1">1 列</el-radio-button>
          <el-radio-button :value="2">2 列</el-radio-button>
          <el-radio-button :value="3">3 列</el-radio-button>
          <el-radio-button :value="4">4 列</el-radio-button>
        </el-radio-group>
      </div>
      <el-switch v-model="onlyRequired" />
      <span style="font-size: 13px; color: #606266">
        仅显示必填项（onlyRequired）：当前 <b>{{ onlyRequired }}</b>
      </span>
      <el-switch v-model="removeHiddenValues" />
      <span style="font-size: 13px; color: #606266">
        提交移除隐藏字段值（removeHiddenValues）：当前 <b>{{ removeHiddenValues }}</b>
      </span>
      <el-button type="primary" @click="onSubmit">提交校验</el-button>
      <el-button @click="onReset">重置</el-button>
      <el-button @click="expandAllGroups">展开全部分组</el-button>
      <el-button @click="collapseAllGroups">收起全部分组</el-button>
      <el-button @click="toggleBasicGroup">切换「基本信息」</el-button>
    </div>

    <FormPro
      ref="formRef"
      v-model="formData"
      :items="items"
      :columns="columns"
      :title-colon="true"
      :only-required="onlyRequired"
      :remove-hidden-values="removeHiddenValues"
      :rules="rules"
      label-width="100px"
      @validate="(prop, valid) => console.log('[validate]', prop, valid)"
    >
      <!-- 分组 2 标题扩展区：对应 group.slot = 'moreInfoTip' -->
      <template #moreInfoTip>
        <el-tooltip content="以下为选填信息，可根据需要补充" placement="top">
          <el-icon
            style="color: var(--el-color-info); cursor: help; font-size: 14px"
          >
            <QuestionFilled />
          </el-icon>
        </el-tooltip>
      </template>
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
      <!-- 插入的表格：对应 item.slot = 'userTable' -->
      <template #userTable>
        <div style="margin: 4px 0 12px">
          <el-table :data="tableData" border stripe size="small">
            <el-table-column type="index" label="#" width="50" />
            <el-table-column prop="name" label="姓名" />
            <el-table-column prop="dept" label="部门" />
            <el-table-column prop="role" label="岗位" />
            <el-table-column prop="status" label="状态" />
          </el-table>
        </div>
      </template>
    </FormPro>

    <el-divider>实时数据</el-divider>
    <pre style="background: #f5f7fa; padding: 12px; border-radius: 4px">{{
      formData
    }}</pre>
  </div>
</template>

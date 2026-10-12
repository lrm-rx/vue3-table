<script setup>
/**
 * FormPro border（边框表格样式）演示：
 *  通过 border 属性把表单渲染为带边框的表格外观——外框 + 单元格网格线 + label 表头底色。
 *  覆盖：开关切换、列数变化、分组标题行、控件前后缀、多控件类型混排。
 */
import { ref } from "vue";
import { ElMessage } from "element-plus";
import FormPro from "@/components/formPro/index.vue";

// 边框开关（运行时切换，验证向后兼容：关闭即恢复原外观）
const border = ref(true);
// 列数（边框模式下演示多列表格）
const columns = ref(2);

const formData = ref({
  name: "张三",
  age: 28,
  price: 99.5,
  gender: "male",
  birthday: "1996-05-20",
  enabled: true,
  phone: "13800138000",
  email: "",
  province: "广东",
  city: "gz",
  remark: "",
});

const rules = {
  name: [{ required: true, message: "请输入姓名", trigger: "blur" }],
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
  // 分组 1：基本信息（边框模式下作为分段标题行渲染）
  { group: true, title: "基本信息" },
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
  // 控件前后缀：货币符号 + 单位（边框单元格内紧贴控件）
  {
    prop: "price",
    label: "价格",
    prefix: "￥",
    suffix: "元",
    itemRender: { name: "ElInputNumber", props: { min: 0, precision: 2, controlsPosition: "right" } },
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
  {
    prop: "birthday",
    label: "出生日期",
    itemRender: {
      name: "ElDatePicker",
      props: { type: "date", placeholder: "选择日期", valueFormat: "YYYY-MM-DD" },
    },
  },
  {
    prop: "enabled",
    label: "是否启用",
    itemRender: { name: "ElSwitch" },
  },

  // 分组 2：联系方式
  { group: true, title: "联系方式" },
  {
    prop: "phone",
    label: "手机号",
    prefix: "+86",
    itemRender: { name: "ElInput", props: { placeholder: "请输入手机号" } },
  },
  {
    prop: "email",
    label: "邮箱",
    required: true,
    itemRender: { name: "ElInput", props: { placeholder: "请输入邮箱" } },
  },
  // 长 tip 提示：超出单元格宽度时单行省略为 …（悬浮 title 可见全文）
  {
    prop: "wechat",
    label: "微信号",
    tip: "请填写与实名认证一致的微信号，该信息仅用于客服人员与您取得联系，不会在公开展示",
    itemRender: { name: "ElInput", props: { placeholder: "请输入微信号" } },
  },
  // 级联联动：省份 → 城市
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
    span: 24,
    itemRender: { name: "ElInput", props: { type: "textarea", rows: 2, placeholder: "选填" } },
  },
]);

const formRef = ref();
const onSubmit = async () => {
  try {
    await formRef.value?.validate();
    ElMessage.success("校验通过：" + JSON.stringify(formData.value));
  } catch {
    ElMessage.error("校验未通过");
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
        <span style="font-size: 13px; color: #606266">边框样式（border）：</span>
        <el-switch v-model="border" />
      </div>
      <div style="display: flex; gap: 6px; align-items: center">
        <span style="font-size: 13px; color: #606266">列数：</span>
        <el-radio-group v-model="columns" size="small">
          <el-radio-button :value="1">1 列</el-radio-button>
          <el-radio-button :value="2">2 列</el-radio-button>
          <el-radio-button :value="3">3 列</el-radio-button>
        </el-radio-group>
      </div>
      <el-button type="primary" @click="onSubmit">提交校验</el-button>
    </div>

    <FormPro
      ref="formRef"
      v-model="formData"
      :items="items"
      :columns="columns"
      :border="border"
      :rules="rules"
      label-width="100px"
    />

    <el-divider>实时数据</el-divider>
    <pre style="background: #f5f7fa; padding: 12px; border-radius: 4px">{{
      formData
    }}</pre>
  </div>
</template>

<script setup lang="jsx">
/**
 * FormPro 联动交互演示：
 *  ① 输入 / 选择 / 切换 → 请求接口 → 刷新其他 item 的选择项数据（optionsSource 声明式异步选项）
 *  ② 某个/某几个输入/选择项没有数据时 → 某个/某几个 item 禁用 / 只读（disabledWhen / readonlyWhen）
 *
 * 这两类联动若在父级手写，每个联动点都要重复「change 事件 + 清空值 + loading +
 * updateItems + 防竞态」约 15 行样板代码，且同 tick 改 formData 还有渲染时序坑。
 * 现已下沉为组件内部能力：本页没有任何事件处理器，全部由 items 配置声明。
 */
import { ref } from "vue";
import { ElMessage } from "element-plus";
import FormPro from "@/components/formPro/index.vue";

// —— 模拟后端接口（真实场景替换为 axios 请求）——
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const randomDelay = (min = 300, max = 1200) => delay(min + Math.random() * (max - min));

// 关键词 → 候选服务（远程搜索）
const SERVICE_POOL = [
  { label: "订单服务 order-svc", value: "order" },
  { label: "支付服务 pay-svc", value: "pay" },
  { label: "库存服务 stock-svc", value: "stock" },
  { label: "用户服务 user-svc", value: "user" },
  { label: "网关服务 gateway-svc", value: "gateway" },
  { label: "消息服务 msg-svc", value: "msg" },
];
const fetchServices = async (kw) => {
  await randomDelay(200, 600);
  if (!kw) return SERVICE_POOL;
  return SERVICE_POOL.filter((s) =>
    s.label.toLowerCase().includes(String(kw).toLowerCase()),
  );
};

// 资源组 → 资源实例（耗时不确定：快速连续切换可观察防竞态）
const fetchResources = async (group) => {
  await randomDelay(300, 1500);
  return [1, 2, 3].map((i) => ({
    label: `${group} 组-实例 ${i}`,
    value: `${group}-i${i}`,
  }));
};

// 是否审批 → 审批人列表
const fetchApprovers = async () => {
  await randomDelay(300, 800);
  return [
    { label: "王主管", value: "wang" },
    { label: "李经理", value: "li" },
    { label: "张总监", value: "zhang" },
  ];
};

// 表单数据：只声明有意义的默认值，其余由 autoFillDefaults 补全
const formData = ref({
  keyword: "",
  resourceGroup: "",
  needApproval: false,
});

const formRef = ref();

const items = ref([
  // —— 分组 1：触发源（输入 / 选择 / 切换）——
  // 分组标题支持 titleBold（加粗）与 titleStyle（颜色/字号等自定义样式）
  {
    group: true,
    title: "① 触发源：输入 / 选择 / 切换 → 请求接口",
    titleBold: true,
    titleStyle: { color: "#409eff", fontSize: 15 },
  },
  {
    prop: "keyword",
    label: "服务关键词",
    titleBold: true, // label 加粗
    tip: "输入即触发接口（400ms 防抖合并），实时刷新下方「候选服务」选项",
    itemRender: {
      name: "ElInput",
      props: { placeholder: "输入关键字过滤服务，如 pay", clearable: true },
    },
  },
  // —— 占位项：空对象 {} 渲染为空 el-col，占据一个默认 span（columns=3 → 8），
  //    在两个 item 之间留白；{ span: 16 } 可指定占位宽度 ——
  {},
  {
    prop: "resourceGroup",
    label: "资源组",
    titleBold: true, // label 加粗
    tip: "选择后调用接口（300~1500ms 随机耗时）；快速连续切换可观察防竞态：过期结果会被丢弃",
    itemRender: {
      name: "ElSelect",
      props: { placeholder: "请选择资源组", clearable: true },
      options: [
        { label: "A 组", value: "A" },
        { label: "B 组", value: "B" },
        { label: "C 组", value: "C" },
      ],
    },
  },
  {
    prop: "needApproval",
    label: "需要审批",
    tip: "切换即调用接口拉取「审批人」选项；关闭时审批人禁用且无选项",
    itemRender: { name: "ElSwitch" },
  },

  // —— 分组 2：联动目标（optionsSource 声明式异步选项）——
  {
    group: true,
    title: "② 联动目标：optionsSource 声明式异步选项",
    titleBold: true,
    titleStyle: { color: "#67c23a", fontSize: 15 },
  },
  {
    prop: "service",
    label: "候选服务",
    tip: "optionsSource: deps=[keyword] + debounce 400；输入变化自动重新拉取",
    itemRender: {
      name: "ElSelect",
      props: { placeholder: "随关键词自动加载", filterable: true, clearable: true },
    },
    optionsSource: {
      deps: ["keyword"],
      debounce: 400,
      fetch: (ctx) => fetchServices(ctx.deps[0]),
    },
  },
  {
    prop: "resource",
    label: "资源实例",
    tip: "optionsSource: deps=[resourceGroup] + when（未选资源组不请求）；disabledWhen 未选时禁用；切换资源组自动清空已选实例",
    disabledWhen: (ctx) => !ctx.data.resourceGroup,
    itemRender: {
      name: "ElSelect",
      props: { placeholder: "请先选择资源组", clearable: true },
    },
    optionsSource: {
      deps: ["resourceGroup"],
      when: (data) => !!data.resourceGroup,
      fetch: (ctx) => fetchResources(ctx.deps[0]),
    },
  },
  {
    prop: "approver",
    label: "审批人",
    tip: "optionsSource: deps=[needApproval] + when（关闭审批不请求）；disabledWhen 关闭时禁用",
    disabledWhen: (ctx) => !ctx.data.needApproval,
    itemRender: {
      name: "ElSelect",
      props: { placeholder: "开启「需要审批」后加载", clearable: true },
    },
    optionsSource: {
      deps: ["needApproval"],
      when: (data) => data.needApproval === true,
      fetch: () => fetchApprovers(),
    },
  },

  // —— 分组 3：空值联动禁用 / 只读 ——
  {
    group: true,
    title: "③ 空值联动：依赖项为空时禁用 / 只读",
    titleBold: false, // 不加粗（默认 600，false → 400）
    titleStyle: { color: "#e6a23c", fontSize: 13 },
  },
  {
    prop: "contact",
    label: "联系人",
    tip: "未填写时：「联系电话」禁用、「备用说明」只读",
    itemRender: {
      name: "ElInput",
      props: { placeholder: "填写后启用下方字段", clearable: true },
    },
  },
  {
    prop: "phone",
    label: "联系电话",
    disabledWhen: (ctx) => !ctx.data.contact,
    tip: "disabledWhen: 联系人为空时禁用",
    itemRender: { name: "ElInput", props: { placeholder: "先填写联系人" } },
  },
  {
    prop: "spareNote",
    label: "备用说明",
    readonlyWhen: (ctx) => !ctx.data.contact,
    tip: "readonlyWhen: 联系人为空时只读",
    itemRender: { name: "ElInput", props: { placeholder: "先填写联系人" } },
  },
  {
    prop: "dept",
    label: "部门",
    tip: "部门与职位都选定后，「入职日期」才可选（多条件禁用）",
    itemRender: {
      name: "ElSelect",
      props: { placeholder: "请选择部门", clearable: true },
      options: [
        { label: "研发部", value: "rd" },
        { label: "产品部", value: "pm" },
        { label: "设计部", value: "design" },
      ],
    },
  },
  {
    prop: "position",
    label: "职位",
    itemRender: {
      name: "ElSelect",
      props: { placeholder: "请选择职位", clearable: true },
      options: [
        { label: "前端工程师", value: "fe" },
        { label: "后端工程师", value: "be" },
        { label: "测试工程师", value: "qa" },
      ],
    },
  },
  {
    prop: "entryDate",
    label: "入职日期",
    disabledWhen: (ctx) => !ctx.data.dept || !ctx.data.position,
    tip: "disabledWhen: 部门 / 职位任一未选时禁用",
    itemRender: {
      name: "ElDatePicker",
      props: {
        type: "date",
        valueFormat: "YYYY-MM-DD",
        placeholder: "先选定部门与职位",
      },
    },
  },
]);

const onSubmit = async () => {
  try {
    await formRef.value?.validate();
    ElMessage.success("提交数据：" + JSON.stringify(formData.value));
  } catch {
    ElMessage.error("校验未通过");
  }
};
const onReset = () => {
  formRef.value?.resetFields();
  ElMessage.info("已重置");
};
</script>

<template>
  <div style="max-width: 1080px; padding: 16px">
    <el-alert
      type="info"
      :closable="false"
      style="margin-bottom: 12px"
      title="本页所有联动均由 items 配置声明（optionsSource / disabledWhen / readonlyWhen），父级零事件处理器"
      description="optionsSource 内置：依赖变化自动清空本字段值、loading、防竞态（仅最新一次生效）、防抖；disabledWhen / readonlyWhen 在 render 期随表单数据自动求值。"
    />
    <div style="margin-bottom: 12px; display: flex; gap: 8px">
      <el-button type="primary" @click="onSubmit">提交</el-button>
      <el-button @click="onReset">重置</el-button>
    </div>

    <FormPro
      ref="formRef"
      v-model="formData"
      :items="items"
      :columns="3"
      :title-colon="true"
      label-width="90px"
    />

    <el-divider>实时数据</el-divider>
    <pre style="background: #f5f7fa; padding: 12px; border-radius: 4px">{{
      formData
    }}</pre>
  </div>
</template>

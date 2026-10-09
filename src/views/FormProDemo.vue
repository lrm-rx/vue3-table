<script setup lang="jsx">
/**
 * FormPro 配置式表单演示：覆盖分组 / 列数 / 条件显隐 / 插入项 / JSX / itemRender / 插槽 等特性。
 */
import { ref, onMounted } from "vue";
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
  skill: "vue",
  permissions: ["read", "write"],
});

// 运行时可切换的列数（演示 columns 动态生效）
const columns = ref(3);
// 「只显示必填」开关
const onlyRequired = ref(false);
// 「提交时移除隐藏字段值」开关（removeHiddenValues）
const removeHiddenValues = ref(false);

// 校验规则（el-form 统一 rules，也可在 item.rules 单独配置）
// 覆盖多种控件类型，用于充分测试 tip 与校验错误提示的切换
const rules = {
  name: [{ required: true, message: "请输入姓名", trigger: "blur" }],
  email: [
    { required: true, message: "请输入邮箱", trigger: "blur" },
    { type: "email", message: "邮箱格式不正确", trigger: ["blur", "change"] },
  ],
  level: [{ required: true, message: "请选择职级", trigger: "change" }],
  zip: [
    { pattern: /^\d{6}$/, message: "邮编必须为 6 位数字", trigger: "blur" },
  ],
};

// —— 演示：选择类组件 options 的多种赋值方式 ——
// ①【后端接口异步返回】：把结果写入响应式 ref，itemRender.options 直接传该 ref
//    （组件内 isRef 自动解包）。数据到位后因 render 期读取被 Vue 追踪，自动重渲染。
// ②【级联联动】：options 写成函数，接收 ctx = { data, value, prop }，
//    依据当前表单数据返回对应选项；依赖字段变化时自动重渲染。
// ③【选项 props 透传】：选项对象支持 { label, value, props }，props 透传给 el-option 等（如 disabled）。
// ④【编辑回填】：异步 options 到位后，已有默认值会自动匹配回显选中态。
const levelOptions = ref([]);
// 模拟后端接口：500ms 后返回职级列表（真实场景替换为 axios 请求）
// 注：P8 带 props.disabled，演示「选项 props 透传」
const fetchLevels = () =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve([
        { label: "P5（初级）", value: "p5" },
        { label: "P6（中级）", value: "p6" },
        { label: "P7（高级）", value: "p7" },
        { label: "P8（专家）", value: "p8", props: { disabled: true } },
      ]);
    }, 500);
  });

// 模拟技能列表：异步加载，用于演示「ref 异步 + filterable 可搜索 + 编辑回填」
const skillOptions = ref([]);
const fetchSkills = () =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve([
        { label: "Vue", value: "vue" },
        { label: "React", value: "react" },
        { label: "TypeScript", value: "ts" },
        { label: "Vite", value: "vite" },
        { label: "Node.js", value: "node" },
        { label: "Webpack", value: "webpack" },
      ]);
    }, 600);
  });

// 并行加载所有异步选项；到位后自动渲染，已有默认值自动回显
onMounted(async () => {
  const [levels, skills] = await Promise.all([fetchLevels(), fetchSkills()]);
  levelOptions.value = levels;
  skillOptions.value = skills;
});

// 级联联动数据一：省份 → 城市
const cityMap = {
  广东: [
    { label: "广州", value: "gz" },
    { label: "深圳", value: "sz" },
    { label: "东莞", value: "dg" },
  ],
  浙江: [
    { label: "杭州", value: "hz" },
    { label: "宁波", value: "nb" },
  ],
  江苏: [
    { label: "南京", value: "nj" },
    { label: "苏州", value: "suzhou" },
  ],
};

// 级联联动数据二：角色 → 权限（演示 ElCheckboxGroup 的函数形态 options）
const permissionMap = {
  admin: [
    { label: "读取", value: "read" },
    { label: "写入", value: "write" },
    { label: "删除", value: "delete" },
    { label: "管理", value: "admin" },
  ],
  viewer: [
    { label: "读取", value: "read" },
    { label: "导出", value: "export" },
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
    tip: "请输入 2-20 位字符的真实姓名",
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
    tip: "取值范围 0-150，将用于年龄分布统计",
    itemRender: {
      name: "ElInputNumber",
      props: { min: 0, max: 150, controlsPosition: "right" },
    },
  },
  {
    prop: "gender",
    label: "性别",
    tip: "请选择与本人身份证件一致的性别",
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
    tip: "格式 YYYY-MM-DD，用于计算年龄与星座",
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
    tip: "选择「企业」后将展开公司名称填写项",
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
    tip: "需与营业执照上的名称完全一致",
    visibleMethod: (data) => data.type === "company",
    itemRender: { name: "ElInput", props: { placeholder: "请输入公司名称" } },
  },
  {
    prop: "email",
    label: "邮箱",
    tip: "请输入可正常接收邮件的有效邮箱地址",
    itemRender: { name: "ElInput", props: { placeholder: "请输入邮箱" } },
  },
  // 折叠表单：folding 项默认收起，由 collapseNode 控制展开/收起
  {
    prop: "address",
    label: "地址",
    folding: true,
    tip: "请填写详细收货地址（省市区+街道门牌号）",
    itemRender: { name: "ElInput", props: { placeholder: "请输入地址" } },
  },
  {
    prop: "zip",
    label: "邮编",
    folding: true,
    tip: "6 位数字邮政编码",
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
    tip: "admin 拥有全部权限，viewer 仅可查看",
    render: (h, ctx) => (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <ElTag type={ctx.value === "admin" ? "danger" : "success"}>
          当前：{ctx.value}
        </ElTag>
        <ElButton
          size="small"
          onClick={() => {
            const next = ctx.value === "admin" ? "viewer" : "admin";
            ctx.data.role = next;
            // 级联清理：切换角色后，移除不在新权限选项中的值，避免残留失效值
            const valid = new Set((permissionMap[next] || []).map((o) => o.value));
            ctx.data.permissions = (ctx.data.permissions || []).filter((v) =>
              valid.has(v)
            );
          }}
        >
          切换
        </ElButton>
      </div>
    ),
  },
  // 级联联动示例二：角色 → 权限。ElCheckboxGroup 的 options 为函数，依据 data.role 返回；
  // 切换角色（上方「切换」按钮）时已级联清理失效值。
  {
    prop: "permissions",
    label: "权限",
    tip: "选项随「角色」动态变化（ElCheckboxGroup 函数形态 options）",
    itemRender: {
      name: "ElCheckboxGroup",
      options: (ctx) => permissionMap[ctx.data.role] || [],
    },
  },
  {
    prop: "hobbies",
    label: "爱好",
    tip: "可多选，最多选择 3 项",
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
  // 级联联动示例：省份 → 城市。城市 options 为函数，依据 data.province 返回；
  // 切换省份时通过 events.change 清空已选城市，避免残留失效值。
  {
    prop: "province",
    label: "省份",
    tip: "选择省份后，城市选项将联动更新",
    itemRender: {
      name: "ElSelect",
      props: { placeholder: "请选择省份" },
      options: [
        { label: "广东", value: "广东" },
        { label: "浙江", value: "浙江" },
        { label: "江苏", value: "江苏" },
      ],
      events: { change: () => (formData.value.city = "") },
    },
  },
  {
    prop: "city",
    label: "城市",
    tip: "选项随「省份」动态变化（函数形态 options）",
    itemRender: {
      name: "ElSelect",
      props: { placeholder: "请选择城市" },
      // 函数形态：ctx.data 为当前表单数据，据此联动
      options: (ctx) => cityMap[ctx.data.province] || [],
    },
  },
  // 后端异步示例：options 直接传响应式 ref（levelOptions），
  // onMounted 模拟接口返回后自动渲染，无需手动刷新；默认值 p6 演示「编辑回填」，
  // P8 带 props.disabled 演示「选项 props 透传」。
  {
    prop: "level",
    label: "职级",
    tip: "异步加载（ref）+ 编辑回填（默认 p6）；P8 为禁用项（props 透传）",
    itemRender: {
      name: "ElSelect",
      props: { placeholder: "请选择职级" },
      options: levelOptions,
    },
  },
  // 异步 + 可搜索示例：options 为 ref（异步），props.filterable 开启本地搜索；
  // 默认值 vue 演示编辑回填。
  {
    prop: "skill",
    label: "技能",
    tip: "异步加载 + 可搜索（filterable）；默认值 vue 演示编辑回填",
    itemRender: {
      name: "ElSelect",
      props: { placeholder: "请选择技能", filterable: true, clearable: true },
      options: skillOptions,
    },
  },
  // 插槽式控件：引用外部 #remark 具名插槽
  { prop: "remark", label: "备注", span: 24, tip: "选填，最多 200 字", slot: "remark" },
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

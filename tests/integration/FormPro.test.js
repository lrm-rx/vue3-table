// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { ref, reactive, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import ElementPlus from "element-plus";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import zhCn from "element-plus/dist/locale/zh-cn";
import FormPro from "../../src/components/formPro/index.vue";

const globalConfig = {
  plugins: [[ElementPlus, { locale: zhCn }]],
  components: Object.fromEntries(Object.entries(ElementPlusIconsVue)),
};

const mountFormPro = (props = {}, opts = {}) =>
  mount(FormPro, { props, global: globalConfig, ...opts });

describe("FormPro 配置式表单", () => {
  it("el-form 属性透传：labelWidth / rules / disabled 到达 el-form", async () => {
    const rules = { name: [{ required: true }] };
    const wrapper = mountFormPro({
      modelValue: { name: "" },
      items: [],
      labelWidth: "100px",
      rules,
      disabled: true,
    });
    await flushPromises();
    const elForm = wrapper.findComponent({ name: "ElForm" });
    expect(elForm.exists()).toBe(true);
    expect(elForm.props("labelWidth")).toBe("100px");
    expect(elForm.props("disabled")).toBe(true);
    expect(elForm.props("rules")).toStrictEqual(rules);
    // 内部 model 绑定
    expect(elForm.props("model")).toEqual({ name: "" });
  });

  it("v-model 双向同步：字段变更向父组件回抛", async () => {
    const formData = ref({ name: "a", age: 1 });
    const wrapper = mount(
      {
        components: { FormPro },
        setup: () => ({ formData }),
        template:
          '<FormPro v-model="formData" :items="[{ prop: \'name\', label: \'名称\', itemRender: { name: \'ElInput\' } }]" />',
      },
      { global: globalConfig },
    );
    await flushPromises();
    const input = wrapper.find("input");
    await input.setValue("hello");
    await flushPromises();
    // 父级 v-model 数据被更新（one-way：子组件 emit → 父级接收并写回）
    expect(formData.value.name).toBe("hello");
  });

  it("24 栅格分列：item.span 优先级 > 表单级 span", async () => {
    const wrapper = mountFormPro({
      modelValue: {},
      span: 8,
      items: [
        { prop: "a", label: "A" },
        { prop: "b", label: "B", span: 16 },
      ],
    });
    await flushPromises();
    const cols = wrapper.findAllComponents({ name: "ElCol" });
    expect(cols.length).toBe(2);
    expect(cols[0].props("span")).toBe(8);
    expect(cols[1].props("span")).toBe(16);
  });

  it("columns 列数：推导默认 span = 24/列数（3→8，4→6），item.span 仍可覆盖", async () => {
    const wrapper = mountFormPro({
      modelValue: {},
      columns: 3,
      items: [
        { prop: "a", label: "A" },
        { prop: "b", label: "B" },
        { prop: "c", label: "C", span: 24 },
      ],
    });
    await flushPromises();
    const cols = wrapper.findAllComponents({ name: "ElCol" });
    expect(cols.map((c) => c.props("span"))).toEqual([8, 8, 24]);

    // 切换为 4 列 → 默认 span 变为 6
    await wrapper.setProps({ columns: 4 });
    await flushPromises();
    const cols2 = wrapper.findAllComponents({ name: "ElCol" });
    expect(cols2.map((c) => c.props("span"))).toEqual([6, 6, 24]);
  });

  it("条件显隐自动回流：隐藏项不渲染，后续项前移", async () => {
    const wrapper = mountFormPro({
      modelValue: { flag: false },
      items: [
        { prop: "a", label: "A", span: 12 },
        { prop: "b", label: "B", span: 12, visibleMethod: (d) => !!d.flag },
        { prop: "c", label: "C", span: 12 },
      ],
    });
    await flushPromises();
    let labels = wrapper.findAllComponents({ name: "ElFormItem" }).map((i) => i.props("label"));
    expect(labels).toEqual(["A", "C"]);
    // 切换 flag → b 出现
    await wrapper.setProps({ modelValue: { flag: true } });
    await flushPromises();
    labels = wrapper.findAllComponents({ name: "ElFormItem" }).map((i) => i.props("label"));
    expect(labels).toEqual(["A", "B", "C"]);
  });

  it("onlyRequired：仅显示必填项（required:true 或 rules 含 required）", async () => {
    const wrapper = mountFormPro({
      modelValue: {},
      onlyRequired: false,
      items: [
        { prop: "a", label: "A", required: true },
        { prop: "b", label: "B" },
      ],
      rules: {},
    });
    await flushPromises();
    expect(wrapper.findAllComponents({ name: "ElFormItem" }).length).toBe(2);
    await wrapper.setProps({ onlyRequired: true });
    await flushPromises();
    expect(wrapper.findAllComponents({ name: "ElFormItem" }).length).toBe(1);
    expect(wrapper.findComponent({ name: "ElFormItem" }).props("label")).toBe("A");
  });

  it("分组可展开/折叠：折叠后组内项不渲染", async () => {
    const wrapper = mountFormPro({
      modelValue: {},
      items: [
        { group: true, title: "分组1", fold: true },
        { prop: "a", label: "A" },
        { prop: "b", label: "B" },
      ],
    });
    await flushPromises();
    // 默认折叠 → 无表单项
    expect(wrapper.findAllComponents({ name: "ElFormItem" }).length).toBe(0);
    const header = wrapper.find(".form-pro__group-header-main");
    expect(header.exists()).toBe(true);
    // 点击展开
    await header.trigger("click");
    await flushPromises();
    expect(wrapper.findAllComponents({ name: "ElFormItem" }).length).toBe(2);
  });

  it("JSX 渲染：item.render(h, ctx) 产出控件", async () => {
    const wrapper = mountFormPro({
      modelValue: { name: "jsx-val" },
      items: [
        {
          prop: "name",
          label: "名称",
          render: (h, ctx) => h("div", { class: "custom-jsx" }, `值=${ctx.value}`),
        },
      ],
    });
    await flushPromises();
    expect(wrapper.find(".custom-jsx").text()).toBe("值=jsx-val");
  });

  it("表单项间插入组件：无 field 项作为插入项渲染（slot / render）", async () => {
    const wrapper = mountFormPro(
      {
        modelValue: {},
        items: [
          { prop: "a", label: "A" },
          { slot: "myDivider" },
          { render: (h) => h("div", { class: "insert-render" }, "插入内容") },
          { prop: "b", label: "B" },
        ],
      },
      {
        slots: {
          myDivider: () => h("div", { class: "insert-slot" }, "分隔线"),
        },
      },
    );
    await flushPromises();
    expect(wrapper.find(".insert-slot").exists()).toBe(true);
    expect(wrapper.find(".insert-render").exists()).toBe(true);
    const labels = wrapper.findAllComponents({ name: "ElFormItem" }).map((i) => i.props("label"));
    expect(labels).toEqual(["A", "B"]);
  });

  it("itemRender 配置式渲染：ElInput + options 类组件注入选项", async () => {
    const wrapper = mountFormPro({
      modelValue: { role: "admin" },
      items: [
        {
          prop: "role",
          label: "角色",
          itemRender: {
            name: "ElSelect",
            props: { clearable: true },
            options: [
              { label: "管理员", value: "admin" },
              { label: "访客", value: "guest" },
            ],
          },
        },
      ],
    });
    await flushPromises();
    const select = wrapper.findComponent({ name: "ElSelect" });
    expect(select.exists()).toBe(true);
    expect(select.props("modelValue")).toBe("admin");
    expect(select.props("clearable")).toBe(true);
    const options = wrapper.findAllComponents({ name: "ElOption" });
    expect(options.length).toBe(2);
    expect(options.map((o) => o.props("value"))).toEqual(["admin", "guest"]);
    expect(options.map((o) => o.props("label"))).toEqual(["管理员", "访客"]);
  });

  it("暴露 el-form 实例方法：validate / resetFields / clearValidate", async () => {
    const wrapper = mountFormPro({
      modelValue: {},
      items: [],
    });
    await flushPromises();
    const vm = wrapper.vm;
    expect(typeof vm.validate).toBe("function");
    expect(typeof vm.resetFields).toBe("function");
    expect(typeof vm.clearValidate).toBe("function");
    expect(typeof vm.scrollToField).toBe("function");
    expect(vm.formRef).toBeTruthy();
  });

  it("autoFillDefaults：未声明的字段自动补全默认值，用户值优先", async () => {
    const wrapper = mountFormPro({
      modelValue: { name: "张三" }, // 仅声明有意义的默认值
      items: [
        { prop: "name", label: "姓名", itemRender: { name: "ElInput" } },
        { prop: "enabled", label: "启用", itemRender: { name: "ElSwitch" } },
        { prop: "hobbies", label: "爱好", itemRender: { name: "ElCheckboxGroup" } },
        { prop: "level", label: "职级", itemRender: { name: "ElSelect" }, defaultValue: "p6" },
      ],
    });
    await flushPromises();
    const data = wrapper.vm.formData;
    // 用户提供的值保留
    expect(data.name).toBe("张三");
    // 未声明的字段按控件类型自动补全
    expect(data.enabled).toBe(false);
    expect(data.hobbies).toEqual([]);
    expect(data.level).toBe("p6"); // item.defaultValue
    // 补全后的值应回抛给父级（v-model 同步）
    expect(wrapper.emitted("update:modelValue")).toBeTruthy();
  });

  it("autoFillDefaults=false：不自动补全，行为与原先一致", async () => {
    const wrapper = mountFormPro({
      modelValue: { name: "张三" },
      autoFillDefaults: false,
      items: [
        { prop: "name", label: "姓名", itemRender: { name: "ElInput" } },
        { prop: "age", label: "年龄", itemRender: { name: "ElInput" } },
      ],
    });
    await flushPromises();
    expect(wrapper.vm.formData.name).toBe("张三");
    expect(wrapper.vm.formData.age).toBeUndefined();
  });

  // —— 静默补全机制（suppressEmit）：items 变化触发的「补默认值」不向父级回抛，
  //    避免 watch(formData) → 改 items → 补默认值 → 回抛 → 再触发 watch 的回环 ——
  describe("静默补全机制", () => {
    const baseItems = [
      { prop: "name", label: "姓名", itemRender: { name: "ElInput" } },
    ];
    const addAge = (items) => [
      ...items,
      { prop: "age", label: "年龄", itemRender: { name: "ElInput" } },
    ];

    it("items 动态新增字段：内部补默认值，但不向父级回抛", async () => {
      const wrapper = mountFormPro({ modelValue: { name: "张三" }, items: baseItems });
      await flushPromises();
      const before = (wrapper.emitted("update:modelValue") || []).length;
      await wrapper.setProps({ items: addAge(baseItems) });
      await flushPromises();
      expect(wrapper.vm.formData.age).toBe(""); // 内部已补
      expect((wrapper.emitted("update:modelValue") || []).length).toBe(before); // 未回抛
    });

    it("补默认值后用户真实编辑：仍正常回抛（suppressEmit 已复位，不影响正常同步）", async () => {
      const wrapper = mountFormPro({ modelValue: { name: "张三" }, items: baseItems });
      await flushPromises();
      await wrapper.setProps({ items: addAge(baseItems) }); // 触发静默补全
      await flushPromises();
      const before = (wrapper.emitted("update:modelValue") || []).length;
      // 模拟用户真实编辑 age
      wrapper.vm.formData.age = "28";
      await flushPromises();
      const after = (wrapper.emitted("update:modelValue") || []).length;
      expect(after).toBeGreaterThan(before); // 真实编辑必须回抛
    });

    it("一次新增多个字段：全部静默补全，仍不回抛", async () => {
      const wrapper = mountFormPro({ modelValue: { name: "张三" }, items: baseItems });
      await flushPromises();
      const before = (wrapper.emitted("update:modelValue") || []).length;
      await wrapper.setProps({
        items: [
          ...baseItems,
          { prop: "age", label: "年龄", itemRender: { name: "ElInput" } },
          { prop: "enabled", label: "启用", itemRender: { name: "ElSwitch" } },
          { prop: "hobbies", label: "爱好", itemRender: { name: "ElCheckboxGroup" } },
        ],
      });
      await flushPromises();
      expect(wrapper.vm.formData.age).toBe("");
      expect(wrapper.vm.formData.enabled).toBe(false);
      expect(wrapper.vm.formData.hobbies).toEqual([]);
      expect((wrapper.emitted("update:modelValue") || []).length).toBe(before);
    });

    it("autoFillDefaults=false：不补默认值（formData 中无新字段）", async () => {
      const wrapper = mountFormPro({
        modelValue: { name: "张三" },
        items: baseItems,
        autoFillDefaults: false,
      });
      await flushPromises();
      await wrapper.setProps({ items: addAge(baseItems) });
      await flushPromises();
      expect(wrapper.vm.formData.age).toBeUndefined();
    });

    it("removeHiddenValues 场景下补默认值同样不回抛", async () => {
      const wrapper = mountFormPro({
        modelValue: { name: "张三" },
        items: baseItems,
        removeHiddenValues: true,
      });
      await flushPromises();
      const before = (wrapper.emitted("update:modelValue") || []).length;
      await wrapper.setProps({ items: addAge(baseItems) });
      await flushPromises();
      expect(wrapper.vm.formData.age).toBe("");
      expect((wrapper.emitted("update:modelValue") || []).length).toBe(before);
    });
  });

  it("暴露 el-form 全部实例 API（含 getField / fields / setInitialValues）", async () => {
    const wrapper = mountFormPro({
      modelValue: { a: "1" },
      items: [{ prop: "a", label: "A" }],
    });
    await flushPromises();
    const vm = wrapper.vm;
    expect(typeof vm.getField).toBe("function");
    expect(typeof vm.setInitialValues).toBe("function");
    expect(vm.fields).toBeDefined();
    const ctx = vm.getField("a");
    expect(ctx).toBeTruthy();
    expect(ctx.prop).toBe("a");
    expect(() => vm.setInitialValues({ a: "init" })).not.toThrow();
  });

  it("暴露每个 el-form-item 完整实例：formItemRefs / getFormItem(prop)", async () => {
    const wrapper = mountFormPro({
      modelValue: { a: "", b: "" },
      items: [
        { prop: "a", label: "A", itemRender: { name: "ElInput" } },
        { prop: "b", label: "B", itemRender: { name: "ElInput" } },
      ],
    });
    await flushPromises();
    const vm = wrapper.vm;
    // 映射中应包含两个字段的实例
    expect(vm.formItemRefs.a).toBeTruthy();
    expect(vm.formItemRefs.b).toBeTruthy();
    // getFormItem 按 prop 取实例
    const itemA = vm.getFormItem("a");
    expect(itemA).toBe(vm.formItemRefs.a);
    // 实例应具备 el-form-item 的全部 expose
    expect(typeof itemA.clearValidate).toBe("function");
    expect(typeof itemA.resetField).toBe("function");
    expect(typeof itemA.setInitialValue).toBe("function");
    expect(typeof itemA.validate).toBe("function");
    expect(itemA.validateState).toBeDefined();
    expect(itemA.validateMessage).toBeDefined();
    // 不存在的 prop 返回 undefined
    expect(vm.getFormItem("not-exist")).toBeUndefined();
  });

  it("el-form 事件透传：validate 事件（含自定义事件）经 attrs 到达 el-form", async () => {
    const onValidate = vi.fn();
    const onCustom = vi.fn();
    const wrapper = mountFormPro({
      modelValue: { a: "" },
      items: [{ prop: "a", label: "A" }],
      onValidate,
      onCustom,
    });
    await flushPromises();
    const elForm = wrapper.findComponent({ name: "ElForm" });
    // 触发 el-form 的 validate 事件应冒泡到父级传入的监听器
    elForm.vm.$emit("validate", "a", true, "");
    expect(onValidate).toHaveBeenCalledWith("a", true, "");
    // 自定义事件同样经 attrs 透传
    elForm.vm.$emit("custom", "payload");
    expect(onCustom).toHaveBeenCalledWith("payload");
  });

  it("标题冒号 titleColon：表单级开启 + 项级覆盖", async () => {
    const wrapper = mountFormPro({
      modelValue: { a: "", b: "" },
      titleColon: true,
      items: [
        { prop: "a", label: "A" },
        { prop: "b", label: "B", titleColon: false },
      ],
    });
    await flushPromises();
    const labels = wrapper.findAll(".form-pro__title");
    expect(labels[0].text()).toContain(":");
    expect(labels[1].text()).not.toContain(":");
  });

  it("标题加粗 titleBold：font-weight 生效", async () => {
    const wrapper = mountFormPro({
      modelValue: { a: "" },
      items: [{ prop: "a", label: "A", titleBold: true }],
    });
    await flushPromises();
    const content = wrapper.find(".form-pro__title-content");
    expect(content.attributes("style")).toContain("font-weight: 700");
  });

  it("标题溢出隐藏 titleOverflow：ellipsis 样式生效", async () => {
    const wrapper = mountFormPro({
      modelValue: { a: "" },
      items: [{ prop: "a", label: "A", titleOverflow: "ellipsis" }],
    });
    await flushPromises();
    const content = wrapper.find(".form-pro__title-content");
    const style = content.attributes("style") || "";
    expect(style).toContain("text-overflow: ellipsis");
    expect(style).toContain("white-space: nowrap");
  });

  it("标题前/后缀图标 titlePrefix / titleSuffix 渲染", async () => {
    const wrapper = mountFormPro({
      modelValue: { a: "" },
      items: [
        {
          prop: "a",
          label: "A",
          titlePrefix: ElementPlusIconsVue.InfoFilled,
          titleSuffix: ElementPlusIconsVue.Warning,
          titlePrefixTip: "提示信息",
        },
      ],
    });
    await flushPromises();
    expect(wrapper.find(".form-pro__title-prefix").exists()).toBe(true);
    expect(wrapper.find(".form-pro__title-suffix").exists()).toBe(true);
    expect(wrapper.findAll(".form-pro__title-icon").length).toBe(2);
  });

  it("折叠表单 folding + collapseNode：默认收起，点击展开/收起切换", async () => {
    const wrapper = mountFormPro({
      modelValue: { a: "", b: "", c: "" },
      items: [
        { prop: "a", label: "A" },
        { prop: "b", label: "B", folding: true },
        { prop: "c", label: "C", folding: true },
        { collapseNode: true, span: 24 },
      ],
    });
    await flushPromises();
    // 默认收起：仅 A 可见
    let labels = wrapper.findAllComponents({ name: "ElFormItem" }).map((i) => i.props("label"));
    expect(labels).toEqual(["A"]);
    const btn = wrapper.find(".form-pro__collapse-btn");
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain("展开");
    // 点击展开
    await btn.trigger("click");
    await flushPromises();
    labels = wrapper.findAllComponents({ name: "ElFormItem" }).map((i) => i.props("label"));
    expect(labels).toEqual(["A", "B", "C"]);
    expect(wrapper.find(".form-pro__collapse-btn").text()).toContain("收起");
  });

  it("分组不渲染多余的单组「展开/收起」按钮：折叠由标题区点击承载", async () => {
    const wrapper = mountFormPro({
      modelValue: {},
      items: [
        { group: true, title: "分组1" },
        { prop: "a", label: "A" },
      ],
    });
    await flushPromises();
    // 单组「展开/收起」按钮已移除（点击标题区即可折叠，按钮多余）
    expect(wrapper.find(".form-pro__group-toggle").exists()).toBe(false);
    // 标题区仍可点击切换折叠
    const header = wrapper.find(".form-pro__group-header-main");
    expect(header.exists()).toBe(true);
    expect(wrapper.findAllComponents({ name: "ElFormItem" }).length).toBe(1);
    await header.trigger("click");
    await flushPromises();
    expect(wrapper.findAllComponents({ name: "ElFormItem" }).length).toBe(0);
  });

  it("分组 collapsible:false：不显示折叠按钮且恒展开（忽略 fold）", async () => {
    const wrapper = mountFormPro({
      modelValue: {},
      items: [
        { group: true, title: "分组1", fold: true, collapsible: false },
        { prop: "a", label: "A" },
      ],
    });
    await flushPromises();
    expect(wrapper.find(".form-pro__group-toggle").exists()).toBe(false);
    expect(wrapper.find(".form-pro__group-header.is-static").exists()).toBe(true);
    // 恒展开：组内项仍渲染
    expect(wrapper.findAllComponents({ name: "ElFormItem" }).length).toBe(1);
  });

  it("暴露分组动态折叠方法：toggleGroup / collapseAllGroups / expandAllGroups / setGroupCollapsed", async () => {
    const wrapper = mountFormPro({
      modelValue: {},
      items: [
        { group: true, title: "G1" },
        { prop: "a", label: "A" },
        { group: true, title: "G2" },
        { prop: "b", label: "B" },
      ],
    });
    await flushPromises();
    const vm = wrapper.vm;
    const countItems = () => wrapper.findAllComponents({ name: "ElFormItem" }).length;
    expect(typeof vm.toggleGroup).toBe("function");
    expect(typeof vm.setGroupCollapsed).toBe("function");
    expect(typeof vm.setGroupsCollapsed).toBe("function");
    expect(typeof vm.collapseAllGroups).toBe("function");
    expect(typeof vm.expandAllGroups).toBe("function");
    // 默认都展开 → 2 项
    expect(countItems()).toBe(2);
    // 收起全部
    vm.collapseAllGroups();
    await flushPromises();
    expect(countItems()).toBe(0);
    // 展开全部
    vm.expandAllGroups();
    await flushPromises();
    expect(countItems()).toBe(2);
    // 折叠单个分组
    vm.setGroupCollapsed("G1", true);
    await flushPromises();
    expect(countItems()).toBe(1);
    // 切换 G1 → 展开
    vm.toggleGroup("G1");
    await flushPromises();
    expect(countItems()).toBe(2);
    // 批量折叠多个
    vm.setGroupsCollapsed(["G1", "G2"], true);
    await flushPromises();
    expect(countItems()).toBe(0);
  });

  it("分组 allToggle：显示「折叠全部 / 展开全部」按钮，点击切换全部分组", async () => {
    const wrapper = mountFormPro({
      modelValue: {},
      items: [
        { group: true, title: "G1", allToggle: true },
        { prop: "a", label: "A" },
        { group: true, title: "G2" },
        { prop: "b", label: "B" },
      ],
    });
    await flushPromises();
    const countItems = () => wrapper.findAllComponents({ name: "ElFormItem" }).length;
    const allToggle = wrapper.find(".form-pro__group-toggle-all");
    expect(allToggle.exists()).toBe(true);
    // 默认未全折叠 → 文案「折叠全部」
    expect(allToggle.text()).toContain("折叠全部");
    expect(countItems()).toBe(2);
    // 点击 → 全部折叠
    await allToggle.trigger("click");
    await flushPromises();
    expect(countItems()).toBe(0);
    expect(allToggle.text()).toContain("展开全部");
    // 再次点击 → 全部展开
    await allToggle.trigger("click");
    await flushPromises();
    expect(countItems()).toBe(2);
    // 暴露方法 toggleAllGroups 等价
    expect(typeof wrapper.vm.toggleAllGroups).toBe("function");
  });

  it("分组标题扩展区 render：在标题与右侧按钮之间渲染 JSX 内容", async () => {
    const wrapper = mountFormPro({
      modelValue: { a: "" },
      items: [
        {
          group: true,
          title: "G1",
          allToggle: true,
          render: (h) => h("span", { class: "group-tip-render" }, "提示信息"),
        },
        { prop: "a", label: "A" },
      ],
    });
    await flushPromises();
    const extra = wrapper.find(".form-pro__group-header-extra");
    expect(extra.exists()).toBe(true);
    expect(extra.text()).toContain("提示信息");
    // 扩展区位于「标题区」与「allToggle 按钮」之间（DOM 顺序）
    const header = wrapper.find(".form-pro__group-header");
    const children = [...header.element.children].map((el) => el.className);
    const mainIdx = children.findIndex((c) => c.includes("form-pro__group-header-main"));
    const extraIdx = children.findIndex((c) => c.includes("form-pro__group-header-extra"));
    const toggleIdx = children.findIndex((c) => c.includes("form-pro__group-toggle-all"));
    expect(mainIdx).toBeGreaterThanOrEqual(0);
    expect(extraIdx).toBeGreaterThan(mainIdx);
    expect(toggleIdx).toBeGreaterThan(extraIdx);
  });

  it("分组标题扩展区 slot：用具名插槽渲染内容，且点击不触发分组折叠", async () => {
    const wrapper = mountFormPro(
      {
        modelValue: {},
        items: [
          { group: true, title: "G1", fold: true, slot: "g1Tip" },
          { prop: "a", label: "A" },
        ],
      },
      {
        slots: {
          g1Tip: () => h("span", { class: "group-tip-slot" }, "插槽提示"),
        },
      },
    );
    await flushPromises();
    // 默认折叠 → 无表单项
    expect(wrapper.findAllComponents({ name: "ElFormItem" }).length).toBe(0);
    const extra = wrapper.find(".form-pro__group-header-extra");
    expect(extra.exists()).toBe(true);
    expect(extra.text()).toContain("插槽提示");
    // 点击扩展区不应触发分组折叠（仍为折叠态，表单项数不变）
    await extra.trigger("click");
    await flushPromises();
    expect(wrapper.findAllComponents({ name: "ElFormItem" }).length).toBe(0);
    // 点击标题区才展开
    await wrapper.find(".form-pro__group-header-main").trigger("click");
    await flushPromises();
    expect(wrapper.findAllComponents({ name: "ElFormItem" }).length).toBe(1);
  });

  it("removeHiddenValues：v-model 回抛排除 visible/visibleMethod 隐藏字段的值", async () => {
    const formData = ref({ a: "1", b: "2", c: "3" });
    const wrapper = mount(
      {
        components: { FormPro },
        setup: () => ({ formData }),
        template: `<FormPro v-model="formData" :remove-hidden-values="true" :items="[
          { prop: 'a', label: 'A', itemRender: { name: 'ElInput' } },
          { prop: 'b', label: 'B', visible: false },
          { prop: 'c', label: 'C', visibleMethod: (d) => d.a === 'show' }
        ]" />`,
      },
      { global: globalConfig },
    );
    await flushPromises();
    // b（visible:false）与 c（a≠show → 隐藏）的值应被移除
    expect(formData.value).not.toHaveProperty("b");
    expect(formData.value).not.toHaveProperty("c");
    expect(formData.value.a).toBe("1");
  });

  it("removeHiddenValues：onlyRequired 隐藏的字段值不受影响（保留）", async () => {
    const formData = ref({ a: "1", b: "2" });
    const wrapper = mount(
      {
        components: { FormPro },
        setup: () => ({ formData }),
        template: `<FormPro v-model="formData" :remove-hidden-values="true" :only-required="true" :items="[
          { prop: 'a', label: 'A', required: true },
          { prop: 'b', label: 'B' }
        ]" />`,
      },
      { global: globalConfig },
    );
    await flushPromises();
    // b 因 onlyRequired 被隐藏，但其值应保留（removeHiddenValues 不涉及 onlyRequired）
    expect(formData.value.b).toBe("2");
    expect(formData.value.a).toBe("1");
  });

  it("getSubmitData：暴露方法返回已移除隐藏值的提交数据", async () => {
    const wrapper = mountFormPro({
      modelValue: { a: "1", b: "2" },
      removeHiddenValues: true,
      items: [
        { prop: "a", label: "A" },
        { prop: "b", label: "B", visible: false },
      ],
    });
    await flushPromises();
    const vm = wrapper.vm;
    expect(typeof vm.getSubmitData).toBe("function");
    const submit = vm.getSubmitData();
    expect(submit).toEqual({ a: "1" });
    expect(submit).not.toHaveProperty("b");
    // 内部 formData 仍保留 b（渲染层数据完整，仅提交时过滤）
    expect(vm.formData.b).toBe("2");
  });

  it("removeHiddenValues 关闭时：getSubmitData 与 v-model 均保留隐藏字段值", async () => {
    const wrapper = mountFormPro({
      modelValue: { a: "1", b: "2" },
      removeHiddenValues: false,
      items: [
        { prop: "a", label: "A" },
        { prop: "b", label: "B", visible: false },
      ],
    });
    await flushPromises();
    expect(wrapper.vm.getSubmitData()).toEqual({ a: "1", b: "2" });
  });
});

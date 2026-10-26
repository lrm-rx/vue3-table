// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
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

  it("mutableModel 兼容 reactive 承载：原地合并写入，不 emit update:modelValue", async () => {
    const formData = reactive({ name: "张三" });
    const onUpdate = vi.fn();
    const wrapper = mountFormPro({
      modelValue: formData,
      mutableModel: true,
      "onUpdate:modelValue": onUpdate,
      items: [
        { prop: "name", label: "名称", itemRender: { name: "ElInput" } },
      ],
    });
    await flushPromises();
    await wrapper.find("input").setValue("李四");
    await flushPromises();
    // 原地写入：同一 reactive 代理被直接更新
    expect(formData.name).toBe("李四");
    // 不 emit：父级无需（也不能用 v-model）接收 update:modelValue
    expect(onUpdate).not.toHaveBeenCalled();
    // 父级原地直写仍能同步进内部控件（既有深 watch 路径不受影响）
    formData.name = "王五";
    await flushPromises();
    expect(wrapper.find("input").element.value).toBe("王五");
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

  it("重复分组标题：折叠状态互不影响（按 block 索引隔离）", async () => {
    const wrapper = mountFormPro({
      modelValue: {},
      items: [
        { group: true, title: "G" },
        { prop: "a", label: "A" },
        { group: true, title: "G" },
        { prop: "b", label: "B" },
      ],
    });
    await flushPromises();
    // 两个分组各自渲染一个 header（v-for key 不碰撞）
    const headers = wrapper.findAll(".form-pro__group-header-main");
    expect(headers.length).toBe(2);
    // 默认都展开 → 2 个表单项
    expect(wrapper.findAllComponents({ name: "ElFormItem" }).length).toBe(2);
    // 折叠第一个分组：只影响第一个
    await headers[0].trigger("click");
    await flushPromises();
    // 只剩 B（第二个分组的项）
    expect(wrapper.findAllComponents({ name: "ElFormItem" }).map((i) => i.props("label"))).toEqual(["B"]);
  });

  it("JSX 渲染：item.render(ctx, h) 产出控件", async () => {
    const wrapper = mountFormPro({
      modelValue: { name: "jsx-val" },
      items: [
        {
          prop: "name",
          label: "名称",
          render: (ctx, h) => h("div", { class: "custom-jsx" }, `值=${ctx.value}`),
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
          { render: (ctx, h) => h("div", { class: "insert-render" }, "插入内容") },
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

  // 回归：removeHiddenValues + 字段显隐切换时，隐藏字段已输入的值不应丢失
  it("removeHiddenValues 开启时隐藏字段值不被重置（保留用户输入）", async () => {
    const formData = ref({ type: "company", company: "ACME" });
    const wrapper = mount(
      {
        components: { FormPro },
        setup: () => ({ formData }),
        template: `<FormPro v-model="formData" :remove-hidden-values="true" :items="items" />`,
        data() {
          return {
            items: [
              {
                prop: "type",
                label: "类型",
                itemRender: {
                  name: "ElSelect",
                  options: [
                    { label: "企业", value: "company" },
                    { label: "个人", value: "personal" },
                  ],
                },
              },
              {
                prop: "company",
                label: "公司",
                visibleMethod: (d) => d.type === "company",
                itemRender: { name: "ElInput" },
              },
            ],
          };
        },
      },
      { global: globalConfig },
    );
    await flushPromises();
    const fp = wrapper.findComponent({ name: "FormPro" });
    expect(fp.vm.formData.company).toBe("ACME");
    // 切到 personal → company 隐藏
    formData.value.type = "personal";
    await flushPromises();
    expect(fp.vm.formData.company).toBe("ACME"); // 内部值保留，未被重置为 ""
    expect(formData.value.company).toBeUndefined(); // 父级 v-model 不含隐藏值
    // 切回 company → 值应仍在
    formData.value.type = "company";
    await flushPromises();
    expect(fp.vm.formData.company).toBe("ACME");
    expect(formData.value.company).toBe("ACME");
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

  it("表单级 title-bold：统一加粗全部 label", async () => {
    const wrapper = mountFormPro({
      modelValue: { a: "", b: "" },
      titleBold: true,
      items: [
        { prop: "a", label: "A" },
        { prop: "b", label: "B" },
      ],
    });
    await flushPromises();
    const contents = wrapper.findAll(".form-pro__title-content");
    expect(contents.length).toBe(2);
    contents.forEach((c) =>
      expect(c.attributes("style")).toContain("font-weight: 700"),
    );
  });

  it("项级 titleBold 优先级高于表单级：false 可覆盖表单级 true，true 可覆盖表单级 false", async () => {
    const wrapper = mountFormPro({
      modelValue: { a: "", b: "", c: "", d: "" },
      titleBold: true,
      items: [
        { prop: "a", label: "A", titleBold: false }, // 项级覆盖 → 不加粗
        { prop: "b", label: "B", titleBold: true }, // 项级覆盖 → 加粗
        { prop: "c", label: "C" }, // 跟随表单级 → 加粗
        { prop: "d", label: "D" },
      ],
    });
    await flushPromises();
    const contents = wrapper.findAll(".form-pro__title-content");
    expect(contents.length).toBe(4);
    expect(contents[0].attributes("style") || "").not.toContain("font-weight: 700");
    expect(contents[1].attributes("style")).toContain("font-weight: 700");
    expect(contents[2].attributes("style")).toContain("font-weight: 700");

    // 反向：表单级 false，项级 true 仍生效
    const wrapper2 = mountFormPro({
      modelValue: { d: "" },
      titleBold: false,
      items: [{ prop: "d", label: "D", titleBold: true }],
    });
    await flushPromises();
    expect(
      wrapper2.find(".form-pro__title-content").attributes("style"),
    ).toContain("font-weight: 700");
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

  it("分组标题 titleStyle：颜色/字号等自定义样式内联生效", async () => {
    const wrapper = mountFormPro({
      modelValue: {},
      items: [
        {
          group: true,
          title: "样式分组",
          titleStyle: { color: "rgb(64, 158, 255)", fontSize: "15px" },
        },
        { prop: "a", label: "A" },
      ],
    });
    await flushPromises();
    const title = wrapper.find(".form-pro__group-title");
    expect(title.exists()).toBe(true);
    const style = title.attributes("style") || "";
    expect(style).toContain("color: rgb(64, 158, 255)");
    expect(style).toContain("font-size: 15px");
  });

  it("分组标题 titleBold：true → 700，false → 400，未设置 → 无内联字重（继承 CSS 600）", async () => {
    const wrapper = mountFormPro({
      modelValue: {},
      items: [
        { group: true, title: "G-bold", titleBold: true },
        { prop: "a", label: "A" },
        { group: true, title: "G-normal", titleBold: false },
        { prop: "b", label: "B" },
        { group: true, title: "G-default" },
        { prop: "c", label: "C" },
      ],
    });
    await flushPromises();
    const titles = wrapper.findAll(".form-pro__group-title");
    expect(titles.length).toBe(3);
    expect(titles[0].attributes("style")).toContain("font-weight: 700");
    expect(titles[1].attributes("style")).toContain("font-weight: 400");
    // 未设置 titleBold：无内联 font-weight（继承 CSS 默认 600）
    expect(titles[2].attributes("style") || "").not.toContain("font-weight");
  });

  it("占位项：空对象 {} 渲染为空 el-col（无 ElFormItem），占据默认 span；{ span } 指定宽度", async () => {
    const wrapper = mountFormPro({
      modelValue: {},
      columns: 3, // 默认 span = 8
      items: [
        { prop: "a", label: "A" },
        {}, // 占位：占一个默认 span(8)
        { prop: "b", label: "B" },
        { span: 16 }, // 占位：指定宽度 16
        { prop: "c", label: "C" },
      ],
    });
    await flushPromises();
    // 字段项正常渲染（占位项不产生 ElFormItem）
    const labels = wrapper
      .findAllComponents({ name: "ElFormItem" })
      .map((i) => i.props("label"));
    expect(labels).toEqual(["A", "B", "C"]);
    // el-col 共 5 个：3 字段 + 2 占位；占位 col 内部为空
    const cols = wrapper.findAllComponents({ name: "ElCol" });
    expect(cols.length).toBe(5);
    expect(cols.map((c) => c.props("span"))).toEqual([8, 8, 8, 16, 8]);
    expect(cols[1].findComponent({ name: "ElFormItem" }).exists()).toBe(false);
    expect(cols[3].findComponent({ name: "ElFormItem" }).exists()).toBe(false);
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
          render: (ctx, h) => h("span", { class: "group-tip-render" }, "提示信息"),
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

  // —— 边框表格样式（border）——
  // 修复背景：border 模式下 el-form 根节点追加 .form-pro--border 类，
  // 全部边框/单元格样式（含「错误提示不被裁切」的流式占位样式）均限定在该类作用域内。
  describe("边框表格样式 border", () => {
    it("默认（border=false）不渲染 .form-pro--border 根类", async () => {
      const wrapper = mountFormPro({
        modelValue: { a: "" },
        items: [{ prop: "a", label: "A" }],
      });
      await flushPromises();
      expect(wrapper.find(".form-pro--border").exists()).toBe(false);
    });

    it("border=true：el-form 根节点带 .form-pro--border 类", async () => {
      const wrapper = mountFormPro({
        modelValue: { a: "" },
        border: true,
        items: [{ prop: "a", label: "A" }],
      });
      await flushPromises();
      const elForm = wrapper.findComponent({ name: "ElForm" });
      expect(elForm.classes()).toContain("form-pro--border");
      // 切换为 false → 类移除（向后兼容，恢复原外观）
      await wrapper.setProps({ border: false });
      await flushPromises();
      expect(wrapper.find(".form-pro--border").exists()).toBe(false);
    });

    it("border 不泄漏到内部 el-form（已被 OWN_PROPS 剥离）", async () => {
      const wrapper = mountFormPro({
        modelValue: { a: "" },
        border: true,
        items: [{ prop: "a", label: "A" }],
      });
      await flushPromises();
      const elForm = wrapper.findComponent({ name: "ElForm" });
      // el-form 自身无 border 属性，避免被当作未知属性透传
      expect(elForm.props("border")).toBeUndefined();
    });

    it("边框模式下校验失败：错误提示仍完整渲染（回归：提示不被裁切/丢失）", async () => {
      // 说明：Element Plus 的字段校验在当前 jsdom 环境下状态会卡在 validating、
      // 不渲染 .el-form-item__error（裸 ElForm 亦如此，与 FormPro 无关），
      // 且组件 <style scoped> 不会注入 document.styleSheets。
      // 因此「错误提示不被裁切」的修复以「源码契约 + 结构契约」两层守护：
      //   ① 源码契约（本用例）：修复样式必须存在于 index.vue 的 .form-pro--border 作用域内；
      //   ② 结构契约（见下用例）：border 根类存在，确保该作用域样式确实命中渲染树。
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const src = readFileSync(
        resolve(process.cwd(), "src/components/formPro/index.vue"),
        "utf-8",
      );
      // 修复核心：错误提示由绝对定位（溢出单元格被裁切）改为单元格内流式占位
      expect(src).toMatch(/\.form-pro--border[\s\S]*?\.el-form-item__error[\s\S]*?position:\s*relative/);
      // 填写提示 tip 同步改为流式占位，避免同样被裁切
      expect(src).toMatch(/\.form-pro--border[\s\S]*?\.form-pro__field-tip[\s\S]*?position:\s*relative/);
      // 容器 overflow:hidden（圆角裁剪）仍保留——修复是「让提示在单元格内占位」而非移除裁剪
      expect(src).toMatch(/\.form-pro--border[\s\S]*?overflow:\s*hidden/);
    });

    it("边框模式结构契约：根类 + 单元格内容区存在，作用域样式可命中渲染树", async () => {
      const wrapper = mountFormPro({
        modelValue: { name: "" },
        border: true,
        items: [
          { prop: "name", label: "姓名", required: true, itemRender: { name: "ElInput" } },
        ],
      });
      await flushPromises();
      // 根类存在 → .form-pro--border 作用域样式生效
      expect(wrapper.find(".form-pro--border").exists()).toBe(true);
      // 表单项内容区存在 → 错误/提示占位样式的命中目标在渲染树中
      const content = wrapper.find(".el-form-item__content");
      expect(content.exists()).toBe(true);
      // 内容区从属于带边框根类（样式作用域命中链成立）
      expect(wrapper.find(".form-pro--border").element.contains(content.element)).toBe(true);
    });

    it("边框模式下 tip 填写提示仍渲染（同属单元格内占位，回归守护）", async () => {
      const wrapper = mountFormPro({
        modelValue: { name: "" },
        border: true,
        items: [
          {
            prop: "name",
            label: "姓名",
            tip: "请输入真实姓名",
            itemRender: { name: "ElInput" },
          },
        ],
      });
      await flushPromises();
      const tip = wrapper.find(".form-pro__field-tip");
      expect(tip.exists()).toBe(true);
      expect(tip.text()).toContain("请输入真实姓名");
    });
  });

  // ===================== 运行时动态配置：实例方法增删改 items =====================
  describe("运行时动态配置：addItems / removeItems / updateItems", () => {
    const dynamicItems = () => [
      { prop: "name", label: "姓名", itemRender: { name: "ElInput" } },
      { prop: "age", label: "年龄", itemRender: { name: "ElInputNumber" } },
      { prop: "enabled", label: "启用", itemRender: { name: "ElSwitch" } },
    ];
    const labels = (w) =>
      w.findAllComponents({ name: "ElFormItem" }).map((i) => i.props("label"));

    it("实例上暴露 addItems / removeItems / updateItems 三个方法", () => {
      const wrapper = mountFormPro({ modelValue: {}, items: dynamicItems() });
      expect(typeof wrapper.vm.addItems).toBe("function");
      expect(typeof wrapper.vm.removeItems).toBe("function");
      expect(typeof wrapper.vm.updateItems).toBe("function");
    });

    it("addItems：单个插入到锚点后立即渲染，formData 自动补全空默认值", async () => {
      const wrapper = mountFormPro({
        modelValue: { name: "张三" },
        items: dynamicItems(),
      });
      await flushPromises();
      wrapper.vm.addItems(
        { prop: "phone", label: "电话", itemRender: { name: "ElInput" } },
        { after: "name" },
      );
      await flushPromises();
      expect(labels(wrapper)).toEqual(["姓名", "电话", "年龄", "启用"]);
      // autoFillDefaults 立即补值，无需等 watcher
      expect(wrapper.vm.formData.phone).toBe("");
    });

    it("addItems：批量插入保持顺序；Switch 推导默认 false", async () => {
      const wrapper = mountFormPro({
        modelValue: {},
        items: dynamicItems(),
      });
      await flushPromises();
      wrapper.vm.addItems([
        { prop: "city", label: "城市", itemRender: { name: "ElInput" } },
        { prop: "notify", label: "通知", itemRender: { name: "ElSwitch" } },
      ]);
      await flushPromises();
      expect(labels(wrapper).slice(-2)).toEqual(["城市", "通知"]);
      expect(wrapper.vm.formData.city).toBe("");
      expect(wrapper.vm.formData.notify).toBe(false);
    });

    it("removeItems：单个删除后 DOM 移除，formData 键同步清理", async () => {
      const wrapper = mountFormPro({
        modelValue: { name: "张三", age: 28 },
        items: dynamicItems(),
      });
      await flushPromises();
      expect("age" in wrapper.vm.formData).toBe(true);
      const removed = wrapper.vm.removeItems("age");
      expect(removed).toHaveLength(1);
      await flushPromises();
      expect(labels(wrapper)).toEqual(["姓名", "启用"]);
      expect("age" in wrapper.vm.formData).toBe(false);
    });

    it("removeItems：批量 prop 删除多项", async () => {
      const wrapper = mountFormPro({
        modelValue: { name: "x", age: 1, enabled: true },
        items: dynamicItems(),
      });
      await flushPromises();
      const removed = wrapper.vm.removeItems(["age", "enabled"]);
      expect(removed.map((i) => i.prop)).toEqual(["age", "enabled"]);
      await flushPromises();
      expect(labels(wrapper)).toEqual(["姓名"]);
      expect(wrapper.vm.formData).not.toHaveProperty("age");
      expect(wrapper.vm.formData).not.toHaveProperty("enabled");
    });

    it("updateItems：点路径禁用控件（itemRender.props.disabled）", async () => {
      const wrapper = mountFormPro({
        modelValue: { name: "" },
        items: dynamicItems(),
      });
      await flushPromises();
      const input = () => wrapper.findAll("input")[0];
      expect(input().attributes("disabled")).toBeUndefined();
      wrapper.vm.updateItems("name", { "itemRender.props.disabled": true });
      await flushPromises();
      expect(input().attributes("disabled")).toBeDefined();
      // 兄弟 props 不被点路径深设破坏
      const nameItem = wrapper.props("items")[0];
      expect(nameItem.itemRender.name).toBe("ElInput");
    });

    it("updateItems：visible=false 隐藏字段，后续项自动回流", async () => {
      const wrapper = mountFormPro({
        modelValue: {},
        items: dynamicItems(),
      });
      await flushPromises();
      wrapper.vm.updateItems("age", { visible: false });
      await flushPromises();
      expect(labels(wrapper)).toEqual(["姓名", "启用"]);
    });

    it("updateItems：批量点路径一次禁用多个控件，未命中项不受影响", async () => {
      const wrapper = mountFormPro({
        modelValue: { name: "", phone: "", addr: "" },
        items: [
          { prop: "name", label: "姓名", itemRender: { name: "ElInput" } },
          { prop: "phone", label: "电话", itemRender: { name: "ElInput" } },
          { prop: "addr", label: "地址", itemRender: { name: "ElInput" } },
        ],
      });
      await flushPromises();
      const disabledCount = () =>
        wrapper
          .findAll("input")
          .filter((i) => i.attributes("disabled") !== undefined).length;
      expect(disabledCount()).toBe(0);
      wrapper.vm.updateItems(["name", "phone"], {
        "itemRender.props.disabled": true,
      });
      await flushPromises();
      expect(disabledCount()).toBe(2);
      // 批量恢复
      wrapper.vm.updateItems(["name", "phone"], {
        "itemRender.props.disabled": false,
      });
      await flushPromises();
      expect(disabledCount()).toBe(0);
    });

    it("updateItems：批量 visible=false 一次隐藏多项，恢复后顺序不变", async () => {
      const wrapper = mountFormPro({
        modelValue: {},
        items: dynamicItems(),
      });
      await flushPromises();
      wrapper.vm.updateItems(["name", "enabled"], { visible: false });
      await flushPromises();
      expect(labels(wrapper)).toEqual(["年龄"]);
      wrapper.vm.updateItems(["name", "enabled"], { visible: true });
      await flushPromises();
      expect(labels(wrapper)).toEqual(["姓名", "年龄", "启用"]);
    });

    it("updateItems：异步返回后整体替换 select 的 options（模拟接口耗时不确定）", async () => {
      const wrapper = mountFormPro({
        modelValue: { city: "" },
        items: [
          {
            prop: "city",
            label: "城市",
            itemRender: { name: "ElSelect", options: [] },
          },
        ],
      });
      await flushPromises();
      expect(wrapper.findAllComponents({ name: "ElOption" })).toHaveLength(0);
      // 模拟接口稍后返回：直接写入配置即可，无需 ref 中转
      const remoteOptions = [
        { label: "广州", value: "gz" },
        { label: "深圳", value: "sz" },
      ];
      wrapper.vm.updateItems("city", { "itemRender.options": remoteOptions });
      await flushPromises();
      const opts = wrapper.findAllComponents({ name: "ElOption" });
      expect(opts).toHaveLength(2);
      expect(opts[0].props("label")).toBe("广州");
    });
  });

  // ===================== 同 tick 父子数据竞态（三方合并，父级免 nextTick） =====================
  describe("同 tick 父子数据竞态（三方合并）", () => {
    // 复现 FormProDemo 资源组联动场景：子级 setField 触发 change 的同一 tick 内，
    // 父级直接改 formData + updateItems——父级修改不应被子级待发出的 emit 覆盖。
    it("子级 change 事件内父级清空另一字段 + updateItems：父级修改不丢失（免 nextTick）", async () => {
      const formData = ref({ group: "A", resource: "A-r1" });
      const items = ref([
        {
          prop: "group",
          label: "资源组",
          itemRender: {
            name: "ElSelect",
            options: [
              { label: "A 组", value: "A" },
              { label: "B 组", value: "B" },
            ],
            events: {
              change: () => {
                formData.value.resource = "";
                fp.vm.updateItems("resource", {
                  "itemRender.props.loading": true,
                  "itemRender.options": [],
                });
              },
            },
          },
        },
        {
          prop: "resource",
          label: "资源",
          itemRender: {
            name: "ElSelect",
            options: [{ label: "A 组-资源 1", value: "A-r1" }],
          },
        },
      ]);
      const wrapper = mount(
        {
          components: { FormPro },
          setup: () => ({ formData, items }),
          template: `<FormPro ref="fp" v-model="formData" :items="items" />`,
        },
        { global: globalConfig },
      );
      await flushPromises();
      const fp = wrapper.findComponent({ name: "FormPro" });
      // 模拟用户选择「B 组」：子级 setField + change 事件同步触发（同一 tick）
      fp.vm.formData.group = "B";
      items.value[0].itemRender.events.change("B");
      await flushPromises();
      expect(formData.value.group).toBe("B");
      expect(formData.value.resource).toBe(""); // 修复前：被在途 emit 覆盖回 "A-r1"
      expect(fp.vm.formData.resource).toBe("");
      // updateItems 的改动同步生效（loading）
      expect(items.value[1].itemRender.props.loading).toBe(true);
      expect(items.value[1].itemRender.options).toEqual([]);
    });

    it("同 tick 子级改 x、父级改 y：两侧修改都保留（互不覆盖）", async () => {
      const formData = ref({ x: "x0", y: "y0" });
      const items = ref([
        { prop: "x", label: "X", itemRender: { name: "ElInput" } },
        { prop: "y", label: "Y", itemRender: { name: "ElInput" } },
      ]);
      const wrapper = mount(
        {
          components: { FormPro },
          setup: () => ({ formData, items }),
          template: `<FormPro ref="fp" v-model="formData" :items="items" />`,
        },
        { global: globalConfig },
      );
      await flushPromises();
      const fp = wrapper.findComponent({ name: "FormPro" });
      fp.vm.formData.x = "x1"; // 子级改 x（如用户输入）
      formData.value.y = "y1"; // 同 tick 父级改 y
      await flushPromises();
      expect(formData.value.x).toBe("x1"); // 子级修改不丢
      expect(formData.value.y).toBe("y1"); // 父级修改也不丢
      expect(fp.vm.formData).toMatchObject({ x: "x1", y: "y1" });
    });

    it("父级整体替换 modelValue：父级优先（常用于详情回填）", async () => {
      const formData = ref({ name: "old", age: 1 });
      const items = ref([
        { prop: "name", label: "姓名", itemRender: { name: "ElInput" } },
        { prop: "age", label: "年龄", itemRender: { name: "ElInputNumber" } },
      ]);
      const wrapper = mount(
        {
          components: { FormPro },
          setup: () => ({ formData, items }),
          template: `<FormPro ref="fp" v-model="formData" :items="items" />`,
        },
        { global: globalConfig },
      );
      await flushPromises();
      const fp = wrapper.findComponent({ name: "FormPro" });
      formData.value = { name: "new", age: 30 };
      await flushPromises();
      expect(fp.vm.formData.name).toBe("new");
      expect(fp.vm.formData.age).toBe(30);
    });

    it("removeItems 删除字段后：已删键不被三方合并 resurrect", async () => {
      const formData = ref({ name: "张三", age: 28 });
      const items = ref([
        { prop: "name", label: "姓名", itemRender: { name: "ElInput" } },
        { prop: "age", label: "年龄", itemRender: { name: "ElInputNumber" } },
      ]);
      const wrapper = mount(
        {
          components: { FormPro },
          setup: () => ({ formData, items }),
          template: `<FormPro ref="fp" v-model="formData" :items="items" />`,
        },
        { global: globalConfig },
      );
      await flushPromises();
      const fp = wrapper.findComponent({ name: "FormPro" });
      fp.vm.removeItems("age");
      await flushPromises();
      expect(fp.vm.formData).not.toHaveProperty("age");
      expect(formData.value).not.toHaveProperty("age");
      // 再改其他字段触发回抛，age 也不会复活
      fp.vm.formData.name = "李四";
      await flushPromises();
      expect(fp.vm.formData).not.toHaveProperty("age");
      expect(formData.value).not.toHaveProperty("age");
    });
  });

  // ===================== 动态禁用 / 只读：disabledWhen / readonlyWhen =====================
  describe("disabledWhen / readonlyWhen 动态禁用只读", () => {
    const linkageItems = () => [
      {
        prop: "contact",
        label: "联系人",
        itemRender: { name: "ElInput" },
      },
      {
        prop: "phone",
        label: "电话",
        disabledWhen: (ctx) => !ctx.data.contact,
        itemRender: { name: "ElInput" },
      },
      {
        prop: "note",
        label: "备注",
        readonlyWhen: (ctx) => !ctx.data.contact,
        itemRender: { name: "ElInput" },
      },
    ];
    const inputAt = (w, i) => w.findAll("input")[i];

    it("disabledWhen：依赖字段为空时禁用，填写后自动启用", async () => {
      const wrapper = mountFormPro({ modelValue: {}, items: linkageItems() });
      await flushPromises();
      expect(inputAt(wrapper, 1).attributes("disabled")).toBeDefined();
      // 填写联系人 → 自动启用（render 期求值，无需手动 updateItems）
      wrapper.vm.formData.contact = "张三";
      await flushPromises();
      expect(inputAt(wrapper, 1).attributes("disabled")).toBeUndefined();
      // 清空 → 重新禁用
      wrapper.vm.formData.contact = "";
      await flushPromises();
      expect(inputAt(wrapper, 1).attributes("disabled")).toBeDefined();
    });

    it("readonlyWhen：依赖字段为空时只读，填写后恢复可编辑", async () => {
      const wrapper = mountFormPro({ modelValue: {}, items: linkageItems() });
      await flushPromises();
      expect(inputAt(wrapper, 2).attributes("readonly")).toBeDefined();
      wrapper.vm.formData.contact = "张三";
      await flushPromises();
      expect(inputAt(wrapper, 2).attributes("readonly")).toBeUndefined();
    });

    it("静态 disabled=true 与 disabledWhen 为「或」关系：静态恒禁用", async () => {
      const wrapper = mountFormPro({
        modelValue: { contact: "张三" },
        items: [
          { prop: "contact", label: "联系人", itemRender: { name: "ElInput" } },
          {
            prop: "phone",
            label: "电话",
            disabledWhen: () => false,
            itemRender: { name: "ElInput", props: { disabled: true } },
          },
        ],
      });
      await flushPromises();
      expect(inputAt(wrapper, 1).attributes("disabled")).toBeDefined();
    });
  });

  // ===================== 声明式异步选项：optionsSource =====================
  describe("optionsSource 声明式异步选项", () => {
    // 取第 idx 个 ElSelect 的选项 label（页面内可能有多个 select）
    const optionLabels = (w, idx = 0) =>
      w
        .findAllComponents({ name: "ElSelect" })
        [idx].findAllComponents({ name: "ElOption" })
        .map((o) => o.props("label"));

    it("挂载即拉取一次（immediate）并写入 options", async () => {
      const fetch = vi.fn(async () => [
        { label: "甲", value: "a" },
        { label: "乙", value: "b" },
      ]);
      const wrapper = mountFormPro({
        modelValue: {},
        items: [
          {
            prop: "target",
            label: "目标",
            itemRender: { name: "ElSelect" },
            optionsSource: { deps: [], fetch },
          },
        ],
      });
      await flushPromises();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(optionLabels(wrapper)).toEqual(["甲", "乙"]);
      // 加载完成后 loading 复位
      expect(wrapper.props("items")[0].itemRender.props.loading).toBe(false);
    });

    it("依赖变化：先同步清空本字段值（联动父级），再 loading 拉取新选项", async () => {
      const formData = ref({ group: "A", resource: "A-r1" });
      let resolveFetch;
      const fetch = vi.fn(
        () => new Promise((r) => (resolveFetch = r)),
      );
      const items = ref([
        {
          prop: "group",
          label: "资源组",
          itemRender: {
            name: "ElSelect",
            options: [
              { label: "A 组", value: "A" },
              { label: "B 组", value: "B" },
            ],
          },
        },
        {
          prop: "resource",
          label: "资源",
          itemRender: { name: "ElSelect", options: [] },
          optionsSource: {
            deps: ["group"],
            fetch: (ctx) => fetch(ctx.deps[0]),
          },
        },
      ]);
      const wrapper = mount(
        {
          components: { FormPro },
          setup: () => ({ formData, items }),
          template: `<FormPro ref="fp" v-model="formData" :items="items" />`,
        },
        { global: globalConfig },
      );
      await flushPromises();
      expect(fetch).toHaveBeenCalledTimes(1); // 挂载首次
      resolveFetch([{ label: "A 组-资源 1", value: "A-r1" }]);
      await flushPromises();

      // 切换资源组 → 清值 + 重新拉取
      formData.value.group = "B";
      await flushPromises();
      expect(formData.value.resource).toBe(""); // 已同步清空（父级同样拿到空值）
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch).toHaveBeenLastCalledWith("B");
      expect(items.value[1].itemRender.props.loading).toBe(true); // 拉取中 loading

      resolveFetch([{ label: "B 组-资源 1", value: "B-r1" }]);
      await flushPromises();
      expect(optionLabels(wrapper, 1)).toEqual(["B 组-资源 1"]);
      expect(items.value[1].itemRender.props.loading).toBe(false);
    });

    it("防竞态：快速连续切换依赖，过期 fetch 结果被丢弃", async () => {
      const resolvers = [];
      const fetch = vi.fn(() => new Promise((r) => resolvers.push(r)));
      const items = ref([
        { prop: "group", label: "组", itemRender: { name: "ElInput" } },
        {
          prop: "resource",
          label: "资源",
          itemRender: { name: "ElSelect", options: [] },
          optionsSource: { deps: ["group"], fetch },
        },
      ]);
      const wrapper = mountFormPro({ modelValue: {}, items: items.value });
      await flushPromises();
      expect(fetch).toHaveBeenCalledTimes(1);

      const fp = wrapper.vm;
      fp.formData.group = "A";
      await flushPromises();
      fp.formData.group = "B";
      await flushPromises();
      expect(fetch).toHaveBeenCalledTimes(3);

      // 乱序返回：先返回 B（最新），再返回 A（过期）→ A 被丢弃
      resolvers[2]([{ label: "B 资源", value: "b" }]);
      await flushPromises();
      resolvers[1]([{ label: "A 资源", value: "a" }]);
      await flushPromises();
      expect(optionLabels(wrapper)).toEqual(["B 资源"]);
    });

    it("when 不满足：不发请求且清空 options；满足后恢复拉取", async () => {
      const fetch = vi.fn(async () => [{ label: "资源", value: "r" }]);
      const items = ref([
        { prop: "enabled", label: "启用", itemRender: { name: "ElSwitch" } },
        {
          prop: "resource",
          label: "资源",
          itemRender: { name: "ElSelect", options: [] },
          optionsSource: {
            deps: ["enabled"],
            when: (data) => data.enabled === true,
            fetch,
          },
        },
      ]);
      const wrapper = mountFormPro({ modelValue: {}, items: items.value });
      await flushPromises();
      // enabled 默认 false → 不请求
      expect(fetch).not.toHaveBeenCalled();
      expect(items.value[1].itemRender.options).toEqual([]);

      wrapper.vm.formData.enabled = true;
      await flushPromises();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(optionLabels(wrapper)).toEqual(["资源"]);
    });

    it("clearValue=false：依赖变化时保留本字段已选值", async () => {
      const fetch = vi.fn(async () => [{ label: "资源", value: "r" }]);
      const wrapper = mountFormPro({
        modelValue: { group: "A", resource: "keep" },
        items: [
          { prop: "group", label: "组", itemRender: { name: "ElInput" } },
          {
            prop: "resource",
            label: "资源",
            itemRender: { name: "ElSelect", options: [] },
            optionsSource: { deps: ["group"], fetch, clearValue: false },
          },
        ],
      });
      await flushPromises();
      wrapper.vm.formData.group = "B";
      await flushPromises();
      expect(wrapper.vm.formData.resource).toBe("keep");
    });

    it("debounce：窗口期内的连续变化合并为一次请求", async () => {
      const fetch = vi.fn(async () => [{ label: "资源", value: "r" }]);
      const wrapper = mountFormPro({
        modelValue: {},
        items: [
          { prop: "kw", label: "关键词", itemRender: { name: "ElInput" } },
          {
            prop: "resource",
            label: "资源",
            itemRender: { name: "ElSelect", options: [] },
            optionsSource: { deps: ["kw"], fetch, debounce: 30 },
          },
        ],
      });
      await flushPromises();
      expect(fetch).toHaveBeenCalledTimes(1); // 挂载首次
      // 防抖窗口内连续输入
      wrapper.vm.formData.kw = "a";
      await flushPromises();
      wrapper.vm.formData.kw = "ab";
      await flushPromises();
      wrapper.vm.formData.kw = "abc";
      await flushPromises();
      expect(fetch).toHaveBeenCalledTimes(1); // 窗口期内未触发
      await new Promise((r) => setTimeout(r, 60));
      await flushPromises();
      expect(fetch).toHaveBeenCalledTimes(2); // 合并为一次
      expect(fetch.mock.calls[1][0].deps).toEqual(["abc"]);
    });
  });

  // ===================== 紧凑模式 compact =====================
  describe("紧凑模式 compact", () => {
    // jsdom 环境说明：Element Plus 的真实校验链路在本环境无法完成（validateState 卡在
    // validating、不渲染 .el-form-item__error，裸 ElForm 亦如此，与 FormPro 无关）。
    // 因此错误态统一从 @validate 事件 seam 驱动（$emit 到 ElForm）——这正是 FormPro
    // 消费校验结果的唯一入口；el-form-item 的 is-error 状态通过 getFormItem 暴露的
    // validateState / validateMessage 直接构造，与 EP onValidationFailed 的真实时序一致
    // （先置 error 态、再 emit validate(prop, false, message)）。
    const compactItems = () => [
      { prop: "name", label: "姓名", span: 8, itemRender: { name: "ElInput" } },
      { prop: "age", label: "年龄", span: 8, itemRender: { name: "ElInput" } },
      { prop: "city", label: "城市", span: 8, itemRender: { name: "ElInput" }, tip: "请选择常住城市" },
      { prop: "phone", label: "电话", span: 8, itemRender: { name: "ElInput" } },
    ];

    const fail = (wrapper, prop, msg) =>
      wrapper
        .findComponent({ name: "ElForm" })
        .vm.$emit("validate", prop, false, msg || `${prop} 必填`);
    const pass = (wrapper, prop) =>
      wrapper.findComponent({ name: "ElForm" }).vm.$emit("validate", prop, true, "");
    const popper = () => document.body.querySelector(".form-pro__error-popper");
    const popperVisible = () => {
      const el = popper();
      return !!el && el.style.display !== "none";
    };

    afterEach(() => {
      // 清理 teleport 到 body 的 popper 残留，避免跨用例串扰
      document.querySelectorAll(".form-pro__error-popper").forEach((el) => el.remove());
    });

    it("默认关闭：无 form-pro--compact 根类、无间隔收紧类、校验失败不渲染错误 tooltip", async () => {
      const wrapper = mountFormPro({ modelValue: {}, items: compactItems() });
      await flushPromises();
      expect(wrapper.find(".form-pro--compact").exists()).toBe(false);
      expect(wrapper.findAll(".form-pro__col--tight").length).toBe(0);
      fail(wrapper, "name");
      await flushPromises();
      expect(popper()).toBeNull();
      wrapper.unmount();
    });

    it("compact：无 tip 行的项带 form-pro__col--tight；含 tip 行整行不加（含非 tip 邻项）", async () => {
      const wrapper = mountFormPro({
        modelValue: {},
        compact: true,
        items: compactItems(),
      });
      await flushPromises();
      expect(wrapper.find(".form-pro--compact").exists()).toBe(true);
      // 可视行划分：[姓名, 年龄, 城市](8+8+8=24) 为第 0 行（城市配 tip → 整行保持默认间隔），
      // [电话](8) 为第 1 行（无 tip → 收紧）
      const colOf = (label) =>
        wrapper
          .findAllComponents({ name: "ElCol" })
          .find((c) => c.text().includes(label));
      expect(colOf("姓名").classes()).not.toContain("form-pro__col--tight");
      expect(colOf("年龄").classes()).not.toContain("form-pro__col--tight");
      expect(colOf("城市").classes()).not.toContain("form-pro__col--tight");
      expect(colOf("电话").classes()).toContain("form-pro__col--tight");
      wrapper.unmount();
    });

    it("compact：条件显隐回流后行划分自动重算（tip 项隐藏 → 同行其余项转为收紧）", async () => {
      const wrapper = mountFormPro({
        modelValue: {},
        compact: true,
        items: [
          { prop: "a", label: "A", span: 12, itemRender: { name: "ElInput" } },
          { prop: "b", label: "B", span: 12, itemRender: { name: "ElInput" }, tip: "提示B" },
        ],
      });
      await flushPromises();
      const colA = () =>
        wrapper
          .findAllComponents({ name: "ElCol" })
          .find((c) => c.text().includes("A"));
      expect(colA().classes()).not.toContain("form-pro__col--tight"); // 同行 B 有 tip → 整行宽松
      wrapper.vm.updateItems("b", { visible: false });
      await flushPromises();
      expect(colA().classes()).toContain("form-pro__col--tight"); // B 隐藏 → A 独行无 tip → 收紧
      wrapper.unmount();
    });

    it("compact：校验失败 → el-tooltip 渲染于 item 右上角（top-end / 受控显隐 / 非 dialog 场景 zIndex 取 32 位最大值）", async () => {
      const wrapper = mountFormPro({
        modelValue: { name: "" },
        compact: true,
        items: [{ prop: "name", label: "姓名", itemRender: { name: "ElInput" } }],
      });
      await flushPromises();
      fail(wrapper, "name", "姓名必填");
      await flushPromises();
      const tooltip = wrapper.findComponent({ name: "ElTooltip" });
      expect(tooltip.exists()).toBe(true);
      expect(tooltip.props("visible")).toBe(true); // 受控显隐（无 onUpdate 监听 → trigger 交互失效）
      expect(tooltip.props("virtualTriggering")).toBe(true);
      // 虚拟锚点即该字段的 el-form-item 实例 → 气泡定位在其右上角
      expect(tooltip.props("virtualRef")).toBe(wrapper.vm.getFormItem("name"));
      expect(tooltip.props("placement")).toBe("top-end");
      // teleport 至 body 层的 popper 实体
      const el = popper();
      expect(el).toBeTruthy();
      expect(el.textContent).toContain("姓名必填");
      // 不在 dialog 内：zIndex 退化为 32 位整型最大值
      expect(el.style.zIndex).toBe("2147483647");
      wrapper.unmount();
    });

    it("compact：位于 el-dialog 内时 tooltip zIndex = 该 dialog 遮罩层 z-index + 1（浮于本层、允许被嵌套层遮挡）", async () => {
      const wrapper = mount(
        {
          components: { FormPro },
          setup: () => ({
            visible: ref(true),
            formData: ref({ name: "" }),
            items: [
              { prop: "name", label: "姓名", itemRender: { name: "ElInput" } },
            ],
          }),
          template: `
            <el-dialog v-model="visible" title="宿主弹窗">
              <FormPro ref="fp" v-model="formData" :items="items" compact :error-tip-duration="0" />
            </el-dialog>`,
        },
        { global: globalConfig, attachTo: document.body },
      );
      await flushPromises();
      // dialog 遮罩层 z-index（EP z-index 管理器分配的内联值）
      const overlay = document.body.querySelector(".el-overlay");
      expect(overlay).toBeTruthy();
      const overlayZ = parseInt(overlay.style.zIndex, 10);
      expect(Number.isFinite(overlayZ)).toBe(true);

      const fp = wrapper.findComponent({ name: "FormPro" });
      fail(fp, "name", "姓名必填");
      await flushPromises();
      const el = popper();
      expect(el).toBeTruthy();
      // 关键契约：tooltip 只浮在「表单所在 dialog 层」之上 → overlayZ + 1；
      // 后续嵌套 dialog 会分到更高 z-index，tooltip 允许被其遮挡（不再取整型最大值）
      expect(parseInt(el.style.zIndex, 10)).toBe(overlayZ + 1);
      wrapper.unmount();
    });

    it("compact：tooltip 自动隐藏后 is-error 校验状态保留（红色边框不变）", async () => {
      const wrapper = mountFormPro({
        modelValue: { name: "" },
        compact: true,
        errorTipDuration: 0.05, // 50ms，缩短真实定时等待
        items: [{ prop: "name", label: "姓名", itemRender: { name: "ElInput" } }],
      });
      await flushPromises();
      const fi = wrapper.vm.getFormItem("name");
      // 模拟 EP onValidationFailed 真实时序：先置 error 态（is-error 类即时生效），再 emit validate
      fi.validateState = "error";
      fi.validateMessage = "姓名必填";
      await flushPromises();
      expect(wrapper.find(".el-form-item").classes()).toContain("is-error");
      fail(wrapper, "name", "姓名必填");
      await flushPromises();
      expect(popperVisible()).toBe(true);
      // 50ms 后自动隐藏
      await new Promise((r) => setTimeout(r, 160));
      await flushPromises();
      expect(popperVisible()).toBe(false);
      // 关键契约：隐藏仅收起气泡，校验状态不被清除 → 控件错误样式（红色边框）保持
      expect(wrapper.find(".el-form-item").classes()).toContain("is-error");
      expect(fi.validateState).toBe("error");
      expect(fi.validateMessage).toBe("姓名必填");
      wrapper.unmount();
    });

    it("compact：errorTipDuration 默认 3 秒；重新触发校验失败会重置计时", async () => {
      // 默认值契约（不真等 3s）
      const defaultWrapper = mountFormPro({
        modelValue: {},
        compact: true,
        items: compactItems(),
      });
      expect(defaultWrapper.props("errorTipDuration")).toBe(3);
      defaultWrapper.unmount();

      // 计时重置：首次失败后 40ms（<100ms）再次触发失败 → 计时重置
      const wrapper = mountFormPro({
        modelValue: { name: "" },
        compact: true,
        errorTipDuration: 0.1, // 100ms
        items: [{ prop: "name", label: "姓名", itemRender: { name: "ElInput" } }],
      });
      fail(wrapper, "name", "姓名必填");
      await flushPromises();
      await new Promise((r) => setTimeout(r, 40));
      fail(wrapper, "name", "姓名必填"); // 40ms < 100ms 重新触发 → 计时重置
      await new Promise((r) => setTimeout(r, 40));
      await flushPromises();
      expect(popperVisible()).toBe(true); // 距首次失败 80ms，未到重置后的 100ms → 仍在展示
      await new Promise((r) => setTimeout(r, 120));
      await flushPromises();
      expect(popperVisible()).toBe(false);
      wrapper.unmount();
    });

    it("compact：字段恢复通过 → tooltip 立即隐藏；clearValidate 亦收敛", async () => {
      const wrapper = mountFormPro({
        modelValue: { name: "" },
        compact: true,
        errorTipDuration: 0, // <=0：不自动隐藏，显隐完全由校验状态驱动
        items: [{ prop: "name", label: "姓名", itemRender: { name: "ElInput" } }],
      });
      await flushPromises();
      fail(wrapper, "name", "姓名必填");
      await flushPromises();
      expect(popperVisible()).toBe(true);
      pass(wrapper, "name");
      await flushPromises();
      expect(popperVisible()).toBe(false); // 恢复通过立即隐藏
      // 再次失败后 clearValidate 全清
      fail(wrapper, "name", "姓名必填");
      await flushPromises();
      expect(popperVisible()).toBe(true);
      wrapper.vm.clearValidate();
      await flushPromises();
      expect(popperVisible()).toBe(false);
      wrapper.unmount();
    });

    it("compact：resetFields 收敛 tooltip 且 tip 填写提示恢复显示（回归守护）", async () => {
      const wrapper = mountFormPro({
        modelValue: { name: "" },
        compact: true,
        errorTipDuration: 0,
        items: [
          {
            prop: "name",
            label: "姓名",
            tip: "请输入真实姓名",
            itemRender: { name: "ElInput" },
          },
        ],
      });
      await flushPromises();
      expect(wrapper.find(".form-pro__field-tip").exists()).toBe(true); // 无错误时 tip 显示
      fail(wrapper, "name", "姓名必填");
      await flushPromises();
      expect(wrapper.find(".form-pro__field-tip").exists()).toBe(false); // 错误时 tip 让位
      expect(popperVisible()).toBe(true);
      wrapper.vm.resetFields();
      await flushPromises();
      expect(popperVisible()).toBe(false); // tooltip 收敛
      expect(wrapper.find(".form-pro__field-tip").exists()).toBe(true); // tip 恢复（fieldErrors 同步清理）
      wrapper.unmount();
    });

    it("compact：tooltip 受控显隐——对触发元素的 hover/移出不改变气泡状态", async () => {
      const wrapper = mountFormPro({
        modelValue: { name: "" },
        compact: true,
        errorTipDuration: 0,
        items: [{ prop: "name", label: "姓名", itemRender: { name: "ElInput" } }],
      });
      await flushPromises();
      fail(wrapper, "name", "姓名必填");
      await flushPromises();
      expect(popperVisible()).toBe(true);
      await wrapper.find(".el-form-item").trigger("mouseleave");
      await flushPromises();
      expect(popperVisible()).toBe(true); // 受控模式：trigger 交互被忽略，不提前隐藏
      await wrapper.find(".el-form-item").trigger("mouseenter");
      await flushPromises();
      expect(popperVisible()).toBe(true);
      wrapper.unmount();
    });

    it("compact：多字段同时校验失败 → 各 item 独立展示错误 tooltip", async () => {
      const wrapper = mountFormPro({
        modelValue: { name: "", phone: "" },
        compact: true,
        errorTipDuration: 0,
        items: [
          { prop: "name", label: "姓名", itemRender: { name: "ElInput" } },
          { prop: "phone", label: "电话", itemRender: { name: "ElInput" } },
        ],
      });
      await flushPromises();
      fail(wrapper, "name", "姓名必填");
      fail(wrapper, "phone", "电话必填");
      await flushPromises();
      expect(document.body.querySelectorAll(".form-pro__error-popper").length).toBe(2);
      wrapper.unmount();
    });

    it("compact 动态关闭：错误 tooltip 随之移除、收紧类全部摘除，恢复常规渲染", async () => {
      const wrapper = mountFormPro({
        modelValue: { name: "" },
        compact: true,
        errorTipDuration: 0,
        items: compactItems(),
      });
      await flushPromises();
      fail(wrapper, "name", "姓名必填");
      await flushPromises();
      expect(wrapper.findAll(".form-pro__col--tight").length).toBeGreaterThan(0);
      expect(popperVisible()).toBe(true);
      await wrapper.setProps({ compact: false });
      await flushPromises();
      expect(wrapper.find(".form-pro--compact").exists()).toBe(false);
      expect(wrapper.findAll(".form-pro__col--tight").length).toBe(0);
      expect(popper()).toBeNull();
      wrapper.unmount();
    });

    it("compact 与 border 组合：间隔收紧规则被 :not(.form-pro--border) 排除（源码契约，jsdom 无法计算样式）", async () => {
      const wrapper = mountFormPro({
        modelValue: {},
        compact: true,
        border: true,
        items: compactItems(),
      });
      await flushPromises();
      // 两根类共存（border 优先级更高的间隔规则由下方源码契约守护）
      expect(wrapper.find(".form-pro--border.form-pro--compact").exists()).toBe(true);
      expect(wrapper.findAll(".form-pro__col--tight").length).toBeGreaterThan(0);
      wrapper.unmount();

      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const src = readFileSync(
        resolve(process.cwd(), "src/components/formPro/index.vue"),
        "utf-8",
      );
      // 间隔收紧必须限定在 :not(.form-pro--border) 内 → border 表格自身 margin-bottom: 0 不受影响
      expect(src).toMatch(
        /\.form-pro--compact:not\(\.form-pro--border\)[\s\S]*?\.form-pro__col--tight \.el-form-item[\s\S]*?margin-bottom:\s*6px/,
      );
      // label 距离减半（left/right：右内边距 12px→6px；top：下外边距 8px→4px）
      expect(src).toMatch(/\.form-pro--compact[\s\S]*?\.el-form-item__label[\s\S]*?padding-right:\s*6px/);
      expect(src).toMatch(
        /\.form-pro--compact[\s\S]*?\.el-form-item--label-top \.el-form-item__label[\s\S]*?margin-bottom:\s*4px/,
      );
      // 原生错误文案隐藏（is-error 状态不受影响 → 红色边框保持）
      expect(src).toMatch(/\.form-pro--compact[\s\S]*?\.el-form-item__error[\s\S]*?display:\s*none/);
      // 错误 tooltip 全局样式：error 主色调背景 / 白色文字 / 2px 内边距
      const gs = src.slice(src.indexOf(".el-popper.is-dark.form-pro__error-popper"));
      expect(gs).toMatch(/background:\s*var\(--el-color-error\)/);
      expect(gs).toMatch(/color:\s*#fff/);
      expect(gs).toMatch(/padding:\s*2px/);
    });
  });
});

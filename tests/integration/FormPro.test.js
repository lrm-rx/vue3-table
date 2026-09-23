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
          '<FormPro v-model="formData" :items="[{ field: \'name\', label: \'名称\', itemRender: { name: \'ElInput\' } }]" />',
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
        { field: "a", label: "A" },
        { field: "b", label: "B", span: 16 },
      ],
    });
    await flushPromises();
    const cols = wrapper.findAllComponents({ name: "ElCol" });
    expect(cols.length).toBe(2);
    expect(cols[0].props("span")).toBe(8);
    expect(cols[1].props("span")).toBe(16);
  });

  it("条件显隐自动回流：隐藏项不渲染，后续项前移", async () => {
    const wrapper = mountFormPro({
      modelValue: { flag: false },
      items: [
        { field: "a", label: "A", span: 12 },
        { field: "b", label: "B", span: 12, visibleMethod: (d) => !!d.flag },
        { field: "c", label: "C", span: 12 },
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
        { field: "a", label: "A", required: true },
        { field: "b", label: "B" },
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
        { field: "a", label: "A" },
        { field: "b", label: "B" },
      ],
    });
    await flushPromises();
    // 默认折叠 → 无表单项
    expect(wrapper.findAllComponents({ name: "ElFormItem" }).length).toBe(0);
    const header = wrapper.find(".form-pro__group-header");
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
          field: "name",
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
          { field: "a", label: "A" },
          { slot: "myDivider" },
          { render: (h) => h("div", { class: "insert-render" }, "插入内容") },
          { field: "b", label: "B" },
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
          field: "role",
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

  it("el-form 自定义事件透传：validate 事件到达父组件", async () => {
    const onValidate = vi.fn();
    const wrapper = mountFormPro({
      modelValue: {},
      items: [],
      onValidate,
    });
    await flushPromises();
    const elForm = wrapper.findComponent({ name: "ElForm" });
    elForm.vm.$emit("validate", "name", true, "ok");
    expect(onValidate).toHaveBeenCalledWith("name", true, "ok");
  });
});

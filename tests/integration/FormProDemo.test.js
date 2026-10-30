// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ElementPlus from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import FormProDemo from "../../src/views/FormProDemo.vue";

// 端到端回归：挂载真实 FormProDemo 页，验证原生事件演示链路
// （items 配置 → itemRender.events → ElInput emits → 工具栏展示）
describe("FormProDemo 页面级：原生事件演示", () => {
  it("type=企业 后，公司名称 focus/blur 触发 events 回调并更新展示", async () => {
    const wrapper = mount(FormProDemo, {
      global: {
        plugins: [[ElementPlus, { locale: zhCn }]],
        components: { ...ElementPlusIconsVue },
        mocks: { $message: { success: vi.fn(), error: vi.fn() } },
      },
    });
    await flushPromises();
    // 切换 type 为 企业（直接驱动表单内「类型」ElSelect）
    const typeSelect = wrapper
      .findAllComponents({ name: "ElSelect" })
      .find((s) => s.props("placeholder") === "请选择类型");
    expect(typeSelect).toBeTruthy();
    typeSelect.vm.$emit("update:modelValue", "company");
    await flushPromises();
    // 找到公司名称输入框，触发原生 focus/blur
    const companyInput = wrapper.find('input[placeholder="请输入公司名称"]');
    expect(companyInput.exists()).toBe(true);
    await companyInput.trigger("focus");
    await flushPromises();
    await companyInput.trigger("blur");
    await flushPromises();
    expect(wrapper.html()).toContain("blur（公司名称）");
  });
});

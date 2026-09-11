// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick, reactive } from "vue";
import ElementPlus from "element-plus";
import FilterCheckbox from "../../src/components/tablePro/filters/FilterCheckbox.vue";

// jsdom 无布局（容器高度恒 0），getVisibleRange 走「未测量 → 全量渲染」兜底，
// 因此组件层交互语义（勾选/全选/半选/搜索/本地提取）在此可确定性验证；
// 真实窗口裁剪由 virtualList.test.js 的纯函数单测 + 浏览器实测共同覆盖。

const makeOption = (data = {}) => ({
  data: { values: [], search: "", ...data },
});
const makeOpts = (n) =>
  Array.from({ length: n }, (_, i) => ({
    label: `选项-${i + 1}`,
    value: `v${i + 1}`,
  }));

const mountFC = ({ option, renderOpts, field = "f", ctx } = {}) =>
  mount(FilterCheckbox, {
    props: {
      option: option || makeOption(),
      renderOpts: renderOpts || {},
      field,
    },
    global: {
      plugins: [ElementPlus],
      provide: ctx ? { tableProFilterContext: ctx } : {},
    },
  });

const items = (wrapper) => wrapper.findAll(".filter-checkbox__item");
const labels = (wrapper) => items(wrapper).map((w) => w.text());
const header = (wrapper) => wrapper.find(".filter-checkbox__list-header .el-checkbox");
// EP 2.14：半选态 class 位于内部 .el-checkbox__input（根节点只有 is-checked）
const isIndeterminate = (w) =>
  w.find(".el-checkbox__input").classes().includes("is-indeterminate");
// jsdom 下点击 inner span 不能可靠触发 label 激活，直接驱动原生 input 的 change
// （EP 通过 input 的 change 事件读取 target.checked 更新 model）
const setChecked = async (w, checked) => {
  const input = w.find("input").element;
  input.checked = checked;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await nextTick();
};
const toggle = (w, checked = true) => setChecked(w, checked);

describe("FilterCheckbox 组件（jsdom 全量兜底渲染）", () => {
  it("静态选项全量渲染，占位容器高度 = 项数 × 22px", () => {
    const option = makeOption();
    const wrapper = mountFC({
      option,
      renderOpts: { props: { options: makeOpts(200) } },
    });
    expect(items(wrapper)).toHaveLength(200);
    expect(labels(wrapper)[0]).toBe("选项-1");
    expect(wrapper.find(".filter-checkbox__virtual").attributes("style")).toContain(
      "height: 4400px",
    );
  });

  it("勾选/取消单项写入 option.data.values（v-model 状态不依赖 DOM 节点）", async () => {
    const option = makeOption();
    const wrapper = mountFC({
      option,
      renderOpts: { props: { options: makeOpts(10) } },
    });
    await toggle(items(wrapper)[0]);
    expect(option.data.values).toEqual(["v1"]);
    expect(items(wrapper)[0].classes()).toContain("is-checked");

    await toggle(items(wrapper)[0], false);
    expect(option.data.values).toEqual([]);
  });

  it("单选时全选行为半选态；点击全选选中全部，再点清空", async () => {
    const option = makeOption();
    const wrapper = mountFC({
      option,
      renderOpts: { props: { options: makeOpts(10) } },
    });
    await toggle(items(wrapper)[2]);
    expect(isIndeterminate(header(wrapper))).toBe(true);
    expect(header(wrapper).classes()).not.toContain("is-checked");

    // 全选：作用于完整选项集（虚拟滚动下即窗口外的项也必须被选中）
    await toggle(header(wrapper));
    expect(option.data.values).toHaveLength(10);
    expect(header(wrapper).classes()).toContain("is-checked");
    expect(items(wrapper).every((w) => w.classes().includes("is-checked"))).toBe(true);

    // 取消全选
    await toggle(header(wrapper), false);
    expect(option.data.values).toEqual([]);
  });

  it("搜索收敛后全选只作用于匹配项，未匹配的已选值得保留", async () => {
    // 预选一个不参与匹配的值（挂载前注入：真实场景 option.data 为响应式状态，
    // 此处以初始值形式进入，避免测试对 props 浅响应嵌套对象的直接替换）
    const option = makeOption({ values: ["v2"] });
    const wrapper = mountFC({
      option,
      renderOpts: { props: { options: makeOpts(100) } },
    });

    // 「选项-1」匹配：选项-1 / 选项-10~19 / 选项-100，共 12 项
    await wrapper.find("input").setValue("选项-1");
    expect(items(wrapper)).toHaveLength(12);
    // 半选语义只看匹配集：v2 不在匹配集 → 头部非半选（未匹配已选值不受影响）
    expect(isIndeterminate(header(wrapper))).toBe(false);

    await toggle(header(wrapper));
    expect(option.data.values).toHaveLength(13);
    expect(option.data.values).toContain("v2");
    expect(option.data.values).toContain("v1");
    expect(option.data.values).toContain("v19");
    expect(option.data.values).toContain("v100");
    expect(option.data.values).not.toContain("v3");

    // 清空搜索恢复 100 项，部分选中 → 仍为半选态
    await wrapper.find("input").setValue("");
    expect(items(wrapper)).toHaveLength(100);
    expect(isIndeterminate(header(wrapper))).toBe(true);
  });

  it("搜索无匹配 / 无任何选项时显示「无匹配数据」", async () => {
    const option = makeOption();
    const wrapper = mountFC({
      option,
      renderOpts: { props: { options: makeOpts(5) } },
    });
    await wrapper.find("input").setValue("不存在的关键字");
    expect(wrapper.find(".filter-checkbox__empty").text()).toBe("无匹配数据");
    expect(wrapper.find(".filter-checkbox__list").exists()).toBe(false);

    const empty = mountFC({ renderOpts: { props: { options: [] } } });
    expect(empty.find(".filter-checkbox__empty").text()).toBe("无匹配数据");
  });

  it("搜索条件变化时滚动位置复位到顶部", async () => {
    const option = makeOption();
    const wrapper = mountFC({
      option,
      renderOpts: { props: { options: makeOpts(100) } },
    });
    const listEl = wrapper.find(".filter-checkbox__list").element;
    listEl.scrollTop = 500;
    listEl.dispatchEvent(new Event("scroll"));
    await nextTick();
    expect(listEl.scrollTop).toBe(500);

    await wrapper.find("input").setValue("选项-5");
    await nextTick();
    expect(wrapper.find(".filter-checkbox__list").element.scrollTop).toBe(0);
  });

  it("本地提取模式：无静态 options 时从 ctx.getLocalCheckboxOptions 取数，面板重开计数器变化后重新提取", async () => {
    const getLocal = vi
      .fn()
      .mockReturnValueOnce([{ label: "A", value: "a" }])
      .mockReturnValueOnce([{ label: "B", value: "b" }]);
    const counter = reactive({ f: 0 });
    const ctx = { getLocalCheckboxOptions: getLocal, filterRefetchCounter: counter };

    const option = makeOption();
    const wrapper = mountFC({ option, ctx });
    expect(getLocal).toHaveBeenCalledWith("f");
    expect(labels(wrapper)).toEqual(["A"]);

    // 模拟面板再次打开（bump 计数器）→ 重新提取，选项刷新
    counter.f = 1;
    await nextTick();
    expect(labels(wrapper)).toEqual(["B"]);
  });

  it("远程模式：挂载时调用 fetchFilterOptions 拉取选项", async () => {
    const fetchFilterOptions = vi
      .fn()
      .mockResolvedValue([{ label: "远程项", value: "r1" }]);
    const ctx = {
      hasRemoteFilterAPI: () => true,
      fetchFilterOptions,
      filterRefetchCounter: reactive({ f: 0 }),
    };
    const wrapper = mountFC({ ctx });
    await flushPromises();
    expect(fetchFilterOptions).toHaveBeenCalledWith("f");
    expect(labels(wrapper)).toEqual(["远程项"]);
  });

  it("外部传入的已选值在挂载后回显为勾选态", () => {
    const option = makeOption({ values: ["v3", "v7"] });
    const wrapper = mountFC({
      option,
      renderOpts: { props: { options: makeOpts(10) } },
    });
    const checked = items(wrapper).filter((w) => w.classes().includes("is-checked"));
    expect(checked).toHaveLength(2);
    expect(isIndeterminate(header(wrapper))).toBe(true);
  });
});

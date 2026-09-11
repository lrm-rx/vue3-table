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

// ========== 远程分页 + 联想搜索（paged 模式） ==========
// 后端分页 mock：共 35 项，pageSize=20，page1=20 条 / page2=15 条
const makePagedCtx = (fetchFilterOptions) => ({
  hasRemoteFilterAPI: () => true,
  fetchFilterOptions,
  filterRefetchCounter: reactive({ f: 0 }),
});
const pagedRows = (pageNum, pageSize = 20, total = 35) => {
  const start = (pageNum - 1) * pageSize;
  const rows = [];
  for (let i = start; i < Math.min(start + pageSize, total); i++) {
    rows.push({ label: `v${i + 1}`, value: `v${i + 1}` });
  }
  return rows;
};
const pagedRender = (extra = {}) => ({
  props: { paged: true, pageSize: 20, searchDebounce: 0, ...extra },
});
const scrollToBottom = (wrapper) =>
  wrapper.find(".filter-checkbox__list").element.dispatchEvent(new Event("scroll"));

describe("FilterCheckbox 远程分页 + 联想搜索", () => {
  it("首屏携带 keyword/pageNum/pageSize；触底请求下一页并按 value 去重追加；取满显示没有更多且不再请求", async () => {
    const fetch = vi.fn(async (f, q) => {
      const rows = pagedRows(q.pageNum, q.pageSize);
      // 模拟后端跨页边界重复：page2 首项与 page1 末项相同
      if (q.pageNum === 2) rows.unshift({ label: "v20", value: "v20" });
      return { options: rows, total: 35, paged: true };
    });
    const wrapper = mountFC({ ctx: makePagedCtx(fetch), renderOpts: pagedRender() });
    await flushPromises();
    expect(fetch).toHaveBeenNthCalledWith(1, "f", {
      keyword: "",
      pageNum: 1,
      pageSize: 20,
    });
    expect(items(wrapper)).toHaveLength(20);
    const status = () => wrapper.find(".filter-checkbox__list-status");
    expect(status().exists()).toBe(true);
    expect(status().find(".is-end").exists()).toBe(false);

    scrollToBottom(wrapper);
    await flushPromises();
    expect(fetch).toHaveBeenNthCalledWith(2, "f", {
      keyword: "",
      pageNum: 2,
      pageSize: 20,
    });
    expect(items(wrapper)).toHaveLength(35); // v20 重复项被合并
    expect(status().find(".is-end").text()).toContain("没有更多");

    scrollToBottom(wrapper);
    await flushPromises();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("联想搜索走后端：防抖 300ms 后携带 keyword 重置到第 1 页；等待期不做本地过滤", async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn(async (f, q) => {
        if (q.keyword) {
          return { options: [{ label: "匹配-x", value: "kx" }], total: 1, paged: true };
        }
        return { options: pagedRows(q.pageNum, q.pageSize), total: 35, paged: true };
      });
      const wrapper = mountFC({
        ctx: makePagedCtx(fetch),
        renderOpts: pagedRender({ searchDebounce: 300 }),
      });
      await vi.runAllTimersAsync();
      expect(fetch).toHaveBeenNthCalledWith(1, "f", {
        keyword: "",
        pageNum: 1,
        pageSize: 20,
      });
      expect(items(wrapper)).toHaveLength(20);

      // 先触底加载第 2 页（共 35 项）
      scrollToBottom(wrapper);
      await vi.runAllTimersAsync();
      expect(items(wrapper)).toHaveLength(35);

      await wrapper.find("input").setValue("x");
      // 防抖未到：不发请求，且分页模式【不做本地过滤】，仍显示全部已加载项
      await vi.advanceTimersByTimeAsync(299);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(items(wrapper)).toHaveLength(35);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch).toHaveBeenNthCalledWith(3, "f", {
        keyword: "x",
        pageNum: 1,
        pageSize: 20,
      });
      await vi.runAllTimersAsync();
      expect(labels(wrapper)).toEqual(["匹配-x"]);
      expect(wrapper.find(".filter-checkbox__list-status .is-end").exists()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("竞态防护：旧关键字的响应晚到时被丢弃，以最新请求结果为准", async () => {
    let resolveOld;
    let resolveNew;
    const fetch = vi.fn(
      (f, q) =>
        new Promise((resolve) => {
          if (q.keyword === "") resolveOld = resolve;
          else resolveNew = resolve;
        }),
    );
    const wrapper = mountFC({ ctx: makePagedCtx(fetch), renderOpts: pagedRender() });
    expect(fetch).toHaveBeenCalledTimes(1);

    // searchDebounce=0：watch 触发后同步发起新请求
    await wrapper.find("input").setValue("new");
    expect(fetch).toHaveBeenCalledTimes(2);

    // 新请求先返回
    resolveNew({
      options: [{ label: "新结果", value: "n" }],
      total: 1,
      paged: true,
    });
    await flushPromises();
    expect(labels(wrapper)).toEqual(["新结果"]);

    // 旧首页响应晚到：必须被丢弃（不能覆盖新关键字结果）
    resolveOld({
      options: [{ label: "旧首页", value: "o" }],
      total: 50,
      paged: true,
    });
    await flushPromises();
    expect(labels(wrapper)).toEqual(["新结果"]);
    expect(wrapper.find(".filter-checkbox__list-status .is-end").exists()).toBe(true);
  });

  it("已选值跨页保持（未加载页中的值不丢失）；全选作用于所有已加载页", async () => {
    const option = makeOption({ values: ["v30"] }); // v30 在第 2 页
    const fetch = vi.fn(async (f, q) => ({
      options: pagedRows(q.pageNum, q.pageSize),
      total: 35,
      paged: true,
    }));
    const wrapper = mountFC({
      option,
      ctx: makePagedCtx(fetch),
      renderOpts: pagedRender(),
    });
    await flushPromises();
    // v30 尚未加载：已选值必须原样保留；全选/半选不把未加载项算入
    expect(option.data.values).toEqual(["v30"]);
    expect(header(wrapper).classes()).not.toContain("is-checked");
    expect(isIndeterminate(header(wrapper))).toBe(false);

    scrollToBottom(wrapper);
    await flushPromises();
    expect(items(wrapper)).toHaveLength(35);
    const checkedValues = items(wrapper).filter((w) =>
      w.classes().includes("is-checked"),
    );
    expect(checkedValues.map((w) => w.text())).toEqual(["v30"]);
    expect(isIndeterminate(header(wrapper))).toBe(true);

    // 全选：跨已加载页（含虚拟窗口外节点），且不产生重复值
    await toggle(header(wrapper));
    expect(option.data.values).toHaveLength(35);
    expect(option.data.values).toContain("v1");
    expect(option.data.values).toContain("v20");
    expect(option.data.values).toContain("v35");
  });

  it("后端仍返回旧式数组：按单页处理（paged=false），显示没有更多且触底不追加", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue([
        { label: "A", value: "a" },
        { label: "B", value: "b" },
        { label: "C", value: "c" },
      ]);
    const wrapper = mountFC({ ctx: makePagedCtx(fetch), renderOpts: pagedRender() });
    await flushPromises();
    expect(items(wrapper)).toHaveLength(3);
    expect(wrapper.find(".filter-checkbox__list-status .is-end").exists()).toBe(true);

    scrollToBottom(wrapper);
    await flushPromises();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("首屏返回 null：按无数据处理，显示无匹配数据", async () => {
    const fetch = vi.fn().mockResolvedValue(null);
    const wrapper = mountFC({ ctx: makePagedCtx(fetch), renderOpts: pagedRender() });
    await flushPromises();
    expect(wrapper.find(".filter-checkbox__empty").text()).toBe("无匹配数据");
  });
});

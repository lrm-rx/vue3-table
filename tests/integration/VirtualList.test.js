// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import VirtualList from "../../src/components/comment/components/VirtualList.vue";
import { createResizeObserverMock } from "../helpers/resizeObserver.js";

let roEnv;

beforeEach(() => {
  roEnv = createResizeObserverMock(200);
  global.ResizeObserver = roEnv.ResizeObserverMock;
});

afterEach(() => {
  delete global.ResizeObserver;
});

const makeItems = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, label: `第${i + 1}项` }));

// 等待微任务（测量回调）+ Vue 重渲染落定
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const mountList = async (props = {}, n = 100) => {
  const wrapper = mount(VirtualList, {
    // estimateHeight 与桩高度一致（200），隔离首次测量补偿对窗口断言的干扰
    props: { items: makeItems(n), height: 600, estimateHeight: 200, ...props },
    slots: {
      default: `
        <template #default="{ item }">
          <div class="slot-row">{{ item.label }}</div>
        </template>
      `,
    },
  });
  // jsdom 不布局：模拟视口真实高度
  Object.defineProperty(wrapper.element, "clientHeight", {
    configurable: true,
    value: 600,
  });
  await settle();
  return wrapper;
};

const scrollTo = async (wrapper, top) => {
  Object.defineProperty(wrapper.element, "scrollTop", {
    configurable: true,
    writable: true,
    value: top,
  });
  wrapper.element.dispatchEvent(new Event("scroll"));
  await settle();
};

describe("VirtualList 窗口化渲染", () => {
  it("100 项只挂载窗口（8 项）内的 DOM，phantom 撑开总高度", async () => {
    const wrapper = await mountList();
    // 视口 600 / 行高 200 = 3 项可见，逻辑 end=5，+overscan=3 → 8 项
    expect(wrapper.findAll(".slot-row")).toHaveLength(8);
    // 占位层总高度 = 100 * 200
    expect(wrapper.find(".biz-virtual-list__phantom").attributes("style")).toContain(
      "height: 20000px",
    );
    expect(wrapper.find(".biz-virtual-list__content").attributes("style")).toContain(
      "translateY(0px)",
    );
  });

  it("滚动后窗口与位移同步更新", async () => {
    const wrapper = await mountList();
    await scrollTo(wrapper, 5000);

    // start=findIndex(5000)-3=22；end=findIndex(5600)+2+3=33
    expect(wrapper.findAll(".slot-row")).toHaveLength(11);
    expect(wrapper.find(".slot-row").text()).toBe("第23项");
    expect(wrapper.find(".biz-virtual-list__content").attributes("style")).toContain(
      "translateY(4400px)",
    );
  });

  it("showIndex=true 时每项左侧渲染楼层序号列", async () => {
    const floors = [10, 20, 30, 40, 50];
    const items = makeItems(5).map((it, i) => ({ ...it, floor: floors[i] }));
    const wrapper = mount(VirtualList, {
      props: {
        items,
        height: 600,
        estimateHeight: 200,
        showIndex: true,
      },
      slots: { default: `<div class="slot-row" />` },
    });
    Object.defineProperty(wrapper.element, "clientHeight", {
      configurable: true,
      value: 600,
    });
    await settle();

    const nos = wrapper
      .findAll(".biz-virtual-list__index-no")
      .map((n) => n.text());
    expect(nos).toEqual(["10", "20", "30", "40", "50"]);
    expect(wrapper.findAll(".biz-virtual-list__index-unit")).toHaveLength(5);
    // 插槽内容仍正常渲染
    expect(wrapper.findAll(".slot-row")).toHaveLength(5);
  });

  it("floor 缺失时序号回退展示位置 index+1，滚动后随之更新", async () => {
    const wrapper = await mountList({ showIndex: true });
    let nos = wrapper
      .findAll(".biz-virtual-list__index-no")
      .map((n) => n.text());
    // 窗口前 8 项：位置 1~8
    expect(nos).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);

    await scrollTo(wrapper, 5000);
    // 窗口首项 index=22 → 序号 23
    expect(wrapper.find(".biz-virtual-list__index-no").text()).toBe("23");
  });

  it("indexField 可自定义序号取值字段", async () => {
    const items = makeItems(2).map((it, i) => ({ ...it, seq: i === 0 ? 101 : 202 }));
    const wrapper = mount(VirtualList, {
      props: {
        items,
        height: 600,
        estimateHeight: 200,
        showIndex: true,
        indexField: "seq",
      },
      slots: { default: `<div class="slot-row" />` },
    });
    Object.defineProperty(wrapper.element, "clientHeight", {
      configurable: true,
      value: 600,
    });
    await settle();
    expect(
      wrapper.findAll(".biz-virtual-list__index-no").map((n) => n.text()),
    ).toEqual(["101", "202"]);
  });

  it("视口高度未测量时（首帧）全量渲染兜底", async () => {
    const wrapper = mount(VirtualList, {
      props: { items: makeItems(5), height: 600 },
      slots: { default: `<div class="slot-row" />` },
    });
    // 未模拟 clientHeight（=0）且未到测量回调
    expect(wrapper.findAll(".slot-row")).toHaveLength(5);
  });
});

describe("VirtualList load-more", () => {
  it("滚动接近底部抛出一次 load-more，数据增长后重新武装", async () => {
    const wrapper = await mountList();
    // 19400 + 600 = 20000，进入距底 80 阈值
    await scrollTo(wrapper, 19400);
    expect(wrapper.emitted("load-more")).toHaveLength(1);

    // 未增长前重复滚动不重复触发
    await scrollTo(wrapper, 19500);
    expect(wrapper.emitted("load-more")).toHaveLength(1);

    // 外部数据增长 → 重新武装，再次到底部可触发
    await wrapper.setProps({ items: makeItems(102) });
    await settle();
    // 总高 20400：19800 + 600 = 20400
    await scrollTo(wrapper, 19800);
    expect(wrapper.emitted("load-more")).toHaveLength(2);
  });

  it("loading=true 时不触发 load-more", async () => {
    const wrapper = await mountList({ loading: true });
    await scrollTo(wrapper, 19400);
    expect(wrapper.emitted("load-more")).toBeFalsy();
  });
});

describe("VirtualList 滚动位置补偿", () => {
  it("视口上方条目变高：scrollTop 同步补偿，内容不跳变", async () => {
    const wrapper = await mountList();
    await scrollTo(wrapper, 5000);

    // 当前窗口首项 = c23（index22，顶部 4400 < 5000），模拟其高度 200 → 300
    const observer = roEnv.instances[0];
    const targetEl = wrapper.find(".biz-virtual-list__item").element;
    observer.fire(targetEl, 300);
    await settle();

    // scrollTop 被补偿 +100
    expect(wrapper.element.scrollTop).toBe(5100);
  });

  it("补偿后 scrollToTop 可回到顶部并恢复窗口", async () => {
    const wrapper = await mountList();
    await scrollTo(wrapper, 5000);
    wrapper.vm.scrollToTop();
    await settle();
    expect(wrapper.element.scrollTop).toBe(0);
    expect(wrapper.findAll(".slot-row")).toHaveLength(8);
    expect(wrapper.find(".slot-row").text()).toBe("第1项");
  });
});

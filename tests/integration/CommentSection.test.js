// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ElementPlus from "element-plus";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import zhCn from "element-plus/dist/locale/zh-cn";
import CommentSection from "../../src/components/comment/index.vue";
import { createResizeObserverMock } from "../helpers/resizeObserver.js";

// 注册 Element Plus（含中文 locale，与 main.js 一致）+ 全部图标
const globalConfig = {
  plugins: [[ElementPlus, { locale: zhCn }]],
  components: Object.fromEntries(Object.entries(ElementPlusIconsVue)),
};

const mountSection = (props = {}) =>
  mount(CommentSection, {
    props: {
      comments: [],
      currentUser: { id: "me", name: "我", avatar: "" },
      ...props,
    },
    global: globalConfig,
  });

const findButton = (wrapper, text) =>
  wrapper.findAll("button").find((b) => b.text().includes(text));

describe("CommentSection 基础渲染", () => {
  it("空列表展示 ElEmpty 引导文案", () => {
    const wrapper = mountSection();
    expect(wrapper.text()).toContain("还没有评论，快来抢沙发吧");
  });

  it("有数据时展示评论内容与「第 n 楼」", () => {
    const comments = [
      {
        id: "c1",
        author: { id: "u1", name: "张三", avatar: "" },
        content: "你好，评论区",
        createTime: Date.now() - 24 * 60 * 60 * 1000,
        likeCount: 10,
        replies: [],
      },
    ];
    const wrapper = mountSection({ comments });
    expect(wrapper.text()).toContain("你好，评论区");
    expect(wrapper.text()).toContain("第1楼");
    expect(wrapper.text()).toContain("张三");
  });

  it("不传 comments 时使用内置 mock：楼中楼展示「查看全部 24 条回复」", async () => {
    const wrapper = mount(CommentSection, { global: globalConfig });
    await flushPromises();
    expect(wrapper.text()).toContain("查看全部 24 条回复");
    expect(wrapper.text()).toContain("共 12 条评论");
  });
});

describe("CommentSection 发送一级评论", () => {
  it("输入内容点击发布：插入列表（第1楼）并抛出 send/update 事件", async () => {
    const wrapper = mountSection();
    await wrapper.find("textarea").setValue("我的第一条评论");
    await findButton(wrapper, "发布").trigger("click");
    await flushPromises();

    // 列表立即展示
    expect(wrapper.text()).toContain("我的第一条评论");
    expect(wrapper.text()).toContain("第1楼");
    // 事件：send + v-model 同步 + 自动切到「最新」
    expect(wrapper.emitted("send")?.[0]).toEqual(["我的第一条评论"]);
    expect(wrapper.emitted("update:comments")).toBeTruthy();
    expect(wrapper.emitted("update:sort")?.[0]).toEqual(["latest"]);
  });

  it("纯空格内容不可发布", async () => {
    const wrapper = mountSection();
    await wrapper.find("textarea").setValue("   ");
    const publish = findButton(wrapper, "发布");
    expect(publish.attributes("disabled")).toBeDefined();
    expect(wrapper.emitted("send")).toBeFalsy();
  });
});

describe("CommentSection 点赞", () => {
  it("点击点赞按钮：乐观翻转并抛出 like 事件", async () => {
    const comments = [
      {
        id: "c1",
        author: { id: "u1", name: "张三", avatar: "" },
        content: "求点赞",
        createTime: Date.now(),
        likeCount: 3,
        liked: false,
        replies: [],
      },
    ];
    const wrapper = mountSection({ comments });
    await wrapper.find(".bili-comment-item__like").trigger("click");

    const likeEvents = wrapper.emitted("like");
    expect(likeEvents).toHaveLength(1);
    expect(likeEvents[0][0].liked).toBe(true);
    expect(wrapper.text()).toContain("4");
  });
});

describe("CommentSection 虚拟滚动模式", () => {
  beforeEach(() => {
    const roEnv = createResizeObserverMock(200);
    global.ResizeObserver = roEnv.ResizeObserverMock;
  });
  afterEach(() => {
    delete global.ResizeObserver;
  });

  // jsdom 不布局：模拟视口高度并等待测量/重渲染
  const prepareVirtual = async (wrapper) => {
    Object.defineProperty(wrapper.find(".biz-virtual-list").element, "clientHeight", {
      configurable: true,
      value: 600,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  const makeMany = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `c${i + 1}`,
      floor: i + 1,
      author: { id: `u${i + 1}`, name: `用户${i + 1}`, avatar: "" },
      content: `评论${i + 1}`,
      createTime: Date.now() - i * 60000,
      likeCount: 0,
      liked: false,
      replies: [],
    }));

  it("开启后使用虚拟列表：条目数受窗口限制，且不显示加载更多按钮", async () => {
    const wrapper = mount(CommentSection, {
      props: {
        comments: makeMany(100),
        currentUser: { id: "me", name: "我", avatar: "" },
        virtualScroll: true,
        listHeight: 600,
      },
      global: globalConfig,
    });
    await prepareVirtual(wrapper);

    expect(wrapper.find(".biz-virtual-list").exists()).toBe(true);
    expect(wrapper.findAll(".bili-comment-item")).toHaveLength(8);
    expect(wrapper.text()).not.toContain("点击加载更多评论");
    // 楼层序号列渲染（hot 排序 likeCount 全 0 → 时间倒序，首项为 floor=1）
    expect(wrapper.find(".biz-virtual-list__index-no").text()).toBe("1");
    expect(wrapper.find(".biz-virtual-list__index-unit").text()).toBe("楼");
    // CommentItem 头部不再重复显示楼层
    expect(wrapper.find(".bili-comment-item__floor").exists()).toBe(false);
  });

  it("showFloorIndex=false：不渲染楼层序号列，楼层改由 CommentItem 行内展示", async () => {
    const wrapper = mount(CommentSection, {
      props: {
        comments: makeMany(100),
        currentUser: { id: "me", name: "我", avatar: "" },
        virtualScroll: true,
        listHeight: 600,
        showFloorIndex: false,
      },
      global: globalConfig,
    });
    await prepareVirtual(wrapper);

    expect(wrapper.find(".biz-virtual-list__index").exists()).toBe(false);
    expect(wrapper.find(".bili-comment-item__floor").exists()).toBe(true);
    // 时间倒序首项 floor=1 → 行内「第1楼」
    expect(wrapper.find(".bili-comment-item__floor").text()).toContain("第1楼");
  });

  it("默认关闭时行为不变：首屏切片 + 加载更多按钮", () => {
    const wrapper = mount(CommentSection, {
      props: {
        comments: makeMany(100),
        currentUser: { id: "me", name: "我", avatar: "" },
      },
      global: globalConfig,
    });
    expect(wrapper.find(".biz-virtual-list").exists()).toBe(false);
    expect(wrapper.text()).toContain("点击加载更多评论");
  });

  it("虚拟模式下发送评论：新评论立即出现在窗口顶部并取得楼层", async () => {
    const wrapper = mount(CommentSection, {
      props: {
        comments: makeMany(100),
        currentUser: { id: "me", name: "我", avatar: "" },
        virtualScroll: true,
        listHeight: 600,
      },
      global: globalConfig,
    });
    await prepareVirtual(wrapper);

    await wrapper.find("textarea").setValue("虚拟滚动下的新评论");
    await findButton(wrapper, "发布").trigger("click");
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 第一条虚拟列表项：CommentItem 显示正文，楼层序号列显示「101 + 楼」
    const firstRow = wrapper.findAll(".biz-virtual-list__item")[0];
    expect(firstRow.find(".bili-comment-item").text()).toContain(
      "虚拟滚动下的新评论",
    );
    expect(firstRow.find(".biz-virtual-list__index-no").text()).toBe("101");
    expect(firstRow.find(".biz-virtual-list__index-unit").text()).toBe("楼");
  });
});

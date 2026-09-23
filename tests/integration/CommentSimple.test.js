// @vitest-environment jsdom
/**
 * CommentSimple（简化版评论区）集成测试：
 *  - 该组件仅远程模式，此前缺少独立集成测试，本文件补齐核心功能覆盖。
 * 覆盖：基础渲染 / 发送 / 点赞 / 回复就近展开 / 删除权限 / 排序
 *       触底 load-more + bottomArmed 防级联 / loading 抑制 / hasMore
 *       吸顶容器 / 底部状态文本。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ElementPlus from "element-plus";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import zhCn from "element-plus/dist/locale/zh-cn";
import CommentSimple from "../../src/components/commentSimple/index.vue";

const globalConfig = {
  plugins: [[ElementPlus, { locale: zhCn }]],
  components: Object.fromEntries(Object.entries(ElementPlusIconsVue)),
};

const me = { id: "me", name: "我", avatar: "" };

const makeComment = (i) => ({
  id: `c${i}`,
  floor: i,
  author: { id: `u${i}`, name: `用户${i}`, avatar: "" },
  content: `评论内容${i}`,
  createTime: Date.now() - i * 60000,
  likeCount: i,
  liked: false,
  replies: [
    {
      id: `r${i}`,
      author: { id: "ru", name: "回复者", avatar: "" },
      content: `楼中楼${i}`,
      createTime: Date.now(),
      likeCount: 0,
      liked: false,
      replyTo: null,
    },
  ],
});

const makeComments = (n) => Array.from({ length: n }, (_, i) => makeComment(i + 1));

const mountSimple = (props = {}) =>
  mount(CommentSimple, {
    props: {
      comments: makeComments(2),
      currentUser: me,
      remoteHasMore: true,
      sort: "latest", // 默认最新：c1 最新排第一，用例断言基于此顺序
      ...props,
    },
    global: globalConfig,
  });

const findButton = (wrapper, text) =>
  wrapper.findAll("button").find((b) => b.text().includes(text));

// jsdom 无真实布局：把 window 作为滚动容器，手动控制几何指标触发触底判断
const simulateAtBottom = (atBottom = true) => {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 500 });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: atBottom ? 600 : 5000,
  });
  Object.defineProperty(document.documentElement, "scrollTop", {
    configurable: true,
    value: atBottom ? 100 : 0,
  });
  window.dispatchEvent(new Event("scroll"));
};

beforeEach(() => {
  vi.useRealTimers();
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("CommentSimple 基础渲染", () => {
  it("空列表展示 ElEmpty 引导文案", () => {
    const wrapper = mountSimple({ comments: [] });
    expect(wrapper.text()).toContain("还没有评论");
  });

  it("有数据时渲染评论内容、楼层、楼中楼预览", () => {
    const wrapper = mountSimple();
    expect(wrapper.text()).toContain("评论内容1");
    expect(wrapper.text()).toContain("第1楼");
    expect(wrapper.text()).toContain("楼中楼1");
    // 头部总数
    expect(wrapper.text()).toContain("2");
  });

  it("评论数为 0 时头部总数展示 0", () => {
    const wrapper = mountSimple({ comments: [] });
    expect(wrapper.find(".bili-comment-header").text()).toContain("0");
  });
});

describe("CommentSimple 发送一级评论", () => {
  it("输入内容发布：乐观插入并 emit send（携带 opId），输入框清空", async () => {
    const wrapper = mountSimple();
    await wrapper.find(".bili-comment-editor__collapse").trigger("click");
    await wrapper.find("textarea").setValue("我发的评论");
    await findButton(wrapper, "发布").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("我发的评论");
    const events = wrapper.emitted("send");
    expect(events).toHaveLength(1);
    expect(events[0][0]).toMatchObject({
      content: "我发的评论",
      opId: expect.any(String),
    });
    // 发布后输入框收起（collapsible 模式发送后折叠），无残留 textarea
    expect(wrapper.findAll("textarea").length).toBe(0);
  });

  it("纯空格内容不可发布", async () => {
    const wrapper = mountSimple();
    await wrapper.find(".bili-comment-editor__collapse").trigger("click");
    await wrapper.find("textarea").setValue("   ");
    const publish = findButton(wrapper, "发布");
    // 空内容发布按钮禁用
    expect(publish.attributes("disabled")).toBeDefined();
    await publish.trigger("click");
    expect(wrapper.emitted("send")).toBeFalsy();
  });
});

describe("CommentSimple 点赞", () => {
  it("一级评论点赞：乐观翻转 +1 并 emit like", async () => {
    const wrapper = mountSimple();
    const likeBtn = wrapper.find(".bili-comment-item__like");
    expect(likeBtn.text()).toContain("(1)");
    await likeBtn.trigger("click");
    await flushPromises();
    expect(wrapper.find(".bili-comment-item__like").text()).toContain("(2)");
    const events = wrapper.emitted("like");
    expect(events).toHaveLength(1);
    expect(events[0][0]).toMatchObject({ liked: true, opId: expect.any(String) });
  });

  it("楼中楼回复点赞：emit like 携带 reply", async () => {
    const wrapper = mountSimple();
    await wrapper.find(".bili-reply-item__like").trigger("click");
    await flushPromises();
    const events = wrapper.emitted("like");
    expect(events).toHaveLength(1);
    expect(events[0][0].reply).toBeTruthy();
    expect(events[0][0].reply.id).toBe("r1");
  });
});

describe("CommentSimple 回复框就近展开", () => {
  it("点击回复：内联编辑器展开，发送后 emit reply 携带 commentId 与 opId", async () => {
    const wrapper = mountSimple();
    // 点第一条评论的「回复」按钮（直接 DOM 定位：含「回复」文本且非删除/点赞）
    const actionEls = Array.from(
      wrapper.element.querySelectorAll(".bili-comment-item__action"),
    );
    const replyEl = actionEls.find((el) => /回复\(\d+\)/.test(el.textContent));
    expect(replyEl).toBeTruthy();
    replyEl.dispatchEvent(new Event("click", { bubbles: true }));
    await flushPromises();
    await flushPromises();

    // 出现内联回复编辑器
    const editor = wrapper.element.querySelector(".bili-reply-list__editor");
    expect(editor).toBeTruthy();
    // 填写输入框（Element Plus 渲染为 textarea）
    const ta = editor.querySelector("textarea");
    expect(ta).toBeTruthy();
    ta.value = "回复内容";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();
    // 点击编辑器内的「回复」提交按钮
    const submitBtn = Array.from(editor.querySelectorAll("button")).find((b) =>
      b.textContent.includes("回复"),
    );
    expect(submitBtn).toBeTruthy();
    submitBtn.dispatchEvent(new Event("click", { bubbles: true }));
    await flushPromises();

    const events = wrapper.emitted("reply");
    expect(events).toHaveLength(1);
    expect(events[0][0]).toMatchObject({
      commentId: expect.anything(),
      content: "回复内容",
      opId: expect.any(String),
    });
  });
});

describe("CommentSimple 删除权限", () => {
  const { confirmFn } = vi.hoisted(() => ({ confirmFn: vi.fn() }));
  vi.mock("element-plus", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, ElMessageBox: { ...actual.ElMessageBox, confirm: confirmFn } };
  });

  beforeEach(() => confirmFn.mockReset());

  it("自己的评论显示删除按钮，确认后移除并 emit delete", async () => {
    confirmFn.mockResolvedValueOnce("confirm");
    const comments = [
      { ...makeComment(1), author: { ...me, name: "我" } },
      makeComment(2),
    ];
    const wrapper = mountSimple({ comments });
    expect(wrapper.find(".bili-comment-item__delete").exists()).toBe(true);
    await wrapper.find(".bili-comment-item__delete").trigger("click");
    await flushPromises();
    expect(wrapper.text()).not.toContain("评论内容1");
    expect(wrapper.emitted("delete")).toHaveLength(1);
  });

  it("非本人且非管理员：不显示删除按钮", () => {
    const wrapper = mountSimple(); // 作者 u1/u2，currentUser me
    expect(wrapper.find(".bili-comment-item__delete").exists()).toBe(false);
  });

  it("管理员可删除他人评论", async () => {
    confirmFn.mockResolvedValueOnce("confirm");
    const wrapper = mountSimple({
      currentUser: { ...me, role: "admin" },
    });
    expect(wrapper.find(".bili-comment-item__delete").exists()).toBe(true);
    await wrapper.find(".bili-comment-item__delete").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("delete")).toHaveLength(1);
  });
});

describe("CommentSimple 排序", () => {
  it("切换排序：点击「最热」（非当前值）emit update:sort", async () => {
    const wrapper = mountSimple();
    // 当前 sort=latest，点击「最热」（第一个 tab）会触发变更
    const hotTab = wrapper.find(".bili-comment-header__tab");
    expect(hotTab.exists()).toBe(true);
    await hotTab.trigger("click");
    await flushPromises();
    expect(wrapper.emitted("update:sort")).toBeTruthy();
    expect(wrapper.emitted("update:sort").at(-1)[0]).toBe("hot");
  });

  it("受控 sort=floor：楼层升序展示", () => {
    const comments = [makeComment(3), makeComment(1), makeComment(2)];
    const wrapper = mountSimple({ comments, sort: "floor" });
    const floors = wrapper
      .findAll(".bili-comment-item__floor")
      .map((el) => el.text());
    expect(floors).toEqual(["第1楼", "第2楼", "第3楼"]);
  });
});

describe("CommentSimple 远程加载（触底 load-more）", () => {
  it("触底时 emit load-more", async () => {
    const wrapper = mountSimple();
    await flushPromises();
    simulateAtBottom(true);
    await flushPromises();
    expect(wrapper.emitted("load-more")).toBeTruthy();
  });

  it("bottomArmed 防级联：停在底部不重复 emit", async () => {
    const wrapper = mountSimple();
    await flushPromises();
    simulateAtBottom(true);
    simulateAtBottom(true); // 仍在底部，不应再次触发
    simulateAtBottom(true);
    await flushPromises();
    expect(wrapper.emitted("load-more")).toHaveLength(1);
  });

  it("离开底部后重新武装：再次触底可重新 emit", async () => {
    const wrapper = mountSimple();
    await flushPromises();
    simulateAtBottom(true); // 第 1 次
    simulateAtBottom(false); // 离开底部 → 重新武装
    simulateAtBottom(true); // 再次触底 → 第 2 次
    await flushPromises();
    expect(wrapper.emitted("load-more")).toHaveLength(2);
  });

  it("loading=true 时抑制 load-more", async () => {
    const wrapper = mountSimple({ loading: true });
    await flushPromises();
    simulateAtBottom(true);
    await flushPromises();
    expect(wrapper.emitted("load-more")).toBeFalsy();
  });

  it("remoteHasMore=false 时不 emit load-more", async () => {
    const wrapper = mountSimple({ remoteHasMore: false });
    await flushPromises();
    simulateAtBottom(true);
    await flushPromises();
    expect(wrapper.emitted("load-more")).toBeFalsy();
  });
});

describe("CommentSimple 底部状态文本", () => {
  it("loading=true 展示「加载中...」", () => {
    const wrapper = mountSimple({ loading: true });
    expect(wrapper.text()).toContain("加载中");
  });

  it("remoteHasMore=false 展示「没有更多评论了」", () => {
    const wrapper = mountSimple({ remoteHasMore: false });
    expect(wrapper.text()).toContain("没有更多评论了");
  });

  it("默认（hasMore 且非 loading）不展示结束态文本", () => {
    const wrapper = mountSimple();
    expect(wrapper.text()).not.toContain("没有更多评论了");
    expect(wrapper.text()).not.toContain("加载中");
  });
});

describe("CommentSimple 吸顶", () => {
  it("头部与输入区包裹在吸顶容器内", () => {
    const wrapper = mountSimple();
    expect(wrapper.find(".bili-comment__top--sticky").exists()).toBe(true);
  });

  it("存在吸顶检测哨兵", () => {
    const wrapper = mountSimple();
    expect(wrapper.find(".bili-comment__sticky-sentinel").exists()).toBe(true);
  });
});

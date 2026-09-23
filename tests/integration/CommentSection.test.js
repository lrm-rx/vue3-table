// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

// jsdom 不布局：模拟虚拟列表视口高度并等待测量/重渲染
const prepareVirtual = async (wrapper) => {
  Object.defineProperty(wrapper.find(".biz-virtual-list").element, "clientHeight", {
    configurable: true,
    value: 600,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

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
        floor: 1, // 楼层号由后端随数据返回
        replies: [],
      },
    ];
    const wrapper = mountSection({ comments });
    expect(wrapper.text()).toContain("你好，评论区");
    expect(wrapper.text()).toContain("第1楼");
    expect(wrapper.text()).toContain("张三");
  });

  it("完全不传 comments（undefined 走默认值）时展示空状态引导", () => {
    const wrapper = mount(CommentSection, { global: globalConfig });
    expect(wrapper.text()).toContain("还没有评论，快来抢沙发吧");
  });
});

describe("CommentSection 发送一级评论", () => {
  it("输入内容点击发布：乐观插入并抛出 send 事件；楼层由 settle 回填后才展示", async () => {
    const wrapper = mountSection();
    // 新版顶部输入框为折叠态，先点击展开
    await wrapper.find(".bili-comment-editor__collapse").trigger("click");
    await wrapper.find("textarea").setValue("我的第一条评论");
    await findButton(wrapper, "发布").trigger("click");
    await flushPromises();

    // 列表立即展示内容，但楼层号由后端生成，settle 回填前不渲染「第 n 楼」元素
    expect(wrapper.text()).toContain("我的第一条评论");
    expect(wrapper.find(".bili-comment-item__floor").exists()).toBe(false);
    // 事件：send(payload 为 { content, opId }) + v-model 同步 + 自动切到「最新」
    expect(wrapper.emitted("send")?.[0]?.[0]).toMatchObject({
      content: "我的第一条评论",
      opId: expect.any(String),
    });
    expect(wrapper.emitted("update:comments")).toBeTruthy();
    expect(wrapper.emitted("update:sort")?.[0]).toEqual(["latest"]);

    // 模拟后端返回带真实楼层的评论 → settle 回填 → 展示「第 n 楼」
    const { opId } = wrapper.emitted("send")[0][0];
    wrapper.vm.settle(opId, { floor: 1000 });
    await flushPromises();
    expect(wrapper.text()).toContain("第1000楼");
  });

  it("纯空格内容不可发布", async () => {
    const wrapper = mountSection();
    await wrapper.find(".bili-comment-editor__collapse").trigger("click");
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
    expect(wrapper.text()).toContain("点赞(4)");
  });
});

// —— 操作条文本按钮 / 计数 / 删除权限 ——
const makeFixture = () => ({
  id: "c1",
  author: { id: "u1", name: "张三", avatar: "" },
  content: "求点赞",
  createTime: Date.now(),
  likeCount: 3,
  liked: false,
  replies: [
    {
      id: "r1",
      author: { id: "u2", name: "李四", avatar: "" },
      content: "帮顶",
      createTime: Date.now(),
      likeCount: 2,
      liked: false,
      replyTo: null,
    },
  ],
});

// 确认 ElMessageBox 弹窗（删除流程第二步）
const confirmMessageBox = async () => {
  await flushPromises();
  const btn = document.querySelector(".el-message-box__btns .el-button--primary");
  expect(btn).toBeTruthy();
  btn.click();
  await flushPromises();
};

describe("CommentSection 回复框就近展开", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("点根评论回复：编辑器出现在楼中楼卡片顶部（首条回复之前）", async () => {
    const wrapper = mountSection({ comments: [makeFixture()] });
    // 初始不渲染编辑器
    expect(wrapper.findAll(".bili-reply-list__editor")).toHaveLength(0);

    // 一级评论操作条上的「回复(1)」
    await findButton(wrapper, "回复(1)").trigger("click");
    await flushPromises();

    const list = wrapper.find(".bili-reply-list");
    const first = list.element.children[0];
    expect(first.classList.contains("bili-reply-list__editor")).toBe(true);
    expect(first.querySelector("textarea").getAttribute("placeholder")).toContain(
      "回复 @张三",
    );
  });

  it("点某条回复的回复：编辑器插在该条回复正下方", async () => {
    const wrapper = mountSection({ comments: [makeFixture()] });
    // 楼中楼内纯文本「回复」按钮（r1 的）
    const replyBtns = wrapper
      .findAll(".bili-reply-item .el-button")
      .filter((b) => b.text().trim() === "回复");
    await replyBtns[0].trigger("click");
    await flushPromises();

    const items = wrapper.findAll(".bili-reply-item");
    const editorEl = items[0].element.nextElementSibling;
    expect(editorEl).toBeTruthy();
    expect(editorEl.classList.contains("bili-reply-list__editor")).toBe(true);
    expect(editorEl.querySelector("textarea").getAttribute("placeholder")).toContain(
      "回复 @李四",
    );
    // 卡片顶部不出现编辑器（第一个子元素是回复行，不是编辑器）
    const list = wrapper.find(".bili-reply-list");
    expect(
      list.element.children[0].classList.contains("bili-reply-list__editor"),
    ).toBe(false);
  });
});

describe("CommentSection 操作条文本按钮与计数", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("点赞/回复为文本按钮并展示计数，无点踩", () => {
    const wrapper = mountSection({ comments: [makeFixture()] });
    expect(wrapper.text()).toContain("点赞(3)");
    expect(wrapper.text()).toContain("回复(1)");
    expect(wrapper.text()).not.toContain("点踩");
  });

  it("楼中楼点赞展示计数并上抛 like 事件（携带 reply）", async () => {
    const wrapper = mountSection({ comments: [makeFixture()] });
    await wrapper.find(".bili-reply-item__like").trigger("click");

    const likeEvents = wrapper.emitted("like");
    expect(likeEvents).toHaveLength(1);
    expect(likeEvents[0][0].reply.id).toBe("r1");
    expect(likeEvents[0][0].liked).toBe(true);
    expect(wrapper.find(".bili-reply-item__like").text()).toBe("点赞(3)");
  });
});

describe("CommentSection 删除", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("自己的评论显示删除按钮，确认后移除并抛出 delete 事件", async () => {
    const comment = {
      id: "c1",
      author: { id: "me", name: "我", avatar: "" },
      content: "我发的评论",
      createTime: Date.now(),
      likeCount: 1,
      liked: false,
      replies: [],
    };
    const wrapper = mountSection({ comments: [comment] });
    await findButton(wrapper, "删除").trigger("click");
    await confirmMessageBox();

    const deleteEvents = wrapper.emitted("delete");
    expect(deleteEvents).toHaveLength(1);
    expect(deleteEvents[0][0].comment.id).toBe("c1");
    expect(deleteEvents[0][0].reply).toBe(null);
    expect(wrapper.text()).not.toContain("我发的评论");
  });

  it("非本人且非管理员：不显示删除按钮", () => {
    const wrapper = mountSection({ comments: [makeFixture()] });
    expect(findButton(wrapper, "删除")).toBeUndefined();
  });

  it("管理员（role=admin）可删除他人评论", async () => {
    const wrapper = mountSection({
      comments: [makeFixture()],
      currentUser: { id: "me", name: "我", avatar: "", role: "admin" },
    });
    await findButton(wrapper, "删除").trigger("click");
    await confirmMessageBox();

    expect(wrapper.emitted("delete")).toHaveLength(1);
    expect(wrapper.text()).not.toContain("求点赞");
  });

  it("管理员可删除楼中楼他人回复：计数减一并抛出 reply", async () => {
    const comment = makeFixture();
    comment.replies = [
      {
        id: "r2",
        author: { id: "u2", name: "李四", avatar: "" },
        content: "帮我抢的楼",
        createTime: Date.now(),
        likeCount: 1,
        liked: false,
        replyTo: null,
      },
      {
        id: "r3",
        author: { id: "u3", name: "王五", avatar: "" },
        content: "帮顶",
        createTime: Date.now(),
        likeCount: 2,
        liked: false,
        replyTo: null,
      },
    ];
    const wrapper = mountSection({
      comments: [comment],
      currentUser: { id: "me", name: "我", avatar: "", role: "admin" },
    });
    // 一级评论非本人 → 本身无删除按钮，仅管理员可见
    expect(findButton(wrapper, "删除").text()).toContain("删除");
    // 楼中楼删除按钮：ReplyItem 层每个回复各一个
    await wrapper.findAll(".bili-reply-item__delete")[0].trigger("click");
    await confirmMessageBox();

    const deleteEvents = wrapper.emitted("delete");
    expect(deleteEvents).toHaveLength(1);
    expect(deleteEvents[0][0].reply.id).toBe("r2");
    expect(wrapper.text()).not.toContain("帮我抢的楼");
    expect(wrapper.text()).toContain("回复(1)");
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
    // 不渲染左侧楼层序号列，楼层统一显示在评论项昵称行右端
    expect(wrapper.find(".biz-virtual-list__index").exists()).toBe(false);
    // hot 排序 likeCount 全 0 → 时间倒序，首项为 floor=1
    expect(wrapper.find(".bili-comment-item__floor").text()).toBe("第1楼");
  });

  // 排序联动专用数据：hot 首项 floor=3，floor 升序首项 floor=1，latest 首项 floor=3
  const makeSortFixture = () => {
    const now = Date.now();
    const mk = (floor, likeCount, createTime) => ({
      id: `c${floor}`,
      floor,
      author: { id: `u${floor}`, name: `用户${floor}`, avatar: "" },
      content: `评论${floor}`,
      createTime,
      likeCount,
      liked: false,
      replies: [],
    });
    return [mk(1, 0, now - 3000), mk(2, 50, now - 2000), mk(3, 100, now - 1000)];
  };

  it("sort=floor 受控时楼层升序，最热/最新 Tab 切换排序口径", async () => {
    const wrapper = mount(CommentSection, {
      props: {
        comments: makeSortFixture(),
        currentUser: { id: "me", name: "我", avatar: "" },
        virtualScroll: true,
        listHeight: 600,
        sort: "floor",
      },
      global: globalConfig,
    });
    await prepareVirtual(wrapper);
    const firstFloor = () =>
      wrapper.findAll(".bili-comment-item__floor")[0]?.text();

    // 受控楼层升序：首项 floor=1，且不渲染左侧序号列
    expect(firstFloor()).toBe("第1楼");
    expect(wrapper.find(".biz-virtual-list__index").exists()).toBe(false);

    // 点「最新」Tab → 楼层倒序，首项 floor=3
    await findButton(wrapper, "最新").trigger("click");
    expect(firstFloor()).toBe("第3楼");
    expect(wrapper.emitted("update:sort").at(-1)).toEqual(["latest"]);

    // 点「最热」Tab → 点赞降序，首项 floor=3
    await findButton(wrapper, "最热").trigger("click");
    expect(firstFloor()).toBe("第3楼");
    expect(wrapper.emitted("update:sort").at(-1)).toEqual(["hot"]);
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

  it("虚拟模式下发送评论：新评论立即出现在窗口顶部，settle 回填楼层后展示", async () => {
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

    await wrapper.find(".bili-comment-editor__collapse").trigger("click");
    await wrapper.find("textarea").setValue("虚拟滚动下的新评论");
    await findButton(wrapper, "发布").trigger("click");
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 第一条虚拟列表项：CommentItem 显示正文；楼层由后端生成，settle 前不展示
    const firstRow = wrapper.findAll(".biz-virtual-list__item")[0];
    expect(firstRow.find(".bili-comment-item").text()).toContain(
      "虚拟滚动下的新评论",
    );
    expect(firstRow.find(".bili-comment-item__floor").exists()).toBe(false);

    // 模拟后端返回真实楼层 → settle 回填 → 展示「第 n 楼」
    const { opId } = wrapper.emitted("send")[0][0];
    wrapper.vm.settle(opId, { floor: 101 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(firstRow.find(".bili-comment-item__floor").text()).toBe("第101楼");
  });

  it("虚拟模式下发布并删除自己的一级评论：回填真实记录后删除，行移除且 delete 事件上抛", async () => {
    const wrapper = mount(CommentSection, {
      props: {
        comments: makeMany(100),
        currentUser: { id: "me", name: "我", avatar: "", role: "admin" },
        virtualScroll: true,
        listHeight: 600,
      },
      global: globalConfig,
    });
    await prepareVirtual(wrapper);

    // 发布新评论（自动切 latest，出现在窗口顶部）
    await wrapper.find(".bili-comment-editor__collapse").trigger("click");
    await wrapper.find("textarea").setValue("待删除的回归评论");
    await findButton(wrapper, "发布").trigger("click");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wrapper.text()).toContain("待删除的回归评论");

    // 新评论为临时 id（在途）：删除按钮应禁用，不能删除
    const firstRow = () => wrapper.findAll(".biz-virtual-list__item")[0];
    expect(
      firstRow().find(".bili-comment-item__delete").attributes("disabled"),
    ).toBeDefined();

    // 模拟创建成功：settle 回填服务端真实 id（非 tmp_ 前缀）→ 按钮恢复可用
    const { opId } = wrapper.emitted("send")[0][0];
    wrapper.vm.settle(opId, { id: "svc_root_new", floor: 101 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      firstRow().find(".bili-comment-item__delete").attributes("disabled"),
    ).toBeUndefined();

    // 点第一条评论的「删除」→ 确认弹窗
    await firstRow().find(".bili-comment-item__delete").trigger("click");
    await confirmMessageBox();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 行已移除、事件上抛、虚拟列表仍正常渲染
    expect(wrapper.text()).not.toContain("待删除的回归评论");
    const deleteEvents = wrapper.emitted("delete");
    expect(deleteEvents).toHaveLength(1);
    expect(deleteEvents[0][0]).toMatchObject({
      comment: { content: "待删除的回归评论" },
      reply: null,
    });
    expect(wrapper.findAll(".bili-comment-item").length).toBeGreaterThan(0);
  });
});

describe("CommentSection 远程加载模式", () => {
  beforeEach(() => {
    const roEnv = createResizeObserverMock(200);
    global.ResizeObserver = roEnv.ResizeObserverMock;
    vi.stubGlobal("IntersectionObserver", createIntersectionObserverMock());
  });
  afterEach(() => {
    delete global.ResizeObserver;
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  // 可控制的 IntersectionObserver mock：通过 trigger 手动让哨兵「进入视口」
  const createIntersectionObserverMock = () => {
    let callback = null;
    const instances = [];
    const Mock = class {
      constructor(cb) {
        callback = cb;
        this.observe = () => {};
        this.unobserve = () => {};
        this.disconnect = () => {};
        instances.push(this);
      }
    };
    Mock.trigger = () => {
      if (callback) callback([{ isIntersecting: true }]);
    };
    return Mock;
  };

  const makeComments = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `c${i + 1}`,
      floor: i + 1,
      author: { id: "u", name: `用户${i + 1}`, avatar: "" },
      content: `内容${i + 1}`,
      createTime: Date.now() - i * 60000,
      likeCount: 0,
      liked: false,
      replies: [],
    }));

  it("远程模式不显示「点击加载更多」按钮，而是渲染哨兵元素", () => {
    const wrapper = mountSection({
      comments: makeComments(5),
      remote: true,
      remoteHasMore: true,
    });
    expect(wrapper.find(".bili-comment__sentinel").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("点击加载更多评论");
  });

  it("哨兵进入视口时 emit load-more（非虚拟模式）", async () => {
    const MockIO = createIntersectionObserverMock();
    vi.stubGlobal("IntersectionObserver", MockIO);
    const wrapper = mountSection({
      comments: makeComments(5),
      remote: true,
      remoteHasMore: true,
    });
    // onMounted 用 requestAnimationFrame 延迟建立哨兵观察，等 rAF 落地
    await new Promise((r) => requestAnimationFrame(r));
    MockIO.trigger();
    expect(wrapper.emitted("load-more")).toBeTruthy();
    expect(wrapper.emitted("load-more").length).toBe(1);
  });

  it("loading 为 true 时不重复 emit load-more", async () => {
    const MockIO = createIntersectionObserverMock();
    vi.stubGlobal("IntersectionObserver", MockIO);
    const wrapper = mountSection({
      comments: makeComments(5),
      remote: true,
      remoteHasMore: true,
      loading: true,
    });
    await new Promise((r) => requestAnimationFrame(r));
    MockIO.trigger();
    expect(wrapper.emitted("load-more")).toBeFalsy();
  });

  it("remoteHasMore=false 时显示「没有更多评论了」且不再 emit load-more", async () => {
    const MockIO = createIntersectionObserverMock();
    vi.stubGlobal("IntersectionObserver", MockIO);
    const wrapper = mountSection({
      comments: makeComments(5),
      remote: true,
      remoteHasMore: false,
    });
    await new Promise((r) => requestAnimationFrame(r));
    expect(wrapper.text()).toContain("没有更多评论了");
    MockIO.trigger();
    expect(wrapper.emitted("load-more")).toBeFalsy();
  });

  it("远程模式直接渲染全量已加载数据（不做 displayCount 切片）", () => {
    const data = makeComments(30);
    const wrapper = mountSection({
      comments: data,
      remote: true,
      remoteHasMore: true,
      pageSize: 10, // 本地模式只会显示 10 条
    });
    expect(wrapper.findAll(".bili-comment-item").length).toBe(30);
  });

  it("本地模式（remote=false）不受影响：仍显示切片 + 点击加载更多按钮", () => {
    const wrapper = mountSection({
      comments: makeComments(30),
      remote: false,
      pageSize: 10,
    });
    expect(wrapper.findAll(".bili-comment-item").length).toBe(10);
    expect(wrapper.text()).toContain("点击加载更多评论");
    expect(wrapper.find(".bili-comment__sentinel").exists()).toBe(false);
  });

  it("虚拟模式转发 VirtualList 的 load-more 事件", async () => {
    const data = makeComments(200);
    const wrapper = mountSection({
      comments: data,
      remote: true,
      remoteHasMore: true,
      virtualScroll: true,
      listHeight: 400,
    });
    await prepareVirtual(wrapper);
    // VirtualList 触底时 emit load-more → CommentSection 转发
    const vl = wrapper.findComponent({ name: "VirtualList" });
    vl.vm.$emit("load-more");
    await flushPromises();
    expect(wrapper.emitted("load-more")).toBeTruthy();
  });

  it("虚拟模式 remoteHasMore=false 时 footer 显示「没有更多评论了」", async () => {
    const data = makeComments(200);
    const wrapper = mountSection({
      comments: data,
      remote: true,
      remoteHasMore: false,
      virtualScroll: true,
      listHeight: 400,
    });
    await prepareVirtual(wrapper);
    expect(wrapper.find(".biz-virtual-list__footer").text()).toContain(
      "没有更多评论了",
    );
  });
});

describe("CommentSection 本地模式自动加载（autoLoadMore）", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  // 可控 IntersectionObserver mock：trigger 手动让哨兵「进入视口」
  const createIntersectionObserverMock = () => {
    let callback = null;
    const Mock = class {
      constructor(cb) {
        callback = cb;
        this.observe = () => {};
        this.unobserve = () => {};
        this.disconnect = () => {};
      }
    };
    Mock.trigger = () => {
      if (callback) callback([{ isIntersecting: true }]);
    };
    return Mock;
  };

  const makeComments = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `c${i + 1}`,
      floor: i + 1,
      author: { id: "u", name: `用户${i + 1}`, avatar: "" },
      content: `内容${i + 1}`,
      createTime: Date.now() - i * 60000,
      likeCount: 0,
      liked: false,
      replies: [],
    }));

  it("默认关闭：仍显示「点击加载更多」按钮且无哨兵", () => {
    const wrapper = mountSection({ comments: makeComments(30), pageSize: 10 });
    expect(wrapper.text()).toContain("点击加载更多评论");
    expect(wrapper.find(".bili-comment__sentinel").exists()).toBe(false);
  });

  it("autoLoadMore=true：按钮隐藏、渲染哨兵，触底自动扩容切片且不 emit load-more", async () => {
    const MockIO = createIntersectionObserverMock();
    vi.stubGlobal("IntersectionObserver", MockIO);
    const wrapper = mountSection({
      comments: makeComments(30),
      pageSize: 10,
      autoLoadMore: true,
    });
    // onMounted 用 requestAnimationFrame 延迟建立哨兵观察，等 rAF 落地
    await new Promise((r) => requestAnimationFrame(r));
    expect(wrapper.text()).not.toContain("点击加载更多评论");
    expect(wrapper.find(".bili-comment__sentinel").exists()).toBe(true);

    MockIO.trigger();
    await flushPromises();
    expect(wrapper.findAll(".bili-comment-item").length).toBe(20);
    // 本地扩容是组件内部行为，不走 load-more 事件
    expect(wrapper.emitted("load-more")).toBeFalsy();
  });

  it("切片耗尽后哨兵触发不再扩容（hasMore 兜底），哨兵随之卸载", async () => {
    const MockIO = createIntersectionObserverMock();
    vi.stubGlobal("IntersectionObserver", MockIO);
    const wrapper = mountSection({
      comments: makeComments(15),
      pageSize: 10,
      autoLoadMore: true,
    });
    await new Promise((r) => requestAnimationFrame(r));
    MockIO.trigger();
    await flushPromises();
    expect(wrapper.findAll(".bili-comment-item").length).toBe(15);
    // 耗尽终态：哨兵卸载并显示「没有更多评论了」
    expect(wrapper.find(".bili-comment__sentinel").exists()).toBe(false);
    expect(wrapper.text()).toContain("没有更多评论了");
  });
});

describe("CommentSection 吸顶头部", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  // 可控 IntersectionObserver mock：trigger 手动派发指定 entries（吸顶态检测用）
  const createStickyObserverMock = () => {
    let callback = null;
    const Mock = class {
      constructor(cb) {
        callback = cb;
        this.observe = () => {};
        this.unobserve = () => {};
        this.disconnect = () => {};
      }
    };
    Mock.trigger = (entries) => {
      if (callback) callback(entries);
    };
    return Mock;
  };

  it("非虚拟模式：头部与输入区包进吸顶容器（--sticky 类）", () => {
    const wrapper = mountSection({ comments: [] });
    const top = wrapper.find(".bili-comment__top");
    expect(top.exists()).toBe(true);
    expect(top.classes()).toContain("bili-comment__top--sticky");
    // CommentHeader 与 CommentEditor 都渲染在吸顶容器内
    expect(top.find(".bili-comment-header").exists()).toBe(true);
    expect(top.find(".bili-comment-editor").exists()).toBe(true);
  });

  it("吸顶检测哨兵紧贴头部之前（sticky 受 .bili-comment 父级边界约束）", () => {
    const wrapper = mountSection({ comments: [] });
    const root = wrapper.find(".bili-comment");
    const children = root.element.children;
    // 哨兵在前、吸顶容器紧随其后（哨兵负 margin 不占布局，仅作观察目标）
    expect(children[0].classList.contains("bili-comment__sticky-sentinel")).toBe(
      true,
    );
    expect(children[1].classList.contains("bili-comment__top")).toBe(true);
    // 列表 / 空态在吸顶容器之后，保证吸顶可覆盖整个评论列表滚动区间
    expect(children[children.length - 1].classList.contains("bili-comment__top")).toBe(
      false,
    );
  });

  it("虚拟滚动模式：容器存在但不吸顶（列表自带视口，头部天然常驻）", () => {
    const wrapper = mountSection({
      comments: [],
      virtualScroll: true,
      listHeight: 400,
    });
    const top = wrapper.find(".bili-comment__top");
    expect(top.exists()).toBe(true);
    expect(top.find(".bili-comment-header").exists()).toBe(true);
    expect(top.find(".bili-comment-editor").exists()).toBe(true);
    expect(top.classes()).not.toContain("bili-comment__top--sticky");
  });

  it("动态切换 virtualScroll：吸顶类随之增减", async () => {
    const wrapper = mountSection({ comments: [] });
    expect(wrapper.find(".bili-comment__top").classes()).toContain(
      "bili-comment__top--sticky",
    );
    await wrapper.setProps({ virtualScroll: true });
    expect(wrapper.find(".bili-comment__top").classes()).not.toContain(
      "bili-comment__top--sticky",
    );
    await wrapper.setProps({ virtualScroll: false });
    expect(wrapper.find(".bili-comment__top").classes()).toContain(
      "bili-comment__top--sticky",
    );
  });

  it("吸顶态阴影：哨兵越过视口顶进入 is-stuck，回滚后解除；评论区未进屏不误判", async () => {
    const MockIO = createStickyObserverMock();
    vi.stubGlobal("IntersectionObserver", MockIO);
    const wrapper = mountSection({ comments: [] });
    // 等 VueUse 建立观察（模板 ref 挂载后 observe）
    await new Promise((r) => requestAnimationFrame(r));
    const classes = () => wrapper.find(".bili-comment__top").classes();

    // 评论区尚在视口下方：未相交但在视口下侧 → 不算吸顶
    MockIO.trigger([
      { isIntersecting: false, boundingClientRect: { top: 300 } },
    ]);
    await flushPromises();
    expect(classes()).not.toContain("is-stuck");

    // 哨兵越过滚动容器可视顶 → is-stuck
    MockIO.trigger([
      { isIntersecting: false, boundingClientRect: { top: -2 } },
    ]);
    await flushPromises();
    expect(classes()).toContain("is-stuck");

    // 回滚：哨兵重新进入视口 → 解除
    MockIO.trigger([{ isIntersecting: true, boundingClientRect: { top: 0 } }]);
    await flushPromises();
    expect(classes()).not.toContain("is-stuck");
  });
});

describe("CommentSection 楼中楼展开/收起与回复删除", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });
  const makeManyReplies = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `r${i + 1}`,
      author: { id: `ru${i + 1}`, name: `回复者${i + 1}`, avatar: "" },
      content: `回复内容${i + 1}`,
      createTime: Date.now() - i * 1000,
      likeCount: 0,
      liked: false,
      replyTo: null,
    }));

  it("回复数超过预览数：展示「查看全部」，点击展开全部，再点收起", async () => {
    const comments = [
      {
        id: "c1",
        floor: 1,
        author: { id: "u1", name: "楼主", avatar: "" },
        content: "主评论",
        createTime: Date.now(),
        likeCount: 0,
        liked: false,
        replies: makeManyReplies(5), // 默认预览 2 条
      },
    ];
    const wrapper = mountSection({ comments });
    // 默认只预览 2 条
    expect(wrapper.text()).toContain("回复内容1");
    expect(wrapper.text()).toContain("回复内容2");
    expect(wrapper.text()).not.toContain("回复内容5");
    expect(wrapper.text()).toContain("查看全部 5 条回复");

    // 点击展开
    await wrapper.find(".bili-reply-list__toggle").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("回复内容5");
    expect(wrapper.text()).toContain("收起回复");

    // 点击收起
    await wrapper.find(".bili-reply-list__toggle").trigger("click");
    await flushPromises();
    expect(wrapper.text()).not.toContain("回复内容5");
    expect(wrapper.text()).toContain("查看全部 5 条回复");
  });

  it("回复数不超过预览数：不展示展开切换按钮", () => {
    const comments = [
      {
        id: "c1",
        floor: 1,
        author: { id: "u1", name: "楼主", avatar: "" },
        content: "主评论",
        createTime: Date.now(),
        likeCount: 0,
        liked: false,
        replies: makeManyReplies(2),
      },
    ];
    const wrapper = mountSection({ comments });
    expect(wrapper.find(".bili-reply-list__toggle").exists()).toBe(false);
  });

  it("管理员可删除楼中楼他人回复：确认后移除并 emit delete 携带 reply", async () => {
    const comments = [
      {
        id: "c1",
        floor: 1,
        author: { id: "u1", name: "楼主", avatar: "" },
        content: "主评论",
        createTime: Date.now(),
        likeCount: 0,
        liked: false,
        replies: makeManyReplies(3),
      },
    ];
    const wrapper = mountSection({
      comments,
      currentUser: { id: "admin", name: "管理员", avatar: "", role: "admin" },
    });
    expect(wrapper.text()).toContain("回复内容1");
    await wrapper.find(".bili-reply-item__delete").trigger("click");
    await confirmMessageBox();
    await flushPromises();
    expect(wrapper.text()).not.toContain("回复内容1");
    const events = wrapper.emitted("delete");
    expect(events).toHaveLength(1);
    expect(events[0][0].reply).toBeTruthy();
    expect(events[0][0].reply.id).toBe("r1");
  });
});

describe("CommentSection 输入框 maxlength 与快捷键", () => {
  it("maxlength 透传到输入框", async () => {
    const wrapper = mountSection({ maxlength: 88 });
    await wrapper.find(".bili-comment-editor__collapse").trigger("click");
    const ta = wrapper.find("textarea");
    expect(Number(ta.attributes("maxlength"))).toBe(88);
  });

  it("空内容时发布按钮禁用", async () => {
    const wrapper = mountSection();
    await wrapper.find(".bili-comment-editor__collapse").trigger("click");
    const publish = findButton(wrapper, "发布");
    expect(publish.attributes("disabled")).toBeDefined();
  });
});

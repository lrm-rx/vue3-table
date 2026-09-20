// @vitest-environment jsdom
/**
 * 评论区删除功能单元测试（组件级隔离，不经由 CommentSection）：
 *  - CommentItem：删除权限（本人 / 他人非管理员 / 管理员 role='admin'）与删除确认流
 *  - ReplyItem：删除权限与 delete 事件上抛（确认弹窗由 CommentItem 负责）
 *
 * ElMessageBox.confirm 以 mock 注入：真实弹窗是单例，jsdom 中关闭离场动画不结束、
 * DOM 常驻，连续删除场景无法稳定驱动；此处只验证组件自身的确认流与事件契约，
 * 真实弹窗交互由 tests/integration/CommentSection.test.js 覆盖。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ElementPlus from "element-plus";
import zhCn from "element-plus/dist/locale/zh-cn";
import CommentItem from "../../src/components/comment/components/CommentItem.vue";
import ReplyItem from "../../src/components/comment/components/ReplyItem.vue";

const { confirmFn } = vi.hoisted(() => ({ confirmFn: vi.fn() }));

vi.mock("element-plus", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ElMessageBox: {
      ...actual.ElMessageBox,
      confirm: confirmFn,
    },
  };
});

const globalConfig = {
  plugins: [[ElementPlus, { locale: zhCn }]],
};

const me = { id: "me", name: "我", avatar: "" };
const admin = { id: "admin_1", name: "管理员", avatar: "", role: "admin" };
const other = { id: "u1", name: "张三", avatar: "" };
const other2 = { id: "u2", name: "李四", avatar: "" };

// 他人的一级评论 + 两条回复：r1 是「我」的回复，r2 是其他人的回复
const makeComment = (overrides = {}) => ({
  id: "c1",
  author: other,
  content: "求点赞",
  createTime: Date.now(),
  likeCount: 3,
  liked: false,
  replies: [
    {
      id: "r1",
      author: me,
      content: "我的回复",
      createTime: Date.now(),
      likeCount: 1,
      liked: false,
      replyTo: null,
    },
    {
      id: "r2",
      author: other2,
      content: "李四的回复",
      createTime: Date.now(),
      likeCount: 2,
      liked: false,
      replyTo: null,
    },
  ],
  ...overrides,
});

const mountItem = ({ comment = makeComment(), currentUser = me } = {}) =>
  mount(CommentItem, {
    props: { comment, currentUser },
    global: globalConfig,
  });

beforeEach(() => {
  confirmFn.mockReset();
});

describe("CommentItem 删除权限", () => {
  it("自己的评论显示删除按钮", () => {
    const wrapper = mountItem({ comment: makeComment({ author: me }) });
    expect(wrapper.find(".bili-comment-item__delete").exists()).toBe(true);
  });

  it("他人评论且非管理员：评论无删除按钮，回复仅自己的可删", () => {
    const wrapper = mountItem({ comment: makeComment(), currentUser: me });
    expect(wrapper.find(".bili-comment-item__delete").exists()).toBe(false);
    // r1 是自己的回复 → 有删除；r2 是他人的 → 没有
    expect(wrapper.findAll(".bili-reply-item__delete")).toHaveLength(1);
  });

  it("管理员（role=admin）：他人评论与他人回复都显示删除按钮", () => {
    const wrapper = mountItem({ comment: makeComment(), currentUser: admin });
    expect(wrapper.find(".bili-comment-item__delete").exists()).toBe(true);
    expect(wrapper.findAll(".bili-reply-item__delete")).toHaveLength(2);
  });

  it("role 为非 admin 值时不触发管理员权限", () => {
    const wrapper = mountItem({
      comment: makeComment(),
      currentUser: { ...me, role: "user" },
    });
    expect(wrapper.find(".bili-comment-item__delete").exists()).toBe(false);
    expect(wrapper.findAll(".bili-reply-item__delete")).toHaveLength(1);
  });
});

describe("CommentItem 删除确认流", () => {
  it("删除评论：确认后 emit delete，payload 为 { comment, reply: null }", async () => {
    confirmFn.mockResolvedValueOnce("confirm");
    const comment = makeComment({ author: me });
    const wrapper = mountItem({ comment, currentUser: me });

    await wrapper.find(".bili-comment-item__delete").trigger("click");
    await flushPromises();

    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(confirmFn.mock.calls[0][0]).toContain("确定删除这条评论吗");
    const events = wrapper.emitted("delete");
    expect(events).toHaveLength(1);
    expect(events[0][0].comment.id).toBe("c1");
    expect(events[0][0].reply).toBe(null);
  });

  it("删除评论：用户取消则不 emit delete", async () => {
    confirmFn.mockRejectedValueOnce(new Error("cancel"));
    const comment = makeComment({ author: me });
    const wrapper = mountItem({ comment, currentUser: me });

    await wrapper.find(".bili-comment-item__delete").trigger("click");
    await flushPromises();

    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("delete")).toBeFalsy();
  });

  it("删除回复：确认后 emit delete，payload 携带所属评论与该回复", async () => {
    confirmFn.mockResolvedValueOnce("confirm");
    const comment = makeComment();
    const wrapper = mountItem({ comment, currentUser: me });

    // r1 是自己的回复
    await wrapper.findAll(".bili-reply-item__delete")[0].trigger("click");
    await flushPromises();

    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(confirmFn.mock.calls[0][0]).toContain("确定删除这条回复吗");
    const events = wrapper.emitted("delete");
    expect(events).toHaveLength(1);
    expect(events[0][0].comment.id).toBe("c1");
    expect(events[0][0].reply.id).toBe("r1");
  });

  it("删除回复：用户取消则不 emit delete", async () => {
    confirmFn.mockRejectedValueOnce(new Error("cancel"));
    const comment = makeComment();
    const wrapper = mountItem({ comment, currentUser: me });

    await wrapper.findAll(".bili-reply-item__delete")[0].trigger("click");
    await flushPromises();

    expect(wrapper.emitted("delete")).toBeFalsy();
  });

  it("连续删除不同回复：每次确认各自 emit 一次", async () => {
    confirmFn.mockResolvedValue("confirm");
    const wrapper = mountItem({ comment: makeComment(), currentUser: admin });
    const deleteBtns = () => wrapper.findAll(".bili-reply-item__delete");

    // CommentItem 仅上抛不删数据（移除由 CommentSection 负责），两个按钮始终在
    await deleteBtns()[0].trigger("click");
    await deleteBtns()[1].trigger("click");
    await flushPromises();

    const events = wrapper.emitted("delete");
    expect(events).toHaveLength(2);
    expect(events[0][0].reply.id).toBe("r1");
    expect(events[1][0].reply.id).toBe("r2");
  });
});

describe("ReplyItem 删除", () => {
  const makeReply = (author = me) => ({
    id: "r9",
    author,
    content: "一条回复",
    createTime: Date.now(),
    likeCount: 2,
    liked: false,
    replyTo: null,
  });

  const mountReply = ({ reply, currentUser }) =>
    mount(ReplyItem, {
      props: { reply, currentUser },
      global: globalConfig,
    });

  it("本人回复显示删除按钮，点击直接 emit delete（确认弹窗由 CommentItem 负责）", async () => {
    const wrapper = mountReply({ reply: makeReply(), currentUser: me });
    expect(wrapper.find(".bili-reply-item__delete").exists()).toBe(true);

    await wrapper.find(".bili-reply-item__delete").trigger("click");
    expect(wrapper.emitted("delete")[0][0].id).toBe("r9");
    // 自身不弹确认框
    expect(confirmFn).not.toHaveBeenCalled();
  });

  it("他人回复非管理员无删除按钮，管理员可见且可上抛", async () => {
    const wrapper = mountReply({ reply: makeReply(other), currentUser: me });
    expect(wrapper.find(".bili-reply-item__delete").exists()).toBe(false);

    const adminWrapper = mountReply({
      reply: makeReply(other),
      currentUser: admin,
    });
    expect(adminWrapper.find(".bili-reply-item__delete").exists()).toBe(true);
    await adminWrapper.find(".bili-reply-item__delete").trigger("click");
    expect(adminWrapper.emitted("delete")[0][0].id).toBe("r9");
  });
});

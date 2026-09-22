// @vitest-environment jsdom
/**
 * 乐观更新回滚单元测试：
 *  - 写操作（点赞 / 发布 / 回复 / 删除）的事件 payload 携带 opId
 *  - 容器 defineExpose 暴露 settle(opId) / rollback(opId)
 *  - rollback 按操作前快照精确还原本地数据（点赞旧值、发布/回复按 id 移除、删除插回原位）
 *  - settle 丢弃快照，之后 rollback 无效（幂等无副作用）
 *
 * 两个容器组件（comment / commentSimple）的快照与回滚逻辑完全一致，故同一套用例参数化执行。
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ElementPlus from "element-plus";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import zhCn from "element-plus/dist/locale/zh-cn";
import CommentSection from "../../src/components/comment/index.vue";
import CommentSimple from "../../src/components/commentSimple/index.vue";

// jsdom 无 IntersectionObserver：comment 与 commentSimple 均使用它做吸顶态检测
beforeAll(() => {
  if (!globalThis.IntersectionObserver) {
    class IO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.IntersectionObserver = IO;
  }
});

const { confirmFn } = vi.hoisted(() => ({ confirmFn: vi.fn() }));
vi.mock("element-plus", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ElMessageBox: { ...actual.ElMessageBox, confirm: confirmFn },
  };
});

const globalConfig = {
  plugins: [[ElementPlus, { locale: zhCn }]],
  components: Object.fromEntries(Object.entries(ElementPlusIconsVue)),
};

const me = { id: "me", name: "我", avatar: "", role: "admin" };

const makeComments = () => [
  {
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
  },
];

const likeCountOf = (wrapper) =>
  Number((wrapper.find(".bili-comment-item__like").text().match(/\((\d+)\)/) || [])[1]);

// 同一份用例对两个容器组件各跑一遍
for (const [name, Component, extraProps] of [
  ["comment（CommentSection）", CommentSection, {}],
  ["commentSimple", CommentSimple, { remoteHasMore: false }],
]) {
  describe(`乐观更新回滚 · ${name}`, () => {
    const mountComp = (comments = makeComments()) =>
      mount(Component, {
        props: { comments, currentUser: me, ...extraProps },
        global: globalConfig,
      });

    beforeEach(() => confirmFn.mockReset());
    afterEach(() => {
      document.body.innerHTML = "";
    });

    it("点赞：事件 payload 携带 opId，乐观翻转后 rollback 精确还原旧值", async () => {
      const wrapper = mountComp();
      expect(likeCountOf(wrapper)).toBe(3);

      await wrapper.find(".bili-comment-item__like").trigger("click");
      await flushPromises();

      // 乐观翻转
      expect(likeCountOf(wrapper)).toBe(4);
      const likeEvents = wrapper.emitted("like");
      expect(likeEvents).toHaveLength(1);
      const { opId, liked } = likeEvents[0][0];
      expect(typeof opId).toBe("string");
      expect(opId.length).toBeGreaterThan(0);
      expect(liked).toBe(true);

      // 失败回滚：计数与高亮状态均还原
      wrapper.vm.rollback(opId);
      await flushPromises();
      expect(likeCountOf(wrapper)).toBe(3);

      // 同步给父组件的数据也已还原
      const updates = wrapper.emitted("update:comments");
      const restored = updates[updates.length - 1][0][0];
      expect(restored.likeCount).toBe(3);
      expect(restored.liked).toBe(false);
    });

    it("点赞：settle 丢弃快照，之后 rollback 不产生效果", async () => {
      const wrapper = mountComp();
      await wrapper.find(".bili-comment-item__like").trigger("click");
      await flushPromises();
      expect(likeCountOf(wrapper)).toBe(4);

      const { opId } = wrapper.emitted("like")[0][0];
      wrapper.vm.settle(opId);
      // 已确认的快照不存在：rollback 应是无副作用的 no-op
      wrapper.vm.rollback(opId);
      await flushPromises();
      expect(likeCountOf(wrapper)).toBe(4);
    });

    it("删除评论：确认后乐观移除，rollback 按原位置插回", async () => {
      confirmFn.mockResolvedValueOnce("confirm");
      // 两条评论：删除第一条后回滚，应插回原位置
      const comments = [
        ...makeComments(),
        {
          id: "c2",
          author: { id: "u3", name: "王五", avatar: "" },
          content: "第二条",
          createTime: Date.now(),
          likeCount: 1,
          liked: false,
          replies: [],
        },
      ];
      const wrapper = mountComp(comments);
      const itemsBefore = () => wrapper.findAll(".bili-comment-item__content, .bili-comment-item__main, .bili-comment-item");

      await wrapper.find(".bili-comment-item__delete").trigger("click");
      await flushPromises();

      const deleteEvents = wrapper.emitted("delete");
      expect(deleteEvents).toHaveLength(1);
      const { opId } = deleteEvents[0][0];
      // 乐观删除：c1 消失，仅剩 c2
      expect(wrapper.text()).not.toContain("求点赞");
      expect(wrapper.text()).toContain("第二条");

      wrapper.vm.rollback(opId);
      await flushPromises();
      // 精确还原：c1 回来且仍在 c2 之前
      expect(wrapper.text()).toContain("求点赞");
      const allText = wrapper.text();
      expect(allText.indexOf("求点赞")).toBeLessThan(allText.indexOf("第二条"));
    });

    it("删除回复：回滚后回复插回所属评论", async () => {
      confirmFn.mockResolvedValueOnce("confirm");
      const wrapper = mountComp();
      expect(wrapper.text()).toContain("帮顶");

      await wrapper.find(".bili-reply-item__delete").trigger("click");
      await flushPromises();
      expect(wrapper.emitted("delete")).toHaveLength(1);
      expect(wrapper.text()).not.toContain("帮顶");

      const { opId } = wrapper.emitted("delete")[0][0];
      wrapper.vm.rollback(opId);
      await flushPromises();
      expect(wrapper.text()).toContain("帮顶");
    });

    it("发布：乐观插入新评论，rollback 按 id 移除", async () => {
      const wrapper = mountComp([]);
      // 展开顶部输入框
      const collapse = wrapper.find(".bili-comment-editor__collapse");
      if (collapse.exists()) await collapse.trigger("click");
      await wrapper.find("textarea").setValue("回滚测试评论");
      const publish = wrapper
        .findAll("button")
        .find((b) => b.text().includes("发布"));
      await publish.trigger("click");
      await flushPromises();

      expect(wrapper.text()).toContain("回滚测试评论");
      const sendEvents = wrapper.emitted("send");
      expect(sendEvents).toHaveLength(1);
      const { opId, content } = sendEvents[0][0];
      expect(content).toBe("回滚测试评论");
      expect(typeof opId).toBe("string");

      wrapper.vm.rollback(opId);
      await flushPromises();
      expect(wrapper.text()).not.toContain("回滚测试评论");
    });

    it("未知 opId 的 rollback 是安全 no-op（不抛错、不改数据）", async () => {
      const wrapper = mountComp();
      const countBefore = likeCountOf(wrapper);
      expect(() => wrapper.vm.rollback("op_not_exist")).not.toThrow();
      expect(likeCountOf(wrapper)).toBe(countBefore);
    });
  });
}

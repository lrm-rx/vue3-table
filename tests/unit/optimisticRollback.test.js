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

    describe("在途项（临时 id）行为", () => {
      // 发布一条评论但不 settle，得到一条 tmp_ 前缀的在途评论
      const publishPending = async (wrapper) => {
        const collapse = wrapper.find(".bili-comment-editor__collapse");
        if (collapse.exists()) await collapse.trigger("click");
        await wrapper.find("textarea").setValue("在途评论");
        const publish = wrapper
          .findAll("button")
          .find((b) => b.text().includes("发布"));
        await publish.trigger("click");
        await flushPromises();
        return wrapper.emitted("send")[0][0].opId;
      };
      // 定位在途评论所在行（点赞按钮带 disabled 的那条）
      const pendingRowLikeBtn = (wrapper) =>
        wrapper
          .findAll(".bili-comment-item__like")
          .find((b) => b.attributes("disabled") !== undefined);
      const pendingRowDeleteBtn = (wrapper) =>
        wrapper
          .findAll(".bili-comment-item__delete")
          .find((b) => b.attributes("disabled") !== undefined);
      const pendingLikeCount = (wrapper) => {
        const m = pendingRowLikeBtn(wrapper)?.text().match(/\((\d+)\)/);
        return m ? Number(m[1]) : null;
      };

      it("在途评论的点赞/删除按钮禁用（不发请求）", async () => {
        const wrapper = mountComp();
        await publishPending(wrapper);
        const likeBtn = pendingRowLikeBtn(wrapper);
        expect(likeBtn).toBeDefined();
        expect(likeBtn.attributes("disabled")).toBeDefined();
        // 强制触发点击也不应 emit like（组件内对临时 id 本地处理/拦截）
        await likeBtn.trigger("click");
        await flushPromises();
        expect(wrapper.emitted("like")).toBeFalsy();
        // 删除按钮存在但禁用（本人评论）
        const deleteBtn = pendingRowDeleteBtn(wrapper);
        if (deleteBtn) expect(deleteBtn.attributes("disabled")).toBeDefined();
      });

      it("settle 回填真实 id 后，按钮恢复可用且点赞会 emit", async () => {
        const wrapper = mountComp();
        const opId = await publishPending(wrapper);
        expect(pendingRowLikeBtn(wrapper)).toBeDefined();

        // 回填服务端真实 id（非 tmp_ 前缀）
        wrapper.vm.settle(opId, { id: "svc_real_1", floor: 999 });
        await flushPromises();
        // 不再存在禁用按钮
        expect(pendingRowLikeBtn(wrapper)).toBeUndefined();

        // 真实 id（第一条 c1）：点赞会 emit like 事件
        const firstLike = wrapper.find(".bili-comment-item__like");
        await firstLike.trigger("click");
        await flushPromises();
        const likeEvents = wrapper.emitted("like");
        expect(likeEvents).toHaveLength(1);
        expect(likeEvents[0][0].opId).toEqual(expect.any(String));
      });

      it("在途评论 id 带 tmp_ 前缀；settle 后被真实 id 替换", async () => {
        const wrapper = mountComp();
        const opId = await publishPending(wrapper);
        // 在途：同步给父组件的列表中应存在一条 tmp_ 前缀的评论
        const inFlightList = wrapper.emitted("update:comments").at(-1)[0];
        const inFlight = inFlightList.find((c) => String(c.id).startsWith("tmp_"));
        expect(inFlight).toBeTruthy();

        wrapper.vm.settle(opId, { id: "svc_real_2", floor: 5 });
        await flushPromises();
        const settledList = wrapper.emitted("update:comments").at(-1)[0];
        expect(settledList.some((c) => c.id === "svc_real_2")).toBe(true);
        expect(settledList.some((c) => String(c.id).startsWith("tmp_"))).toBe(false);
      });

      it("在途点赞：按钮禁用，点击不会触发任何 like 事件（不发请求）", async () => {
        const wrapper = mountComp();
        await publishPending(wrapper);
        const likeBtn = pendingRowLikeBtn(wrapper);
        expect(likeBtn.attributes("disabled")).toBeDefined();
        expect(pendingLikeCount(wrapper)).toBe(0);

        // disabled 按钮在 jsdom 中 click 不触发 handler（与真实浏览器一致）
        await likeBtn.trigger("click");
        await flushPromises();
        // 计数不变、且未 emit：证明在途点赞不会对服务端发请求
        expect(pendingLikeCount(wrapper)).toBe(0);
        expect(wrapper.emitted("like")).toBeFalsy();
      });

      it("在途删除：按钮禁用，点击不会触发删除（本地不丢、不弹确认框、不发请求）", async () => {
        confirmFn.mockReset();
        const wrapper = mountComp();
        await publishPending(wrapper);
        expect(wrapper.text()).toContain("在途评论");

        const deleteBtn = pendingRowDeleteBtn(wrapper);
        expect(deleteBtn.attributes("disabled")).toBeDefined();
        await deleteBtn.trigger("click"); // disabled，handler 不执行
        await flushPromises();
        // 在途评论仍在、未弹确认框、未 emit delete
        expect(wrapper.text()).toContain("在途评论");
        expect(confirmFn).not.toHaveBeenCalled();
        expect(wrapper.emitted("delete")).toBeFalsy();
      });

      it("在途评论 rollback 移除后，按钮与数据均清理干净", async () => {
        const wrapper = mountComp();
        const opId = await publishPending(wrapper);
        expect(wrapper.text()).toContain("在途评论");

        wrapper.vm.rollback(opId);
        await flushPromises();
        expect(wrapper.text()).not.toContain("在途评论");
        // 回滚后列表回到初始（无在途项），不存在禁用按钮
        expect(pendingRowLikeBtn(wrapper)).toBeUndefined();
      });

      it("已确认（真实 id）记录的点赞/删除正常走 emit + 回滚链路，不受临时逻辑影响", async () => {
        confirmFn.mockResolvedValueOnce("confirm");
        const wrapper = mountComp(); // 初始 c1（真实 id）可删
        expect(likeCountOf(wrapper)).toBe(3);

        // 真实 id 点赞：emit + 可回滚
        await wrapper.find(".bili-comment-item__like").trigger("click");
        await flushPromises();
        expect(likeCountOf(wrapper)).toBe(4);
        const { opId } = wrapper.emitted("like")[0][0];
        wrapper.vm.rollback(opId);
        await flushPromises();
        expect(likeCountOf(wrapper)).toBe(3);

        // 真实 id 删除：弹确认框 + emit
        await wrapper.find(".bili-comment-item__delete").trigger("click");
        await flushPromises();
        expect(wrapper.emitted("delete")).toHaveLength(1);
        expect(confirmFn).toHaveBeenCalledTimes(1);
      });
    });
  });
}

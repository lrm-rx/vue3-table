// @vitest-environment jsdom
/**
 * 临时 id（在途项）组件级单测：
 *  - CommentItem / ReplyItem 对临时 id（tmp_ 前缀）的记录禁用点赞与删除按钮
 *  - 对真实 id 的记录按钮可用
 *  - nanoid 生成的临时 id 具备前缀、类型段与唯一性
 * 两个组件变体（comment / commentSimple）结构一致，参数化执行。
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ElementPlus from "element-plus";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import zhCn from "element-plus/dist/locale/zh-cn";
import CommentItem from "../../src/components/comment/components/CommentItem.vue";
import CommentItemS from "../../src/components/commentSimple/components/CommentItem.vue";
import ReplyItem from "../../src/components/comment/components/ReplyItem.vue";
import ReplyItemS from "../../src/components/commentSimple/components/ReplyItem.vue";
import { createId, isTempId } from "../../src/components/comment/utils/format.js";
import {
  createId as createIdS,
  isTempId as isTempIdS,
} from "../../src/components/commentSimple/utils/format.js";

const globalConfig = {
  plugins: [[ElementPlus, { locale: zhCn }]],
  components: Object.fromEntries(Object.entries(ElementPlusIconsVue)),
};

const me = { id: "me", name: "我", avatar: "", role: "admin" };

const makeComment = (id) => ({
  id,
  author: me,
  content: "测试内容",
  createTime: Date.now(),
  likeCount: 0,
  liked: false,
  replies: [],
});
const makeReply = (id) => ({
  id,
  author: me,
  content: "回复内容",
  createTime: Date.now(),
  likeCount: 0,
  liked: false,
  replyTo: null,
});

// —— 工具函数：两个变体的 createId / isTempId 行为一致 ——
describe("临时 id 工具函数（两个组件变体一致）", () => {
  for (const [name, create, isTemp] of [
    ["comment", createId, isTempId],
    ["commentSimple", createIdS, isTempIdS],
  ]) {
    it(`${name}: createId 带 tmp_ 前缀、含类型段、唯一`, () => {
      const a = create("root");
      const b = create("reply");
      expect(a.startsWith("tmp_root_")).toBe(true);
      expect(b.startsWith("tmp_reply_")).toBe(true);
      expect(a).not.toBe(b);
      // 连续生成 100 个不重复（nanoid 碰撞概率可忽略）
      const set = new Set(Array.from({ length: 100 }, () => create("c")));
      expect(set.size).toBe(100);
    });

    it(`${name}: isTempId 仅 tmp_ 前缀为真，服务端 id 与空值为假`, () => {
      expect(isTemp(create("root"))).toBe(true);
      expect(isTemp("svc_root_1")).toBe(false);
      expect(isTemp("mock_root_5")).toBe(false);
      expect(isTemp("")).toBe(false);
      expect(isTemp(null)).toBe(false);
      expect(isTemp(undefined)).toBe(false);
    });
  }
});

// —— CommentItem：临时 id 禁用点赞/删除，真实 id 可用 ——
for (const [name, Comp] of [
  ["comment CommentItem", CommentItem],
  ["commentSimple CommentItem", CommentItemS],
]) {
  describe(`${name} 在途禁用`, () => {
    const mountItem = (id) =>
      mount(Comp, {
        props: { comment: makeComment(id), currentUser: me },
        global: globalConfig,
      });

    it("临时 id：点赞与删除按钮 disabled", () => {
      const wrapper = mountItem(createId("root"));
      expect(wrapper.find(".bili-comment-item__like").attributes("disabled")).toBeDefined();
      expect(wrapper.find(".bili-comment-item__delete").attributes("disabled")).toBeDefined();
    });

    it("真实 id：点赞与删除按钮可用", () => {
      const wrapper = mountItem("c_real_1");
      expect(wrapper.find(".bili-comment-item__like").attributes("disabled")).toBeUndefined();
      expect(wrapper.find(".bili-comment-item__delete").attributes("disabled")).toBeUndefined();
    });
  });
}

// —— ReplyItem：临时 id 禁用点赞/删除，真实 id 可用 ——
for (const [name, Comp] of [
  ["comment ReplyItem", ReplyItem],
  ["commentSimple ReplyItem", ReplyItemS],
]) {
  describe(`${name} 在途禁用`, () => {
    const mountItem = (id) =>
      mount(Comp, {
        props: { reply: makeReply(id), currentUser: me },
        global: globalConfig,
      });

    it("临时 id：点赞与删除按钮 disabled", () => {
      const wrapper = mountItem(createId("reply"));
      expect(wrapper.find(".bili-reply-item__like").attributes("disabled")).toBeDefined();
      expect(wrapper.find(".bili-reply-item__delete").attributes("disabled")).toBeDefined();
    });

    it("真实 id：点赞与删除按钮可用", () => {
      const wrapper = mountItem("r_real_1");
      expect(wrapper.find(".bili-reply-item__like").attributes("disabled")).toBeUndefined();
      expect(wrapper.find(".bili-reply-item__delete").attributes("disabled")).toBeUndefined();
    });
  });
}

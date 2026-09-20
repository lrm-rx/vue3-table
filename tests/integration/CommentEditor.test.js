// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ElementPlus from "element-plus";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import zhCn from "element-plus/dist/locale/zh-cn";
import CommentEditor from "../../src/components/comment/components/CommentEditor.vue";

// 注册 Element Plus（含中文 locale，与 main.js 一致）+ 全部图标
const globalConfig = {
  plugins: [[ElementPlus, { locale: zhCn }]],
  components: Object.fromEntries(Object.entries(ElementPlusIconsVue)),
};

const mountEditor = (props = {}) =>
  mount(CommentEditor, {
    props,
    global: globalConfig,
    // el-popover teleport 到 body，挂载点也放 body 以模拟真实文档结构
    attachTo: document.body,
  });

// 弹层是否处于打开状态：以触发按钮的 is-active（直接绑定 emojiVisible）为准，
// 不查 popper DOM——EP 关闭有离场动画，动画期 DOM 仍在
const emojiActive = (wrapper) =>
  wrapper.find(".bili-comment-editor__tool[title='表情']").classes("is-active");

describe("CommentEditor 提交与工具栏", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("Ctrl/⌘+Enter 快捷提交并清空；纯空格与普通 Enter 不提交", async () => {
    const wrapper = mountEditor();
    const ta = wrapper.find("textarea");

    // 纯空格：Ctrl+Enter 也不提交
    await ta.setValue("   ");
    await ta.trigger("keydown", { key: "Enter", ctrlKey: true });
    expect(wrapper.emitted("send")).toBeFalsy();

    // 普通 Enter 不提交
    await ta.setValue("快捷键评论");
    await ta.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("send")).toBeFalsy();

    // Ctrl+Enter 提交，提交后清空
    await ta.trigger("keydown", { key: "Enter", ctrlKey: true });
    expect(wrapper.emitted("send")?.[0]).toEqual(["快捷键评论"]);
    expect(ta.element.value).toBe("");

    // ⌘（metaKey）同样触发
    await ta.setValue("meta 提交");
    await ta.trigger("keydown", { key: "Enter", metaKey: true });
    expect(wrapper.emitted("send")?.[1]).toEqual(["meta 提交"]);

    await flushPromises(); // 等 EP autosize 的 nextTick 回调落地，避免卸载后访问 DOM
    wrapper.unmount();
  });

  it("@ 按钮在光标处插入 @ 并关闭已打开的表情面板", async () => {
    const wrapper = mountEditor();
    await wrapper.find(".bili-comment-editor__tool[title='表情']").trigger("click");
    await flushPromises();
    expect(emojiActive(wrapper)).toBe(true);

    const ta = wrapper.find("textarea");
    await ta.setValue("ab");
    // 光标定位到中间再插入
    ta.element.setSelectionRange(1, 1);
    await wrapper.find(".bili-comment-editor__tool--at").trigger("click");
    await flushPromises();

    expect(ta.element.value).toBe("a@b");
    expect(emojiActive(wrapper)).toBe(false);

    await flushPromises();
    wrapper.unmount();
  });

  it("maxlength 透传到 textarea，show-word-limit 字数统计可用", async () => {
    const wrapper = mountEditor({ maxlength: 5 });
    const ta = wrapper.find("textarea");
    // maxlength 由 EP 透传为原生属性（真实浏览器中用户键入超限时由平台截断）
    expect(ta.attributes("maxlength")).toBe("5");
    // 字数统计节点存在（EP 格式为「n / max」）
    expect(wrapper.find(".el-input__count").exists()).toBe(true);
    expect(wrapper.find(".el-input__count").text().replace(/\s/g, "")).toBe("0/5");

    await flushPromises();
    wrapper.unmount();
  });
});

describe("CommentEditor 表情面板", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("回复模式：打开后可连续选表情，点 textarea / 面板外关闭，按钮可再次 toggle", async () => {
    const wrapper = mountEditor();
    await flushPromises();

    const btn = wrapper.find(".bili-comment-editor__tool[title='表情']");

    // 打开面板
    await btn.trigger("click");
    await flushPromises();
    expect(emojiActive(wrapper)).toBe(true);
    const items = document.body.querySelectorAll(".bili-emoji-popper__item");
    expect(items.length).toBe(63);

    // 点表情：插入到光标处，面板保持打开（可连续选择）
    items[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
    expect(wrapper.find("textarea").element.value).toBe("😀");
    expect(emojiActive(wrapper)).toBe(true);

    // 核心回归：点 textarea（面板外、编辑器内部）必须关闭
    await wrapper.find("textarea").trigger("click");
    await flushPromises();
    expect(emojiActive(wrapper)).toBe(false);

    // 点编辑器 / 面板以外任意处关闭
    await btn.trigger("click");
    await flushPromises();
    expect(emojiActive(wrapper)).toBe(true);
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
    expect(emojiActive(wrapper)).toBe(false);

    // 再次点按钮重新打开（toggle 正常）
    await btn.trigger("click");
    await flushPromises();
    expect(emojiActive(wrapper)).toBe(true);

    wrapper.unmount();
  });

  it("折叠模式：空内容时点击面板外，表情面板与输入框同时收起", async () => {
    const wrapper = mountEditor({ collapsible: true });
    await flushPromises();

    // 初始为折叠灰条，点击展开
    await wrapper.find(".bili-comment-editor__collapse").trigger("click");
    await flushPromises();
    expect(wrapper.find(".bili-comment-editor__body").exists()).toBe(true);

    const btn = wrapper.find(".bili-comment-editor__tool[title='表情']");
    await btn.trigger("click");
    await flushPromises();
    expect(emojiActive(wrapper)).toBe(true);

    // 空内容点击编辑器外（body）：面板关闭 + 输入框折叠回灰条
    // （折叠后表情按钮随 v-if 卸载，以按钮不存在 + 折叠条出现作为断言）
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
    expect(wrapper.find(".bili-comment-editor__tool[title='表情']").exists()).toBe(
      false,
    );
    expect(wrapper.find(".bili-comment-editor__collapse").exists()).toBe(true);

    wrapper.unmount();
  });

  it("折叠模式：有内容时点击外部只关表情面板，输入框保持展开", async () => {
    const wrapper = mountEditor({ collapsible: true });
    await flushPromises();
    await wrapper.find(".bili-comment-editor__collapse").trigger("click");
    await flushPromises();

    const btn = wrapper.find(".bili-comment-editor__tool[title='表情']");
    await btn.trigger("click");
    await flushPromises();

    // 输入内容
    const textarea = wrapper.find("textarea");
    textarea.element.value = "还没打完的评论";
    await textarea.trigger("input");
    await flushPromises();

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
    expect(emojiActive(wrapper)).toBe(false);
    expect(wrapper.find(".bili-comment-editor__body").exists()).toBe(true);

    wrapper.unmount();
  });
});

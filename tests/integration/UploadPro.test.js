// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, reactive, defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "@vue/compiler-sfc";
import ElementPlus, { ElMessage, ElMessageBox, ElForm } from "element-plus";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import zhCn from "element-plus/dist/locale/zh-cn";
import UploadPro from "../../src/components/formPro/UploadPro.vue";
import FormPro from "../../src/components/formPro/index.vue";

// ============ mock element-plus：仅替换 ElMessage 方法，其余保留真实实现 ============
const { ElMessageFns } = vi.hoisted(() => ({
  ElMessageFns: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("element-plus", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ElMessage: {
      ...actual.ElMessage,
      ...ElMessageFns,
    },
  };
});

// jsdom 未实现 createObjectURL；el-upload 照片墙入队时会调用
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();
  Object.values(ElMessageFns).forEach((fn) => fn.mockClear());
});

const globalConfig = {
  plugins: [[ElementPlus, { locale: zhCn }]],
  components: Object.fromEntries(Object.entries(ElementPlusIconsVue)),
};

const mountUpload = (props = {}) =>
  mount(UploadPro, { props, global: globalConfig });

/** 构造携带图片的粘贴事件并派发到目标元素 */
const dispatchImagePaste = (el, files = []) => {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      items: files.map((f) => ({
        kind: "file",
        type: f.type,
        getAsFile: () => f,
      })),
      files: [],
    },
  });
  el.dispatchEvent(event);
  return event;
};

describe("UploadPro 照片墙（picture-card）", () => {
  it("默认渲染 + 号触发区，粘贴入口位于卡片内 + 号下方", () => {
    const wrapper = mountUpload({ modelValue: [] });
    const card = wrapper.find(".el-upload--picture-card");
    expect(card.exists()).toBe(true);
    const paste = wrapper.find(".upload-pro__card-paste");
    // 粘贴入口在触发卡片内部（而非外部兄弟节点）
    expect(card.element.contains(paste.element)).toBe(true);
    expect(paste.text()).toBe("点击此处粘贴图片");
    // 顺序：+ 号在前，粘贴文字在其后（下方）
    const inner = wrapper.find(".upload-pro__card-inner");
    expect(inner.exists()).toBe(true);
    expect(inner.element.firstElementChild).toBe(
      wrapper.find(".upload-pro__card-plus").element,
    );
    expect(inner.element.lastElementChild).toBe(paste.element);
  });

  it("pasteable=false 时隐藏粘贴入口；disabled 时同样隐藏", async () => {
    const wrapper = mountUpload({ modelValue: [], pasteable: false });
    expect(wrapper.find(".upload-pro__card-paste").exists()).toBe(false);
    await wrapper.setProps({ pasteable: true, disabled: true });
    expect(wrapper.find(".upload-pro__card-paste").exists()).toBe(false);
  });

  it("text 列表模式不显示卡片粘贴入口（卡片入口仅照片墙渲染）", () => {
    const wrapper = mountUpload({
      modelValue: [],
      listType: "text",
    });
    expect(wrapper.find(".upload-pro__card-paste").exists()).toBe(false);
  });

  it("点击粘贴入口：阻止冒泡，不弹出文件选择窗，并显式聚焦自身", async () => {
    const wrapper = mountUpload({ modelValue: [] });
    const fileInput = wrapper.find('input.el-upload__input').element;
    const clickSpy = vi.spyOn(fileInput, "click");
    const paste = wrapper.find(".upload-pro__card-paste");
    const focusSpy = vi.spyOn(paste.element, "focus");
    await paste.trigger("click");
    // 关键：click 未冒泡到 el-upload 触发卡片 → 未调用 input.click() 选文件
    expect(clickSpy).not.toHaveBeenCalled();
    // 显式聚焦入口，随后 Ctrl+V 可投递到本实例
    expect(focusSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
    focusSpy.mockRestore();
  });

  it("点击 + 号 / 卡片其他区域：正常冒泡触发文件选择", async () => {
    const wrapper = mountUpload({ modelValue: [] });
    const fileInput = wrapper.find('input.el-upload__input').element;
    const clickSpy = vi.spyOn(fileInput, "click");
    // 点 + 号图标：冒泡到卡片 → 选文件
    await wrapper.find(".upload-pro__card-plus").trigger("click");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    // 点卡片空白处（inner 容器）同样选文件
    await wrapper.find(".upload-pro__card-inner").trigger("click");
    expect(clickSpy).toHaveBeenCalledTimes(2);
    clickSpy.mockRestore();
  });

  it("粘贴图片：复用 el-upload 入队链路（autoUpload=false 时文件进入列表等待手动提交）", async () => {
    const wrapper = mountUpload({ modelValue: [], autoUpload: false });
    const file = new File(["abc"], "pasted.png", { type: "image/png" });
    const ev = dispatchImagePaste(
      wrapper.find(".upload-pro__card-paste").element,
      [file],
    );
    expect(ev.defaultPrevented).toBe(true);
    await flushPromises();
    const items = wrapper.findAll(".el-upload-list__item");
    expect(items.length).toBe(1);
    // 图片入队时生成了预览 blob URL
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
  });

  it("粘贴非图片内容不拦截（保持原生粘贴行为）", async () => {
    const wrapper = mountUpload({ modelValue: [], autoUpload: false });
    const ev = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "clipboardData", {
      value: { items: [{ kind: "string", type: "text/plain" }], files: [] },
    });
    wrapper.find(".upload-pro__card-paste").element.dispatchEvent(ev);
    await flushPromises();
    expect(ev.defaultPrevented).toBe(false);
    expect(wrapper.findAll(".el-upload-list__item").length).toBe(0);
  });

  it("照片墙粘贴非图片文件（如 pdf）被忽略，不触发上传", async () => {
    const wrapper = mountUpload({ modelValue: [], autoUpload: false });
    const ev = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "clipboardData", {
      value: {
        items: [
          {
            kind: "file",
            type: "application/pdf",
            getAsFile: () => new File(["x"], "a.pdf", { type: "application/pdf" }),
          },
        ],
        files: [],
      },
    });
    wrapper.find(".upload-pro__card-paste").element.dispatchEvent(ev);
    await flushPromises();
    expect(ev.defaultPrevented).toBe(false);
    expect(wrapper.findAll(".el-upload-list__item").length).toBe(0);
  });

  it("limit 限制：超出数量的粘贴图片被忽略并给出提示", async () => {
    const wrapper = mountUpload({
      modelValue: [],
      autoUpload: false,
      limit: 1,
    });
    const f1 = new File(["1"], "a.png", { type: "image/png" });
    const f2 = new File(["2"], "b.png", { type: "image/png" });
    dispatchImagePaste(wrapper.find(".upload-pro__card-paste").element, [
      f1,
      f2,
    ]);
    await flushPromises();
    expect(wrapper.findAll(".el-upload-list__item").length).toBe(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("多个上传实例：粘贴只投递到聚焦的实例，互不干扰", async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h("div", [
            h(UploadPro, { ref: "a", modelValue: [], autoUpload: false }),
            h(UploadPro, { ref: "b", modelValue: [], autoUpload: false }),
          ]);
      },
    });
    const wrapper = mount(Host, { global: globalConfig });
    const hosts = wrapper.findAllComponents(UploadPro);
    const padA = hosts[0].find(".upload-pro__card-paste").element;
    dispatchImagePaste(padA, [
      new File(["x"], "x.png", { type: "image/png" }),
    ]);
    await flushPromises();
    expect(hosts[0].findAll(".el-upload-list__item").length).toBe(1);
    expect(hosts[1].findAll(".el-upload-list__item").length).toBe(0);
  });

  it("点击墙内缩略图（整图可点）打开 el-image 内置查看器预览（无 el-dialog）", async () => {
    const wrapper = mountUpload({
      modelValue: [
        { name: "a.png", url: "https://example.com/a.png" },
        { name: "b.png", url: "https://example.com/b.png" },
      ],
    });
    await flushPromises();
    // hover 操作层放大镜按钮存在
    expect(wrapper.findAll(".el-upload-list__item-preview").length).toBe(2);
    // 直接点击第二张缩略图（不依赖 hover 操作层）
    const thumbs = wrapper.findAll(".upload-pro__card-thumb");
    expect(thumbs.length).toBe(2);
    await thumbs[1].trigger("click");
    await flushPromises();
    // 无 el-dialog 外壳；隐藏 el-image 宿主持有预览集
    expect(wrapper.findComponent({ name: "ElDialog" }).exists()).toBe(false);
    const img = wrapper.findComponent({ name: "ElImage" });
    expect(img.props("previewSrcList")).toEqual([
      "https://example.com/a.png",
      "https://example.com/b.png",
    ]);
    // 点击第二张 → initial-index 定位到 1
    expect(img.props("initialIndex")).toBe(1);
    // 查看器已唤起（teleport 到 body）
    expect(document.body.querySelector(".el-image-viewer__wrapper")).toBeTruthy();
    wrapper.unmount();
  });

  it("点击 hover 操作层（透明覆盖层，真实点击落点）同样打开预览", async () => {
    const wrapper = mountUpload({
      modelValue: [{ name: "a.png", url: "https://example.com/a.png" }],
    });
    await flushPromises();
    await wrapper.find(".el-upload-list__item-actions").trigger("click");
    await flushPromises();
    expect(
      wrapper.findComponent({ name: "ElImage" }).props("previewSrcList"),
    ).toEqual(["https://example.com/a.png"]);
    wrapper.unmount();
  });

  it("点击图片直接唤起 el-image-viewer 大图查看器（teleport 到 body，无 dialog）", async () => {
    document.body.innerHTML = "";
    const wrapper = mountUpload({
      modelValue: [{ name: "a.png", url: "https://example.com/a.png" }],
    });
    await flushPromises();
    await wrapper.find(".upload-pro__card-thumb").trigger("click");
    await flushPromises();
    expect(document.body.querySelector(".el-image-viewer__wrapper")).toBeTruthy();
    wrapper.unmount();
  });

  it("点击事件落在 li 本身（覆盖层合成命中差异）时根节点委托仍能打开预览", async () => {
    const wrapper = mountUpload({
      modelValue: [{ name: "a.png", url: "https://example.com/a.png" }],
    });
    await flushPromises();
    // 直接在 li 上派发（事件目标不是 img/actions 覆盖层）
    await wrapper.find(".el-upload-list--picture-card .el-upload-list__item").trigger("click");
    await flushPromises();
    expect(
      wrapper.findComponent({ name: "ElImage" }).props("previewSrcList"),
    ).toEqual(["https://example.com/a.png"]);
    wrapper.unmount();
  });

  it("照片墙 hover 操作层删除按钮可移除文件并回抛 v-model", async () => {
    const wrapper = mountUpload({
      modelValue: [{ name: "a.png", url: "https://example.com/a.png" }],
    });
    await flushPromises();
    await wrapper.find(".el-upload-list__item-delete").trigger("click");
    await flushPromises();
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted[emitted.length - 1][0]).toEqual([]);
  });
});

describe("UploadPro 文件名特殊字符拦截", () => {
  it("照片墙粘贴含 # 文件名的图片：拦截上传、提示、不入列", async () => {
    const httpRequest = vi.fn();
    const wrapper = mountUpload({ modelValue: [], httpRequest, autoUpload: true });
    const file = new File(["abc"], "a#b.png", { type: "image/png" });
    const ev = dispatchImagePaste(
      wrapper.find(".upload-pro__card-paste").element,
      [file],
    );
    expect(ev.defaultPrevented).toBe(true);
    await flushPromises();
    expect(httpRequest).not.toHaveBeenCalled();
    expect(wrapper.findAll(".el-upload-list__item").length).toBe(0);
    expect(ElMessage.error).toHaveBeenCalledTimes(1);
    const msg = ElMessage.error.mock.calls[0][0];
    expect(msg).toContain("a#b.png");
    expect(msg).toContain("#");
    expect(msg).toContain("特殊字符");
  });

  it("text 模式粘贴含特殊字符文件名的文件：同样拦截", async () => {
    const httpRequest = vi.fn();
    const wrapper = mountUpload({
      modelValue: [],
      listType: "text",
      httpRequest,
      autoUpload: true,
    });
    const file = new File(["%PDF"], "100%报告.pdf", {
      type: "application/pdf",
    });
    dispatchImagePaste(wrapper.find(".upload-pro__btn-paste").element, [file]);
    await flushPromises();
    expect(httpRequest).not.toHaveBeenCalled();
    expect(wrapper.findAll(".el-upload-list__item").length).toBe(0);
    expect(ElMessage.error).toHaveBeenCalledTimes(1);
    expect(ElMessage.error.mock.calls[0][0]).toContain("100%报告.pdf");
  });

  it("文件名安全时正常上传（不触发拦截提示）", async () => {
    const httpRequest = vi.fn();
    const wrapper = mountUpload({
      modelValue: [],
      listType: "text",
      httpRequest,
      autoUpload: true,
    });
    const file = new File(["%PDF"], "说明书 v2.pdf", {
      type: "application/pdf",
    });
    dispatchImagePaste(wrapper.find(".upload-pro__btn-paste").element, [file]);
    await flushPromises();
    expect(httpRequest).toHaveBeenCalledTimes(1);
    expect(ElMessage.error).not.toHaveBeenCalled();
  });
});

describe("UploadPro 非图片文件列表（text / picture）", () => {
  it("成功文件渲染眼睛图标，且位于打勾状态图标之前", async () => {
    const wrapper = mountUpload({
      modelValue: [{ name: "需求文档.pdf", url: "https://example.com/a.pdf" }],
      listType: "text",
    });
    await flushPromises();
    const eye = wrapper.find(".upload-pro__eye");
    const status = wrapper.find(".el-upload-list__item-status-label");
    expect(eye.exists()).toBe(true);
    expect(status.exists()).toBe(true);
    // 眼睛在状态图标之前（status 跟随 eye）
    expect(
      eye.element.compareDocumentPosition(status.element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("点击眼睛触发 preview 事件，载荷含 name/url/index/fileList", async () => {
    const wrapper = mountUpload({
      modelValue: [
        { name: "a.pdf", url: "https://example.com/a.pdf" },
        { name: "b.doc", url: "https://example.com/b.doc" },
      ],
      listType: "text",
    });
    await flushPromises();
    const eyes = wrapper.findAll(".upload-pro__eye");
    await eyes[1].trigger("click");
    const evts = wrapper.emitted("preview");
    expect(evts).toBeTruthy();
    expect(evts[0][0]).toMatchObject({
      name: "b.doc",
      url: "https://example.com/b.doc",
      index: 1,
    });
    expect(evts[0][0].fileList).toHaveLength(2);
  });

  it("点击文件名触发 download 事件（与眼睛预览区分开，下载行为由外部接管）", async () => {
    const wrapper = mountUpload({
      modelValue: [
        { name: "a.pdf", url: "https://example.com/a.pdf" },
        { name: "b.doc", url: "https://example.com/b.doc" },
      ],
      listType: "text",
    });
    await flushPromises();
    await wrapper.findAll(".el-upload-list__item-name")[0].trigger("click");
    // download 事件载荷与 preview 同构
    const evts = wrapper.emitted("download");
    expect(evts).toBeTruthy();
    expect(evts[0][0]).toMatchObject({
      name: "a.pdf",
      url: "https://example.com/a.pdf",
      index: 0,
    });
    expect(evts[0][0].fileList).toHaveLength(2);
    // 文件名点击不再抛 preview
    expect(wrapper.emitted("preview")).toBeFalsy();
  });

  it("showPreviewIcon=false 时隐藏眼睛图标，文件名点击下载不受影响", async () => {
    const wrapper = mountUpload({
      modelValue: [{ name: "a.pdf", url: "https://example.com/a.pdf" }],
      listType: "text",
      showPreviewIcon: false,
    });
    await flushPromises();
    expect(wrapper.find(".upload-pro__eye").exists()).toBe(false);
    // 眼睛隐藏不影响下载：文件名点击仍抛 download
    await wrapper.find(".el-upload-list__item-name").trigger("click");
    expect(wrapper.emitted("download")?.[0]?.[0]).toMatchObject({
      name: "a.pdf",
    });
    // 响应式切回 true 后眼睛恢复显示
    await wrapper.setProps({ showPreviewIcon: true });
    expect(wrapper.find(".upload-pro__eye").exists()).toBe(true);
  });

  it("删除按钮触发 el-upload 移除并回抛空数组（v-model 同步）", async () => {
    const wrapper = mountUpload({
      modelValue: [{ name: "a.pdf", url: "https://example.com/a.pdf" }],
      listType: "text",
    });
    await flushPromises();
    await wrapper.find(".el-icon--close").trigger("click");
    await flushPromises();
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeTruthy();
    expect(emitted[emitted.length - 1][0]).toEqual([]);
  });

  describe("confirmRemove：删除 / 移除二次确认", () => {
    let confirmSpy;

    beforeEach(() => {
      confirmSpy = vi
        .spyOn(ElMessageBox, "confirm")
        .mockResolvedValue("confirm");
    });

    afterEach(() => {
      confirmSpy.mockRestore();
    });

    it("默认 false：删除不弹确认框，直接移除", async () => {
      const wrapper = mountUpload({
        modelValue: [{ name: "a.pdf", url: "https://example.com/a.pdf" }],
        listType: "text",
      });
      await flushPromises();
      await wrapper.find(".el-icon--close").trigger("click");
      await flushPromises();
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(wrapper.findAll(".el-upload-list__item").length).toBe(0);
    });

    it("true + 无 raw：按「删除」提示，取消则保留文件", async () => {
      confirmSpy.mockRejectedValue("cancel");
      const wrapper = mountUpload({
        modelValue: [
          { name: "server.pdf", url: "https://example.com/server.pdf" },
        ],
        listType: "text",
        confirmRemove: true,
      });
      await flushPromises();
      await wrapper.find(".el-icon--close").trigger("click");
      await flushPromises();
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy.mock.calls[0][1]).toBe("删除确认");
      expect(confirmSpy.mock.calls[0][2]).toMatchObject({
        type: "warning",
        confirmButtonText: "删除",
      });
      expect(wrapper.findAll(".el-upload-list__item").length).toBe(1);
      expect(wrapper.emitted("remove")).toBeFalsy();
    });

    it("true + 无 raw + 确认：删除并同步 v-model", async () => {
      const wrapper = mountUpload({
        modelValue: [
          { name: "server.pdf", url: "https://example.com/server.pdf" },
        ],
        listType: "text",
        confirmRemove: true,
      });
      await flushPromises();
      await wrapper.find(".el-icon--close").trigger("click");
      await flushPromises();
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      const emitted = wrapper.emitted("update:modelValue");
      expect(emitted[emitted.length - 1][0]).toEqual([]);
    });

    it("true + 带 raw（本地文件流）：按「移除」提示，取消则不删除", async () => {
      confirmSpy.mockRejectedValue("cancel");
      const wrapper = mountUpload({
        modelValue: [],
        listType: "text",
        autoUpload: false,
        confirmRemove: true,
      });
      wrapper.vm.handleStart(
        new File(["%PDF"], "local.pdf", { type: "application/pdf" }),
      );
      await flushPromises();
      await wrapper.find(".el-icon--close").trigger("click");
      await flushPromises();
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy.mock.calls[0][1]).toBe("移除确认");
      expect(confirmSpy.mock.calls[0][2]).toMatchObject({
        confirmButtonText: "移除",
      });
      expect(wrapper.findAll(".el-upload-list__item").length).toBe(1);
    });

    it("用户 beforeRemove 返回 false：不弹确认框且不移除", async () => {
      const wrapper = mountUpload({
        modelValue: [{ name: "a.pdf", url: "https://example.com/a.pdf" }],
        listType: "text",
        confirmRemove: true,
        beforeRemove: () => false,
      });
      await flushPromises();
      await wrapper.find(".el-icon--close").trigger("click");
      await flushPromises();
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(wrapper.findAll(".el-upload-list__item").length).toBe(1);
    });
  });

  it("picture 模式图片点击走内置图片预览而非 preview 事件", async () => {
    const wrapper = mountUpload({
      modelValue: [{ name: "a.png", url: "https://example.com/a.png" }],
      listType: "picture",
    });
    await flushPromises();
    await wrapper.find(".upload-pro__eye").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("preview")).toBeFalsy();
    expect(
      wrapper.findComponent({ name: "ElImage" }).props("previewSrcList"),
    ).toEqual(["https://example.com/a.png"]);
    wrapper.unmount();
  });

  it("text 模式按钮行：按钮在前、粘贴入口在其右侧，默认文案「点击此处粘贴文件」", async () => {
    const wrapper = mountUpload({ modelValue: [], listType: "text" });
    await flushPromises();
    const row = wrapper.find(".upload-pro__trigger-row");
    expect(row.exists()).toBe(true);
    const btn = wrapper.findComponent({ name: "ElButton" });
    const paste = wrapper.find(".upload-pro__btn-paste");
    expect(paste.exists()).toBe(true);
    expect(paste.text()).toBe("点击此处粘贴文件");
    // 顺序：按钮在前，粘贴入口在后（右侧）
    expect(
      btn.element.compareDocumentPosition(paste.element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("buttonSize 透传 el-button size；pasteText 自定义覆盖默认文案", async () => {
    const wrapper = mountUpload({
      modelValue: [],
      listType: "text",
      buttonSize: "small",
      pasteText: "粘贴到此处",
    });
    await flushPromises();
    expect(wrapper.findComponent({ name: "ElButton" }).props("size")).toBe(
      "small",
    );
    expect(wrapper.find(".upload-pro__btn-paste").text()).toBe("粘贴到此处");
  });

  it("pasteable=false / disabled 时按钮旁粘贴入口隐藏", async () => {
    const wrapper = mountUpload({
      modelValue: [],
      listType: "text",
      pasteable: false,
    });
    expect(wrapper.find(".upload-pro__btn-paste").exists()).toBe(false);
    await wrapper.setProps({ pasteable: true, disabled: true });
    expect(wrapper.find(".upload-pro__btn-paste").exists()).toBe(false);
  });

  it("点击按钮旁粘贴入口：阻止冒泡不弹文件选择窗，并显式聚焦", async () => {
    const wrapper = mountUpload({ modelValue: [], listType: "text" });
    const fileInput = wrapper.find('input.el-upload__input').element;
    const clickSpy = vi.spyOn(fileInput, "click");
    const paste = wrapper.find(".upload-pro__btn-paste");
    const focusSpy = vi.spyOn(paste.element, "focus");
    await paste.trigger("click");
    expect(clickSpy).not.toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
    focusSpy.mockRestore();
  });

  it("text 模式粘贴任意文件（含非图片）：复用 el-upload 链路入队", async () => {
    const wrapper = mountUpload({
      modelValue: [],
      listType: "text",
      autoUpload: false,
    });
    const pdf = new File(["%PDF"], "说明书.pdf", { type: "application/pdf" });
    const ev = dispatchImagePaste(
      wrapper.find(".upload-pro__btn-paste").element,
      [pdf],
    );
    expect(ev.defaultPrevented).toBe(true);
    await flushPromises();
    const items = wrapper.findAll(".el-upload-list__item");
    expect(items.length).toBe(1);
    expect(items[0].text()).toContain("说明书.pdf");
  });

  it("text 模式 multiple=false 时粘贴多个文件仅入队第一个", async () => {
    const wrapper = mountUpload({
      modelValue: [],
      listType: "text",
      multiple: false,
      autoUpload: false,
    });
    const f1 = new File(["1"], "a.pdf", { type: "application/pdf" });
    const f2 = new File(["2"], "b.doc", { type: "application/msword" });
    dispatchImagePaste(wrapper.find(".upload-pro__btn-paste").element, [f1, f2]);
    await flushPromises();
    expect(wrapper.findAll(".el-upload-list__item").length).toBe(1);
  });

  it("text 模式 limit 裁剪：超出部分被忽略", async () => {
    const wrapper = mountUpload({
      modelValue: [],
      listType: "text",
      multiple: true,
      limit: 1,
      autoUpload: false,
    });
    const f1 = new File(["1"], "a.pdf", { type: "application/pdf" });
    const f2 = new File(["2"], "b.doc", { type: "application/msword" });
    dispatchImagePaste(wrapper.find(".upload-pro__btn-paste").element, [f1, f2]);
    await flushPromises();
    expect(wrapper.findAll(".el-upload-list__item").length).toBe(1);
  });

  it("text 模式粘贴非文件内容不拦截（保持原生粘贴行为）", async () => {
    const wrapper = mountUpload({
      modelValue: [],
      listType: "text",
      autoUpload: false,
    });
    const ev = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "clipboardData", {
      value: { items: [{ kind: "string", type: "text/plain" }], files: [] },
    });
    wrapper.find(".upload-pro__btn-paste").element.dispatchEvent(ev);
    await flushPromises();
    expect(ev.defaultPrevented).toBe(false);
    expect(wrapper.findAll(".el-upload-list__item").length).toBe(0);
  });
});

// 禁用态合并：mergedDisabled = item 显式 disabled（true/false）?? el-form.disabled ?? false。
// el-form 禁用时：粘贴入口与文件行删除叉号隐藏、粘贴事件被忽略；
// item 配置显式 false 可覆盖表单级禁用，显式 true 在表单未禁用时同样生效。
describe("UploadPro 禁用态：item disabled 优先于 el-form disabled", () => {
  const mountInForm = (formDisabled, uploadProps = {}) =>
    mount(
      defineComponent({
        setup() {
          return () =>
            h(ElForm, { disabled: formDisabled }, () =>
              h(UploadPro, {
                modelValue: [
                  { name: "a.pdf", url: "https://example.com/a.pdf" },
                ],
                listType: "text",
                autoUpload: false,
                ...uploadProps,
              }),
            );
        },
      }),
      { global: globalConfig },
    );

  it("el-form disabled=true（item 未配置）：粘贴入口 / 删除叉号隐藏，粘贴被忽略", async () => {
    const wrapper = mountInForm(true);
    await flushPromises();
    const up = wrapper.findComponent(UploadPro);
    // 粘贴入口与删除叉号隐藏
    expect(up.find(".upload-pro__btn-paste").exists()).toBe(false);
    expect(up.find(".el-icon--close").exists()).toBe(false);
    // el-upload 同步禁用
    expect(up.findComponent({ name: "ElUpload" }).props("disabled")).toBe(true);
    // 直接在根节点派发 paste：被禁用守卫忽略（不拦截、不入队）
    const file = new File(["x"], "pasted.pdf", { type: "application/pdf" });
    const ev = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "clipboardData", {
      value: {
        items: [{ kind: "file", type: "application/pdf", getAsFile: () => file }],
        files: [],
      },
    });
    up.find(".upload-pro").element.dispatchEvent(ev);
    await flushPromises();
    expect(ev.defaultPrevented).toBe(false);
    expect(up.findAll(".el-upload-list__item").length).toBe(1); // 仍为初始 1 个
  });

  it("el-form disabled=true + item disabled=false：item 覆盖表单，粘贴/删除恢复可用", async () => {
    const wrapper = mountInForm(true, { disabled: false });
    await flushPromises();
    const up = wrapper.findComponent(UploadPro);
    expect(up.find(".upload-pro__btn-paste").exists()).toBe(true);
    expect(up.find(".el-icon--close").exists()).toBe(true);
    expect(up.findComponent({ name: "ElUpload" }).props("disabled")).toBe(false);
    // 粘贴正常入队
    const file = new File(["x"], "pasted.pdf", { type: "application/pdf" });
    const ev = dispatchImagePaste(up.find(".upload-pro__btn-paste").element, [
      file,
    ]);
    expect(ev.defaultPrevented).toBe(true);
    await flushPromises();
    expect(up.findAll(".el-upload-list__item").length).toBe(2);
  });

  it("el-form disabled=false + item disabled=true：item 显式禁用优先生效", async () => {
    const wrapper = mountInForm(false, { disabled: true });
    await flushPromises();
    const up = wrapper.findComponent(UploadPro);
    expect(up.find(".upload-pro__btn-paste").exists()).toBe(false);
    expect(up.find(".el-icon--close").exists()).toBe(false);
    expect(up.findComponent({ name: "ElUpload" }).props("disabled")).toBe(true);
  });

  it("FormPro 集成：表单 disabled 透传到 UploadPro；itemRender.props.disabled=false 覆盖恢复", async () => {
    const makeForm = (itemDisabled) =>
      mount(FormPro, {
        props: {
          modelValue: {
            files: [{ name: "a.pdf", url: "https://example.com/a.pdf" }],
          },
          disabled: true,
          items: [
            {
              prop: "files",
              label: "附件",
              itemRender: {
                name: "UploadPro",
                props: {
                  listType: "text",
                  ...(itemDisabled === undefined
                    ? {}
                    : { disabled: itemDisabled }),
                },
              },
            },
          ],
        },
        global: globalConfig,
      });

    // item 未配置 disabled → 跟随 FormPro（el-form）禁用
    let wrapper = makeForm(undefined);
    await flushPromises();
    let up = wrapper.findComponent(UploadPro);
    expect(up.find(".upload-pro__btn-paste").exists()).toBe(false);
    expect(up.find(".el-icon--close").exists()).toBe(false);

    // item 显式 disabled=false → 覆盖表单级禁用，恢复可用
    wrapper = makeForm(false);
    await flushPromises();
    up = wrapper.findComponent(UploadPro);
    expect(up.find(".upload-pro__btn-paste").exists()).toBe(true);
    expect(up.find(".el-icon--close").exists()).toBe(true);
  });
});

// 回归：原先在同一 ElUpload 上写了两个同名 #file 插槽（v-if=isCard / v-if=!isCard），
// Volar 会报 X_V_SLOT_DUPLICATE_SLOT_NAMES 红色波浪线。修复为「单个 #file 插槽 +
// 内部 v-if/v-else 分支」，下列用例锁定该结构的分支互斥与响应式切换。
describe("UploadPro 统一 #file 插槽的内部分支（isCard v-if / v-else）", () => {
  const cardMarkers = (wrapper) => ({
    cardList: wrapper.find(".el-upload-list--picture-card").exists(),
    cardThumb: wrapper.find(".upload-pro__card-thumb").exists(),
    cardActions: wrapper.find(".el-upload-list__item-actions").exists(),
  });
  const listMarkers = (wrapper) => ({
    textOrPictureList:
      wrapper.find(".el-upload-list--text").exists() ||
      wrapper.find(".el-upload-list--picture").exists(),
    fileName: wrapper.find(".el-upload-list__item-name").exists(),
    eye: wrapper.find(".upload-pro__eye").exists(),
  });

  it("picture-card：仅走照片墙分支，非图片列表分支标记全部不存在", async () => {
    const wrapper = mountUpload({
      modelValue: [{ name: "a.png", url: "https://example.com/a.png" }],
    });
    await flushPromises();
    expect(cardMarkers(wrapper)).toEqual({
      cardList: true,
      cardThumb: true,
      cardActions: true,
    });
    // 互斥：列表分支的文件名 / 眼睛不得出现在照片墙卡片中
    expect(listMarkers(wrapper)).toEqual({
      textOrPictureList: false,
      fileName: false,
      eye: false,
    });
  });

  it("text：仅走列表分支，照片墙分支标记全部不存在", async () => {
    const wrapper = mountUpload({
      modelValue: [{ name: "a.pdf", url: "https://example.com/a.pdf" }],
      listType: "text",
    });
    await flushPromises();
    expect(listMarkers(wrapper)).toMatchObject({
      textOrPictureList: true,
      fileName: true,
      eye: true,
    });
    expect(cardMarkers(wrapper)).toEqual({
      cardList: false,
      cardThumb: false,
      cardActions: false,
    });
  });

  it("同一实例 listType 响应式切换：卡片分支 ↔ 列表分支随之互斥切换", async () => {
    const wrapper = mountUpload({
      modelValue: [{ name: "a.png", url: "https://example.com/a.png" }],
      listType: "picture-card",
    });
    await flushPromises();
    expect(wrapper.find(".upload-pro__card-thumb").exists()).toBe(true);
    expect(wrapper.find(".upload-pro__eye").exists()).toBe(false);

    // 卡片 → 文本列表
    await wrapper.setProps({ listType: "text" });
    await flushPromises();
    expect(wrapper.find(".el-upload-list--text").exists()).toBe(true);
    expect(wrapper.find(".upload-pro__card-thumb").exists()).toBe(false);
    expect(wrapper.find(".upload-pro__eye").exists()).toBe(true);

    // 文本列表 → 缩略图列表（同样落在非卡片 v-else 分支）
    await wrapper.setProps({ listType: "picture" });
    await flushPromises();
    expect(wrapper.find(".el-upload-list--picture").exists()).toBe(true);
    expect(wrapper.find(".upload-pro__card-thumb").exists()).toBe(false);
    expect(wrapper.find(".upload-pro__eye").exists()).toBe(true);

    // 再切回照片墙
    await wrapper.setProps({ listType: "picture-card" });
    await flushPromises();
    expect(wrapper.find(".upload-pro__card-thumb").exists()).toBe(true);
    expect(wrapper.find(".el-upload-list--picture").exists()).toBe(false);
    expect(wrapper.find(".upload-pro__eye").exists()).toBe(false);
  });

  it("切换后两分支的预览行为仍然正确（列表眼睛 → preview；卡片缩略图 → 内置查看器）", async () => {
    const wrapper = mountUpload({
      modelValue: [
        { name: "a.pdf", url: "https://example.com/a.pdf" },
        { name: "b.png", url: "https://example.com/b.png" },
      ],
      listType: "text",
    });
    await flushPromises();
    await wrapper.findAll(".upload-pro__eye")[0].trigger("click");
    await flushPromises();
    // text 分支：非图片 pdf → preview 事件；图片 b.png → 内置预览
    expect(wrapper.emitted("preview")?.[0]?.[0]).toMatchObject({
      name: "a.pdf",
      index: 0,
    });

    await wrapper.setProps({ listType: "picture-card" });
    await flushPromises();
    await wrapper.findAll(".upload-pro__card-thumb")[1].trigger("click");
    await flushPromises();
    // 预览集仅含成功图片（a.pdf 被过滤），b.png 定位到 0
    const img = wrapper.findComponent({ name: "ElImage" });
    expect(img.props("previewSrcList")).toEqual(["https://example.com/b.png"]);
    expect(img.props("initialIndex")).toBe(0);
    wrapper.unmount();
  });

  it("结构守卫：模板中只声明一个 #file 插槽（分支在插槽内部 v-if/v-else）", () => {
    const sfcPath = resolve(
      process.cwd(),
      "src/components/formPro/UploadPro.vue",
    );
    const { descriptor } = parse(readFileSync(sfcPath, "utf-8"), {
      filename: sfcPath,
    });
    const tpl = descriptor.template.content;
    // 两种具名插槽写法都计入：#file="..." 与 v-slot:file="..."；
    // 要求后接 =（容许空白），避免把注释中的 “#file” 文字计入
    const fileSlotDecls = tpl.match(/#file\s*=|v-slot:file\s*=/g) || [];
    expect(fileSlotDecls).toHaveLength(1);
    // 插槽内部必须存在按 isCard 区分的互斥分支
    expect(tpl).toContain('v-if="isCard"');
    expect(tpl).toContain("v-else");
  });
});

describe("UploadPro 拖拽上传宽高", () => {
  it("数字宽高转 px，字符串原样写入 CSS 变量", async () => {
    const wrapper = mountUpload({
      modelValue: [],
      drag: true,
      dragWidth: 480,
      dragHeight: 220,
    });
    const root = wrapper.find(".upload-pro").element;
    expect(root.style.getPropertyValue("--upload-pro-drag-w")).toBe("480px");
    expect(root.style.getPropertyValue("--upload-pro-drag-h")).toBe("220px");

    await wrapper.setProps({ dragWidth: "100%", dragHeight: "50vh" });
    expect(root.style.getPropertyValue("--upload-pro-drag-w")).toBe("100%");
    expect(root.style.getPropertyValue("--upload-pro-drag-h")).toBe("50vh");
  });

  it("drag 模式渲染拖拽区与自定义文案", () => {
    const wrapper = mountUpload({
      modelValue: [],
      drag: true,
      dragText: '拖到这里，或<em>选择</em>',
    });
    expect(wrapper.find(".el-upload-dragger").exists()).toBe(true);
    expect(wrapper.find(".el-upload__text").html()).toContain("<em>选择</em>");
  });

  it("drag 模式粘贴文件（无按钮旁入口，走根节点 @paste）入队成功", async () => {
    const wrapper = mountUpload({
      modelValue: [],
      drag: true,
      listType: "text",
      autoUpload: false,
    });
    // drag 模式不渲染按钮旁粘贴入口
    expect(wrapper.find(".upload-pro__btn-paste").exists()).toBe(false);
    // 直接在根节点派发 paste（模拟拖拽区获得焦点后 Ctrl+V）
    const file = new File(["x"], "drag-paste.pdf", { type: "application/pdf" });
    const ev = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "clipboardData", {
      value: {
        items: [{ kind: "file", type: "application/pdf", getAsFile: () => file }],
        files: [],
      },
    });
    wrapper.find(".upload-pro").element.dispatchEvent(ev);
    await flushPromises();
    expect(wrapper.findAll(".el-upload-list__item").length).toBe(1);
  });
});

// el-upload 完整 API 集成核对：
//  - 未显式声明的属性经 $attrs 透传到内部 ElUpload（action / headers / method /
//    data / name / withCredentials / httpRequest / directory / crossorigin）；
//  - 默认插槽整体转发，可自定义触发器，内置按钮作为兜底；
//  - el-upload 全部 5 个实例方法均有便捷代理。
describe("UploadPro 对 el-upload API 的完整集成", () => {
  it("未显式声明的 el-upload 属性经 $attrs 原样透传到内部 ElUpload", () => {
    const httpRequest = vi.fn();
    const wrapper = mountUpload({
      modelValue: [],
      action: "https://up.example.com/upload",
      headers: { token: "x-1" },
      method: "put",
      data: { biz: "form-pro" },
      name: "fileField",
      withCredentials: true,
      httpRequest,
      directory: true,
      crossorigin: "anonymous",
    });
    const el = wrapper.findComponent({ name: "ElUpload" });
    expect(el.props("action")).toBe("https://up.example.com/upload");
    expect(el.props("headers")).toEqual({ token: "x-1" });
    expect(el.props("method")).toBe("put");
    expect(el.props("data")).toEqual({ biz: "form-pro" });
    expect(el.props("name")).toBe("fileField");
    expect(el.props("withCredentials")).toBe(true);
    expect(el.props("httpRequest")).toBe(httpRequest);
    expect(el.props("directory")).toBe(true);
    expect(el.props("crossorigin")).toBe("anonymous");
  });

  it("action 未传或为空串时默认 '#'；显式传入时透传", () => {
    // 未传
    const noAction = mountUpload({ modelValue: [] });
    expect(noAction.findComponent({ name: "ElUpload" }).props("action")).toBe("#");
    // 空串同样回退默认
    const emptyAction = mountUpload({ modelValue: [], action: "" });
    expect(emptyAction.findComponent({ name: "ElUpload" }).props("action")).toBe("#");
    // 显式传入：透传原值
    const withAction = mountUpload({ modelValue: [], action: "/api/upload" });
    expect(withAction.findComponent({ name: "ElUpload" }).props("action")).toBe("/api/upload");
  });

  it("外部默认插槽整体替换内置触发器；不传插槽时回退内置按钮", () => {
    const withSlot = mount(
      defineComponent({
        setup() {
          return () =>
            h(
              UploadPro,
              { modelValue: [], listType: "text" },
              {
                default: () =>
                  h(
                    "button",
                    { type: "button", class: "my-trigger" },
                    "自定义触发器",
                  ),
              },
            );
        },
      }),
      { global: globalConfig },
    );
    expect(withSlot.find(".my-trigger").exists()).toBe(true);
    expect(withSlot.find(".el-button").exists()).toBe(false);

    // 不传插槽：内置按钮兜底
    const fallback = mountUpload({ modelValue: [], listType: "text" });
    expect(fallback.find(".el-button").exists()).toBe(true);
    expect(fallback.find(".el-button").text()).toContain("点击上传");

    // 照片墙兜底为 + 号卡片触发区（无按钮）
    const card = mountUpload({ modelValue: [] });
    expect(card.find(".el-upload--picture-card").exists()).toBe(true);
  });

  it("defineExpose 覆盖 el-upload 全部 5 个实例方法 + pasteImages", () => {
    const wrapper = mountUpload({ modelValue: [] });
    for (const m of [
      "abort",
      "submit",
      "clearFiles",
      "handleStart",
      "handleRemove",
      "pasteImages",
    ]) {
      expect(typeof wrapper.vm[m]).toBe("function");
    }
    // 原始 el-upload 实例同样暴露
    expect(wrapper.vm.uploadRef?.$options?.name || wrapper.vm.uploadRef).toBeTruthy();
  });

  it("handleStart 代理：编程式入队文件（autoUpload=false 进入待上传列表）", async () => {
    const wrapper = mountUpload({ modelValue: [], autoUpload: false });
    wrapper.vm.handleStart(
      new File(["abc"], "manual.png", { type: "image/png" }),
    );
    await flushPromises();
    expect(wrapper.findAll(".el-upload-list__item").length).toBe(1);
  });

  it("handleRemove 代理：传入原始 File 移除已入队文件并同步 v-model", async () => {
    const wrapper = mountUpload({
      modelValue: [],
      listType: "text",
      autoUpload: false,
    });
    const raw = new File(["abc"], "manual.pdf", {
      type: "application/pdf",
    });
    wrapper.vm.handleStart(raw);
    await flushPromises();
    expect(wrapper.findAll(".el-upload-list__item").length).toBe(1);
    // el-upload 支持传原始 File（内部按 uid 查 UploadFile）
    wrapper.vm.handleRemove(raw);
    await flushPromises();
    expect(wrapper.findAll(".el-upload-list__item").length).toBe(0);
    // 经 el-upload 移除链路 → onRemove 向外抛出（ready 文件未成功上传，
    // v-model 本就是 []，无成功项可序列化故不产生 update:modelValue）
    expect(wrapper.emitted("remove")).toBeTruthy();
  });

  it("mutableModel：reactive 数组承载时原地 splice 同步，不 emit update:modelValue", async () => {
    const files = reactive([{ name: "a.png", url: "https://x/a.png" }]);
    const wrapper = mountUpload({
      modelValue: files,
      mutableModel: true,
      listType: "text",
    });
    await flushPromises();
    expect(wrapper.findAll(".el-upload-list__item").length).toBe(1);
    // 清空内部列表 → 同一 reactive 数组被原地清空（引用不变），且不 emit
    wrapper.vm.clearFiles();
    await flushPromises();
    expect(files).toHaveLength(0);
    expect(wrapper.emitted("update:modelValue")).toBeFalsy();
    // 父级原地直写（push）仍能经深 watch 重建内部列表
    files.push({ name: "b.png", url: "https://x/b.png" });
    await flushPromises();
    expect(wrapper.findAll(".el-upload-list__item").length).toBe(1);
  });

  it("mutableModel + valueFormat=string：父级数组原地同步为 string[]", async () => {
    const files = reactive(["https://x/a.png"]);
    const wrapper = mountUpload({
      modelValue: files,
      mutableModel: true,
      valueFormat: "string",
      listType: "text",
    });
    await flushPromises();
    expect(wrapper.findAll(".el-upload-list__item").length).toBe(1);
    // 清空 → 原地 splice：字符串元素按值同步，引用不变、不 emit
    wrapper.vm.clearFiles();
    await flushPromises();
    expect(files).toHaveLength(0);
    expect(wrapper.emitted("update:modelValue")).toBeFalsy();
  });

  it("clearFiles 代理：清空列表并经 v-model 回抛空数组", async () => {
    const wrapper = mountUpload({
      modelValue: [{ name: "a.pdf", url: "https://example.com/a.pdf" }],
      listType: "text",
    });
    await flushPromises();
    wrapper.vm.clearFiles();
    await flushPromises();
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeTruthy();
    expect(emitted[emitted.length - 1][0]).toEqual([]);
  });
});

describe("UploadPro 业务字段保真（id 等）", () => {
  it("回填对象的业务字段在删除其他项后的回写中保留", async () => {
    const wrapper = mountUpload({
      modelValue: [
        { id: 101, name: "合同.pdf", url: "https://example.com/a.pdf" },
        { id: 102, name: "发票.pdf", url: "https://example.com/b.pdf" },
      ],
      listType: "text",
    });
    await flushPromises();
    // 删除第二项 → 触发回写，剩余项应以原对象为基底（id 保留）
    const rows = wrapper.findAll(".el-icon--close");
    expect(rows.length).toBe(2);
    await rows[1].trigger("click");
    await flushPromises();
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeTruthy();
    const last = emitted[emitted.length - 1][0];
    expect(last).toHaveLength(1);
    expect(last[0].id).toBe(101);
    expect(last[0].name).toBe("合同.pdf");
    expect(last[0].url).toBe("https://example.com/a.pdf");
  });

  it("remove / 事件链路的 file 上可直接取到业务字段（file.id）", async () => {
    const wrapper = mountUpload({
      modelValue: [{ id: 101, name: "合同.pdf", url: "https://example.com/a.pdf" }],
      listType: "text",
    });
    await flushPromises();
    await wrapper.find(".el-icon--close").trigger("click");
    await flushPromises();
    const removed = wrapper.emitted("remove");
    expect(removed).toBeTruthy();
    expect(removed[0][0].id).toBe(101);
  });

  it("resolveResponse 返回对象整体透传：新上传文件的服务端字段（id）进入 v-model", async () => {
    const httpRequest = (option) =>
      Promise.resolve({
        code: 200,
        data: { id: "srv-9001", url: "https://example.com/new.pdf" },
      });
    const wrapper = mountUpload({
      modelValue: [],
      listType: "text",
      httpRequest,
      resolveResponse: (resp) => ({
        id: resp.data.id,
        url: resp.data.url,
      }),
    });
    await flushPromises();
    const file = new File(["%PDF"], "新文件.pdf", { type: "application/pdf" });
    wrapper.vm.handleStart(file);
    // handleStart 仅入队（status=ready），需显式 submit 触发 httpRequest
    wrapper.vm.submit();
    await flushPromises();
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeTruthy();
    const last = emitted[emitted.length - 1][0];
    expect(last).toHaveLength(1);
    // name 回退为文件名；id / url 来自 resolveResponse 透传
    expect(last[0].id).toBe("srv-9001");
    expect(last[0].name).toBe("新文件.pdf");
    expect(last[0].url).toBe("https://example.com/new.pdf");
  });

  it("mutableModel 模式下业务字段同样保真", async () => {
    const files = reactive([
      { id: 201, name: "a.pdf", url: "https://example.com/a.pdf" },
      { id: 202, name: "b.pdf", url: "https://example.com/b.pdf" },
    ]);
    const wrapper = mountUpload({
      modelValue: files,
      mutableModel: true,
      listType: "text",
    });
    await flushPromises();
    await wrapper.findAll(".el-icon--close")[1].trigger("click");
    await flushPromises();
    expect(files).toHaveLength(1);
    expect(files[0].id).toBe(201);
    expect(wrapper.emitted("update:modelValue")).toBeFalsy();
  });

  it("valueFormat=url 时不受保真逻辑影响（仍为纯 URL 字符串）", async () => {
    const wrapper = mountUpload({
      modelValue: [{ id: 101, name: "合同.pdf", url: "https://example.com/a.pdf" }],
      listType: "text",
      valueFormat: "url",
    });
    await flushPromises();
    await wrapper.find(".el-icon--close").trigger("click");
    await flushPromises();
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted[emitted.length - 1][0]).toEqual([]);
  });
});

describe("UploadPro 非 success / 无 url 项也进入绑定值", () => {
  it("回填无 url 对象：正常展示，删除后回写为空", async () => {
    const wrapper = mountUpload({
      modelValue: [{ name: "待补传.pdf" }],
      listType: "text",
    });
    await flushPromises();
    expect(wrapper.findAll(".el-upload-list__item").length).toBe(1);
    expect(wrapper.find(".el-upload-list__item-name").text()).toContain("待补传.pdf");
    await wrapper.find(".el-icon--close").trigger("click");
    await flushPromises();
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted[emitted.length - 1][0]).toEqual([]);
  });

  it("上传中（未拿到 url）的文件也实时进入绑定值", async () => {
    const httpRequest = () => new Promise(() => {}); // 永不 resolve：保持 uploading
    const wrapper = mountUpload({
      modelValue: [],
      listType: "text",
      httpRequest,
      autoUpload: true,
    });
    await flushPromises();
    wrapper.vm.handleStart(new File(["%PDF"], "传输中.pdf", { type: "application/pdf" }));
    wrapper.vm.submit();
    await flushPromises();
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeTruthy();
    const last = emitted[emitted.length - 1][0];
    expect(last).toHaveLength(1);
    expect(last[0]).toMatchObject({ name: "传输中.pdf", url: "" });
  });

  it("上传失败的文件（无 url）同样保留在绑定值中", async () => {
    const httpRequest = () => Promise.reject(new Error("500"));
    const wrapper = mountUpload({
      modelValue: [],
      listType: "text",
      httpRequest,
      autoUpload: true,
      showErrorMessage: false,
    });
    await flushPromises();
    wrapper.vm.handleStart(new File(["%PDF"], "失败.pdf", { type: "application/pdf" }));
    wrapper.vm.submit();
    await flushPromises();
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeTruthy();
    const last = emitted[emitted.length - 1][0];
    expect(last).toHaveLength(1);
    expect(last[0]).toMatchObject({ name: "失败.pdf", url: "" });
  });

  it("延迟上传场景：autoUpload=false 入队后绑定值携带 raw/status/uid，可筛出 raw 手动上传", async () => {
    const httpRequest = vi.fn();
    const wrapper = mountUpload({
      modelValue: [],
      listType: "text",
      httpRequest,
      autoUpload: false,
    });
    await flushPromises();
    const file = new File(["%PDF"], "待确认.pdf", { type: "application/pdf" });
    wrapper.vm.handleStart(file);
    await flushPromises();
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toBeTruthy();
    const last = emitted[emitted.length - 1][0];
    expect(last).toHaveLength(1);
    // raw 保持 File 原引用；status 为 ready；uid 已分配
    expect(last[0].raw).toBeInstanceOf(File);
    expect(last[0].raw.name).toBe("待确认.pdf");
    expect(last[0].status).toBe("ready");
    expect(last[0].uid).toBeTruthy();
    // 模拟「确认」动作：筛出带 raw 的项手动 submit
    expect(last.filter((it) => it.raw).length).toBe(1);
    wrapper.vm.submit();
    await flushPromises();
    expect(httpRequest).toHaveBeenCalledTimes(1);
  });
});

describe("UploadPro 实例方法：getRawFiles / getRemovedFiles", () => {
  it("getRawFiles：仅返回带 File(raw) 的项，回填项（无 raw）不计入", async () => {
    const wrapper = mountUpload({
      modelValue: [{ name: "已存.pdf", url: "https://example.com/a.pdf" }],
      listType: "text",
      autoUpload: false,
      httpRequest: () => new Promise(() => {}),
    });
    await flushPromises();
    expect(wrapper.vm.getRawFiles()).toEqual([]);
    wrapper.vm.handleStart(new File(["1"], "新文件1.txt", { type: "text/plain" }));
    wrapper.vm.handleStart(new File(["2"], "新文件2.txt", { type: "text/plain" }));
    await flushPromises();
    const rawFiles = wrapper.vm.getRawFiles();
    expect(rawFiles).toHaveLength(2);
    expect(rawFiles[0].raw).toBeInstanceOf(File);
    expect(rawFiles.map((it) => it.name)).toEqual(["新文件1.txt", "新文件2.txt"]);
    // 与 v-model 同构（含 status/uid）
    expect(rawFiles[0].status).toBe("ready");
    expect(rawFiles[0].uid).toBeTruthy();
  });

  it("getRemovedFiles：累计收集被移除文件的完整数据（含业务字段）", async () => {
    const wrapper = mountUpload({
      modelValue: [
        { id: 1, name: "甲.pdf", url: "https://example.com/a.pdf" },
        { id: 2, name: "乙.pdf", url: "https://example.com/b.pdf" },
      ],
      listType: "text",
      autoUpload: false,
      httpRequest: () => new Promise(() => {}),
    });
    await flushPromises();
    expect(wrapper.vm.getRemovedFiles()).toEqual([]);
    await wrapper.findAll(".el-icon--close")[0].trigger("click");
    await flushPromises();
    // 待上传（含 raw）的项被移除同样归档
    wrapper.vm.handleStart(new File(["x"], "待上传.txt", { type: "text/plain" }));
    await flushPromises();
    await wrapper.findAll(".el-icon--close")[1].trigger("click");
    await flushPromises();
    const removed = wrapper.vm.getRemovedFiles();
    expect(removed).toHaveLength(2);
    expect(removed[0]).toMatchObject({
      id: 1,
      name: "甲.pdf",
      url: "https://example.com/a.pdf",
    });
    expect(removed[1].name).toBe("待上传.txt");
    expect(removed[1].raw).toBeInstanceOf(File);
    // 返回副本：外部修改不影响内部归档
    removed.length = 0;
    expect(wrapper.vm.getRemovedFiles()).toHaveLength(2);
  });

  it("getRemovedFiles(field)：仅收集存在该属性且有值的项", async () => {
    const wrapper = mountUpload({
      modelValue: [
        { id: 1, name: "甲.pdf", url: "https://example.com/a.pdf" },
        { name: "乙.pdf", url: "https://example.com/b.pdf" }, // 无 id
        { id: 0, name: "丙.pdf", url: "https://example.com/c.pdf" }, // id 无值
      ],
      listType: "text",
      autoUpload: false,
      httpRequest: () => new Promise(() => {}),
    });
    await flushPromises();
    for (const close of wrapper.findAll(".el-icon--close")) {
      await close.trigger("click");
      await flushPromises();
    }
    const withId = wrapper.vm.getRemovedFiles("id");
    expect(withId).toHaveLength(1);
    expect(withId[0].id).toBe(1);
  });

  it("getRemovedFiles(field, true)：收集该属性的值，返回数组", async () => {
    const wrapper = mountUpload({
      modelValue: [
        { name: "甲.pdf", url: "https://example.com/a.pdf" },
        { name: "乙.pdf", url: "https://example.com/b.pdf" },
      ],
      listType: "text",
      autoUpload: false,
      httpRequest: () => new Promise(() => {}),
    });
    await flushPromises();
    for (const close of wrapper.findAll(".el-icon--close")) {
      await close.trigger("click");
      await flushPromises();
    }
    expect(wrapper.vm.getRemovedFiles("url", true)).toEqual([
      "https://example.com/a.pdf",
      "https://example.com/b.pdf",
    ]);
  });
});

describe("UploadPro fieldMap 字段映射", () => {
  it("回填 fileName/fileUrl 对象：正常显示，删除回写按映射键输出且业务字段保真", async () => {
    const wrapper = mountUpload({
      modelValue: [
        { id: 7, fileName: "合同.pdf", fileUrl: "https://example.com/a.pdf" },
        { id: 8, fileName: "发票.pdf", fileUrl: "https://example.com/b.pdf" },
      ],
      fieldMap: { name: "fileName", url: "fileUrl" },
      listType: "text",
    });
    await flushPromises();
    const names = wrapper.findAll(".el-upload-list__item-name");
    expect(names.length).toBe(2);
    expect(names[0].text()).toContain("合同.pdf");
    // 删除第二项 → 回写剩余项应为映射键 + id 保真，且不多出 name/url 键
    await wrapper.findAll(".el-icon--close")[1].trigger("click");
    await flushPromises();
    const emitted = wrapper.emitted("update:modelValue");
    const last = emitted[emitted.length - 1][0];
    expect(last).toHaveLength(1);
    // 映射键 + id 保真（另携带 uid/status 等内部状态字段，此处不强约束）
    expect(last[0]).toMatchObject({
      id: 7,
      fileName: "合同.pdf",
      fileUrl: "https://example.com/a.pdf",
    });
    expect(last[0].name).toBeUndefined();
    expect(last[0].url).toBeUndefined();
  });

  it("新上传：responseKey 指向映射 url 字段，文件名取响应 data 中映射 name 字段", async () => {
    const httpRequest = () =>
      Promise.resolve({
        code: 200,
        data: { fileId: "f-1", fileName: "服务端命名.pdf", fileUrl: "https://example.com/s.pdf" },
      });
    const wrapper = mountUpload({
      modelValue: [],
      listType: "text",
      httpRequest,
      autoUpload: true,
      fieldMap: { name: "fileName", url: "fileUrl" },
      responseKey: "data.fileUrl",
    });
    await flushPromises();
    wrapper.vm.handleStart(new File(["%PDF"], "本地名.pdf", { type: "application/pdf" }));
    wrapper.vm.submit();
    await flushPromises();
    const emitted = wrapper.emitted("update:modelValue");
    const last = emitted[emitted.length - 1][0];
    expect(last).toHaveLength(1);
    // 名称优先取响应 data.fileName；输出使用映射键，不产生 name/url 键
    expect(last[0].fileName).toBe("服务端命名.pdf");
    expect(last[0].fileUrl).toBe("https://example.com/s.pdf");
    expect(last[0].name).toBeUndefined();
    expect(last[0].url).toBeUndefined();
  });

  it("fieldMap 下签名比较防回环：父级回写相同值不触发重建/重复 emit", async () => {
    const wrapper = mountUpload({
      modelValue: [{ fileName: "a.pdf", fileUrl: "https://example.com/a.pdf" }],
      fieldMap: { name: "fileName", url: "fileUrl" },
      listType: "text",
    });
    await flushPromises();
    // 父级以相同语义值（不同对象引用）回写 → 不应产生任何 emit
    await wrapper.setProps({
      modelValue: [{ fileName: "a.pdf", fileUrl: "https://example.com/a.pdf" }],
    });
    await flushPromises();
    expect(wrapper.emitted("update:modelValue")).toBeFalsy();
    expect(wrapper.findAll(".el-upload-list__item").length).toBe(1);
  });
});

describe("UploadPro 与 FormPro 集成（itemRender 内置控件）", () => {
  it("itemRender.name=UploadPro 正常渲染；缺失字段自动补 []", async () => {
    const wrapper = mount(FormPro, {
      props: {
        modelValue: {},
        items: [
          {
            prop: "photos",
            label: "照片",
            itemRender: { name: "UploadPro", props: { limit: 3 } },
          },
        ],
      },
      global: globalConfig,
    });
    await flushPromises();
    const up = wrapper.findComponent(UploadPro);
    expect(up.exists()).toBe(true);
    expect(up.props("modelValue")).toEqual([]);
    expect(up.props("limit")).toBe(3);
  });

  it("events.preview 经 itemRender.events 透传到配置回调", async () => {
    const onPreview = vi.fn();
    const wrapper = mount(FormPro, {
      props: {
        modelValue: { files: [{ name: "a.zip", url: "https://example.com/a.zip" }] },
        items: [
          {
            prop: "files",
            label: "附件",
            itemRender: {
              name: "UploadPro",
              props: { listType: "text" },
              events: { preview: onPreview },
            },
          },
        ],
      },
      global: globalConfig,
    });
    await flushPromises();
    const up = wrapper.findComponent(UploadPro);
    up.vm.$emit("preview", { name: "a.zip" });
    expect(onPreview).toHaveBeenCalledWith({ name: "a.zip" });
  });

  it("UploadPro 回抛数据写回 formData 并向外同步", async () => {
    const formData = ref({});
    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(FormPro, {
              ref: "form",
              modelValue: formData.value,
              "onUpdate:modelValue": (v) => (formData.value = v),
              items: [
                {
                  prop: "photos",
                  label: "照片",
                  itemRender: { name: "UploadPro" },
                },
              ],
            });
        },
      }),
      { global: globalConfig },
    );
    await flushPromises();
    const up = wrapper.findComponent(UploadPro);
    up.vm.$emit("update:modelValue", [
      { name: "a.png", url: "https://example.com/a.png" },
    ]);
    await flushPromises();
    expect(formData.value.photos).toEqual([
      { name: "a.png", url: "https://example.com/a.png" },
    ]);
  });
});

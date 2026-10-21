import { describe, it, expect } from "vitest";
import {
  isImageFile,
  nameFromUrl,
  normalizeIncoming,
  extractClipboardImages,
  extractClipboardFiles,
  resolveFileDescriptor,
  serializeValue,
  valueSignature,
  toCssSize,
  formatSize,
} from "../../src/components/formPro/uploadUtils.js";

describe("uploadUtils.isImageFile", () => {
  it("优先按 MIME 判定", () => {
    expect(isImageFile({ raw: { type: "image/png" }, name: "a.bin" })).toBe(true);
    expect(isImageFile({ type: "image/gif", name: "x" })).toBe(true);
    expect(isImageFile({ raw: { type: "application/pdf" }, name: "a.pdf" })).toBe(
      false,
    );
  });

  it("MIME 缺失时按扩展名兜底（大小写不敏感）", () => {
    expect(isImageFile({ name: "a.PNG" })).toBe(true);
    expect(isImageFile({ name: "a.jpeg" })).toBe(true);
    expect(isImageFile({ name: "a.webp" })).toBe(true);
    expect(isImageFile({ name: "a.pdf" })).toBe(false);
    expect(isImageFile({ name: "noext" })).toBe(false);
  });

  it("识别 data:image/ 回填地址", () => {
    expect(
      isImageFile({ name: "x", url: "data:image/svg+xml;utf8,<svg/>" }),
    ).toBe(true);
    expect(
      isImageFile({ name: "x", url: "data:application/pdf;base64,AAA" }),
    ).toBe(false);
  });

  it("空值安全", () => {
    expect(isImageFile(null)).toBe(false);
    expect(isImageFile(undefined)).toBe(false);
  });
});

describe("uploadUtils.nameFromUrl", () => {
  it("取 URL 末段并去 query/hash、解码", () => {
    expect(nameFromUrl("https://x.com/a/b/c.png")).toBe("c.png");
    expect(nameFromUrl("https://x.com/a%20b.png?v=1#h")).toBe("a b.png");
    expect(nameFromUrl("")).toBe("file");
    // 根路径无文件名时取主机名段
    expect(nameFromUrl("https://x.com/")).toBe("x.com");
  });
});

describe("uploadUtils.normalizeIncoming", () => {
  it("字符串 URL 归一化为 success 文件项", () => {
    const out = normalizeIncoming(["https://x.com/a.png"]);
    expect(out).toEqual([
      { name: "a.png", url: "https://x.com/a.png", status: "success" },
    ]);
  });

  it("对象形态保留 name/url/response，状态置 success", () => {
    const out = normalizeIncoming([
      { name: "a", url: "u", response: { code: 200 } },
    ]);
    expect(out[0].status).toBe("success");
    expect(out[0].response).toEqual({ code: 200 });
  });

  it("丢弃非法项（null / 空串 / 无 url 对象），非数组返回空数组", () => {
    expect(normalizeIncoming([null, "", { name: "x" }])).toEqual([]);
    expect(normalizeIncoming(null)).toEqual([]);
  });
});

describe("uploadUtils.extractClipboardImages", () => {
  const fakeItem = (type, file) => ({
    kind: "file",
    type,
    getAsFile: () => file,
  });

  it("从 clipboardData.items 提取 image/* 文件，忽略文本与非图片", () => {
    const img = { type: "image/png" };
    const event = {
      clipboardData: {
        items: [
          { kind: "string", type: "text/plain", getAsFile: () => null },
          fakeItem("image/png", img),
          fakeItem("application/pdf", { type: "application/pdf" }),
        ],
      },
    };
    expect(extractClipboardImages(event)).toEqual([img]);
  });

  it("items 为空时回退 clipboardData.files", () => {
    const img = { type: "image/jpeg" };
    const event = { clipboardData: { items: [], files: [img] } };
    expect(extractClipboardImages(event)).toEqual([img]);
  });

  it("无剪贴板数据 / originalEvent 回退 / 非图片均返回空", () => {
    expect(extractClipboardImages({})).toEqual([]);
    expect(extractClipboardImages(null)).toEqual([]);
    expect(
      extractClipboardImages({
        originalEvent: { clipboardData: { items: [], files: [] } },
      }),
    ).toEqual([]);
  });
});

describe("uploadUtils.extractClipboardFiles", () => {
  const fakeItem = (type, file) => ({
    kind: "file",
    type,
    getAsFile: () => file,
  });

  it("从 clipboardData.items 提取全部文件（不限类型），忽略文本项", () => {
    const img = { type: "image/png" };
    const pdf = { type: "application/pdf" };
    const event = {
      clipboardData: {
        items: [
          { kind: "string", type: "text/plain", getAsFile: () => null },
          fakeItem("image/png", img),
          fakeItem("application/pdf", pdf),
        ],
      },
    };
    expect(extractClipboardFiles(event)).toEqual([img, pdf]);
  });

  it("items 无文件时回退 clipboardData.files（资源管理器复制文件）", () => {
    const zip = { type: "application/zip" };
    const event = { clipboardData: { items: [], files: [zip] } };
    expect(extractClipboardFiles(event)).toEqual([zip]);
  });

  it("无剪贴板数据 / getAsFile 返回空 / 空列表均返回空", () => {
    expect(extractClipboardFiles({})).toEqual([]);
    expect(extractClipboardFiles(null)).toEqual([]);
    expect(
      extractClipboardFiles({
        clipboardData: {
          items: [{ kind: "file", type: "image/png", getAsFile: () => null }],
          files: [],
        },
      }),
    ).toEqual([]);
  });
});

describe("uploadUtils.resolveFileDescriptor", () => {
  it("默认按 responseKey=data.url 提取", () => {
    const file = { name: "a.png", response: { data: { url: "u1" } } };
    expect(resolveFileDescriptor(file)).toEqual({ name: "a.png", url: "u1" });
  });

  it("自定义 responseKey 路径", () => {
    const file = { name: "a", response: { result: "u2" } };
    expect(resolveFileDescriptor(file, { responseKey: "result" })).toEqual({
      name: "a",
      url: "u2",
    });
  });

  it("回退 response.url 与字符串响应；最终回退 file.url", () => {
    expect(
      resolveFileDescriptor({ name: "a", response: { url: "u3" } }),
    ).toEqual({ name: "a", url: "u3" });
    expect(resolveFileDescriptor({ name: "a", response: "u4" })).toEqual({
      name: "a",
      url: "u4",
    });
    expect(resolveFileDescriptor({ name: "a", url: "u5" })).toEqual({
      name: "a",
      url: "u5",
    });
  });

  it("resolveResponse 函数优先级最高（对象 / 字符串）", () => {
    const file = { name: "a", response: { data: { url: "old" } } };
    expect(
      resolveFileDescriptor(file, {
        resolveResponse: () => ({ name: "b", url: "new" }),
      }),
    ).toEqual({ name: "b", url: "new" });
    expect(
      resolveFileDescriptor(
        { name: "a", response: {} },
        { resolveResponse: () => "new2" },
      ),
    ).toEqual({ name: "a", url: "new2" });
  });
});

describe("uploadUtils.serializeValue", () => {
  const files = [
    {
      name: "a.png",
      status: "success",
      response: { data: { url: "ua" } },
    },
    { name: "b.png", status: "uploading" }, // 未成功不输出
    { name: "c.pdf", status: "success", url: "uc" },
  ];

  it("仅输出 success 项，默认 {name,url} 形态", () => {
    expect(serializeValue(files)).toEqual([
      { name: "a.png", url: "ua" },
      { name: "c.pdf", url: "uc" },
    ]);
  });

  it("valueFormat=url 输出字符串数组", () => {
    expect(serializeValue(files, { valueFormat: "url" })).toEqual([
      "ua",
      "uc",
    ]);
  });
});

describe("uploadUtils.valueSignature / toCssSize / formatSize", () => {
  it("valueSignature 对 string[] 与 {name,url}[] 规范化比较", () => {
    expect(valueSignature(["u"])).toBe(valueSignature([{ url: "u" }]));
  });

  it("toCssSize 数字转 px，字符串原样，空值安全", () => {
    expect(toCssSize(220)).toBe("220px");
    expect(toCssSize("100%")).toBe("100%");
    expect(toCssSize("")).toBe("");
    expect(toCssSize(null)).toBe("");
    expect(toCssSize(NaN)).toBe("");
  });

  it("formatSize B/KB/MB", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2048)).toBe("2.0 KB");
    expect(formatSize(1024 * 1024 * 2)).toBe("2.00 MB");
  });
});

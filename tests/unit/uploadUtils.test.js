import { describe, it, expect } from "vitest";
import {
  isImageFile,
  nameFromUrl,
  normalizeIncoming,
  findUnsafeFileNameChars,
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

  it("丢弃 null / 空串项；无 url 对象保留（url 归一为空串）；非数组返回空数组", () => {
    const out = normalizeIncoming([null, "", { name: "x" }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "x", url: "", status: "success" });
    expect(normalizeIncoming(null)).toEqual([]);
  });

  it("fieldMap：按映射字段读取 name/url，业务字段平铺且原对象作保真基底", () => {
    const item = { id: 7, fileName: "a.pdf", fileUrl: "u7" };
    const out = normalizeIncoming([item], { name: "fileName", url: "fileUrl" });
    expect(out[0]).toMatchObject({ id: 7, name: "a.pdf", url: "u7" });
    expect(out[0].__rawItem).toBe(item);
  });
});

describe("uploadUtils.findUnsafeFileNameChars", () => {
  it("安全文件名返回空数组（中文 / 空格 / 点 / 中划线 / 下划线）", () => {
    expect(findUnsafeFileNameChars("正常 文件-名_1.2.png")).toEqual([]);
    expect(findUnsafeFileNameChars("report.final.v2.pdf")).toEqual([]);
  });

  it("检出 URL 结构符并按出现顺序去重", () => {
    expect(findUnsafeFileNameChars("a#b?.png")).toEqual(["#", "?"]);
    expect(findUnsafeFileNameChars("a##b#c.png")).toEqual(["#"]);
    expect(findUnsafeFileNameChars("100%&a+b=c.zip")).toEqual([
      "%",
      "&",
      "+",
      "=",
    ]);
  });

  it("检出文件系统保留字符", () => {
    expect(findUnsafeFileNameChars('a/b\\c:d*e?f"g<h>i|j.txt')).toEqual([
      "/",
      "\\",
      ":",
      "*",
      "?",
      '"',
      "<",
      ">",
      "|",
    ]);
  });

  it("非字符串 / 空串返回空数组", () => {
    expect(findUnsafeFileNameChars("")).toEqual([]);
    expect(findUnsafeFileNameChars(null)).toEqual([]);
    expect(findUnsafeFileNameChars(undefined)).toEqual([]);
  });
});

describe("uploadUtils.extractClipboardFiles", () => {
  const fakeItem = (type, file) => ({
    kind: "file",
    type,
    getAsFile: () => file,
  });

  it("默认从 clipboardData.items 提取全部文件（不限类型），忽略文本项", () => {
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

  it("onlyImages=true 时只提取 image/*，忽略文本与非图片", () => {
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
    expect(extractClipboardFiles(event, true)).toEqual([img]);
  });

  it("items 无文件时回退 clipboardData.files，onlyImages 同样生效", () => {
    const img = { type: "image/jpeg" };
    const zip = { type: "application/zip" };
    const event = { clipboardData: { items: [], files: [img, zip] } };
    expect(extractClipboardFiles(event)).toEqual([img, zip]);
    expect(extractClipboardFiles(event, true)).toEqual([img]);
  });

  it("无剪贴板数据 / originalEvent 回退 / getAsFile 返回空 / 空列表均返回空", () => {
    expect(extractClipboardFiles({})).toEqual([]);
    expect(extractClipboardFiles(null)).toEqual([]);
    expect(
      extractClipboardFiles({
        originalEvent: { clipboardData: { items: [], files: [] } },
      }),
    ).toEqual([]);
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
    { name: "b.png", status: "uploading" }, // 无 url 项同样输出（url 为空串）
    { name: "c.pdf", status: "success", url: "uc" },
  ];

  it("不再过滤非 success 项；全量保真（status / response 等内部字段一并带出）", () => {
    const out = serializeValue(files);
    expect(out[0]).toEqual({
      name: "a.png",
      url: "ua",
      status: "success",
      response: { data: { url: "ua" } },
    });
    expect(out[1]).toEqual({ name: "b.png", url: "", status: "uploading" });
    expect(out[2]).toEqual({
      name: "c.pdf",
      url: "uc",
      status: "success",
    });
  });

  it("valueFormat=url 输出字符串数组（无 url 项为空串）", () => {
    expect(serializeValue(files, { valueFormat: "url" })).toEqual([
      "ua",
      "",
      "uc",
    ]);
  });

  it("fieldMap：输出按映射键写回，不产生 name/url 键", () => {
    const out = serializeValue(
      [{ name: "a.pdf", url: "u", status: "success" }],
      { fieldMap: { name: "fileName", url: "fileUrl" } },
    );
    expect(out).toEqual([{ fileName: "a.pdf", fileUrl: "u", status: "success" }]);
  });

  it("携带 el-upload 内部状态字段：uid / status / percentage / raw（存在时）", () => {
    const raw = { name: "x.png" }; // 模拟 File 对象
    const out = serializeValue([
      {
        name: "a.png",
        url: "ua",
        status: "ready",
        uid: 123,
        percentage: 0,
        raw,
      },
    ]);
    expect(out[0]).toMatchObject({
      name: "a.png",
      url: "ua",
      status: "ready",
      uid: 123,
      percentage: 0,
    });
    expect(out[0].raw).toBe(raw); // raw 保持原引用，确认按钮后可取出手动上传
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

/**
 * UploadPro 纯函数工具集（与渲染解耦，便于单测）。
 *
 * 数据模型：
 *  - v-model 值为「已上传成功」的文件描述符数组，支持两种元素形态：
 *      ① 字符串：'https://x.com/a.png'（按 URL 末段推导文件名）
 *      ② 对象：  { name: 'a.png', url: 'https://...' }
 *  - 组件内部统一归一化为 UploadUserFile（el-upload fileList 项）：
 *      { name, url, status: 'success', uid?, response?, raw? }
 */
import { get } from "lodash-es";

/** 常见图片扩展名（raw.type 缺失时兜底判定） */
export const IMAGE_EXT_RE =
  /\.(png|jpe?g|gif|bmp|webp|svg|avif|ico|heic|heif)$/i;

/**
 * 判定一个文件是否为图片。
 * 优先使用 MIME（raw.type / type），缺失时按扩展名兜底。
 * @param {UploadUserFile|File|{name?:string,type?:string,raw?:File}} file
 */
export const isImageFile = (file) => {
  if (!file) return false;
  const mime = file.raw?.type || file.type;
  if (typeof mime === "string" && mime) return mime.startsWith("image/");
  // data URI 回填（如 data:image/png;base64,... / data:image/svg+xml,...）
  if (typeof file.url === "string" && /^data:image\//i.test(file.url))
    return true;
  const name = file.name || (typeof file === "string" ? file : "");
  return IMAGE_EXT_RE.test(name);
};

/**
 * 从 URL 末段推导文件名（去 query/hash，解码 URI）。
 */
export const nameFromUrl = (url, fallback = "file") => {
  if (typeof url !== "string" || !url) return fallback;
  const path = url.split(/[?#]/)[0];
  const seg = path.split("/").filter(Boolean).pop();
  if (!seg) return fallback;
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
};

/**
 * 将外部 v-model 值归一化为 el-upload fileList（success 态）。
 * 不修改入参；非法项（null / 无 url 的非字符串）被丢弃。
 * @param {Array} value
 * @returns {Array<UploadUserFile>}
 */
export const normalizeIncoming = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item, i) => {
      if (item == null) return null;
      if (typeof item === "string") {
        if (!item) return null;
        return {
          name: nameFromUrl(item, `file-${i + 1}`),
          url: item,
          status: "success",
        };
      }
      if (!item.url) return null;
      return {
        name: item.name || nameFromUrl(item.url, `file-${i + 1}`),
        url: item.url,
        status: "success",
        ...(item.response !== undefined ? { response: item.response } : null),
      };
    })
    .filter(Boolean);

/**
 * 从粘贴事件中提取图片 File 列表。
 * 同时覆盖 clipboardData.items（网页复制图片常见）与 clipboardData.files
 * （部分场景以文件形式出现）；只提取 image/*，非图片内容不拦截。
 * @param {ClipboardEvent} event
 * @returns {File[]}
 */
export const extractClipboardImages = (event) => {
  const cd =
    event?.clipboardData || event?.originalEvent?.clipboardData || null;
  if (!cd) return [];
  const files = [];
  const pushIfImage = (f) => {
    if (f && f.type && f.type.startsWith("image/")) files.push(f);
  };
  // ① DataTransferItemList（网页中「复制图片」最常见的承载形式）
  if (cd.items && typeof cd.items.length === "number") {
    for (const item of cd.items) {
      if (!item || item.kind !== "file") continue;
      if (item.type && !item.type.startsWith("image/")) continue;
      if (typeof item.getAsFile === "function") pushIfImage(item.getAsFile());
    }
  }
  // ② DataTransfer.files（截图工具 / 资源管理器粘贴文件）
  if (files.length === 0 && cd.files && typeof cd.files.length === "number") {
    for (const f of cd.files) pushIfImage(f);
  }
  return files;
};

/**
 * 从粘贴事件中提取全部文件 File 列表（不限类型）。
 * 承载形态与 extractClipboardImages 相同（items 优先，files 兜底），
 * 用于 text / picture / drag 等文件上传场景（如粘贴资源管理器复制的附件）。
 * @param {ClipboardEvent} event
 * @returns {File[]}
 */
export const extractClipboardFiles = (event) => {
  const cd =
    event?.clipboardData || event?.originalEvent?.clipboardData || null;
  if (!cd) return [];
  const files = [];
  if (cd.items && typeof cd.items.length === "number") {
    for (const item of cd.items) {
      if (!item || item.kind !== "file") continue;
      if (typeof item.getAsFile === "function") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
  }
  if (files.length === 0 && cd.files && typeof cd.files.length === "number") {
    for (const f of cd.files) if (f) files.push(f);
  }
  return files;
};

/**
 * 从上传成功响应中解析文件描述符 { name, url }。
 * 优先级：resolveResponse(response, file) 函数 > responseKey 路径
 *         > response.url > response 本身为字符串。
 * @param {UploadUserFile} file 成功文件（含 response / name / url）
 * @param {Object} opts
 * @param {string} [opts.responseKey='data.url'] lodash get 路径
 * @param {Function} [opts.resolveResponse] 自定义解析 (response, file) => {name,url} | string
 */
export const resolveFileDescriptor = (
  file,
  { responseKey = "data.url", resolveResponse } = {},
) => {
  if (!file) return { name: "", url: "" };
  const resp = file.response;
  if (typeof resolveResponse === "function") {
    const custom = resolveResponse(resp, file);
    if (custom && typeof custom === "object") {
      if (custom.url) return { name: custom.name || file.name, url: custom.url };
    } else if (typeof custom === "string" && custom) {
      return { name: file.name, url: custom };
    }
  }
  let url;
  if (resp != null) {
    url =
      (responseKey ? get(resp, responseKey) : undefined) ??
      (resp.url || undefined) ??
      (typeof resp === "string" ? resp : undefined);
  }
  return { name: file.name, url: url || file.url || "" };
};

/**
 * 将内部 fileList 序列化为对外 v-model 值。
 * 仅保留 success 项；valueFormat='url' 时返回 URL 字符串数组，
 * 否则返回 { name, url } 对象数组。
 * @param {Array<UploadUserFile>} fileList
 * @param {Object} opts responseKey / resolveResponse / valueFormat
 */
export const serializeValue = (fileList, opts = {}) => {
  const list = (fileList || []).filter((f) => f && f.status === "success");
  return list.map((f) => {
    const desc = resolveFileDescriptor(f, opts);
    return opts.valueFormat === "url" ? desc.url : desc;
  });
};

/**
 * 值签名（JSON），用于父子数据双向同步时的幂等比较，避免回环。
 * 统一以 URL 层级比较：'u' 与 { name, url: 'u' } 视为相同值。
 */
export const valueSignature = (value) =>
  JSON.stringify(
    (Array.isArray(value) ? value : []).map((it) =>
      typeof it === "string" ? it : it?.url,
    ),
  );

/**
 * 尺寸值归一化：数字 → px；字符串原样（如 '100%'、'220px'）；空值 → ''。
 */
export const toCssSize = (v) => {
  if (v == null || v === "") return "";
  if (typeof v === "number") return Number.isFinite(v) ? `${v}px` : "";
  return String(v);
};

/**
 * 人类可读文件大小（用于超出限制等提示）。
 */
export const formatSize = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

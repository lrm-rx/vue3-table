/**
 * UploadPro 纯函数工具集（与渲染解耦，便于单测）。
 *
 * 数据模型：
 *  - v-model 值为「已上传成功」的文件描述符数组，支持两种元素形态：
 *      ① 字符串：'https://x.com/a.png'（按 URL 末段推导文件名）
 *      ② 对象：  { name: 'a.png', url: 'https://...' }
 *  - 对象形态的业务字段（id 等）全程保真：归一化时挂在 file.__rawItem 上并
 *    平铺到 file 本身（remove/preview 等事件可取 file.id），序列化时以原对象
 *    为基底仅覆盖 name/url，回写不丢字段
 *  - 组件内部统一归一化为 UploadUserFile（el-upload fileList 项）：
 *      { name, url, status: 'success', uid?, response?, raw?, __rawItem? }
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
        ...item, // 业务字段平铺到 file 上：remove / preview 等事件可直接取 file.id
        name: item.name || nameFromUrl(item.url, `file-${i + 1}`),
        url: item.url,
        status: "success",
        ...(item.response !== undefined ? { response: item.response } : null),
        // 序列化时的保真基底：serializeValue 以其为底仅覆盖 name/url
        __rawItem: item,
      };
    })
    .filter(Boolean);

/**
 * 文件名不安全字符：URL 结构符（# ? % & + =）+ 文件系统保留字符 + 控制字符。
 * 服务端若以原文件名拼接访问 URL 且不做编码，这些字符会导致资源无法加载
 * （如 a#b.png 的 `#` 之后被浏览器当作 fragment 截断）。
 */
const UNSAFE_FILENAME_RE = /[#?%&+=/\\:*"<>|\x00-\x1f]/g;

/**
 * 提取文件名中的不安全字符（按出现顺序去重）。
 * @param {string} name
 * @returns {string[]} 空数组表示文件名安全
 */
export const findUnsafeFileNameChars = (name) => {
  if (typeof name !== "string" || !name) return [];
  return [...new Set(name.match(UNSAFE_FILENAME_RE) || [])];
};

/**
 * 从粘贴事件中提取 File 列表。
 * 同时覆盖 clipboardData.items（网页复制图片/文件常见承载形式）与
 * clipboardData.files（截图工具 / 资源管理器粘贴文件，items 无文件时兜底）。
 * @param {ClipboardEvent} event
 * @param {boolean} [onlyImages=false] 为 true 时只提取 image/*（照片墙场景）
 * @returns {File[]}
 */
export const extractClipboardFiles = (event, onlyImages = false) => {
  const cd =
    event?.clipboardData || event?.originalEvent?.clipboardData || null;
  if (!cd) return [];
  const accept = (f) =>
    f && (!onlyImages || (f.type && f.type.startsWith("image/")));
  const files = [];
  if (cd.items && typeof cd.items.length === "number") {
    for (const item of cd.items) {
      if (!item || item.kind !== "file") continue;
      if (typeof item.getAsFile === "function") {
        const f = item.getAsFile();
        if (accept(f)) files.push(f);
      }
    }
  }
  if (files.length === 0 && cd.files && typeof cd.files.length === "number") {
    for (const f of cd.files) if (accept(f)) files.push(f);
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
      // 返回对象整体透传（id 等业务字段保留），仅确保 name/url 就位
      if (custom.url) return { ...custom, name: custom.name || file.name };
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
 * 否则返回对象数组——以 file.__rawItem（外部传入的原始对象）为基底仅覆盖
 * name/url（响应解析结果优先），回填项的业务字段（id 等）全程保真；
 * 新上传项无 __rawItem，直接使用响应解析结果（含 resolveResponse 透传字段）。
 * @param {Array<UploadUserFile>} fileList
 * @param {Object} opts responseKey / resolveResponse / valueFormat
 */
export const serializeValue = (fileList, opts = {}) => {
  const list = (fileList || []).filter((f) => f && f.status === "success");
  return list.map((f) => {
    const desc = resolveFileDescriptor(f, opts);
    if (opts.valueFormat === "url") return desc.url;
    const raw = f.__rawItem && typeof f.__rawItem === "object" ? f.__rawItem : null;
    return raw ? { ...raw, ...desc } : desc;
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

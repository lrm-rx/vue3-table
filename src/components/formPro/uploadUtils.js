/**
 * UploadPro 纯函数工具集（与渲染解耦，便于单测）。
 *
 * 数据模型：
 *  - v-model 值为文件描述符数组（含 ready/uploading/fail 等无 url 项），
 *    支持两种元素形态：
 *      ① 字符串：'https://x.com/a.png'（按 URL 末段推导文件名）
 *      ② 对象：  { name: 'a.png', url: 'https://...' }；字段名可经 fieldMap
 *                映射（如 { name: 'fileName', url: 'fileUrl' }）
 *  - 对象形态的业务字段（id 等）全程保真：归一化时挂在 file.__rawItem 上并
 *    平铺到 file 本身（remove/preview 等事件可取 file.id），序列化时以原对象
 *    为基底仅覆盖映射的 name/url 字段，回写不丢字段
 *  - 组件内部统一归一化为 UploadUserFile（el-upload fileList 项）：
 *      { name, url, status（沿用原值，缺省 'success'）, uid?, response?, raw?, __rawItem? }
 */
import { get } from "lodash-es";

/**
 * 字段映射归一化：v-model 对象元素 / 接口返回的字段名不一定是 name/url
 * （可能是 fileName/fileUrl 等），统一补齐默认映射。
 * @param {Object} [m] 用户传入的 fieldMap（{ name, url }）
 */
export const normalizeFieldMap = (m) => ({
  name: "name",
  url: "url",
  ...(m || {}),
});

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
 * 将外部 v-model 值归一化为 el-upload fileList。
 * 不修改入参；无 url 的项同样保留展示（status 沿用原值，缺省 'success'）；
 * 仅 null / 空字符串项被丢弃。字段名按 fieldMap 读取（默认 name/url）。
 * @param {Array} value
 * @param {Object} [fieldMap] { name, url }
 * @returns {Array<UploadUserFile>}
 */
export const normalizeIncoming = (value, fieldMap) => {
  const map = normalizeFieldMap(fieldMap);
  return (Array.isArray(value) ? value : [])
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
      const url = item[map.url] ?? item.url ?? "";
      return {
        ...item, // 业务字段平铺到 file 上：remove / preview 等事件可直接取 file.id
        name: item[map.name] || item.name || nameFromUrl(url, `file-${i + 1}`),
        url,
        status: item.status || "success",
        ...(item.response !== undefined ? { response: item.response } : null),
        // 序列化时的保真基底：serializeValue 以其为底仅覆盖映射字段
        __rawItem: item,
      };
    })
    .filter(Boolean);
};

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
 * 文件名除 resolveResponse 返回外，优先取响应 data 中映射的 name 字段，
 * 缺失时回退 file.name。
 * @param {UploadUserFile} file 成功文件（含 response / name / url）
 * @param {Object} opts
 * @param {string} [opts.responseKey='data.url'] lodash get 路径
 * @param {Function} [opts.resolveResponse] 自定义解析 (response, file) => {name,url} | string
 * @param {Object} [opts.fieldMap] 字段映射 { name, url }
 */
export const resolveFileDescriptor = (
  file,
  { responseKey = "data.url", resolveResponse, fieldMap } = {},
) => {
  if (!file) return { name: "", url: "" };
  const map = normalizeFieldMap(fieldMap);
  const resp = file.response;
  // 无响应（ready / uploading / fail / 回填项）时跳过自定义解析，直接走兜底
  if (typeof resolveResponse === "function" && resp != null) {
    const custom = resolveResponse(resp, file);
    if (custom && typeof custom === "object") {
      // 返回对象整体透传（id 等业务字段保留），仅确保 name/url 就位
      if (custom.url) return { ...custom, name: custom.name || file.name };
    } else if (typeof custom === "string" && custom) {
      return { name: file.name, url: custom };
    }
  }
  let url;
  let respName;
  if (resp != null) {
    url =
      (responseKey ? get(resp, responseKey) : undefined) ??
      (resp.url || undefined) ??
      (typeof resp === "string" ? resp : undefined);
    respName = get(resp, ["data", map.name]);
  }
  return { name: respName || file.name, url: url || file.url || "" };
};

/**
 * 将内部 fileList 序列化为对外 v-model 值。
 * 全量保真：不丢弃任何字段——以内部 file 对象全量平铺为基底（含回填对象的
 * 全部业务字段、uid / status / percentage / raw / response / size 等
 * el-upload 内部字段），再叠加响应解析透传字段（resolveResponse 返回值），
 * 最后按 fieldMap 覆盖映射的 name/url 字段（响应解析结果优先）；
 * 内部标记 __rawItem 与映射冲突时的字面 name/url 键不出现在输出中。
 * valueFormat='url' 时返回 URL 字符串数组（无 url 项为空串）。
 * 不再过滤非 success 项：uploading / fail / 无 url 项同样进入绑定值——
 * 延迟上传场景可在「确认」时从绑定值筛出带 raw 的项手动上传。
 * @param {Array<UploadUserFile>} fileList
 * @param {Object} opts responseKey / resolveResponse / valueFormat / fieldMap
 */
export const serializeValue = (fileList, opts = {}) => {
  const map = normalizeFieldMap(opts.fieldMap);
  return (fileList || [])
    .filter((f) => f)
    .map((f) => {
      const desc = resolveFileDescriptor(f, opts);
      if (opts.valueFormat === "url") return desc.url;
      // 内部标记不对外；file 全量平铺（业务字段在归一化时已平铺到 file 上）
      const { __rawItem: _drop, ...rest } = f;
      // desc 的 name/url 只按映射字段写入；resolveResponse 透传字段照常保留
      const { name: _n, url: _u, ...restDesc } = desc;
      const out = {
        ...rest,
        ...restDesc,
        [map.name]: desc.name,
        [map.url]: desc.url,
      };
      // 自定义映射时不额外产生字面 name/url 键
      if (map.name !== "name") delete out.name;
      if (map.url !== "url") delete out.url;
      return out;
    });
};

/**
 * 值签名（JSON），用于父子数据双向同步时的幂等比较，避免回环。
 * 统一以 URL 层级比较（按 fieldMap 提取）：'u' 与 { url: 'u' } 视为相同值；
 * 无 url 项归一为空串参与比较。
 */
export const valueSignature = (value, fieldMap) => {
  const map = normalizeFieldMap(fieldMap);
  return JSON.stringify(
    (Array.isArray(value) ? value : []).map((it) =>
      typeof it === "string" ? it : (it?.[map.url] ?? it?.url ?? ""),
    ),
  );
};

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

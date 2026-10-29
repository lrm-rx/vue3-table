<script setup lang="jsx">
/**
 * FormPro + UploadPro 上传能力演示：
 *  1. 照片墙：复制粘贴上传 + 内置 el-image 全屏大图预览（无 el-dialog）
 *  2. 非图片文件：文件列表眼睛图标 → preview 事件（文件预览组件预留触发点）；
 *     按钮尺寸 buttonSize 按 el-button size 设置；按钮右侧粘贴入口可粘贴任意文件
 *  3. 同一表单配置多个上传项（照片墙 / 单图 / 附件 / 缩略图 / 拖拽）
 *  4. 拖拽上传区域自定义宽高（dragWidth / dragHeight）
 *  5. 禁用态优先级：表单级 disabled 开关；item 配置 disabled=false 可覆盖表单级禁用
 *  6. 眼睛图标显隐（showPreviewIcon）与文件名点击下载（download 事件，外部接管下载行为）
 *  7. fieldMap 字段映射：接口返回 fileName/fileUrl 等非 name/url 字段名时按映射读写；
 *     无 url 项（上传中/失败/待补传）正常展示并保留在绑定值中
 *  8. FormPro 实例 API：通过 formRef.value.xxx('字段 prop') 调用上传实例方法
 *     （getRawFiles / getRemovedFiles / clearFiles / getUpload / submit / handleStart …），
 *     多上传项按字段区分；manualFiles 演示 autoUpload=false 延迟上传 + 手动 submit
 *  9. toFormData：formRef.value.toFormData() 把当前表单（含待上传文件）转 FormData，
 *     File/Blob 以二进制 append（不会变成 "[object File]"）；可切换 arrayFormat
 *     观察 attachments / attachments[] 键格式差异
 *
 * 演示用 httpRequest 为本地模拟（进度 + blob: URL）；真实项目改为
 * itemRender.props.action = '/api/upload' 或传入自己的 httpRequest 即可。
 */
import { ref } from "vue";
import { ElMessage } from "element-plus";
import FormPro from "@/components/formPro/index.vue";

// —— 构造本地 SVG data URI 作为「编辑回填」的初始图片（无需网络）——
const svgImage = (bg, text) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">` +
      `<rect width="100%" height="100%" fill="${bg}"/>` +
      `<text x="50%" y="50%" fill="#fff" font-size="20" text-anchor="middle" dy=".35em">${text}</text>` +
      `</svg>`,
  )}`;

/**
 * 模拟上传：180ms 推进一次进度，完成后用 blob: URL 作为服务端返回地址。
 * 返回 Promise resolve 值会作为 el-upload 的 response，
 * UploadPro 默认按 responseKey='data.url' 提取图片地址。
 */
const mockHttpRequest = (option) =>
  new Promise((resolve) => {
    let percent = 0;
    const timer = setInterval(() => {
      percent += 20;
      option.onProgress?.({ percent });
      if (percent >= 100) {
        clearInterval(timer);
        resolve({
          code: 200,
          message: "success",
          data: {
            url: URL.createObjectURL(option.file),
            name: option.file.name,
          },
        });
      }
    }, 180);
  });

// 模拟「非标字段名」接口：返回 fileId / fileName / fileUrl，配合 fieldMap + responseKey 演示
const mockHttpRequestMapped = (option) =>
  new Promise((resolve) =>
    setTimeout(
      () =>
        resolve({
          code: 200,
          data: {
            fileId: `srv-${Date.now() % 100000}`,
            fileName: option.file.name,
            fileUrl: URL.createObjectURL(option.file),
          },
        }),
      500,
    ),
  );

// 非图片文件「眼睛」预览事件：当前仅演示触发机制，后续在此挂载文件预览组件
const onFilePreview = (payload) => {
  const { name, url, index } = payload || {};
  ElMessage.info(
    `【preview 事件 · 预留挂载点】第 ${index + 1} 个文件：${name}（${url || "暂无地址"}）`,
  );
  // 后续接入示例：
  // previewFileRef.value?.open({ name, url })
  console.log("[UploadPro preview]", payload);
};

// 文件名点击下载：UploadPro 只抛 download 事件，下载行为由外部接管（此处演示 a[download] 实现）
const onFileDownload = (payload) => {
  const { name, url } = payload || {};
  ElMessage.success(`【download 事件】下载文件：${name}`);
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = name || "";
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
};

const formData = ref({
  // 照片墙：初始回填 2 张
  photos: [
    { name: "示例图片-蓝.svg", url: svgImage("#409eff", "Photo 1") },
    { name: "示例图片-绿.svg", url: svgImage("#67c23a", "Photo 2") },
  ],
  // 单图证件照：1 张
  idPhoto: [{ name: "证件照.svg", url: svgImage("#e6a23c", "ID Photo") }],
  // 附件：非图片文件（id 为业务字段，删除/回写全程保真）
  attachments: [
    {
      id: 1001,
      name: "项目说明书-v1.pdf",
      url: "https://example.com/files/project-v1.pdf",
    },
  ],
  // 缩略图列表
  thumbs: [{ name: "缩略图.svg", url: svgImage("#909399", "Thumb") }],
  // 拖拽上传
  dragImages: [],
  dragFiles: [],
  // 禁用态优先级演示
  sealFile: [
    {
      name: "盖章合同.pdf",
      url: "https://example.com/files/contract-sealed.pdf",
    },
  ],
  // 眼睛图标显隐演示
  noEyeFile: [
    { name: "年报汇总.xlsx", url: "https://example.com/files/annual.xlsx" },
  ],
  // fieldMap 演示：接口字段为 fileId/fileName/fileUrl
  mappedFiles: [
    {
      fileId: "f-1001",
      fileName: "接口合同.pdf",
      fileUrl: "https://example.com/files/contract.pdf",
    },
  ],
  // 无 url 项演示：待补传文件（无 url 也正常展示并保留在绑定值中）
  pendingFiles: [{ name: "线下材料-待补传.zip" }],
  // 延迟上传演示：autoUpload=false，选完文件后由 formRef.submit('manualFiles') 手动提交
  manualFiles: [],
  // tip 配置演示：字符串单条提示
  singleTipFiles: [],
  // tip 配置演示：数组多条提示 + tipClass / tipStyle
  multiTipFiles: [],
});

// 表单级禁用开关（演示 item disabled 与 el-form disabled 的优先级）
const formDisabled = ref(false);

// 校验规则
const rules = {
  photos: [
    { required: true, message: "请至少上传一张现场照片", trigger: "change" },
  ],
  idPhoto: [{ required: true, message: "请上传证件照", trigger: "change" }],
  attachments: [{ required: true, message: "请上传附件", trigger: "change" }],
};

const items = ref([
  {
    group: true,
    title: "图片上传（照片墙 / 粘贴 / 内置预览）",
    allToggle: false,
  },
  {
    prop: "photos",
    label: "现场照片",
    span: 24,
    required: true,
    tip: "点击 + 选图，或点击卡片内「点击此处粘贴图片」聚焦后 Ctrl+V 粘贴截图；点击图片可大图预览、左右切换",
    itemRender: {
      name: "UploadPro",
      props: {
        listType: "picture-card",
        multiple: true,
        limit: 8,
        accept: "image/*",
        maxSizeMb: 5,
        autoUpload: true,
        httpRequest: mockHttpRequest,
      },
      events: { preview: onFilePreview },
    },
  },
  {
    prop: "idPhoto",
    label: "证件照",
    span: 12,
    required: true,
    tip: "limit=1 单图上传；粘贴区与现场照片相互独立",
    itemRender: {
      name: "UploadPro",
      props: {
        listType: "picture-card",
        limit: 1,
        accept: "image/*",
        maxSizeMb: 5,
        autoUpload: true,
        httpRequest: mockHttpRequest,
      },
    },
  },

  {
    group: true,
    title: "文件上传（眼睛图标 = preview 事件预留）",
  },
  {
    prop: "attachments",
    label: "附件材料",
    span: 24,
    required: true,
    tip: "buttonSize=small 控制按钮尺寸；按钮右侧粘贴入口点击聚焦后 Ctrl+V 可粘贴任意文件；眼睛图标触发 preview 事件，文件名点击触发下载",
    itemRender: {
      name: "UploadPro",
      props: {
        listType: "text",
        multiple: true,
        limit: 10,
        accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt",
        maxSizeMb: 20,
        buttonSize: "small",
        autoUpload: true,
        httpRequest: mockHttpRequest,
      },
      events: { preview: onFilePreview, download: onFileDownload },
    },
  },
  {
    prop: "thumbs",
    label: "图片缩略列表",
    span: 24,
    tip: "list-type=picture：图片点击走内置预览；混入非图片时眼睛图标走 preview 事件",
    itemRender: {
      name: "UploadPro",
      props: {
        listType: "picture",
        multiple: true,
        accept: "image/*",
        autoUpload: true,
        httpRequest: mockHttpRequest,
      },
      events: { preview: onFilePreview, download: onFileDownload },
    },
  },

  {
    group: true,
    title: "禁用态优先级 / 眼睛图标显隐",
  },
  {
    prop: "sealFile",
    label: "始终可编辑",
    span: 12,
    tip: "item disabled=false：打开上方「表单禁用」后本项仍可上传 / 删除（item 配置优先于表单级）",
    itemRender: {
      name: "UploadPro",
      props: {
        listType: "text",
        disabled: false,
        buttonSize: "small",
        autoUpload: true,
        httpRequest: mockHttpRequest,
      },
      events: { preview: onFilePreview, download: onFileDownload },
    },
  },
  {
    prop: "noEyeFile",
    label: "隐藏眼睛图标",
    span: 12,
    tip: "showPreviewIcon=false：不显示眼睛图标；文件名点击仍触发 download 事件下载",
    itemRender: {
      name: "UploadPro",
      props: {
        listType: "text",
        showPreviewIcon: false,
        buttonSize: "small",
        autoUpload: true,
        httpRequest: mockHttpRequest,
      },
      events: { preview: onFilePreview, download: onFileDownload },
    },
  },

  {
    group: true,
    title: "字段映射 / 无 url 项",
  },
  {
    prop: "mappedFiles",
    label: "接口字段映射",
    span: 12,
    tip: "fieldMap={ name:'fileName', url:'fileUrl' } + responseKey='data.fileUrl'：回填/展示/回写全走映射键，fileId 保真；下方实时数据可见",
    itemRender: {
      name: "UploadPro",
      props: {
        listType: "text",
        multiple: true,
        buttonSize: "small",
        fieldMap: { name: "fileName", url: "fileUrl" },
        responseKey: "data.fileUrl",
        autoUpload: true,
        httpRequest: mockHttpRequestMapped,
      },
      events: { preview: onFilePreview, download: onFileDownload },
    },
  },
  {
    prop: "pendingFiles",
    label: "无 url 项",
    span: 12,
    tip: "初始值含无 url 的「待补传」文件：正常展示且保留在绑定值中；上传中/失败的文件同样实时进入绑定值",
    itemRender: {
      name: "UploadPro",
      props: {
        listType: "text",
        multiple: true,
        buttonSize: "small",
        autoUpload: true,
        httpRequest: mockHttpRequest,
      },
      events: { preview: onFilePreview, download: onFileDownload },
    },
  },

  {
    group: true,
    title: "拖拽上传（区域宽高可自定义）",
  },
  {
    prop: "dragImages",
    label: "拖拽图片",
    span: 24,
    tip: "dragWidth=100% / dragHeight=220：拖拽区宽高完全自定义",
    itemRender: {
      name: "UploadPro",
      props: {
        drag: true,
        listType: "text",
        multiple: true,
        accept: "image/*",
        dragWidth: "100%",
        dragHeight: 220,
        dragText: "将图片拖到此处，或<em>点击选择</em>",
        autoUpload: true,
        httpRequest: mockHttpRequest,
      },
      events: {
        preview: onFilePreview,
        download: onFileDownload,
        success: (_resp, file) =>
          console.log("[dragImages] 上传成功：", file.name),
      },
    },
  },
  {
    prop: "dragFiles",
    label: "拖拽文件",
    span: 24,
    tip: "数字宽高：dragWidth=480 / dragHeight=160（按 px）",
    itemRender: {
      name: "UploadPro",
      props: {
        drag: true,
        listType: "text",
        multiple: true,
        dragWidth: 480,
        dragHeight: 160,
        buttonText: "选择文件",
        autoUpload: true,
        httpRequest: mockHttpRequest,
      },
      events: { preview: onFilePreview, download: onFileDownload },
    },
  },

  {
    group: true,
    title: "实例方法（FormPro 按字段调用 / 延迟上传）",
  },
  {
    prop: "manualFiles",
    label: "延迟上传",
    span: 24,
    tip: "autoUpload=false：选文件后先入队（列表显示待上传态），点击上方「submit('manualFiles')」才真正上传；也可用 handleStart('manualFiles', file) 编程式追加",
    itemRender: {
      name: "UploadPro",
      props: {
        listType: "text",
        multiple: true,
        buttonSize: "small",
        // 默认即 false，这里显式写出便于演示「先入队、后手动提交」
        autoUpload: false,
        httpRequest: mockHttpRequest,
      },
      events: { preview: onFilePreview, download: onFileDownload },
    },
  },

  {
    group: true,
    title: "tip 提示配置（字符串单条 / 数组多行 / tipClass / tipStyle）",
  },
  {
    prop: "singleTipFiles",
    label: "字符串单条提示",
    span: 12,
    itemRender: {
      name: "UploadPro",
      props: {
        listType: "text",
        multiple: true,
        buttonSize: "small",
        // 字符串：一条提示
        tip: "单个文件不超过 10MB",
        autoUpload: true,
        httpRequest: mockHttpRequest,
      },
      events: { preview: onFilePreview, download: onFileDownload },
    },
  },
  {
    prop: "multiTipFiles",
    label: "数组多条提示",
    span: 12,
    itemRender: {
      name: "UploadPro",
      props: {
        listType: "text",
        multiple: true,
        limit: 5,
        buttonSize: "small",
        // 数组（长度 > 1）：多条提示，逐行块元素换行显示；
        // tipStyle / tipClass 作用于 tip 最外层根元素
        tip: [
          "支持 pdf / doc / xlsx / zip 等常见格式",
          "单个文件不超过 10MB，最多上传 5 个",
          "涉密文件请先脱敏后再上传",
        ],
        tipStyle: { marginTop: "8px", fontSize: "13px", lineHeight: "20px" },
        tipClass: "demo-upload-tip",
        autoUpload: true,
        httpRequest: mockHttpRequest,
      },
      events: { preview: onFilePreview, download: onFileDownload },
    },
  },
]);

const formRef = ref();
const onSubmit = async () => {
  try {
    await formRef.value?.validate();
    const data = formRef.value?.getSubmitData?.() ?? formData.value;
    ElMessage.success(
      `校验通过：照片 ${data.photos?.length || 0} 张，附件 ${data.attachments?.length || 0} 个`,
    );
  } catch {
    ElMessage.error("校验未通过，请检查必填上传项");
  }
};
const onReset = () => {
  formRef.value?.resetFields();
  ElMessage.info("已重置");
};

// —— FormPro 暴露的上传实例方法演示（首参为字段 prop，多上传项按字段区分）——
// 对应 UploadPro defineExpose 的实例方法代理，均在 formRef 上直接调用
const demoGetRawFiles = () => {
  const raws = formRef.value?.getRawFiles?.("attachments") || [];
  ElMessage.info(
    `getRawFiles('attachments') → ${raws.length} 项带原始 File${
      raws.length ? `：${raws.map((f) => f.name).join("、")}` : ""
    }`,
  );
};
const demoGetRemovedFiles = () => {
  const removed = formRef.value?.getRemovedFiles?.("attachments") || [];
  ElMessage.info(
    `getRemovedFiles('attachments') → 累计移除 ${removed.length} 项（含 id 等业务字段，可直接用于服务端删除）`,
  );
};
const demoClearFiles = () => {
  formRef.value?.clearFiles?.("attachments");
  ElMessage.success("clearFiles('attachments') → 已清空附件列表");
};
const demoGetUpload = () => {
  const inst = formRef.value?.getUpload?.("attachments");
  ElMessage.info(
    inst
      ? "getUpload('attachments') → 已取到 UploadPro 实例，可直接访问其 uploadRef / 全部实例方法"
      : "getUpload('attachments') → 未取到实例（字段可能被隐藏或折叠）",
  );
};
const demoSubmit = () => {
  const count = formRef.value?.getRawFiles?.("manualFiles")?.length || 0;
  if (!count) {
    ElMessage.warning('manualFiles 暂无排队文件：请先在「延迟上传」中选文件');
    return;
  }
  formRef.value?.submit?.("manualFiles");
  ElMessage.success(`submit('manualFiles') → 已提交 ${count} 个排队文件`);
};
const demoHandleStart = () => {
  // 编程式入队：构造 File 后走 el-upload 的 handleStart，完整复用校验 / 进度 / 回填链路
  const file = new File(["UploadPro 示例内容"], `编程式添加-${Date.now()}.txt`, {
    type: "text/plain",
  });
  formRef.value?.handleStart?.("manualFiles", file);
  ElMessage.success("handleStart('manualFiles', file) → 已入队，点上方 submit 上传");
};

// —— toFormData 演示：对象 → FormData，文件以二进制 append ——
const formDataPreview = ref([]);
const demoToFormData = (options) => {
  // 不传 source 时默认取 getSubmitData()（已过滤隐藏字段）
  const fd = formRef.value?.toFormData?.(undefined, options);
  if (!fd) {
    ElMessage.warning("toFormData 不可用");
    return;
  }
  formDataPreview.value = Array.from(fd.entries()).map(([key, value]) => ({
    key,
    // 关键：文件条目拿到的是 File/Blob 实例，而不是 "[object File]" / "{}" 字符串
    text:
      value instanceof File
        ? `File(name=${value.name}, size=${value.size}B, type=${value.type || "unknown"})`
        : String(value),
  }));
  ElMessage.success(
    `toFormData() → ${formDataPreview.value.length} 个条目；文件按二进制 append（未字符串化）`,
  );
};
</script>

<template>
  <div style="max-width: 1080px; padding: 16px">
    <div
      style="margin-bottom: 12px; display: flex; gap: 12px; align-items: center"
    >
      <el-button type="primary" @click="onSubmit">提交校验</el-button>
      <el-button @click="onReset">重置</el-button>
      <el-switch
        v-model="formDisabled"
        active-text="表单禁用"
        inactive-text="表单启用"
        inline-prompt
      />
      <el-tag type="info" effect="plain">
        粘贴：点照片墙「点击此处粘贴图片」或附件按钮右侧「点击此处粘贴文件」聚焦
        → Ctrl+V；多个上传项各自独立
      </el-tag>
    </div>

    <!-- 实例方法示例：均在 formRef.value 上调用，首个参数为字段 prop，多上传项按字段区分 -->
    <div
      style="
        margin-bottom: 12px;
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      "
    >
      <el-tag type="info" effect="plain">
        实例 API：formRef.value.xxx('字段 prop')
      </el-tag>
      <el-button size="small" @click="demoGetRawFiles">
        getRawFiles('attachments')
      </el-button>
      <el-button size="small" @click="demoGetRemovedFiles">
        getRemovedFiles('attachments')
      </el-button>
      <el-button size="small" @click="demoClearFiles">
        clearFiles('attachments')
      </el-button>
      <el-button size="small" @click="demoGetUpload">
        getUpload('attachments')
      </el-button>
      <el-button size="small" @click="demoHandleStart">
        handleStart('manualFiles', file)
      </el-button>
      <el-button type="primary" plain size="small" @click="demoSubmit">
        submit('manualFiles')
      </el-button>
    </div>

    <!-- toFormData 示例：默认取提交数据；第二个示例切换数组键格式（repeat / bracket） -->
    <div
      style="
        margin-bottom: 12px;
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      "
    >
      <el-tag type="info" effect="plain">
        对象 → FormData：formRef.value.toFormData(source?, options?)
      </el-tag>
      <el-button size="small" @click="demoToFormData()">
        toFormData()
      </el-button>
      <el-button
        size="small"
        @click="demoToFormData({ arrayFormat: 'bracket' })"
      >
        toFormData(…, { arrayFormat: 'bracket' })
      </el-button>
    </div>

    <FormPro
      ref="formRef"
      v-model="formData"
      :items="items"
      :span="24"
      :title-colon="true"
      :rules="rules"
      :disabled="formDisabled"
      label-width="110px"
    />

    <el-divider>实时数据（v-model）</el-divider>
    <pre
      style="
        background: #f5f7fa;
        padding: 12px;
        border-radius: 4px;
        max-height: 300px;
        overflow: auto;
      "
      >{{ JSON.stringify(formData, null, 2) }}</pre>

    <el-divider>FormData 条目（toFormData）</el-divider>
    <div
      v-if="!formDataPreview.length"
      style="color: #909399; font-size: 13px"
    >
      点击上方 toFormData() 查看当前表单的转换结果；先选 / 粘贴几个文件即可看到
      File 条目（二进制，不会被字符串化）
    </div>
    <pre
      v-else
      style="
        background: #f5f7fa;
        padding: 12px;
        border-radius: 4px;
        max-height: 300px;
        overflow: auto;
      "
      >{{ formDataPreview.map((row) => `${row.key} = ${row.text}`).join("\n") }}</pre>
  </div>
</template>

<style lang="scss" scoped>
// tipClass 示例：作用于 tip 最外层根元素（与 el-upload__tip 类并存）
:deep(.demo-upload-tip) {
  color: #e6a23c;
  padding-left: 8px;
  border-left: 3px solid #e6a23c;
}
</style>

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
    { id: 1001, name: "项目说明书-v1.pdf", url: "https://example.com/files/project-v1.pdf" },
  ],
  // 缩略图列表
  thumbs: [{ name: "缩略图.svg", url: svgImage("#909399", "Thumb") }],
  // 拖拽上传
  dragImages: [],
  dragFiles: [],
  // 禁用态优先级演示
  sealFile: [
    { name: "盖章合同.pdf", url: "https://example.com/files/contract-sealed.pdf" },
  ],
  // 眼睛图标显隐演示
  noEyeFile: [
    { name: "年报汇总.xlsx", url: "https://example.com/files/annual.xlsx" },
  ],
});

// 表单级禁用开关（演示 item disabled 与 el-form disabled 的优先级）
const formDisabled = ref(false);

// 校验规则
const rules = {
  photos: [{ required: true, message: "请至少上传一张现场照片", trigger: "change" }],
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
        dragText: '将图片拖到此处，或<em>点击选择</em>',
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
</script>

<template>
  <div style="max-width: 1080px; padding: 16px">
    <div style="margin-bottom: 12px; display: flex; gap: 12px; align-items: center">
      <el-button type="primary" @click="onSubmit">提交校验</el-button>
      <el-button @click="onReset">重置</el-button>
      <el-switch
        v-model="formDisabled"
        active-text="表单禁用"
        inactive-text="表单启用"
        inline-prompt
      />
      <el-tag type="info" effect="plain">
        粘贴：点照片墙「点击此处粘贴图片」或附件按钮右侧「点击此处粘贴文件」聚焦 → Ctrl+V；多个上传项各自独立
      </el-tag>
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
    <pre style="background: #f5f7fa; padding: 12px; border-radius: 4px; max-height: 300px; overflow: auto">{{
      JSON.stringify(formData, null, 2)
    }}</pre>
  </div>
</template>

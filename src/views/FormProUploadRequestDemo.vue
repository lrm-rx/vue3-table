<script setup>
/**
 * FormPro + UploadPro 自定义上传示例：
 *  1. autoUpload=true，选择、拖拽或粘贴文件后立即上传
 *  2. httpRequest 中自行组装 FormData，并追加 data 中的业务参数
 *  3. 接口默认返回 { code: 200, data: { name, url } }，由 responseKey 提取文件地址
 */
import { ref } from "vue";
import FormPro from "@/components/formPro/index.vue";

const formModel = ref({
  attachments: [],
});

/**
 * 实际上传接口。
 * 不要手动设置 Content-Type，浏览器会自动生成 multipart/form-data 边界。
 */
const uploadApi = async (formData) => {
  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
    headers: {
      Authorization: "Bearer your-token",
    },
  });

  if (!response.ok) {
    throw new Error(`上传失败：HTTP ${response.status}`);
  }

  return response.json();
};

/**
 * UploadPro / el-upload 自定义上传方法。
 * option.file     当前原始 File 对象
 * option.filename 文件字段名，默认 file，可通过 name 属性修改
 * option.data     itemRender.props.data 传入的额外参数
 */
const httpRequest = async (option) => {
  const formData = new FormData();

  formData.append(option.filename || "file", option.file);

  Object.entries(option.data || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  });

  // 返回 Promise，成功结果会进入 UploadPro 的响应解析流程
  return uploadApi(formData);
};

const items = [
  {
    prop: "attachments",
    label: "业务附件",
    span: 24,
    tip: "文件及 bizType、bizId、source 参数将通过 multipart/form-data 提交",
    itemRender: {
      name: "UploadPro",
      props: {
        autoUpload: true,
        httpRequest,
        data: {
          bizType: "contract",
          bizId: 1001,
          source: "form-pro",
        },
        name: "file",
        listType: "text",
        multiple: true,
        limit: 5,
        accept: ".pdf,.png,.jpg,.jpeg",
        maxSizeMb: 10,
        responseKey: "data.url",
        valueFormat: "file",
        showErrorMessage: true,
      },
      events: {
        success: (response, file) => {
          console.log("上传成功", response, file);
        },
        error: (error, file) => {
          console.error("上传失败", error, file);
        },
      },
    },
  },
];
</script>

<template>
  <FormPro
    v-model="formModel"
    :items="items"
    :columns="1"
    label-width="90px"
  />
</template>

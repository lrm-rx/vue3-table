import { createRouter, createWebHistory } from "vue-router";
import BasicLayout from "@/layouts/BasicLayout.vue";

const routes = [
  {
    path: "/",
    component: BasicLayout,
    redirect: "/comment",
    children: [
      {
        path: "comment",
        name: "Comment",
        component: () => import("@/views/CommentDemo.vue"),
        meta: { title: "评论区演示（MockJS）", icon: "ChatDotRound" },
      },
      {
        path: "comment-simple",
        name: "CommentSimple",
        component: () => import("@/views/CommentSimpleDemo.vue"),
        meta: { title: "简化版评论区（仅远程）", icon: "ChatLineSquare" },
      },
      {
        path: "table",
        name: "Table",
        component: () => import("@/views/TableDemo.vue"),
        meta: { title: "表格组件演示", icon: "Grid" },
      },
      {
        path: "table-fixed",
        name: "TableFixed",
        component: () => import("@/views/TableFixedColumnDemo.vue"),
        meta: { title: "表格固定列修复验证", icon: "Grid" },
      },
      {
        path: "table-insert-selection",
        name: "TableInsertSelection",
        component: () => import("@/views/TableInsertSelectionDemo.vue"),
        meta: { title: "表格临时行选中", icon: "Grid" },
      },
      {
        path: "table-custom-sort",
        name: "TableCustomSort",
        component: () => import("@/views/TableCustomSortDemo.vue"),
        meta: { title: "列个性化拖拽排序", icon: "Sort" },
      },
      {
        path: "md",
        name: "MdEditor",
        component: () => import("@/views/MdEditorDemo.vue"),
        meta: { title: "Markdown 编辑器", icon: "EditPen" },
      },
      {
        path: "form",
        name: "FormPro",
        component: () => import("@/views/FormProDemo.vue"),
        meta: { title: "配置式表单 FormPro", icon: "Document" },
      },
      {
        path: "form-border",
        name: "FormProBorder",
        component: () => import("@/views/FormProBorderDemo.vue"),
        meta: { title: "FormPro 边框表格样式", icon: "Document" },
      },
      {
        path: "form-compact",
        name: "FormProCompact",
        component: () => import("@/views/FormProCompactDemo.vue"),
        meta: { title: "FormPro 紧凑型表单", icon: "Document" },
      },
      {
        path: "form-upload",
        name: "FormProUpload",
        component: () => import("@/views/FormProUploadDemo.vue"),
        meta: { title: "FormPro 上传集成", icon: "Upload" },
      },
      {
        path: "form-linkage",
        name: "FormProLinkage",
        component: () => import("@/views/FormProLinkageDemo.vue"),
        meta: { title: "FormPro 联动交互", icon: "Connection" },
      },
      {
        path: "float-ball",
        name: "FloatBall",
        component: () => import("@/views/FloatBallDemo.vue"),
        meta: { title: "灵动悬浮球 FloatBall", icon: "Aim" },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;

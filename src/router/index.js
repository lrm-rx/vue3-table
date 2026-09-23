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
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;

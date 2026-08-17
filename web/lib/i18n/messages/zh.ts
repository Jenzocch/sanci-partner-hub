/**
 * 简体中文 — 面向中国大陆用户,必须一看就懂。
 *
 * 硬性要求(owner 指定):用大陆本地说法,不是"繁体转简体"。
 * 保存/搜索/账号/设置/默认/界面/文件/数据 —— 不用 儲存/搜尋/帳號 等台港用词。
 * 术语一律照 GLOSSARY.md,不要临时造同义词。
 *
 * 类型是从 id.ts 推导出来的:少一个键或拼错 = 编译报错,不会在用户界面上
 * 露出原文。
 */

import type { Messages } from "./id";

export const zh: Messages = {
  common: {
    appName: "SANCI 合作商平台",
    // 按钮与操作
    save: "保存",
    cancel: "取消",
    edit: "修改",
    add: "新增",
    search: "搜索",
    back: "返回",
    close: "关闭",
    retry: "重试",
    activate: "启用",
    deactivate: "停用",
    saving: "保存中…",
    loading: "加载中…",
    // 通用状态
    statusActive: "启用",
    statusInactive: "停用",
    statusDraft: "草稿",
    statusSuspended: "已暂停",
    // 页面状态
    emptyDefault: "暂无数据。",
    errorLoad: "数据加载失败,请刷新页面重试。",
    errorSection: "此部分加载失败 —— 请刷新页面。",
    required: "必填",
    optional: "选填",
    yes: "是",
    no: "否",
    // 核心术语(见 GLOSSARY.md)
    partner: "合作商",
    branch: "分店",
    staff: "员工",
    account: "账号",
    customer: "客户",
    order: "订单",
    orderNumber: "订单编号",
    package: "套装",
    product: "产品",
    catalog: "产品目录",
    activity: "操作记录",
    reason: "原因",
    notes: "备注",
    phone: "电话",
    whatsapp: "WhatsApp",
    address: "地址",
    city: "城市",
    province: "省份",
    name: "名称",
    fullName: "姓名",
    code: "编号",
    createdAt: "创建时间",
    serverTime: "服务器时间",
    language: "语言",
  },
};

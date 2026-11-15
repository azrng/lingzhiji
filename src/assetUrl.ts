// public/ 目录资产统一前缀：Vite 只重写打包引用（index.html、import 进来的资产），
// 运行时字符串路径（JSX src、JS 拼接的 url()）需自行带上 BASE_URL，
// 否则子路径部署（GitLab Pages /lingzhiji/）下全部 404。
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`

import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("health", "routes/health.ts"),
  route("robots.txt", "routes/robots.ts"),

  // Viewer
  route("r/:token", "routes/viewer.tsx"),
  route("api/viewer/page/:pageIndex", "routes/api.viewer.page.ts"),
  route("api/viewer/events", "routes/api.viewer.events.ts"),
  route("api/viewer/reveal", "routes/api.viewer.reveal.ts"),

  // Admin
  route("admin/login", "routes/admin.login.tsx"),
  route("admin/logout", "routes/admin.logout.ts"),
  route("admin", "routes/admin-layout.tsx", [
    index("routes/admin.dashboard.tsx"),
    route("resumes", "routes/admin.resumes.tsx"),
    route("resumes/:resumeId", "routes/admin.resume-detail.tsx"),
    route("links", "routes/admin.links.tsx"),
    route("links/:linkId", "routes/admin.link-detail.tsx"),
  ]),
  route("api/admin/resumes/:resumeId/page/:pageIndex", "routes/api.admin.page.ts"),
] satisfies RouteConfig;

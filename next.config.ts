import type { NextConfig } from "next";

const REPORT_FONTS = ["./node_modules/@fontsource/public-sans/files/*-latin-*-normal.woff", "./node_modules/@fontsource/noto-sans-lao/files/*-lao-*-normal.woff"];

const nextConfig: NextConfig = {
  // Dev only: lets phones on the local network (http://<this PC's Wi-Fi IP>:3001) load the
  // dev scripts. Without it the page arrives but never becomes interactive.
  allowedDevOrigins: ["192.168.*.*"],
  experimental: {
    serverActions: {
      // Help-request videos are uploaded one per request, up to 30 MB each (lib/upload-limits.ts);
      // other forms carry at most a few 5 MB images. Leave room for the multipart overhead.
      bodySizeLimit: "32mb",
    },
    // proxy.ts runs on every page, and Next buffers request bodies through it — only 10 MB by
    // default, which would silently cut larger uploads short. Keep it in step with the limit above.
    proxyClientMaxBodySize: "32mb",
  },
  // pdfkit reads its own font metrics from disk and exceljs is large; load both with plain Node require.
  serverExternalPackages: ["pdfkit", "exceljs"],
  // The PDF export reads these font files at runtime; make sure deployments include them.
  outputFileTracingIncludes: {
    "/clan/reports/export": REPORT_FONTS,
    "/admin/reports/export": REPORT_FONTS,
  },
};

export default nextConfig;

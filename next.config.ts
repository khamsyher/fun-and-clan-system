import type { NextConfig } from "next";

const REPORT_FONTS = ["./node_modules/@fontsource/public-sans/files/*-latin-*-normal.woff", "./node_modules/@fontsource/noto-sans-lao/files/*-lao-*-normal.woff"];

const nextConfig: NextConfig = {
  // Dev only: lets phones on the local network (http://<this PC's Wi-Fi IP>:3001) load the
  // dev scripts. Without it the page arrives but never becomes interactive.
  allowedDevOrigins: ["192.168.*.*"],
  experimental: {
    serverActions: {
      // Each file is up to 5 MB (lib/upload-limits.ts) and a donation request can carry two
      // (photo + QR), so allow both plus the form fields and multipart overhead.
      bodySizeLimit: "12mb",
    },
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

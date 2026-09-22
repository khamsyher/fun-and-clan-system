import type { NextConfig } from "next";

const REPORT_FONTS = ["./node_modules/@fontsource/public-sans/files/*-latin-*-normal.woff", "./node_modules/@fontsource/noto-sans-lao/files/*-lao-*-normal.woff"];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Meeting minutes (and later transfer slips) are up to 5 MB; leave room for multipart overhead.
      bodySizeLimit: "6mb",
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

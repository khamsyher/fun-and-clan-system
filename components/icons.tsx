import type { SVGProps } from "react";

// One stroke family: 24px grid, 1.6 stroke, round caps.
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const PhoneIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="6.5" y="2.75" width="11" height="18.5" rx="2.5" />
    <path d="M10.5 18h3" />
  </Icon>
);

export const LockIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="4.75" y="10.5" width="14.5" height="10" rx="2" />
    <path d="M8 10.5V7.75a4 4 0 0 1 8 0v2.75" />
  </Icon>
);

export const EyeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2.75 12S6.25 5.5 12 5.5 21.25 12 21.25 12 17.75 18.5 12 18.5 2.75 12 2.75 12Z" />
    <circle cx="12" cy="12" r="2.75" />
  </Icon>
);

export const EyeOffIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M9.9 5.8A9.8 9.8 0 0 1 12 5.5c5.75 0 9.25 6.5 9.25 6.5a17 17 0 0 1-2.6 3.4M6.3 7.6C4 9.3 2.75 12 2.75 12S6.25 18.5 12 18.5a9 9 0 0 0 4.3-1.1" />
    <path d="M3.5 3.5l17 17" />
  </Icon>
);

export const UsersIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="9" cy="8.5" r="3.25" />
    <path d="M3.25 19.25c.6-3 2.9-4.75 5.75-4.75s5.15 1.75 5.75 4.75" />
    <path d="M15.5 5.6a3.25 3.25 0 0 1 0 5.8M17.25 14.8c1.75.6 3 2.1 3.5 4.45" />
  </Icon>
);

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3.75 10.5 12 3.75l8.25 6.75" />
    <path d="M5.75 9v11.25h12.5V9" />
    <path d="M10 20.25v-5.5h4v5.5" />
  </Icon>
);

export const ShieldIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 3 4.75 5.75v5.5c0 4.6 3 8.3 7.25 9.75 4.25-1.45 7.25-5.15 7.25-9.75v-5.5L12 3Z" />
    <path d="m9 12 2.1 2.1L15.25 10" />
  </Icon>
);

export const LogoutIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M14 4.75H6.75a2 2 0 0 0-2 2v10.5a2 2 0 0 0 2 2H14" />
    <path d="M10.5 12h9.25M16.75 8.75 20 12l-3.25 3.25" />
  </Icon>
);

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const XIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </Icon>
);

export const AlertIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.75" />
    <path d="M12 7.75v5M12 16.25v.01" />
  </Icon>
);

export const ClockIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.75" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const ArrowRightIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4.75 12h14.5M13.75 6.5 19.25 12l-5.5 5.5" />
  </Icon>
);

export const UploadIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 15.5V4.25M7.5 8.5 12 4l4.5 4.5" />
    <path d="M4.75 14.5v3.25a2 2 0 0 0 2 2h10.5a2 2 0 0 0 2-2V14.5" />
  </Icon>
);

export const FileIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M13.5 3.25H7a2 2 0 0 0-2 2v13.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10L13.5 3.25Z" />
    <path d="M13.5 3.25v5.5h5.5M8.75 13h6.5M8.75 16.5h4" />
  </Icon>
);

export const KeyIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="8" cy="15.5" r="3.75" />
    <path d="m10.75 12.75 8.5-8.5M16.25 7.25l2.5 2.5M14 9.5l2 2" />
  </Icon>
);

export const GlobeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.75" />
    <path d="M3.25 12h17.5M12 3.25c2.3 2.4 3.5 5.3 3.5 8.75s-1.2 6.35-3.5 8.75c-2.3-2.4-3.5-5.3-3.5-8.75S9.7 5.65 12 3.25Z" />
  </Icon>
);

export const PercentIcon =(p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M18.5 5.5l-13 13" />
    <circle cx="7" cy="7" r="2.25" />
    <circle cx="17" cy="17" r="2.25" />
  </Icon>
);

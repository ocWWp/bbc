import type { SVGProps } from "react";

const base = (props: SVGProps<SVGSVGElement>) => ({
  className: "btn-icon",
  viewBox: "0 0 16 16",
  fill: "none",
  ...props,
});

export const ArrowIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const GithubIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base({ ...props, fill: "currentColor" })}>
    <path d="M8 0a8 8 0 00-2.5 15.6c.4 0 .5-.2.5-.4v-1.5c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.3 2 .9 2.4.7.1-.6.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.1 0-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8.6-.2 1.3-.3 2-.3.7 0 1.4.1 2 .3 1.5-1 2.2-.8 2.2-.8.4 1.1.1 1.9.1 2.1.5.5.8 1.2.8 2.1 0 3-1.8 3.7-3.6 3.9.3.2.5.7.5 1.4v2.1c0 .2.1.5.6.4A8 8 0 008 0z" />
  </svg>
);

export const CloudflareIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M11.5 10c.8-.3 1-1 1-1.5 0-1-.8-1.8-2-1.8h-.3C9.7 5.4 8.4 4.5 7 4.5c-1.2 0-2.3.7-2.8 1.8-2 .2-3.2 1.8-3.2 3.4 0 .2 0 .4.1.6 0 .1.1.2.3.2h9.8c.2 0 .3 0 .3-.2v-.3z" fill="currentColor" />
  </svg>
);

export const CopyIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" {...props}>
    <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" />
    <path d="M10 5V3.5A1.5 1.5 0 008.5 2h-5A1.5 1.5 0 002 3.5v5A1.5 1.5 0 003.5 10H5" stroke="currentColor" />
  </svg>
);

export const CheckIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" {...props}>
    <path d="M2.5 6.5l2.5 2.5 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ExtIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" {...props}>
    <path d="M4 3h5v5M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

import type { SupertagKey } from "./data";

const tagIconBase = (props: SVGProps<SVGSVGElement>) => ({
  viewBox: "0 0 12 12",
  fill: "none",
  ...props,
});

const ICONS: Record<SupertagKey, (p: SVGProps<SVGSVGElement>) => React.ReactElement> = {
  voice: (p) => (
    <svg {...tagIconBase(p)}>
      <rect x="5" y="1.5" width="2" height="6" rx="1" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2.5 6c0 2 1.6 3.5 3.5 3.5S9.5 8 9.5 6M6 9.5v1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  ),
  decision: (p) => (
    <svg {...tagIconBase(p)}>
      <path d="M6 2v8M3 5l3-3 3 3M3 8h6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  vendor: (p) => (
    <svg {...tagIconBase(p)}>
      <path d="M2 6h8M2 6l2-2M2 6l2 2M10 6L8 4M10 6L8 8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  team: (p) => (
    <svg {...tagIconBase(p)}>
      <circle cx="4" cy="4.5" r="1.6" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="8.5" cy="5" r="1.2" stroke="currentColor" strokeWidth="1.1" />
      <path d="M1.5 10c0-1.4 1.1-2.4 2.5-2.4S6.5 8.6 6.5 10M7 10c0-1.1.9-2 2-2s2 .9 2 2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  ),
  product: (p) => (
    <svg {...tagIconBase(p)}>
      <path d="M6 1.5l4 2v5l-4 2-4-2v-5l4-2z M6 6l4-2.5M6 6v4.5M6 6L2 3.5" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  ),
  glossary: (p) => (
    <svg {...tagIconBase(p)}>
      <path d="M2 2.5h3.5c.8 0 1.5.7 1.5 1.5v6.5C7 9.7 6.3 9 5.5 9H2v-6.5zM10 2.5H6.5c-.8 0-1.5.7-1.5 1.5v6.5C5 9.7 5.7 9 6.5 9H10v-6.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  ),
  skill: (p) => (
    <svg {...tagIconBase(p)}>
      <path d="M2.5 9.5L8 4M7 3l2 2M6 4l2 2M9 6l1.5 1.5-1 1L8 7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  source_artifact: (p) => (
    <svg {...tagIconBase(p)}>
      <path d="M3 1.5h4l3 3v6H3v-9z M7 1.5V4.5H10" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M4.5 6.5h3M4.5 8h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  ),
  note: (p) => (
    <svg {...tagIconBase(p)}>
      <path d="M6 1.5v4.5M4 4l2-2.5L8 4M3.5 10.5l2.5-2 2.5 2v-4h-5v4z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  ),
};

export function TagIcon({ name, ...rest }: { name: SupertagKey } & SVGProps<SVGSVGElement>) {
  const Icon = ICONS[name];
  return Icon ? <Icon {...rest} /> : null;
}

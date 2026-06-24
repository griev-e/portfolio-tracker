/** Hand-drawn minimal line icons — 20×20 viewBox, stroke inherits currentColor. */

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconOverview = () => (
  <svg {...base}>
    <circle cx="10" cy="10" r="7.2" />
    <path d="M10 10 L10 4.6" />
    <path d="M10 10 L13.8 12.4" />
    <circle cx="10" cy="10" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconRisk = () => (
  <svg {...base}>
    <path d="M10 2.8 L17 6.4 V11 C17 14.6 14 16.8 10 17.8 C6 16.8 3 14.6 3 11 V6.4 Z" />
    <path d="M7 10.4 L9.2 12.4 L13.4 7.6" />
  </svg>
);

export const IconResearch = () => (
  <svg {...base}>
    <circle cx="8.6" cy="8.6" r="5.4" />
    <path d="M12.6 12.6 L17 17" />
    <path d="M6.4 8.6 L8 10 L10.8 6.8" />
  </svg>
);

export const IconQuality = () => (
  <svg {...base}>
    <path d="M10 2.6 L12.1 7.1 L17 7.7 L13.4 11 L14.4 15.8 L10 13.4 L5.6 15.8 L6.6 11 L3 7.7 L7.9 7.1 Z" />
  </svg>
);

export const IconBenchmark = () => (
  <svg {...base}>
    <path d="M3 16.5 L8 10.5 L11.4 13.2 L17 5.6" />
    <path d="M13.6 5.4 L17 5.4 L17 8.8" />
    <path d="M3 4 V16.8" strokeDasharray="1.5 2.6" opacity="0.55" />
  </svg>
);

export const IconScenario = () => (
  <svg {...base}>
    <path d="M3.5 10 C5.5 6 8 4.4 10 4.4 C12 4.4 14.5 6 16.5 10" />
    <path d="M3.5 10 C5.5 14 8 15.6 10 15.6 C12 15.6 14.5 14 16.5 10" opacity="0.5" strokeDasharray="2 2.4" />
    <circle cx="16.5" cy="10" r="1.6" />
    <circle cx="3.5" cy="10" r="1.6" />
  </svg>
);

export const IconMatrix = () => (
  <svg {...base}>
    <rect x="3" y="3" width="6" height="6" rx="1.4" />
    <rect x="11" y="11" width="6" height="6" rx="1.4" />
    <rect x="11" y="3" width="6" height="6" rx="1.4" opacity="0.45" />
    <rect x="3" y="11" width="6" height="6" rx="1.4" opacity="0.45" />
  </svg>
);

export const IconMonteCarlo = () => (
  <svg {...base}>
    <path d="M3 15.5 C6 15.5 7 12.5 10 9.5 C13 6.5 14 5 17 4.2" />
    <path d="M3 15.5 C6 15 8 11 10 11.5 C12.6 12.2 14 8.5 17 9" opacity="0.55" />
    <path d="M3 15.5 C7 16 9 14.5 11 14.8 C13.6 15.2 15 12.5 17 13.5" opacity="0.3" />
  </svg>
);

export const IconDividend = () => (
  <svg {...base}>
    <circle cx="8" cy="8" r="5.2" />
    <path d="M11.5 4.9 C14.4 5.6 16.6 8.2 16.6 11.4 C16.6 15.1 13.6 18.1 9.9 18.1 C7.5 18.1 5.4 16.8 4.2 14.9" opacity="0.5" />
    <path d="M8 5.6 V10.4 M6.3 9 L8 10.6 L9.7 9" />
  </svg>
);

export const IconMarket = () => (
  <svg {...base}>
    <circle cx="10" cy="10" r="7.4" opacity="0.5" />
    <path d="M3.4 10 H6.6 L8.4 6 L11.6 14 L13.4 10 H16.6" />
  </svg>
);

export const IconIntelligence = () => (
  <svg {...base}>
    <circle cx="10" cy="10" r="2.2" />
    <path d="M10 3 V5.6" />
    <path d="M10 14.4 V17" />
    <path d="M3 10 H5.6" />
    <path d="M14.4 10 H17" />
    <path d="M5.05 5.05 L6.9 6.9" opacity="0.55" />
    <path d="M13.1 13.1 L14.95 14.95" opacity="0.55" />
    <path d="M14.95 5.05 L13.1 6.9" opacity="0.55" />
    <path d="M6.9 13.1 L5.05 14.95" opacity="0.55" />
  </svg>
);

export const IconImport = () => (
  <svg {...base}>
    <path d="M10 3.5 V12.2" />
    <path d="M6.6 9 L10 12.4 L13.4 9" />
    <path d="M4 13.6 V15.4 C4 16 4.5 16.5 5.1 16.5 H14.9 C15.5 16.5 16 16 16 15.4 V13.6" />
  </svg>
);

export const IconOptimizer = () => (
  <svg {...base}>
    <path d="M3 16.5 V3.5" opacity="0.55" />
    <path d="M3 16.5 H16.8" opacity="0.55" />
    {/* efficient-frontier arc rising into an optimum */}
    <path d="M3.6 15.4 C7 11 9.5 7.6 15.6 5.4" />
    <circle cx="13" cy="6.2" r="1.7" fill="currentColor" stroke="none" />
  </svg>
);

export const IconRebalance = () => (
  <svg {...base}>
    <path d="M3 6.6 H17" />
    <circle cx="7" cy="6.6" r="1.9" />
    <path d="M3 13.4 H17" />
    <circle cx="13" cy="13.4" r="1.9" />
  </svg>
);

export const IconDiscover = () => (
  <svg {...base}>
    <circle cx="10" cy="10" r="7.2" />
    <path d="M12.9 7.1 L11.1 11.1 L7.1 12.9 L8.9 8.9 Z" />
    <circle cx="10" cy="10" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

export const IconPatchNotes = () => (
  <svg {...base}>
    <path d="M5 3.4 H13.4 L16 6 V16.6 H5 Z" />
    <path d="M13.4 3.4 V6 H16" opacity="0.55" />
    <path d="M7.2 9.6 H13.4" />
    <path d="M7.2 12.4 H11.4" />
  </svg>
);

export const IconReport = () => (
  <svg {...base}>
    <path d="M5 2.8 H12.4 L15.6 6 V17.2 H5 Z" />
    <path d="M12.4 2.8 V6 H15.6" opacity="0.55" />
    <path d="M10.3 9 V13.6" />
    <path d="M8.4 11.7 L10.3 13.6 L12.2 11.7" />
  </svg>
);



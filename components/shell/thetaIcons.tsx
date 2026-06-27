/** theta nav icons — same hand-drawn minimal line set as the alpha icons:
    20×20 viewBox, stroke inherits currentColor. */

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

export const IconDashboard = () => (
  <svg {...base}>
    <rect x="3" y="3" width="6" height="8" rx="1.4" />
    <rect x="3" y="13" width="6" height="4" rx="1.4" opacity="0.5" />
    <rect x="11" y="3" width="6" height="4" rx="1.4" opacity="0.5" />
    <rect x="11" y="9" width="6" height="8" rx="1.4" />
  </svg>
);

export const IconAccounts = () => (
  <svg {...base}>
    <rect x="2.6" y="5" width="14.8" height="10.4" rx="2" />
    <path d="M2.6 8.4 H17.4" />
    <path d="M13.6 12 H15" />
  </svg>
);

export const IconTransactions = () => (
  <svg {...base}>
    <path d="M4 7 H15" />
    <path d="M12.4 4.4 L15 7 L12.4 9.6" />
    <path d="M16 13 H5" />
    <path d="M7.6 10.4 L5 13 L7.6 15.6" />
  </svg>
);

export const IconCashFlow = () => (
  <svg {...base}>
    <path d="M3 16.5 V3.5" opacity="0.55" />
    <path d="M3 16.5 H16.8" opacity="0.55" />
    <rect x="5.4" y="11" width="2.6" height="4" rx="0.6" />
    <rect x="9.2" y="7.6" width="2.6" height="7.4" rx="0.6" />
    <rect x="13" y="9.4" width="2.6" height="5.6" rx="0.6" opacity="0.6" />
  </svg>
);

export const IconBudgets = () => (
  <svg {...base}>
    <circle cx="10" cy="10" r="7.2" />
    <path d="M10 10 L10 2.8" />
    <path d="M10 10 L15.9 13.6" />
  </svg>
);

export const IconGoals = () => (
  <svg {...base}>
    <circle cx="10" cy="10" r="7" />
    <circle cx="10" cy="10" r="3.6" opacity="0.6" />
    <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconRecurring = () => (
  <svg {...base}>
    <path d="M16.6 8.2 A 6.8 6.8 0 1 0 16.9 11.4" />
    <path d="M16.9 3.8 V8.2 H12.5" />
    <path d="M10 6.6 V10.2 L12.4 11.6" />
  </svg>
);

export const IconNetWorth = () => (
  <svg {...base}>
    <path d="M3 16.5 V3.5" opacity="0.55" />
    <path d="M3 16.5 H16.8" opacity="0.55" />
    <path d="M4 13.6 L8 9.4 L11 11.6 L16.4 5.4" />
    <path d="M13 5.2 L16.4 5.2 L16.4 8.6" />
  </svg>
);

export const IconSettings = () => (
  <svg {...base}>
    <circle cx="10" cy="10" r="2.4" />
    <path d="M10 2.6 V4.4 M10 15.6 V17.4 M2.6 10 H4.4 M15.6 10 H17.4 M4.7 4.7 L6 6 M14 14 L15.3 15.3 M15.3 4.7 L14 6 M6 14 L4.7 15.3" opacity="0.7" />
  </svg>
);

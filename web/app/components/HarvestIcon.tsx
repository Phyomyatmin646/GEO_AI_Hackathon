type HarvestIconName =
  | "alert"
  | "calendar"
  | "cells"
  | "chevron"
  | "download"
  | "globe"
  | "info"
  | "lightbulb"
  | "pin"
  | "regions"
  | "sprout"
  | "sun";

type Props = {
  name: HarvestIconName;
  size?: number;
  strokeWidth?: number;
};

export function HarvestIcon({ name, size = 20, strokeWidth = 1.8 }: Props) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth,
  };

  return (
    <svg
      aria-hidden="true"
      className="harvest-icon"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...common}
    >
      {name === "alert" && (
        <>
          <path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </>
      )}
      {name === "calendar" && (
        <>
          <rect height="17" rx="2" width="18" x="3" y="4" />
          <path d="M16 2v4M8 2v4M3 9h18" />
        </>
      )}
      {name === "cells" && (
        <>
          <rect height="7" rx="2" width="7" x="3" y="3" />
          <rect height="7" rx="2" width="7" x="14" y="3" />
          <rect height="7" rx="2" width="7" x="3" y="14" />
          <rect height="7" rx="2" width="7" x="14" y="14" />
        </>
      )}
      {name === "chevron" && <path d="m8 10 4 4 4-4" />}
      {name === "download" && (
        <>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </>
      )}
      {name === "globe" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </>
      )}
      {name === "info" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7h.01" />
        </>
      )}
      {name === "lightbulb" && (
        <>
          <path d="M9 18h6M10 22h4" />
          <path d="M8.4 14.5A7 7 0 1 1 15.6 14.5c-.9.7-1.2 1.6-1.2 2.5H9.6c0-.9-.3-1.8-1.2-2.5Z" />
        </>
      )}
      {name === "pin" && (
        <>
          <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.5" />
        </>
      )}
      {name === "regions" && (
        <>
          <path d="M12 21s7-4.4 7-11a7 7 0 1 0-14 0c0 6.6 7 11 7 11Z" />
          <path d="M9.4 10.3 11 12l3.8-4" />
        </>
      )}
      {name === "sprout" && (
        <>
          <path d="M12 22V10" />
          <path d="M12 14c-5 0-8-2.5-8-7 5 0 8 2.5 8 7Z" />
          <path d="M12 10c0-5 2.7-8 8-8 0 5-2.7 8-8 8Z" />
          <path d="M5 22h14" />
        </>
      )}
      {name === "sun" && (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      )}
    </svg>
  );
}

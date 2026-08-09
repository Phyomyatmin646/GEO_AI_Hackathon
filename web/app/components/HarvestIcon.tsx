type HarvestIconName =
  | "alert"
  | "calendar"
  | "cells"
  | "chevron"
  | "copy"
  | "dataset"
  | "download"
  | "droplet"
  | "globe"
  | "info"
  | "lightbulb"
  | "link"
  | "layers"
  | "ph"
  | "pin"
  | "rain"
  | "regions"
  | "sprout"
  | "sun"
  | "thermometer"
  | "upload";

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
      {name === "copy" && (
        <>
          <rect height="14" rx="2" width="11" x="8" y="7" />
          <path d="M16 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3" />
        </>
      )}
      {name === "dataset" && (
        <>
          <ellipse cx="12" cy="5" rx="7" ry="3" />
          <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
          <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        </>
      )}
      {name === "download" && (
        <>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </>
      )}
      {name === "droplet" && (
        <path d="M12 2S5 9.5 5 15a7 7 0 0 0 14 0c0-5.5-7-13-7-13Z" />
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
      {name === "layers" && (
        <>
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
        </>
      )}
      {name === "link" && (
        <>
          <path d="m10 13.5 4-4" />
          <path d="M7.2 16.8 5.6 18.4a3.5 3.5 0 0 1-5-5l3.1-3.1a3.5 3.5 0 0 1 5 0" transform="translate(2)" />
          <path d="m16.8 7.2 1.6-1.6a3.5 3.5 0 0 0-5-5l-3.1 3.1a3.5 3.5 0 0 0 0 5" transform="translate(-2 2)" />
        </>
      )}
      {name === "ph" && (
        <>
          <rect height="18" rx="5" width="18" x="3" y="3" />
          <path d="M7 16V8h2.2a2.2 2.2 0 0 1 0 4.4H7M14 8v8M14 12h3.5M17.5 8v8" />
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
      {name === "rain" && (
        <>
          <path d="M6 15h11a4 4 0 0 0 .5-8A6 6 0 0 0 6.2 8.5 3.3 3.3 0 0 0 6 15Z" />
          <path d="m8 18-1 2M13 18l-1 2M18 18l-1 2" />
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
      {name === "thermometer" && (
        <>
          <path d="M14 14.8V5a3 3 0 0 0-6 0v9.8a5 5 0 1 0 6 0Z" />
          <path d="M11 6v11" />
        </>
      )}
      {name === "upload" && (
        <>
          <path d="M12 16V3" />
          <path d="m7 8 5-5 5 5" />
          <path d="M5 13v7h14v-7" />
        </>
      )}
    </svg>
  );
}

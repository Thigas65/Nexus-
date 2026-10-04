interface NexusMarkProps {
  small?: boolean;
}

export function NexusMark({ small = false }: NexusMarkProps) {
  return (
    <div className={`nexus-mark${small ? " nexus-mark--small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <path
          d="M20 3.5 34.3 11.75v16.5L20 36.5 5.7 28.25v-16.5L20 3.5Z"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M13 26V14l14 12V14"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="20" r="2.1" fill="currentColor" />
      </svg>
    </div>
  );
}

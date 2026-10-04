import type { AssistantActivityState } from "../domain/AssistantActivityState";

interface NexusCoreProps {
  state: AssistantActivityState;
}

const stateLabels: Record<AssistantActivityState, string> = {
  idle: "EM REPOUSO",
  "waiting-for-wake-word": "AGUARDANDO PALAVRA",
  listening: "OUVINDO",
  processing: "PROCESSANDO",
  speaking: "FALANDO",
  paused: "PAUSADO",
  connecting: "CONECTANDO",
  error: "INDISPONÍVEL",
};

export function NexusCore({ state }: NexusCoreProps) {
  return (
    <div
      className={`core-wrap core-wrap--${state}`}
      aria-label={`Nexus Core: ${stateLabels[state].toLowerCase()}`}
      data-state={state}
    >
      <div className="core-orbit core-orbit--outer" />
      <div className="core-orbit core-orbit--middle" />
      <div className="core-orbit core-orbit--inner" />
      <div className="core">
        <div className="core__shine" />
        <span className="core__glyph">N</span>
      </div>
      <span className="core-dot core-dot--one" />
      <span className="core-dot core-dot--two" />
    </div>
  );
}

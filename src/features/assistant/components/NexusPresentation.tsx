import { useEffect, useState } from "react";
import type { AssistantPresentation as AssistantPresentationData } from "../domain/AssistantPresentation";
import { NexusMark } from "./NexusMark";

interface NexusPresentationProps {
  data: AssistantPresentationData | null;
}

export function NexusPresentation({ data }: NexusPresentationProps) {
  const [visibleData, setVisibleData] = useState(data);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (data) {
      setVisibleData(data);
      setIsLeaving(false);
      return;
    }
    if (!visibleData) return;

    setIsLeaving(true);
    const timeout = window.setTimeout(() => {
      setVisibleData(null);
      setIsLeaving(false);
    }, 420);
    return () => window.clearTimeout(timeout);
  }, [data, visibleData]);

  if (!visibleData) return null;

  const sections = visibleData.answer
    .split(/\n+/)
    .map((section) => section.trim())
    .filter(Boolean);

  return (
    <section
      className={`nexus-presentation${isLeaving ? " nexus-presentation--leaving" : ""}`}
      aria-label="Apresentação holográfica do N.E.X.U.S."
      aria-live="polite"
    >
      <div className="nexus-presentation__projection" aria-hidden="true">
        <span className="nexus-presentation__projection-ring nexus-presentation__projection-ring--outer" />
        <span className="nexus-presentation__projection-ring nexus-presentation__projection-ring--inner" />
        <div className="nexus-presentation__projection-mark">
          <NexusMark />
        </div>
        <span className="nexus-presentation__projection-beam" />
      </div>

      <div className="nexus-presentation__panel">
        <div className="nexus-presentation__eyebrow">
          <span className="nexus-presentation__status" />
          NEXUS / APRESENTAÇÃO
        </div>
        <h2>PAINEL DE INFORMAÇÕES</h2>
        <p className="nexus-presentation__question">{visibleData.question}</p>
        <div className="nexus-presentation__sections">
          {sections.map((section, index) => (
            <article
              className="nexus-presentation__card"
              key={`${index}-${section}`}
              style={{ animationDelay: `${index * 90}ms` }}
            >
              <span className="nexus-presentation__card-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p>{section}</p>
            </article>
          ))}
        </div>
        <div className="nexus-presentation__footer">
          <span>CONTEÚDO DA RESPOSTA</span>
          <span>N.E.X.U.S. CORE</span>
        </div>
      </div>
    </section>
  );
}

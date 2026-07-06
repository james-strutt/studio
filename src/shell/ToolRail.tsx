import { useState } from "react";

/* Placeholder tool rail. Icons match the theme specimen; tool behaviour
   arrives with each editor in later phases. For now, only selection state. */
const TOOLS = [
  { id: "select", label: "Select", path: "M5 3l14 8-6 2-2 6z" },
  { id: "text", label: "Text", path: "M5 6h14M12 6v13" },
  { id: "crop", label: "Crop", path: "M7 3v14h14M3 7h14v14" },
];

export function ToolRail(): JSX.Element {
  const [active, setActive] = useState("select");
  return (
    <nav className="rail" aria-label="Tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          aria-pressed={active === t.id}
          aria-label={t.label}
          title={t.label}
          onClick={() => setActive(t.id)}
        >
          <svg viewBox="0 0 24 24">
            <path d={t.path} />
          </svg>
        </button>
      ))}
    </nav>
  );
}

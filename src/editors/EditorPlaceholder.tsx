export function EditorPlaceholder({
  name,
  tagline,
}: {
  name: string;
  tagline: string;
}): JSX.Element {
  return (
    <div className="placeholder">
      <span className="kicker">{name} editor</span>
      <span className="headline">{tagline}</span>
    </div>
  );
}

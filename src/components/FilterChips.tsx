interface FilterChipsProps<T extends string> {
  values: T[];
  selected: T[];
  labels: Record<T, string>;
  onToggle: (value: T) => void;
}

export function FilterChips<T extends string>({
  values,
  selected,
  labels,
  onToggle,
}: FilterChipsProps<T>) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => {
        const isActive = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            aria-pressed={isActive}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              isActive
                ? "border-sky-400 bg-sky-500/20 text-sky-200"
                : "border-white/10 bg-white/5 text-neutral-400 hover:bg-white/10"
            }`}
          >
            {labels[value]}
          </button>
        );
      })}
    </div>
  );
}

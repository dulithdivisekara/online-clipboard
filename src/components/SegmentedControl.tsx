import { useEffect, useRef } from "react";
import { attachSegmentedSpring } from "@lib/liquid-optics";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    return attachSegmentedSpring(el, (idx) => {
      const opt = optionsRef.current[idx];
      if (opt) onChangeRef.current(opt.value);
    });
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = (index + 1) % options.length;
      onChange(options[next].value);
      buttonRefs.current[next]?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = (index - 1 + options.length) % options.length;
      onChange(options[prev].value);
      buttonRefs.current[prev]?.focus();
    }
  };

  return (
    <div className="segmented-wrap">
      <div
        ref={containerRef}
        className="segmented liquid-glass"
        role="tablist"
        aria-label={ariaLabel}
      >
        <div
          className="seg-thumb"
          style={{ "--seg-count": options.length } as React.CSSProperties}
          aria-hidden="true"
        />
        {options.map((opt, idx) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              ref={(el) => {
                buttonRefs.current[idx] = el;
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className="seg-btn"
              onClick={() => onChange(opt.value)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

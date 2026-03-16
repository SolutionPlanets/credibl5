import { SOURCE_OPTIONS } from "@/components/onboarding/constants";
import { SelectableCard } from "@/components/onboarding/selectable-card";

type StepSourceProps = {
  source: string;
  sourceOtherText: string;
  onSourceSelect: (value: string) => void;
  onSourceOtherChange: (value: string) => void;
};

export function StepSource({
  source,
  sourceOtherText,
  onSourceSelect,
  onSourceOtherChange,
}: StepSourceProps) {
  return (
    <div>
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-reply-purple">Step 3</p>
        <h1 className="mt-2 text-3xl font-bold text-reply-navy">
          How did you first hear about Cradible5?
        </h1>
        <p className="mt-3 text-base text-reply-muted">Help us understand how you found us.</p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {SOURCE_OPTIONS.map((item) => (
          <SelectableCard
            key={item.id}
            item={item}
            isSelected={source === item.id}
            onClick={() => onSourceSelect(item.id)}
            singleSelect
          />
        ))}
      </div>

      {source === "other" && (
        <label className="mt-4 block space-y-2">
          <span className="text-sm font-semibold text-reply-navy">Tell us more</span>
          <input
            type="text"
            value={sourceOtherText}
            onChange={(event) => onSourceOtherChange(event.target.value)}
            placeholder="Add a short note"
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-reply-navy outline-none transition-colors focus:border-reply-purple"
          />
        </label>
      )}
    </div>
  );
}

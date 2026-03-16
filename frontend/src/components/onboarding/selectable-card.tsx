import { Check } from "lucide-react";

import type { SelectableItem } from "@/components/onboarding/types";
import { cn } from "@/lib/shared/utils";

type SelectableCardProps = {
  item: SelectableItem;
  isSelected: boolean;
  onClick: () => void;
  singleSelect?: boolean;
};

export function SelectableCard({
  item,
  isSelected,
  onClick,
  singleSelect = false,
}: SelectableCardProps) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-white p-4 text-left transition-all",
        isSelected
          ? "border-reply-purple bg-reply-purple/10 shadow-[0_0_0_1px_rgba(151,71,255,0.2)]"
          : "border-slate-300 hover:border-slate-400"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-reply-navy">
            <Icon className="h-4 w-4 text-reply-purple" />
            {item.title}
          </p>
          <p className="text-sm text-reply-muted">{item.description}</p>
        </div>
        {isSelected && (
          <span
            className={cn(
              "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-reply-purple text-white",
              singleSelect && "mt-0.5"
            )}
          >
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </button>
  );
}

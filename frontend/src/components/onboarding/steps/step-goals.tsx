import { GOAL_OPTIONS } from "@/components/onboarding/constants";
import { SelectableCard } from "@/components/onboarding/selectable-card";

type StepGoalsProps = {
  goals: string[];
  onGoalToggle: (id: string) => void;
};

export function StepGoals({ goals, onGoalToggle }: StepGoalsProps) {
  return (
    <div>
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-reply-purple">Step 2</p>
        <h1 className="mt-2 text-3xl font-bold text-reply-navy">What do you want to achieve?</h1>
        <p className="mt-3 text-base text-reply-muted">Select one or more goals for your workspace.</p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {GOAL_OPTIONS.map((goal) => (
          <SelectableCard
            key={goal.id}
            item={goal}
            isSelected={goals.includes(goal.id)}
            onClick={() => onGoalToggle(goal.id)}
          />
        ))}
      </div>
    </div>
  );
}

import { en } from '@/locale/en-GB';

type PhaseProgressStatusProps = {
  paused: boolean;
  done: number;
  total: number;
};

export function PhaseProgressStatus({
  paused,
  done,
  total,
}: PhaseProgressStatusProps) {
  return (
    <div className="status-rule mt-6 pt-6">
      <p className="max-w-xl text-ash">
        {paused ? en.game.paused : en.game.progress(done, total)}
      </p>
    </div>
  );
}
